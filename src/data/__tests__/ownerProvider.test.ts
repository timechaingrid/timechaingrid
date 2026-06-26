import { describe, it, expect } from 'vitest';
import { MinerOwnerProvider, SHARED_EMPIRE } from '../ownerProvider';
import { cumulativeCoins } from '@/lib/coinGrid';
import type { CoinSubstrate } from '../coinSubstrate';

/** Minimal CoinSubstrate stub exposing only what MinerOwnerProvider reads. */
function stubSub(tip: number): CoinSubstrate {
  const colors = [0xff0000, 0x00ff00, 0x0000ff];
  return {
    tipBlock: tip,
    minerIdxAt: (b: number) => b % 3, // fake: 3 miners cycling by block
    minerColor: (idx: number) => colors[idx] ?? 0,
  } as unknown as CoinSubstrate;
}

describe('MinerOwnerProvider (v1 — coinbase ownership)', () => {
  it('reports totals derived from the substrate tip', () => {
    const p = new MinerOwnerProvider(stubSub(840_000));
    expect(p.maxBlock).toBe(840_000);
    expect(p.totalCoins).toBe(cumulativeCoins(840_000));
    expect(p.kind).toBe('miner');
  });

  it('maps a block to its miner color + empire id', () => {
    const p = new MinerOwnerProvider(stubSub(1000));
    expect(p.empireOfBlock(0)).toBe(0);
    expect(p.colorOfBlock(0)).toBe(0xff0000);
    expect(p.empireOfBlock(1)).toBe(1);
    expect(p.colorOfBlock(1)).toBe(0x00ff00);
    expect(p.empireOfBlock(2)).toBe(2);
    expect(p.colorOfBlock(2)).toBe(0x0000ff);
  });

  it('reserves SHARED_EMPIRE = -1 for fractional cells (v2)', () => {
    expect(SHARED_EMPIRE).toBe(-1);
  });
});
