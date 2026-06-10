'use client';

/**
 * coinSubstrate — the lean chain-data loader the Grid's coin lattice needs.
 *
 * The Grid renders ~19.9M coins WITHOUT materialising them: a coin is a pure
 * function of its mint index (value via the subsidy schedule, coordinate via
 * the Ulam spiral — both in src/lib/{spiral,coinGrid}.ts). The ONLY chain input
 * is "who mined each block" — the coinbase recipient first-owns that block's
 * issued coins. So the entire ownership dataset is ~952k `(block → miner)` rows,
 * not 19.9M coin rows.
 *
 * Unlike Graph's R2ChainSubstrate (which builds WalletData/WalletBond objects),
 * this loads two FLAT typed arrays — the renderer indexes them `block → minerIdx
 * → color` millions of times per frame, so object-per-row would be a GC and
 * cache disaster. We also precompute one color per distinct miner at load, so
 * per-cell coloring is a single array read rather than a hash+HSL per pixel.
 *
 * Privacy: parquet is served from our own origin; DuckDB-Wasm runtime from
 * /duckdb/* (see src/data/duckdb.ts) — never a third-party CDN.
 */
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';
import { coinsMintedAtBlock, cumulativeCoins } from '@/lib/coinGrid';
import { getDuckDB } from './duckdb';

/**
 * Opt-in "Satoshi cluster" — the early single-address ("Patoshi") era grouped
 * into ONE synthetic entity. In Bitcoin's first ~2 years Satoshi mined thousands
 * of blocks (50 BTC each) using a fresh address for nearly every block, so
 * on-chain they look like ~22,000 unrelated wallets; the famous ~1.1M-BTC stash
 * is INFERRED from the Patoshi nonce pattern, not recorded on-chain. We can't
 * reproduce the exact nonce membership from this bundle, so the cluster is a
 * heuristic estimate sized to the canonical figure: 22,000 blocks × 50 BTC.
 */
export const SATOSHI_CLUSTER_KEY = '__satoshi_cluster__';
export const SATOSHI_CLUSTER_MAX_BLOCK = 21_999; // → 22,000 blocks ≈ 1.1M BTC
export const SATOSHI_CLUSTER_COLOR = 0xe0843a; // Satoshi orange
export const SATOSHI_CLUSTER_IDX = -2; // synthetic highlight sentinel (≠ -1 = none)

/** A miner's lifetime stats, surfaced by the click-to-focus inspector. */
export interface MinerStats {
  idx: number;
  address: string;
  color: number;
  blocks: number; // blocks mined (pool dominance)
  coins: number; // whole-BTC coins (= tiles) minted across those blocks
  rank: number; // 0 = the single biggest miner by block count
  isMajor: boolean; // gets a bright accent color
  isSatoshi: boolean;
  firstBlock: number;
  lastBlock: number;
}

/** Bitcoin's genesis coinbase — the Satoshi origin, rendered as the brass
 *  centerpiece tile. Its coins are unspendable but they anchor the spiral. */
const SATOSHI_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const SATOSHI_COLOR = 0xc28840; // brass-gold (matches Graph's satoshi accent)
const UNKNOWN_COLOR = 0x3a3a44; // muted grey — blocks with no addressed coinbase

interface Manifest {
  bundleVersion: string;
  tipBlock: number;
  timestamps?: { path: string; rows: number };
  blockMiners?: { path: string; rows: number };
}

/** FNV-1a over the address → a stable 32-bit hash. Used only to spread miners
 *  across the hue wheel; collisions just mean two pools share a tint. */
function hashAddr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** HSL → packed 0xRRGGBB. h in [0,360), s/l in [0,1]. */
function hslToHex(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255) & 0xff;
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

/**
 * The "empires" palette — distinct, on-brand jewel tones assigned to the TOP
 * mining pools by block count (rank 0 = the biggest empire). Hand-picked to be
 * mutually distinguishable while staying inside the cyber-steampunk gamut
 * (golds / ambers / coppers / rusts, with cyan & teal accents). The vast long
 * tail of one-off miners does NOT draw from this — they get a quiet bronze, so
 * these few colors read as meaningful territory rather than rainbow noise.
 */
const ACCENT_PALETTE: readonly number[] = [
  0xf5c542, // gold
  0x32c8e0, // cyan
  0xf2992e, // amber
  0x2faf96, // teal
  0xe07b39, // copper
  0xd1495b, // crimson
  0xe8b923, // brass-bright
  0x5fa8d3, // steel-blue
  0xd98f2b, // bronze-orange
  0x37b5a4, // turquoise
  0xc1572f, // rust
  0xf0cf57, // pale gold
  0x4bbfd6, // aqua-cyan
  0xb8801f, // dark brass
  0xe66a3c, // coral-copper
  0x6fc3b8, // mint-teal
  0xcf3f4a, // red
  0x88b0c9, // slate-cyan
  0xc9a13a, // antique gold
  0x2a9d8f, // deep teal
  0xe89b3b, // tangerine
  0xb5683a, // terracotta
  0x9ad0e0, // ice-cyan
  0xd9b44a, // honey
];

/**
 * Wealth-lens palette — the "holder filter over the minter": each minter is
 * classified by how many whole-BTC coins it minted, using the Graph's
 * whale/significant/dust semantics so the two sister views read consistently.
 * NOTE: this is wealth-by-ISSUANCE (coins minted), not current holdings —
 * transfer-tracking ownership is the v0.3 Cluster Lattice.
 */
const WEALTH_WHALE = 0xf5c542; // gold   — minted ≥ 1000 BTC
const WEALTH_SIGNIFICANT = 0x35c5e0; // cyan   — minted ≥ 100 BTC
const WEALTH_DUST = 0x57576a; // grey   — minted < 100 BTC
const WEALTH_WHALE_MIN = 1000;
const WEALTH_SIGNIFICANT_MIN = 100;

function wealthColor(coins: number): number {
  if (coins >= WEALTH_WHALE_MIN) return WEALTH_WHALE;
  if (coins >= WEALTH_SIGNIFICANT_MIN) return WEALTH_SIGNIFICANT;
  return WEALTH_DUST;
}

/**
 * Quiet aged-bronze for the long tail of small miners — low saturation, low
 * lightness, with a touch of per-address variation (so the field has texture
 * rather than reading as one dead color), kept dark enough that the bright
 * empire accents and the Satoshi core always dominate.
 */
function mutedBronze(addr: string): number {
  const h = hashAddr(addr);
  const hue = 28 + (h % 16); // 28–43°: bronze/amber band
  const sat = 0.2 + ((h >> 4) % 10) / 100; // 0.20–0.29
  const light = 0.24 + ((h >> 8) % 12) / 100; // 0.24–0.35
  return hslToHex(hue, sat, light);
}

export class CoinSubstrate {
  private _tipBlock = 0;
  /** block height → distinct-miner index (0..minerCount-1). */
  private _byBlock = new Uint32Array(0);
  /** distinct miner addresses, in first-seen order; index === minerIdx. */
  private _miners: string[] = [];
  /** minerIdx → precomputed 0xRRGGBB. */
  private _color = new Uint32Array(0);
  /** minerIdx → how many blocks that miner mined (pool dominance). */
  private _blockCount = new Uint32Array(0);
  /** minerIdx → 1 if a top-ranked "empire" pool (or Satoshi), else 0. */
  private _major = new Uint8Array(0);
  /** minerIdx → color in the WEALTH lens (whale/significant/dust by coins minted). */
  private _wealthColor = new Uint32Array(0);
  /** minerIdx → whole-BTC coins (tiles) that miner minted across its blocks. */
  private _coinsMinted = new Uint32Array(0);
  /** minerIdx → first / last block height that miner mined. */
  private _firstBlock = new Uint32Array(0);
  private _lastBlock = new Uint32Array(0);
  /** minerIdx → global rank by block count (0 = biggest). */
  private _rank = new Int32Array(0);
  /** address → minerIdx (for the click-to-focus inspector). */
  private _addrToIdx = new Map<string, number>();
  /** block height → unix seconds (0 = unknown). */
  private _blockTime: Uint32Array | null = null;
  private _satoshiIdx = -1;
  private _ready = false;

  constructor(private readonly baseUrl: string = '/data/v0.1.0') {}

  get tipBlock(): number {
    return this._tipBlock;
  }
  get minerCount(): number {
    return this._miners.length;
  }
  get ready(): boolean {
    return this._ready;
  }

  /** Distinct-miner index that mined `block`, or -1 if out of range. */
  minerIdxAt(block: number): number {
    if (block < 0 || block >= this._byBlock.length) return -1;
    return this._byBlock[block];
  }
  minerAddr(idx: number): string {
    return this._miners[idx] ?? '';
  }
  /** Precomputed pool color for a miner index (0xRRGGBB). */
  minerColor(idx: number): number {
    if (idx < 0 || idx >= this._color.length) return UNKNOWN_COLOR;
    return this._color[idx];
  }
  /** Wealth-lens color for a miner index — whale/significant/dust by coins
   *  minted (the "holder filter over the minter"). */
  minerWealthColor(idx: number): number {
    if (idx < 0 || idx >= this._wealthColor.length) return UNKNOWN_COLOR;
    return this._wealthColor[idx];
  }
  /** How many blocks this miner mined — the size of its pool empire. */
  minerBlockCount(idx: number): number {
    if (idx < 0 || idx >= this._blockCount.length) return 0;
    return this._blockCount[idx];
  }
  isSatoshi(idx: number): boolean {
    return idx === this._satoshiIdx;
  }
  /** minerIdx for an address, or -1 if unknown. */
  idxOf(address: string): number {
    return this._addrToIdx.get(address) ?? -1;
  }
  /** Is this block inside the opt-in Satoshi (Patoshi) cluster window? */
  isSatoshiClusterBlock(block: number): boolean {
    return block >= 0 && block <= SATOSHI_CLUSTER_MAX_BLOCK;
  }

  /** Synthetic stats for the Satoshi cluster as one entity (~1.1M BTC). */
  satoshiClusterStats(): MinerStats {
    const lastBlock = Math.min(SATOSHI_CLUSTER_MAX_BLOCK, this._tipBlock);
    return {
      idx: SATOSHI_CLUSTER_IDX,
      address: SATOSHI_CLUSTER_KEY,
      color: SATOSHI_CLUSTER_COLOR,
      blocks: lastBlock + 1,
      coins: cumulativeCoins(lastBlock),
      rank: 0,
      isMajor: true,
      isSatoshi: true,
      firstBlock: 0,
      lastBlock,
    };
  }

  /** Full lifetime stats for a miner by address — for the click-to-focus
   *  inspector. Returns null if the address isn't a known miner. The special
   *  SATOSHI_CLUSTER_KEY returns the synthetic cluster stats. */
  minerStats(address: string): MinerStats | null {
    if (address === SATOSHI_CLUSTER_KEY) return this.satoshiClusterStats();
    const idx = this._addrToIdx.get(address);
    if (idx === undefined) return null;
    return {
      idx,
      address,
      color: this._color[idx],
      blocks: this._blockCount[idx],
      coins: this._coinsMinted[idx],
      rank: this._rank[idx],
      isMajor: this._major[idx] === 1,
      isSatoshi: idx === this._satoshiIdx,
      firstBlock: this._firstBlock[idx],
      lastBlock: this._lastBlock[idx],
    };
  }
  /** True for the top-ranked "empire" pools (and Satoshi) — the ones that get a
   *  bright accent color; everyone else is the muted field. */
  isMajor(idx: number): boolean {
    return idx >= 0 && idx < this._major.length && this._major[idx] === 1;
  }
  blockTime(block: number): number | undefined {
    const arr = this._blockTime;
    if (!arr || block < 0 || block >= arr.length) return undefined;
    const t = arr[block];
    return t > 0 ? t : undefined;
  }

  async init(): Promise<this> {
    if (this._ready) return this;

    const manifest: Manifest = await fetch(`${this.baseUrl}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
      return r.json();
    });
    this._tipBlock = manifest.tipBlock;
    if (!manifest.blockMiners) {
      throw new Error('bundle has no blockMiners — rebuild with build_bundle.py');
    }

    const db = await getDuckDB();
    const abs = (p: string) => new URL(`${this.baseUrl}/${p}`, window.location.origin).href;
    await db.registerFileURL('block-miners.parquet', abs(manifest.blockMiners.path), DuckDBDataProtocol.HTTP, false);

    const conn = await db.connect();
    try {
      // block → miner. Build the flat block→idx array + the distinct-miner
      // table in a single pass: a Map interns each address to a dense index.
      const byBlock = new Uint32Array(this._tipBlock + 1);
      const internSeen = new Map<string, number>();
      const counts: number[] = [];
      const coins: number[] = [];
      const firstB: number[] = [];
      const lastB: number[] = [];
      const res = await conn.query(
        // ORDER BY block: ascending, so a miner's first-seen row is its min
        // block (firstBlock) and its last-written row is its max (lastBlock).
        `SELECT block, miner FROM parquet_scan('block-miners.parquet') ORDER BY block`,
      );
      for (const r of res) {
        const row = r as unknown as Record<string, number | bigint | string>;
        const block = Number(row.block);
        const addr = String(row.miner ?? '');
        let idx = internSeen.get(addr);
        if (idx === undefined) {
          idx = this._miners.length;
          internSeen.set(addr, idx);
          this._miners.push(addr);
          counts.push(0);
          coins.push(0);
          firstB.push(block);
          lastB.push(block);
        }
        if (block >= 0 && block < byBlock.length) byBlock[block] = idx;
        counts[idx]++;
        coins[idx] += coinsMintedAtBlock(block); // floored subsidy = tiles
        lastB[idx] = block;
      }
      this._byBlock = byBlock;
      this._addrToIdx = internSeen;
      this._coinsMinted = Uint32Array.from(coins);
      this._firstBlock = Uint32Array.from(firstB);
      this._lastBlock = Uint32Array.from(lastB);

      // Precompute color + block-count tables, indexed by minerIdx. Color is
      // RANK-based: the top pools by block count get a distinct empire accent;
      // everyone else gets quiet bronze. So the map reads as a few bright
      // empires over a muted field, not 197k random hues.
      const n = this._miners.length;
      this._color = new Uint32Array(n);
      this._blockCount = new Uint32Array(n);
      for (let i = 0; i < n; i++) this._blockCount[i] = counts[i];

      const order = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) => counts[b] - counts[a],
      );
      this._rank = new Int32Array(n);
      for (let r = 0; r < n; r++) this._rank[order[r]] = r;
      const rankOf = new Int32Array(n).fill(-1);
      const topCount = Math.min(ACCENT_PALETTE.length, n);
      for (let r = 0; r < topCount; r++) rankOf[order[r]] = r;
      this._satoshiIdx = internSeen.get(SATOSHI_ADDRESS) ?? -1;
      this._major = new Uint8Array(n);
      this._wealthColor = new Uint32Array(n);

      for (let i = 0; i < n; i++) {
        const addr = this._miners[i];
        // Wealth lens: classify every minter (incl. Satoshi) by coins minted.
        this._wealthColor[i] = i === this._satoshiIdx
          ? SATOSHI_COLOR
          : !addr
            ? UNKNOWN_COLOR
            : wealthColor(coins[i]);
        // Pools lens: satoshi brass, top pools accented, long tail bronze.
        if (i === this._satoshiIdx) {
          this._color[i] = SATOSHI_COLOR; // brass centerpiece
          this._major[i] = 1;
          continue;
        }
        if (!addr) {
          this._color[i] = UNKNOWN_COLOR;
          continue;
        }
        const r = rankOf[i];
        if (r >= 0) {
          this._color[i] = ACCENT_PALETTE[r];
          this._major[i] = 1;
        } else {
          this._color[i] = mutedBronze(addr);
        }
      }

      // Timestamps: block → unix seconds, height-indexed for O(1) blockTime()
      // (the scrubber spans 0..tip). Used for the "mined on <date>" tooltip.
      if (manifest.timestamps) {
        await db.registerFileURL('timestamps.parquet', abs(manifest.timestamps.path), DuckDBDataProtocol.HTTP, false);
        const tres = await conn.query(`SELECT block, t FROM parquet_scan('timestamps.parquet')`);
        const arr = new Uint32Array(this._tipBlock + 1);
        for (const r of tres) {
          const row = r as unknown as Record<string, number | bigint>;
          const b = Number(row.block);
          if (b >= 0 && b < arr.length) arr[b] = Number(row.t);
        }
        this._blockTime = arr;
      }
    } finally {
      await conn.close();
    }

    this._ready = true;
    return this;
  }
}

let _instance: CoinSubstrate | null = null;
let _loading: Promise<CoinSubstrate> | null = null;

/**
 * Load (once) and return the coin substrate. Idempotent: concurrent callers
 * share the same in-flight promise; later callers get the resolved singleton.
 * The base URL is the same-origin bundle by default; an env override lets a
 * future R2 cutover point the parquet elsewhere (the wasm already does, via
 * NEXT_PUBLIC_DUCKDB_WASM_BASE in duckdb.ts).
 */
/**
 * The loaded substrate, or null if init hasn't resolved yet. For sync consumers
 * (e.g. BlockStats reading a real block date) that render before/after the async
 * load and should gracefully fall back while it's pending.
 */
export function getLoadedCoinSubstrate(): CoinSubstrate | null {
  return _instance;
}

export function loadCoinSubstrate(): Promise<CoinSubstrate> {
  if (_instance) return Promise.resolve(_instance);
  if (_loading) return _loading;
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL || '/data/v0.1.0';
  _loading = new CoinSubstrate(base).init().then((s) => {
    _instance = s;
    return s;
  });
  return _loading;
}
