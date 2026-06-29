import { describe, it, expect } from 'vitest';
import { buildEmpireInstances } from '../gridEmpireInstances';
import type { WalletInput } from '../walletEmpires';

function w(btc: number, isMiner: boolean): WalletInput {
  return { address: `w_${btc}_${isMiner}`, firstSeenBlock: 0, btc, txCount: 1, isMiner };
}

describe('buildEmpireInstances — whale flag', () => {
  it('non-miner ≥1000 BTC → whale=1 (stays visible in whales mode)', () => {
    const { whale } = buildEmpireInstances([w(1500, false)]);
    expect(whale[0]).toBe(1);
  });

  it('non-miner <1000 BTC → whale=0 (hidden in whales mode)', () => {
    const { whale } = buildEmpireInstances([w(500, false)]);
    expect(whale[0]).toBe(0);
  });

  it('miner <1000 BTC → whale=1 (miners always visible in whales mode)', () => {
    // BUG before fix: whale[0] was 0, making miners disappear on toggle
    const { whale } = buildEmpireInstances([w(50, true)]);
    expect(whale[0]).toBe(1);
  });

  it('miner ≥1000 BTC → whale=1', () => {
    const { whale } = buildEmpireInstances([w(2000, true)]);
    expect(whale[0]).toBe(1);
  });

  it('satoshi (isMiner, huge btc) → whale=1', () => {
    const { whale } = buildEmpireInstances([w(1_000_000, true)]);
    expect(whale[0]).toBe(1);
  });
});
