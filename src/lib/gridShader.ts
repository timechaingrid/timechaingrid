'use client';

/**
 * gridShader — the PixiJS 8 textured-quad renderer for the circular coin disc.
 *
 * Replaces the per-frame rect/LOD loop with ONE mesh sampling two data textures
 * (docs/cluster-lattice-design.md §3.2/§3.3):
 *   - uBlockTex: side×side, RGB = the block (24-bit LE) that minted the coin at
 *     that disc cell, A = presence. NEAREST sampling → crisp square pixels.
 *   - uColorTex: block-indexed lookup, RGB = that block's miner color.
 * The scrubber is a single uniform (uCurrentBlock): a texel is drawn iff its
 * block ≤ uCurrentBlock — no per-frame redraw, no LOD. Pan/zoom ride the mesh's
 * normal world transform.
 *
 * GLSL ES 1.00 (attribute/varying/gl_FragColor) — the form PixiJS v8 GlProgram
 * accepts per the filter docs. The mesh transform uniforms (uProjectionMatrix,
 * uWorldTransformMatrix, uTransformMatrix) are injected by the Mesh pipe.
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
uniform sampler2D uColorTex;
uniform float uCurrentBlock;
uniform float uColorW;
uniform float uColorH;
void main() {
  vec4 b = texture2D(uBlockTex, vUV);
  if (b.a < 0.5) discard;                 // no coin at this cell
  float block = floor(b.r * 255.0 + 0.5)
              + floor(b.g * 255.0 + 0.5) * 256.0
              + floor(b.b * 255.0 + 0.5) * 65536.0;
  if (block > uCurrentBlock) discard;     // scrubber: not yet minted
  float lx = mod(block, uColorW);
  float ly = floor(block / uColorW);
  vec2 luv = (vec2(lx, ly) + 0.5) / vec2(uColorW, uColorH);
  gl_FragColor = vec4(texture2D(uColorTex, luv).rgb, 1.0);
}
`;

export interface GridMesh {
  mesh: Mesh<MeshGeometry, Shader>;
  /** Reveal coins minted up to `block` (the scrubber). */
  setCurrentBlock(block: number): void;
  destroy(): void;
}

export interface GridMeshOptions {
  /** RGBA8 block texture, side×side (from gridTexture / its worker). */
  blockData: Uint8Array;
  side: number;
  radius: number;
  /** World px per cell (must match the view's CELL_SIZE). */
  cellSize: number;
  /** Block-indexed color LUT, lutW×lutH RGBA8. */
  colorLut: Uint8Array;
  lutW: number;
  lutH: number;
}

export function createGridMesh(opts: GridMeshOptions): GridMesh {
  const { blockData, side, radius, cellSize, colorLut, lutW, lutH } = opts;

  const blockTex = Texture.from({ resource: blockData, width: side, height: side });
  blockTex.source.scaleMode = 'nearest'; // square pixels; never interpolate block ids
  const colorTex = Texture.from({ resource: colorLut, width: lutW, height: lutH });
  colorTex.source.scaleMode = 'nearest';

  // Quad spans the disc bounding box in world space. UV 0..1 maps the full
  // texture; texel (gx+radius, gy+radius) ↔ cell (gx,gy), so the quad edges sit
  // half a cell beyond the outermost cell centers.
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
      uColorTex: colorTex.source,
      gridUniforms: {
        uCurrentBlock: { value: 0, type: 'f32' },
        uColorW: { value: lutW, type: 'f32' },
        uColorH: { value: lutH, type: 'f32' },
      },
    },
  });

  const mesh = new Mesh({ geometry, shader });
  const reveal = shader.resources.gridUniforms as unknown as {
    uniforms: { uCurrentBlock: number; uColorW: number; uColorH: number };
  };

  return {
    mesh,
    setCurrentBlock(block: number) {
      reveal.uniforms.uCurrentBlock = block;
    },
    destroy() {
      mesh.destroy();
      blockTex.destroy(true);
      colorTex.destroy(true);
    },
  };
}
