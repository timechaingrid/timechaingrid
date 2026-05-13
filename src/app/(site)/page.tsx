import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { HalvingTimeline } from '@/components/HalvingTimeline';
import {
  VIEW_HERO_TOP,
  VIEW_HERO_BOTTOM,
  VIEW_HERO_DESCRIPTION,
  BRAND_TAGLINE,
} from '@/lib/site-config';

/**
 * Landing page — narrative-first shell.
 *
 * Hero states the vision (Bitcoin as a finite issuance map). A short
 * mission strip names why this exists. Four pillars expand on the
 * real-estate metaphor. A halving timeline anchors the playback
 * scrubber. A final CTA pushes the visitor into /grid.
 *
 * The cross-view link to the Graph project lives only in the NavBar
 * topbar button — no duplicate card on this page.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Mission />
      <RealEstatePillars />
      <Timeline />
      <FinalCTA />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="grid items-center gap-12 py-4 md:grid-cols-[1.1fr_1fr] md:gap-16 md:py-8 lg:gap-20 lg:py-10">
      <div className="flex flex-col gap-8">
        <p
          className="text-mono text-[11px] uppercase tracking-[0.36em] text-[color:var(--color-accent-cyan)]"
          style={{ animation: 'drift-up 0.7s ease-out 0.05s both' }}
        >
          {BRAND_TAGLINE}
        </p>
        <h1
          className="text-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl lg:text-[5.5rem]"
          style={{ animation: 'drift-up 0.7s ease-out 0.15s both' }}
        >
          {VIEW_HERO_TOP}
          <br />
          <span className="brass-shimmer">{VIEW_HERO_BOTTOM}</span>
        </h1>
        <p
          className="max-w-xl text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg"
          style={{ animation: 'drift-up 0.7s ease-out 0.25s both' }}
        >
          {VIEW_HERO_DESCRIPTION}
        </p>
        <div
          className="flex flex-wrap items-center gap-4 pt-2"
          style={{ animation: 'drift-up 0.7s ease-out 0.35s both' }}
        >
          <Link
            href="/grid"
            className="brass-panel rounded-full px-7 py-3.5 text-mono text-xs uppercase tracking-[0.2em] transition-all hover:border-[color:var(--color-amber)] hover:shadow-[0_0_24px_rgba(0,212,255,0.18)]"
            style={{ color: 'var(--color-amber)' }}
          >
            Open the grid ⟶
          </Link>
          <span className="flex items-center gap-2 text-mono text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-text-muted)]">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--color-accent-cyan)',
                boxShadow: '0 0 6px var(--color-accent-cyan)',
              }}
            />
            open source · no sign-up · no tracking
          </span>
        </div>
      </div>

      <div
        className="relative flex aspect-square items-center justify-center"
        style={{ animation: 'drift-up 0.9s ease-out 0.4s both' }}
      >
        <HeroEmblem />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

/**
 * HeroEmblem — large decorative version of the Logo with concentric
 * brass rings, halving notches, and animated brass glow. Pure SVG +
 * CSS, no runtime JS or external assets.
 */
function HeroEmblem() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Faint background grid — the infinite plane the lattice lives on. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-3xl"
        style={{
          backgroundImage:
            'linear-gradient(rgba(193, 136, 64, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(193, 136, 64, 0.07) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(circle at center, #000 50%, transparent 90%)',
          WebkitMaskImage:
            'radial-gradient(circle at center, #000 50%, transparent 90%)',
        }}
      />

      {/* Soft brass glow halo — diffuse and slow. */}
      <div
        aria-hidden
        className="absolute inset-[10%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 215, 0, 0.16) 0%, rgba(193, 136, 64, 0.08) 40%, rgba(0,0,0,0) 70%)',
          filter: 'blur(28px)',
          animation: 'pulse-soft 7s ease-in-out infinite',
        }}
      />

      {/* Concentric brass rings — outermost slowly rotates with halving
          notches; inner sits still as a steady frame. */}
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id="ringBrass" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(224, 166, 86, 0.55)" />
            <stop offset="50%" stopColor="rgba(194, 136, 64, 0.4)" />
            <stop offset="100%" stopColor="rgba(140, 95, 40, 0.55)" />
          </linearGradient>
        </defs>

        {/* Outer ring — rotates slowly, halving notches at compass quadrants */}
        <g className="gear-spin" style={{ transformOrigin: '200px 200px' }}>
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="none"
            stroke="url(#ringBrass)"
            strokeWidth="1.5"
            strokeDasharray="2 8"
            opacity="0.6"
          />
          {/* Halving notches */}
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              x1="200"
              y1="6"
              x2="200"
              y2="18"
              stroke="rgba(224, 166, 86, 0.7)"
              strokeWidth="2"
              transform={`rotate(${deg} 200 200)`}
            />
          ))}
        </g>

        {/* Inner ring — stationary, finer */}
        <circle
          cx="200"
          cy="200"
          r="170"
          fill="none"
          stroke="rgba(194, 136, 64, 0.25)"
          strokeWidth="1"
        />

        {/* Diagonal accent rivets between rings */}
        {[45, 135, 225, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const cx = 200 + Math.cos(rad) * 180;
          const cy = 200 + Math.sin(rad) * 180;
          return (
            <circle
              key={deg}
              cx={cx}
              cy={cy}
              r="2"
              fill="rgba(140, 95, 40, 0.7)"
            />
          );
        })}
      </svg>

      {/* The Logo itself — sits centered, gets a subtle Satoshi pulse */}
      <div style={{ animation: 'pulse-satoshi 4s ease-in-out infinite' }}>
        <Logo size={240} label="Timechain Grid emblem" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Mission() {
  return (
    <section className="border-t border-[color:var(--color-card-border)] py-10 md:py-12">
      <p className="text-display text-xl leading-snug text-[color:var(--color-text-secondary)] md:text-2xl md:leading-snug">
        Bitcoin&apos;s issuance is{' '}
        <span className="text-[color:var(--color-text-primary)]">final</span>.
        Twenty-one million coins, no more, no less. Timechain Grid is
        where you can see them all — each in its place, each in its
        time, all{' '}
        <span className="text-[color:var(--color-accent-cyan)]">observable to no one but you</span>
        .
      </p>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function RealEstatePillars() {
  const pillars = [
    {
      label: 'A tile per coin',
      body:
        'Every BTC ever mined occupies one cell. Block 0 opens the first 50 cells around Satoshi. Each block after opens more, swirling outward.',
    },
    {
      label: 'Forever stationary',
      body:
        "A coin's tile never moves. Once minted, its coordinate is fixed for the rest of chain history. Bookmark a tile; come back any time.",
    },
    {
      label: 'Players occupy',
      body:
        'Wallets are players, coins are property. Hover a tile to see who owns it. Tap to light up their full territory across the map.',
    },
    {
      label: 'Genesis to today',
      body:
        'Press play. The lattice expands block by block, halvings flash by, the modern map emerges from the genesis kernel.',
    },
  ];

  return (
    <section className="border-t border-[color:var(--color-card-border)] py-14 md:py-20">
      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-card-border)] md:grid-cols-2">
        {pillars.map((p) => (
          <div
            key={p.label}
            className="group relative bg-[color:var(--color-background)] p-7 transition-colors md:p-9 hover:bg-[color:var(--color-background-light)]"
          >
            <span
              aria-hidden
              className="absolute left-0 top-7 h-6 w-px bg-[color:var(--color-brass-bright)] opacity-0 transition-opacity duration-300 group-hover:opacity-60 md:top-9"
            />
            <p className="text-mono text-[10px] uppercase tracking-[0.32em] text-[color:var(--color-brass-bright)]">
              {p.label}
            </p>
            <p className="mt-5 leading-relaxed text-[color:var(--color-text-secondary)]">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Timeline() {
  return (
    <section className="border-t border-[color:var(--color-card-border)] py-14 md:py-20">
      <p className="text-mono text-[10px] uppercase tracking-[0.32em] text-[color:var(--color-accent-cyan)]">
        Halving epochs
      </p>
      <p className="text-display mt-4 max-w-3xl text-xl leading-snug text-[color:var(--color-text-secondary)] md:text-2xl md:leading-snug">
        Click any halving to scrub the map to that moment in chain
        history. Each halving cuts the new-tile rate in half — 50, 25,
        12.5, 6.25, 3.125 BTC per block — so the grid grows in slowing
        waves.
      </p>
      <div className="mt-10">
        <HalvingTimeline />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="border-t border-[color:var(--color-card-border)] py-16 md:py-24">
      <div className="brass-panel flex flex-col items-start justify-between gap-6 rounded-xl p-8 md:flex-row md:items-center md:gap-10 md:p-10">
        <div className="flex-1">
          <p className="text-mono text-[10px] uppercase tracking-[0.32em] text-[color:var(--color-accent-cyan)]">
            Ready
          </p>
          <h2 className="text-display mt-3 text-3xl font-semibold leading-tight md:text-4xl">
            Open the map. Watch it grow.
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-[color:var(--color-text-secondary)]">
            Genesis to today, block by block. Pan, zoom, hover. Click
            any tile to see its owner&apos;s territory.
          </p>
        </div>
        <Link
          href="/grid"
          className="rounded-full border px-7 py-3.5 text-mono text-xs uppercase tracking-[0.2em] transition-colors hover:opacity-90"
          style={{
            borderColor: 'var(--color-amber)',
            color: 'var(--color-amber)',
          }}
        >
          Open the grid ⟶
        </Link>
      </div>
    </section>
  );
}
