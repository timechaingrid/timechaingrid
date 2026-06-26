'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { cumulativeCoins, blockOfCoinIndex } from '@/lib/coinGrid';
import { discIndexOf, discRadius } from '@/lib/discGrid';
import { buildBlockTexture } from '@/lib/gridTexture';
import { createGridMesh, type GridMesh } from '@/lib/gridShader';
import { MinerOwnerProvider } from '@/data/ownerProvider';
import type { BuildTextureRequest, BuildTextureResponse } from '@/data/gridTextureWorker';
import {
  loadCoinSubstrate,
  type CoinSubstrate,
  SATOSHI_CLUSTER_KEY,
  SATOSHI_CLUSTER_MAX_BLOCK,
} from '@/data/coinSubstrate';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

/**
 * CoinGridView — Bitcoin's coin issuance as a CIRCULAR 2D real-estate map.
 *
 * Every whole BTC ever minted is a square "pixel" on a deterministic Euclidean
 * disc (src/lib/discGrid.ts) growing out from Satoshi's genesis at the origin —
 * a disc, not a square. At the tip that's ~19.9M cells, rendered as ONE GPU
 * texture (src/lib/gridShader.ts): the renderer no longer iterates coins or
 * strides an LOD — it bakes the disc into a texture once (off-thread) and draws
 * a single quad. Square pixels come from nearest-neighbor sampling; the scrubber
 * is a single shader uniform (a cell shows iff its block ≤ currentBlock).
 *
 * Color = the block's MINER (coinbase recipient), via a block-indexed lookup, so
 * mining pools paint contiguous arcs as the disc winds outward. Hover/click read
 * back through the disc layout to name the miner. (Empire hover-light + the
 * Satoshi cluster lens are being re-wired onto the texture path — see
 * docs/cluster-lattice-design.md.)
 */

const CELL_SIZE = 6; // world px per coin cell at zoom 1.0
const BACKGROUND = 0x08080c;
// Per-frame easing fraction for the auto-fit camera (exponential ease-out).
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
  left: number;
  top: number;
  addr: string;
  blocks: number;
  block: number;
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

    const viewport = new Container();
    let gridMesh: GridMesh | null = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let isPinching = false;
    let lastPinchDist = 0;
    let substrate: CoinSubstrate | null = null;
    let targetCam: { position: { x: number; y: number }; zoom: number } | null = null;

    const { setCurrentBlock, setLatestBlock, setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    // Fit the minted DISC into the viewport, centered. Arms a camera target the
    // ticker eases toward (smooth zoom-out as the disc grows); `instant` snaps.
    function fitToMinted(instant = false) {
      if (!appReady || !substrate) return;
      const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
      if (total <= 0) return;
      const radiusPx = Math.max(1, discRadius(total)) * CELL_SIZE;
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
        targetCam = target;
      }
    }

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

    // Does the whole minted disc currently fit inside the viewport? Drives the
    // auto-fit decision during playback (only re-fit once it overflows).
    function gridFitsViewport(): boolean {
      if (!appReady) return true;
      const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
      if (total <= 0) return true;
      const R = (discRadius(total) + 0.5) * CELL_SIZE;
      const gridPx = 2 * R * useTimegridStore.getState().camera.zoom;
      return gridPx <= Math.min(app.screen.width, app.screen.height);
    }

    // World pixel → disc cell (integer lattice coordinate).
    function pixelToCell(globalX: number, globalY: number): { gx: number; gy: number } {
      const cam = useTimegridStore.getState().camera;
      const worldX = (globalX - cam.position.x) / cam.zoom;
      const worldY = (globalY - cam.position.y) / cam.zoom;
      return { gx: Math.round(worldX / CELL_SIZE), gy: Math.round(worldY / CELL_SIZE) };
    }

    // Block-indexed color LUT: block → its miner color (RGBA8). Sampled in-shader.
    function buildColorLut(provider: MinerOwnerProvider): {
      lut: Uint8Array;
      lutW: number;
      lutH: number;
    } {
      const lutW = 2048;
      const lutH = Math.max(1, Math.ceil((provider.maxBlock + 1) / lutW));
      const lut = new Uint8Array(lutW * lutH * 4);
      for (let b = 0; b <= provider.maxBlock; b++) {
        const color = provider.colorOfBlock(b);
        const o = b * 4;
        lut[o] = (color >> 16) & 0xff;
        lut[o + 1] = (color >> 8) & 0xff;
        lut[o + 2] = color & 0xff;
        lut[o + 3] = 255;
      }
      return { lut, lutW, lutH };
    }

    // Build the block texture off-thread (worker); fall back to a main-thread
    // build if the worker can't be constructed (brief freeze, but always renders).
    function buildBlockTextureAsync(
      totalCoins: number,
    ): Promise<{ data: Uint8Array; side: number; radius: number }> {
      return new Promise((resolve) => {
        const fallback = () => {
          const t = buildBlockTexture(totalCoins);
          resolve({ data: t.data, side: t.side, radius: t.radius });
        };
        try {
          const worker = new Worker(
            new URL('../../data/gridTextureWorker.ts', import.meta.url),
            { type: 'module' },
          );
          worker.onmessage = (e: MessageEvent<BuildTextureResponse>) => {
            resolve({ data: new Uint8Array(e.data.data), side: e.data.side, radius: e.data.radius });
            worker.terminate();
          };
          worker.onerror = () => {
            worker.terminate();
            fallback();
          };
          worker.postMessage({ totalCoins } satisfies BuildTextureRequest);
        } catch {
          fallback();
        }
      });
    }

    void (async () => {
      const loaded = await loadCoinSubstrate();
      if (cancelled) return;
      substrate = loaded;
      if (useTimegridStore.getState().latestBlock === 0) {
        setLatestBlock(loaded.tipBlock);
        setCurrentBlock(loaded.tipBlock);
      }
      setSub(loaded);

      await app.init({
        resizeTo: container,
        background: BACKGROUND,
        antialias: false, // crisp square pixels — no edge softening on the mosaic
        resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        autoDensity: true,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      container.appendChild(app.canvas);
      appReady = true;
      app.stage.addChild(viewport);

      // Bake the circular disc into one texture and draw it as a single quad.
      const provider = new MinerOwnerProvider(loaded);
      const built = await buildBlockTextureAsync(provider.totalCoins);
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      const { lut, lutW, lutH } = buildColorLut(provider);
      gridMesh = createGridMesh({
        blockData: built.data,
        side: built.side,
        radius: built.radius,
        cellSize: CELL_SIZE,
        colorLut: lut,
        lutW,
        lutH,
      });
      viewport.addChild(gridMesh.mesh);
      gridMesh.setCurrentBlock(useTimegridStore.getState().currentBlock);

      const initCam = useTimegridStore.getState().camera;
      if (initCam.position.x === 0 && initCam.position.y === 0 && initCam.zoom === 1) {
        fitToMinted(true);
      }
      applyCamera();

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };

      app.stage.on('pointerdown', (e) => {
        if (isPinching) return;
        isPanning = true;
        targetCam = null;
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPinching) return;
        if (isPanning) {
          const dx = e.global.x - panStart.x;
          const dy = e.global.y - panStart.y;
          const cam = useTimegridStore.getState().camera;
          setCamera({ position: { x: panStartCam.x + dx, y: panStartCam.y + dy }, zoom: cam.zoom });
          return;
        }
        if (!substrate) return;
        const { gx, gy } = pixelToCell(e.global.x, e.global.y);
        const n = discIndexOf(gx, gy);
        const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
        if (n >= 0 && n < total) {
          const b = blockOfCoinIndex(n);
          const inCluster =
            useTimegridStore.getState().satoshiCluster && b <= SATOSHI_CLUSTER_MAX_BLOCK;
          const idx = substrate.minerIdxAt(b);
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
          setHover(null);
        }
      });
      const endPan = (e: { global: { x: number; y: number } }) => {
        const moved = Math.abs(e.global.x - panStart.x) + Math.abs(e.global.y - panStart.y);
        isPanning = false;
        app.canvas.style.cursor = '';
        if (moved < 3 && substrate) {
          const { gx, gy } = pixelToCell(e.global.x, e.global.y);
          const n = discIndexOf(gx, gy);
          const total = cumulativeCoins(useTimegridStore.getState().currentBlock);
          const store = useTimegridStore.getState();
          if (n >= 0 && n < total) {
            const b = blockOfCoinIndex(n);
            const inCluster = store.satoshiCluster && b <= SATOSHI_CLUSTER_MAX_BLOCK;
            const key = inCluster
              ? SATOSHI_CLUSTER_KEY
              : substrate.minerAddr(substrate.minerIdxAt(b));
            store.setSelectedWallet(store.selectedWallet === key ? null : key);
          } else {
            store.setSelectedWallet(null);
          }
        }
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);
      app.canvas.addEventListener('pointerleave', () => setHover(null));

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        targetCam = null;
        const cam = useTimegridStore.getState().camera;
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

      // Pinch-to-zoom for touch screens.
      const ZOOM_MIN_GRID = 0.02;
      const ZOOM_MAX_GRID = 40;
      function getTouchDistGrid(t: TouchList): number {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }
      function getTouchMidGrid(t: TouchList, rect: DOMRect): { x: number; y: number } {
        return {
          x: (t[0].clientX + t[1].clientX) / 2 - rect.left,
          y: (t[0].clientY + t[1].clientY) / 2 - rect.top,
        };
      }
      const onGridTouchStart = (e: TouchEvent): void => {
        if (e.touches.length < 2) return;
        e.preventDefault();
        isPinching = true;
        isPanning = false;
        targetCam = null;
        app.canvas.style.cursor = '';
        lastPinchDist = getTouchDistGrid(e.touches);
      };
      const onGridTouchMove = (e: TouchEvent): void => {
        if (!isPinching || e.touches.length < 2) return;
        e.preventDefault();
        const newDist = getTouchDistGrid(e.touches);
        if (lastPinchDist <= 0) {
          lastPinchDist = newDist;
          return;
        }
        const scale = newDist / lastPinchDist;
        lastPinchDist = newDist;
        const cam = useTimegridStore.getState().camera;
        const nextZoom = Math.max(ZOOM_MIN_GRID, Math.min(ZOOM_MAX_GRID, cam.zoom * scale));
        const rect = app.canvas.getBoundingClientRect();
        const mid = getTouchMidGrid(e.touches, rect);
        const wx = (mid.x - cam.position.x) / cam.zoom;
        const wy = (mid.y - cam.position.y) / cam.zoom;
        setCamera({
          position: { x: mid.x - wx * nextZoom, y: mid.y - wy * nextZoom },
          zoom: nextZoom,
        });
      };
      const onGridTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length < 2) {
          isPinching = false;
          lastPinchDist = 0;
        }
      };
      const c = app.canvas as HTMLCanvasElement & {
        _onWheel?: typeof onWheel;
        _onTouchStart?: typeof onGridTouchStart;
        _onTouchMove?: typeof onGridTouchMove;
        _onTouchEnd?: typeof onGridTouchEnd;
      };
      c._onWheel = onWheel;
      c._onTouchStart = onGridTouchStart;
      c._onTouchMove = onGridTouchMove;
      c._onTouchEnd = onGridTouchEnd;
      app.canvas.addEventListener('touchstart', onGridTouchStart, { passive: false });
      app.canvas.addEventListener('touchmove', onGridTouchMove, { passive: false });
      app.canvas.addEventListener('touchend', onGridTouchEnd);
      app.canvas.addEventListener('touchcancel', onGridTouchEnd);

      // The mesh auto-renders each frame; the ticker only eases the camera.
      app.ticker.add(() => {
        if (targetCam) stepCameraAnimation();
      });
    })();

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) {
        gridMesh?.setCurrentBlock(state.currentBlock);
        if (state.playbackPlaying && !gridFitsViewport()) fitToMinted();
      }
    });
    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });
    const unsubPlay = useTimegridStore.subscribe((state, prev) => {
      if (!prev.playbackPlaying && state.playbackPlaying) {
        fitToMinted();
      } else if (prev.playbackPlaying && !state.playbackPlaying) {
        targetCam = null;
      }
    });
    const unsubCluster = useTimegridStore.subscribe((state, prev) => {
      if (state.satoshiCluster !== prev.satoshiCluster) {
        if (!state.satoshiCluster && state.selectedWallet === SATOSHI_CLUSTER_KEY) {
          useTimegridStore.getState().setSelectedWallet(null);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubBlock();
      unsubCluster();
      unsubCam();
      unsubPlay();
      gridMesh?.destroy();
      if (appReady) {
        const canvas = app.canvas as
          | (HTMLCanvasElement & {
              _onWheel?: (e: WheelEvent) => void;
              _onTouchStart?: (e: TouchEvent) => void;
              _onTouchMove?: (e: TouchEvent) => void;
              _onTouchEnd?: (e: TouchEvent) => void;
            })
          | undefined;
        if (canvas?._onWheel) canvas.removeEventListener('wheel', canvas._onWheel);
        if (canvas) {
          if (canvas._onTouchStart) canvas.removeEventListener('touchstart', canvas._onTouchStart);
          if (canvas._onTouchMove) canvas.removeEventListener('touchmove', canvas._onTouchMove);
          if (canvas._onTouchEnd) {
            canvas.removeEventListener('touchend', canvas._onTouchEnd);
            canvas.removeEventListener('touchcancel', canvas._onTouchEnd);
          }
        }
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
      style={{ touchAction: 'none' }}
      aria-label="Timechain Grid — every Bitcoin rendered as a square pixel on a deterministic disc, colored by the mining pool that minted it. Drag to pan, pinch to zoom, tap a pixel to see its miner."
    >
      {/* Radial vignette — darkens the periphery so the lattice reads with depth. */}
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
          hover a pixel → its miner · click to pin
        </span>
      </div>
    </div>
  );
}
