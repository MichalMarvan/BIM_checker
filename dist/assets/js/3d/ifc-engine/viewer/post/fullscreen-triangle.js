/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

// Single oversized triangle that covers the [-1, 1]² clip-space region in one
// primitive. Compared to a 6-vertex quad (two triangles meeting along a
// diagonal), the rasterizer issues fewer fragment-shader invocations along
// the diagonal seam and processes the full screen as one contiguous block —
// roughly 10% faster on most GPUs for fullscreen post passes.
//
// Vertex layout (xy in clip space):
//   v0 = (-1, -1)   bottom-left
//   v1 = ( 3, -1)   far-right (off-screen)
//   v2 = (-1,  3)   top (off-screen)
//
// The triangle is twice as large as the viewport in each axis; everything
// outside [-1, 1]² is clipped by the GPU automatically. UV is reconstructed
// in the vertex shader from gl_Position.

import * as THREE from 'three';

let _shared = null;

export function getFullscreenTriangleGeometry() {
  if (_shared) return _shared;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -1, -1, 0,
     3, -1, 0,
    -1,  3, 0,
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Bbox is for frustum culling — we want the triangle always drawn, so set
  // it to an infinite sphere. The pipeline disables frustum culling on
  // pass meshes anyway, but this is a belt-and-braces.
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Infinity);
  _shared = geom;
  return geom;
}
