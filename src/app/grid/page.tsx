import type { Metadata } from 'next';
import { CoinGridView } from '@/components/views/CoinGridView';
import { WalletInspector } from '@/components/WalletInspector';
import { BlockStats } from '@/components/BlockStats';
import { Scrubber } from '@/components/Scrubber';
import { Playback } from '@/components/Playback';
import { PlayerLeaderboard } from '@/components/PlayerLeaderboard';
import { BlockNarrative } from '@/components/BlockNarrative';

export const metadata: Metadata = {
  title: 'Grid view',
  description:
    "Bitcoin's digital real estate. Every coin a tile, every block opens new tiles. Pan, zoom, hover, click. timechaingrid.com.",
};

/**
 * /grid — kiosk-mode page. Per user feedback 2026-04-30, the HUDs
 * are slimmed and consolidated to leave the canvas as much room as
 * possible:
 *
 *   - Left sidebar (lg+ only): BlockStats, WalletInspector,
 *     PlayerLeaderboard stacked, scrollable, ~280px wide.
 *   - Top-center: BlockNarrative card, compact storyteller.
 *   - Bottom strip: a single thin brass-pill containing Play,
 *     speed selector, scrubber, and tip-block readout.
 *
 * Background docs and project narrative live on /about. Tap a
 * coin = pin its wallet (no subgrid drill-in anymore).
 */
export default function GridHome() {
  return (
    <div className="relative h-full w-full">
      {/* Lattice — fills the entire kiosk area underneath all overlays. */}
      <div className="absolute inset-0">
        <CoinGridView />
      </div>

      {/* Top-center storyteller card. */}
      <BlockNarrative />

      {/* Left sidebar — block stats + inspector + leaderboard.
          Hidden on screens narrower than lg (1024px) so mobile/
          tablet keeps the lattice unobstructed; on lg+ it sits
          between top:3 and bottom:14 with internal scroll if the
          stack overflows. */}
      <div className="pointer-events-none absolute top-3 bottom-14 left-3 z-10 hidden w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto pr-1 lg:flex">
        <div className="pointer-events-auto">
          <BlockStats />
        </div>
        <div className="pointer-events-auto">
          <WalletInspector />
        </div>
        <div className="pointer-events-auto">
          <PlayerLeaderboard />
        </div>
      </div>

      {/* Bottom strip: thin brass pill with all playback controls. */}
      <div className="pointer-events-none absolute right-0 bottom-3 left-0 z-10 flex justify-center px-3">
        <div
          className="brass-panel pointer-events-auto flex w-full max-w-[820px] items-center gap-3 rounded-full px-3 py-1.5"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Playback />
          <div
            aria-hidden
            className="h-4 w-px shrink-0 bg-[color:var(--color-card-border)]"
          />
          <div className="flex-1">
            <Scrubber />
          </div>
        </div>
      </div>
    </div>
  );
}
