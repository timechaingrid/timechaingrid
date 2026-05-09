import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Donate',
  description:
    'Support Timechain Grid development. Lightning, GitHub Sponsors, OpenSats, BTCPay — donations only, no paid tiers.',
};

/**
 * /donate — donation funding flow.
 *
 * Per user directive 2026-05-01, this page lays out the full
 * donation hierarchy with explicit status indicators (live, planned,
 * post-launch) so visitors know what works today vs what's on the
 * runway. The viewer itself stays free for everyone, KYC-free,
 * forever. Donations cover infra costs (operator's bitcoind +
 * electrs + R2 storage + Cloudflare bandwidth) and developer time.
 *
 * Hierarchy:
 *   1. Lightning  — primary, BTC over Lightning, KYC-free, instant
 *   2. GitHub Sponsors  — recurring fiat, settled by GitHub
 *   3. BTCPay Server  — self-hosted, privacy-first donate widget
 *   4. OpenSats  — non-profit Bitcoin grant program
 *   5. On-chain BTC  — last resort, higher fee, address-rotating
 */

interface Channel {
  rank: number;
  title: string;
  body: string;
  cta: string | null;
  status: 'live' | 'planned' | 'post-launch';
  accent: 'amber' | 'cyan' | 'gold' | 'brass';
  why: string;
}

const CHANNELS: Channel[] = [
  {
    rank: 1,
    title: 'Lightning',
    accent: 'amber',
    body: 'Bitcoin over Lightning Network — instant settlement, sub-cent fees, no KYC. Send to the operator-hosted Lightning address from any LN-compatible wallet (Wallet of Satoshi, Phoenix, Strike, Alby, …).',
    cta: 'donate@timechaingrid.com',
    status: 'planned',
    why: "Recommended path. Aligns with the project's privacy posture — KYC-free for both donor and recipient. Smallest fees and fastest settlement of any rail.",
  },
  {
    rank: 2,
    title: 'GitHub Sponsors',
    accent: 'cyan',
    body: 'Recurring or one-off, settled in fiat by GitHub. Public sponsor profile shows your support next to the repo (opt-out available).',
    cta: null,
    status: 'planned',
    why: 'Best for recurring monthly support. GitHub handles fiat conversion + tax forms; the project never touches the dollars.',
  },
  {
    rank: 3,
    title: 'BTCPay Server',
    accent: 'brass',
    body: 'Self-hosted "donate any amount" widget. The operator runs a private BTCPay instance, generating a fresh on-chain or Lightning invoice per donation — no third-party processor in the path.',
    cta: null,
    status: 'planned',
    why: 'Privacy-first alternative for donors who want a hosted-page experience without trusting a payment processor.',
  },
  {
    rank: 4,
    title: 'OpenSats',
    accent: 'gold',
    body: 'Independent 501(c)(3) non-profit funding free and open-source Bitcoin software. The project will apply for a long-term-support grant once v0.2 ships with real-data ingest.',
    cta: 'opensats.org/apply',
    status: 'post-launch',
    why: 'OpenSats grants cover developer time at sustainable rates. Donors who give to OpenSats directly can earmark for Timechain Grid once the grant lands.',
  },
  {
    rank: 5,
    title: 'On-chain BTC',
    accent: 'cyan',
    body: 'Direct BTC transfer to a published mainnet address. Higher fees than Lightning, but works offline and from any cold wallet. New address per donation request to preserve donor privacy.',
    cta: null,
    status: 'planned',
    why: 'For larger donations where on-chain confirmation is preferred, or for cold-storage donors. Address rotates per request — email to receive a fresh one.',
  },
];

const TONE_COLOR: Record<Channel['accent'], string> = {
  amber: 'var(--color-amber)',
  cyan: 'var(--color-accent-cyan)',
  gold: 'var(--color-gold)',
  brass: 'var(--color-brass-bright)',
};

const STATUS_BG: Record<Channel['status'], string> = {
  live: 'rgba(34, 197, 94, 0.14)',
  planned: 'rgba(245, 166, 35, 0.14)',
  'post-launch': 'rgba(140, 95, 40, 0.14)',
};

const STATUS_FG: Record<Channel['status'], string> = {
  live: '#22c55e',
  planned: 'var(--color-amber)',
  'post-launch': 'var(--color-text-muted)',
};

const STATUS_LABEL: Record<Channel['status'], string> = {
  live: 'live',
  planned: 'planned · v0.1',
  'post-launch': 'post-launch',
};

export default function DonatePage() {
  return (
    <div className="py-12 md:py-16">
      <p className="text-mono text-xs uppercase tracking-[0.32em] text-[color:var(--color-amber)]">
        Support · optional
      </p>
      <h1 className="text-display mt-3 text-4xl font-semibold leading-[1.05] md:text-6xl">
        If it&apos;s useful,
        <br />
        <span className="brass-shimmer">keep it going.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[color:var(--color-text-secondary)] md:text-xl">
        Timechain Grid is free for everyone — viewer, API, all data
        resolution tiers. No paywall, no sign-up. The project runs on
        donations and OpenSats grants. Lightning is preferred because
        it keeps support KYC-free; cards are not accepted to keep the
        privacy posture clean.
      </p>

      <div className="mt-12 space-y-4">
        {CHANNELS.map((channel) => (
          <div
            key={channel.title}
            className="brass-panel relative rounded-xl p-6 transition-colors hover:border-[color:var(--color-amber)] md:p-7"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-baseline md:justify-between">
              <div className="flex items-baseline gap-4">
                <span
                  aria-hidden
                  className="text-mono text-[10px] tabular-nums tracking-[0.2em] text-[color:var(--color-text-faint)]"
                >
                  {String(channel.rank).padStart(2, '0')}
                </span>
                <h2
                  className="text-display text-2xl font-semibold"
                  style={{ color: TONE_COLOR[channel.accent] }}
                >
                  {channel.title}
                </h2>
              </div>
              <span
                className="text-mono w-fit rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: STATUS_BG[channel.status],
                  color: STATUS_FG[channel.status],
                }}
              >
                {STATUS_LABEL[channel.status]}
              </span>
            </div>

            <p className="mt-4 max-w-3xl leading-relaxed text-[color:var(--color-text-secondary)]">
              {channel.body}
            </p>

            {channel.cta && (
              <p className="mt-3 text-mono text-sm">
                <span className="text-[color:var(--color-text-muted)]">→ </span>
                <code
                  className="rounded px-2 py-0.5"
                  style={{
                    backgroundColor: 'rgba(193, 136, 64, 0.08)',
                    color: TONE_COLOR[channel.accent],
                  }}
                >
                  {channel.cta}
                </code>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]">
                  {channel.status === 'live' ? '(live)' : '(coming v0.1)'}
                </span>
              </p>
            )}

            <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-text-faint)]">
              <span className="text-[color:var(--color-text-muted)]">Why: </span>
              {channel.why}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-16 border-t border-[color:var(--color-card-border)] pt-10">
        <h2 className="text-display text-2xl font-semibold">
          What donations cover
        </h2>
        <ul className="mt-4 grid gap-3 text-base leading-relaxed text-[color:var(--color-text-secondary)] md:grid-cols-2">
          <li className="flex gap-3">
            <span className="text-mono text-[color:var(--color-brass-bright)]">▸</span>
            <span>
              <strong className="text-[color:var(--color-text-primary)]">Operator infra</strong>{' '}
              — Hetzner dedicated box for bitcoind + electrs (~€80/mo),
              Cloudflare R2 storage for parquet snapshots, Cloudflare
              Pages bandwidth.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-mono text-[color:var(--color-brass-bright)]">▸</span>
            <span>
              <strong className="text-[color:var(--color-text-primary)]">Domain & SSL</strong>{' '}
              — annual renewals for the timechaingrid.com domain.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-mono text-[color:var(--color-brass-bright)]">▸</span>
            <span>
              <strong className="text-[color:var(--color-text-primary)]">Developer time</strong>{' '}
              — building toward v0.2 (real-data ingest), v0.3 (subgrid
              fractional ownership), v0.4 (developer API).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-mono text-[color:var(--color-brass-bright)]">▸</span>
            <span>
              <strong className="text-[color:var(--color-text-primary)]">Audits & polish</strong>{' '}
              — Lighthouse perf passes, accessibility audits, browser
              compatibility testing, bug bounties as the surface grows.
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-12 border-t border-[color:var(--color-card-border)] pt-10">
        <h2 className="text-display text-2xl font-semibold">
          Verification & transparency
        </h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[color:var(--color-text-secondary)]">
          Once channels go live, donation totals will be published at{' '}
          <code className="text-mono text-[color:var(--color-text-primary)]">
            /status
          </code>{' '}
          alongside infra costs — on-chain Lightning addresses are
          publicly auditable. Donors who&apos;d like a public
          acknowledgement can opt in to a leaderboard at the same URL;
          opt-out is the default to preserve donor privacy.
        </p>
        <Link
          href="/status"
          className="mt-5 inline-block text-mono text-xs uppercase tracking-wider text-[color:var(--color-accent-cyan)] hover:underline"
        >
          → see the status page
        </Link>
      </section>
    </div>
  );
}
