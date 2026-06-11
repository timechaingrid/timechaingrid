/**
 * gen-og-image.mjs — build a 1200×630 Open Graph share card → public/og.png.
 *
 * Privacy-clean: rendered locally at build time with resvg (no external fonts,
 * no third-party image service). Uses system fonts (Georgia display + monospace)
 * the same way the site does. Run from prebuild + the deploy script.
 *
 * The motif is the operator-approved Grid brand mark (same language as the X
 * avatar/banner): an orange ₿ genesis tile ringed by evenly spaced yellow-gold
 * coin tiles on the lattice — placed lower-right, fully clear of the hero text
 * block. The ₿ is composited from primitives (bold serif B + stem bars) because
 * resvg's system fonts have no U+20BF glyph.
 *
 * Brand values are Grid's; the Graph sibling ships its own version (crown
 * network motif). Keep the two in their respective repos.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BRAND = 'Timechain Grid';
const SUB = 'of Bitcoin.';
const TAGLINE = 'Bitcoin Visualised · Open Source · Public';
const DOMAIN = 'timechaingrid.com';

const W = 1200;
const H = 630;
const BG = '#08080c';
const GOLD = '#ffd700';
const BRASS = '#c28840';
const FAINT = '#6b6b73';
const SATOSHI = '#f0731a'; // deep Bitcoin-orange genesis tile
const NODE = '#f9c63e'; // yellow-gold coin tiles

/** ₿ composited from primitives — see header note. */
function btcGlyph(x, baselineY, fs, fill) {
  const capTop = baselineY - fs * 0.7;
  const barW = fs * 0.08;
  const barH = fs * 0.16;
  const off = [-fs * 0.18, fs * 0.08];
  const bars = off
    .map(
      (o) =>
        `<rect x="${(x + o).toFixed(1)}" y="${(capTop - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>` +
        `<rect x="${(x + o).toFixed(1)}" y="${baselineY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>`,
    )
    .join('');
  return `${bars}<text x="${x}" y="${baselineY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" font-weight="bold" fill="${fill}">B</text>`;
}

// Brand-mark motif — lower-right, clear of the text column.
const mx = 1020;
const my = 398;
const tileRect = (x, y, size, rx, fill, op) =>
  `<rect x="${(x - size / 2).toFixed(1)}" y="${(y - size / 2).toFixed(1)}" width="${size}" height="${size}" rx="${rx}" fill="${fill}" fill-opacity="${op}"/>`;
const seg = (x1, y1, x2, y2, w, op) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS}" stroke-width="${w}" stroke-opacity="${op}"/>`;

const R1 = 84;
const R2 = 142;
let motif = '';
// lattice hints: axis spokes + ring-1 square outline
motif += seg(mx + 24, my, mx + R2 - 11, my, 2, 0.42);
motif += seg(mx - 24, my, mx - R2 + 11, my, 2, 0.42);
motif += seg(mx, my + 24, mx, my + R2 - 11, 2, 0.42);
motif += seg(mx, my - 24, mx, my - R2 + 11, 2, 0.42);
motif += seg(mx - R1, my - R1, mx + R1, my - R1, 1.4, 0.22);
motif += seg(mx + R1, my - R1, mx + R1, my + R1, 1.4, 0.22);
motif += seg(mx + R1, my + R1, mx - R1, my + R1, 1.4, 0.22);
motif += seg(mx - R1, my + R1, mx - R1, my - R1, 1.4, 0.22);
// ring 1: 8 lattice neighbours; axes brighter than diagonals
for (let gx = -1; gx <= 1; gx++) {
  for (let gy = -1; gy <= 1; gy++) {
    if (gx === 0 && gy === 0) continue;
    const axis = gx === 0 || gy === 0;
    motif += tileRect(mx + gx * R1, my + gy * R1, 26, 4, NODE, axis ? 0.95 : 0.7);
  }
}
// ring 2: 4 dimmer outposts on the axes
for (const [dx, dy] of [[R2, 0], [-R2, 0], [0, R2], [0, -R2]]) {
  motif += tileRect(mx + dx, my + dy, 18, 3, NODE, 0.5);
}
// orange ₿ genesis tile: halo → tile → glyph → brass ring
motif += `<circle cx="${mx}" cy="${my}" r="44" fill="${SATOSHI}" fill-opacity="0.14"/>`;
motif += tileRect(mx, my, 44, 6, SATOSHI, 1);
motif += btcGlyph(mx, my + 12, 34, BG);
motif += `<circle cx="${mx}" cy="${my}" r="39" fill="none" stroke="${BRASS}" stroke-opacity="0.65" stroke-width="2.2"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="84%" cy="62%" r="48%">
      <stop offset="0%" stop-color="${SATOSHI}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${SATOSHI}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe680"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="${BRASS}" stroke-opacity="0.34" stroke-width="1.5"/>
  ${motif}
  <text x="84" y="246" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="url(#title)">${BRAND}</text>
  <text x="84" y="350" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="#a1a1aa">${SUB}</text>
  <text x="88" y="430" font-family="ui-monospace, Menlo, monospace" font-size="27" letter-spacing="1.5" fill="${FAINT}">${TAGLINE}</text>
  <text x="88" y="510" font-family="ui-monospace, Menlo, monospace" font-size="26" letter-spacing="2" fill="${GOLD}">${DOMAIN}</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
  background: BG,
}).render().asPng();

const out = join(root, 'public', 'og.png');
writeFileSync(out, png);
console.log(`[gen-og-image] wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H})`);
