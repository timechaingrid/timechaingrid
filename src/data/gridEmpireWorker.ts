/// <reference lib="webworker" />
/**
 * gridEmpireWorker — pack + bake the wallet-empire texture off the main thread.
 *
 * Packing 850k empires (~5.8M cells) and baking a ~2,700² RGBA texture would
 * freeze the UI; this runs it in a worker and transfers the buffer back zero-copy.
 * Receives the wallet columns as typed arrays (addresses aren't needed for the
 * texture; index stands in for the deterministic tie-break). See gridEmpireTexture.ts.
 */
import { buildEmpireTexture } from '@/lib/gridEmpireTexture';
import type { WalletInput } from '@/lib/walletEmpires';

export interface BuildEmpireRequest {
  firstSeen: Int32Array;
  btc: Float64Array;
  txCount: Int32Array;
  isMiner: Uint8Array;
}

export interface BuildEmpireResponse {
  data: ArrayBuffer;
  side: number;
  radius: number;
  count: number;
}

self.onmessage = (e: MessageEvent<BuildEmpireRequest>) => {
  const { firstSeen, btc, txCount, isMiner } = e.data;
  const n = firstSeen.length;
  const wallets: WalletInput[] = new Array(n);
  for (let i = 0; i < n; i++) {
    wallets[i] = {
      address: String(i),
      firstSeenBlock: firstSeen[i],
      btc: btc[i],
      txCount: txCount[i],
      isMiner: isMiner[i] === 1,
    };
  }
  const tex = buildEmpireTexture(wallets);
  const msg: BuildEmpireResponse = {
    data: tex.data.buffer as ArrayBuffer,
    side: tex.side,
    radius: tex.radius,
    count: tex.count,
  };
  (self as unknown as Worker).postMessage(msg, [msg.data]);
};
