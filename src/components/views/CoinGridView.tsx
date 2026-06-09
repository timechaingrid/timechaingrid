'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import {
  inverseSpiral,
  cumulativeCoins,
  blockOfCoinIndex,
  ringForCount,
} from '@/lib/coinGrid';
import { loadCoinSubstrate, type CoinSubstrate } from '@/data/coinSubstrate';
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
const HALVING_RING = 0xffd700; // gold epoch boundary
const FRONTIER_RING = 0xf5a623; // amber — the just-minted outer edge

// LOD: aim for each DRAWN block to cover ~this many device px. When zoom shrinks
// a cell below this, we stride (aggregate stride×stride coins into one rect).
const LOD_TARGET_PX = 1.1;
// Hard ceiling on rects per redraw — the stride is bumped until the visible
// cell count fits under this, so a full zoom-out of 19.9M coins still draws in
// one cheap pass.
const DRAW_BUDGET = 45_000;

const SATOSHI_RING_COLOR = 0xc28840;

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
    const ringsG = new Graphics(); // halving + frontier rings
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let substrate: CoinSubstrate | null = null;

    const { setCurrentBlock, setLatestBlock, setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    // Fit the minted region into the viewport, centered. Called on play-start
    // and (while playing) on each block so the camera zooms out as the lattice
    // grows — the signature "watch the map expand" motion. When paused the user
    // owns the camera.
    function fitToMinted() {
      if (!appReady || !substrate) return;
      const block = useTimegridStore.getState().currentBlock;
      const total = cumulativeCoins(block);
      if (total <= 0) return;
      const ring = Math.max(1, ringForCount(total));
      const radiusPx = ring * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      const fitZoom = Math.min(6, Math.max(0.02, (viewportSize / (2 * radiusPx)) * 0.82));
      setCamera({
        position: { x: app.screen.width / 2, y: app.screen.height / 2 },
        zoom: fitZoom,
      });
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
      ringsG.clear();
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

      // LOD stride: each drawn block ≈ LOD_TARGET_PX device px; then bump until
      // the visible cell count fits the draw budget.
      const effCell = CELL_SIZE * cam.zoom;
      let stride = Math.max(1, Math.round(LOD_TARGET_PX / effCell));
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
      // Recent-frontier emphasis: coins minted within the last ~day of the
      // scrubber position glow slightly brighter to mark "the growing edge".
      const frontierBlock = block - 144;

      for (let gy = gyLo; gy <= gyHi; gy += stride) {
        for (let gx = gxLo; gx <= gxHi; gx += stride) {
          const n = inverseSpiral(gx, gy);
          if (n < 0 || n >= total) continue;
          const b = blockOfCoinIndex(n);
          const idx = substrate.minerIdxAt(b);
          let color = substrate.minerColor(idx);
          // Frontier coins brightened; everything else true pool color.
          if (b >= frontierBlock) {
            color = lighten(color, 0.35);
          }
          const x0 = gx * CELL_SIZE - half;
          const y0 = gy * CELL_SIZE - half;
          gridG.rect(x0, y0, span, span).fill(color);
        }
      }

      // Halving epoch rings: a square outline at the spiral radius reached by
      // each halving boundary that has occurred by `block`.
      const epoch = Math.floor(block / 210_000);
      for (let k = 1; k <= epoch; k++) {
        const coinsBefore = cumulativeCoins(210_000 * k - 1);
        const ring = ringForCount(coinsBefore);
        if (ring <= 0 || ring > maxRing) continue;
        const r = ring * CELL_SIZE + half;
        ringsG
          .rect(-r, -r, 2 * r, 2 * r)
          .stroke({ width: Math.max(1, 1.5 / cam.zoom), color: HALVING_RING, alpha: 0.5 });
      }
      // Frontier ring — the outer edge of the currently-minted region.
      const fr = maxRing * CELL_SIZE + half;
      ringsG
        .rect(-fr, -fr, 2 * fr, 2 * fr)
        .stroke({ width: Math.max(1, 1.5 / cam.zoom), color: FRONTIER_RING, alpha: 0.35 });
      // Satoshi origin marker — a small brass square at dead center so the
      // genesis is always findable even at full zoom-out.
      const oc = CELL_SIZE * 1.5;
      ringsG
        .rect(-oc, -oc, 2 * oc, 2 * oc)
        .stroke({ width: Math.max(1, 1.5 / cam.zoom), color: SATOSHI_RING_COLOR, alpha: 0.8 });
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
        antialias: false, // square tiles; AA buys nothing and costs fill-rate
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
      viewport.addChild(ringsG);
      app.stage.addChild(viewport);

      // Fresh camera → fit the full minted grid on first paint.
      const initCam = useTimegridStore.getState().camera;
      if (initCam.position.x === 0 && initCam.position.y === 0 && initCam.zoom === 1) {
        fitToMinted();
      }
      applyCamera();

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };

      app.stage.on('pointerdown', (e) => {
        isPanning = true;
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPanning) {
          const dx = e.global.x - panStart.x;
          const dy = e.global.y - panStart.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            useTimegridStore.getState().setPlaybackPlaying(false);
          }
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
          const idx = substrate.minerIdxAt(b);
          // Clamp here (reading container size is fine in an event handler).
          const cw = container.clientWidth;
          setHover({
            left: Math.min(e.global.x + 14, Math.max(8, cw - 270)),
            top: e.global.y + 14,
            addr: substrate.minerAddr(idx),
            blocks: substrate.minerBlockCount(idx),
            block: b,
            date: formatDate(substrate.blockTime(b)),
            isSatoshi: substrate.isSatoshi(idx),
          });
        } else {
          setHover(null);
        }
      });
      const endPan = () => {
        isPanning = false;
        app.canvas.style.cursor = '';
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);
      app.canvas.addEventListener('pointerleave', () => setHover(null));

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
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
        if (!dirty) return;
        dirty = false;
        drawGrid();
      });
      dirty = true;
    })();

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) {
        // While playing, follow the growth (zoom out as the grid expands);
        // when paused, the user owns the camera and we just redraw.
        if (state.playbackPlaying) fitToMinted();
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
        fitToMinted();
        dirty = true;
      }
    });

    return () => {
      cancelled = true;
      unsubBlock();
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
        className="text-mono pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]"
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
