# Cluster Lattice — Circular Ownership Grid (design)

> Status: design / agreed 2026-06-26. Part A (renderer) builds now; Part B
> (ownership pipeline) is the v0.2/v0.3 operator-side data effort. They are
> bridged by the **owner-provider interface** (§4) so Part A ships on today's
> data and gains ownership semantics later **without a second rewrite**.

## 1. Vision

The Grid becomes a **circular disc of square "pixel" coins**. Each cell is one
whole BTC. A cell is colored by its **current owner**: a wallet's coins cluster
into a contiguous **empire**, ownership **evolves as the chain plays**, and a
cell that is **fractionally split across several wallets renders gray** (shared).

Concretely (operator's framing): one 1-BTC cell = one wallet holding 1 BTC, OR
"10 wallets holding 0.1 BTC", OR "100 wallets holding 0.01 BTC" — the latter two
are *shared* cells and paint **gray**. Whole, single-owner cells paint the
owner's empire color. Hovering an empire lights all of that owner's cells.

## 2. What today's data supports (the honest split)

The Grid bundle carries exactly `block → miner` (~954k rows; the coinbase
recipient per block). v0.1 invariant: `ownerAddress === minterAddress` — **no
transfers, no balances, no fractional ownership** anywhere in the bundle.

| Feature | Needs | Status |
|---|---|---|
| Circular disc render (texture, square px, no LOD) | rendering only | **Part A — now** |
| Miner empires (coinbase owner) + hover-light | block→miner (have it) | **Part A — now** |
| Wallet empires (non-miner owners) | per-coin ownership | Part B |
| Dynamic ownership over time | UTXO ownership at each block | Part B |
| Fractional / shared → gray | per-cell split detection | Part B |

## 3. Part A — circular data-texture renderer (build now)

### 3.1 Disc layout (replaces the Ulam square spiral)
`src/lib/discGrid.ts`. Coins fill outward by **Euclidean ring then angle**:
`ring(x,y) = round(hypot(x,y))`; within a ring, order by `atan2(y,x)`. The
first *N* cells therefore form a **disc** (not a square), every cell stays on
the integer lattice (square "pixel" tiles). Provide:
- `discRadius(count)` → bounding radius `R ≈ ⌈√(count/π)⌉`.
- `discIndexOf(x,y)` → rank in disc order, `O(R)` (used for click hit-testing).
- bulk order generator (typed arrays) for the texture build.
Inverse is not closed-form (Gauss circle problem) → the texture build uses a
one-pass bucket-by-ring + per-ring angle sort (cheap), and hit-testing uses the
`O(R)` `discIndexOf`. No per-frame inverse is needed (that's the old design's cost).

### 3.2 The grid IS an image (one texture, not 21M draw calls)
Today's renderer draws immediate-mode rects with an LOD stride + 45k draw
budget — that ceiling is why 21M lags. Instead bake the disc into a **GPU
texture** and render **one quad**:
- **Nearest-neighbor** sampling → texels read as crisp **squares** when zoomed
  in (the "pixels"); the **circle** is the texture's alpha mask.
- **Pan/zoom** = the quad's transform (a matrix uniform — effectively free).
- **No LOD**: the GPU samples the texture at any zoom; mipmaps handle zoom-out.
- **Memory**: store a **palette index** per texel (R16/RG8), not raw RGBA — a
  ~5033² disc for ~19.9M coins is ~50 MB indexed vs ~100 MB RGBA. Palette
  (index→color) is a tiny lookup texture / uniform. Quantize the long-tail
  "muted bronze" miners to a bounded set so the palette stays ≤ 65k entries.
- **Scrubber** = a single `mintedThreshold` uniform. Bake a per-cell **order
  channel** (mint order now; ownership-change block later); the fragment shader
  discards texels whose order > threshold. The texture uploads **once**;
  playback is one number. (Dynamic ownership in Part B updates this channel.)

### 3.3 Render path
PixiJS 8 Mesh/Sprite + a custom fragment shader (stay in-framework — no new
dependency, privacy-clean). Shader: sample index → palette → color; sample order
→ discard if > threshold; optional proportional grout + rounded-corner in-shader
to preserve the mosaic identity. Camera = existing `viewport` transform.

### 3.4 Hit-testing + empire hover-light
`pixelToCell → discIndexOf → coinIndex → ownerProvider(coinIndex, block)`. Hover/
click resolves the owner and lights its whole empire (contiguous in the disc).
v1 owner = miner; the MinerInspector reads through the same provider.

## 4. The owner-provider interface (the seam)

```ts
interface OwnerProvider {
  // Identity + color of the owner of coin `n` AS OF `block`.
  ownerOf(coinIndex: number, block: number): {
    empireId: number;        // stable id for grouping/highlight (-1 = shared)
    colorIndex: number;      // palette index (gray reserved for shared)
    kind: 'miner' | 'wallet' | 'shared' | 'unknown';
  };
  paletteColor(colorIndex: number): number; // 0xRRGGBB
}
```
- **v1 (now, `MinerOwnerProvider`)**: `ownerOf` ignores transfers; owner =
  coinbase miner of `blockOfCoinIndex(n)`. empireId = miner index. Reproduces
  today's miner territories, now as contiguous disc arcs with hover-light.
- **v2 (Part B, `LedgerOwnerProvider`)**: consumes the ownership dataset (§5);
  returns the wallet that owns the cell at `block`, or `shared` (gray) when the
  cell is split. Swapping providers turns miner-empires into wallet-empires and
  lights up fractional cells — no renderer change.

## 5. Part B — ownership pipeline (operator-side, `chain-tools/` in the Graph repo)

Goal: emit, per whole-BTC **cell**, its **owner at each block** (or `shared`),
plus wallet clustering — the dataset the `LedgerOwnerProvider` reads.

### 5.1 Reconstruct ownership (UTXO walk)
Walk the chain maintaining the live UTXO set (outpoint → owner address + sats).
Each tx spends inputs (remove) and creates outputs (add). This yields, at any
height, "address → set of sats held". This is the heavy lift (billions of
outputs over ~954k blocks); design for out-of-core (DuckDB, like the existing
reduce) and emit **ownership-change events** keyed to the cell's order channel.

### 5.2 Cells, whole vs split (the gray rule)
A "cell" = one whole BTC of a wallet's holdings. Bin a wallet's balance into
floor(balance) whole cells + a remainder. Map cells to disc positions clustered
per wallet (empire = contiguous run). A disc position whose 1-BTC span is owned
by **more than one** wallet (remainders/dust aggregating to a shared BTC, e.g.
10×0.1 or 100×0.01) is a **shared cell → gray, empireId = -1**. The pipeline
emits per-cell `{ owner | shared }` and the wallet→cell-range map.

### 5.3 Wallet clustering
Common-input-ownership heuristic (addresses co-spent in one tx = one entity) to
merge addresses into wallet empires — the v0.3 roadmap item. Cluster ids become
empireIds.

## 6. Key design decisions (resolve before Part B build)

1. **Empire contiguity vs dynamic ownership.** Contiguous empires + changing
   ownership conflict: when a coin changes hands, either (a) it **migrates** to
   the new owner's empire (animated re-cluster — visually rich, expensive, the
   order/position channel changes per block), or (b) positions are **fixed** and
   only color changes (cheap, but a wallet's coins won't stay neighbors after
   transfers). **Recommendation:** fixed positions per *epoch snapshot* with
   color = current owner, and re-cluster only at coarse checkpoints (a tractable
   middle path). Flag for operator decision.
2. **Texture memory:** palette-indexed (≤50 MB) vs RGBA (≤100 MB); mobile cap.
3. **Fractional binning algorithm:** exact rule for assigning sub-BTC remainders
   to shared cells (deterministic, stable across blocks).

## 7. Staging

- **v1 (now):** circular data-texture renderer + `MinerOwnerProvider`
  (contiguous miner empires, hover-light, no LOD, 21M cells). Tasks #78–#82.
- **v2:** ownership pipeline (§5) → `LedgerOwnerProvider` → wallet empires +
  fractional gray (static/per-epoch ownership).
- **v3:** dynamic ownership over time (per-block re-color via the order/owner
  channel; optional migration animation).

## 8. Cross-repo note
Renderer (Part A) lives in the **Grid** repo (`$SISTER_REPO`). The
ownership pipeline (Part B) is operator-side in the **Graph** repo's
`chain-tools/` (the canonical pipeline; Grid consumes the emitted bundle, as it
already does for `block-miners.parquet`). The owner-provider interface (§4) is
the stable contract across the two.
