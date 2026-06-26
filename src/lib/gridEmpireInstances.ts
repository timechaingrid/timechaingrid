/**
 * gridEmpireInstances — pack wallets and emit per-empire INSTANCE data for the
 * GPU-instanced renderer (one rounded-square per empire, not a cell texture).
 *
 * The cell-texture can't round corners, pad between empires, or highlight one on
 * hover (it has no per-empire object). Instancing gives each empire a shape:
 * offset (center, in cells), size (side, in cells), color, birth block (scrubber
 * reveal), and a whale flag (the <1000 BTC toggle). All as flat typed arrays so
 * they upload straight to GPU instance attributes. See docs/cluster-lattice-design.md.
 *
 * Pure + deterministic; runs in a worker for the 850k-empire pack.
 */
import { packEmpires, type WalletInput } from './walletEmpires';
import { empireFill } from './gridEmpireTexture';

export interface EmpireInstances {
  /** interleaved [x0,y0, x1,y1, …] empire centers, in cell units. */
  offset: Float32Array;
  /** interleaved [r0,g0,b0, …] empire fill, 0..1. */
  color: Float32Array;
  /** side (cells) per empire. */
  size: Float32Array;
  /** first-seen block per empire (scrubber reveal). */
  birth: Float32Array;
  /** 1 if ≥1000 BTC (whale) else 0 — drives the <1000 BTC toggle. */
  whale: Float32Array;
  count: number;
  /** packed-disc bounding radius (cells), for camera fit. */
  radius: number;
}

export function buildEmpireInstances(wallets: WalletInput[]): EmpireInstances {
  const { placements, radius } = packEmpires(wallets);
  const n = placements.length;
  const offset = new Float32Array(n * 2);
  const color = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const birth = new Float32Array(n);
  const whale = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = placements[i];
    offset[i * 2] = p.ox + p.side / 2;
    offset[i * 2 + 1] = p.oy + p.side / 2;
    size[i] = p.side;
    const c = empireFill(p);
    color[i * 3] = ((c >> 16) & 0xff) / 255;
    color[i * 3 + 1] = ((c >> 8) & 0xff) / 255;
    color[i * 3 + 2] = (c & 0xff) / 255;
    birth[i] = p.firstSeenBlock;
    whale[i] = p.btc >= 1000 ? 1 : 0;
  }
  return { offset, color, size, birth, whale, count: n, radius };
}
