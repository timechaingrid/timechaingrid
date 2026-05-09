'use client';

import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { FIXTURE_SUBSTRATE } from '@/data/substrate';
import { ROLE_COLOR } from '@/lib/role-visuals';
import { cumulativeSubsidy } from '@/lib/spiral';
import { convexHull, type Point2 } from '@/lib/convex-hull';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';
import type { Coin } from '@/types/coin';
import type { WalletRole } from '@/types/wallet';

/**
 * CoinGridView — Bitcoin chain as 2D real-estate.
 *
 * v0.2 perf rework: every coin renders as a tiny Graphics square at
 * its spiral coordinate. Per-cell pointer events are OFF; hover and
 * click are handled at the stage level via a spatial map (O(1) lookup
 * from cursor coords to coin). Cells are 6×6 px so a 50k-coin lattice
 * fits the canvas at default zoom without staggering frames on the
 * Graphics-batching pipeline.
 *
 * Click any cell → drill into its 10×10 sub-grid, the fractional-
 * ownership view: 100 sub-pixels per coin (1 sub-pixel = 1M sats =
 * 0.01 BTC). v0 colors all 100 sub-pixels the same shade because we
 * don't yet model sat-fraction transfers; v0.2+ ingestion will give
 * each sub-pixel its own owner.
 */

const CELL_SIZE = 6; // px per coin cell at zoom 1.0
const CELL_GAP = 0; // tight tiling for the lightweight grid

// Pull all chain data through the substrate contract — never the
// fixture file paths directly. Swapping in an R2/parquet-backed
// substrate later is a one-line change in `data/substrate.ts`.
const COINS = FIXTURE_SUBSTRATE.coins;

// Coin-tip block: the latest block any coin in the roster was minted
// at. Different from the wallet-derived `FIXTURE_SUBSTRATE.tipBlock`
// (which reaches the live Bitcoin chain head ~875k) because the
// fixture only generates coins for the first DEMO_BLOCK_COUNT blocks.
// Scrubber max derives from this so the visible-coins counter stays
// accurate without a fixture-specific constant import.
const COIN_TIP_BLOCK = COINS.reduce((max, c) => Math.max(max, c.mintedAtBlock), 0);

const ADDR_TO_ROLE = new Map<string, WalletRole>();
for (const w of FIXTURE_SUBSTRATE.wallets) ADDR_TO_ROLE.set(w.address, w.role);

const SPATIAL_MAP = new Map<string, Coin>();
for (const c of COINS) SPATIAL_MAP.set(`${c.gridX},${c.gridY}`, c);

// Coins owned by each wallet, sorted ascending by mintedAtBlock.
// Used to build the per-block dynamic empire hull: at scrubber
// position N, the hull encloses only coins where
// mintedAtBlock <= N. Sort once at module load so per-frame
// hull computation is just a slice + convex-hull pass.
const COINS_BY_OWNER_SORTED = new Map<string, Coin[]>();
{
  for (const c of COINS) {
    const list = COINS_BY_OWNER_SORTED.get(c.ownerAddress);
    if (list) list.push(c);
    else COINS_BY_OWNER_SORTED.set(c.ownerAddress, [c]);
  }
  for (const list of COINS_BY_OWNER_SORTED.values()) {
    list.sort((a, b) => a.mintedAtBlock - b.mintedAtBlock);
  }
}

// Empire hull cache, keyed by `${address}@${block}`. Invalidated
// implicitly: every (wallet, block) pair gets its own cached hull,
// so successive hovers at the same block on the same wallet hit
// O(1). Block changes invalidate by missing the cache key. The
// cache grows with scrubber traversal but is bounded by
// (wallets) × (blocks) — at v0.1 fixture scale ~6×1000 = 6k
// entries max, each a small Point2[]. Negligible memory.
const empireHullCache = new Map<string, Point2[]>();

function getEmpireHullAtBlock(address: string, block: number): Point2[] {
  const key = `${address}@${block}`;
  const cached = empireHullCache.get(key);
  if (cached) return cached;
  const ownedSorted = COINS_BY_OWNER_SORTED.get(address);
  if (!ownedSorted) {
    empireHullCache.set(key, []);
    return [];
  }
  // Coins are sorted by mintedAtBlock; binary-search the cutoff
  // (linear scan would be fine for v0.1 too, but binary keeps the
  // per-frame cost flat at v0.2+ scale).
  let lo = 0;
  let hi = ownedSorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ownedSorted[mid].mintedAtBlock <= block) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) {
    empireHullCache.set(key, []);
    return [];
  }
  const pts: Point2[] = new Array(lo);
  for (let i = 0; i < lo; i += 1) {
    const c = ownedSorted[i];
    pts[i] = [c.gridX * CELL_SIZE, c.gridY * CELL_SIZE];
  }
  const hull = convexHull(pts);
  empireHullCache.set(key, hull);
  return hull;
}

export function CoinGridView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentBlock = useTimegridStore((s) => s.currentBlock);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    // appReady flips true when app.init() resolves successfully and
    // the canvas is appended. Subscribers + helpers that read
    // app.screen / app.canvas must short-circuit while this is false,
    // because the playback auto-start can fire setPlaybackPlaying(true)
    // before Pixi has finished initializing.
    let appReady = false;
    const cellMap = new Map<string, Graphics>();
    const viewport = new Container();
    // Empire-territory overlay: brass-stroked convex hull of the
    // selected wallet's coins. Drawn on a single Graphics so the
    // redraw cost is bounded by hull-vertex-count, not by total
    // coins. Activates whenever a wallet is selected (hover or tap).
    const highlightGraphics = new Graphics();
    let isPanning = false;

    const {
      setSelectedWallet,
      setActiveDockPanel,
      setLatestBlock,
      setCurrentBlock,
      setCamera,
    } = useTimegridStore.getState();

    // First mount only: seed the scrubber bounds and place the user
    // at genesis. Subsequent re-mounts (navigation away and back)
    // preserve the user's scrubbed position.
    if (useTimegridStore.getState().latestBlock === 0) {
      setLatestBlock(COIN_TIP_BLOCK);
      setCurrentBlock(0);
    }

    function applyActivity(block: number) {
      // Show/hide cells based on whether they've been minted yet,
      // and apply a soft alpha falloff for older coins. The white
      // block-mint flash was removed per user feedback 2026-04-30:
      // the halos read as distracting "white rectangles spawning"
      // rather than communicating block events.
      for (const coin of COINS) {
        const g = cellMap.get(coin.id);
        if (!g) continue;
        if (coin.mintedAtBlock > block) {
          g.visible = false;
          continue;
        }
        g.visible = true;
        const age = block - coin.mintedAtBlock;
        g.alpha = age <= 5 ? 1.0 : age <= 50 ? 0.85 : 0.7;
      }
    }

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    // Auto-zoom: fit the visible spiral within the viewport, centered
    // on the origin. Computes the Chebyshev ring index containing the
    // highest visible coin (cumulativeSubsidy(currentBlock) - 1) and
    // sets zoom so 2 × ringRadius × CELL_SIZE just fits in min(W,H)
    // with an 85% margin. Only fires during playback — manual pan/
    // zoom is the user's prerogative once they've paused.
    //
    // Guarded on `appReady` because subscribed playback toggles can
    // fire before Pixi's async init resolves (Playback's autoStart
    // runs synchronously after CoinGridView's effect; init is still
    // pending). Reading app.screen pre-init throws.
    function applyAutoZoom(): void {
      if (!appReady) return;
      if (!useTimegridStore.getState().playbackPlaying) return;
      const block = useTimegridStore.getState().currentBlock;
      const visibleCoins = cumulativeSubsidy(block);
      if (visibleCoins <= 0) return;
      const ringRadius = Math.max(
        1,
        Math.ceil((Math.sqrt(visibleCoins) - 1) / 2),
      );
      const radiusPx = ringRadius * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      // 0.85 margin gives a comfortable bezel; cap zoom at 4 so the
      // first 50 genesis coins don't zoom into individual-pixel
      // territory, and floor at 0.2 so deep playback never collapses
      // the lattice into a dot.
      const fitZoom = Math.min(
        4,
        Math.max(0.2, (viewportSize / (2 * radiusPx)) * 0.85),
      );
      setCamera({
        position: { x: app.screen.width / 2, y: app.screen.height / 2 },
        zoom: fitZoom,
      });
    }

    // Empire-territory highlight — the border of the selected
    // wallet's kingdom, drawn as a brass-colored convex hull
    // around every coin she's minted UP TO the current scrubber
    // position. Per user directive 2026-04-30 ("highlight the
    // empire view dynamically for every block individually"), the
    // hull recomputes per (wallet, currentBlock) pair so the
    // border grows in lockstep with the lattice as playback
    // advances.
    //
    // Per-cell cyan strokes were removed — they printed as "many
    // turquoise grid lines" filling the territory at high zoom
    // levels. The hull alone communicates "this is the empire
    // boundary" without visually overwhelming the cells.
    function applyOwnerHighlight() {
      highlightGraphics.clear();
      const { selectedWallet, currentBlock } = useTimegridStore.getState();
      if (!selectedWallet) return;

      const hull = getEmpireHullAtBlock(selectedWallet, currentBlock);
      if (hull.length < 2) return;

      // Inflate the hull outward from its centroid so the border
      // sits OUTSIDE the cells, not slicing through them. Cells
      // are CELL_SIZE wide and centered at (gridX * CELL_SIZE,
      // gridY * CELL_SIZE), so half + padding = 6 px gives a
      // visible bezel.
      const half = CELL_SIZE / 2;
      const padding = 3;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of hull) {
        cx += x;
        cy += y;
      }
      cx /= hull.length;
      cy /= hull.length;
      const inflated: Array<[number, number]> = hull.map(([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const expand = half + padding;
        return [x + (dx / len) * expand, y + (dy / len) * expand];
      });
      const first = inflated[0];
      highlightGraphics.moveTo(first[0], first[1]);
      for (let i = 1; i < inflated.length; i += 1) {
        highlightGraphics.lineTo(inflated[i][0], inflated[i][1]);
      }
      highlightGraphics.lineTo(first[0], first[1]);
      highlightGraphics.stroke({
        width: 2,
        color: 0xc28840, // brass
        alpha: 0.85,
      });
    }

    function pixelToCoin(globalX: number, globalY: number): Coin | null {
      // Convert canvas-global pointer → viewport-local → grid coord.
      const cam = useTimegridStore.getState().camera;
      const localX = (globalX - cam.position.x) / cam.zoom;
      const localY = (globalY - cam.position.y) / cam.zoom;
      const gx = Math.round(localX / CELL_SIZE);
      const gy = Math.round(localY / CELL_SIZE);
      return SPATIAL_MAP.get(`${gx},${gy}`) ?? null;
    }

    void (async () => {
      await app.init({
        resizeTo: container,
        background: 0x08080c,
        // Antialiasing softens the cell edges and the brass empire
        // hull stroke. The cells are square-rendered (roundRect with
        // a tiny radius) so AA mostly affects diagonals — the brass
        // hull stroke and any zoomed-in cell corners read cleaner
        // with it on. Costs a couple of fps on large lattices but
        // worth it visually at this density.
        antialias: true,
        // High-DPI: render at the device pixel ratio so cells stay
        // crisp on retina monitors. Pixi reads this from window
        // automatically in v8 when `resolution` is unset and
        // `autoDensity: true` — set both explicitly for clarity.
        resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        autoDensity: true,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      container.appendChild(app.canvas);
      appReady = true;

      const initCam = useTimegridStore.getState().camera;
      const isFreshCamera =
        initCam.position.x === 0 && initCam.position.y === 0 && initCam.zoom === 1;
      if (isFreshCamera) {
        setCamera({
          position: { x: app.screen.width / 2, y: app.screen.height / 2 },
          zoom: 0.9,
        });
      }

      app.stage.addChild(viewport);

      // Render every coin as a Graphics square — but DO NOT attach
      // per-cell pointer events. Hover/click are stage-level via the
      // spatial map. Cells use `roundRect` with a tiny corner radius
      // to soften the lattice's grid edges; at zoom 1 the rounding is
      // sub-pixel so the perceived effect is "tile texture" rather
      // than visible round corners. The cumulative effect across
      // thousands of cells is a more polished, less harsh lattice.
      const half = CELL_SIZE / 2;
      const inner = CELL_SIZE - 2 * CELL_GAP;
      const cornerRadius = 1;
      for (const coin of COINS) {
        const role = ADDR_TO_ROLE.get(coin.ownerAddress) ?? 'miner';
        const colorHex = ROLE_COLOR[role];
        const px = coin.gridX * CELL_SIZE;
        const py = coin.gridY * CELL_SIZE;
        const x0 = px - half + CELL_GAP;
        const y0 = py - half + CELL_GAP;

        const g = new Graphics();
        g.roundRect(x0, y0, inner, inner, cornerRadius).fill(colorHex);
        if (coin.isHalving) {
          g.roundRect(
            x0 - 0.5,
            y0 - 0.5,
            inner + 1,
            inner + 1,
            cornerRadius + 0.5,
          ).stroke({
            width: 0.6,
            color: 0xffd700,
            alpha: 1,
          });
        }
        if (role === 'satoshi') {
          g.roundRect(
            x0 - 0.5,
            y0 - 0.5,
            inner + 1,
            inner + 1,
            cornerRadius + 0.5,
          ).stroke({
            width: 0.4,
            color: 0xc28840,
            alpha: 0.7,
          });
        }
        cellMap.set(coin.id, g);
        viewport.addChild(g);
      }
      // Owner-highlight layer on top of all cells — brass-stroked
      // hull around the selected wallet's territory.
      viewport.addChild(highlightGraphics);

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };

      let panStart = { x: 0, y: 0 };
      let panStartCam = { x: 0, y: 0 };
      app.stage.on('pointerdown', (e) => {
        // All stage clicks start a potential pan; we distinguish
        // pan-vs-tap at pointerup by movement delta.
        isPanning = true;
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPanning) {
          const dx = e.global.x - panStart.x;
          const dy = e.global.y - panStart.y;
          // Once the cursor moves past the tap threshold during a
          // pointerdown-initiated drag, treat it as a deliberate pan
          // and pause the auto-narrate playback. Pure taps (≤3px
          // total movement) won't trigger this, so tap-to-pin keeps
          // the lattice playing under the user's pinned selection.
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            useTimegridStore.getState().setPlaybackPlaying(false);
          }
          const cam = useTimegridStore.getState().camera;
          setCamera({
            position: { x: panStartCam.x + dx, y: panStartCam.y + dy },
            zoom: cam.zoom,
          });
          return;
        }
        // Hover updates selectedWallet, which drives the empire
        // hull overlay. The hull is the "civilization border" — see
        // user directive 2026-04-30: "hovering over satoshi coins
        // will group and highlight the satoshi coins empire border".
        // Per-cell strokes don't redraw on hover (only when the
        // inspector is pinned via tap/leaderboard click), so hover
        // stays cheap.
        const coin = pixelToCoin(e.global.x, e.global.y);
        const block = useTimegridStore.getState().currentBlock;
        if (coin && coin.mintedAtBlock <= block) {
          setSelectedWallet(coin.ownerAddress);
        } else {
          setSelectedWallet(null);
        }
      });
      const endPan = (e: { global: { x: number; y: number } }) => {
        const movedX = Math.abs(e.global.x - panStart.x);
        const movedY = Math.abs(e.global.y - panStart.y);
        const movedTotal = movedX + movedY;
        isPanning = false;
        app.canvas.style.cursor = '';
        if (movedTotal < 3) {
          // Tap. If a coin is under the pointer → pin its owner
          // and open the inspector. If empty space → deselect.
          // Per user directive 2026-04-30, the subgrid drill-in
          // is removed entirely; tap is purely a pin/inspect
          // action.
          const coin = pixelToCoin(e.global.x, e.global.y);
          const block = useTimegridStore.getState().currentBlock;
          if (coin && coin.mintedAtBlock <= block) {
            setSelectedWallet(coin.ownerAddress);
            setActiveDockPanel('wallet-inspector');
          } else {
            setSelectedWallet(null);
            setActiveDockPanel(null);
          }
          // applyOwnerHighlight runs via the store subscription below.
        }
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        // Wheel-zoom does NOT pause playback — per user feedback
        // 2026-04-30, the user wants to zoom in/out while still
        // watching the narrative advance. Auto-zoom on block change
        // is intentionally permissive: if the user has manually
        // zoomed in, the next block-advance will reset to the
        // fitted radius. Manual pan still pauses (it's a deliberate
        // explore).
        const cam = useTimegridStore.getState().camera;
        const delta = -event.deltaY * 0.0015;
        const nextZoom = Math.max(0.2, Math.min(20, cam.zoom * (1 + delta)));
        setCamera({ position: cam.position, zoom: nextZoom });
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      applyActivity(useTimegridStore.getState().currentBlock);
      applyCamera();
      applyOwnerHighlight();

      (
        app.canvas as HTMLCanvasElement & { _onWheel?: typeof onWheel }
      )._onWheel = onWheel;
    })();

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) {
        applyActivity(state.currentBlock);
        // The empire hull is per-block — the boundary of a wallet's
        // currently-visible coins. As the scrubber advances, the
        // selected wallet's empire grows; redraw to reflect.
        applyOwnerHighlight();
      }
      // Auto-zoom intentionally NOT fired on every block change —
      // that would yank the camera out from under a user who's
      // manually zoomed in to inspect cells. Auto-zoom only fits
      // once on play-start (unsubPlayback), and the user owns the
      // camera from there.
    });
    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });
    const unsubPlayback = useTimegridStore.subscribe((state, prev) => {
      // When playback flips on, snap the camera to fit the lattice's
      // visible radius so the user starts the narrative with the
      // origin centered. Off → on transitions only; pausing leaves
      // the camera wherever the user moved it.
      if (!prev.playbackPlaying && state.playbackPlaying) {
        applyAutoZoom();
      }
    });
    const unsubHighlight = useTimegridStore.subscribe((state, prev) => {
      // Redraw on any change to selectedWallet OR activeDockPanel.
      // Hover doesn't reach here because pointermove early-returns
      // when activeDockPanel === 'wallet-inspector', so selectedWallet
      // only changes on committed paths (canvas tap, leaderboard
      // click, empty-tap deselect, external clear).
      if (
        state.selectedWallet !== prev.selectedWallet ||
        state.activeDockPanel !== prev.activeDockPanel
      ) {
        applyOwnerHighlight();
      }
    });

    return () => {
      cancelled = true;
      unsubBlock();
      unsubCam();
      unsubPlayback();
      unsubHighlight();
      // Cleanup may run before the async init resolved, in which case
      // app.canvas is still undefined. Guard against it. The async
      // init's own `if (cancelled)` branch handles destroy in that
      // path, so we only destroy here when init completed (appReady).
      if (appReady) {
        const canvas = app.canvas as
          | (HTMLCanvasElement & { _onWheel?: (e: WheelEvent) => void })
          | undefined;
        const wheel = canvas?._onWheel;
        if (wheel && canvas) {
          canvas.removeEventListener('wheel', wheel);
        }
        try {
          app.destroy(true, { children: true });
        } catch {
          // Pixi v8 occasionally throws on double-destroy in dev
          // strict-mode mount/unmount cycles; swallow so we don't
          // surface a benign teardown error to the user.
        }
      }
    };
  }, []);

  // Coin = 1 BTC under the user's coin-real-estate model. Display
  // floors fractional values to whole BTC (per user directive
  // 2026-04-30: "fractions will always be scrubbed to whole BTC")
  // so the counter only ever shows integer cell counts.
  const visibleCoins = Math.min(
    Math.max(0, Math.floor(cumulativeSubsidy(currentBlock))),
    COINS.length,
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      aria-label="Timechain Grid coin real-estate — Bitcoin chain rendered as 2D coin lattice expanding from Satoshi origin. Drag to pan, scroll to zoom, hover to see an empire's territory, click to pin a wallet."
    >
      {/* Bottom-left brand tagline + cumulative coin counter, layered
          above the canvas. Bottom-right and bottom-corner Block readout
          got removed in the kiosk-mode rewrite (covered by Scrubber);
          the "fixture data" badge moves below the Coins counter to
          keep both visible without overlapping the BlockStats panel
          floated by /grid/page.tsx. */}
      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]"
      >
        <span
          className="tracking-[0.28em] text-[color:var(--color-accent-cyan)] mix-blend-screen"
        >
          {BRAND_TAGLINE}
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          Coins{' '}
          <span className="text-[color:var(--color-text-primary)]">
            {visibleCoins.toLocaleString()}
          </span>{' '}
          / {COINS.length.toLocaleString()}
        </span>
        <span
          className="self-start rounded-full px-2 py-0.5 text-[9px] tracking-wider"
          style={{
            backgroundColor: 'rgba(245, 166, 35, 0.12)',
            color: 'var(--color-amber)',
          }}
        >
          fixture data · v0.1
        </span>
      </div>
    </div>
  );
}

