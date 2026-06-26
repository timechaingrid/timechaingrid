'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { loadWalletSubstrate } from '@/data/walletSubstrate';
import { buildEmpireTexture } from '@/lib/gridEmpireTexture';
import type { WalletInput } from '@/lib/walletEmpires';
import { createEmpireMesh, type EmpireMesh } from '@/lib/gridShader';
import type { BuildEmpireRequest, BuildEmpireResponse } from '@/data/gridEmpireWorker';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

/**
 * CoinGridView — Bitcoin as a Civ-6 empire map.
 *
 * Every wallet that ever received ≥1 BTC is an empire occupying a square block
 * of cells sized by holdings (side = ⌊log₁₀(BTC)⌋): whales tower at the center,
 * the long tail of smaller holders rings outward. ~850k empires (~5.8M cells) —
 * far too many for rects, so they're packed + baked into ONE GPU texture
 * (off-thread; src/data/gridEmpireWorker.ts) and drawn as a single quad with
 * nearest-neighbor sampling for crisp territories. Color = role, brightness =
 * holdings, baked borders mark each territory. See docs/cluster-lattice-design.md.
 */

const CELL_SIZE = 8; // world px per grid cell at zoom 1.0
const BACKGROUND = 0x08080c;

export function CoinGridView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    let appReady = false;

    const viewport = new Container();
    let mesh: EmpireMesh | null = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let isPinching = false;
    let lastPinchDist = 0;

    const { setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    function fitToDisc(radiusCells: number) {
      const radiusPx = Math.max(1, radiusCells) * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      const zoom = Math.min(6, Math.max(0.01, (viewportSize / (2 * radiusPx)) * 0.92));
      setCamera({ position: { x: app.screen.width / 2, y: app.screen.height / 2 }, zoom });
    }

    // Pack + bake the empire texture off-thread; fall back to main-thread on
    // worker failure (a brief freeze, but always renders).
    function buildTexture(cols: BuildEmpireRequest): Promise<BuildEmpireResponse> {
      return new Promise((resolve) => {
        const fallback = () => {
          const wallets: WalletInput[] = new Array(cols.firstSeen.length);
          for (let i = 0; i < wallets.length; i++) {
            wallets[i] = {
              address: String(i),
              firstSeenBlock: cols.firstSeen[i],
              btc: cols.btc[i],
              txCount: cols.txCount[i],
              isMiner: cols.isMiner[i] === 1,
            };
          }
          const t = buildEmpireTexture(wallets);
          resolve({ data: t.data.buffer as ArrayBuffer, side: t.side, radius: t.radius, count: t.count });
        };
        try {
          const worker = new Worker(new URL('../../data/gridEmpireWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<BuildEmpireResponse>) => { resolve(e.data); worker.terminate(); };
          worker.onerror = (ev) => { console.warn('[grid] worker error → fallback:', ev.message); worker.terminate(); fallback(); };
          worker.postMessage(cols, [cols.firstSeen.buffer, cols.btc.buffer, cols.txCount.buffer, cols.isMiner.buffer]);
        } catch (err) {
          console.warn('[grid] worker construct failed → fallback:', err);
          fallback();
        }
      });
    }

    void (async () => {
      const { tipBlock, wallets } = await loadWalletSubstrate();
      if (cancelled) return;
      const store = useTimegridStore.getState();
      if (store.latestBlock === 0) {
        store.setLatestBlock(tipBlock);
        store.setCurrentBlock(tipBlock);
      }

      // Columns → worker (transferred zero-copy).
      const n = wallets.length;
      const firstSeen = new Int32Array(n);
      const btc = new Float64Array(n);
      const txCount = new Int32Array(n);
      const isMiner = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        firstSeen[i] = wallets[i].firstSeenBlock;
        btc[i] = Number(wallets[i].totalReceivedSats) / 1e8;
        txCount[i] = wallets[i].txCount;
        isMiner[i] = wallets[i].isMiner ? 1 : 0;
      }
      const baked = await buildTexture({ firstSeen, btc, txCount, isMiner });
      if (cancelled) return;
      if (!cancelled) setCount(baked.count);

      await app.init({
        resizeTo: container,
        background: BACKGROUND,
        antialias: false, // crisp square cells
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

      mesh = createEmpireMesh({
        colorData: new Uint8Array(baked.data),
        side: baked.side,
        radius: baked.radius,
        cellSize: CELL_SIZE,
      });
      viewport.addChild(mesh.mesh);
      fitToDisc(baked.radius);
      applyCamera();

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };
      app.stage.on('pointerdown', (e) => {
        if (isPinching) return;
        isPanning = true;
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPinching || !isPanning) return;
        const cam = useTimegridStore.getState().camera;
        setCamera({
          position: { x: panStartCam.x + (e.global.x - panStart.x), y: panStartCam.y + (e.global.y - panStart.y) },
          zoom: cam.zoom,
        });
      });
      const endPan = () => { isPanning = false; app.canvas.style.cursor = ''; };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const cam = useTimegridStore.getState().camera;
        const nextZoom = Math.max(0.01, Math.min(60, cam.zoom * (1 - event.deltaY * 0.0015)));
        const rect = app.canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const wx = (px - cam.position.x) / cam.zoom;
        const wy = (py - cam.position.y) / cam.zoom;
        setCamera({ position: { x: px - wx * nextZoom, y: py - wy * nextZoom }, zoom: nextZoom });
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const onTS = (e: TouchEvent) => { if (e.touches.length >= 2) { e.preventDefault(); isPinching = true; isPanning = false; lastPinchDist = dist(e.touches); } };
      const onTM = (e: TouchEvent) => {
        if (!isPinching || e.touches.length < 2) return;
        e.preventDefault();
        const nd = dist(e.touches);
        if (lastPinchDist <= 0) { lastPinchDist = nd; return; }
        const scale = nd / lastPinchDist;
        lastPinchDist = nd;
        const cam = useTimegridStore.getState().camera;
        const nextZoom = Math.max(0.01, Math.min(60, cam.zoom * scale));
        const rect = app.canvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const wx = (mx - cam.position.x) / cam.zoom;
        const wy = (my - cam.position.y) / cam.zoom;
        setCamera({ position: { x: mx - wx * nextZoom, y: my - wy * nextZoom }, zoom: nextZoom });
      };
      const onTE = (e: TouchEvent) => { if (e.touches.length < 2) { isPinching = false; lastPinchDist = 0; } };
      const c = app.canvas as HTMLCanvasElement & { _onWheel?: typeof onWheel; _onTS?: typeof onTS; _onTM?: typeof onTM; _onTE?: typeof onTE; };
      c._onWheel = onWheel; c._onTS = onTS; c._onTM = onTM; c._onTE = onTE;
      app.canvas.addEventListener('touchstart', onTS, { passive: false });
      app.canvas.addEventListener('touchmove', onTM, { passive: false });
      app.canvas.addEventListener('touchend', onTE);
      app.canvas.addEventListener('touchcancel', onTE);
    })().catch((err) => {
      if (!cancelled) console.warn('[grid] empire map load failed:', err);
    });

    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });

    return () => {
      cancelled = true;
      unsubCam();
      mesh?.destroy();
      if (appReady) {
        const canvas = app.canvas as HTMLCanvasElement & {
          _onWheel?: (e: WheelEvent) => void; _onTS?: (e: TouchEvent) => void; _onTM?: (e: TouchEvent) => void; _onTE?: (e: TouchEvent) => void;
        };
        if (canvas?._onWheel) canvas.removeEventListener('wheel', canvas._onWheel);
        if (canvas?._onTS) canvas.removeEventListener('touchstart', canvas._onTS);
        if (canvas?._onTM) canvas.removeEventListener('touchmove', canvas._onTM);
        if (canvas?._onTE) { canvas.removeEventListener('touchend', canvas._onTE); canvas.removeEventListener('touchcancel', canvas._onTE); }
        try { app.destroy(true, { children: true }); } catch { /* double-destroy in dev strict-mode */ }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      aria-label="Timechain Grid — every wallet that ever held ≥1 BTC as an empire, sized by holdings, whales at the center. Drag to pan, pinch to zoom."
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(4,4,8,0.78) 100%)' }}
      />
      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]"
      >
        <span className="tracking-[0.28em] text-[color:var(--color-accent)] mix-blend-screen">
          {BRAND_TAGLINE}
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          Empires <span className="text-[color:var(--color-text-primary)]">{count.toLocaleString()}</span>
        </span>
        <span className="normal-case tracking-normal text-[9px] text-[color:var(--color-text-muted)]/70">
          whales center · holders outward
        </span>
      </div>
    </div>
  );
}
