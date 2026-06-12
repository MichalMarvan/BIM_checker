// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Merged-geometry model builder (mesh-merging plan, etapa 1).
//
// One THREE.Mesh per model instead of one per element: all accepted item
// geometries are baked into a single vertex-colored BufferGeometry, with a
// triangle-range table mapping faceIndex → element. Draw calls per model
// drop from ~2× element count to ~1.
//
// Precision: item geometries keep vertices near their own centroid and the
// huge placement translations (S-JTSK ~10^6 m) live in per-item matrices.
// Baking those matrices directly would overflow f32, so vertices are baked
// into a MODEL-ANCHOR frame: anchor = center of all transformed bboxes,
// computed and applied in f64 (Matrix4 math), leaving small f32 values.
// The anchor translation goes on the merged mesh's matrix (JS-side f64),
// exactly the same story as the legacy per-mesh path — and the viewer-page
// federation bake (shift × matrixWorld) keeps working unchanged.

import * as THREE from 'three';

/**
 * @param {Array<{entity, ifcType, item, result, typeColor}>} accepted —
 *        outlier-filtered items from addModel
 * @param {(item, result) => THREE.Matrix4} computeItemMatrix — the legacy
 *        per-item transform (placement × mappedItem × localOrigin)
 * @param {THREE.Material} material — shared vertex-colored material
 * @returns {{ mesh, table, elementInfo, elementsByType }}
 *   table — rows { expressId, ifcType, triStart, triCount, vertStart, vertCount }
 *           sorted by triStart (binary-searchable by faceIndex)
 *   elementInfo — Map<expressId, { ifcType }>
 *   elementsByType — Map<UPPERCASE_TYPE, number[]>
 */
export function buildMergedModel(accepted, computeItemMatrix, material) {
  // Pass 1 — sizes + per-item matrices + anchor from transformed bboxes (f64)
  const prepared = [];
  let totalVerts = 0;
  let totalTris = 0;
  const bboxMin = [Infinity, Infinity, Infinity];
  const bboxMax = [-Infinity, -Infinity, -Infinity];
  const corner = new THREE.Vector3();

  for (const cand of accepted) {
    const geom = cand.item.bufferGeometry;
    const pos = geom.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    const matrix = computeItemMatrix(cand.item, cand.result);
    const triCount = geom.index ? geom.index.count / 3 : pos.count / 3;
    prepared.push({ cand, geom, matrix, vertCount: pos.count, triCount });
    totalVerts += pos.count;
    totalTris += triCount;

    if (!geom.boundingBox) geom.computeBoundingBox();
    const bb = geom.boundingBox;
    for (let c = 0; c < 8; c++) {
      corner.set(
        (c & 1) ? bb.max.x : bb.min.x,
        (c & 2) ? bb.max.y : bb.min.y,
        (c & 4) ? bb.max.z : bb.min.z,
      ).applyMatrix4(matrix);
      for (let a = 0; a < 3; a++) {
        const v = corner.getComponent(a);
        if (v < bboxMin[a]) bboxMin[a] = v;
        if (v > bboxMax[a]) bboxMax[a] = v;
      }
    }
  }
  if (prepared.length === 0) return null;

  const anchor = new THREE.Vector3(
    (bboxMin[0] + bboxMax[0]) / 2,
    (bboxMin[1] + bboxMax[1]) / 2,
    (bboxMin[2] + bboxMax[2]) / 2,
  );
  const toAnchor = new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z);

  // Pass 2 — bake into the merged buffers
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const index = new Uint32Array(totalTris * 3);

  const table = [];
  const elementInfo = new Map();
  const elementsByType = new Map();
  const bakeMatrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  let vertOfs = 0;
  let triOfs = 0;

  for (const { cand, geom, matrix, vertCount, triCount } of prepared) {
    bakeMatrix.multiplyMatrices(toAnchor, matrix);
    normalMatrix.getNormalMatrix(bakeMatrix);

    const pos = geom.getAttribute('position');
    for (let i = 0; i < vertCount; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(bakeMatrix);
      positions[(vertOfs + i) * 3] = v.x;
      positions[(vertOfs + i) * 3 + 1] = v.y;
      positions[(vertOfs + i) * 3 + 2] = v.z;
    }

    const nor = geom.getAttribute('normal');
    if (nor) {
      for (let i = 0; i < vertCount; i++) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        normals[(vertOfs + i) * 3] = v.x;
        normals[(vertOfs + i) * 3 + 1] = v.y;
        normals[(vertOfs + i) * 3 + 2] = v.z;
      }
    }

    // Per-vertex colors: copy an existing colour-map attribute through,
    // otherwise fill the element's constant colour (styled → type → default).
    const existing = geom.getAttribute('color');
    if (existing) {
      for (let i = 0; i < vertCount; i++) {
        colors[(vertOfs + i) * 3] = existing.getX(i);
        colors[(vertOfs + i) * 3 + 1] = existing.getY(i);
        colors[(vertOfs + i) * 3 + 2] = existing.getZ(i);
      }
    } else {
      color.setHex(cand.item.color ?? cand.typeColor);
      for (let i = 0; i < vertCount; i++) {
        colors[(vertOfs + i) * 3] = color.r;
        colors[(vertOfs + i) * 3 + 1] = color.g;
        colors[(vertOfs + i) * 3 + 2] = color.b;
      }
    }

    if (geom.index) {
      const src = geom.index;
      for (let i = 0; i < src.count; i++) index[triOfs * 3 + i] = src.getX(i) + vertOfs;
    } else {
      for (let i = 0; i < vertCount; i++) index[triOfs * 3 + i] = vertOfs + i;
    }

    const expressId = cand.entity.expressId;
    table.push({
      expressId,
      ifcType: cand.ifcType,
      triStart: triOfs,
      triCount,
      vertStart: vertOfs,
      vertCount,
    });
    if (!elementInfo.has(expressId)) {
      elementInfo.set(expressId, { ifcType: cand.ifcType });
      let list = elementsByType.get(cand.ifcType);
      if (!list) elementsByType.set(cand.ifcType, (list = []));
      list.push(expressId);
    }

    vertOfs += vertCount;
    triOfs += triCount;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Per-element visibility/fade (etapa 3): 0 = fully visible (the WebGL
  // default for meshes that LACK the attribute — keeps the patched normal
  // override material safe on legacy meshes), 1 = hidden. Fractions fade.
  merged.setAttribute('elemHide', new THREE.BufferAttribute(new Float32Array(totalVerts), 1));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const mesh = new THREE.Mesh(merged, material);
  mesh.applyMatrix4(new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
  return { mesh, table, elementInfo, elementsByType };
}

/** Binary search the range table by raycast faceIndex. */
export function resolveMergedFace(table, faceIndex) {
  if (!Array.isArray(table) || !Number.isInteger(faceIndex)) return null;
  let lo = 0;
  let hi = table.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = table[mid];
    if (faceIndex < row.triStart) hi = mid - 1;
    else if (faceIndex >= row.triStart + row.triCount) lo = mid + 1;
    else return row;
  }
  return null;
}

/**
 * Extract one element's triangles from the merged buffer into a standalone
 * BufferGeometry (positions + normals, no colors) — used for the selection /
 * hover highlight overlay. Reads the CURRENT buffer, so it stays correct
 * after the federation bake rewrites vertices. Geometry is in the merged
 * mesh's local frame — attach the overlay as a child of that mesh.
 */
export function extractElementGeometry(mesh, table, expressId) {
  const pos = mesh.geometry.getAttribute('position');
  const nor = mesh.geometry.getAttribute('normal');
  const idx = mesh.geometry.index;
  if (!pos || !idx) return null;

  const rows = table.filter(r => r.expressId === expressId);
  if (rows.length === 0) return null;

  let vertTotal = 0;
  let triTotal = 0;
  for (const r of rows) { vertTotal += r.vertCount; triTotal += r.triCount; }

  const outPos = new Float32Array(vertTotal * 3);
  const outNor = new Float32Array(vertTotal * 3);
  const outIdx = new Uint32Array(triTotal * 3);
  let vOfs = 0;
  let tOfs = 0;
  for (const r of rows) {
    outPos.set(pos.array.subarray(r.vertStart * 3, (r.vertStart + r.vertCount) * 3), vOfs * 3);
    if (nor) outNor.set(nor.array.subarray(r.vertStart * 3, (r.vertStart + r.vertCount) * 3), vOfs * 3);
    for (let i = 0; i < r.triCount * 3; i++) {
      outIdx[tOfs * 3 + i] = idx.getX(r.triStart * 3 + i) - r.vertStart + vOfs;
    }
    vOfs += r.vertCount;
    tOfs += r.triCount;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (nor) geom.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
  geom.setIndex(new THREE.BufferAttribute(outIdx, 1));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Element bbox computed from the CURRENT merged buffer (valid even after the
 * federation bake rewrites vertices), in world space.
 */
export function mergedElementBox(mesh, table, expressId) {
  const pos = mesh.geometry.getAttribute('position');
  if (!pos) return null;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let found = false;
  mesh.updateMatrixWorld();
  for (const row of table) {
    if (row.expressId !== expressId) continue;
    for (let i = row.vertStart; i < row.vertStart + row.vertCount; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
    }
    found = true;
  }
  return found ? box : null;
}
