import { describe, it, expect } from 'vitest';
import { empireSide, packEmpires, cellKey, type WalletInput } from '../walletEmpires';

describe('walletEmpires — empireSide', () => {
  it('sizes the footprint by ⌊log₁₀(BTC)⌋, min 1', () => {
    expect(empireSide(1)).toBe(1);
    expect(empireSide(50)).toBe(1);
    expect(empireSide(99)).toBe(1);
    expect(empireSide(100)).toBe(2); // 2×2
    expect(empireSide(999)).toBe(2);
    expect(empireSide(1000)).toBe(3); // 3×3
    expect(empireSide(10000)).toBe(4); // 4×4
    expect(empireSide(1_000_000)).toBe(6); // 6×6
  });

  it('clamps dust / zero / invalid to a single cell', () => {
    expect(empireSide(0.5)).toBe(1);
    expect(empireSide(0)).toBe(1);
    expect(empireSide(-5)).toBe(1);
    expect(empireSide(NaN)).toBe(1);
  });
});

function makeWallets(n: number): WalletInput[] {
  // Mixed sizes: a few whales, many mid, lots of small — deterministic.
  const out: WalletInput[] = [];
  for (let i = 0; i < n; i++) {
    const btc = i === 0 ? 5_000_000 : 10 ** (1 + (i % 5)); // 10..100k, one mega-whale
    out.push({ address: `w${i}`, firstSeenBlock: i * 10, btc, txCount: 1, isMiner: false });
  }
  return out;
}

describe('walletEmpires — packEmpires', () => {
  it('places every empire', () => {
    const wallets = makeWallets(800);
    const { placements } = packEmpires(wallets);
    expect(placements.length).toBe(800);
  });

  it('never overlaps — occupied cells exactly equal the sum of footprints', () => {
    const wallets = makeWallets(800);
    const { placements, cellToEmpire } = packEmpires(wallets, { cellMap: true });
    const expectedCells = placements.reduce((s, p) => s + p.side * p.side, 0);
    expect(cellToEmpire).toBeDefined();
    expect(cellToEmpire!.size).toBe(expectedCells);
    // And each placement's own cells map back to itself.
    placements.forEach((p, idx) => {
      for (let dy = 0; dy < p.side; dy++) {
        for (let dx = 0; dx < p.side; dx++) {
          expect(cellToEmpire!.get(cellKey(p.ox + dx, p.oy + dy))).toBe(idx);
        }
      }
    });
  });

  it('puts the biggest empire (Satoshi/whale) near the center', () => {
    const wallets = makeWallets(800);
    const { placements } = packEmpires(wallets);
    const biggest = placements[0]; // sorted biggest-first → placed first, most central
    expect(biggest.btc).toBe(5_000_000);
    // Its block should straddle the origin region.
    const cx = biggest.ox + biggest.side / 2;
    const cy = biggest.oy + biggest.side / 2;
    expect(Math.hypot(cx, cy)).toBeLessThan(biggest.side + 2);
  });

  it('produces a compact disc — radius ≈ √(totalCells/π)', () => {
    const wallets = makeWallets(600);
    const { placements, radius } = packEmpires(wallets);
    const totalCells = placements.reduce((s, p) => s + p.side * p.side, 0);
    const ideal = Math.sqrt(totalCells / Math.PI);
    // Packed (not perfectly dense) → within ~3× the ideal disc radius.
    expect(radius).toBeLessThan(ideal * 3);
  });
});
