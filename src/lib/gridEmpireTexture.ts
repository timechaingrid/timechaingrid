/**
 * gridEmpireTexture — bake the packed wallet empires into one RGBA texture.
 *
 * 850k empires can't render as individual rects; instead we pack them
 * (walletEmpires.packEmpires) and paint each empire's cells into a texture —
 * fill color in the interior, a brighter border on the block's perimeter, so
 * the Civ-6 territories read at the edges. The renderer draws one quad sampling
 * this nearest-neighbor (square pixels). See docs/cluster-lattice-design.md.
 *
 * Color = role (miner/whale/significant/dust), brightness ramps with holdings.
 * Pure + deterministic → unit-testable and worker-friendly.
 */
import { packEmpires, type WalletInput } from './walletEmpires';

/** Wallet color encoding (the project spec): miner red · whale gold · significant cyan
 *  · dust grey · satoshi brass-gold. */
const ROLE_COLOR: Record<string, number> = {
  satoshi: 0xc9962e,
  miner: 0xd1495b,
  whale: 0xf5c542,
  significant: 0x32c8e0,
  dust: 0x6b7280,
};

export function roleOf(w: { btc: number; txCount: number; isMiner: boolean; firstSeenBlock: number }): string {
  if (w.firstSeenBlock === 0 && w.isMiner) return 'satoshi';
  if (w.isMiner) return 'miner';
  if (w.btc >= 1000) return 'whale';
  if (w.btc >= 1 || w.txCount >= 100) return 'significant';
  return 'dust';
}

function darken(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = (v: number) => Math.round(v * (1 - amount)) & 0xff;
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Fill color for a wallet: role hue at full saturation for whales, darkened for
 *  smaller holders so the field reads as a wealth gradient (not a washed sheet). */
export function empireFill(w: WalletInput): number {
  const base = ROLE_COLOR[roleOf(w)];
  const t = Math.min(1, Math.max(0, Math.log10(Math.max(1, w.btc)) / 6)); // 0 (1 BTC) → 1 (1M)
  return darken(base, (1 - t) * 0.6); // small holders up to 60% darker
}

export interface EmpireTexture {
  /** RGBA8, side×side. RGB = empire color (border cells brighter), A = 255 if a
   *  cell is owned else 0. */
  data: Uint8Array;
  side: number;
  radius: number;
  /** Number of empires packed. */
  count: number;
}

/**
 * Pack the wallets and bake their empires into a texture. Border cells (the
 * perimeter of each empire's square) are brightened so territories read.
 */
export function buildEmpireTexture(wallets: WalletInput[]): EmpireTexture {
  const { placements, radius } = packEmpires(wallets);
  const side = 2 * radius + 1;
  const data = new Uint8Array(side * side * 4);

  for (const p of placements) {
    const fill = empireFill(p);
    const border = darken(fill, 0.5); // dark territory outline (Civ-6 borders)
    const fr = (fill >> 16) & 0xff, fg = (fill >> 8) & 0xff, fb = fill & 0xff;
    const br = (border >> 16) & 0xff, bg = (border >> 8) & 0xff, bb = border & 0xff;
    const s = p.side;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const tx = p.ox + dx + radius;
        const ty = p.oy + dy + radius;
        if (tx < 0 || ty < 0 || tx >= side || ty >= side) continue;
        const o = (ty * side + tx) * 4;
        const edge = dx === 0 || dy === 0 || dx === s - 1 || dy === s - 1;
        data[o] = edge ? br : fr;
        data[o + 1] = edge ? bg : fg;
        data[o + 2] = edge ? bb : fb;
        data[o + 3] = 255;
      }
    }
  }
  return { data, side, radius, count: placements.length };
}
