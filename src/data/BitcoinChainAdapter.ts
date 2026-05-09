import type { ChainAdapter, LatticeStatus } from '@/types/lattice';
import type { WalletNode, BlockActivity } from '@/types/wallet';
import type { BitcoinBlock } from '@/types/block';
import { placeWallet } from '@/components/views/placeOnGrid';

/**
 * BitcoinChainAdapter — single point of contact between the viewer
 * and the chain-data CDN. Reads parquet snapshots and a status
 * sidecar JSON from a CDN we own (Cloudflare R2 in production,
 * `/public/` during local dev). Never makes per-block RPC calls or
 * hits centralized APIs at runtime — privacy posture is verified by
 * the CI privacy-audit step.
 *
 * Rollout:
 *   v0.1  — `getStatus()` fetches a static `status.json` (this commit)
 *   v0.2  — `getNodes()` fetches `wallets.parquet` via DuckDB-Wasm
 *   v0.2+ — `getActivity()` + `getBlock()` fetch shards by epoch
 *
 * `cdnBase` is the URL prefix for all CDN reads. Pass an empty string
 * (default) to read from the current origin (`/status.json`); pass
 * something like `https://data.timechaingrid.com` once the R2 bucket
 * is bound. Recommend wiring through `NEXT_PUBLIC_CDN_BASE` env var
 * at the call site.
 */
export class BitcoinChainAdapter implements ChainAdapter<WalletNode> {
  constructor(private readonly cdnBase: string = '') {}

  /**
   * Resolve a CDN path against the configured base. Trailing slash on
   * `cdnBase` and leading slash on `path` are both tolerated.
   */
  private url(path: string): string {
    const base = this.cdnBase.replace(/\/$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  async getStatus(): Promise<LatticeStatus> {
    try {
      const response = await fetch(this.url('/status.json'), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return { currentBlock: 0 };
      const raw = (await response.json()) as Record<string, unknown>;
      return parseStatus(raw);
    } catch {
      // Network or parse failure — return safe default. The viewer
      // keeps working from any fixture in scope; the privacy posture
      // is preserved (no fallback to a third-party API).
      return { currentBlock: 0 };
    }
  }

  /**
   * Fetch the slim wallets bundle emitted by chain-tools/vault/
   * generate-grid.mjs from sister's real-substrate. Returns wallets
   * first-seen within the vault scope (matches the FIXTURE_SUBSTRATE
   * range), with real Bitcoin addresses + real-chain role metadata.
   *
   * v0.2+: when the parquet bundle on R2 is in scope, this swaps to
   * a DuckDB-Wasm query that filters by visible viewport / tier
   * resolution — the bundle here is the same shape, just smaller.
   */
  async getNodes(): Promise<WalletNode[]> {
    try {
      const response = await fetch(this.url('/wallets-bundle.json'), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const raw = (await response.json()) as Record<string, unknown>;
      if (raw.schema !== 'wallet-bundle/v1') return [];
      const wallets = Array.isArray(raw.wallets) ? raw.wallets : [];
      return wallets.map(parseWalletRecord).filter((w): w is WalletNode => w !== null);
    } catch {
      // Network/parse failure → empty list. The Grid view's role-color
      // fallback at runtime keeps the canvas sane; this adapter is the
      // enrichment layer.
      return [];
    }
  }

  async getActivity(_height: number): Promise<BlockActivity | null> {
    // TODO v0.2+: fetch activity.parquet shard for the epoch containing this block
    return null;
  }

  async getBlock(_height: number): Promise<BitcoinBlock | null> {
    // TODO v0.2+: fetch block-metadata.parquet shard
    return null;
  }
}

/**
 * Defensive parse of one wallet-bundle record into a typed WalletNode.
 * Returns null for rows missing required fields so the consumer's
 * filter drops them cleanly. totalReceivedSats arrives as a JSON
 * string and gets coerced back to a bigint here.
 */
function parseWalletRecord(raw: unknown): WalletNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.address !== 'string') return null;
  if (typeof r.role !== 'string') return null;
  if (typeof r.firstSeenBlock !== 'number') return null;
  let totalReceivedSats: bigint;
  try {
    totalReceivedSats = BigInt(
      typeof r.totalReceivedSats === 'string' ? r.totalReceivedSats : '0',
    );
  } catch {
    return null;
  }
  const walletData = {
    address: r.address,
    role: r.role as WalletNode['role'],
    firstSeenBlock: r.firstSeenBlock,
    lastActiveBlock:
      typeof r.lastActiveBlock === 'number' ? r.lastActiveBlock : r.firstSeenBlock,
    totalReceivedSats,
    txCount: typeof r.txCount === 'number' ? r.txCount : 0,
    isMiner: Boolean(r.isMiner),
  };
  // LatticeNode ergonomics: id = address, position = djb2-hashed
  // chain coordinate (Satoshi pinned at origin via placeWallet's
  // role guard).
  return {
    ...walletData,
    id: walletData.address,
    position: placeWallet(walletData),
  };
}

/**
 * Defensive parse of the status.json payload into a typed
 * `LatticeStatus`. Coerces numbers, drops anything unexpected. The
 * sidecar JSON is operator-controlled so we don't need full schema
 * validation, but we do want to survive a malformed write.
 */
function parseStatus(raw: Record<string, unknown>): LatticeStatus {
  const status: LatticeStatus = {
    currentBlock: typeof raw.currentBlock === 'number' ? raw.currentBlock : 0,
  };
  if (typeof raw.lastBlockTime === 'number') {
    status.lastBlockTime = raw.lastBlockTime;
  }
  if (typeof raw.nextBlockEtaMs === 'number') {
    status.nextBlockEtaMs = raw.nextBlockEtaMs;
  }
  return status;
}
