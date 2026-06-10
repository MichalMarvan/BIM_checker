/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

// View-space normal output material — used as scene.overrideMaterial during
// the auxiliary "normal pass" inside PostPipeline. Each visible mesh's
// normal vector is encoded into RGB so subsequent passes (edges, SSAO) can
// detect surface-orientation discontinuities by sampling this buffer.
//
// View-space (not world-space) because edge detection compares normals
// across screen-space neighbours — view-space normals are already aligned
// to the camera frame so a constant world plane shows up as a constant
// colour regardless of camera orientation.
//
// Clipping support is critical: section planes (`_renderer.localClippingEnabled`
// + `material.clippingPlanes`) hide geometry beyond the cutting plane in the
// main render; without honouring the same clipping here, the normal buffer
// would still contain hidden geometry's normals and the edges pass would
// draw phantom edges along the cut.

import * as THREE from 'three';

/**
 * Builds a fresh normal-output material. Singleton-per-pipeline because
 * three.js's clipping-uniform injection happens at compile time per material
 * instance; sharing across viewers with different section planes would
 * cross-contaminate. Pass clippingPlanes from the owner (engine sets these
 * on the renderer; we copy the same array onto the material).
 */
export function createNormalMaterial(clippingPlanes = []) {
  return new THREE.ShaderMaterial({
    name: 'PostPipeline.normal',
    uniforms: {},
    vertexShader: /* glsl */`
      varying vec3 vViewNormal;
      #include <clipping_planes_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vViewNormal;
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        // DoubleSide rendering: IFC tessellation often has flipped winding,
        // so the rasterised face may be the geometric back face. Mirror the
        // normal exactly like MeshStandardMaterial does for double-sided
        // lighting — otherwise SSAO gets an inward-pointing normal and
        // falsely occludes the entire surface (uniformly darkened meshes).
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        // Encode normal [-1, 1] → [0, 1] for UnsignedByteType RT.
        // 8-bit precision is fine for edge-detection thresholds: a 1°
        // angular change maps to a ~2/255 colour delta, well above noise.
        vec3 enc = n * 0.5 + 0.5;
        gl_FragColor = vec4(enc, 1.0);
      }
    `,
    clipping: true,
    clippingPlanes,
    // Edges pass treats the background as "no edge" via depth == 1.0 check,
    // so we don't need to write the clear color here — but the RT default
    // clear (rgba 0,0,0,0) decodes as normal (-1,-1,-1) which would create
    // false edges where geometry meets background. Workaround: blend below.
    // Actually we rely on depth-test: background pixels in the normal RT
    // will keep clear value (0.5, 0.5, 0.5) if we set clearColor accordingly
    // before render — see PostPipeline.render().
    side: THREE.DoubleSide,
    // Critical: we want the normal pass to write the SAME pixels as the
    // main color pass. depthTest=true with default LessEqual ensures
    // back-facing/hidden geometry doesn't overwrite front-facing normals.
    depthTest: true,
    depthWrite: true,
  });
}
