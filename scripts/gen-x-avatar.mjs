/**
 * gen-x-avatar.mjs — build a 400×400 X / Twitter profile avatar → x-avatar.png.
 *
 * Privacy-clean: rendered locally with resvg, system fonts only. NOT deployed.
 * X circle-crops the avatar, so the motif sits inside a circle-safe radius.
 *
 * Grid sibling of the Graph avatar (same approved language: orange Satoshi
 * center, yellow-gold satellites at varied brightness, EVEN spacing, brass
 * bezel) — expressed in the Grid's identity: square coin-tiles on the integer
 * lattice radiating from an orange ₿ genesis tile. Fully deterministic.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const S = 400;
const cx = 200;
const cy = 200;
const BG = '#08080c';
const BRASS = '#c28840';
const SATOSHI = '#f0731a'; // deep Bitcoin-orange genesis tile
const NODE = '#f9c63e'; // yellow-gold coin tiles

/**
 * ₿ composited from primitives: a bold serif "B" + the four protruding stem
 * bars. resvg's system-font lookup has no glyph for U+20BF (it renders tofu),
 * so we never emit the raw character. (x, baselineY) anchor the B; `fs` is the
 * font size; bar geometry scales with it.
 */
function btcGlyph(x, baselineY, fs, fill) {
  const capTop = baselineY - fs * 0.7;
  const barW = fs * 0.08;
  const barH = fs * 0.16;
  const off = [-fs * 0.18, fs * 0.08]; // bar x-offsets across the cap width
  const bars = off
    .map(
      (o) =>
        `<rect x="${(x + o).toFixed(1)}" y="${(capTop - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>` +
        `<rect x="${(x + o).toFixed(1)}" y="${baselineY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>`,
    )
    .join('');
  return `${bars}<text x="${x}" y="${baselineY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" font-weight="bold" fill="${fill}">B</text>`;
}

// Tile helper — rounded square centred on (x,y).
const tile = (x, y, size, rx, fill, op) =>
  `<rect x="${(x - size / 2).toFixed(1)}" y="${(y - size / 2).toFixed(1)}" width="${size}" height="${size}" rx="${rx}" fill="${fill}" fill-opacity="${op}"/>`;

// Ring 1 — the 8 lattice neighbours (axes + diagonals), even spacing; axes a
// touch brighter than diagonals for the varied-brightness texture.
const R1 = 92;
const ring1 = [];
for (let gx = -1; gx <= 1; gx++) {
  for (let gy = -1; gy <= 1; gy++) {
    if (gx === 0 && gy === 0) continue;
    const axis = gx === 0 || gy === 0;
    ring1.push(tile(cx + gx * R1, cy + gy * R1, 30, 5, NODE, axis ? 0.95 : 0.7));
  }
}
// Ring 2 — 4 dimmer outposts straight out the axes, inside the circle-safe zone.
const R2 = 156;
const ring2 = [
  [R2, 0], [-R2, 0], [0, R2], [0, -R2],
].map(([dx, dy]) => tile(cx + dx, cy + dy, 20, 3.5, NODE, 0.5));

// Lattice hints — faint brass row/column lines tying the tiles into a grid
// (the Grid's orthogonal answer to the Graph avatar's spokes).
const seg = (x1, y1, x2, y2, w, op) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS}" stroke-width="${w}" stroke-opacity="${op}"/>`;
const lattice = [
  // axis spokes: core → ring1 → ring2
  seg(cx + 24, cy, cx + R2 - 12, cy, 2, 0.42),
  seg(cx - 24, cy, cx - R2 + 12, cy, 2, 0.42),
  seg(cx, cy + 24, cx, cy + R2 - 12, 2, 0.42),
  seg(cx, cy - 24, cx, cy - R2 + 12, 2, 0.42),
  // ring-1 square outline (through the 8 tiles' centres)
  seg(cx - R1, cy - R1, cx + R1, cy - R1, 1.4, 0.22),
  seg(cx + R1, cy - R1, cx + R1, cy + R1, 1.4, 0.22),
  seg(cx + R1, cy + R1, cx - R1, cy + R1, 1.4, 0.22),
  seg(cx - R1, cy + R1, cx - R1, cy - R1, 1.4, 0.22),
].join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="58%">
      <stop offset="0%" stop-color="${SATOSHI}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${SATOSHI}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="200" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="188" fill="none" stroke="${BRASS}" stroke-opacity="0.4" stroke-width="3"/>
  ${lattice}
  ${ring1.join('')}${ring2.join('')}
  <!-- orange ₿ genesis tile: soft halo → tile → glyph → brass ring -->
  <circle cx="${cx}" cy="${cy}" r="46" fill="${SATOSHI}" fill-opacity="0.14"/>
  <rect x="${cx - 24}" y="${cy - 24}" width="48" height="48" rx="7" fill="${SATOSHI}"/>
  ${btcGlyph(cx, cy + 13, 38, BG)}
  <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="${BRASS}" stroke-opacity="0.65" stroke-width="2.2"/>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: S },
  font: { loadSystemFonts: true },
  background: BG,
}).render().asPng();

const out = join(root, 'x-avatar.png');
writeFileSync(out, png);
console.log(`[gen-x-avatar] wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${S}x${S})`);
