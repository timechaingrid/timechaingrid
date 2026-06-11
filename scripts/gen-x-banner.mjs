/**
 * gen-x-banner.mjs — build a 1500×500 X / Twitter header → x-banner.png (repo root).
 *
 * Privacy-clean: rendered locally with resvg, system fonts only. NOT deployed.
 *
 * The right-side emblem is a STATIC SNAPSHOT of the live landing-page hero —
 * the shared brass frame + corner cogs (HeroFrame) wrapped around the Grid's
 * coin-tile lattice with its gold ₿ core (HeroVisual). The tile lattice is
 * regenerated here with the SAME deterministic integer-hash rule the site uses
 * (src/components/HeroVisual.tsx::buildTiles), so banner and site can't drift.
 *
 * Text layout mirrors the Graph banner (operator-approved): centered hero text
 * block on the left, grey domain in the free lower-middle — clear of X's
 * bottom-left avatar overlap.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const W = 1500;
const H = 500;
const BG = '#08080c';
const GOLD = '#ffd700';
const BRASS = '#c28840';
const AMBER = '#f5a623'; // hero text colour
const GREY = '#8b8b94';

const BRAND = 'Timechain Grid';
const SUB = 'Bitcoin Visualised';
const DOMAIN = 'timechaingrid.com';

/**
 * ₿ composited from primitives: a bold serif "B" + the four protruding stem
 * bars. resvg's system-font lookup has no glyph for U+20BF (it rendered tofu),
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

// --- hero emblem (ported static from HeroFrame + Grid HeroVisual) --------
const SIZE = 440;
const C = SIZE / 2;
const OUTER = 200;
const INNER = 192;
const NOTCHES = [0, 45, 90, 135, 180, 225, 270, 315];
function gearPath(cx, cy, oR, iR, teeth) {
  const step = (Math.PI * 2) / (teeth * 2);
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? oR : iR;
    const a = i * step;
    d += `${i === 0 ? 'M' : 'L'} ${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  return d + 'Z';
}
const notchEls = NOTCHES.map((deg, i) => {
  const rad = (deg * Math.PI) / 180;
  return `<line x1="${(C + Math.cos(rad) * (INNER + 2)).toFixed(1)}" y1="${(C + Math.sin(rad) * (INNER + 2)).toFixed(1)}" x2="${(C + Math.cos(rad) * (OUTER + 4)).toFixed(1)}" y2="${(C + Math.sin(rad) * (OUTER + 4)).toFixed(1)}" stroke="rgba(224,166,86,0.85)" stroke-width="${i % 2 === 0 ? 1.8 : 1.0}"/>`;
}).join('');
const rivetEls = Array.from({ length: 36 }, (_, i) => {
  const rad = (i * 10 * Math.PI) / 180;
  const r = (OUTER + INNER) / 2;
  return `<circle cx="${(C + Math.cos(rad) * r).toFixed(1)}" cy="${(C + Math.sin(rad) * r).toFixed(1)}" r="1" fill="rgba(255,215,0,0.5)"/>`;
}).join('');
const gear1 = `<path d="${gearPath(54, 54, 32, 25, 12)}" fill="url(#gear-fill)" stroke="url(#hero-brass-grad)" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="54" cy="54" r="17" fill="none" stroke="rgba(224,166,86,0.55)" stroke-width="1.4"/>
  <circle cx="54" cy="54" r="12" fill="none" stroke="rgba(194,136,64,0.55)" stroke-width="1"/>
  ${[0, 90, 180, 270].map((deg) => { const r = (deg * Math.PI) / 180; return `<line x1="${(54 + Math.cos(r) * 5).toFixed(1)}" y1="${(54 + Math.sin(r) * 5).toFixed(1)}" x2="${(54 + Math.cos(r) * 16).toFixed(1)}" y2="${(54 + Math.sin(r) * 16).toFixed(1)}" stroke="rgba(194,136,64,0.55)" stroke-width="1.2" stroke-linecap="round"/>`; }).join('')}
  <circle cx="54" cy="54" r="5" fill="rgba(140,95,40,0.85)"/><circle cx="53" cy="53" r="1.6" fill="rgba(255,235,150,0.7)"/>`;
const g2 = SIZE - 58;
const gear2 = `<path d="${gearPath(g2, g2, 26, 20, 10)}" fill="url(#gear-fill)" stroke="url(#hero-brass-grad)" stroke-width="2.0" stroke-linejoin="round"/>
  <circle cx="${g2}" cy="${g2}" r="14" fill="none" stroke="rgba(224,166,86,0.55)" stroke-width="1.3"/>
  <circle cx="${g2}" cy="${g2}" r="9" fill="none" stroke="rgba(194,136,64,0.5)" stroke-width="1"/>
  <circle cx="${g2}" cy="${g2}" r="4" fill="rgba(140,95,40,0.85)"/><circle cx="${g2 - 1}" cy="${g2 - 1}" r="1.3" fill="rgba(255,235,150,0.7)"/>`;

// Coin-tile lattice — SAME deterministic rule as HeroVisual.buildTiles().
const STEP = 21;
const TILE = 15;
const INNER_R = 152;
const CORE_RESERVE = 30;
const span = Math.ceil(INNER_R / STEP);
let tileEls = '';
for (let gx = -span; gx <= span; gx++) {
  for (let gy = -span; gy <= span; gy++) {
    const x = C + gx * STEP;
    const y = C + gy * STEP;
    const dist = Math.hypot(x - C, y - C);
    if (dist > INNER_R || dist < CORE_RESERVE) continue;
    const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
    const gold = h % 100 < 20;
    tileEls += `<rect x="${(x - TILE / 2).toFixed(1)}" y="${(y - TILE / 2).toFixed(1)}" width="${TILE}" height="${TILE}" rx="2.5" fill="${gold ? 'rgba(232,192,40,0.9)' : 'rgba(194,136,64,0.5)'}"/>`;
  }
}

const heroInner = `
  <circle cx="${C}" cy="${C}" r="195" fill="url(#hero-bg-glow)"/>
  <circle cx="${C}" cy="${C}" r="${OUTER}" fill="none" stroke="url(#hero-brass-grad)" stroke-width="1.5" stroke-dasharray="3 6" opacity="0.7"/>
  ${notchEls}
  <circle cx="${C}" cy="${C}" r="${INNER}" fill="none" stroke="url(#brass-grad-vertical)" stroke-width="0.8" opacity="0.6"/>
  ${rivetEls}${gear1}${gear2}
  ${tileEls}
  <circle cx="${C}" cy="${C}" r="26" fill="url(#satoshi-glow-outer)"/>
  <circle cx="${C}" cy="${C}" r="18" fill="url(#satoshi-glow)"/>
  <rect x="${C - 14}" y="${C - 14}" width="28" height="28" rx="4" fill="${GOLD}"/>
  ${btcGlyph(C, C + 8, 22, BG)}`;

// place the emblem on the right (same spot as the Graph banner)
const SC = 0.96;
const tx = 1248 - C * SC;
const ty = 250 - C * SC;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="hero-bg-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,215,0,0.10)"/><stop offset="40%" stop-color="rgba(194,136,64,0.05)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
    <radialGradient id="satoshi-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,215,0,0.62)"/><stop offset="60%" stop-color="rgba(255,215,0,0.16)"/><stop offset="100%" stop-color="rgba(255,215,0,0)"/></radialGradient>
    <radialGradient id="satoshi-glow-outer" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,215,0,0.16)"/><stop offset="100%" stop-color="rgba(255,215,0,0)"/></radialGradient>
    <linearGradient id="brass-grad-vertical" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#E0A656"/><stop offset="50%" stop-color="#C28840"/><stop offset="100%" stop-color="#8C5E29"/></linearGradient>
    <linearGradient id="hero-brass-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#D89A4E"/><stop offset="35%" stop-color="#E8C028"/><stop offset="58%" stop-color="#D88E1C"/><stop offset="80%" stop-color="#E8C028"/><stop offset="100%" stop-color="#D89A4E"/></linearGradient>
    <radialGradient id="gear-fill" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(140,95,40,0.38)"/><stop offset="65%" stop-color="rgba(194,136,64,0.16)"/><stop offset="100%" stop-color="rgba(224,166,86,0.04)"/></radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe680"/><stop offset="100%" stop-color="${GOLD}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="20" fill="none" stroke="${BRASS}" stroke-opacity="0.34" stroke-width="1.5"/>
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${SC})">${heroInner}</g>
  <text x="96" y="226" font-family="Georgia, 'Times New Roman', serif" font-size="100" font-weight="700" fill="url(#title)">${BRAND}</text>
  <text x="100" y="298" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-style="italic" fill="${AMBER}">${SUB}</text>
  <text x="690" y="400" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="28" letter-spacing="2" fill="${GREY}">${DOMAIN}</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
  background: BG,
}).render().asPng();

const out = join(root, 'x-banner.png');
writeFileSync(out, png);
console.log(`[gen-x-banner] wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H})`);
