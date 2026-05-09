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
 * Landing page — single-purpose: explain the "Bitcoin as digital
 * real estate" narrative and send the visitor to /grid as fast as
 * possible. Sister-callouts live exclusively in the NavBar's "View
 * as Graph" button per user directive 2026-04-30.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <RealEstatePillars />
      <Timeline />
      <FinalCTA />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="grid gap-10 py-14 md:grid-cols-[1.1fr_1fr] md:gap-14 md:py-20">
      <div className="flex flex-col justify-center gap-7">
        <p
          className="text-mono text-xs uppercase tracking-[0.32em] text-[color:var(--color-accent-cyan)]"
          style={{ animation: 'drift-up 0.7s ease-out 0.05s both' }}
        >
          {BRAND_TAGLINE}
        </p>
        <h1
          className="text-display text-5xl font-semibold leading-[1.05] md:text-7xl"
          style={{ animation: 'drift-up 0.7s ease-out 0.15s both' }}
        >
          {VIEW_HERO_TOP}
          <br />
          <span className="brass-shimmer">{VIEW_HERO_BOTTOM}</span>
        </h1>
        <p
          className="max-w-xl text-lg leading-relaxed text-[color:var(--color-text-secondary)] md:text-xl"
          style={{ animation: 'drift-up 0.7s ease-out 0.25s both' }}
        >
          {VIEW_HERO_DESCRIPTION}
        </p>
        <div
          className="flex flex-wrap items-center gap-3"
          style={{ animation: 'drift-up 0.7s ease-out 0.35s both' }}
        >
          <Link
            href="/grid"
            className="brass-panel rounded-full px-6 py-3 text-mono text-sm uppercase tracking-[0.18em] transition-colors hover:border-[color:var(--color-amber)]"
            style={{ color: 'var(--color-amber)' }}
          >
            Open the grid ⟶
          </Link>
          <span className="flex items-center gap-2 text-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
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
 * HeroEmblem — large decorative version of the Logo with a faint
 * background grid suggesting the expanding lattice. Static SVG, no
 * runtime JS or external assets.
 */
function HeroEmblem() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Faint background grid — suggests the infinite plane the lattice
          lives on. Pure CSS background. */}
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
      {/* Soft brass glow behind the logo */}
      <div
        aria-hidden
        className="absolute inset-[15%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(193, 136, 64, 0.18) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(20px)',
        }}
      />
      <Logo size={280} accent="brass" label="Timechain Grid emblem" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function RealEstatePillars() {
  const pillars = [
    {
      label: 'A tile per coin',
      tone: 'gold',
      body:
        'Every BTC ever mined occupies one cell of the lattice. Block 0 opens the first 50 cells around Satoshi. Block 1 opens 50 more, swirling outward.',
    },
    {
      label: 'Forever stationary',
      tone: 'cyan',
      body:
        "A coin's tile never moves. Once minted, its real-estate coordinate is fixed for the rest of chain history. Bookmark a tile, come back any time.",
    },
    {
      label: 'Players occupy',
      tone: 'amber',
      body:
        'Wallets are players; coins are property. Hover a tile to see who owns it. Tap to see their full territory light up across the map.',
    },
    {
      label: 'Genesis to today',
      tone: 'cyan',
      body:
        'Press play and watch the map grow. Block by block, the lattice expands, halvings flash by, the modern map emerges from the genesis kernel.',
    },
  ] as const;

  const TONE_COLOR: Record<'cyan' | 'amber' | 'gold', string> = {
    cyan: 'var(--color-accent-cyan)',
    amber: 'var(--color-amber)',
    gold: 'var(--color-gold)',
  };

  return (
    <section className="border-t border-[color:var(--color-card-border)] py-14 md:py-16">
      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-card-border)] md:grid-cols-2">
        {pillars.map((p) => (
          <div
            key={p.label}
            className="bg-[color:var(--color-background)] p-7 md:p-9"
          >
            <p
              className="text-mono text-xs uppercase tracking-[0.24em]"
              style={{ color: TONE_COLOR[p.tone] }}
            >
              {p.label}
            </p>
            <p className="mt-4 leading-relaxed text-[color:var(--color-text-secondary)]">
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
    <section className="border-t border-[color:var(--color-card-border)] py-14 md:py-16">
      <p className="text-mono text-xs uppercase tracking-[0.32em] text-[color:var(--color-accent-cyan)]">
        Halving epochs
      </p>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg">
        Click any halving to scrub the map to that moment in chain
        history. Each halving cuts the new-tile rate in half — 50, 25,
        12.5, 6.25, 3.125 BTC per block — so the grid grows in
        slowing waves.
      </p>
      <div className="mt-8">
        <HalvingTimeline />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="border-t border-[color:var(--color-card-border)] py-16 md:py-20">
      <div className="brass-panel flex flex-col items-start justify-between gap-6 rounded-xl p-8 md:flex-row md:items-center md:gap-10 md:p-10">
        <div className="flex-1">
          <p className="text-mono text-xs uppercase tracking-[0.28em] text-[color:var(--color-accent-cyan)]">
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
          className="rounded-full border px-7 py-3 text-mono text-sm uppercase tracking-[0.18em] transition-colors hover:opacity-90"
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
