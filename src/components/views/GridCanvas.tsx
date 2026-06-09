'use client';

/**
 * GridCanvas — client loader + HUD chrome for /grid.
 *
 * Loads the coin substrate (block-miners + timestamps from the parquet bundle,
 * via self-hosted DuckDB-Wasm), seeds the scrubber range from its tipBlock, THEN
 * dynamically imports CoinGridView — keeping the heavy PixiJS + DuckDB-Wasm work
 * out of SSR/prerender. Once the lattice is ready it overlays the block-stats
 * panel and the bottom scrubber + playback strip.
 *
 * Mirrors GraphCanvas on the sister Graph project; the two views share the same
 * store + chrome and differ only in the renderer.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { loadCoinSubstrate } from '@/data/coinSubstrate';
import { useTimegridStore } from '@/store/timegridStore';
import { BlockStats } from '@/components/BlockStats';
import { Scrubber } from '@/components/Scrubber';
import { Playback } from '@/components/Playback';

export function GridCanvas() {
  const [Grid, setGrid] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = await loadCoinSubstrate();
        const store = useTimegridStore.getState();
        store.setLatestBlock(sub.tipBlock);
        store.setCurrentBlock(sub.tipBlock); // open at the tip; Playback rewinds + plays
        const mod = await import('./CoinGridView');
        if (!cancelled) setGrid(() => mod.CoinGridView);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center">
        <p className="text-mono text-sm text-[color:var(--color-amber)]">
          Couldn’t load chain data: {error}
        </p>
      </div>
    );
  }
  if (!Grid) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center">
        <p className="text-mono text-sm uppercase tracking-[0.24em] text-[color:var(--color-brass-bright)]">
          Charting the lattice…
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* The lattice — fills the area, beneath the overlays. */}
      <div className="absolute inset-0">
        <Grid />
      </div>

      {/* Block stats — timeline position (date, epoch, halvings) top-left (lg+). */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 hidden w-[280px] max-w-[calc(100vw-1.5rem)] lg:block">
        <div className="pointer-events-auto">
          <BlockStats />
        </div>
      </div>

      {/* Bottom: scrubber + playback (block 0 → tip). The strip captures pointer
          events so interacting with it never reaches the canvas behind it. */}
      <div className="pointer-events-auto absolute right-0 bottom-3 left-0 z-10 flex flex-col items-center gap-2 px-3">
        <div className="w-full max-w-3xl">
          <div className="brass-panel flex flex-col gap-2 rounded-lg px-3 py-2">
            <Playback autoStart />
            <Scrubber />
          </div>
        </div>
      </div>
    </div>
  );
}
