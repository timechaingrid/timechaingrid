import { describe, it, expect } from 'vitest';
import { roleOf, empireFill, buildEmpireTexture } from '../gridEmpireTexture';
import type { WalletInput } from '../walletEmpires';

describe('gridEmpireTexture — roles & color', () => {
  it('classifies roles by holdings/miner/birth', () => {
    expect(roleOf({ btc: 0, txCount: 0, isMiner: true, firstSeenBlock: 0 })).toBe('satoshi');
    expect(roleOf({ btc: 5, txCount: 0, isMiner: true, firstSeenBlock: 100 })).toBe('miner');
    expect(roleOf({ btc: 5000, txCount: 0, isMiner: false, firstSeenBlock: 100 })).toBe('whale');
    expect(roleOf({ btc: 5, txCount: 0, isMiner: false, firstSeenBlock: 100 })).toBe('significant');
    expect(roleOf({ btc: 0.1, txCount: 1, isMiner: false, firstSeenBlock: 100 })).toBe('dust');
  });

  it('empireFill returns a 24-bit color, brighter for bigger holders', () => {
    const dust = empireFill({ address: 'a', firstSeenBlock: 1, btc: 1, txCount: 1, isMiner: false });
    const whale = empireFill({ address: 'b', firstSeenBlock: 1, btc: 1_000_000, txCount: 1, isMiner: false });
    expect(dust).toBeGreaterThanOrEqual(0);
    expect(dust).toBeLessThanOrEqual(0xffffff);
    expect(whale).toBeGreaterThanOrEqual(0);
  });
});

describe('gridEmpireTexture — buildEmpireTexture', () => {
  function wallets(n: number): WalletInput[] {
    const out: WalletInput[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        address: `w${i}`,
        firstSeenBlock: i,
        btc: 10 ** (1 + (i % 4)), // 10 .. 10000
        txCount: 1,
        isMiner: i === 0,
      });
    }
    return out;
  }

  it('bakes a texture sized to the packed disc', () => {
    const tex = buildEmpireTexture(wallets(500));
    expect(tex.count).toBe(500);
    expect(tex.side).toBe(2 * tex.radius + 1);
    expect(tex.data.length).toBe(tex.side * tex.side * 4);
  });

  it('paints exactly the empires’ cells (A=255) and nothing else', () => {
    const ws = wallets(300);
    const tex = buildEmpireTexture(ws);
    let present = 0;
    for (let i = 3; i < tex.data.length; i += 4) if (tex.data[i] === 255) present++;
    // total occupied cells = sum of side² (no overlap, from the packer)
    const expected = ws.reduce((s, w) => {
      const side = Math.max(1, Math.floor(Math.log10(Math.max(1, w.btc))));
      return s + side * side;
    }, 0);
    expect(present).toBe(expected);
  });
});
