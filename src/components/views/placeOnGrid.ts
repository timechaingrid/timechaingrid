import type { GridPosition } from '@/types/lattice';
import type { WalletData } from '@/types/wallet';
import { DEFAULT_CHAIN_GRID_MIN, DEFAULT_CHAIN_GRID_MAX } from '@/lib/coords';

/**
 * Deterministic Grid-view placement (legacy + scaffolding).
 *
 * Maps a wallet address to a fixed (x, y) on the chain coordinate grid.
 * Same address → same cell, every load, forever. This is the defining
 * property of the Grid view: the panopticon ergonomics depend on
 * coordinates being a stable function of identity.
 *
 * The Graph sibling does NOT use this function; it places wallets via
 * force simulation (position emerges from edges). Only the Grid view
 * cares about deterministic placement.
 *
 * Algorithm: djb2 hash of the address → 32-bit unsigned. Split the
 * hash into two 16-bit halves and project each into [chainMin, chainMax].
 * djb2 is fast, has decent avalanche on Bitcoin addresses (which vary
 * heavily in case + alphabet at every byte), and is more than enough
 * for the ~10k free-tier node set.
 *
 * Satoshi is special-cased to (0, 0) so the genesis miner anchors the
 * center, regardless of what its address hashes to.
 *
 * ──────────────────────────────────────────────────────────────────
 * v0.2 placement architecture (status as of 2026-05)
 * ──────────────────────────────────────────────────────────────────
 *
 * The Grid view has TWO renderers in this folder, and only one is
 * mounted at /grid:
 *
 *   - CoinGridView (mounted): coins are placed on a deterministic
 *     spiral expanding from Satoshi at (0,0). Per-block snapshots
 *     drive playback; wallet identity emerges from the cell color and
 *     the empire-hull overlay on hover. There are no per-wallet
 *     markers. `placeOnGrid` is NOT used by this view.
 *
 *   - GridView (orphaned, kept for tests): each wallet is placed at a
 *     hashed (x, y) per `placeWallet` below. Useful as a fallback
 *     "panopticon of identities" when the spiral coin tree is
 *     suppressed (e.g., a future tier toggle that views *just* the
 *     wallets without their territories).
 *
 * The "smart wallet placement" question for v0.2+ is: when sister's
 * substrate scales us from 50 fixture wallets to 157k+ real miner
 * wallets, how do we pick what to render?
 *
 *   1. Tier-based scope (free / pro / max): server-side filtering by
 *      threshold (lifetime sats, miner status, or visible-viewport)
 *      before the bundle is shipped. The vault generator's wallet
 *      bundle in public/wallets-bundle.json is the v0.2 seed of this
 *      pattern — bounded by `firstSeenBlock <= TARGET_THROUGH_BLOCK`.
 *   2. Spatial culling: query by viewport bounds + zoom level,
 *      lazy-fetch wallets within the visible window. Stays cheap
 *      because the grid coordinate is deterministic from the address.
 *   3. LOD aggregation: at low zoom, cluster nearby wallets into
 *      "regions" with a count badge; at high zoom the cluster decays
 *      into individual cells. Rendering budget capped at ~10k
 *      simultaneously-visible cells regardless of source size.
 *
 * The current commit's contribution: scaffolding the bundle pipeline
 * (sister's wallets → public/wallets-bundle.json → BitcoinChainAdapter
 * .getNodes) so the next round can flip CoinGridView's role-lookup
 * from FIXTURE_SUBSTRATE to the adapter without further data-shape
 * work. Identity moves to real chain truth; placement stays spiral.
 */

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0; // force int32 to keep the loop fast
  }
  return h >>> 0; // to unsigned 32-bit
}

const CHAIN_SPAN = DEFAULT_CHAIN_GRID_MAX - DEFAULT_CHAIN_GRID_MIN;

/**
 * Hash an address to a chain-grid coordinate. Pure, deterministic,
 * referentially transparent.
 */
export function placeOnGrid(address: string): GridPosition {
  const h = djb2(address);
  const xUnit = (h & 0xffff) / 0xffff;
  const yUnit = ((h >>> 16) & 0xffff) / 0xffff;
  return {
    x: Math.round(DEFAULT_CHAIN_GRID_MIN + xUnit * CHAIN_SPAN),
    y: Math.round(DEFAULT_CHAIN_GRID_MIN + yUnit * CHAIN_SPAN),
  };
}

/**
 * Same as `placeOnGrid` for normal wallets; pins satoshi to the origin.
 */
export function placeWallet(wallet: WalletData): GridPosition {
  if (wallet.role === 'satoshi') return { x: 0, y: 0 };
  return placeOnGrid(wallet.address);
}

// ROLE_COLOR / ROLE_RADIUS / ROLE_CSS / ROLE_LABEL moved to
// `src/lib/role-visuals.ts` (shared between Grid and Graph views).
// Import from there.
