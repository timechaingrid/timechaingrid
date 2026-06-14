import type { Metadata } from 'next';
import { GridCanvas } from '@/components/views/GridCanvas';

export const metadata: Metadata = {
  title: 'Grid — Bitcoin’s digital real estate',
  description:
    "Every Bitcoin ever minted, rendered as a tile on a deterministic spiral and colored by the mining pool that minted it — queried in your browser via self-hosted DuckDB-Wasm. No accounts, no tracking.",
};

/**
 * /grid — the live coin-issuance lattice.
 *
 * GridCanvas (client) loads the coin substrate (block-miners + timestamps from
 * the parquet bundle, via self-hosted DuckDB-Wasm), seeds the scrubber from its
 * tipBlock, then mounts the PixiJS CoinGridView against real chain data. The
 * page stays a server component so it can export metadata; all the heavy client
 * work is isolated in GridCanvas.
 */
export default function GridHome() {
  return (
    <>
      {/* Screen-reader / crawler heading — the route is a full-viewport canvas
          kiosk with no visible heading, so expose one for a11y + SEO. */}
      <h1 className="sr-only">
        Timechain Grid — every Bitcoin as a tile on the issuance spiral
      </h1>
      <GridCanvas />
    </>
  );
}
