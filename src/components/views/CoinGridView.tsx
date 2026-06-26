'use client';

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { loadWalletSubstrate } from '@/data/walletSubstrate';
import { packEmpires, cellKey, type Placement, type WalletInput } from '@/lib/walletEmpires';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

/**
 * CoinGridView — Bitcoin as a Civ-6-style empire map.
 *
 * Each WALLET is an empire occupying a square block of cells sized by its
 * lifetime BTC received (src/lib/walletEmpires.ts): whales are big territories
 * packed at the center, smaller holders ring outward, Satoshi the largest at
 * dead center. Color = role (miner/whale/significant/dust), brightness = wealth,
 * a bold border per empire. The scrubber lights empires up at their birth block.
 *
 * ~12k empires (free tier) render as bordered rects — no 21M-coin texture, no
 * LOD. "Holdings" = lifetime received (true balance arrives with the ownership
 * pipeline). See docs/cluster-lattice-design.md.
 */

const CELL_SIZE = 8; // world px per grid cell at zoom 1.0
const BACKGROUND = 0x08080c;
const GAP_FRAC = 0.14; // grout between empires (fraction of a cell)

const ROLE_COLOR: Record<string, number> = {
  satoshi: 0xc9962e, // brass-gold
  miner: 0xd1495b, // red
  whale: 0xf5c542, // gold
  significant: 0x32c8e0, // cyan
  dust: 0x6b7280, // grey
};

function roleOf(w: { btc: number; txCount: number; isMiner: boolean; firstSeenBlock: number }): string {
  if (w.firstSeenBlock === 0 && w.isMiner) return 'satoshi';
  if (w.isMiner) return 'miner';
  if (w.btc >= 1000) return 'whale';
  if (w.btc >= 1 || w.txCount >= 100) return 'significant';
  return 'dust';
}

/** Lighten 0xRRGGBB toward white by amount (0..1). */
function lighten(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = (v: number) => Math.round(v + (255 - v) * amount) & 0xff;
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

function shortAddr(a: string): string {
  if (!a) return '(no address)';
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
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
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    let appReady = false;

    const viewport = new Container();
    const gridG = new Graphics();
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panStartCam = { x: 0, y: 0 };
    let isPinching = false;
    let lastPinchDist = 0;

    let placements: Placement[] = [];
    let fillColors: number[] = [];
    let cellToEmpire = new Map<number, number>();

    const { setCamera } = useTimegridStore.getState();

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    // Fit the whole packed empire disc into the viewport, centered (instant).
    function fitToDisc(radiusCells: number) {
      const radiusPx = Math.max(1, radiusCells) * CELL_SIZE;
      const viewportSize = Math.min(app.screen.width, app.screen.height);
      const zoom = Math.min(6, Math.max(0.02, (viewportSize / (2 * radiusPx)) * 0.9));
      setCamera({
        position: { x: app.screen.width / 2, y: app.screen.height / 2 },
        zoom,
      });
    }

    function pixelToCell(globalX: number, globalY: number): { gx: number; gy: number } {
      const cam = useTimegridStore.getState().camera;
      const worldX = (globalX - cam.position.x) / cam.zoom;
      const worldY = (globalY - cam.position.y) / cam.zoom;
      return { gx: Math.round(worldX / CELL_SIZE), gy: Math.round(worldY / CELL_SIZE) };
    }

    // Draw every empire born at or before currentBlock as a bordered rect.
    function drawEmpires() {
      if (!appReady) return;
      const block = useTimegridStore.getState().currentBlock;
      const gap = CELL_SIZE * GAP_FRAC;
      gridG.clear();
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        if (p.firstSeenBlock > block) continue;
        const x = p.ox * CELL_SIZE + gap;
        const y = p.oy * CELL_SIZE + gap;
        const w = p.side * CELL_SIZE - 2 * gap;
        const h = p.side * CELL_SIZE - 2 * gap;
        const fill = fillColors[i];
        gridG.rect(x, y, w, h).fill({ color: fill }).stroke({ color: lighten(fill, 0.5), width: 1.5, alignment: 1 });
      }
    }

    void (async () => {
      const { tipBlock, wallets } = await loadWalletSubstrate();
      if (cancelled) return;
      const store = useTimegridStore.getState();
      if (store.latestBlock === 0) {
        store.setLatestBlock(tipBlock);
        store.setCurrentBlock(tipBlock); // open fully revealed; playback rewinds
      }

      // Build empires (footprint + color) and pack them into the disc.
      const inputs: WalletInput[] = wallets.map((w) => ({
        address: w.address,
        firstSeenBlock: w.firstSeenBlock,
        btc: Number(w.totalReceivedSats) / 1e8,
        txCount: w.txCount,
        isMiner: w.isMiner,
      }));
      const packed = packEmpires(inputs);
      placements = packed.placements;
      cellToEmpire = packed.cellToEmpire;
      fillColors = placements.map((p) => {
        const role = roleOf(p);
        const bump = Math.min(0.45, Math.max(0, (Math.log10(Math.max(1, p.btc)) - 1) / 8));
        return lighten(ROLE_COLOR[role], bump);
      });
      if (!cancelled) setTotal(placements.length);

      await app.init({
        resizeTo: container,
        background: BACKGROUND,
        antialias: true,
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

      fitToDisc(packed.radius);
      applyCamera();
      drawEmpires();

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
        if (isPinching) return;
        if (isPanning) {
          const dx = e.global.x - panStart.x;
          const dy = e.global.y - panStart.y;
          const cam = useTimegridStore.getState().camera;
          setCamera({ position: { x: panStartCam.x + dx, y: panStartCam.y + dy }, zoom: cam.zoom });
          return;
        }
        const { gx, gy } = pixelToCell(e.global.x, e.global.y);
        const idx = cellToEmpire.get(cellKey(gx, gy));
        const block = useTimegridStore.getState().currentBlock;
        if (idx !== undefined && placements[idx] && placements[idx].firstSeenBlock <= block) {
          const p = placements[idx];
          const cw = container.clientWidth;
          setHover({
            left: Math.min(e.global.x + 14, Math.max(8, cw - 270)),
            top: e.global.y + 14,
            addr: p.address,
            role: roleOf(p),
            btc: p.btc,
            firstSeenBlock: p.firstSeenBlock,
          });
        } else {
          setHover(null);
        }
      });
      const endPan = (e: { global: { x: number; y: number } }) => {
        const moved = Math.abs(e.global.x - panStart.x) + Math.abs(e.global.y - panStart.y);
        isPanning = false;
        app.canvas.style.cursor = '';
        if (moved < 3) {
          const { gx, gy } = pixelToCell(e.global.x, e.global.y);
          const idx = cellToEmpire.get(cellKey(gx, gy));
          const store2 = useTimegridStore.getState();
          if (idx !== undefined && placements[idx]) {
            const key = placements[idx].address;
            store2.setSelectedWallet(store2.selectedWallet === key ? null : key);
          } else {
            store2.setSelectedWallet(null);
          }
        }
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);
      app.canvas.addEventListener('pointerleave', () => setHover(null));

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const cam = useTimegridStore.getState().camera;
        const delta = -event.deltaY * 0.0015;
        const nextZoom = Math.max(0.02, Math.min(40, cam.zoom * (1 + delta)));
        const rect = app.canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const worldX = (px - cam.position.x) / cam.zoom;
        const worldY = (py - cam.position.y) / cam.zoom;
        setCamera({ position: { x: px - worldX * nextZoom, y: py - worldY * nextZoom }, zoom: nextZoom });
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      const ZOOM_MIN = 0.02;
      const ZOOM_MAX = 40;
      const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const onTouchStart = (e: TouchEvent): void => {
        if (e.touches.length < 2) return;
        e.preventDefault();
        isPinching = true;
        isPanning = false;
        lastPinchDist = dist(e.touches);
      };
      const onTouchMove = (e: TouchEvent): void => {
        if (!isPinching || e.touches.length < 2) return;
        e.preventDefault();
        const nd = dist(e.touches);
        if (lastPinchDist <= 0) { lastPinchDist = nd; return; }
        const scale = nd / lastPinchDist;
        lastPinchDist = nd;
        const cam = useTimegridStore.getState().camera;
        const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * scale));
        const rect = app.canvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const wx = (mx - cam.position.x) / cam.zoom;
        const wy = (my - cam.position.y) / cam.zoom;
        setCamera({ position: { x: mx - wx * nextZoom, y: my - wy * nextZoom }, zoom: nextZoom });
      };
      const onTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length < 2) { isPinching = false; lastPinchDist = 0; }
      };
      const c = app.canvas as HTMLCanvasElement & {
        _onWheel?: typeof onWheel; _onTS?: typeof onTouchStart; _onTM?: typeof onTouchMove; _onTE?: typeof onTouchEnd;
      };
      c._onWheel = onWheel; c._onTS = onTouchStart; c._onTM = onTouchMove; c._onTE = onTouchEnd;
      app.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      app.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      app.canvas.addEventListener('touchend', onTouchEnd);
      app.canvas.addEventListener('touchcancel', onTouchEnd);
    })().catch((err) => {
      if (!cancelled) console.warn('[grid] wallet-empire load failed:', err);
    });

    const unsubBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) drawEmpires();
    });
    const unsubCam = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });

    return () => {
      cancelled = true;
      unsubBlock();
      unsubCam();
      if (appReady) {
        const canvas = app.canvas as HTMLCanvasElement & {
          _onWheel?: (e: WheelEvent) => void;
          _onTS?: (e: TouchEvent) => void;
          _onTM?: (e: TouchEvent) => void;
          _onTE?: (e: TouchEvent) => void;
        };
        if (canvas?._onWheel) canvas.removeEventListener('wheel', canvas._onWheel);
        if (canvas?._onTS) canvas.removeEventListener('touchstart', canvas._onTS);
        if (canvas?._onTM) canvas.removeEventListener('touchmove', canvas._onTM);
        if (canvas?._onTE) {
          canvas.removeEventListener('touchend', canvas._onTE);
          canvas.removeEventListener('touchcancel', canvas._onTE);
        }
        try {
          app.destroy(true, { children: true });
        } catch {
          // Pixi v8 can throw on double-destroy in dev strict-mode cycles.
        }
      }
    };
  }, []);

  const revealed = total; // (visible-count tracking refined later; full set at tip)

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      aria-label="Timechain Grid — every significant Bitcoin wallet rendered as an empire, sized by holdings and packed with whales at the center. Drag to pan, pinch to zoom, tap an empire to inspect it."
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(4,4,8,0.78) 100%)',
        }}
      />

      {hover && (
        <div
          className="text-mono pointer-events-none absolute z-20 max-w-[260px] rounded-md border border-[color:var(--color-card-border)] bg-[color:var(--color-background)]/95 px-3 py-2 text-[11px] leading-relaxed shadow-lg"
          style={{ left: hover.left, top: hover.top }}
        >
          <div
            className="font-semibold uppercase tracking-wide"
            style={{ color: hover.role === 'satoshi' ? 'var(--color-brass-bright)' : 'var(--color-accent)' }}
          >
            {hover.role}
          </div>
          <div className="mt-0.5 break-all text-[color:var(--color-text-primary)]">
            {shortAddr(hover.addr)}
          </div>
          <div className="mt-1 text-[color:var(--color-text-muted)]">
            {hover.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC received
          </div>
          <div className="text-[color:var(--color-text-muted)]">
            first seen · block {hover.firstSeenBlock.toLocaleString()}
          </div>
        </div>
      )}

      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 text-[10px] uppercase tracking-[0.22em]"
      >
        <span className="tracking-[0.28em] text-[color:var(--color-accent)] mix-blend-screen">
          {BRAND_TAGLINE}
        </span>
        <span className="text-[color:var(--color-text-muted)]">
          Empires{' '}
          <span className="text-[color:var(--color-text-primary)]">{revealed.toLocaleString()}</span>
        </span>
        <span className="normal-case tracking-normal text-[9px] text-[color:var(--color-text-muted)]/70">
          whales center · dust outward · hover an empire
        </span>
      </div>
    </div>
  );
}
