/**
 * discGrid — Euclidean disc-filling lattice order for the circular Grid.
 *
 * Replaces the Ulam SQUARE spiral (spiral.ts) for the v2 renderer: coins fill
 * outward by integer **ring** (`round(hypot)`), each ring filled by **angle**,
 * so the first N coins form a **disc** (not a square) while every coin stays on
 * the integer lattice (square "pixel" tiles). See docs/cluster-lattice-design.md §3.1.
 *
 * Ordering key per cell: (ring asc, angle asc, x asc, y asc). The order is data-
 * independent — pure lattice geometry — so it's deterministic forever.
 *
 *   - `generateDiscOrder(count)` → the first `count` cells in disc order (bulk,
 *     for the texture build; O(R²) enumerate + O(R) per-ring angle sorts).
 *   - `discIndexOf(x,y)` → a cell's coin index (rank), O(R), for click hit-testing.
 *     Exact inverse of generateDiscOrder (no closed form — Gauss circle problem —
 *     so the renderer never inverts per-frame; only on a click).
 */

const TAU = Math.PI * 2;

/** Integer ring of a cell = nearest-integer Euclidean radius. */
export function ringOf(x: number, y: number): number {
  return Math.round(Math.sqrt(x * x + y * y));
}

/** Angle in [0, TAU), from +x axis CCW — the within-ring ordering key. */
export function angleOf(x: number, y: number): number {
  const a = Math.atan2(y, x);
  return a < 0 ? a + TAU : a;
}

/** Natural disc radius (in rings) for a disc of roughly `count` cells: ⌈√(count/π)⌉. */
export function discRadius(count: number): number {
  if (count <= 1) return 0;
  return Math.ceil(Math.sqrt(count / Math.PI));
}

/** Count of lattice cells with ringOf < r, i.e. x²+y² < (r-0.5)². O(r). */
function cellsBelowRing(r: number): number {
  if (r <= 0) return 0;
  const rho2 = (r - 0.5) * (r - 0.5);
  const xMax = Math.floor(r - 0.5);
  let count = 0;
  for (let x = -xMax; x <= xMax; x++) {
    const rem = rho2 - x * x;
    if (rem <= 0) continue;
    // largest |y| with x²+y² < rho²  →  y² < rem
    const yMax = Math.ceil(Math.sqrt(rem)) - 1;
    if (yMax >= 0) count += 2 * yMax + 1;
  }
  return count;
}

/** True iff cell (cx,cy) is ordered strictly before target (tx,ty) within one ring. */
function angleBefore(cx: number, cy: number, ca: number, tx: number, ty: number, ta: number): boolean {
  if (ca !== ta) return ca < ta;
  if (cx !== tx) return cx < tx; // tie-break (ring angles are normally distinct)
  return cy < ty;
}

/**
 * Disc-order rank (coin index) of cell (x,y). Exact inverse of generateDiscOrder.
 * O(R): cellsBelowRing is O(r); the within-ring count walks only the ring's
 * annulus band (two O(1)-thick arcs per column), so O(r) total.
 */
export function discIndexOf(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  const r = ringOf(x, y);
  const a = angleOf(x, y);
  const lo2 = (r - 0.5) * (r - 0.5);
  const hi2 = (r + 0.5) * (r + 0.5);
  const xMax = Math.floor(r + 0.5);
  let within = 0;
  for (let cx = -xMax; cx <= xMax; cx++) {
    const cx2 = cx * cx;
    if (cx2 >= hi2) continue;
    const yOuter = Math.ceil(Math.sqrt(hi2 - cx2)) - 1; // max |y| in ring (y² < hi2-cx2)
    const innerRem = lo2 - cx2;
    const yInner = innerRem > 0 ? Math.floor(Math.sqrt(innerRem - 1e-9)) : -1; // |y| ≤ yInner are below the ring
    // in-ring |cy| ∈ (yInner, yOuter]: the upper arc [yInner+1 .. yOuter] and its mirror.
    for (let cy = yInner + 1; cy <= yOuter; cy++) {
      for (const sy of cy === 0 ? [0] : [cy, -cy]) {
        if (cx === x && sy === y) continue;
        if (angleBefore(cx, sy, angleOf(cx, sy), x, y, a)) within++;
      }
    }
  }
  return cellsBelowRing(r) + within;
}

/**
 * The first `count` lattice cells in disc order, as parallel Int16Array
 * coordinates (coords fit in int16 for any realistic chain — R ≈ 2516 at full
 * issuance). Bucket-by-ring then per-ring angle sort: avoids one giant
 * comparator sort over millions of cells.
 */
export function generateDiscOrder(
  count: number,
  sorted = true,
): { xs: Int16Array; ys: Int16Array } {
  if (count <= 0) return { xs: new Int16Array(0), ys: new Int16Array(0) };
  const R = discRadius(count) + 2; // margin so the disc up to ring R holds ≥ count

  // Pass 1 — cells per ring.
  const ringCount = new Int32Array(R + 1);
  for (let x = -R; x <= R; x++) {
    for (let y = -R; y <= R; y++) {
      const r = ringOf(x, y);
      if (r <= R) ringCount[r]++;
    }
  }
  // Ring start offsets (prefix sum).
  const ringStart = new Int32Array(R + 2);
  for (let r = 0; r <= R; r++) ringStart[r + 1] = ringStart[r] + ringCount[r];
  const totalCells = ringStart[R + 1];

  // Pass 2 — place cells into their ring slots (unsorted within ring).
  const xs = new Int16Array(totalCells);
  const ys = new Int16Array(totalCells);
  const cursor = Int32Array.from(ringStart);
  for (let x = -R; x <= R; x++) {
    for (let y = -R; y <= R; y++) {
      const r = ringOf(x, y);
      if (r > R) continue;
      const i = cursor[r]++;
      xs[i] = x;
      ys[i] = y;
    }
  }

  // Pass 3 — sort each ring slice by (angle, x, y). Skipped in `sorted=false`
  // mode (used for packing candidates, where ring-order alone suffices and the
  // per-ring sort is the cost driver at millions of cells).
  if (!sorted) return { xs: xs.subarray(0, count), ys: ys.subarray(0, count) };
  for (let r = 0; r <= R; r++) {
    const s = ringStart[r];
    const e = ringStart[r + 1];
    if (e - s <= 1) continue;
    const idx = Array.from({ length: e - s }, (_, k) => s + k);
    idx.sort((p, q) => {
      const ap = angleOf(xs[p], ys[p]);
      const aq = angleOf(xs[q], ys[q]);
      if (ap !== aq) return ap - aq;
      if (xs[p] !== xs[q]) return xs[p] - xs[q];
      return ys[p] - ys[q];
    });
    const sx = idx.map((i) => xs[i]);
    const sy = idx.map((i) => ys[i]);
    for (let k = 0; k < idx.length; k++) {
      xs[s + k] = sx[k];
      ys[s + k] = sy[k];
    }
  }

  return { xs: xs.subarray(0, count), ys: ys.subarray(0, count) };
}
