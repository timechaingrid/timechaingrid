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
import { GlProgram, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';

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
