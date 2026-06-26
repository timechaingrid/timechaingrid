'use client';

/**
 * walletSubstrate — load the per-wallet table for the Civ-6 empire map.
 *
 * The bundle already ships `wallets.parquet` (Graph reads it; the Grid hadn't,
 * until the wallet-empire pivot). Each row is one wallet: address, birth block,
 * lifetime sats received, tx count, miner flag. We range-read it via the same
 * self-hosted DuckDB-Wasm runtime the coin grid uses (src/data/duckdb.ts) — no
 * third-party calls. See docs/cluster-lattice-design.md.
 */
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';
import { getDuckDB } from './duckdb';

export interface WalletRow {
  address: string;
  firstSeenBlock: number;
  totalReceivedSats: bigint;
  txCount: number;
  isMiner: boolean;
}

interface Manifest {
  tipBlock: number;
  wallets?: { path: string; rows: number };
}

export interface WalletData {
  tipBlock: number;
  wallets: WalletRow[];
}

let _instance: WalletData | null = null;
let _loading: Promise<WalletData> | null = null;

async function load(): Promise<WalletData> {
  const baseUrl = process.env.NEXT_PUBLIC_DATA_BASE_URL || '/data/v0.1.0';
  const manifest: Manifest = await fetch(`${baseUrl}/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
    return r.json();
  });
  if (!manifest.wallets) {
    throw new Error('bundle has no wallets.parquet — rebuild with build_bundle.py');
  }

  const db = await getDuckDB();
  const abs = (p: string) => new URL(`${baseUrl}/${p}`, window.location.origin).href;
  await db.registerFileURL('wallets.parquet', abs(manifest.wallets.path), DuckDBDataProtocol.HTTP, false);

  const conn = await db.connect();
  const wallets: WalletRow[] = [];
  try {
    const res = await conn.query(
      `SELECT address, first_seen_block, total_received_sats, tx_count, is_miner
       FROM parquet_scan('wallets.parquet')`,
    );
    for (const r of res) {
      const row = r as unknown as Record<string, number | bigint | string | boolean>;
      wallets.push({
        address: String(row.address),
        firstSeenBlock: Number(row.first_seen_block),
        totalReceivedSats: BigInt(row.total_received_sats as bigint | number),
        txCount: Number(row.tx_count),
        isMiner: Boolean(row.is_miner),
      });
    }
  } finally {
    await conn.close();
  }
  return { tipBlock: manifest.tipBlock, wallets };
}

/** Load (once) and return the wallet table. Concurrent callers share the promise. */
export function loadWalletSubstrate(): Promise<WalletData> {
  if (_instance) return Promise.resolve(_instance);
  if (_loading) return _loading;
  _loading = load().then((d) => {
    _instance = d;
    return d;
  });
  return _loading;
}
