/**
 * HeroVisual (Grid) — the view-specific inner art for the Grid landing,
 * dropped into the shared <HeroFrame/>: a coin-tile lattice expanding from a
 * gold ₿ core.
 *
 * The frame (rings, notches, cogs, size, position) lives in HeroFrame and is
 * identical to Graph's. Only this inner art differs — Grid = tiles, Graph =
 * network. Each tile is one coin's fixed cell; ~a fifth are "occupied" (gold),
 * the rest are the brass lattice. Tiles breathe on staggered, non-radial timers
 * (negative delays) so the lattice is alive from the first frame — no cascade.
 *
 * Tile geometry is a deterministic integer lattice (no RNG / no transcendental
 * functions in selection — only Math.sqrt, which is IEEE-correctly-rounded), so
 * SSR + client render byte-identical and never mismatch on hydration.
 */
import { HeroFrame } from './HeroFrame';

const CENTER = 220; // matches HeroFrame SIZE/2
const STEP = 21; // lattice spacing
const TILE = 15; // tile edge
const INNER_R = 152; // clip radius (inside the inner ring), matches Graph's graph radius
const CORE_RESERVE = 30; // clear zone for the ₿ core

type Tile = { x: number; y: number; gold: boolean; dur: number; delay: number };

function buildTiles(): Tile[] {
  const tiles: Tile[] = [];
  const span = Math.ceil(INNER_R / STEP);
  for (let gx = -span; gx <= span; gx++) {
    for (let gy = -span; gy <= span; gy++) {
      const x = CENTER + gx * STEP;
      const y = CENTER + gy * STEP;
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > INNER_R || dist < CORE_RESERVE) continue;
      const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0; // deterministic integer hash
      const dur = 7 + (h % 3);
      // Negative, hash-scattered start offset: every tile is already mid-cycle at
      // load (no startup cascade) and phases are non-radial (no outward wave).
      const delay = -(((h >>> 5) % 100) / 100) * dur;
      tiles.push({ x, y, gold: h % 100 < 20, dur, delay });
    }
  }
  return tiles;
}

const TILES = buildTiles();

export function HeroVisual() {
  return (
    <HeroFrame ariaLabel="Timechain Grid: a brass-framed lattice of Bitcoin coins — every coin one fixed tile, gold tiles occupied, the brass grid expanding ring by ring from a gold ₿ at Satoshi's genesis center.">
      {/* Coin tiles — brass lattice + gold occupied cells, brightness sweeping outward by ring. */}
      <g>
        {TILES.map((t, i) => (
          <rect
            key={i}
            x={t.x - TILE / 2}
            y={t.y - TILE / 2}
            width={TILE}
            height={TILE}
            rx={2.5}
            fill={t.gold ? 'rgba(232, 192, 40, 0.9)' : 'rgba(194, 136, 64, 0.5)'}
            style={{
              animation: `tile-sweep ${t.dur}s ease-in-out ${t.delay.toFixed(2)}s infinite`,
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />
        ))}
      </g>

      {/* ₿ core — gold genesis tile with a breathing glow, the lattice's origin. */}
      <circle cx={CENTER} cy={CENTER} r={26} fill="url(#satoshi-glow-outer)" />
      <circle cx={CENTER} cy={CENTER} r={18} fill="url(#satoshi-glow)" />
      <rect
        x={CENTER - 14}
        y={CENTER - 14}
        width={28}
        height={28}
        rx={4}
        fill="#FFD700"
        style={{ animation: 'pulse-satoshi 3.2s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
      />
      <text
        x={CENTER}
        y={CENTER + 8}
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={22}
        fontWeight="bold"
        fill="#08080C"
      >
        ₿
      </text>
    </HeroFrame>
  );
}
