/**
 * walletEmpires — pack wallets into a Civ-6-style "empire" map.
 *
 * Each wallet occupies a square block of grid cells sized by its lifetime BTC
 * received: side = max(1, ⌊log₁₀(BTC)⌋), so 100 BTC → 2×2, 1,000 → 3×3,
 * 10,000 → 4×4, … A greedy bin-pack places the biggest empires first at the
 * most-central free spot (reusing discGrid's nearest-center ordering), so whales
 * cluster in the middle and smaller holders ring outward — Satoshi (the largest)
 * dead center. No overlaps; the result is a roughly circular packed territory map.
 *
 * "Holdings" here = lifetime received (the only signal today's bundle carries);
 * true current balance arrives with the ownership pipeline. See
 * docs/cluster-lattice-design.md.
 *
 * Pure + deterministic (sort is stable by size then address), so it's testable
 * without a GPU and could move to a worker for the max tier.
 */
import { generateDiscOrder } from './discGrid';

export interface WalletInput {
  address: string;
  firstSeenBlock: number;
  /** Lifetime BTC received (whole + fractional). */
  btc: number;
  txCount: number;
  isMiner: boolean;
}

export interface Empire extends WalletInput {
  /** Cells per side (square footprint). */
  side: number;
  /** Index of this wallet in the original input array (for hover lookup). */
  origIndex: number;
}

export interface Placement extends Empire {
  /** Top-left cell of the empire's square block. */
  ox: number;
  oy: number;
}

export interface PackResult {
  placements: Placement[];
  /** Bounding radius (in cells) of the packed map, for camera fit. */
  radius: number;
  /** cell key → index into placements (for hover hit-testing). Only built when
   *  `{ cellMap: true }` is passed — it's a multi-million-entry Map at full scale. */
  cellToEmpire?: Map<number, number>;
}

/** Empire footprint side from lifetime BTC: max(1, ⌊log₁₀(BTC)⌋). */
export function empireSide(btc: number): number {
  if (!(btc > 0) || !Number.isFinite(btc)) return 1;
  return Math.max(1, Math.floor(Math.log10(btc)));
}

/** Pack (x,y) into one positive integer key. Safe for |x|,|y| < 4096. */
export function cellKey(x: number, y: number): number {
  return (x + 4096) * 8192 + (y + 4096);
}

/**
 * O(N) disc bin-pack. Biggest empires first; processed in size CLASSES so each
 * class tiles on its OWN size-aligned grid — equal blocks never leave the fringe
 * gaps that made a naïve "scan for nearest free block" O(N²) (it choked >30k).
 *
 * For each class s: walk the disc-order candidates (center-out), snap each to the
 * s-aligned block containing it, and place it if free. Aligned same-size blocks
 * tile exactly, so a candidate's block is either free (place) or already taken
 * (skip, O(1)) — no rescanned fringe. Occupancy is a flat Uint8Array (no hashing);
 * overlaps across classes are still prevented by the free-check, so different
 * grids interleave safely. Scales to 850k empires / ~5.8M cells in ~1s.
 *
 * The cell→empire Map is opt-in (multi-million-entry at full scale).
 */
export function packEmpires(wallets: WalletInput[], opts: { cellMap?: boolean } = {}): PackResult {
  const empires: Empire[] = wallets.map((w, i) => ({ ...w, side: empireSide(w.btc), origIndex: i }));
  // Biggest first; ties by BTC desc then address (stable, deterministic).
  empires.sort((a, b) => b.side - a.side || b.btc - a.btc || (a.address < b.address ? -1 : 1));

  const cellToEmpire = opts.cellMap ? new Map<number, number>() : undefined;
  const totalCells = empires.reduce((s, e) => s + e.side * e.side, 0);
  if (totalCells === 0) return { placements: [], radius: 1, cellToEmpire };

  // Candidate positions, ring-ordered (unsorted). ×1.8 headroom for the cells
  // wasted to per-class grid alignment, so every empire finds a slot.
  const cand = generateDiscOrder(Math.max(256, Math.ceil(totalCells * 1.8)), false);

  let maxCoord = 1;
  let maxSide = 1;
  for (const e of empires) if (e.side > maxSide) maxSide = e.side;
  for (let i = 0; i < cand.xs.length; i++) {
    const ax = Math.abs(cand.xs[i]);
    const ay = Math.abs(cand.ys[i]);
    if (ax > maxCoord) maxCoord = ax;
    if (ay > maxCoord) maxCoord = ay;
  }
  const gridR = maxCoord + maxSide + 2;
  const side = 2 * gridR + 1;
  const occ = new Uint8Array(side * side);
  const gi = (x: number, y: number): number => (y + gridR) * side + (x + gridR);

  const placements: Placement[] = [];
  let radius = 1;
  let curSize = -1;
  let cursor = 0; // monotonic candidate cursor, restarted per size class

  for (const e of empires) {
    const s = e.side;
    if (s !== curSize) { curSize = s; cursor = 0; } // new class → scan from center
    let placed = false;
    for (; cursor < cand.xs.length; cursor++) {
      // Snap the candidate to its s-aligned block (top-left, in grid coords).
      const gx = cand.xs[cursor] + gridR;
      const gy = cand.ys[cursor] + gridR;
      const ox = Math.floor(gx / s) * s - gridR;
      const oy = Math.floor(gy / s) * s - gridR;
      if (ox < -gridR || oy < -gridR || ox + s - 1 > gridR || oy + s - 1 > gridR) continue;
      // Free? (rejects on the first occupied cell — O(1) for taken blocks)
      let free = true;
      for (let dy = 0; dy < s && free; dy++) {
        for (let dx = 0; dx < s; dx++) {
          if (occ[gi(ox + dx, oy + dy)]) { free = false; break; }
        }
      }
      if (!free) continue;
      const idx = placements.length;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          occ[gi(ox + dx, oy + dy)] = 1;
          if (cellToEmpire) cellToEmpire.set(cellKey(ox + dx, oy + dy), idx);
        }
      }
      placements.push({ ...e, ox, oy });
      const far = Math.max(Math.abs(ox), Math.abs(oy), Math.abs(ox + s), Math.abs(oy + s));
      if (far > radius) radius = far;
      placed = true;
      cursor++; // advance past the block we just placed
      break;
    }
    if (!placed) continue; // candidate pool exhausted (shouldn't happen with ×1.8)
  }

  return { placements, radius, cellToEmpire };
}
