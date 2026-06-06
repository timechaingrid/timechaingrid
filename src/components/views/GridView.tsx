'use client';

import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { FIXTURE_SUBSTRATE } from '@/data/substrate';
import { placeWallet } from './placeOnGrid';
import { ROLE_COLOR, ROLE_RADIUS } from '@/lib/role-visuals';
import {
  DEFAULT_CHAIN_GRID_MIN,
  DEFAULT_CHAIN_GRID_MAX,
} from '@/lib/coords';
import { useTimegridStore } from '@/store/timegridStore';
import { BRAND_TAGLINE } from '@/lib/site-config';

const CHAIN_SPAN = DEFAULT_CHAIN_GRID_MAX - DEFAULT_CHAIN_GRID_MIN;

// Wallet-derived tip block — the latest block any wallet in the
// substrate was last active at. Reaches the live Bitcoin chain head
// (~875k) for fixture-backed substrate; will reach exact tip for the
// v0.2+ R2/parquet substrate.
const WALLET_TIP_BLOCK = FIXTURE_SUBSTRATE.tipBlock;
const WALLETS = FIXTURE_SUBSTRATE.wallets;

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.0015; // wheel sensitivity

/**
 * GridView — stationary node-grid renderer for timechaingrid.com.
 *
 * Phase-C v0.1 progress:
 *   ✓ skeleton                                       (e52a5dd)
 *   ✓ deterministic placement + role colors          (2c0b70d)
 *   ✓ hover/click selection wired to store           (89e86ae)
 *   ✓ scrubber-driven visibility                     (d16e38c)
 *   ✓ pan + zoom (this commit)
 *   · real BitcoinChainAdapter (next)
 *
 * Drag empty space to pan, wheel to zoom. Wallets stay at their
 * deterministic chain coordinates — the panopticon is moved, not the
 * wallets. Camera state persists in `useTimegridStore.camera` so a
 * future minimap or share-link feature can read it.
 *
 * Companion's `<GraphView>` has drag-to-pin per node (force sim). This
 * view deliberately does NOT — wallet positions are stable forever,
 * and dragging a wallet would break the contract.
 */
export function GridView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // React-subscribed currentBlock so the HUD overlay re-renders on
  // scrubber moves. PixiJS dots are still updated imperatively via
  // the store subscription inside the effect — two paths, both stable.
  const currentBlock = useTimegridStore((s) => s.currentBlock);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let cancelled = false;
    const dotMap = new Map<string, Graphics>();
    const viewport = new Container();
    let resizeObserver: ResizeObserver | undefined;

    const {
      setSelectedWallet,
      setActiveDockPanel,
      setLatestBlock,
      setCurrentBlock,
      setCamera,
    } = useTimegridStore.getState();

    if (useTimegridStore.getState().latestBlock === 0) {
      setLatestBlock(WALLET_TIP_BLOCK);
      setCurrentBlock(WALLET_TIP_BLOCK);
    }

    function applyActivity(currentBlock: number) {
      // Three states per wallet at the current scrubber position:
      //   firstSeenBlock > currentBlock        → not yet exists, hidden
      //   currentBlock > lastActiveBlock       → exists but gone dark, dim
      //   firstSeenBlock ≤ currentBlock ≤ lastActiveBlock → alive, full alpha
      for (const wallet of WALLETS) {
        const dot = dotMap.get(wallet.address);
        if (!dot) continue;
        if (wallet.firstSeenBlock > currentBlock) {
          dot.visible = false;
        } else if (wallet.lastActiveBlock < currentBlock) {
          dot.visible = true;
          dot.alpha = 0.3;
        } else {
          dot.visible = true;
          dot.alpha = 1.0;
        }
      }
    }

    function applyCamera() {
      const cam = useTimegridStore.getState().camera;
      viewport.position.set(cam.position.x, cam.position.y);
      viewport.scale.set(cam.zoom);
    }

    void (async () => {
      await app.init({
        resizeTo: container,
        background: 0x08080c,
        antialias: true,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      container.appendChild(app.canvas);

      const fit = Math.min(app.screen.width, app.screen.height);
      const halfFit = fit / 2;
      const cx = app.screen.width / 2;
      const cy = app.screen.height / 2;

      const chainToPixel = (gx: number, gy: number): [number, number] => {
        const px = cx + (gx / (CHAIN_SPAN / 2)) * halfFit;
        const py = cy + (gy / (CHAIN_SPAN / 2)) * halfFit;
        return [px, py];
      };

      // Backdrop grid lives outside the viewport so it stays anchored
      // to the canvas frame even as the user pans. It's a frame, not a
      // map.
      const grid = new Graphics();
      const gridStep = 32;
      for (let x = 0; x <= app.screen.width; x += gridStep) {
        grid.moveTo(x, 0).lineTo(x, app.screen.height);
      }
      for (let y = 0; y <= app.screen.height; y += gridStep) {
        grid.moveTo(0, y).lineTo(app.screen.width, y);
      }
      grid.stroke({ width: 1, color: 0xffffff, alpha: 0.03 });
      app.stage.addChild(grid);

      // Viewport container holds the wallet dots + halo. Pan/zoom
      // transforms the viewport, not the stage, so the backdrop stays
      // fixed.
      app.stage.addChild(viewport);

      for (const wallet of WALLETS) {
        const gridPos = placeWallet(wallet);
        const [px, py] = chainToPixel(gridPos.x, gridPos.y);
        const radius = ROLE_RADIUS[wallet.role];

        const dot = new Graphics();
        dot.circle(px, py, radius).fill(ROLE_COLOR[wallet.role]);

        dot.eventMode = 'static';
        dot.cursor = 'pointer';
        dot.hitArea = {
          contains: (mx: number, my: number) => {
            const dx = mx - px;
            const dy = my - py;
            const hitR = Math.max(radius, 4);
            return dx * dx + dy * dy <= hitR * hitR;
          },
        };
        dot.on('pointerover', () => setSelectedWallet(wallet.address));
        dot.on('pointerout', () => setSelectedWallet(null));
        dot.on('pointertap', () => {
          setSelectedWallet(wallet.address);
          setActiveDockPanel('wallet-inspector');
        });

        dotMap.set(wallet.address, dot);
        viewport.addChild(dot);

        if (wallet.role === 'satoshi') {
          const halo = new Graphics();
          halo
            .circle(px, py, ROLE_RADIUS.satoshi + 6)
            .stroke({ width: 1.2, color: ROLE_COLOR.satoshi, alpha: 0.7 });
          viewport.addChild(halo);
        }
      }

      // Pan: drag empty space (not a dot — dots stop event propagation).
      // The stage receives events that bubble past the dots' hitAreas.
      app.stage.eventMode = 'static';
      app.stage.hitArea = {
        contains: () => true, // entire stage is interactive backdrop
      };
      let panning = false;
      let panStart = { x: 0, y: 0 };
      let panStartCam = { x: 0, y: 0 };
      app.stage.on('pointerdown', (e) => {
        // Skip pan if the pointer landed on a dot — dot.eventMode='static'
        // makes the dot the e.target; we only pan when target IS the stage.
        if (e.target !== app.stage) return;
        panning = true;
        panStart = { x: e.global.x, y: e.global.y };
        panStartCam = { ...useTimegridStore.getState().camera.position };
        app.canvas.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e) => {
        if (!panning) return;
        const dx = e.global.x - panStart.x;
        const dy = e.global.y - panStart.y;
        const cam = useTimegridStore.getState().camera;
        setCamera({
          position: { x: panStartCam.x + dx, y: panStartCam.y + dy },
          zoom: cam.zoom,
        });
      });
      const endPan = () => {
        panning = false;
        app.canvas.style.cursor = '';
      };
      app.stage.on('pointerup', endPan);
      app.stage.on('pointerupoutside', endPan);

      // Zoom: wheel event on the canvas. Use passive: false so we
      // can preventDefault to stop page scroll.
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const cam = useTimegridStore.getState().camera;
        const delta = -event.deltaY * ZOOM_STEP;
        const nextZoom = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, cam.zoom * (1 + delta)),
        );
        setCamera({ position: cam.position, zoom: nextZoom });
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      applyActivity(useTimegridStore.getState().currentBlock);
      applyCamera();

      // Cleanup of canvas-level listeners is handled in the outer
      // return below via the `cancelled` flag and app.destroy.
      (app.canvas as HTMLCanvasElement & { _onWheel?: typeof onWheel })._onWheel = onWheel;
    })();

    const unsubscribeBlock = useTimegridStore.subscribe((state, prev) => {
      if (state.currentBlock !== prev.currentBlock) {
        applyActivity(state.currentBlock);
      }
    });

    const unsubscribeCamera = useTimegridStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera) applyCamera();
    });

    return () => {
      cancelled = true;
      unsubscribeBlock();
      unsubscribeCamera();
      resizeObserver?.disconnect();
      const wheel = (app.canvas as HTMLCanvasElement & { _onWheel?: (e: WheelEvent) => void })?._onWheel;
      if (wheel && app.canvas) {
        app.canvas.removeEventListener('wheel', wheel);
      }
      app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-square w-full cursor-grab active:cursor-grabbing"
      aria-label="Timechain Grid lattice — stationary deterministic placement of Bitcoin wallets, scrubbable by halving epoch, drag to pan, scroll to zoom"
    >
      {/* HUD overlay — slogan + live block readout layered on the
          canvas so the brand and the scrubber position are always
          visible even when the user has scrolled marketing copy off
          screen. Mirrors the companion GraphView HUD with cyan accent. */}
      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.28em] text-[color:var(--color-accent)] mix-blend-screen"
      >
        {BRAND_TAGLINE}
      </div>
      <div
        aria-hidden
        className="text-mono pointer-events-none absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]"
      >
        Block{' '}
        <span className="text-[color:var(--color-text-primary)]">
          {currentBlock.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
