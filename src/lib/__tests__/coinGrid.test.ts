import { describe, it, expect } from 'vitest';
import { spiralCoord } from '../spiral';
import {
  coinsMintedAtBlock,
  cumulativeCoins,
  blockOfCoinIndex,
  epochOfBlock,
  inverseSpiral,
  ringForCount,
} from '../coinGrid';

describe('inverseSpiral', () => {
  it('round-trips spiralCoord for the first 50k indices', () => {
    for (let n = 0; n < 50_000; n++) {
      const [x, y] = spiralCoord(n);
      expect(inverseSpiral(x, y)).toBe(n);
    }
  });

  it('handles the four ring corners', () => {
    // ring 2 corners
    for (const n of [12, 16, 20, 24]) {
      const [x, y] = spiralCoord(n);
      expect(inverseSpiral(x, y)).toBe(n);
    }
  });
});

describe('coinsMintedAtBlock (1 cell = 1 BTC, floored subsidy)', () => {
  it('follows the halving schedule', () => {
    expect(coinsMintedAtBlock(0)).toBe(50);
    expect(coinsMintedAtBlock(209_999)).toBe(50);
    expect(coinsMintedAtBlock(210_000)).toBe(25);
    expect(coinsMintedAtBlock(420_000)).toBe(12); // floor(12.5)
    expect(coinsMintedAtBlock(630_000)).toBe(6); // floor(6.25)
    expect(coinsMintedAtBlock(840_000)).toBe(3); // floor(3.125)
  });
});

describe('cumulativeCoins', () => {
  it('matches the real issuance at epoch boundaries', () => {
    expect(cumulativeCoins(0)).toBe(50);
    expect(cumulativeCoins(209_999)).toBe(10_500_000);
    expect(cumulativeCoins(419_999)).toBe(15_750_000);
    // through the current bundle tip
    expect(cumulativeCoins(952_351)).toBe(19_867_056);
  });
});

describe('blockOfCoinIndex (inverse of cumulativeCoins)', () => {
  it('maps mint indices back to their block', () => {
    expect(blockOfCoinIndex(0)).toBe(0);
    expect(blockOfCoinIndex(49)).toBe(0);
    expect(blockOfCoinIndex(50)).toBe(1);
    expect(blockOfCoinIndex(10_499_999)).toBe(209_999);
    expect(blockOfCoinIndex(10_500_000)).toBe(210_000);
  });

  it('is consistent with cumulativeCoins across a sweep', () => {
    for (let block = 0; block < 5_000; block += 137) {
      const firstIdx = cumulativeCoins(block - 1); // coins before this block
      expect(blockOfCoinIndex(firstIdx)).toBe(block);
    }
  });
});

describe('epochOfBlock / ringForCount', () => {
  it('epochs split on 210k', () => {
    expect(epochOfBlock(0)).toBe(0);
    expect(epochOfBlock(209_999)).toBe(0);
    expect(epochOfBlock(210_000)).toBe(1);
    expect(epochOfBlock(840_000)).toBe(4);
  });

  it('ring grows ~sqrt(count); ~19.9M coins fit within the ±3240 chain grid', () => {
    expect(ringForCount(1)).toBe(0);
    expect(ringForCount(9)).toBe(1); // (2*1+1)^2 = 9
    expect(ringForCount(19_867_056)).toBeLessThan(3240);
  });
});
