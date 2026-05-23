/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

// Post-processing pipeline scaffold.
//
// Renders the scene to an off-screen WebGLRenderTarget instead of directly
// to the canvas, then blits the result back via a fullscreen triangle. This
// scaffold is invisible by itself — the point is that `_sceneRT.depthTexture`
// now contains valid depth data for subsequent passes (SSAO, screen-space
// edges) to sample.
//
// Pass registry:
//   pipeline.addPass(pass) — pass.render(renderer, readTex, depthTex, viewport, pipeline)
//     is called between scene render and final blit. The pass may render
//     into an internal RT of its own and expose its output via getter.
//
// For Fáze B no passes are registered; the pipeline is a transparent wrapper.
// Acceptance: viewer looks identical to direct render.

import * as THREE from 'three';
import { getFullscreenTriangleGeometry } from './fullscreen-triangle.js';

export class PostPipeline {
  constructor(renderer, width, height) {
    this._renderer = renderer;
    this._width = Math.max(1, width | 0);
    this._height = Math.max(1, height | 0);
    this._passes = [];

    // Multisampled scene RT — `samples: 4` gives hardware MSAA on the RT
    // path. WebGL2 supports multisample renderbuffers; three.js handles
    // the implicit blit-to-sampleable-texture when the texture is read.
    // Without this, edges of geometry become aliased after the refactor
    // (the canvas-bound `antialias: true` only applies to the default
    // framebuffer, not to RTs).
    //
    // DepthTexture: read-back of depth values from the same RT. UnsignedInt
    // (24-bit) is precise enough for our scenes and is broadly compatible —
    // FloatType would need EXT_color_buffer_float and isn't needed for the
    // SSAO/edges threshold math (they normalize anyway).
    const depthTex = new THREE.DepthTexture(this._width, this._height);
    depthTex.format = THREE.DepthFormat;
    depthTex.type = THREE.UnsignedIntType;

    this._sceneRT = new THREE.WebGLRenderTarget(this._width, this._height, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      depthTexture: depthTex,
      samples: 4,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._sceneRT.texture.name = 'PostPipeline.scene.color';
    this._sceneRT.depthTexture.name = 'PostPipeline.scene.depth';

    // Output pass: blits the (possibly post-processed) color RT to the
    // canvas via a fullscreen triangle. ShaderMaterial because we want
    // three.js to inject precision qualifiers / GLSL version — keeps this
    // file dependency-free of GLSL version juggling.
    this._outputScene = new THREE.Scene();
    this._outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._outputMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const outputMesh = new THREE.Mesh(getFullscreenTriangleGeometry(), this._outputMaterial);
    outputMesh.frustumCulled = false;
    this._outputScene.add(outputMesh);
  }

  /**
   * Register a post pass. Pass interface (informal):
   *   pass.render(renderer, readTex, depthTex, size, pipeline) → outputTex
   *   pass.resize(width, height)
   *   pass.dispose()
   * `outputTex` becomes the input to the next pass; the last pass's output
   * is blitted to canvas via the output material.
   */
  addPass(pass) {
    if (pass && typeof pass.render === 'function') {
      this._passes.push(pass);
    }
  }

  removePass(pass) {
    const i = this._passes.indexOf(pass);
    if (i >= 0) this._passes.splice(i, 1);
  }

  /**
   * Main render entry — drop-in replacement for `renderer.render(scene, camera)`.
   * Always restores renderer.renderTarget to null on exit so callers that
   * follow with their own .render() call land on the canvas.
   */
  render(scene, camera) {
    const renderer = this._renderer;

    // 1. Scene → sceneRT (color + depth, multisampled)
    renderer.setRenderTarget(this._sceneRT);
    renderer.render(scene, camera);

    // 2. Run registered passes in order. Each pass returns the texture that
    //    should be sampled by the next stage (typically its own output RT).
    let inputTex = this._sceneRT.texture;
    const depthTex = this._sceneRT.depthTexture;
    const size = { width: this._width, height: this._height };
    for (const pass of this._passes) {
      const out = pass.render(renderer, inputTex, depthTex, size, this);
      if (out) inputTex = out;
    }

    // 3. Blit final to canvas.
    renderer.setRenderTarget(null);
    this._outputMaterial.uniforms.tDiffuse.value = inputTex;
    renderer.render(this._outputScene, this._outputCamera);
  }

  resize(width, height) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    this._sceneRT.setSize(w, h);
    // DepthTexture must be resized via the renderTarget — Three.js's
    // WebGLRenderTarget.setSize handles depth attachments tied to it.
    for (const pass of this._passes) {
      if (typeof pass.resize === 'function') pass.resize(w, h);
    }
  }

  /** Size and depth texture accessors for passes that need them. */
  getSize() { return { width: this._width, height: this._height }; }
  getSceneTexture() { return this._sceneRT.texture; }
  getDepthTexture() { return this._sceneRT.depthTexture; }

  dispose() {
    this._sceneRT.dispose();
    this._sceneRT.depthTexture.dispose();
    this._outputMaterial.dispose();
    for (const pass of this._passes) {
      if (typeof pass.dispose === 'function') pass.dispose();
    }
    this._passes.length = 0;
  }
}
