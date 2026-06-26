import { describe, it, expect } from 'vitest';
import { buildBlockTexture, decodeBlockAt, encodeBlock } from '../gridTexture';
import { generateDiscOrder, discRadius } from '../discGrid';
import { blockOfCoinIndex } from '../coinGrid';

describe('gridTexture — block encode/decode', () => {
  it('round-trips a 24-bit block height through a texel', () => {
    const data = new Uint8Array(4);
    encodeBlock(data, 0, 954_681);
    const decoded = data[0] | (data[1] << 8) | (data[2] << 16);
    expect(decoded).toBe(954_681);
    expect(data[3]).toBe(255); // present
  });
});

describe('gridTexture — buildBlockTexture', () => {
  it('sizes the texture to the disc bounding box', () => {
    const tex = buildBlockTexture(500);
    const radius = discRadius(500) + 2;
    expect(tex.radius).toBe(radius);
    expect(tex.side).toBe(2 * radius + 1);
    expect(tex.data.length).toBe(tex.side * tex.side * 4);
    expect(tex.total).toBe(500);
  });

  it('places each coin block at its disc position (matches the layout)', () => {
    const total = 600;
    const tex = buildBlockTexture(total);
    const { xs, ys } = generateDiscOrder(total);
    // Every coin n must decode, at its disc cell, to the block that minted it.
    for (let n = 0; n < total; n++) {
      expect(decodeBlockAt(tex, xs[n], ys[n])).toBe(blockOfCoinIndex(n));
    }
  });

  it('marks exactly `total` texels present, rest empty', () => {
    const tex = buildBlockTexture(400);
    let present = 0;
    for (let i = 3; i < tex.data.length; i += 4) if (tex.data[i] === 255) present++;
    expect(present).toBe(400);
  });

  it('leaves out-of-disc corner cells empty (circular, not square)', () => {
    const total = 800;
    const tex = buildBlockTexture(total);
    // A diagonal corner of the bounding box is outside the disc → no coin.
    expect(decodeBlockAt(tex, tex.radius, tex.radius)).toBeNull();
  });

  it('handles the empty case', () => {
    const tex = buildBlockTexture(0);
    expect(tex.total).toBe(0);
  });
});
