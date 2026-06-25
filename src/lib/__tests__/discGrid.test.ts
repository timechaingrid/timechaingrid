import { describe, it, expect } from 'vitest';
import {
  ringOf,
  angleOf,
  discRadius,
  discIndexOf,
  generateDiscOrder,
} from '../discGrid';

describe('discGrid — ring + angle primitives', () => {
  it('origin is ring 0', () => {
    expect(ringOf(0, 0)).toBe(0);
  });

  it('rounds Euclidean radius to the nearest ring', () => {
    expect(ringOf(1, 0)).toBe(1);
    expect(ringOf(1, 1)).toBe(1); // hypot 1.414 → round 1
    expect(ringOf(2, 0)).toBe(2);
    expect(ringOf(2, 2)).toBe(3); // hypot 2.83 → round 3
  });

  it('angle is measured CCW from +x in [0, 2π)', () => {
    expect(angleOf(1, 0)).toBeCloseTo(0);
    expect(angleOf(0, 1)).toBeCloseTo(Math.PI / 2);
    expect(angleOf(-1, 0)).toBeCloseTo(Math.PI);
    expect(angleOf(0, -1)).toBeCloseTo((3 * Math.PI) / 2);
  });
});

describe('discGrid — discIndexOf (hit-test rank)', () => {
  it('origin maps to coin index 0', () => {
    expect(discIndexOf(0, 0)).toBe(0);
  });

  it('ring 1 is the 8 cells at indices 1..8, ordered by angle', () => {
    // (1,0)@0°, (1,1)@45°, (0,1)@90°, (-1,1)@135° ...
    expect(discIndexOf(1, 0)).toBe(1);
    expect(discIndexOf(1, 1)).toBe(2);
    expect(discIndexOf(0, 1)).toBe(3);
    expect(discIndexOf(-1, 1)).toBe(4);
    expect(discIndexOf(1, -1)).toBe(8); // last in ring 1 (315°)
  });
});

describe('discGrid — generateDiscOrder', () => {
  it('returns exactly `count` cells starting at the origin', () => {
    const { xs, ys } = generateDiscOrder(1000);
    expect(xs.length).toBe(1000);
    expect(ys.length).toBe(1000);
    expect(xs[0]).toBe(0);
    expect(ys[0]).toBe(0);
  });

  it('is a bijection — all cells distinct', () => {
    const { xs, ys } = generateDiscOrder(3000);
    const seen = new Set<string>();
    for (let i = 0; i < xs.length; i++) seen.add(`${xs[i]},${ys[i]}`);
    expect(seen.size).toBe(3000);
  });

  it('fills by non-decreasing ring (disc grows outward)', () => {
    const { xs, ys } = generateDiscOrder(3000);
    let prev = 0;
    for (let i = 0; i < xs.length; i++) {
      const r = ringOf(xs[i], ys[i]);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('forms a DISC, not a square — max ring ≈ √(count/π), corners excluded', () => {
    const count = 5000;
    const { xs, ys } = generateDiscOrder(count);
    let maxRing = 0;
    for (let i = 0; i < xs.length; i++) maxRing = Math.max(maxRing, ringOf(xs[i], ys[i]));
    const R = discRadius(count); // ⌈√(count/π)⌉
    expect(maxRing).toBeLessThanOrEqual(R + 1);
    // A square of `count` cells would reach side ~√count/2 along the diagonal to
    // ring ~0.707·√count ≫ R. Assert a diagonal corner cell is NOT in the disc.
    const corner = Math.floor(Math.sqrt(count) / 2);
    expect(discIndexOf(corner, corner)).toBeGreaterThanOrEqual(count);
  });

  it('discIndexOf is the EXACT inverse of generateDiscOrder', () => {
    // The keystone invariant: rank(cell i) === i for every cell in the order.
    const { xs, ys } = generateDiscOrder(2500);
    for (let i = 0; i < xs.length; i++) {
      expect(discIndexOf(xs[i], ys[i])).toBe(i);
    }
  });
});
