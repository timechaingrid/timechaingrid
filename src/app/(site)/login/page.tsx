import type { Metadata } from 'next';
import Link from 'next/link';
import { UnderDevelopment } from '@/components/UnderDevelopment';
import { API_DOMAIN } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign-in is for the developer API only. The public viewer is privacy-first and requires no account.',
};

/**
 * /login — explicit "no auth on the viewer" surface.
 *
 * The architectural pivot in the master plan put OAuth on the
 * `api.*` subdomain, not on the viewer itself, so the viewer
 * stays observably-private (no Google/GitHub redirects, no third-
 * party scripts). This route exists to gracefully redirect users
 * who type /login expecting an account flow — explains the split
 * and points them at the API surface where auth WILL ship in
 * Phase D.
 */
export default function LoginPage() {
  return (
    <div className="py-12 md:py-16">
      <p className="text-mono text-base uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
        Identity · split-surface
      </p>
      <h1 className="text-display mt-3 text-4xl font-semibold leading-[1.05] md:text-6xl">
        No login on
        <br />
        <span className="brass-shimmer">the viewer.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[color:var(--color-text-secondary)] md:text-xl">
        Bitcoin&apos;s ledger is public, and so is this view of it. The
        public viewer is privacy-first by design — no Google, no GitHub,
        no third-party redirects, no analytics. You can verify in your
        browser&apos;s DevTools Network tab during a full session.
      </p>

      <div className="mt-10">
        <UnderDevelopment
          targetVersion="v0.4"
          title="Developer auth"
          description={`Sign-in lives on the developer API at ${API_DOMAIN}, not here. OAuth (Google + GitHub) gates API-key issuance for developers who want a dashboard and lifted rate limits — the viewer itself stays auth-free, forever.`}
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="brass-panel rounded-lg p-6">
          <p className="text-mono text-base uppercase tracking-[0.22em] text-[color:var(--color-accent)]">
            Public viewer
          </p>
          <p className="text-display mt-2 text-2xl font-semibold">
            timechaingrid.com
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            Everything visible. No auth. No payment. Privacy verifiable
            via the Network tab. This is where you are now.
          </p>
          <ul className="mt-4 space-y-2 text-mono text-xs">
            <li>
              <Link
                href="/grid"
                className="text-[color:var(--color-accent)] hover:underline"
              >
                → /grid (the lattice)
              </Link>
            </li>
            <li>
              <Link
                href="/donate"
                className="text-[color:var(--color-accent)] hover:underline"
              >
                → /donate (free for all, donation-funded)
              </Link>
            </li>
          </ul>
        </div>
        <div className="brass-panel rounded-lg p-6" style={{ opacity: 0.85 }}>
          <p className="text-mono text-base uppercase tracking-[0.22em] text-[color:var(--color-amber)]">
            Developer API · v0.4
          </p>
          <p className="text-display mt-2 text-2xl font-semibold">
            {API_DOMAIN}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            Google + GitHub OAuth, API-key dashboard, per-key rate
            limits, donation-supported. Free for everyone — sign-in is
            just for issuing keys, not a paywall.
          </p>
          <ul className="mt-4 space-y-2 text-mono text-xs">
            <li>
              <Link
                href="/api"
                className="text-[color:var(--color-amber)] hover:underline"
              >
                → /api (planned endpoints)
              </Link>
            </li>
            <li>
              <Link
                href="/docs"
                className="text-[color:var(--color-amber)] hover:underline"
              >
                → /docs (OpenAPI spec)
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
