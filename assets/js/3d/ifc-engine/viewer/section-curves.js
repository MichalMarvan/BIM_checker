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
import { resolveMergedFace } from './merged-model.js';

const SIGN_EPS = 1e-6;
const STITCH_EPS = 1e-4;

/**
 * Ořízne 3D úsečku na obdélník řezu pomocí Liang–Barsky v rovině řezu.
 *
 * Souřadnice v rovině: `u = dot(p − origin, hAxis)` (vodorovná osa v rovině),
 * `v = p[1] − origin[1]` (svislá — world Y je nahoru). Ořezává se proti
 * mezím `−halfWidth ≤ u ≤ halfWidth` a `−halfHeight ≤ v ≤ halfHeight`.
 *
 * @param {[number,number,number]} p0 světový počáteční bod
 * @param {[number,number,number]} p1 světový koncový bod
 * @param {{origin:[number,number,number], hAxis:[number,number,number], halfWidth:number, halfHeight:number}} bounds
 * @returns {[[number,number,number],[number,number,number]]|null} ořezaná úsečka nebo null (celá venku)
 */
export function clipSegmentToBounds(p0, p1, bounds) {
  const { origin, hAxis, halfWidth, halfHeight } = bounds;

  // Promítni oba konce do rovinných souřadnic (u, v).
  const u0 = (p0[0] - origin[0]) * hAxis[0]
           + (p0[1] - origin[1]) * hAxis[1]
           + (p0[2] - origin[2]) * hAxis[2];
  const u1 = (p1[0] - origin[0]) * hAxis[0]
           + (p1[1] - origin[1]) * hAxis[1]
           + (p1[2] - origin[2]) * hAxis[2];
  const v0 = p0[1] - origin[1];
  const v1 = p1[1] - origin[1];

  const du = u1 - u0;
  const dv = v1 - v0;

  // Liang–Barsky: parametr t∈[0,1] podél úsečky, čtyři hrany obdélníku.
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-du, u0 - (-halfWidth)],  // u ≥ −halfWidth
    [du, halfWidth - u0],      // u ≤  halfWidth
    [-dv, v0 - (-halfHeight)], // v ≥ −halfHeight
    [dv, halfHeight - v0],     // v ≤  halfHeight
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      // Úsečka rovnoběžná s hranou — pokud je mimo, celá venku.
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  // Degenerovaný výsledek (segment se dotkl obdélníku jen v jednom bodě) →
  // nulová délka, žádná kreslitelná geometrie → zahodit.
  if (t1 - t0 < 1e-12) return null;

  const q0 = [
    p0[0] + t0 * (p1[0] - p0[0]),
    p0[1] + t0 * (p1[1] - p0[1]),
    p0[2] + t0 * (p1[2] - p0[2]),
  ];
  const q1 = [
    p0[0] + t1 * (p1[0] - p0[0]),
    p0[1] + t1 * (p1[1] - p0[1]),
    p0[2] + t1 * (p1[2] - p0[2]),
  ];
  return [q0, q1];
}

/**
 * @param {ViewerCore} viewer
 * @param {{point:[x,y,z], normal:[x,y,z], offset?:number}|object} planeSpec
 * @returns {Array<{modelId, expressId, ifcType, color, loops:Array<{points:Array<[number,number,number]>, closed:boolean}>}>}
 */
export function computeSectionCurves(viewer, planeSpec) {
  if (!viewer || !planeSpec) return [];
  const plane = buildPlane(planeSpec);
  if (!plane) return [];

  // Volitelný ořez na obdélník kolem osy: každý segment se ořízne ještě
  // před stitchingem, aby nekonečná rovina nezasahovala vzdálené části modelu.
  const bounds = planeSpec.bounds || null;

  // Group results by entity
  const byEntity = new Map(); // key → { modelId, expressId, ifcType, color, segments }

  for (const [modelId, m] of viewer._models) {
    if (m.merged) {
      // One mesh for all elements — tag each crossing segment with the
      // element that owns its triangle (via the merged range table) so the
      // DXF still gets per-element loops and per-IFC-type layers.
      const mesh = m.meshes[0];
      if (!mesh || mesh.visible === false) continue;
      const tagged = computeMeshSegments(mesh, plane, true, bounds);
      const hideAttr = mesh.geometry.getAttribute('elemHide');
      const colorAttr = mesh.geometry.getAttribute('color');
      for (const { seg, tri } of tagged) {
        const row = resolveMergedFace(m.mergedTable, tri);
        if (!row) continue;
        if (hideAttr && hideAttr.array[row.vertStart] > 0.98) continue; // skip hidden elements
        const key = `${modelId}|${row.expressId}`;
        let entry = byEntity.get(key);
        if (!entry) {
          const info = m.elementInfo && m.elementInfo.get(row.expressId);
          // Element's display colour = its per-vertex colour at the first vertex
          let color = 0x808080;
          if (colorAttr) {
            const i = row.vertStart * 3;
            color = (Math.round(colorAttr.array[i] * 255) << 16)
                  | (Math.round(colorAttr.array[i + 1] * 255) << 8)
                  | Math.round(colorAttr.array[i + 2] * 255);
          }
          entry = { modelId, expressId: row.expressId, ifcType: info ? info.ifcType : row.ifcType, color, segments: [] };
          byEntity.set(key, entry);
        }
        entry.segments.push(seg);
      }
      continue;
    }
    for (const mesh of m.meshes) {
      if (mesh.visible === false) continue;
      const segs = computeMeshSegments(mesh, plane, false, bounds);
      if (segs.length === 0) continue;
      const ud = mesh.userData;
      if (!ud?.modelId || ud.expressId === null || ud.expressId === undefined) continue;
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

/**
 * @param {boolean} [tagged] when true, return [{ seg:[p0,p1], tri }] so the
 *   caller can map each segment to its merged element; otherwise [[p0,p1]].
 * @param {object|null} [bounds] volitelný obdélník řezu; segmenty se ořežou
 *   pomocí clipSegmentToBounds a ty zcela mimo se zahodí.
 */
function computeMeshSegments(mesh, plane, tagged = false, bounds = null) {
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
    let seg = [crossings[0], crossings[1]];
    if (bounds) {
      seg = clipSegmentToBounds(seg[0], seg[1], bounds);
      if (!seg) continue; // celý mimo obdélník řezu → zahodit
    }
    if (tagged) out.push({ seg, tri: t });
    else out.push(seg);
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
