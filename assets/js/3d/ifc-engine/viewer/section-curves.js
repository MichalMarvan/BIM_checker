// Phase 6.8.1 — Geometric section curves.
//
// For a given clipping plane, compute actual line geometry where the plane
// intersects each mesh. Segments are stitched into closed polygons (or open
// polylines for non-manifold meshes) per entity.
//
// Output per entity:
//   {
//     modelId, expressId, ifcType, color,
//     loops: [{ points: [[x,y,z], ...], closed: bool }, ...],
//   }
//
// Algorithm: classic triangle-plane intersection. For each triangle, classify
// vertices by signed distance to plane. If signs straddle (1 above + 2 below
// or vice versa), 2 edges cross the plane → 1 line segment between the two
// intersection points. Coplanar / all-one-side triangles produce nothing.

import * as THREE from 'three';

const SIGN_EPS = 1e-6;
const STITCH_EPS = 1e-4;

/**
 * @param {ViewerCore} viewer
 * @param {{point:[x,y,z], normal:[x,y,z], offset?:number}|object} planeSpec
 * @returns {Array<{modelId, expressId, ifcType, color, loops:Array<{points:Array<[number,number,number]>, closed:boolean}>}>}
 */
export function computeSectionCurves(viewer, planeSpec) {
  if (!viewer || !planeSpec) return [];
  const plane = buildPlane(planeSpec);
  if (!plane) return [];

  // Group results by entity
  const byEntity = new Map(); // key → { modelId, expressId, ifcType, color, segments }

  for (const { meshes } of viewer._models.values()) {
    for (const mesh of meshes) {
      if (mesh.visible === false) continue;
      const segs = computeMeshSegments(mesh, plane);
      if (segs.length === 0) continue;
      const ud = mesh.userData;
      if (!ud?.modelId || ud.expressId == null) continue;
      const key = `${ud.modelId}|${ud.expressId}`;
      let entry = byEntity.get(key);
      if (!entry) {
        entry = {
          modelId: ud.modelId,
          expressId: ud.expressId,
          ifcType: ud.ifcType,
          color: mesh.material?.color?.getHex?.() ?? 0x808080,
          segments: [],
        };
        byEntity.set(key, entry);
      }
      for (const s of segs) entry.segments.push(s);
    }
  }

  const out = [];
  for (const e of byEntity.values()) {
    const loops = stitchSegmentsToLoops(e.segments, STITCH_EPS);
    if (loops.length === 0) continue;
    out.push({
      modelId: e.modelId,
      expressId: e.expressId,
      ifcType: e.ifcType,
      color: e.color,
      loops,
    });
  }
  return out;
}

function buildPlane(spec) {
  if (spec.plane && spec.plane.normal) return spec.plane; // already a THREE.Plane
  if (!spec.point || !spec.normal) return null;
  const n = new THREE.Vector3(spec.normal[0], spec.normal[1], spec.normal[2]).normalize();
  const offset = spec.offset || 0;
  const p = new THREE.Vector3(spec.point[0], spec.point[1], spec.point[2])
    .add(n.clone().multiplyScalar(offset));
  return new THREE.Plane(n, -n.dot(p));
}

function computeMeshSegments(mesh, plane) {
  const geom = mesh.geometry;
  const pos = geom?.attributes?.position;
  if (!pos) return [];
  mesh.updateMatrixWorld(true);
  const matrix = mesh.matrixWorld;
  const idx = geom.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = plane.normal;
  const k = plane.constant;

  const out = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3)     : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
    b.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
    c.fromBufferAttribute(pos, i2).applyMatrix4(matrix);

    const da = n.x * a.x + n.y * a.y + n.z * a.z + k;
    const db = n.x * b.x + n.y * b.y + n.z * b.z + k;
    const dc = n.x * c.x + n.y * c.y + n.z * c.z + k;

    // Skip if all on same side or all-coplanar
    const above = (da > SIGN_EPS) + (db > SIGN_EPS) + (dc > SIGN_EPS);
    const below = (da < -SIGN_EPS) + (db < -SIGN_EPS) + (dc < -SIGN_EPS);
    if (above === 0 || below === 0) continue;

    // Find the 2 crossed edges
    const verts = [a, b, c];
    const dists = [da, db, dc];
    const crossings = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const di = dists[i];
      const dj = dists[j];
      const oppositeSign =
        (di > SIGN_EPS && dj < -SIGN_EPS) ||
        (di < -SIGN_EPS && dj > SIGN_EPS);
      if (!oppositeSign) continue;
      const tInterp = di / (di - dj);
      crossings.push([
        verts[i].x + tInterp * (verts[j].x - verts[i].x),
        verts[i].y + tInterp * (verts[j].y - verts[i].y),
        verts[i].z + tInterp * (verts[j].z - verts[i].z),
      ]);
    }
    if (crossings.length !== 2) continue;
    out.push([crossings[0], crossings[1]]);
  }
  return out;
}

/**
 * Walk segment graph by shared endpoints to form polylines. Closed loops
 * detected when walk returns to its start point.
 */
function stitchSegmentsToLoops(segments, eps) {
  const hash = (p) =>
    `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)},${Math.round(p[2] / eps)}`;

  // Adjacency: hashedPoint → [{segIdx, endIdx (0 or 1)}]
  const adj = new Map();
  for (let i = 0; i < segments.length; i++) {
    for (let e = 0; e < 2; e++) {
      const h = hash(segments[i][e]);
      let arr = adj.get(h);
      if (!arr) { arr = []; adj.set(h, arr); }
      arr.push({ segIdx: i, endIdx: e });
    }
  }

  const used = new Set();
  const loops = [];

  function pickUnusedNeighbor(hashedPoint, exclude) {
    const arr = adj.get(hashedPoint) || [];
    for (const a of arr) {
      if (used.has(a.segIdx) || a.segIdx === exclude) continue;
      return a;
    }
    return null;
  }

  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    used.add(start);
    const points = [segments[start][0], segments[start][1]];
    const startHash = hash(points[0]);
    let closed = false;

    // Extend forward
    while (true) {
      const lastHash = hash(points[points.length - 1]);
      const next = pickUnusedNeighbor(lastHash, -1);
      if (!next) break;
      used.add(next.segIdx);
      const other = segments[next.segIdx][1 - next.endIdx];
      if (hash(other) === startHash) { closed = true; break; }
      points.push(other);
    }

    // Extend backward (only if not closed)
    if (!closed) {
      while (true) {
        const firstHash = hash(points[0]);
        const prev = pickUnusedNeighbor(firstHash, -1);
        if (!prev) break;
        used.add(prev.segIdx);
        const other = segments[prev.segIdx][1 - prev.endIdx];
        points.unshift(other);
      }
    }

    loops.push({ points, closed });
  }
  return loops;
}
