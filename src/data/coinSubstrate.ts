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
import { getDuckDB } from './duckdb';

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
 * Per-miner color = the miner's address hashed onto the hue wheel, at fixed
 * vivid saturation/lightness so adjacent pool "territories" read as distinct
 * bands of color across the spiral. Satoshi and unknown miners get fixed tints.
 */
function colorForMiner(addr: string): number {
  if (!addr) return UNKNOWN_COLOR;
  if (addr === SATOSHI_ADDRESS) return SATOSHI_COLOR;
  const hue = hashAddr(addr) % 360;
  return hslToHex(hue, 0.62, 0.56);
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
  /** How many blocks this miner mined — the size of its pool empire. */
  minerBlockCount(idx: number): number {
    if (idx < 0 || idx >= this._blockCount.length) return 0;
    return this._blockCount[idx];
  }
  isSatoshi(idx: number): boolean {
    return idx === this._satoshiIdx;
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
      const res = await conn.query(
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
        }
        if (block >= 0 && block < byBlock.length) byBlock[block] = idx;
        counts[idx]++;
      }
      this._byBlock = byBlock;

      // Precompute color + block-count tables, indexed by minerIdx.
      const n = this._miners.length;
      this._color = new Uint32Array(n);
      this._blockCount = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        this._color[i] = colorForMiner(this._miners[i]);
        this._blockCount[i] = counts[i];
      }
      this._satoshiIdx = internSeen.get(SATOSHI_ADDRESS) ?? -1;

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
