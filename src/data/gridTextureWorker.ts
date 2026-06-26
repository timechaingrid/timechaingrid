/// <reference lib="webworker" />
/**
 * gridTextureWorker — builds the circular block texture off the main thread.
 *
 * buildBlockTexture enumerates ~25M lattice cells, sorts rings by angle, and
 * fills a ~100MB RGBA buffer — far too heavy for the UI thread. This worker runs
 * it and transfers the buffer back zero-copy. Pure inputs (just the coin count),
 * so it's deterministic and side-effect-free. See gridTexture.ts.
 */
import { buildBlockTexture } from '@/lib/gridTexture';

export interface BuildTextureRequest {
  totalCoins: number;
}

export interface BuildTextureResponse {
  /** RGBA8 buffer, side×side (transferred, zero-copy). */
  data: ArrayBuffer;
  side: number;
  radius: number;
  total: number;
}

self.onmessage = (e: MessageEvent<BuildTextureRequest>) => {
  const tex = buildBlockTexture(e.data.totalCoins);
  const msg: BuildTextureResponse = {
    data: tex.data.buffer as ArrayBuffer,
    side: tex.side,
    radius: tex.radius,
    total: tex.total,
  };
  (self as unknown as Worker).postMessage(msg, [msg.data]);
};
