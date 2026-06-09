/**
 * coinGrid — the math that lets the Grid render ~19.9M coins without ever
 * materialising them.
 *
 * The Grid is "1 cell = 1 BTC": each block mints `floor(subsidy)` whole-BTC
 * coins (50, 25, 12, 6, 3, 1, …), laid out in mint order along the Ulam spiral
 * (`spiral.ts::spiralCoord`). A coin is therefore a pure function of its global
 * mint index `n`:  index → block (which mined it) → owner; index → (x,y).
 *
 * The renderer doesn't iterate coins — it iterates the VISIBLE viewport cells
 * and inverts: `(x,y) → n` (inverseSpiral) → `block` (blockOfCoinIndex). So the
 * per-frame cost is bounded by on-screen pixels (with an LOD stride), not by the
 * total coin count. Everything here is pure + allocation-light + O(1)/O(33).
 */
import { spiralCoord } from './spiral';

const HALVING_INTERVAL = 210_000;
const MAX_HALVINGS = 33; // subsidy hits 0 here

/** Floored whole-BTC coins minted at `block` (1 cell = 1 BTC): 50,25,12,6,3,1… */
export function coinsMintedAtBlock(block: number): number {
  if (block < 0) return 0;
  const halvings = Math.floor(block / HALVING_INTERVAL);
  if (halvings >= MAX_HALVINGS) return 0;
  return Math.floor(50 / Math.pow(2, halvings));
}

/** Total floored coins minted from genesis through `block` inclusive. O(33). */
export function cumulativeCoins(block: number): number {
  if (block < 0) return 0;
  let total = 0;
  let epochStart = 0;
  for (let halving = 0; halving < MAX_HALVINGS && epochStart <= block; halving++) {
    const per = Math.floor(50 / Math.pow(2, halving));
    if (per === 0) break;
    const epochEnd = epochStart + HALVING_INTERVAL - 1;
    const last = Math.min(block, epochEnd);
    total += per * (last - epochStart + 1);
    epochStart = epochEnd + 1;
  }
  return total;
}

/** Which block minted coin index `n` (0-based, mint order). Inverse of the
 *  cumulative count above. O(33). */
export function blockOfCoinIndex(n: number): number {
  if (n < 0) return 0;
  let acc = 0;
  let epochStart = 0;
  for (let halving = 0; halving < MAX_HALVINGS; halving++) {
    const per = Math.floor(50 / Math.pow(2, halving));
    if (per === 0) break;
    const epochCoins = per * HALVING_INTERVAL;
    if (n < acc + epochCoins) return epochStart + Math.floor((n - acc) / per);
    acc += epochCoins;
    epochStart += HALVING_INTERVAL;
  }
  return epochStart; // past all issuance
}

/** Halving epoch of a block (0,1,2,…) — drives Phase-A epoch coloring. */
export function epochOfBlock(block: number): number {
  return Math.floor(Math.max(0, block) / HALVING_INTERVAL);
}

/**
 * Inverse of `spiralCoord`: map a lattice cell (x,y) back to its mint index n
 * (the unique n with spiralCoord(n) === [x,y]). Mirrors the four-edge walk in
 * spiralCoord exactly, including the corner assignments.
 */
export function inverseSpiral(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  const k = Math.max(Math.abs(x), Math.abs(y)); // Chebyshev ring
  const innerCount = (2 * k - 1) * (2 * k - 1); // cells in rings 0..k-1
  let ringIndex: number;
  if (x === k && y >= -k + 1) {
    ringIndex = y + k - 1; // east edge (side 0)
  } else if (y === k && x <= k - 1) {
    ringIndex = 2 * k + (k - 1 - x); // north edge (side 1)
  } else if (x === -k && y <= k - 1) {
    ringIndex = 4 * k + (k - 1 - y); // west edge (side 2)
  } else {
    ringIndex = 6 * k + (x + k - 1); // south edge (side 3), y === -k
  }
  return innerCount + ringIndex;
}

/** Smallest spiral ring k whose square (2k+1)² holds at least `count` cells —
 *  i.e. the Chebyshev radius of the minted region. */
export function ringForCount(count: number): number {
  if (count <= 1) return 0;
  return Math.ceil((Math.sqrt(count) - 1) / 2);
}

/** Re-export for renderer convenience. */
export { spiralCoord };
