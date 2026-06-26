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
}

export interface Placement extends Empire {
  /** Top-left cell of the empire's square block. */
  ox: number;
  oy: number;
}

export interface PackResult {
  placements: Placement[];
  /** cell key → index into placements (for hover hit-testing). */
  cellToEmpire: Map<number, number>;
  /** Bounding radius (in cells) of the packed map, for camera fit. */
  radius: number;
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

function blockFree(occ: Set<number>, ox: number, oy: number, s: number): boolean {
  for (let dy = 0; dy < s; dy++) {
    for (let dx = 0; dx < s; dx++) {
      if (occ.has(cellKey(ox + dx, oy + dy))) return false;
    }
  }
  return true;
}

/**
 * Greedy disc bin-pack. Biggest empires first; each placed at the nearest
 * free block to the origin (candidates walked in disc order). Centers the block
 * on the candidate cell so footprints grow symmetrically.
 */
export function packEmpires(wallets: WalletInput[]): PackResult {
  const empires: Empire[] = wallets.map((w) => ({ ...w, side: empireSide(w.btc) }));
  // Biggest first; ties by BTC desc then address (stable, deterministic).
  empires.sort((a, b) => b.side - a.side || b.btc - a.btc || (a.address < b.address ? -1 : 1));

  const totalCells = empires.reduce((s, e) => s + e.side * e.side, 0);
  // Generous candidate pool so even the outermost empires find a spot.
  const cand = generateDiscOrder(Math.max(64, totalCells * 4));

  const occ = new Set<number>();
  const cellToEmpire = new Map<number, number>();
  const placements: Placement[] = [];
  let lo = 0; // low-water cursor: candidates before this are occupied 1×1 cells
  let radius = 1;

  for (const e of empires) {
    const s = e.side;
    const off = s >> 1; // center the block on the candidate cell
    let placed = false;
    for (let i = lo; i < cand.xs.length; i++) {
      const ox = cand.xs[i] - off;
      const oy = cand.ys[i] - off;
      if (!blockFree(occ, ox, oy, s)) continue;
      const idx = placements.length;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const k = cellKey(ox + dx, oy + dy);
          occ.add(k);
          cellToEmpire.set(k, idx);
        }
      }
      placements.push({ ...e, ox, oy });
      // Track bounding radius (farthest occupied corner from origin).
      const far = Math.max(Math.abs(ox), Math.abs(oy), Math.abs(ox + s), Math.abs(oy + s));
      if (far > radius) radius = far;
      placed = true;
      break;
    }
    // Advance the low-water cursor past contiguous occupied candidate cells.
    while (lo < cand.xs.length && occ.has(cellKey(cand.xs[lo], cand.ys[lo]))) lo++;
    if (!placed) {
      // Candidate pool exhausted (shouldn't happen with the ×4 margin); skip.
      continue;
    }
  }

  return { placements, cellToEmpire, radius };
}
