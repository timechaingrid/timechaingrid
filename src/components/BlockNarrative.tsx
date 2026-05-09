'use client';

import { useEffect, useState } from 'react';
import { useTimegridStore } from '@/store/timegridStore';
import {
  fetchBlockSnapshot,
  type BlockSnapshot,
} from '@/data/blockSnapshots';
import { ROLE_CSS } from '@/lib/role-visuals';
import { FIXTURE_SUBSTRATE } from '@/data/substrate';

/**
 * BlockNarrative — HUD card overlaid on the grid that displays the
 * snapshot of the current block. Fetches the per-block JSON at
 * `/blocks/...` whenever currentBlock changes, then renders a small
 * brass-panel card with the block's "story":
 *
 *   BLOCK 042
 *   ▸ Mined by Satoshi
 *   ▸ +50 BTC opened (cumulative: 2,150 BTC)
 *
 * The fetch is async; while the snapshot is being loaded the card
 * shows a thin loading state. If the fetch fails (no snapshots
 * available — e.g., user navigated to /grid without running
 * `vault:generate`), the card hides itself rather than complaining
 * loudly.
 *
 * This is the user-facing instantiation of the block-by-block
 * snapshot architecture: each per-block JSON literally drives the
 * narrative card on top of the lattice. As the scrubber advances
 * during Narrate-mode playback, the card updates in lockstep.
 */

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * GENESIS_MS — Bitcoin's genesis block was mined ~2009-01-03 18:15:05 UTC.
 * BLOCK_TIME_MIN — protocol target of one block per 10 minutes.
 *
 * approximateChainDate(height) returns a YYYY-MM-DD by linear extrapolation
 * from genesis. Off by hours-to-days for any specific block due to
 * difficulty-adjustment variance, but accurate enough for the "roughly
 * when in chain history are we" framing the HUD wants. Matches the
 * dateApproxAt helper in chain-tools/lib/chain.mjs by construction.
 */
const GENESIS_MS = Date.UTC(2009, 0, 3, 18, 15, 0);
const BLOCK_TIME_MIN = 10;

function approximateChainDate(height: number): string {
  if (height <= 0) return '2009-01-03';
  const ms = GENESIS_MS + height * BLOCK_TIME_MIN * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function minterLabel(snapshot: BlockSnapshot): {
  label: string;
  color: string;
} {
  // Prefer the role carried in the v2 snapshot (real-substrate
  // walker output). Fall back to the FIXTURE_SUBSTRATE lookup for
  // v1 snapshots and any unknown roles. Either path yields a
  // role-colored label so the HUD is visually consistent across
  // the entire scrubber range.
  const snapshotRole = snapshot.minterRole;
  const fixtureRole = FIXTURE_SUBSTRATE.walletByAddress(snapshot.minter)?.role;
  const role = (snapshotRole ?? fixtureRole) as keyof typeof ROLE_CSS | undefined;
  const isSatoshi =
    role === 'satoshi' ||
    snapshot.minter === '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  if (isSatoshi) {
    return { label: 'Satoshi', color: ROLE_CSS.satoshi };
  }
  if (role && role in ROLE_CSS) {
    return { label: shortAddress(snapshot.minter), color: ROLE_CSS[role] };
  }
  return { label: shortAddress(snapshot.minter), color: 'var(--color-text-muted)' };
}

export function BlockNarrative() {
  const currentBlock = useTimegridStore((s) => s.currentBlock);
  const latestBlock = useTimegridStore((s) => s.latestBlock);
  const [snapshot, setSnapshot] = useState<BlockSnapshot | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (latestBlock === 0) return;
    let cancelled = false;
    void fetchBlockSnapshot(currentBlock).then((s) => {
      if (cancelled) return;
      setSnapshot(s);
      // Once we know snapshots are reachable, lock that in so a
      // single late 404 doesn't toggle the card out from under the
      // user. If the very first fetch returns null we treat the
      // whole feature as unavailable and stay hidden.
      if (s) setAvailable(true);
      else if (available === null) setAvailable(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentBlock, latestBlock, available]);

  if (available === false) return null;
  if (!snapshot) return null;

  const minter = minterLabel(snapshot);
  const isHalving = snapshot.halving;

  return (
    <div
      className="brass-panel pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 rounded-full px-4 py-1.5 text-mono text-[11px]"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className="tracking-[0.22em] uppercase"
        style={{ color: 'var(--color-brass-bright)' }}
      >
        Blk {snapshot.block.toLocaleString()}
      </span>
      <span className="text-[color:var(--color-text-faint)] tabular-nums">
        ≈ {approximateChainDate(snapshot.block)}
      </span>
      <span
        aria-hidden
        className="inline-block h-1 w-1 shrink-0 rounded-full"
        style={{ background: minter.color, boxShadow: `0 0 6px ${minter.color}` }}
      />
      <span style={{ color: minter.color }}>{minter.label}</span>
      <span className="text-[color:var(--color-text-muted)]">
        +{Math.floor(snapshot.subsidy)} BTC ·{' '}
        {Math.floor(snapshot.cumulativeSupplyBtc).toLocaleString()} total
      </span>
      {isHalving && (
        <span
          className="text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--color-amber)' }}
        >
          ⚡ halving
        </span>
      )}
    </div>
  );
}
