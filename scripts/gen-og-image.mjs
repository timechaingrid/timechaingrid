/**
 * gen-og-image.mjs — build a 1200×630 Open Graph share card → public/og.png.
 *
 * Privacy-clean: rendered locally at build time with resvg (no external fonts,
 * no third-party image service). Uses system fonts (Georgia display + monospace)
 * the same way the site does. Run from prebuild + the deploy script.
 *
 * Brand values are Grid's; the Graph sibling ships its own version (network
 * motif instead of this tile lattice). Keep the two in their respective repos.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BRAND = 'Timechain Grid';
const SUB = 'of Bitcoin.';
const TAGLINE = "Bitcoin's digital real estate · privacy-first";
const DOMAIN = 'timechaingrid.com';

const W = 1200;
const H = 630;
const BG = '#08080c';
const GOLD = '#ffd700';
const BRASS = '#c28840';
const MUTED = '#a1a1aa';
const FAINT = '#6b6b73';

// Tile-lattice motif in the lower-right — coins as tiles expanding from the
// Satoshi origin (the Grid's fixed-coordinate identity). Center tile is the
// bright, ringed origin; tiles fade outward.
const cx0 = 985;
const cy0 = 378;
const pitch = 30;
const tile = 19;
const N = 2; // 5×5
let tiles = '';
for (let i = -N; i <= N; i++) {
  for (let j = -N; j <= N; j++) {
    const x = (cx0 + i * pitch - tile / 2).toFixed(1);
    const y = (cy0 + j * pitch - tile / 2).toFixed(1);
    const d = Math.max(Math.abs(i), Math.abs(j));
    const op = d === 0 ? 1 : Math.max(0.18, 0.72 - d * 0.16);
    const fill = d === 0 ? GOLD : BRASS;
    tiles += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="3" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
  }
}
const originRing = `<rect x="${cx0 - tile / 2 - 5}" y="${cy0 - tile / 2 - 5}" width="${tile + 10}" height="${tile + 10}" rx="5" fill="none" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="1.5"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="78%" cy="36%" r="55%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe680"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="${BRASS}" stroke-opacity="0.34" stroke-width="1.5"/>
  ${tiles}${originRing}
  <text x="84" y="246" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="url(#title)">${BRAND}</text>
  <text x="84" y="350" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="${MUTED}">${SUB}</text>
  <text x="88" y="430" font-family="ui-monospace, Menlo, monospace" font-size="27" letter-spacing="1.5" fill="${FAINT}">${TAGLINE}</text>
  <text x="88" y="560" font-family="ui-monospace, Menlo, monospace" font-size="26" letter-spacing="2" fill="${GOLD}">${DOMAIN}</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
  background: BG,
}).render().asPng();

const out = join(root, 'public', 'og.png');
writeFileSync(out, png);
console.log(`[gen-og-image] wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H})`);
