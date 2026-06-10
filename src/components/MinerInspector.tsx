'use client';

import { useTimegridStore } from '@/store/timegridStore';
import { getLoadedCoinSubstrate, SATOSHI_CLUSTER_KEY } from '@/data/coinSubstrate';

/**
 * MinerInspector — the click-to-focus panel for the Grid, mirroring the Graph's
 * WalletInspector. When a tile is clicked, its miner (coinbase recipient) is
 * focused: its empire lights up on the canvas and this panel shows the pool's
 * lifetime stats — blocks mined, rank, share of the chain, coins (tiles) minted,
 * and the span of blocks it was active across (with real dates).
 *
 * Reads `selectedWallet` (the focused miner's address) from the store and pulls
 * stats from the loaded coin substrate. Renders nothing when nothing is focused.
 */

function shortAddr(a: string): string {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-7)}` : a;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function fmtDate(unix: number | undefined): string {
  return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : '—';
}

export function MinerInspector() {
  const selected = useTimegridStore((s) => s.selectedWallet);
  const setSelected = useTimegridStore((s) => s.setSelectedWallet);
  const latestBlock = useTimegridStore((s) => s.latestBlock);

  if (!selected) return null;
  const sub = getLoadedCoinSubstrate();
  const stats = sub?.minerStats(selected);
  if (!sub || !stats) return null;

  const isCluster = selected === SATOSHI_CLUSTER_KEY;
  const sharePct = latestBlock > 0 ? (stats.blocks / (latestBlock + 1)) * 100 : 0;
  const label = isCluster
    ? 'Satoshi · cluster'
    : stats.isSatoshi
      ? 'Satoshi · genesis'
      : stats.isMajor
        ? 'Major pool'
        : 'Miner';

  return (
    <div className="brass-panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm ring-1 ring-white/20"
            style={{ backgroundColor: hex(stats.color) }}
            aria-hidden
          />
          <span className="text-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-brass-bright)]">
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          aria-label="Release focus"
          className="text-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)] transition-colors hover:text-[color:var(--color-amber)]"
        >
          ✕ release
        </button>
      </div>

      <p className="text-mono mt-3 break-all text-xs text-[color:var(--color-text-primary)]">
        {isCluster ? '~22,000 early wallets · estimate' : shortAddr(stats.address)}
      </p>
      {isCluster && (
        <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--color-text-muted)]">
          Early single-address era grouped as one entity (Patoshi-pattern estimate, not
          ground truth).
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-mono text-xs">
        <Field
          label="Blocks mined"
          value={`${stats.blocks.toLocaleString()}`}
          sub={`rank #${(stats.rank + 1).toLocaleString()} of ${sub.minerCount.toLocaleString()}`}
        />
        <Field label="Share of chain" value={`${sharePct.toFixed(sharePct < 1 ? 3 : 2)}%`} />
        <Field
          label="Coins minted"
          value={`${stats.coins.toLocaleString()} BTC`}
          sub="1 tile = 1 BTC issued"
        />
        <Field
          label="Active"
          value={`${stats.firstBlock.toLocaleString()} → ${stats.lastBlock.toLocaleString()}`}
          sub={`${fmtDate(sub.blockTime(stats.firstBlock))} → ${fmtDate(sub.blockTime(stats.lastBlock))}`}
        />
      </dl>
    </div>
  );
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-[color:var(--color-text-primary)]">{value}</dd>
      {sub && <dd className="text-[10px] text-[color:var(--color-text-muted)]">{sub}</dd>}
    </div>
  );
}
