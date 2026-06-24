import type { Metadata } from 'next';
import Link from 'next/link';

const ABOUT_DESCRIPTION = 'Why Timechain Grid exists, what motivates the project, who it is for, and how it stays privacy-first.';

export const metadata: Metadata = {
  title: 'About',
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: 'About · Timechain Grid',
    description: ABOUT_DESCRIPTION,
    images: [{ url: '/og2.png', width: 1200, height: 630, alt: 'Timechain Grid' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About · Timechain Grid',
    description: ABOUT_DESCRIPTION,
    images: ['/og2.png'],
  },
};

export default function AboutPage() {
  return (
    <div className="py-12 md:py-16">
      <p className="text-mono text-base uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
        Background
      </p>
      <h1 className="text-display mt-3 text-4xl font-semibold leading-[1.05] md:text-6xl">
        Bitcoin is a
        <br />
        <span className="brass-shimmer">civilization.</span>
      </h1>

      <div className="mt-10 space-y-6 text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg">
        <p>
          Bitcoin&apos;s blockchain is the largest publicly observed
          economic civilization in history. Every coin is a piece of
          digital real estate. Every block opens new tiles. Every
          block is a tick of a global clock that has not stopped since
          3 January 2009.
        </p>
        <p>
          Timechain Grid renders Bitcoin as that real estate. Coins
          fill a 2D lattice expanding outward from Satoshi at the
          origin. Tiles are colored by their owner. Hover to inspect;
          tap to see a player&apos;s full territory light up. Open
          the{' '}
          <Link href="/grid" className="text-[color:var(--color-accent)] underline-offset-4 hover:underline">
            grid
          </Link>{' '}
          and watch the map grow.
        </p>
        <p>
          The data flows from Bitcoin&apos;s own peer-to-peer protocol
          into a self-hosted bitcoind + electrs pair. Extraction is
          offline. Snapshots ship from a CDN we control. The viewer
          touches no third-party at runtime — verifiable in DevTools.
        </p>
        <p>
          The project is built on the open Bitcoin protocol. There is
          no coin. There is no token. There is no funding round. If
          you find it useful, you can{' '}
          <Link
            href="/donate"
            className="text-[color:var(--color-amber)] underline-offset-4 hover:underline"
          >
            support the work
          </Link>
          . If you don&apos;t, it is still free.
        </p>
      </div>

      <section className="mt-16 border-t border-[color:var(--color-card-border)] pt-10">
        <h2 className="text-display text-2xl font-semibold">Lineage</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[color:var(--color-text-secondary)]">
          Spun out as a standalone project in April 2026. The
          rendering primitives, type contracts, and theme tokens
          live entirely inside this repository — no cross-repo
          dependencies, no proprietary toolchains. Just open source
          on the open Bitcoin protocol.
        </p>
      </section>

      <section className="mt-12 border-t border-[color:var(--color-card-border)] pt-10">
        <h2 className="text-display text-2xl font-semibold">Who it is for</h2>
        <ul className="mt-4 space-y-3 text-base leading-relaxed text-[color:var(--color-text-secondary)]">
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Bitcoiners</strong>{' '}
            — visualize the network you already trust, find the wallets you
            already follow, watch halvings flash by.
          </li>
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Researchers</strong>{' '}
            — query the lattice via the API, run Prolog over the fact base,
            export structured data.
          </li>
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Educators</strong>{' '}
            — show students Bitcoin&apos;s monetary history as a single
            scrubbable surface.
          </li>
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Privacy advocates</strong>{' '}
            — verify that the public viewer makes zero third-party
            requests, end of session.
          </li>
        </ul>
      </section>

      <p className="mt-12 max-w-2xl text-sm leading-relaxed text-[color:var(--color-text-muted)]">
        New to Bitcoin, or have questions about the data and privacy model?{' '}
        <Link
          href="/faq"
          className="text-[color:var(--color-gold)] underline-offset-4 hover:underline"
        >
          See the FAQ
        </Link>
        .
      </p>
    </div>
  );
}
