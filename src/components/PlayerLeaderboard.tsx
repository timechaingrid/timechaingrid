'use client';

import { useMemo } from 'react';
import { useTimegridStore } from '@/store/timegridStore';
import { FIXTURE_SUBSTRATE } from '@/data/substrate';
import { ROLE_CSS, ROLE_LABEL } from '@/lib/role-visuals';

/**
 * PlayerLeaderboard — ranks wallets by their current coin holdings.
 *
 * In the user's "tangible real estate, occupied by players" framing,
 * this is the social-media-app face of the app: who owns the most
 * tiles? Click a row → pin that wallet (territory lights up cyan on
 * the canvas) and open the inspector. The leaderboard turns the
 * abstract `wallets` array into a competitive object.
 *
 * v0.1 invariant: ownerAddress === minterAddress (no transfers tracked
 * yet), so this is effectively a miner leaderboard. v0.2+, after the
 * multi-input pipeline updates ownership per spend, the same component
 * surfaces actual holders rather than just lifetime minters.
 *
 * Ranking is precomputed once via useMemo over all wallets. At the
 * 50-wallet fixture this is trivial; at v0.2+'s 500k-wallet scale a
 * server-side or substrate-precomputed ranking would replace this
 * client-side reduce.
 */

const VISIBLE_ROWS = 8;

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function PlayerLeaderboard() {
  const setSelectedWallet = useTimegridStore((s) => s.setSelectedWallet);
  const setActiveDockPanel = useTimegridStore((s) => s.setActiveDockPanel);
  const selectedWallet = useTimegridStore((s) => s.selectedWallet);

  // Pre-rank all wallets by coin count. Per user directive
  // 2026-04-30 ("we will not look at wallets that own less than
  // 1BTC for starters"), wallets owning <1 cell (1 cell = 1 BTC)
  // are filtered out — the leaderboard only ever shows real-estate
  // holders. Ties broken by totalReceivedSats then address
  // lexicographic order for determinism.
  const ranked = useMemo(() => {
    const rows = FIXTURE_SUBSTRATE.wallets
      .map((w) => ({
        wallet: w,
        coinCount: FIXTURE_SUBSTRATE.coinsOwnedBy(w.address).length,
      }))
      .filter((r) => r.coinCount >= 1);
    rows.sort((a, b) => {
      if (b.coinCount !== a.coinCount) return b.coinCount - a.coinCount;
      const sats = b.wallet.totalReceivedSats - a.wallet.totalReceivedSats;
      if (sats !== 0n) return sats > 0n ? 1 : -1;
      return a.wallet.address.localeCompare(b.wallet.address);
    });
    return rows;
  }, []);

  const visible = ranked.slice(0, VISIBLE_ROWS);
  const remaining = Math.max(0, ranked.length - VISIBLE_ROWS);

  if (visible.length === 0) {
    return (
      <div className="brass-panel rounded-lg p-5">
        <p className="text-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
          Top players
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
          No coin holdings yet. The leaderboard activates as soon as any
          wallet has received a coinbase output.
        </p>
      </div>
    );
  }

  return (
    <div className="brass-panel rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-brass-bright)]">
          Top players
        </span>
        <span className="text-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
          by coins held
        </span>
      </div>

      <ol className="mt-4 space-y-1.5">
        {visible.map((row, i) => {
          const isPinned = selectedWallet === row.wallet.address;
          return (
            <li key={row.wallet.address}>
              <button
                type="button"
                onClick={() => {
                  setSelectedWallet(row.wallet.address);
                  setActiveDockPanel('wallet-inspector');
                }}
                aria-label={`Rank ${i + 1}: ${shortAddress(row.wallet.address)} owns ${row.coinCount} coins. Click to highlight their territory.`}
                aria-pressed={isPinned}
                className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--color-card-border)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent-cyan)]"
                style={
                  isPinned
                    ? { background: 'rgba(0, 212, 255, 0.08)' }
                    : undefined
                }
              >
                <span
                  className="text-mono w-5 shrink-0 text-right text-[10px] tabular-nums text-[color:var(--color-text-muted)]"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: ROLE_CSS[row.wallet.role],
                    boxShadow: `0 0 6px ${ROLE_CSS[row.wallet.role]}`,
                  }}
                />
                <span
                  className="text-mono flex-1 truncate text-xs text-[color:var(--color-text-primary)] group-hover:text-[color:var(--color-accent-cyan)]"
                  title={row.wallet.address}
                >
                  {shortAddress(row.wallet.address)}
                </span>
                <span className="text-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
                  {ROLE_LABEL[row.wallet.role]}
                </span>
                <span className="text-mono w-14 shrink-0 text-right text-xs tabular-nums text-[color:var(--color-amber)]">
                  {row.coinCount.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {remaining > 0 && (
        <p className="mt-3 text-mono text-[10px] text-[color:var(--color-text-muted)]">
          + {remaining} more player{remaining === 1 ? '' : 's'} not shown
        </p>
      )}

      <p className="mt-4 text-mono text-[10px] leading-relaxed text-[color:var(--color-text-faint)]">
        Click a row to highlight that player&apos;s territory on the grid.
      </p>
    </div>
  );
}
