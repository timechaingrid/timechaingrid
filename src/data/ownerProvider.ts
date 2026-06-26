'use client';

/**
 * ownerProvider — the seam between the circular Grid renderer and ownership data
 * (docs/cluster-lattice-design.md §4). The renderer asks "who owns the coin
 * minted at block B, and what color + empire is it?" without knowing whether the
 * answer comes from today's coinbase data or a future ownership ledger.
 *
 * v1 (`MinerOwnerProvider`) — owner = the coinbase miner of the minting block
 * (the only ownership today's bundle records). Reproduces the miner territories,
 * now drawn as contiguous disc arcs with hover-to-light.
 *
 * v2 (`LedgerOwnerProvider`, later) — consumes the ownership pipeline: returns
 * the wallet that holds the cell at a given block, or SHARED (gray) when the
 * 1-BTC cell is split across wallets. Swapping the provider turns miner-empires
 * into wallet-empires with zero renderer changes.
 */
import { cumulativeCoins } from '@/lib/coinGrid';
import type { CoinSubstrate } from './coinSubstrate';

/** Palette index reserved for fractionally-shared cells (rendered gray). */
export const SHARED_EMPIRE = -1;

export interface OwnerProvider {
  /** Total whole-BTC coins (cells) at the substrate tip. */
  readonly totalCoins: number;
  /** Highest block in the substrate (scrubber upper bound). */
  readonly maxBlock: number;
  readonly kind: 'miner' | 'wallet';
  /** 0xRRGGBB to paint the cell minted at `block`. */
  colorOfBlock(block: number): number;
  /** Stable empire id for the owner of the cell minted at `block` (for
   *  hover-highlight grouping). SHARED_EMPIRE for split cells. */
  empireOfBlock(block: number): number;
}

/**
 * v1 provider — ownership === coinbase recipient (block → miner). Pure delegation
 * to the loaded CoinSubstrate; no transfers, no fractional cells (those arrive
 * with the v2 ledger provider).
 */
export class MinerOwnerProvider implements OwnerProvider {
  readonly kind = 'miner' as const;
  readonly totalCoins: number;
  readonly maxBlock: number;

  constructor(private readonly sub: CoinSubstrate) {
    this.maxBlock = sub.tipBlock;
    this.totalCoins = cumulativeCoins(sub.tipBlock);
  }

  colorOfBlock(block: number): number {
    return this.sub.minerColor(this.sub.minerIdxAt(block));
  }

  empireOfBlock(block: number): number {
    return this.sub.minerIdxAt(block);
  }
}
