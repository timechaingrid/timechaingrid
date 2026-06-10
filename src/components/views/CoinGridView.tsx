'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import {
  inverseSpiral,
  cumulativeCoins,
  blockOfCoinIndex,
  ringForCount,
} from '@/lib/coinGrid';
import {
  loadCoinSubstrate,
  type CoinSubstrate,
  SATOSHI_CLUSTER_KEY,
  SATOSHI_CLUSTER_MAX_BLOCK,
  SATOSHI_CLUSTER_COLOR,
  SATOSHI_CLUSTER_IDX,
} from '@/data/coinSubstrate';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

/**
 * CoinGridView — Bitcoin's coin issuance as 2D real-estate, rendered at scale.
 *
 * Every whole BTC ever minted is a tile on a deterministic Ulam spiral growing
 * out from Satoshi's genesis coins at the origin. At the tip that's ~19.9M
 * tiles — far too many to materialise. So this renderer NEVER iterates coins:
 * it iterates the VISIBLE viewport cells and inverts each back to its coin
 * (`inverseSpiral(x,y) → mint index → block → miner`). Per-frame cost is bounded
 * by on-screen pixels with an adaptive LOD stride, not by the coin count — the
 * whole grid and a 50-coin genesis cost the same to draw.
 *
 * Color = the block's MINER (coinbase recipient): each distinct miner hashes to
 * a hue, so mining pools paint contiguous "territories" as the spiral winds
 * outward. Satoshi's genesis is the brass centerpiece. Halving boundaries draw
 * as concentric gold rings. The scrubber drives `currentBlock`; only coins
 * minted at-or-before it are shown, so playback grows the map from genesis.
 */

const CELL_SIZE = 6; // world px per coin cell at zoom 1.0
const BACKGROUND = 0x08080c;

// LOD: each DRAWN block should be at least this many device px. As zoom shrinks
// cells below this, we stride (aggregate stride×stride coins into one tile) so
// tiles stay chunky-and-spaced rather than collapsing into a fine solid mesh.
// Bigger value ⇒ pixellates sooner / sparser.
const LOD_MIN_TILE_PX = 8;
// Grout: fraction of each tile's span left as the dark gap between tiles. Kept
// PROPORTIONAL so the empty spaces survive at every LOD level — whether a tile
// is one coin (zoomed in) or an aggregated block of hundreds (zoomed out).
const GROUT_FRAC = 0.16;
// When an empire is highlighted, the rest of the field recedes to this alpha —
// dimmed but still clearly visible, so focusing a SMALL miner doesn't black out
// the whole map.
const DIM_ALPHA = 0.42;
// Hard ceiling on rects per redraw — the stride is bumped until the visible
// cell count fits under this, so a full zoom-out of 19.9M coins still draws in
// one cheap pass.
const DRAW_BUDGET = 45_000;
// Per-frame easing fraction for the auto-fit camera — the live camera moves this
// share of the remaining distance to its target each frame (exponential ease-out
// ≈ 0.3–0.5s settle at 60fps). Smaller = slower/smoother zoom-out.
const CAMERA_LERP = 0.14;

function shortAddr(a: string): string {
  if (!a) return '(no address)';
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function formatDate(unix: number | undefined): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

interface HoverInfo {
  /** pre-clamped tooltip position in container px (computed in the pointer
   *  handler, where reading the container size is legal — never during render). */
  left: number;
  top: number;
  addr: string;
  blocks: number; // how many blocks this miner mined (pool size)
  block: number; // the block that minted the hovered coin
  date: string;
  isSatoshi: boolean;
}

export function CoinGridView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const currentBlock = useTimegridStore((s) => s.currentBlock);
  const satoshiCluster = useTimegridStore((s) => s.satoshiCluster);
  const setSatoshiCluster = useTimegridStore((s) => s.setSatoshiCluster);
  const [sub, setSub] = useState<CoinSubstrate | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    let appReady = false;
    let dirty = true; // redraw requested

    const viewport = new Container();
    const gridG = new Graphics(); // the tiles
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let substrate: CoinSubstrate | null = null;
    // Empire-reveal highlight: the miner under the cursor (hover) and a pinned
    // miner (click). hover takes precedence; falls back to the pin when idle.
    let hoverMinerIdx = -1;
    let pinnedMinerIdx = -1;
    // Smooth auto-fit: fitToMinted arms a camera TARGET; the ticker eases the
    // live camera toward it each frame so the zoom-out tracks the growing grid
    // continuously instead of snapping. null = settled / user-controlled.
    let targetCam: { position: { x: number; y: number }; zoom: number } | null = null;

    const { setCurrentBlock, setLatestBlock, setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    // Fit the minted region into the viewport, centered. Called on play-start
    // and (while playing) on each block so the camera zooms out as the lattice
    // grows — the signature "watch the map expand" motion. When paused the user
    // owns the camera. By default it ARMS a target the ticker eases toward (so
    // the zoom-out is smooth + continuous); `instant` snaps (first-paint only).
    function fitToMinted(instant = false) {
      if (!appReady || !substrate) return;
      const block = useTimegridStore.getState().currentBlock;
      const total = cumulativeCoins(block);
      if (total <= 0) return;
      const ring = Math.max(1, ringForCount(total));
      const radiusPx = ring * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      const fitZoom = Math.min(6, Math.max(0.02, (viewportSize / (2 * radiusPx)) * 0.82));
      const target = {
        position: { x: app.screen.width / 2, y: app.screen.height / 2 },
        zoom: fitZoom,
      };
      if (instant) {
        targetCam = null;
        setCamera(target);
      } else {
        targetCam = target; // ticker eases the live camera toward it
      }
    }

    // Ease the live camera one frame toward targetCam (exponential ease-out).
    // Driven by the ticker while a target is armed; commits to the store each
    // frame so hover/pan math + drawGrid all read a consistent camera. Snaps and
    // clears the target once within a sub-pixel / sub-permille threshold. As the
    // grid grows during playback the target recedes every block, so the camera
    // continuously chases it — a smooth, tracking zoom-out rather than a snap.
    function stepCameraAnimation() {
      if (!targetCam) return;
      const cam = useTimegridStore.getState().camera;
      const dx = targetCam.position.x - cam.position.x;
      const dy = targetCam.position.y - cam.position.y;
      const dz = targetCam.zoom - cam.zoom;
      if (Math.abs(dz) <= targetCam.zoom * 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        setCamera(targetCam);
        targetCam = null;
        return;
      }
      setCamera({
        position: { x: cam.position.x + dx * CAMERA_LERP, y: cam.position.y + dy * CAMERA_LERP },
        zoom: cam.zoom + dz * CAMERA_LERP,
      });
    }

    // Does the whole minted grid currently fit inside the viewport? Drives the
    // auto-fit decision during playback: only re-fit (snap to hold the entire
    // grid) once the grid has grown to OVERFLOW the screen. While it still fits
    // — i.e. the user is zoomed out far enough to see all of it — leave the
    // camera alone so playback doesn't yank it back to center every block.
    function gridFitsViewport(): boolean {
      if (!appReady) return true;
      const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
      if (total <= 0) return true;
      const R = (ringForCount(total) + 0.5) * CELL_SIZE;
      const gridPx = 2 * R * useTimegridStore.getState().camera.zoom;
      return gridPx <= Math.min(app.screen.width, app.screen.height);
    }

    // The heart: iterate visible cells, invert to coins, draw. Bounded by the
    // draw budget via an adaptive stride; clamped to the minted ring so we never
    // sweep empty space when zoomed out.
    function drawGrid() {
      if (!appReady || !substrate) return;
      const cam = useTimegridStore.getState().camera;
      const block = useTimegridStore.getState().currentBlock;
      const total = cumulativeCoins(block);
      gridG.clear();
      if (total <= 0 || cam.zoom <= 0) return;

      const maxRing = ringForCount(total);
      const W = app.screen.width;
      const H = app.screen.height;

      // Visible world rect → grid-cell rect, clamped to the minted square.
      const worldLeft = (0 - cam.position.x) / cam.zoom;
      const worldRight = (W - cam.position.x) / cam.zoom;
      const worldTop = (0 - cam.position.y) / cam.zoom;
      const worldBottom = (H - cam.position.y) / cam.zoom;
      let gxLo = Math.max(-maxRing, Math.floor(worldLeft / CELL_SIZE) - 1);
      const gxHi = Math.min(maxRing, Math.ceil(worldRight / CELL_SIZE) + 1);
      let gyLo = Math.max(-maxRing, Math.floor(worldTop / CELL_SIZE) - 1);
      const gyHi = Math.min(maxRing, Math.ceil(worldBottom / CELL_SIZE) + 1);
      if (gxHi < gxLo || gyHi < gyLo) return;

      // LOD stride: keep each drawn block ≥ LOD_MIN_TILE_PX device px (so tiles
      // stay chunky + spaced, never a fine mesh); then bump further if needed to
      // fit the draw budget.
      const effCell = CELL_SIZE * cam.zoom;
      let stride = Math.max(1, Math.ceil(LOD_MIN_TILE_PX / effCell));
      const cellsX = (gxHi - gxLo) / stride + 1;
      const cellsY = (gyHi - gyLo) / stride + 1;
      if (cellsX * cellsY > DRAW_BUDGET) {
        const scale = Math.sqrt((cellsX * cellsY) / DRAW_BUDGET);
        stride = Math.max(stride, Math.ceil(stride * scale));
      }

      // Snap iteration origin to the stride lattice so blocks tile cleanly.
      gxLo -= ((gxLo % stride) + stride) % stride;
      gyLo -= ((gyLo % stride) + stride) % stride;

      const span = stride * CELL_SIZE;
      const half = CELL_SIZE / 2;

      // Mosaic grout — PROPORTIONAL to the tile span, so the empty spaces are
      // part of the LOD: they persist whether a tile is one coin (zoomed in) or
      // an aggregated block of hundreds (zoomed out). Rounded corners only once
      // a drawn block is big enough on screen for the rounding to read.
      const drawnPx = stride * effCell; // on-screen size of one drawn block
      const gap = span * GROUT_FRAC;
      const tile = span - 2 * gap;
      const radius = drawnPx >= 6 ? tile * 0.22 : 0;

      // Empire reveal: when a miner is hovered (or pinned) its tiles stay bright
      // and everything else recedes — the pool's whole territory lights up
      // across every ring it owns. Idle (no highlight): muted field + bright
      // empires, with the growing frontier glowing.
      const highlightIdx = hoverMinerIdx !== -1 ? hoverMinerIdx : pinnedMinerIdx;
      const hl = highlightIdx !== -1;
      const frontierBlock = block - 144;
      const clusterOn = useTimegridStore.getState().satoshiCluster;

      for (let gy = gyLo; gy <= gyHi; gy += stride) {
        for (let gx = gxLo; gx <= gxHi; gx += stride) {
          const n = inverseSpiral(gx, gy);
          if (n < 0 || n >= total) continue;
          const b = blockOfCoinIndex(n);
          const idx = substrate.minerIdxAt(b);
          // When the Satoshi cluster is on, the early single-address era is one
          // synthetic entity — paint it Satoshi-orange regardless of lens.
          const inCluster = clusterOn && b <= SATOSHI_CLUSTER_MAX_BLOCK;
          let color = inCluster ? SATOSHI_CLUSTER_COLOR : substrate.minerColor(idx);
          let alpha = 1;
          if (hl) {
            const matches =
              highlightIdx === SATOSHI_CLUSTER_IDX ? inCluster : !inCluster && idx === highlightIdx;
            if (matches) color = lighten(color, 0.3);
            else alpha = DIM_ALPHA; // recede but stay visible
          } else if (b >= frontierBlock) {
            color = lighten(color, 0.3); // growing edge glows
          }
          const x0 = gx * CELL_SIZE - half + gap;
          const y0 = gy * CELL_SIZE - half + gap;
          if (radius > 0) gridG.roundRect(x0, y0, tile, tile, radius);
          else gridG.rect(x0, y0, tile, tile);
          gridG.fill({ color, alpha });
        }
      }
    }

    function pixelToCell(globalX: number, globalY: number): { gx: number; gy: number } {
      const cam = useTimegridStore.getState().camera;
      const worldX = (globalX - cam.position.x) / cam.zoom;
      const worldY = (globalY - cam.position.y) / cam.zoom;
      return {
        gx: Math.round(worldX / CELL_SIZE),
        gy: Math.round(worldY / CELL_SIZE),
      };
    }

    void (async () => {
      const loaded = await loadCoinSubstrate();
      if (cancelled) return;
      substrate = loaded;
      // Seed scrubber bounds once. Open at the tip (full grid); Playback's
      // autoStart rewinds to genesis and plays if untouched.
      if (useTimegridStore.getState().latestBlock === 0) {
        setLatestBlock(loaded.tipBlock);
        setCurrentBlock(loaded.tipBlock);
      }
      setSub(loaded); // surface to React (counter + BlockStats real dates)

      await app.init({
        resizeTo: container,
        background: BACKGROUND,
        antialias: true, // soften tile edges + rounded mosaic corners
        resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        autoDensity: true,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      container.appendChild(app.canvas);
      appReady = true;

      viewport.addChild(gridG);
      app.stage.addChild(viewport);

      // Fresh camera → fit the full minted grid on first paint (snap, no ease).
      const initCam = useTimegridStore.getState().camera;
      if (initCam.position.x === 0 && initCam.position.y === 0 && initCam.zoom === 1) {
        fitToMinted(true);
      }
      applyCamera();

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };

      app.stage.on('pointerdown', (e) => {
        isPanning = true;
        targetCam = null; // grabbing the camera cancels any in-flight auto-fit
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPanning) {
          // Panning the map does NOT pause playback — the scrubber keeps
          // advancing while the user drags around to explore.
          const dx = e.global.x - panStart.x;
          const dy = e.global.y - panStart.y;
          const cam = useTimegridStore.getState().camera;
          setCamera({ position: { x: panStartCam.x + dx, y: panStartCam.y + dy }, zoom: cam.zoom });
          return;
        }
        // Hover → which coin / miner is under the cursor.
        if (!substrate) return;
        const { gx, gy } = pixelToCell(e.global.x, e.global.y);
        const n = inverseSpiral(gx, gy);
        const block = useTimegridStore.getState().currentBlock;
        const total = cumulativeCoins(block);
        if (n >= 0 && n < total) {
          const b = blockOfCoinIndex(n);
          const inCluster =
            useTimegridStore.getState().satoshiCluster && b <= SATOSHI_CLUSTER_MAX_BLOCK;
          const idx = substrate.minerIdxAt(b);
          const hIdx = inCluster ? SATOSHI_CLUSTER_IDX : idx;
          if (hIdx !== hoverMinerIdx) {
            hoverMinerIdx = hIdx; // ignite this empire (or the whole cluster)
            dirty = true;
          }
          // Clamp here (reading container size is fine in an event handler).
          const cw = container.clientWidth;
          const cs = inCluster ? substrate.satoshiClusterStats() : null;
          setHover({
            left: Math.min(e.global.x + 14, Math.max(8, cw - 270)),
            top: e.global.y + 14,
            addr: cs ? `Satoshi cluster · ~${cs.blocks.toLocaleString()} wallets` : substrate.minerAddr(idx),
            blocks: cs ? cs.blocks : substrate.minerBlockCount(idx),
            block: b,
            date: formatDate(substrate.blockTime(b)),
            isSatoshi: cs ? true : substrate.isSatoshi(idx),
          });
        } else {
          if (hoverMinerIdx !== -1) {
            hoverMinerIdx = -1;
            dirty = true;
          }
          setHover(null);
        }
      });
      const endPan = (e: { global: { x: number; y: number } }) => {
        const moved =
          Math.abs(e.global.x - panStart.x) + Math.abs(e.global.y - panStart.y);
        isPanning = false;
        app.canvas.style.cursor = '';
        // A tap (negligible movement) pins/unpins the empire under the cursor,
        // so its territory stays lit without holding the hover.
        if (moved < 3 && substrate) {
          const { gx, gy } = pixelToCell(e.global.x, e.global.y);
          const n = inverseSpiral(gx, gy);
          const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
          const store = useTimegridStore.getState();
          if (n >= 0 && n < total) {
            const b = blockOfCoinIndex(n);
            const inCluster = store.satoshiCluster && b <= SATOSHI_CLUSTER_MAX_BLOCK;
            const key = inCluster
              ? SATOSHI_CLUSTER_KEY
              : substrate.minerAddr(substrate.minerIdxAt(b));
            // Toggle focus: click the focused miner again to release it. Opens
            // the inspector panel. pinnedMinerIdx + redraw follow the
            // selectedWallet subscription below.
            store.setSelectedWallet(store.selectedWallet === key ? null : key);
          } else {
            store.setSelectedWallet(null); // click empty space → release focus
          }
        }
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);
      app.canvas.addEventListener('pointerleave', () => {
        if (hoverMinerIdx !== -1) {
          hoverMinerIdx = -1;
          dirty = true;
        }
        setHover(null);
      });

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        targetCam = null; // manual zoom cancels any in-flight auto-fit
        const cam = useTimegridStore.getState().camera;
        // Zoom toward the cursor: keep the world point under the pointer fixed.
        const delta = -event.deltaY * 0.0015;
        const nextZoom = Math.max(0.02, Math.min(40, cam.zoom * (1 + delta)));
        const rect = app.canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const worldX = (px - cam.position.x) / cam.zoom;
        const worldY = (py - cam.position.y) / cam.zoom;
        setCamera({
          position: { x: px - worldX * nextZoom, y: py - worldY * nextZoom },
          zoom: nextZoom,
        });
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });
      (app.canvas as HTMLCanvasElement & { _onWheel?: typeof onWheel })._onWheel = onWheel;

      // Redraw only when dirty — the ticker is cheap when idle, and a redraw
      // rebuilds up to DRAW_BUDGET rects (sub-frame even at Max playback).
      app.ticker.add(() => {
        if (targetCam) stepCameraAnimation(); // eases the camera; setCamera marks dirty
        if (!dirty) return;
        dirty = false;
        drawGrid();
      });
      dirty = true;
    })();

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) {
        // While playing, follow the growth — but only re-arm the fit when the
        // grid has outgrown the viewport. If the user is zoomed out enough that
        // the whole grid still fits, leave the camera alone (no per-block
        // re-center). When it overflows, the ticker smoothly eases the camera
        // out to keep holding the whole grid as it grows.
        if (state.playbackPlaying && !gridFitsViewport()) fitToMinted();
        dirty = true;
      }
    });
    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) {
        applyCamera();
        dirty = true;
      }
    });
    const unsubPlay = useTimegridStore.subscribe((state, prev) => {
      if (!prev.playbackPlaying && state.playbackPlaying) {
        fitToMinted(); // smooth ease into frame on play
        dirty = true;
      } else if (prev.playbackPlaying && !state.playbackPlaying) {
        targetCam = null; // pausing hands the camera back to the user immediately
      }
    });
    // Keep the empire highlight in lockstep with the focused miner — whether the
    // selection changed from a canvas click or the inspector's release button.
    const unsubSel = useTimegridStore.subscribe((state, prev) => {
      if (state.selectedWallet !== prev.selectedWallet) {
        pinnedMinerIdx = !state.selectedWallet
          ? -1
          : state.selectedWallet === SATOSHI_CLUSTER_KEY
            ? SATOSHI_CLUSTER_IDX
            : substrate
              ? substrate.idxOf(state.selectedWallet)
              : -1;
        dirty = true;
      }
    });
    const unsubCluster = useTimegridStore.subscribe((state, prev) => {
      if (state.satoshiCluster !== prev.satoshiCluster) {
        // Releasing the cluster while it's the focused entity clears the stale pin.
        if (!state.satoshiCluster && state.selectedWallet === SATOSHI_CLUSTER_KEY) {
          useTimegridStore.getState().setSelectedWallet(null);
        }
        dirty = true;
      }
    });

    return () => {
      cancelled = true;
      unsubBlock();
      unsubSel();
      unsubCluster();
      unsubCam();
      unsubPlay();
      if (appReady) {
        const canvas = app.canvas as
          | (HTMLCanvasElement & { _onWheel?: (e: WheelEvent) => void })
          | undefined;
        if (canvas?._onWheel) canvas.removeEventListener('wheel', canvas._onWheel);
        try {
          app.destroy(true, { children: true });
        } catch {
          // Pixi v8 can throw on double-destroy in dev strict-mode cycles.
        }
      }
    };
  }, []);

  const totalCoins = sub ? cumulativeCoins(sub.tipBlock) : 0;
  const visibleCoins = sub ? cumulativeCoins(currentBlock) : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      aria-label="Timechain Grid — every Bitcoin rendered as a tile on a deterministic spiral, colored by the mining pool that minted it. Drag to pan, scroll to zoom, hover a tile to see its miner."
    >
      {/* Radial vignette — darkens the periphery so the lattice reads with
          depth instead of as a flat pixel sheet. Sits above the canvas, below
          the HUD; transparent center keeps the active region crisp. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(4,4,8,0.78) 100%)',
        }}
      />

      {/* Satoshi cluster toggle + (i) info toast — docked beside Block Stats. */}
      <div className="pointer-events-auto absolute top-3 left-[296px] z-10 flex flex-col items-start gap-1">
        <div className="brass-panel text-mono flex items-center gap-2 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
          <button
            type="button"
            onClick={() => setSatoshiCluster(!satoshiCluster)}
            aria-pressed={satoshiCluster}
            className={[
              'flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors',
              satoshiCluster
                ? 'text-[color:var(--color-amber)]'
                : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-secondary)]',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'inline-block h-2.5 w-2.5 rounded-full border',
                satoshiCluster
                  ? 'border-[color:var(--color-amber)] bg-[color:var(--color-amber)]'
                  : 'border-[color:var(--color-text-muted)]',
              ].join(' ')}
            />
            Satoshi cluster
          </button>
          <span className="group relative inline-flex">
            <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[color:var(--color-text-muted)] text-[9px] lowercase text-[color:var(--color-text-muted)]">
              i
            </span>
            <span className="pointer-events-none absolute top-6 left-1/2 z-30 hidden w-[280px] -translate-x-1/2 rounded-md border border-[color:var(--color-card-border)] bg-[color:var(--color-background)]/95 p-3 text-left text-[10px] leading-relaxed tracking-normal text-[color:var(--color-text-secondary)] normal-case shadow-xl group-hover:block">
              <b className="text-[color:var(--color-amber)]">Satoshi cluster (estimate).</b>{' '}
              In Bitcoin&apos;s first ~2 years, Satoshi mined thousands of blocks — 50&nbsp;BTC
              each — using a fresh address for nearly every block, so on-chain they look like
              ~22,000 unrelated wallets. The famous ~1.1M&nbsp;BTC stash is inferred from the{' '}
              <i>Patoshi</i> nonce pattern, not recorded on-chain. This groups that early
              single-address era into one synthetic Satoshi entity (~1.1M&nbsp;BTC) — a heuristic
              estimate, not ground truth.
            </span>
          </span>
        </div>
      </div>

      {/* Hover tooltip — the miner (coinbase recipient) of the hovered coin. */}
      {hover && (
        <div
          className="text-mono pointer-events-none absolute z-20 max-w-[260px] rounded-md border border-[color:var(--color-card-border)] bg-[color:var(--color-background)]/95 px-3 py-2 text-[11px] leading-relaxed shadow-lg"
          style={{ left: hover.left, top: hover.top }}
        >
          <div
            className="font-semibold tracking-wide"
            style={{ color: hover.isSatoshi ? 'var(--color-brass-bright)' : 'var(--color-accent)' }}
          >
            {hover.isSatoshi ? '◆ Satoshi (genesis)' : 'Miner'}
          </div>
          <div className="mt-0.5 break-all text-[color:var(--color-text-primary)]">
            {shortAddr(hover.addr)}
          </div>
          <div className="mt-1 text-[color:var(--color-text-muted)]">
            mined {hover.blocks.toLocaleString()}{' '}
            {hover.blocks === 1 ? 'block' : 'blocks'}
          </div>
          <div className="text-[color:var(--color-text-muted)]">
            block {hover.block.toLocaleString()} · {hover.date}
          </div>
        </div>
      )}

      {/* Bottom-left brand tagline + cumulative coin counter. */}
      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]"
      >
        <span className="tracking-[0.28em] text-[color:var(--color-accent)] mix-blend-screen">
          {BRAND_TAGLINE}
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          Coins{' '}
          <span className="text-[color:var(--color-text-primary)]">
            {visibleCoins.toLocaleString()}
          </span>{' '}
          / {totalCoins.toLocaleString()}
        </span>
        <span className="normal-case tracking-normal text-[9px] text-[color:var(--color-text-muted)]/70">
          hover a tile → reveal its empire · click to pin
        </span>
      </div>
    </div>
  );
}

/** Lighten a packed 0xRRGGBB toward white by `amount` (0..1). */
function lighten(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}
