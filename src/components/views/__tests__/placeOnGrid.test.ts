import { describe, it, expect } from 'vitest';
import { placeOnGrid, placeWallet } from '../placeOnGrid';
import { FREE_TIER_50 } from '@/data/__fixtures__/free-tier-50';
import {
  DEFAULT_CHAIN_GRID_MIN,
  DEFAULT_CHAIN_GRID_MAX,
} from '@/lib/coords';
import type { WalletData } from '@/types/wallet';

describe('placeOnGrid', () => {
  it('is deterministic — same address → same position', () => {
    const a = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    expect(placeOnGrid(a)).toEqual(placeOnGrid(a));
  });

  it('produces positions inside the chain-grid bounds', () => {
    for (const w of FREE_TIER_50) {
      const p = placeOnGrid(w.address);
      expect(p.x).toBeGreaterThanOrEqual(DEFAULT_CHAIN_GRID_MIN);
      expect(p.x).toBeLessThanOrEqual(DEFAULT_CHAIN_GRID_MAX);
      expect(p.y).toBeGreaterThanOrEqual(DEFAULT_CHAIN_GRID_MIN);
      expect(p.y).toBeLessThanOrEqual(DEFAULT_CHAIN_GRID_MAX);
    }
  });

  it('produces integer coordinates (chain grid is integer-cell)', () => {
    for (const w of FREE_TIER_50) {
      const p = placeOnGrid(w.address);
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it('avoids collisions across the 50-wallet fixture', () => {
    // 6481×6481 ≈ 42M cells; collisions for 50 random hashes are
    // astronomically unlikely. We assert it explicitly so a future
    // hash regression can't silently pancake nodes.
    const seen = new Set<string>();
    for (const w of FREE_TIER_50) {
      const p = placeOnGrid(w.address);
      const key = `${p.x},${p.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('different addresses tend to produce different positions', () => {
    const a = placeOnGrid('1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const b = placeOnGrid('1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    // Either x or y must differ (avalanche check on a single byte change).
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });
});

describe('placeWallet', () => {
  it('pins satoshi at the origin', () => {
    const sat: WalletData = FREE_TIER_50[0]; // first entry is the satoshi
    expect(sat.role).toBe('satoshi');
    expect(placeWallet(sat)).toEqual({ x: 0, y: 0 });
  });

  it('delegates to placeOnGrid for every other role', () => {
    for (const w of FREE_TIER_50) {
      if (w.role === 'satoshi') continue;
      expect(placeWallet(w)).toEqual(placeOnGrid(w.address));
    }
  });
});

// ROLE_COLOR + ROLE_RADIUS are tested in src/lib/__tests__/role-visuals.test.ts
// since they live in the shared role-visuals module now.
