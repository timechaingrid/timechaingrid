'use client';

import { useTimegridStore } from '@/store/timegridStore';

/**
 * HalvingTimeline — visual ribbon of Bitcoin's halving events.
 *
 * Six waypoints from genesis to the projected fifth halving. Each marker
 * is a clickable button: tapping a marker scrubs the lattice to that
 * block via `useTimegridStore.setCurrentBlock`. The current block in
 * the store is highlighted (brighter dot, brass ring).
 */

const HALVINGS: Array<{
  height: number;
  year: string;
  reward: string;
  label: string;
}> = [
  { height: 0,        year: '2009',  reward: '50 BTC',     label: 'Genesis' },
  { height: 210000,   year: '2012',  reward: '25 BTC',     label: 'First halving' },
  { height: 420000,   year: '2016',  reward: '12.5 BTC',   label: 'Second halving' },
  { height: 630000,   year: '2020',  reward: '6.25 BTC',   label: 'Third halving' },
  { height: 840000,   year: '2024',  reward: '3.125 BTC',  label: 'Fourth halving' },
  { height: 1050000,  year: '~2028', reward: '1.5625 BTC', label: 'Fifth halving' },
];

export function HalvingTimeline() {
  const currentBlock = useTimegridStore((s) => s.currentBlock);
  const latestBlock = useTimegridStore((s) => s.latestBlock);
  const setCurrentBlock = useTimegridStore((s) => s.setCurrentBlock);
  const setPlaybackPlaying = useTimegridStore((s) => s.setPlaybackPlaying);

  return (
    <div className="brass-panel rounded-lg p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-mono text-[10px] uppercase tracking-[0.32em] text-[color:var(--color-brass-bright)]">
          Halving epochs
        </span>
        <span className="text-mono text-[10px] tracking-[0.18em] text-[color:var(--color-text-muted)]">
          genesis → projected
        </span>
      </div>

      {/* Connector — gradient base + soft gold haze on the middle span */}
      <div className="relative mt-10">
        <div
          aria-hidden
          className="absolute left-0 right-0 top-1.5 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--color-brass-deep) 8%, var(--color-brass) 50%, var(--color-brass-deep) 92%, transparent 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute left-0 right-0 top-1 h-[3px]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, transparent 10%, rgba(255, 215, 0, 0.12) 50%, transparent 90%, transparent 100%)',
            filter: 'blur(3px)',
          }}
        />

        <div className="relative grid grid-cols-6 gap-2 md:gap-4">
          {HALVINGS.map((h, i) => (
            <Marker
              key={h.height}
              halving={h}
              index={i}
              isLast={i === HALVINGS.length - 1}
              isActive={isActiveHalving(currentBlock, h.height, HALVINGS, i)}
              disabled={latestBlock > 0 && h.height > latestBlock}
              onSelect={() => {
                setPlaybackPlaying(false);
                setCurrentBlock(h.height);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Highlight the marker corresponding to the current epoch:
 *   active = the highest halving whose height ≤ currentBlock
 */
function isActiveHalving(
  currentBlock: number,
  height: number,
  all: typeof HALVINGS,
  index: number,
): boolean {
  // The active marker is the latest halving at or below currentBlock.
  // For index i, it's active iff: height[i] ≤ currentBlock AND
  // (i is last OR height[i+1] > currentBlock).
  const next = all[index + 1];
  return height <= currentBlock && (!next || next.height > currentBlock);
}

function Marker({
  halving,
  index,
  isLast,
  isActive,
  disabled,
  onSelect,
}: {
  halving: (typeof HALVINGS)[number];
  index: number;
  isLast: boolean;
  isActive: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const isGenesis = index === 0;
  const baseColor = isGenesis
    ? 'var(--color-gold)'
    : isLast
      ? 'var(--color-accent-cyan-dim)'
      : 'var(--color-brass)';
  const dotColor = isActive ? 'var(--color-amber)' : baseColor;
  const labelColor = isLast
    ? 'var(--color-accent-cyan-dim)'
    : isActive
      ? 'var(--color-text-primary)'
      : 'var(--color-text-secondary)';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-label={`Scrub to ${halving.label} (block ${halving.height.toLocaleString()})`}
      aria-pressed={isActive}
      className="group relative flex flex-col items-center gap-2 rounded text-center transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
    >
      {/* Slow amber halo behind the active dot */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-1/2 top-0 block h-7 w-7 -translate-x-1/2 -translate-y-2 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(245, 166, 35, 0.45) 0%, rgba(245, 166, 35, 0.10) 50%, transparent 75%)',
            animation: 'pulse-soft 2.4s ease-in-out infinite',
          }}
        />
      )}
      <span
        className="relative z-10 block h-3 w-3 rounded-full transition-transform group-hover:scale-125"
        style={{
          background: dotColor,
          boxShadow: `0 0 ${isActive ? 18 : 10}px ${dotColor}`,
          opacity: isLast && !isActive ? 0.55 : 1,
        }}
      />
      <span
        className="mt-1 text-mono text-xs font-medium tracking-wider transition-colors md:text-sm"
        style={{ color: labelColor }}
      >
        {halving.year}
      </span>
      <span className="text-mono text-[10px] tracking-wider text-[color:var(--color-text-muted)] md:text-xs">
        {halving.reward}
      </span>
      <span
        className="hidden text-mono text-[9px] uppercase tracking-[0.2em] md:block"
        style={{ color: isActive ? 'var(--color-brass-bright)' : 'var(--color-text-faint)' }}
      >
        {halving.label}
      </span>
    </button>
  );
}
