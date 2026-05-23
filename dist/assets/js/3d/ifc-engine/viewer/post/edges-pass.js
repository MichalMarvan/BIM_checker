/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

// Screen-space edge detection pass.
//
// Sobel-like kernel on the view-space normal buffer + linearized depth
// buffer detects three edge classes simultaneously:
//   • silhouette edges     — depth discontinuity against background
//   • crease edges         — normal discontinuity within a surface (corner)
//   • intersection edges   — depth + normal discontinuity at touching parts
//
// Replaces the per-mesh EdgesGeometry overlay (which only handled crease
// edges above its threshold and missed tessellated silhouettes entirely).
// Bonus: edge thickness is in screen pixels, so the previous _edgeFadeNear
// / _edgeFadeFar zoom hack is gone — distant geometry still draws crisp
// 1-pixel edges instead of fading out.
//
// Composites edges onto the scene colour via mix(sceneCol, uEdgeColor, edge)
// and writes to an internal RT. PostPipeline blits that RT's texture to
// canvas.

import * as THREE from 'three';
import { getFullscreenTriangleGeometry } from './fullscreen-triangle.js';

const EDGE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;          // 1.0 / resolution
  uniform vec3 uEdgeColor;
  uniform float uIntensity;     // 0..1 mix factor for found edges
  uniform float uDepthThreshold;  // fractional depth change to count as edge
  uniform float uNormalThreshold; // 1 - dot(nA, nB) summed across 4 taps
  uniform float uEdgeWidth;     // pixels — distance to neighbour samples
  uniform float uCameraNear;
  uniform float uCameraFar;

  // Hyperbolic depth → linear camera-space Z, matches three.js packed depth.
  float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
  }

  void main() {
    vec3 sceneCol = texture2D(tDiffuse, vUv).rgb;
    float dC = texture2D(tDepth, vUv).x;

    // Sky/background pixels: leave untouched (no edges against the sky).
    if (dC >= 0.99995) {
      gl_FragColor = vec4(sceneCol, 1.0);
      return;
    }

    vec2 off = uEdgeWidth * uTexel;
    float dL = texture2D(tDepth, vUv + vec2(-off.x, 0.0)).x;
    float dR = texture2D(tDepth, vUv + vec2( off.x, 0.0)).x;
    float dT = texture2D(tDepth, vUv + vec2(0.0,  off.y)).x;
    float dB = texture2D(tDepth, vUv + vec2(0.0, -off.y)).x;

    // Depth Laplacian (2nd derivative): planar / smoothly-curving surfaces
    // give Σ neighbours ≈ 4 × centre → Laplacian ≈ 0. Only real depth
    // discontinuities (silhouettes, object intersections) spike. Cheaper
    // and more selective than gradient-magnitude with a depth-scaled
    // threshold, which would also fire on oblique planar surfaces.
    float lC = linearizeDepth(dC);
    float lL = linearizeDepth(dL);
    float lR = linearizeDepth(dR);
    float lT = linearizeDepth(dT);
    float lB = linearizeDepth(dB);
    float laplD = abs(lL + lR + lT + lB - 4.0 * lC) / max(lC, 0.0001);
    float depthEdge = step(uDepthThreshold, laplD);

    // Normal Laplacian — same logic, but on the 3-vector. Length of the
    // 2nd-derivative vector spikes only where neighbour normals diverge
    // sharply (creases), not on gradual normal variation across a smooth
    // tessellated curve.
    vec3 nC = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
    vec3 nL = texture2D(tNormal, vUv + vec2(-off.x, 0.0)).rgb * 2.0 - 1.0;
    vec3 nR = texture2D(tNormal, vUv + vec2( off.x, 0.0)).rgb * 2.0 - 1.0;
    vec3 nT = texture2D(tNormal, vUv + vec2(0.0,  off.y)).rgb * 2.0 - 1.0;
    vec3 nB = texture2D(tNormal, vUv + vec2(0.0, -off.y)).rgb * 2.0 - 1.0;
    vec3 nLap = nL + nR + nT + nB - 4.0 * nC;
    float normalEdge = step(uNormalThreshold, length(nLap));

    float edge = clamp(depthEdge + normalEdge, 0.0, 1.0) * uIntensity;
    gl_FragColor = vec4(mix(sceneCol, uEdgeColor, edge), 1.0);
  }
`;

const EDGE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export class EdgesPass {
  /**
   * @param {PostPipeline} pipeline
   * @param {THREE.Camera} camera — needed for near/far when linearizing depth
   */
  constructor(pipeline, camera, opts = {}) {
    this._pipeline = pipeline;
    this._camera = camera;
    this.enabled = opts.enabled ?? true;
    this.needsNormals = true;  // PostPipeline contract: run normal pass

    const size = pipeline.getSize();
    this._rt = new THREE.WebGLRenderTarget(size.width, size.height, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._rt.texture.name = 'EdgesPass.output';

    this._material = new THREE.ShaderMaterial({
      name: 'EdgesPass',
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / size.width, 1 / size.height) },
        uEdgeColor: { value: new THREE.Color(opts.edgeColor ?? 0x111111) },
        uIntensity: { value: opts.intensity ?? 0.9 },
        // Laplacian magnitudes — silhouette depth jumps are typically
        // 0.3..1.0 in normalised depth, smooth surfaces ~0; 0.05 is a safe
        // floor. Normal Laplacian length ~2.8 at a 90° crease, ~0 on
        // smoothly curving surfaces; 0.6 picks up real creases without
        // catching tessellated cylinder noise.
        uDepthThreshold: { value: opts.depthThreshold ?? 0.05 },
        uNormalThreshold: { value: opts.normalThreshold ?? 0.6 },
        uEdgeWidth: { value: opts.edgeWidth ?? 1.0 },
        uCameraNear: { value: camera.near ?? 0.1 },
        uCameraFar: { value: camera.far ?? 1000 },
      },
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this._scene = new THREE.Scene();
    this._scene.add(new THREE.Mesh(getFullscreenTriangleGeometry(), this._material));
    this._scene.children[0].frustumCulled = false;
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Called by PostPipeline once per frame.
   * Returns the texture that becomes the next stage's input (final blit
   * source if this is the last pass).
   */
  render(renderer, readTex, depthTex, size, pipeline) {
    if (!this.enabled) return readTex;
    const normalTex = pipeline.getNormalTexture();
    if (!normalTex) return readTex;  // normal pass disabled — skip edges

    // Refresh camera near/far in case projection changed.
    this._material.uniforms.uCameraNear.value = this._camera.near;
    this._material.uniforms.uCameraFar.value = this._camera.far;
    this._material.uniforms.tDiffuse.value = readTex;
    this._material.uniforms.tNormal.value = normalTex;
    this._material.uniforms.tDepth.value = depthTex;

    renderer.setRenderTarget(this._rt);
    renderer.render(this._scene, this._cam);
    return this._rt.texture;
  }

  resize(width, height) {
    this._rt.setSize(width, height);
    this._material.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  setOptions(opts = {}) {
    const u = this._material.uniforms;
    if (opts.enabled !== undefined) this.enabled = !!opts.enabled;
    if (opts.intensity !== undefined) u.uIntensity.value = opts.intensity;
    if (opts.edgeColor !== undefined) u.uEdgeColor.value.set(opts.edgeColor);
    if (opts.depthThreshold !== undefined) u.uDepthThreshold.value = opts.depthThreshold;
    if (opts.normalThreshold !== undefined) u.uNormalThreshold.value = opts.normalThreshold;
    if (opts.edgeWidth !== undefined) u.uEdgeWidth.value = opts.edgeWidth;
  }

  dispose() {
    this._rt.dispose();
    this._material.dispose();
  }
}
