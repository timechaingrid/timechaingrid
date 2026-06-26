/// <reference lib="webworker" />
/**
 * gridEmpireWorker — pack 850k wallets and emit per-empire INSTANCE arrays off
 * the main thread, transferred zero-copy. Receives the wallet columns as typed
 * arrays (index stands in for the address tie-break). See gridEmpireInstances.ts.
 */
import { buildEmpireInstances } from '@/lib/gridEmpireInstances';
import type { WalletInput } from '@/lib/walletEmpires';

export interface BuildEmpireRequest {
  firstSeen: Int32Array;
  btc: Float64Array;
  txCount: Int32Array;
  isMiner: Uint8Array;
}

export interface BuildEmpireResponse {
  offset: ArrayBuffer; // Float32 [x,y,…]
  color: ArrayBuffer; // Float32 [r,g,b,…]
  size: ArrayBuffer; // Float32
  birth: ArrayBuffer; // Float32
  whale: ArrayBuffer; // Float32
  count: number;
  radius: number;
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
  const inst = buildEmpireInstances(wallets);
  const msg: BuildEmpireResponse = {
    offset: inst.offset.buffer as ArrayBuffer,
    color: inst.color.buffer as ArrayBuffer,
    size: inst.size.buffer as ArrayBuffer,
    birth: inst.birth.buffer as ArrayBuffer,
    whale: inst.whale.buffer as ArrayBuffer,
    count: inst.count,
    radius: inst.radius,
  };
  (self as unknown as Worker).postMessage(msg, [msg.offset, msg.color, msg.size, msg.birth, msg.whale]);
};
