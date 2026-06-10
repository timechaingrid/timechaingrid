/**
 * gen-x-banner.mjs — build a 1500×500 X / Twitter header → x-banner.png (repo root).
 *
 * Privacy-clean: rendered locally with resvg, system fonts only (same pipeline as
 * gen-og-image.mjs). NOT part of the deployed site — it's a social asset to upload
 * to the project's X profile. Layout keeps all text clear of X's bottom-left avatar
 * overlap and the responsive bottom crop.
 *
 * Brand values are Grid's; the Graph sibling ships its own (network motif). Both
 * use the unified gold chrome.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BRAND = 'Timechain Grid';
const TAGLINE = "Bitcoin's digital real estate";
const SUBTAG = 'Bitcoin Visualised · privacy-first · no tracking · open source';
const DOMAIN = 'timechaingrid.com';

const W = 1500;
const H = 500;
const BG = '#08080c';
const GOLD = '#ffd700';
const BRASS = '#c28840';
const MUTED = '#d4d4dc';
const FAINT = '#7a7a83';

// Coin-grid motif on the right — a square (Ulam) spiral of tiles winding out from
// the origin, evoking "every coin a tile". Deterministic spiral walk; tiles fade
// outward so the centre reads as the genesis core.
function spiralCoord(n) {
  if (n === 0) return [0, 0];
  const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
  const inner = (2 * k - 1) * (2 * k - 1);
  const ringIdx = n - inner;
  const side = Math.floor(ringIdx / (2 * k));
  const step = ringIdx % (2 * k);
  if (side === 0) return [k, -k + 1 + step];
  if (side === 1) return [k - 1 - step, k];
  if (side === 2) return [-k, k - 1 - step];
  return [-k + 1 + step, -k];
}
const cx = 1190;
const cy = 250;
const CELL = 17; // px per tile
const GAP = 3;
const N = 121; // 11×11 footprint
const inner = CELL - GAP;
const tiles = Array.from({ length: N }, (_, n) => {
  const [gx, gy] = spiralCoord(n);
  const ring = Math.max(Math.abs(gx), Math.abs(gy));
  const op = Math.max(0.18, 1 - ring / 7); // fade outward
  const x = (cx + gx * CELL - inner / 2).toFixed(1);
  const y = (cy + gy * CELL - inner / 2).toFixed(1);
  // genesis tile = brass; the rest gold
  const fill = n === 0 ? BRASS : GOLD;
  return `<rect x="${x}" y="${y}" width="${inner}" height="${inner}" rx="2" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="79%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe680"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="20" fill="none" stroke="${BRASS}" stroke-opacity="0.34" stroke-width="1.5"/>
  ${tiles}
  <text x="96" y="215" font-family="Georgia, 'Times New Roman', serif" font-size="104" font-weight="700" fill="url(#title)">${BRAND}</text>
  <text x="100" y="285" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-style="italic" fill="${MUTED}">${TAGLINE}</text>
  <text x="102" y="338" font-family="ui-monospace, Menlo, monospace" font-size="22" letter-spacing="1.2" fill="${FAINT}">${SUBTAG}</text>
  <text x="1392" y="468" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="24" letter-spacing="2" fill="${GOLD}">${DOMAIN}</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
  background: BG,
}).render().asPng();

const out = join(root, 'x-banner.png');
writeFileSync(out, png);
console.log(`[gen-x-banner] wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H})`);
