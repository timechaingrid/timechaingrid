import { describe, it, expect } from 'vitest';
import { buildPickIndex, pickEmpire } from '../gridEmpirePick';

describe('gridEmpirePick', () => {
  // Three empires: a 3×3 at origin, a 1×1 to the right, a 4×4 further out.
  // offset = center = top-left + side/2.
  const offset = new Float32Array([
    0 + 1.5, 0 + 1.5, // empire 0: 3×3, top-left (0,0) → cells 0..2
    10 + 0.5, 0 + 0.5, // empire 1: 1×1 at (10,0)
    -20 + 2, -20 + 2, // empire 2: 4×4, top-left (-20,-20) → cells -20..-17
  ]);
  const size = new Float32Array([3, 1, 4]);
  const idx = buildPickIndex(offset, size, 3);

  it('picks the empire whose block contains the cell', () => {
    expect(pickEmpire(idx, 0, 0)).toBe(0);
    expect(pickEmpire(idx, 2, 2)).toBe(0); // far corner of the 3×3
    expect(pickEmpire(idx, 10, 0)).toBe(1);
    expect(pickEmpire(idx, -18, -18)).toBe(2);
  });

  it('returns -1 for empty cells', () => {
    expect(pickEmpire(idx, 5, 5)).toBe(-1);
    expect(pickEmpire(idx, 3, 0)).toBe(-1); // just past the 3×3 (cells 0..2)
    expect(pickEmpire(idx, 1000, 1000)).toBe(-1);
  });

  it('scales — 50k empires build + pick without lag', () => {
    const n = 50_000;
    const off = new Float32Array(n * 2);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      off[i * 2] = (i % 200) * 3 + 1.5;
      off[i * 2 + 1] = Math.floor(i / 200) * 3 + 1.5;
      sz[i] = 3;
    }
    const big = buildPickIndex(off, sz, n);
    // a cell inside empire 0's block
    expect(pickEmpire(big, 0, 0)).toBe(0);
  });
});
