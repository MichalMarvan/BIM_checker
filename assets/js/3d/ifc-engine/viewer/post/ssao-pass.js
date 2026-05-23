/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

// Screen-space ambient occlusion pass.
//
// Classic hemisphere SSAO (LearnOpenGL flavour, no HBAO/GTAO complexity):
// for every pixel, sample 16 points in a hemisphere oriented along the
// view-space surface normal. Each sample is reprojected to screen-space
// and its depth is compared against the depth at that screen position;
// if the projected point lies BEHIND the actual scene at that location,
// it contributes to occlusion (something is between this pixel and the
// hemisphere sample point).
//
// Output: scene colour multiplied by a smoothed AO factor. Most-occluded
// pixels (deep cavities, contact between objects) get a soft darkening
// that "anchors" geometry to its surroundings — bridges to terrain,
// columns to ground, recesses inside profiles.
//
// Two internal RTs:
//   _ssaoRT    — raw AO factor (R channel only)
//   _outputRT  — sceneColor × blurredAO (composite)
//
// The blur is a depth-aware 4×4 box (samples that disagree on linearised
// depth are excluded). Not a full bilateral filter, but cheap and removes
// the random-noise pattern from the kernel sampling.

import * as THREE from 'three';
import { getFullscreenTriangleGeometry } from './fullscreen-triangle.js';

const KERNEL_SIZE = 16;
const NOISE_SIZE = 4;

function buildKernel() {
  // 16 random points in unit hemisphere, biased toward the centre via a
  // squared accelerator. The bias gives more samples near the pixel (where
  // micro-occlusion lives) without sacrificing coverage further out.
  const kernel = [];
  for (let i = 0; i < KERNEL_SIZE; i++) {
    const v = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random(),         // z >= 0 → hemisphere
    );
    v.normalize();
    let scale = i / KERNEL_SIZE;
    scale = 0.1 + (scale * scale) * 0.9;   // lerp(0.1, 1.0, t²)
    v.multiplyScalar(scale);
    kernel.push(v);
  }
  return kernel;
}

function buildNoiseTexture() {
  // 4×4 random per-pixel rotations (xy in [-1,1], z=0). Wrapped across the
  // screen via REPEAT — the kernel gets rotated by a different value each
  // 4-pixel block, breaking up the banding from a fixed kernel layout.
  const data = new Float32Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
    data[i * 4]     = Math.random() * 2 - 1;
    data[i * 4 + 1] = Math.random() * 2 - 1;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.FloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SSAO_FRAG = /* glsl */`
  #define KERNEL_SIZE ${KERNEL_SIZE}
  varying vec2 vUv;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform sampler2D tNoise;
  uniform vec3 uKernel[KERNEL_SIZE];
  uniform mat4 uProj;
  uniform mat4 uInvProj;
  uniform vec2 uResolution;
  uniform float uRadius;
  uniform float uBias;

  vec3 reconstructViewPos(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uInvProj * clip;
    return view.xyz / view.w;
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 0.99995) {
      gl_FragColor = vec4(1.0);   // sky/background — no occlusion
      return;
    }

    vec3 pos = reconstructViewPos(vUv, depth);
    vec3 nrm = normalize(texture2D(tNormal, vUv).rgb * 2.0 - 1.0);

    // Noise tile across screen at 4-pixel granularity, breaks kernel banding.
    vec2 noiseScale = uResolution / float(${NOISE_SIZE});
    vec3 rvec = texture2D(tNoise, vUv * noiseScale).xyz;

    // Gram-Schmidt orthogonalisation to build a TBN that aligns the kernel
    // hemisphere with the surface normal.
    vec3 tangent = normalize(rvec - nrm * dot(rvec, nrm));
    vec3 bitangent = cross(nrm, tangent);
    mat3 TBN = mat3(tangent, bitangent, nrm);

    float occlusion = 0.0;
    for (int i = 0; i < KERNEL_SIZE; i++) {
      vec3 samplePos = TBN * uKernel[i];
      samplePos = pos + samplePos * uRadius;

      vec4 offset = uProj * vec4(samplePos, 1.0);
      offset.xyz /= offset.w;
      offset.xy = offset.xy * 0.5 + 0.5;

      // Outside the screen? skip — no info there.
      if (offset.x < 0.0 || offset.x > 1.0 || offset.y < 0.0 || offset.y > 1.0) continue;

      float sampleDepth = texture2D(tDepth, offset.xy).x;
      vec3 sceneAtSample = reconstructViewPos(offset.xy, sampleDepth);

      // Range check — limits effect to within the kernel radius so distant
      // surfaces (foreground/background pairs) don't falsely occlude each
      // other across the whole scene.
      float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(abs(pos.z - sceneAtSample.z), 0.0001));
      occlusion += (sceneAtSample.z >= samplePos.z + uBias ? 1.0 : 0.0) * rangeCheck;
    }
    float ao = 1.0 - occlusion / float(KERNEL_SIZE);
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tSSAO;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uIntensity;
  uniform float uPower;
  uniform float uBlurDepthThreshold;

  void main() {
    vec3 sceneCol = texture2D(tDiffuse, vUv).rgb;
    float dC = texture2D(tDepth, vUv).x;

    // 6×6 depth-aware box average — discards samples whose depth disagrees
    // with the centre by more than the threshold. Cheap proxy for bilateral
    // filtering; the wider kernel cleans up SSAO kernel noise that a
    // 4×4 box leaves visible on flat surfaces.
    float sumAO = 0.0;
    float weights = 0.0;
    for (int x = -2; x <= 3; x++) {
      for (int y = -2; y <= 3; y++) {
        vec2 off = vec2(float(x), float(y)) * uTexel;
        float dS = texture2D(tDepth, vUv + off).x;
        float dDiff = abs(dS - dC);
        if (dDiff < uBlurDepthThreshold) {
          sumAO += texture2D(tSSAO, vUv + off).r;
          weights += 1.0;
        }
      }
    }
    float ao = weights > 0.0 ? sumAO / weights : 1.0;
    ao = pow(clamp(ao, 0.0, 1.0), uPower);
    // Modulate scene by AO. uIntensity=0 means no AO contribution; =1 means
    // fully multiplicative (deep occlusion → black). 0.7 leaves the
    // brightest pixels untouched and only darkens contact zones.
    float modulator = mix(1.0, ao, uIntensity);
    gl_FragColor = vec4(sceneCol * modulator, 1.0);
  }
`;

export class SSAOPass {
  /**
   * @param {PostPipeline} pipeline
   * @param {THREE.Camera} camera
   */
  constructor(pipeline, camera, opts = {}) {
    this._pipeline = pipeline;
    this._camera = camera;
    this.enabled = opts.enabled ?? true;
    this.needsNormals = true;

    const size = pipeline.getSize();

    // Full-resolution SSAO by default — the 16 hemisphere taps × 1080p ≈
    // 33M lookups/frame, comfortably under modern GPU throughput. Half-res
    // is available via opts.aoScale=0.5 for mobile fallback, but it adds
    // visible kernel noise on flat surfaces because the 4×4 noise tile
    // doubles in screen-space and the post-blur can't catch it.
    this._aoScale = opts.aoScale ?? 1.0;
    const aw = Math.max(1, Math.floor(size.width  * this._aoScale));
    const ah = Math.max(1, Math.floor(size.height * this._aoScale));
    this._ssaoRT = new THREE.WebGLRenderTarget(aw, ah, {
      colorSpace: THREE.NoColorSpace,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._ssaoRT.texture.name = 'SSAOPass.raw';

    this._outputRT = new THREE.WebGLRenderTarget(size.width, size.height, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._outputRT.texture.name = 'SSAOPass.composite';

    this._kernel = buildKernel();
    this._noise = buildNoiseTexture();

    this._ssaoMat = new THREE.ShaderMaterial({
      name: 'SSAOPass.compute',
      uniforms: {
        tDepth:   { value: null },
        tNormal:  { value: null },
        tNoise:   { value: this._noise },
        uKernel:  { value: this._kernel },
        uProj:    { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(aw, ah) },
        uRadius:  { value: opts.radius ?? 0.5 },
        uBias:    { value: opts.bias ?? 0.025 },
      },
      vertexShader: VERT,
      fragmentShader: SSAO_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this._compositeMat = new THREE.ShaderMaterial({
      name: 'SSAOPass.composite',
      uniforms: {
        tDiffuse: { value: null },
        tSSAO:    { value: this._ssaoRT.texture },
        tDepth:   { value: null },
        uTexel:   { value: new THREE.Vector2(1 / size.width, 1 / size.height) },
        uIntensity: { value: opts.intensity ?? 0.85 },
        uPower:     { value: opts.power ?? 1.5 },
        uBlurDepthThreshold: { value: opts.blurDepthThreshold ?? 0.0008 },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this._scene = new THREE.Scene();
    this._mesh = new THREE.Mesh(getFullscreenTriangleGeometry(), this._ssaoMat);
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Update SSAO radius (call after fitAll — radius in scene-units, typically
   * 1–2% of scene bounding-sphere radius).
   */
  setRadius(r) {
    if (Number.isFinite(r) && r > 0) {
      this._ssaoMat.uniforms.uRadius.value = r;
    }
  }

  setOptions(opts = {}) {
    if (opts.enabled !== undefined) this.enabled = !!opts.enabled;
    if (opts.intensity !== undefined) this._compositeMat.uniforms.uIntensity.value = opts.intensity;
    if (opts.power !== undefined) this._compositeMat.uniforms.uPower.value = opts.power;
    if (opts.radius !== undefined) this.setRadius(opts.radius);
    if (opts.bias !== undefined) this._ssaoMat.uniforms.uBias.value = opts.bias;
  }

  render(renderer, readTex, depthTex, size, pipeline) {
    if (!this.enabled) return readTex;
    const normalTex = pipeline.getNormalTexture();
    if (!normalTex) return readTex;

    // Refresh camera matrices — projection can change between frames
    // (resize, projection swap perspective↔orthographic).
    this._ssaoMat.uniforms.uProj.value.copy(this._camera.projectionMatrix);
    this._ssaoMat.uniforms.uInvProj.value.copy(this._camera.projectionMatrixInverse);

    // 1. SSAO compute → half-res ssaoRT
    this._ssaoMat.uniforms.tDepth.value  = depthTex;
    this._ssaoMat.uniforms.tNormal.value = normalTex;
    this._mesh.material = this._ssaoMat;
    renderer.setRenderTarget(this._ssaoRT);
    renderer.render(this._scene, this._cam);

    // 2. Blur + composite → outputRT (full res)
    this._compositeMat.uniforms.tDiffuse.value = readTex;
    this._compositeMat.uniforms.tDepth.value   = depthTex;
    this._mesh.material = this._compositeMat;
    renderer.setRenderTarget(this._outputRT);
    renderer.render(this._scene, this._cam);
    return this._outputRT.texture;
  }

  resize(width, height) {
    const aw = Math.max(1, Math.floor(width  * this._aoScale));
    const ah = Math.max(1, Math.floor(height * this._aoScale));
    this._ssaoRT.setSize(aw, ah);
    this._outputRT.setSize(width, height);
    this._ssaoMat.uniforms.uResolution.value.set(aw, ah);
    this._compositeMat.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  dispose() {
    this._ssaoRT.dispose();
    this._outputRT.dispose();
    this._ssaoMat.dispose();
    this._compositeMat.dispose();
    this._noise.dispose();
  }
}
