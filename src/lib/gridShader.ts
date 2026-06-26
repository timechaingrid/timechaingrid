'use client';

/**
 * gridShader — the PixiJS 8 textured-quad renderer for the circular coin disc.
 *
 * One mesh samples a single data texture (docs/cluster-lattice-design.md §3.2):
 * uBlockTex is side×side, RGB = the block (24-bit LE) that minted the coin at
 * that disc cell, A = presence. NEAREST sampling → crisp square pixels. The
 * scrubber is one uniform (uCurrentBlock): a cell shows iff its block ≤ it.
 *
 * Mosaic grout: each cell is drawn with a proportional dark gap (uGrout) so the
 * tiles read as distinct squares, not a flat pixel sheet — but ONLY once a cell
 * is large enough on screen (uCellPx ≥ threshold), so zoomed all the way out the
 * disc is a solid field instead of sub-pixel shimmer.
 *
 * Color is a single uniform (uTileColor) for now — every coin the same orange.
 * (Per-owner colors return via the owner-provider / ownership pipeline; the
 * block id is still baked per texel so that swap is a shader change, not a rebuild.)
 *
 * GLSL ES 1.00 — the form PixiJS v8 GlProgram accepts (per the filter docs); the
 * mesh transform uniforms are injected by the Mesh pipe.
 */
import { Geometry, GlProgram, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';

const VERTEX = `
attribute vec2 aPosition;
attribute vec2 aUV;
varying vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uBlockTex;
uniform float uCurrentBlock;
uniform float uSide;
uniform float uGrout;
uniform float uCellPx;
uniform vec3 uTileColor;
void main() {
  vec4 b = texture2D(uBlockTex, vUV);
  if (b.a < 0.5) discard;                 // no coin at this cell
  float block = floor(b.r * 255.0 + 0.5)
              + floor(b.g * 255.0 + 0.5) * 256.0
              + floor(b.b * 255.0 + 0.5) * 65536.0;
  if (block > uCurrentBlock) discard;     // scrubber: not yet minted
  // Mosaic grout — carve a dark gap around each cell once tiles are big enough
  // on screen that the gap reads (below that, draw solid to avoid shimmer).
  if (uCellPx >= 3.0) {
    vec2 cell = fract(vUV * uSide);
    if (cell.x < uGrout || cell.x > 1.0 - uGrout ||
        cell.y < uGrout || cell.y > 1.0 - uGrout) discard;
  }
  gl_FragColor = vec4(uTileColor, 1.0);
}
`;

/** Default tile color — Bitcoin orange. */
const DEFAULT_TILE_COLOR = 0xf7931a;
/** Default grout fraction of each cell left as the dark gap between tiles. */
const DEFAULT_GROUT = 0.18;

export interface GridMesh {
  mesh: Mesh<MeshGeometry, Shader>;
  /** Reveal coins minted up to `block` (the scrubber). */
  setCurrentBlock(block: number): void;
  /** On-screen size of one cell in CSS px (= cellSize × cameraZoom) — gates grout. */
  setCellPx(px: number): void;
  destroy(): void;
}

export interface GridMeshOptions {
  /** RGBA8 block texture, side×side (from gridTexture / its worker). */
  blockData: Uint8Array;
  side: number;
  radius: number;
  /** World px per cell (must match the view's CELL_SIZE). */
  cellSize: number;
  /** Packed 0xRRGGBB tile color (default Bitcoin orange). */
  tileColor?: number;
  /** Grout fraction 0..0.5 (default 0.18). */
  groutFrac?: number;
}

function rgb(hex: number): Float32Array {
  return new Float32Array([
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ]);
}

export function createGridMesh(opts: GridMeshOptions): GridMesh {
  const { blockData, side, radius, cellSize } = opts;
  const tileColor = opts.tileColor ?? DEFAULT_TILE_COLOR;
  const groutFrac = opts.groutFrac ?? DEFAULT_GROUT;

  const blockTex = Texture.from({ resource: blockData, width: side, height: side });
  blockTex.source.scaleMode = 'nearest'; // square pixels; never interpolate block ids

  const half = (radius + 0.5) * cellSize;
  const geometry = new MeshGeometry({
    positions: new Float32Array([-half, -half, half, -half, half, half, -half, half]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });

  const shader = new Shader({
    glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT }),
    resources: {
      uBlockTex: blockTex.source,
      gridUniforms: {
        uCurrentBlock: { value: 0, type: 'f32' },
        uSide: { value: side, type: 'f32' },
        uGrout: { value: groutFrac, type: 'f32' },
        uCellPx: { value: cellSize, type: 'f32' },
        uTileColor: { value: rgb(tileColor), type: 'vec3<f32>' },
      },
    },
  });

  const mesh = new Mesh({ geometry, shader });
  const reveal = shader.resources.gridUniforms as unknown as {
    uniforms: { uCurrentBlock: number; uCellPx: number };
  };

  return {
    mesh,
    setCurrentBlock(block: number) {
      reveal.uniforms.uCurrentBlock = block;
    },
    setCellPx(px: number) {
      reveal.uniforms.uCellPx = px;
    },
    destroy() {
      mesh.destroy();
      blockTex.destroy(true);
    },
  };
}

// --- Empire map: one ROUNDED-SQUARE instance per empire (GPU instancing). Each
// instance is drawn smaller than its cell (padding) with rounded corners; the
// scrubber (uCurrentBlock vs per-instance birth) and the <1000 BTC toggle
// (uShowSmall vs per-instance whale flag) hide instances in-shader — no CPU
// per-frame work. See gridEmpireInstances.ts. ---

const EMPIRE_VERTEX = `
attribute vec2 aVert;
attribute vec2 aOffset;
attribute vec3 aColor;
attribute float aSize;
attribute float aBirth;
attribute float aWhale;
varying vec3 vColor;
varying vec2 vLocal;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uCellSize;
uniform float uPadding;
uniform float uCurrentBlock;
uniform float uShowSmall;
void main() {
  vColor = aColor;
  vLocal = aVert;
  bool hidden = (aBirth > uCurrentBlock) || (uShowSmall < 0.5 && aWhale < 0.5);
  if (hidden) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 world = aOffset * uCellSize + aVert * (aSize * uCellSize * (1.0 - uPadding));
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(world, 1.0)).xy, 0.0, 1.0);
}
`;

const EMPIRE_FRAGMENT = `
precision highp float;
varying vec3 vColor;
varying vec2 vLocal;
uniform float uRadius;
void main() {
  // rounded-rect SDF over the unit quad [-0.5, 0.5]
  vec2 q = abs(vLocal) - (0.5 - uRadius);
  float d = length(max(q, 0.0)) - uRadius;
  if (d > 0.0) discard;
  gl_FragColor = vec4(vColor, 1.0);
}
`;

export interface EmpireMesh {
  mesh: Mesh<Geometry, Shader>;
  /** Reveal empires born at or before `block` (scrubber). */
  setCurrentBlock(block: number): void;
  /** Show wallets below 1000 BTC (the <1000 toggle). */
  setShowSmall(show: boolean): void;
  destroy(): void;
}

export interface EmpireInstanceData {
  offset: Float32Array; // [x,y,…] cell centers
  color: Float32Array; // [r,g,b,…] 0..1
  size: Float32Array; // side (cells)
  birth: Float32Array; // first-seen block
  whale: Float32Array; // 1 = ≥1000 BTC
  count: number;
  cellSize: number;
}

export function createEmpireMesh(d: EmpireInstanceData): EmpireMesh {
  const geometry = new Geometry({
    attributes: {
      aVert: { buffer: new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), format: 'float32x2' },
      aOffset: { buffer: d.offset, format: 'float32x2', instance: true },
      aColor: { buffer: d.color, format: 'float32x3', instance: true },
      aSize: { buffer: d.size, format: 'float32', instance: true },
      aBirth: { buffer: d.birth, format: 'float32', instance: true },
      aWhale: { buffer: d.whale, format: 'float32', instance: true },
    },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    instanceCount: d.count,
  });

  const shader = new Shader({
    glProgram: new GlProgram({ vertex: EMPIRE_VERTEX, fragment: EMPIRE_FRAGMENT }),
    resources: {
      empireUniforms: {
        uCellSize: { value: d.cellSize, type: 'f32' },
        uPadding: { value: 0.18, type: 'f32' },
        uCurrentBlock: { value: 1e9, type: 'f32' }, // all revealed until scrubbed
        uShowSmall: { value: 1, type: 'f32' },
        uRadius: { value: 0.28, type: 'f32' },
      },
    },
  });
  const mesh = new Mesh({ geometry, shader });
  const u = shader.resources.empireUniforms as unknown as {
    uniforms: { uCurrentBlock: number; uShowSmall: number };
  };

  return {
    mesh,
    setCurrentBlock(block: number) {
      u.uniforms.uCurrentBlock = block;
    },
    setShowSmall(show: boolean) {
      u.uniforms.uShowSmall = show ? 1 : 0;
    },
    destroy() {
      mesh.destroy();
    },
  };
}
