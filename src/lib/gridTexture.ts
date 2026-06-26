/**
 * gridTexture — bake the circular coin disc into a GPU-ready data texture.
 *
 * The renderer draws ONE quad sampling this texture (nearest-neighbor → square
 * "pixels"), instead of issuing millions of rects. Each texel encodes the
 * **block height** that minted the coin at that disc position (24-bit, RGB) plus
 * a presence flag (A): see docs/cluster-lattice-design.md §3.2.
 *
 * Why block (not color) per texel:
 *   - Scrubber is free: a coin is visible iff its block ≤ currentBlock (a single
 *     shader uniform); the texture never needs re-uploading as you scrub.
 *   - Color + empire-highlight are derived in-shader from small block-indexed
 *     lookup textures, so this 100MB texture stays version-stable and the heavy
 *     work is one upload.
 *
 * Pure + deterministic (block = blockOfCoinIndex; position = disc order) so it
 * runs in a Web Worker off the main thread (gridTextureWorker.ts) and is unit-
 * testable here without a GPU.
 */
import { generateDiscOrder, discRadius } from './discGrid';
import { blockOfCoinIndex } from './coinGrid';

export interface BlockTexture {
  /** RGBA8, row-major, side×side. RGB = block (24-bit LE), A = 255 if a coin sits
   *  here else 0. */
  data: Uint8Array;
  /** Texture is side×side, side = 2·radius + 1. */
  side: number;
  /** Disc bounding radius in cells; world cell (gx,gy) → texel (gx+radius, gy+radius). */
  radius: number;
  /** Number of coins (present texels). */
  total: number;
}

/** Encode a block height into a texel's RGB (little-endian 24-bit). */
export function encodeBlock(data: Uint8Array, offset: number, block: number): void {
  data[offset] = block & 0xff;
  data[offset + 1] = (block >> 8) & 0xff;
  data[offset + 2] = (block >> 16) & 0xff;
  data[offset + 3] = 255; // present
}

/** Build the full block texture for `totalCoins` coins in disc order. */
export function buildBlockTexture(totalCoins: number): BlockTexture {
  const radius = discRadius(totalCoins) + 2; // matches generateDiscOrder's margin
  const side = 2 * radius + 1;
  const data = new Uint8Array(side * side * 4); // zero-init → A=0 (empty) everywhere
  if (totalCoins <= 0) return { data, side, radius, total: 0 };

  const { xs, ys } = generateDiscOrder(totalCoins);
  for (let n = 0; n < totalCoins; n++) {
    const tx = xs[n] + radius;
    const ty = ys[n] + radius;
    encodeBlock(data, (ty * side + tx) * 4, blockOfCoinIndex(n));
  }
  return { data, side, radius, total: totalCoins };
}

/** Decode the block at world cell (gx,gy), or null if no coin / out of range. */
export function decodeBlockAt(tex: BlockTexture, gx: number, gy: number): number | null {
  const tx = gx + tex.radius;
  const ty = gy + tex.radius;
  if (tx < 0 || ty < 0 || tx >= tex.side || ty >= tex.side) return null;
  const o = (ty * tex.side + tx) * 4;
  if (tex.data[o + 3] === 0) return null;
  return tex.data[o] | (tex.data[o + 1] << 8) | (tex.data[o + 2] << 16);
}
