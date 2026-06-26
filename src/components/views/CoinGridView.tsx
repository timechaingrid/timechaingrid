'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { loadWalletSubstrate } from '@/data/walletSubstrate';
import { buildEmpireInstances } from '@/lib/gridEmpireInstances';
import { roleOf } from '@/lib/gridEmpireTexture';
import type { WalletInput } from '@/lib/walletEmpires';
import { createEmpireMesh, type EmpireMesh } from '@/lib/gridShader';
import { buildPickIndex, pickEmpire, type PickIndex } from '@/lib/gridEmpirePick';
import type { BuildEmpireRequest, BuildEmpireResponse } from '@/data/gridEmpireWorker';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

/**
 * CoinGridView — Bitcoin as a Civ-6 empire map.
 *
 * Every wallet that ever received ≥1 BTC is an empire: a rounded square sized by
 * holdings (side = ⌊log₁₀(BTC)⌋), packed with whales at the center and the long
 * tail ringing outward. ~850k empires drawn as GPU INSTANCES (one rounded shape
 * each, with padding) — no LOD, no lag. The scrubber reveals empires at their
 * birth block; a toggle hides wallets below 1000 BTC. See gridEmpireInstances.ts
 * + gridShader.ts::createEmpireMesh.
 */

const CELL_SIZE = 8;
const BACKGROUND = 0x08080c;

function shortAddr(a: string): string {
  return a && a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || '(no address)';
}

interface HoverInfo {
  left: number;
  top: number;
  addr: string;
  role: string;
  btc: number;
  firstSeenBlock: number;
}

export function CoinGridView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<EmpireMesh | null>(null);
  const [count, setCount] = useState(0);
  const [showSmall, setShowSmall] = useState(true);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    let appReady = false;

    const viewport = new Container();
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let isPinching = false;
    let lastPinchDist = 0;
    let pickIndex: PickIndex | null = null;
    let lastHovered = -1;

    const { setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    function pixelToCell(globalX: number, globalY: number): { gx: number; gy: number } {
      const cam = useTimegridStore.getState().camera;
      return {
        gx: Math.round((globalX - cam.position.x) / cam.zoom / CELL_SIZE),
        gy: Math.round((globalY - cam.position.y) / cam.zoom / CELL_SIZE),
      };
    }

    function fitToDisc(radiusCells: number) {
      const radiusPx = Math.max(1, radiusCells) * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      const zoom = Math.min(6, Math.max(0.01, (viewportSize / (2 * radiusPx)) * 0.92));
      setCamera({ position: { x: app.screen.width / 2, y: app.screen.height / 2 }, zoom });
    }

    // Pack + emit instances off-thread; fall back to main-thread on worker failure.
    function buildInstances(cols: BuildEmpireRequest): Promise<{
      offset: Float32Array; color: Float32Array; size: Float32Array;
      birth: Float32Array; whale: Float32Array; order: Uint32Array; count: number; radius: number;
    }> {
      return new Promise((resolve) => {
        const fallback = () => {
          const wallets: WalletInput[] = new Array(cols.firstSeen.length);
          for (let i = 0; i < wallets.length; i++) {
            wallets[i] = { address: String(i), firstSeenBlock: cols.firstSeen[i], btc: cols.btc[i], txCount: cols.txCount[i], isMiner: cols.isMiner[i] === 1 };
          }
          resolve(buildEmpireInstances(wallets));
        };
        try {
          const worker = new Worker(new URL('../../data/gridEmpireWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<BuildEmpireResponse>) => {
            const r = e.data;
            resolve({
              offset: new Float32Array(r.offset), color: new Float32Array(r.color), size: new Float32Array(r.size),
              birth: new Float32Array(r.birth), whale: new Float32Array(r.whale), order: new Uint32Array(r.order),
              count: r.count, radius: r.radius,
            });
            worker.terminate();
          };
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
      const inst = await buildInstances({ firstSeen, btc, txCount, isMiner });
      if (cancelled) return;
      if (!cancelled) setCount(inst.count);

      await app.init({
        resizeTo: container,
        background: BACKGROUND,
        antialias: true, // smooth the rounded corners
        resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        autoDensity: true,
      });
      if (cancelled) { app.destroy(true, { children: true }); return; }
      container.appendChild(app.canvas);
      appReady = true;
      app.stage.addChild(viewport);

      const mesh = createEmpireMesh({
        offset: inst.offset, color: inst.color, size: inst.size,
        birth: inst.birth, whale: inst.whale, count: inst.count, cellSize: CELL_SIZE,
      });
      meshRef.current = mesh;
      viewport.addChild(mesh.mesh);
      mesh.setCurrentBlock(useTimegridStore.getState().currentBlock);
      mesh.setShowSmall(showSmall);
      pickIndex = buildPickIndex(inst.offset, inst.size, inst.count);
      fitToDisc(inst.radius);
      applyCamera();

      app.stage.eventMode = 'static';
      app.stage.hitArea = { contains: () => true };
      app.stage.on('pointerdown', (e) => {
        if (isPinching) return;
        isPanning = true;
        lastHovered = -1;
        meshRef.current?.setHovered(-1); // clear hover while dragging
        setHover(null);
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (isPinching) return;
        if (isPanning) {
          const cam = useTimegridStore.getState().camera;
          setCamera({ position: { x: panStartCam.x + (e.global.x - panStart.x), y: panStartCam.y + (e.global.y - panStart.y) }, zoom: cam.zoom });
          return;
        }
        if (!pickIndex) return;
        const { gx, gy } = pixelToCell(e.global.x, e.global.y);
        const i = pickEmpire(pickIndex, gx, gy);
        if (i === lastHovered) return;
        lastHovered = i;
        meshRef.current?.setHovered(i);
        if (i < 0) { setHover(null); return; }
        const w = wallets[inst.order[i]];
        if (!w) { setHover(null); return; }
        const btc = Number(w.totalReceivedSats) / 1e8;
        const cw = container.clientWidth;
        setHover({
          left: Math.min(e.global.x + 14, Math.max(8, cw - 250)),
          top: e.global.y + 14,
          addr: w.address,
          role: roleOf({ btc, txCount: w.txCount, isMiner: w.isMiner, firstSeenBlock: w.firstSeenBlock }),
          btc,
          firstSeenBlock: w.firstSeenBlock,
        });
      });
      const endPan = () => { isPanning = false; app.canvas.style.cursor = ''; };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);
      app.canvas.addEventListener('pointerleave', () => { lastHovered = -1; meshRef.current?.setHovered(-1); setHover(null); });

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
        const scale = nd / lastPinchDist; lastPinchDist = nd;
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
    })().catch((err) => { if (!cancelled) console.warn('[grid] empire map load failed:', err); });

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) meshRef.current?.setCurrentBlock(state.currentBlock);
    });
    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });

    return () => {
      cancelled = true;
      unsubBlock();
      unsubCam();
      meshRef.current?.destroy();
      meshRef.current = null;
      if (appReady) {
        const canvas = app.canvas as HTMLCanvasElement & { _onWheel?: (e: WheelEvent) => void; _onTS?: (e: TouchEvent) => void; _onTM?: (e: TouchEvent) => void; _onTE?: (e: TouchEvent) => void; };
        if (canvas?._onWheel) canvas.removeEventListener('wheel', canvas._onWheel);
        if (canvas?._onTS) canvas.removeEventListener('touchstart', canvas._onTS);
        if (canvas?._onTM) canvas.removeEventListener('touchmove', canvas._onTM);
        if (canvas?._onTE) { canvas.removeEventListener('touchend', canvas._onTE); canvas.removeEventListener('touchcancel', canvas._onTE); }
        try { app.destroy(true, { children: true }); } catch { /* double-destroy in dev strict-mode */ }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSmall() {
    const next = !showSmall;
    setShowSmall(next);
    meshRef.current?.setShowSmall(next);
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      aria-label="Timechain Grid — every wallet that ever held ≥1 BTC as an empire, sized by holdings, whales at the center. Drag to pan, pinch to zoom."
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(4,4,8,0.7) 100%)' }} />

      {/* <1000 BTC visibility toggle */}
      <div className="absolute top-3 left-[296px] z-10">
        <button
          type="button"
          onClick={toggleSmall}
          aria-pressed={showSmall}
          className={[
            'brass-panel text-mono rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors',
            showSmall ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-secondary)]',
          ].join(' ')}
        >
          {showSmall ? '◧ all wallets' : '◧ whales only'}
        </button>
      </div>

      {/* Hover tooltip — the wallet (empire) under the cursor. */}
      {hover && (
        <div
          className="text-mono pointer-events-none absolute z-20 max-w-[240px] rounded-md border border-[color:var(--color-card-border)] bg-[color:var(--color-background)]/95 px-3 py-2 text-[11px] leading-relaxed shadow-lg"
          style={{ left: hover.left, top: hover.top }}
        >
          <div className="font-semibold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {hover.role}
          </div>
          <div className="mt-0.5 break-all text-[color:var(--color-text-primary)]">{shortAddr(hover.addr)}</div>
          <div className="mt-1 text-[color:var(--color-text-muted)]">
            {hover.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC received
          </div>
          <div className="text-[color:var(--color-text-muted)]">first seen · block {hover.firstSeenBlock.toLocaleString()}</div>
        </div>
      )}

      <div aria-hidden className="text-mono pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]">
        <span className="tracking-[0.28em] text-[color:var(--color-accent)] mix-blend-screen">{BRAND_TAGLINE}</span>
        <span className="text-[color:var(--color-text-muted)]">Empires <span className="text-[color:var(--color-text-primary)]">{count.toLocaleString()}</span></span>
        <span className="normal-case tracking-normal text-[9px] text-[color:var(--color-text-muted)]/70">whales center · holders outward</span>
      </div>
    </div>
  );
}
