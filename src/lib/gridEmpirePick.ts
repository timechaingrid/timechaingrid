/**
 * gridEmpirePick — spatial hash for "which empire is under the cursor".
 *
 * The instanced renderer has no CPU-side geometry, so hover-highlight needs a
 * lightweight way to map a grid cell → empire index. We bucket each empire's
 * block into a coarse grid; a pick checks only the empires in the cursor's
 * bucket. Built once from the instance arrays (centers + sizes); O(1)-ish picks.
 * See gridShader.ts (uHovered) + gridEmpireInstances.ts.
 */

const BUCKET = 24; // cells per bucket side

function bucketKey(bx: number, by: number): number {
  return (bx + 4096) * 8192 + (by + 4096);
}

export interface PickIndex {
  buckets: Map<number, number[]>;
  offset: Float32Array; // empire centers [x,y,…] (cells)
  size: Float32Array; // empire side (cells)
}

/** Bucket every empire's footprint for fast point lookup. */
export function buildPickIndex(offset: Float32Array, size: Float32Array, count: number): PickIndex {
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const s = size[i];
    const ox = offset[i * 2] - s / 2;
    const oy = offset[i * 2 + 1] - s / 2;
    const bx0 = Math.floor(ox / BUCKET);
    const bx1 = Math.floor((ox + s - 1) / BUCKET);
    const by0 = Math.floor(oy / BUCKET);
    const by1 = Math.floor((oy + s - 1) / BUCKET);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const k = bucketKey(bx, by);
        const arr = buckets.get(k);
        if (arr) arr.push(i);
        else buckets.set(k, [i]);
      }
    }
  }
  return { buckets, offset, size };
}

/** Empire index whose block contains cell (gx,gy), or -1. */
export function pickEmpire(idx: PickIndex, gx: number, gy: number): number {
  const arr = idx.buckets.get(bucketKey(Math.floor(gx / BUCKET), Math.floor(gy / BUCKET)));
  if (!arr) return -1;
  for (const i of arr) {
    const s = idx.size[i];
    const ox = idx.offset[i * 2] - s / 2;
    const oy = idx.offset[i * 2 + 1] - s / 2;
    if (gx >= ox && gx < ox + s && gy >= oy && gy < oy + s) return i;
  }
  return -1;
}
