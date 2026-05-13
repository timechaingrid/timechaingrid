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
    <section className="grid items-center gap-12 py-16 md:grid-cols-[1.1fr_1fr] md:gap-16 md:py-24 lg:gap-20 lg:py-28">
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
 * HeroEmblem — large decorative version of the Logo with a faint
 * background grid suggesting the expanding lattice. Static SVG, no
 * runtime JS or external assets.
 */
function HeroEmblem() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
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
      <div
        aria-hidden
        className="absolute inset-[15%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(193, 136, 64, 0.18) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(20px)',
        }}
      />
      <Logo size={280} label="Timechain Grid emblem" />
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
      tone: 'gold',
      body:
        'Every BTC ever mined occupies one cell. Block 0 opens the first 50 cells around Satoshi. Each block after opens more, swirling outward.',
    },
    {
      label: 'Forever stationary',
      tone: 'cyan',
      body:
        "A coin's tile never moves. Once minted, its coordinate is fixed for the rest of chain history. Bookmark a tile; come back any time.",
    },
    {
      label: 'Players occupy',
      tone: 'amber',
      body:
        'Wallets are players, coins are property. Hover a tile to see who owns it. Tap to light up their full territory across the map.',
    },
    {
      label: 'Genesis to today',
      tone: 'cyan',
      body:
        'Press play. The lattice expands block by block, halvings flash by, the modern map emerges from the genesis kernel.',
    },
  ] as const;

  const TONE_COLOR: Record<'cyan' | 'amber' | 'gold', string> = {
    cyan: 'var(--color-accent-cyan)',
    amber: 'var(--color-amber)',
    gold: 'var(--color-gold)',
  };

  return (
    <section className="border-t border-[color:var(--color-card-border)] py-14 md:py-20">
      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-card-border)] md:grid-cols-2">
        {pillars.map((p) => (
          <div
            key={p.label}
            className="bg-[color:var(--color-background)] p-7 md:p-9"
          >
            <p
              className="text-mono text-[10px] uppercase tracking-[0.28em]"
              style={{ color: TONE_COLOR[p.tone] }}
            >
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
