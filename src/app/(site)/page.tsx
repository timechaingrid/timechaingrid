import Link from 'next/link';
import { HeroVisual } from '@/components/HeroVisual';
import { HalvingTimeline } from '@/components/HalvingTimeline';
import {
  VIEW_HERO_TOP,
  VIEW_HERO_BOTTOM,
  VIEW_HERO_DESCRIPTION,
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
      <div className="flex flex-col gap-8 self-start">
        <h1
          className="text-display hero-gradient text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl lg:text-[5.5rem]"
          style={{ animation: 'drift-up 0.7s ease-out 0.15s both' }}
        >
          {VIEW_HERO_TOP}
          <br />
          {VIEW_HERO_BOTTOM}
        </h1>
        <p
          className="max-w-xl text-pretty text-base leading-relaxed text-[rgba(244,246,250,0.82)] md:text-lg"
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
            className="rounded-full px-7 py-3.5 text-mono text-base font-semibold uppercase tracking-[0.2em] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(255,215,0,0.5)]"
            style={{ background: 'var(--color-accent)', color: 'var(--color-background)' }}
          >
            Open the grid ⟶
          </Link>
          <span className="flex items-center gap-2 whitespace-nowrap text-mono text-base uppercase tracking-[0.24em] text-[rgba(244,246,250,0.58)]">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--color-accent)',
                boxShadow: '0 0 6px var(--color-accent)',
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
        <HeroVisual />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Mission() {
  return (
    <section className="border-t border-[color:var(--color-card-border)] py-10 md:py-12">
      <p className="text-display text-xl leading-snug text-[color:var(--color-text-secondary)] md:text-2xl md:leading-snug">
        Bitcoin&apos;s issuance is{' '}
        <span className="text-[color:var(--color-text-primary)]">final</span>
        . Twenty-one million coins, no more, no less.
        Timechain Grid makes the map observable to anyone with a
        browser — and{' '}
        <span className="text-[color:var(--color-gold)]">observable to no one but you</span>
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
            <p className="text-mono text-base uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
              {p.label}
            </p>
            <p className="mt-5 leading-relaxed text-[rgba(244,246,250,0.72)]">
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
      <p className="text-mono text-base uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
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
          <p className="text-mono text-base uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
            Ready
          </p>
          <h2 className="text-display mt-3 text-3xl font-semibold leading-tight md:text-4xl">
            Open the grid. Watch it grow.
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-[rgba(244,246,250,0.72)]">
            Genesis to today, block by block. Pan, zoom, hover. Click
            any tile to see its owner&apos;s territory.
          </p>
        </div>
        <Link
          href="/grid"
          className="rounded-full border px-7 py-3.5 text-mono text-base uppercase tracking-[0.2em] transition-colors hover:opacity-90"
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
