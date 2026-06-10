// IFC geometry primitives → THREE.BufferGeometry.
// Phase 1: IfcTriangulatedFaceSet, IfcFacetedBrep.
// Phase 2 (this file expanded): IfcExtrudedAreaSolid (rectangle / circle /
// arbitrary closed / I-shape profiles), IfcShellBasedSurfaceModel,
// IfcPolygonalFaceSet. MappedItem + BooleanResult handled in geometry-core.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parsePointList } from './step-helpers.js';

// -------------------- shared parsers --------------------

function parseIntTripleList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseInt(s.trim(), 10)));
}

/** Parse list of int N-tuples "((1,3,2),(1,4,3,5),...)" → [[1,3,2],[1,4,3,5],...] */
function parseIntNTupleList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseInt(s.trim(), 10)));
}

/**
 * Parse IfcIndexedPolyCurve.Segments list — a heterogeneous list of
 * IfcLineIndex / IfcArcIndex select-typed entries.
 *
 * Input STEP format example:
 *   "(IFCLINEINDEX((1,2,3,4)), IFCARCINDEX((4,5,6)), IFCLINEINDEX((6,7,1)))"
 *
 * Returns: [{ type: 'line'|'arc', indices: [..] }, ...]
 *
 * Falls back to treating every group as a line segment when the type tags
 * are absent (older exporters that emit plain tuples).
 */
function parseSegmentList(raw) {
  if (!raw) return [];
  const trimmed = raw.replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  // Match either IFCLINEINDEX((..)) / IFCARCINDEX((..)) or bare ((..))
  const re = /(IFCLINEINDEX|IFCARCINDEX)?\s*\(\s*\(([^()]+)\)\s*\)/gi;
  let m;
  while ((m = re.exec(trimmed)) !== null) {
    const typeTag = (m[1] || 'IFCLINEINDEX').toUpperCase();
    const type = typeTag === 'IFCARCINDEX' ? 'arc' : 'line';
    const indices = m[2].split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    if (indices.length > 0) out.push({ type, indices });
  }
  return out;
}

/**
 * Tessellate a 3-point arc (start, mid, end) into N sample points (inclusive
 * of start, exclusive of end so consecutive segments don't double-up).
 *
 * Solves circle centre via perpendicular bisectors of chords start→mid and
 * mid→end. Falls back to straight line when the three points are collinear.
 */
function tessellateArc2D(p1, p2, p3, segments = 12) {
  const ax = (p1[0] + p2[0]) / 2, ay = (p1[1] + p2[1]) / 2;
  const bx = (p2[0] + p3[0]) / 2, by = (p2[1] + p3[1]) / 2;
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
  const d2x = p3[0] - p2[0], d2y = p3[1] - p2[1];
  // Perpendicular directions of the chords
  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-9) {
    // Collinear → straight line; emit start + mid as fallback (end appended by caller)
    return [[p1[0], p1[1]], [p2[0], p2[1]]];
  }
  // Solve: A + t1 * perp1 = B + t2 * perp2  → centre
  const px1 = -d1y, py1 = d1x; // perp of chord 1
  const px2 = -d2y, py2 = d2x; // perp of chord 2
  // (ax + t1*px1, ay + t1*py1) = (bx + t2*px2, by + t2*py2)
  // → t1*px1 - t2*px2 = bx - ax
  // → t1*py1 - t2*py2 = by - ay
  const denom = px1 * (-py2) - py1 * (-px2);
  if (Math.abs(denom) < 1e-12) return [[p1[0], p1[1]], [p2[0], p2[1]]];
  const t1 = ((bx - ax) * (-py2) - (by - ay) * (-px2)) / denom;
  const cx = ax + t1 * px1;
  const cy = ay + t1 * py1;
  const radius = Math.hypot(p1[0] - cx, p1[1] - cy);
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
  const a3 = Math.atan2(p3[1] - cy, p3[0] - cx);
  // Determine sweep direction: pick the direction that passes through p2.
  let delta = a3 - a1;
  // Normalise to (-π, π]
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  // Check if p2 lies on the chosen short sweep; if not, take the long sweep.
  const midCheckAngle = a1 + delta / 2;
  let mxDiff = Math.cos(midCheckAngle) - (p2[0] - cx) / radius;
  let myDiff = Math.sin(midCheckAngle) - (p2[1] - cy) / radius;
  if (mxDiff * mxDiff + myDiff * myDiff > 0.01) {
    // Take the complementary sweep
    delta = delta > 0 ? delta - Math.PI * 2 : delta + Math.PI * 2;
  }
  const out = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const a = a1 + delta * t;
    out.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return out;
}

function parseFloatScalar(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Resolve IfcCartesianPoint/IfcDirection → [x,y,z] (or [x,y] for 2D). */
function resolveCoords(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e) return null;
  const inner = e.params.replace(/^\(+|\)+$/g, '');
  return inner.split(',').map(s => parseFloat(s.trim()));
}

// -------------------- Face / Shell utilities --------------------

/**
 * Newell's method: stable polygon normal for non-planar / slightly-twisted faces.
 */
function computePolygonNormal(polygon) {
  let nx = 0, ny = 0, nz = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return [0, 0, 1];
  return [nx / len, ny / len, nz / len];
}

/**
 * Triangulate a (possibly concave, possibly non-planar) 3D polygon by
 * projecting it onto its own best-fit plane, running THREE.ShapeUtils
 * earcut, and lifting indices back. Returns triangle index list i.e.
 * [i0, j0, k0, i1, j1, k1, ...] into the original polygon array.
 *
 * Triangle-only polygons skip the earcut path (fast path).
 */
function triangulatePolygon3D(polygon) {
  if (polygon.length < 3) return null;
  if (polygon.length === 3) return [0, 1, 2];
  if (polygon.length === 4) {
    // Quad — try the diagonal that keeps both triangles roughly convex.
    // Cheap approximation: just split 0-1-2 and 0-2-3. Works for most rectangular faces.
    return [0, 1, 2, 0, 2, 3];
  }

  const normal = computePolygonNormal(polygon);
  // Build 2D basis (u, v) perpendicular to normal
  const z = new THREE.Vector3(normal[0], normal[1], normal[2]);
  const ref = Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(z, ref).normalize();
  const v = new THREE.Vector3().crossVectors(z, u);

  const flat = polygon.map(p => new THREE.Vector2(
    u.x * p[0] + u.y * p[1] + u.z * p[2],
    v.x * p[0] + v.y * p[1] + v.z * p[2]
  ));

  // ShapeUtils.triangulateShape expects CCW outer contour. Reverse if CW.
  if (THREE.ShapeUtils.isClockWise(flat)) flat.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(flat, []);
  if (!tris || tris.length === 0) {
    // Fallback to fan if earcut fails (very degenerate input)
    const out = [];
    for (let i = 1; i < polygon.length - 1; i++) out.push(0, i, i + 1);
    return out;
  }

  // If we reversed the polygon during projection, the triangle indices refer
  // to the reversed list. Remap them back to original order.
  if (flat.length === polygon.length && tris.length > 0) {
    // Check if reversal happened: shapeUtils mutates passed array; reversed = polygon[i] ↔ flat[len-1-i]
    // Detect by comparing first projected point in reversed list
    const reversed = (flat[0].x !== (u.x * polygon[0][0] + u.y * polygon[0][1] + u.z * polygon[0][2])
                   || flat[0].y !== (v.x * polygon[0][0] + v.y * polygon[0][1] + v.z * polygon[0][2]));
    if (reversed) {
      const N = polygon.length;
      const out = [];
      for (const t of tris) out.push(N - 1 - t[0], N - 1 - t[1], N - 1 - t[2]);
      return out;
    }
  }

  const out = [];
  for (const t of tris) out.push(t[0], t[1], t[2]);
  return out;
}

/**
 * Push a polygon to the position/index arrays using a proper concave-safe
 * triangulator (Newell + 2D earcut projection). Falls back to fan triangulation
 * if earcut returns nothing.
 */
function pushTriangulatedPolygon(polygon, positions, indices) {
  if (polygon.length < 3) return;
  const tris = triangulatePolygon3D(polygon);
  if (!tris || tris.length === 0) return;
  const baseIndex = positions.length / 3;
  for (const v of polygon) positions.push(v[0], v[1], v[2]);
  for (const i of tris) indices.push(baseIndex + i);
}

/**
 * Triangulate a polygon with one or more holes (voids). Used by
 * IfcIndexedPolygonalFaceWithVoids and IfcFaceBound chains where the same
 * face contains multiple inner loops that subtract from the outer area.
 *
 * outer: array of [x, y, z] points (the outer contour)
 * holes: array of arrays of [x, y, z] points (each inner loop)
 *
 * Projects everything onto the outer polygon's best-fit plane, then calls
 * ShapeUtils.triangulateShape which expects CCW outer + CW holes. Reverses
 * either when needed so the triangulation succeeds regardless of input winding.
 */
function pushTriangulatedPolygonWithHoles(outer, holes, positions, indices) {
  if (outer.length < 3) return;
  if (!holes || holes.length === 0) {
    pushTriangulatedPolygon(outer, positions, indices);
    return;
  }

  const normal = computePolygonNormal(outer);
  const z = new THREE.Vector3(normal[0], normal[1], normal[2]);
  const ref = Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(z, ref).normalize();
  const v = new THREE.Vector3().crossVectors(z, u);

  const project = (p) => new THREE.Vector2(
    u.x * p[0] + u.y * p[1] + u.z * p[2],
    v.x * p[0] + v.y * p[1] + v.z * p[2]
  );

  // Build outer in CCW order (3D order kept in sync with 2D).
  let outer3D = outer;
  let outer2D = outer.map(project);
  if (THREE.ShapeUtils.isClockWise(outer2D)) {
    outer3D = [...outer].reverse();
    outer2D = [...outer2D].reverse();
  }

  // Build each hole in CW order (opposite to outer).
  const holes3DFlat = [];
  const holes2D = [];
  for (const hole of holes) {
    if (!hole || hole.length < 3) continue;
    let hole3D = hole;
    let hole2D = hole.map(project);
    if (!THREE.ShapeUtils.isClockWise(hole2D)) {
      hole3D = [...hole].reverse();
      hole2D = [...hole2D].reverse();
    }
    holes2D.push(hole2D);
    holes3DFlat.push(...hole3D);
  }

  const tris = THREE.ShapeUtils.triangulateShape(outer2D, holes2D);
  if (!tris || tris.length === 0) {
    // Triangulation failed (e.g., self-intersecting input). Fall back to outer-only.
    pushTriangulatedPolygon(outer, positions, indices);
    return;
  }

  // triangulateShape indices reference a flat list [outer..., hole1..., hole2...].
  const baseIndex = positions.length / 3;
  for (const vert of outer3D) positions.push(vert[0], vert[1], vert[2]);
  for (const vert of holes3DFlat) positions.push(vert[0], vert[1], vert[2]);
  for (const t of tris) indices.push(baseIndex + t[0], baseIndex + t[1], baseIndex + t[2]);
}

/**
 * Walk a IfcClosedShell → push its triangulated face polygons to position/index arrays.
 * Used by FacetedBrep and ShellBasedSurfaceModel.
 *
 * Respects IfcFaceOuterBound / IfcFaceBound Orientation flag (.T. or .F.).
 * When .F., the polygon's winding is reversed so face normals stay consistent
 * after triangulation.
 */
function appendClosedShell(entityIndex, shellId, positions, indices) {
  const shell = entityIndex.byExpressId(shellId);
  if (!shell) return;
  // Both IFCCLOSEDSHELL and IFCOPENSHELL have a list of face refs at index 0
  const shellParts = splitParams(shell.params);
  const faceRefs = parseRefList(shellParts[0]);

  for (const faceRef of faceRefs) {
    const face = entityIndex.byExpressId(faceRef);
    if (!face) continue;
    const faceParts = splitParams(face.params);
    const boundRefs = parseRefList(faceParts[0]);

    for (const boundRef of boundRefs) {
      const bound = entityIndex.byExpressId(boundRef);
      if (!bound) continue;
      const boundParts = splitParams(bound.params);
      const loopRef = parseRef(boundParts[0]);
      // Orientation: .T. (true, default) keeps polygon winding; .F. reverses.
      const orientation = (boundParts[1] || '.T.').trim();
      const loop = entityIndex.byExpressId(loopRef);
      if (!loop || loop.type !== 'IFCPOLYLOOP') continue;
      const loopParts = splitParams(loop.params);
      const pointRefs = parseRefList(loopParts[0]);

      const polygon = [];
      for (const ptRef of pointRefs) {
        const pt = entityIndex.byExpressId(ptRef);
        if (!pt || pt.type !== 'IFCCARTESIANPOINT') continue;
        const inner = pt.params.replace(/^\(/, '').replace(/\)$/, '');
        const coords = inner.split(',').map(s => parseFloat(s.trim()));
        if (coords.length === 3) polygon.push(coords);
      }
      if (orientation === '.F.') polygon.reverse();
      pushTriangulatedPolygon(polygon, positions, indices);
    }
  }
}

function geometryFromPositionsIndices(positions, indices) {
  if (positions.length === 0) return null;
  // Float32 has ~7 significant decimal digits. IFC exports from Civil 3D bake
  // absolute world coordinates (e.g., S-JTSK X≈-751620.99428...) directly into
  // IfcCartesianPoint, so adjacent triangle vertices that should differ by a
  // few microns collapse onto the same Float32 value when the buffer is
  // created, producing degenerate triangles and serrated edges that cannot
  // be recovered downstream.
  // Subtract a per-geometry local origin (here: centroid of the input points
  // in double precision) BEFORE the Float32 conversion. The local origin is
  // stored on geom.userData.localOrigin so addModel can re-apply it via the
  // mesh placement matrix and keep world-space placement unchanged.
  const n = positions.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;
  const float32 = new Float32Array(positions.length);
  for (let i = 0; i < n; i++) {
    float32[i * 3]     = positions[i * 3]     - cx;
    float32[i * 3 + 1] = positions[i * 3 + 1] - cy;
    float32[i * 3 + 2] = positions[i * 3 + 2] - cz;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(float32, 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.userData = geom.userData || {};
  geom.userData.localOrigin = [cx, cy, cz];
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  return geom;
}

/**
 * Merge coincident vertices in-place via a spatial hash (O(n) instead of
 * O(n²)). Polygons in IFC are stored without shared vertices across faces;
 * after triangulation each face contributes its own vertices. Merging makes
 * computeVertexNormals() smooth across former polygon boundaries — curved
 * surfaces (tessellated cylinders, retaining walls, road profiles) stop
 * showing the discrete-panel "wrinkled" look and look properly smooth.
 *
 * Sharp corners (e.g. 90° wall edges) get slightly rounded by this, which
 * is fine for civil/building rendering; the edge-line overlay still picks
 * them out visually.
 *
 * tolerance is in geometry units (metres for these files).
 */
export function mergeVerticesInPlace(geom, tolerance = 1e-4) {
  const posAttr = geom.attributes.position;
  if (!posAttr) return geom;
  const positions = posAttr.array;
  const vertexCount = positions.length / 3;
  if (vertexCount === 0) return geom;

  const scale = 1 / tolerance;
  const newPositions = [];
  const hashToNew = new Map();
  const oldToNew = new Int32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const hash = `${Math.round(x * scale)}|${Math.round(y * scale)}|${Math.round(z * scale)}`;
    let newIdx = hashToNew.get(hash);
    if (newIdx === undefined) {
      newIdx = newPositions.length / 3;
      newPositions.push(x, y, z);
      hashToNew.set(hash, newIdx);
    }
    oldToNew[i] = newIdx;
  }
  if (newPositions.length === positions.length) return geom; // nothing merged

  // Rebuild the index buffer, dropping triangles the weld degenerated.
  // Micro-edges in CAD tessellations (sub-tolerance slivers) collapse two
  // corners onto one index ([v,v,w]); keeping those zero-area faces feeds
  // garbage normals into the crease pass and broke its index rewrite
  // (spike triangles all converging on vertex 0).
  const oldIndex = geom.index ? geom.index.array : null;
  const triCount = (oldIndex ? oldIndex.length : vertexCount) / 3;
  const kept = [];
  for (let t = 0; t < triCount; t++) {
    const a = oldToNew[oldIndex ? oldIndex[t * 3]     : t * 3];
    const b = oldToNew[oldIndex ? oldIndex[t * 3 + 1] : t * 3 + 1];
    const c = oldToNew[oldIndex ? oldIndex[t * 3 + 2] : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    kept.push(a, b, c);
  }
  const newIndexArray = new Uint32Array(kept);

  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
  geom.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
  // Existing normal / uv attributes become invalid after vertex merge — drop them.
  geom.deleteAttribute('normal');
  return geom;
}

/**
 * Compute crease-aware vertex normals on an indexed geometry IN PLACE.
 *
 * Why this exists: `computeVertexNormals()` averages face normals across every
 * face incident at a vertex. On Civil3D tessellations the road/deck profile
 * is sampled from a parametric spline, so adjacent "flat" triangles actually
 * have face normals that differ by 0.1°–1°. The smooth average then varies
 * subtly across the surface and, at distance, shows up as visible shading
 * patches ("kocourkov" on flat slabs).
 *
 * The CAD-standard fix: for each vertex, cluster incident faces by normal
 * similarity. Each cluster gets ONE averaged normal. Faces in the same
 * cluster share a vertex (smooth shading on near-coplanar surfaces); faces
 * in different clusters get a duplicated vertex (hard edge at sharp corners).
 *
 * Unlike THREE.BufferGeometryUtils.toCreasedNormals, this preserves the index
 * buffer (only duplicates vertices at actual creases) — important for the 8GB
 * RAM ceiling on large infrastructure models.
 *
 * creaseAngleRad: faces within this angle of an existing cluster join it.
 * 30° (the CAD-standard crease default) keeps flat tessellated surfaces
 * smooth and dense cylinders/arcs (<30° per segment) smooth, while hard-
 * edging real corners INCLUDING 45° chamfers — bridge pillars and channel
 * break lines commonly use 30–50° bevels that a 50° threshold misses.
 */
export function computeCreasedVertexNormals(geom, creaseAngleRad = Math.PI * 30 / 180) {
  const positions = geom.attributes.position?.array;
  const idxAttr = geom.index;
  if (!positions || !idxAttr) {
    geom.computeVertexNormals();
    return;
  }
  const idx = idxAttr.array;
  const numFaces = idx.length / 3;
  const numVerts = positions.length / 3;
  const cosT = Math.cos(creaseAngleRad);

  // 1. Per-face normals (normalized).
  const fnx = new Float32Array(numFaces);
  const fny = new Float32Array(numFaces);
  const fnz = new Float32Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    const ia = idx[f * 3] * 3, ib = idx[f * 3 + 1] * 3, ic = idx[f * 3 + 2] * 3;
    const ax = positions[ia],     ay = positions[ia + 1], az = positions[ia + 2];
    const ex = positions[ib]     - ax, ey = positions[ib + 1] - ay, ez = positions[ib + 2] - az;
    const gx = positions[ic]     - ax, gy = positions[ic + 1] - ay, gz = positions[ic + 2] - az;
    let nx = ey * gz - ez * gy;
    let ny = ez * gx - ex * gz;
    let nz = ex * gy - ey * gx;
    const len = Math.hypot(nx, ny, nz) || 1;
    fnx[f] = nx / len; fny[f] = ny / len; fnz[f] = nz / len;
  }

  // 2. Vertex → incident faces (CSR layout for cache locality + zero alloc per vertex).
  const faceCount = new Int32Array(numVerts);
  for (let i = 0; i < idx.length; i++) faceCount[idx[i]]++;
  const faceOff = new Int32Array(numVerts + 1);
  for (let v = 0; v < numVerts; v++) faceOff[v + 1] = faceOff[v] + faceCount[v];
  const vertFaces = new Int32Array(idx.length);
  const cursor = new Int32Array(numVerts);
  for (let f = 0; f < numFaces; f++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      vertFaces[faceOff[v] + cursor[v]++] = f;
    }
  }

  // 3. For each vertex, cluster incident faces by normal similarity.
  //    Emit one new vertex per cluster. Most vertices on smooth surfaces
  //    produce exactly one cluster (no duplication).
  const newPos = [];
  const newNor = [];
  const newIdx = new Uint32Array(idx.length);
  // We rewrite the index buffer below; for each (face, vertex-slot) we need
  // to know which cluster's new-index to use. Track per-face slot remapping.

  // Scratch for clusters of the current vertex (reused).
  const cSumX = new Float64Array(16);
  const cSumY = new Float64Array(16);
  const cSumZ = new Float64Array(16);
  const cCount = new Int32Array(16);
  const cNewIdx = new Int32Array(16);

  for (let v = 0; v < numVerts; v++) {
    const start = faceOff[v];
    const end = faceOff[v + 1];
    if (start === end) continue;
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];

    // Per-face cluster assignment for this vertex.
    let numClusters = 0;
    const faceCluster = new Int32Array(end - start);

    for (let j = start; j < end; j++) {
      const f = vertFaces[j];
      const nx = fnx[f], ny = fny[f], nz = fnz[f];
      let matched = -1;
      for (let c = 0; c < numClusters; c++) {
        // Cluster avg direction (un-normalized sum still works for dot test
        // since members are unit and cluster size is small — we re-normalize
        // when emitting).
        const sx = cSumX[c], sy = cSumY[c], sz = cSumZ[c];
        const slen = Math.hypot(sx, sy, sz) || 1;
        const dot = (sx * nx + sy * ny + sz * nz) / slen;
        if (dot >= cosT) { matched = c; break; }
      }
      if (matched < 0) {
        if (numClusters >= cSumX.length) break; // safety cap (16 distinct face dirs at one vertex is already pathological)
        matched = numClusters++;
        cSumX[matched] = 0; cSumY[matched] = 0; cSumZ[matched] = 0;
        cCount[matched] = 0;
      }
      cSumX[matched] += nx; cSumY[matched] += ny; cSumZ[matched] += nz;
      cCount[matched]++;
      faceCluster[j - start] = matched;
    }

    // Emit one new vertex per cluster.
    for (let c = 0; c < numClusters; c++) {
      const sx = cSumX[c], sy = cSumY[c], sz = cSumZ[c];
      const slen = Math.hypot(sx, sy, sz) || 1;
      cNewIdx[c] = newPos.length / 3;
      newPos.push(px, py, pz);
      newNor.push(sx / slen, sy / slen, sz / slen);
    }

    // Rewrite indices: each face's slot for vertex v gets its cluster's new vertex id.
    for (let j = start; j < end; j++) {
      const f = vertFaces[j];
      const nv = cNewIdx[faceCluster[j - start]];
      // Rewrite EVERY slot of face f that references v — a degenerate face
      // ([v,v,w]) hits v in two slots; a first-match-only chain would leave
      // the second slot at its Uint32Array default (0), silently wiring the
      // triangle to vertex 0 and producing metre-long spike artifacts.
      for (let k = 0; k < 3; k++) {
        if (idx[f * 3 + k] === v) newIdx[f * 3 + k] = nv;
      }
    }
  }

  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPos), 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newNor), 3));
  geom.setIndex(new THREE.BufferAttribute(newIdx, 1));
}

/**
 * Extract topology-based feature edges from an indexed BufferGeometry.
 *
 * A feature edge is any triangle-mesh edge where:
 *   - it's a boundary edge (used by exactly one face) — outlines the open
 *     border of a surface model (e.g. road TIN edge, terrain cut), or
 *   - two adjacent face normals differ by more than `creaseAngleRad`.
 *
 * Coplanar tessellation seams (a curved road profile sampled into many
 * triangles) sit below the angle threshold and DO NOT produce edges, so the
 * resulting line layer reads as the structural "drawing" of the model —
 * silhouettes, sharp corners, holes — instead of every triangulation seam.
 *
 * Output: Float32Array [x0,y0,z0, x1,y1,z1, ...] where every consecutive
 * pair forms one line segment — directly feeds THREE.BufferGeometry for
 * THREE.LineSegments rendering.
 *
 * Phase 4b. Default angle 30° matches computeCreasedVertexNormals so the
 * two passes share their notion of "sharp": vertices the crease pass
 * duplicated (different normal clusters) align with edges this pass emits.
 * (Was 50°, which silently dropped 45° chamfer corners on pillars and
 * 30–45° break lines in channel beds — verified on D214_SO132001.)
 */
export function extractFeatureEdges(geom, creaseAngleRad = Math.PI * 30 / 180, minLength = 1e-3) {
  const positions = geom.attributes.position?.array;
  const idxAttr = geom.index;
  if (!positions || !idxAttr) return new Float32Array(0);
  const idx = idxAttr.array;
  const numFaces = idx.length / 3;
  const cosT = Math.cos(creaseAngleRad);
  const minLenSq = minLength * minLength;

  // Per-face normals. Degenerate triangles (cross length 0 — repeated indices
  // or collinear vertices after vertex merging) get a sentinel zero normal
  // and are skipped in the edge sweep so they don't emit length-zero segments.
  const fnx = new Float32Array(numFaces);
  const fny = new Float32Array(numFaces);
  const fnz = new Float32Array(numFaces);
  const faceDegenerate = new Uint8Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
    if (i0 === i1 || i1 === i2 || i0 === i2) { faceDegenerate[f] = 1; continue; }
    const ia = i0 * 3, ib = i1 * 3, ic = i2 * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const ex = positions[ib] - ax, ey = positions[ib + 1] - ay, ez = positions[ib + 2] - az;
    const gx = positions[ic] - ax, gy = positions[ic + 1] - ay, gz = positions[ic + 2] - az;
    let nx = ey * gz - ez * gy;
    let ny = ez * gx - ex * gz;
    let nz = ex * gy - ey * gx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) { faceDegenerate[f] = 1; continue; }
    fnx[f] = nx / len; fny[f] = ny / len; fnz[f] = nz / len;
  }

  // Edge map keyed by sorted vertex pair "a|b" (a<b). Value = first face id;
  // when a second face encounters the same edge, we test the dot of normals
  // and emit if it's below threshold. Boundary edges (only one face) are
  // emitted at the end.
  // Using a regular Map keyed by a packed-pair number for speed: with up to
  // ~2^21 vertices per mesh we can fit two indices in one 53-bit JS number.
  const edgeMap = new Map();   // packedKey → firstFaceId
  const out = [];

  function tryEmit(a, b) {
    const aIdx = a * 3, bIdx = b * 3;
    const dx = positions[aIdx] - positions[bIdx];
    const dy = positions[aIdx + 1] - positions[bIdx + 1];
    const dz = positions[aIdx + 2] - positions[bIdx + 2];
    if (dx * dx + dy * dy + dz * dz < minLenSq) return;  // skip degenerate / tessellation noise
    out.push(
      positions[aIdx], positions[aIdx + 1], positions[aIdx + 2],
      positions[bIdx], positions[bIdx + 1], positions[bIdx + 2]
    );
  }

  function processEdge(va, vb, faceId) {
    const a = va < vb ? va : vb;
    const b = va < vb ? vb : va;
    const key = a * 4194304 + b; // 22-bit shift; fits in safe integer
    const other = edgeMap.get(key);
    if (other === undefined) {
      edgeMap.set(key, faceId);
      return;
    }
    const dot = fnx[other] * fnx[faceId] + fny[other] * fny[faceId] + fnz[other] * fnz[faceId];
    if (dot < cosT) tryEmit(a, b);
    // Mark as "shared with a second face" so the boundary sweep ignores it.
    edgeMap.set(key, -1);
  }

  for (let f = 0; f < numFaces; f++) {
    if (faceDegenerate[f]) continue;
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
    processEdge(i0, i1, f);
    processEdge(i1, i2, f);
    processEdge(i2, i0, f);
  }

  // Boundary edges — open-shell outlines (Civil 3D ShellBasedSurfaceModel
  // road profiles, terrain cuts). Any edge still holding a face id (not -1)
  // was seen by exactly one face.
  for (const [key, firstFace] of edgeMap) {
    if (firstFace === -1) continue;
    const a = Math.floor(key / 4194304);
    const b = key % 4194304;
    tryEmit(a, b);
  }

  return new Float32Array(out);
}

// -------------------- IfcTriangulatedFaceSet --------------------

export function triangulatedFaceSetToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCTRIANGULATEDFACESET') return null;
  const parts = splitParams(entity.params);
  const coordRef = parseRef(parts[0]);
  if (!coordRef) return null;
  const coordEntity = entityIndex.byExpressId(coordRef);
  if (!coordEntity || coordEntity.type !== 'IFCCARTESIANPOINTLIST3D') return null;
  const coordParts = splitParams(coordEntity.params);
  const points = parsePointList(coordParts[0]);
  if (!parts[3] || parts[3] === '$') return null;
  const triangles = parseIntTripleList(parts[3]);

  // Subtract per-mesh centroid in double precision before Float32 conversion
  // (see geometryFromPositionsIndices for context).
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i][0]; cy += points[i][1]; cz += points[i][2];
  }
  cx /= points.length; cy /= points.length; cz /= points.length;

  const positionArr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positionArr[i * 3]     = points[i][0] - cx;
    positionArr[i * 3 + 1] = points[i][1] - cy;
    positionArr[i * 3 + 2] = points[i][2] - cz;
  }
  const indexArr = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    indexArr[i * 3]     = triangles[i][0] - 1;
    indexArr[i * 3 + 1] = triangles[i][1] - 1;
    indexArr[i * 3 + 2] = triangles[i][2] - 1;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positionArr, 3));
  geom.setIndex(new THREE.BufferAttribute(indexArr, 1));
  geom.userData = geom.userData || {};
  geom.userData.localOrigin = [cx, cy, cz];
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  return geom;
}

// -------------------- IfcFacetedBrep --------------------

export function facetedBrepToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCFACETEDBREP') return null;
  const parts = splitParams(entity.params);
  const shellRef = parseRef(parts[0]);
  if (!shellRef) return null;
  const positions = [];
  const indices = [];
  appendClosedShell(entityIndex, shellRef, positions, indices);
  return geometryFromPositionsIndices(positions, indices);
}

// -------------------- IfcShellBasedSurfaceModel --------------------

/**
 * IFC: IFCSHELLBASEDSURFACEMODEL(SbsmBoundary)
 *   SbsmBoundary → list of refs to IfcClosedShell or IfcOpenShell
 * Civil 3D's primary export representation — collection of shells.
 */
export function shellBasedSurfaceModelToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCSHELLBASEDSURFACEMODEL') return null;
  const parts = splitParams(entity.params);
  const shellRefs = parseRefList(parts[0]);
  if (shellRefs.length === 0) return null;
  const positions = [];
  const indices = [];
  for (const shellId of shellRefs) {
    appendClosedShell(entityIndex, shellId, positions, indices);
  }
  return geometryFromPositionsIndices(positions, indices);
}

// -------------------- IfcPolygonalFaceSet --------------------

/**
 * IFC: IFCPOLYGONALFACESET(Coordinates, Closed, Faces, PnIndex)
 *   Coordinates → IfcCartesianPointList3D
 *   Faces → list of IfcIndexedPolygonalFace(CoordIndex) [or WithVoids subtype]
 *   PnIndex → optional remap (ignored)
 * IfcIndexedPolygonalFace.params: ((idx1,idx2,idx3,...))  1-based STEP indices.
 */
export function polygonalFaceSetToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCPOLYGONALFACESET') return null;
  const parts = splitParams(entity.params);
  const coordRef = parseRef(parts[0]);
  if (!coordRef) return null;
  const coordEntity = entityIndex.byExpressId(coordRef);
  if (!coordEntity || coordEntity.type !== 'IFCCARTESIANPOINTLIST3D') return null;
  const coordParts = splitParams(coordEntity.params);
  const allPoints = parsePointList(coordParts[0]);

  const faceRefs = parseRefList(parts[2]);
  const positions = [];
  const indices = [];

  // Per-face colour from IfcIndexedColourMap — when present, build a vertex
  // colour buffer in parallel so the viewer can render Revit/ArchiCAD's
  // per-face palette instead of a flat material tint.
  const colourMapEntity = findIndexedColourMapForFaceSet(entityIndex, expressId);
  const colourMap = colourMapEntity ? resolveIndexedColourMap(entityIndex, colourMapEntity) : null;
  const vertexColors = colourMap ? [] : null;

  for (let f = 0; f < faceRefs.length; f++) {
    const face = entityIndex.byExpressId(faceRefs[f]);
    if (!face) continue;
    // IfcIndexedPolygonalFace:           (CoordIndex)
    // IfcIndexedPolygonalFaceWithVoids:  (CoordIndex, InnerCoordIndices)
    const faceParts = splitParams(face.params);
    const outerRaw = faceParts[0];
    if (!outerRaw) continue;
    const outerIdx = outerRaw.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => parseInt(s.trim(), 10));
    const outerPolygon = [];
    for (const i of outerIdx) {
      if (!Number.isFinite(i) || i < 1 || i > allPoints.length) continue;
      outerPolygon.push(allPoints[i - 1]);
    }

    const vertsBefore = positions.length / 3;
    if (face.type === 'IFCINDEXEDPOLYGONALFACEWITHVOIDS' && faceParts[1]) {
      // InnerCoordIndices is a list of index-lists: ((i1, i2, ...), (j1, j2, ...), ...)
      const innerRaw = faceParts[1];
      const innerLists = parseListOfNumberLists(innerRaw, parseInt);
      const holes = [];
      for (const innerIdx of innerLists) {
        const holePolygon = [];
        for (const i of innerIdx) {
          if (!Number.isFinite(i) || i < 1 || i > allPoints.length) continue;
          holePolygon.push(allPoints[i - 1]);
        }
        if (holePolygon.length >= 3) holes.push(holePolygon);
      }
      pushTriangulatedPolygonWithHoles(outerPolygon, holes, positions, indices);
    } else {
      pushTriangulatedPolygon(outerPolygon, positions, indices);
    }
    const vertsAfter = positions.length / 3;

    // Emit one RGB triple per vertex added for this face. Falls back to mid-grey
    // when the colour index is missing/out-of-range to keep buffer length consistent.
    if (vertexColors) {
      const ci = colourMap.indexPerFace[f];
      const rgb = (Number.isFinite(ci) && ci >= 1 && ci <= colourMap.palette.length)
        ? colourMap.palette[ci - 1]
        : [0.5, 0.5, 0.5];
      for (let v = vertsBefore; v < vertsAfter; v++) {
        vertexColors.push(rgb[0] || 0, rgb[1] || 0, rgb[2] || 0);
      }
    }
  }

  const geom = geometryFromPositionsIndices(positions, indices);
  if (geom && vertexColors && vertexColors.length === positions.length) {
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexColors), 3));
  }
  return geom;
}

/**
 * Parse a STEP "list of number lists" like "((1,2,3),(4,5,6))" → [[1,2,3], [4,5,6]].
 * Pass parseFloat to get [[r,g,b], ...] for IfcColourRgbList.ColourList,
 * or parseInt for IfcIndexedPolygonalFaceWithVoids.InnerCoordIndices.
 */
function parseListOfNumberLists(raw, parser = parseInt) {
  if (!raw) return [];
  const trimmed = raw.replace(/^\(/, '').replace(/\)$/, '').trim();
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        const inner = trimmed.slice(start, i);
        out.push(inner.split(',').map(s => parser(s.trim(), 10)).filter(Number.isFinite));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * Find an IfcIndexedColourMap whose MappedTo references the given tessellated
 * face set. Returns the colour-map entity or null.
 *
 * IfcIndexedColourMap(MappedTo, Opacity, Colours, ColourIndex)
 * — used by Revit/ArchiCAD to attach per-face RGB to IfcPolygonalFaceSet.
 */
function findIndexedColourMapForFaceSet(entityIndex, faceSetId) {
  const candidates = entityIndex.byType ? entityIndex.byType('IFCINDEXEDCOLOURMAP') : [];
  if (!candidates || candidates.length === 0) return null;
  for (const cm of candidates) {
    const parts = splitParams(cm.params);
    const mappedToRef = parseRef(parts[0]);
    if (mappedToRef === faceSetId) return cm;
  }
  return null;
}

/**
 * Resolve an IfcIndexedColourMap to { palette: [[r,g,b],...], indexPerFace: [1,2,1,...] }.
 * Indices are 1-based as stored in STEP. Returns null if any required field is missing.
 */
function resolveIndexedColourMap(entityIndex, colourMapEntity) {
  const parts = splitParams(colourMapEntity.params);
  const coloursRef = parseRef(parts[2]);
  const ciRaw = parts[3];
  if (!coloursRef || !ciRaw) return null;
  const coloursEntity = entityIndex.byExpressId(coloursRef);
  if (!coloursEntity || coloursEntity.type !== 'IFCCOLOURRGBLIST') return null;
  const palette = parseListOfNumberLists(splitParams(coloursEntity.params)[0], parseFloat);
  if (!palette || palette.length === 0) return null;
  const indexPerFace = ciRaw.replace(/^\(/, '').replace(/\)$/, '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
  if (indexPerFace.length === 0) return null;
  return { palette, indexPerFace };
}

// -------------------- Profile parsing (2D outline) --------------------

const CIRCLE_SEGMENTS = 32;

/**
 * Build a 2D polygon (array of [x, y]) from various IfcProfileDef subtypes.
 * Returns { outer: [[x,y]...], holes: [[[x,y]...], ...] } or null.
 */
function resolveProfilePoints(entityIndex, profileId) {
  const profile = entityIndex.byExpressId(profileId);
  if (!profile) return null;
  const parts = splitParams(profile.params);

  switch (profile.type) {
    case 'IFCRECTANGLEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, XDim, YDim)
      const xDim = parseFloatScalar(parts[3]);
      const yDim = parseFloatScalar(parts[4]);
      if (!xDim || !yDim) return null;
      const hx = xDim / 2, hy = yDim / 2;
      let outer = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      outer = apply2DProfilePosition(entityIndex, parts[2], outer);
      return { outer, holes: [] };
    }
    case 'IFCCIRCLEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Radius)
      const r = parseFloatScalar(parts[3]);
      if (!r) return null;
      const outer = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        outer.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCCIRCLEHOLLOWPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Radius, WallThickness)
      const r = parseFloatScalar(parts[3]);
      const wt = parseFloatScalar(parts[4]);
      if (!r || !wt) return null;
      const ri = r - wt;
      const outer = [], hole = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        outer.push([Math.cos(t) * r, Math.sin(t) * r]);
        // Hole goes in opposite winding so it subtracts
        hole.push([Math.cos(-t) * ri, Math.sin(-t) * ri]);
      }
      const pos = parts[2];
      return {
        outer: apply2DProfilePosition(entityIndex, pos, outer),
        holes: [apply2DProfilePosition(entityIndex, pos, hole)]
      };
    }
    case 'IFCRECTANGLEHOLLOWPROFILEDEF': {
      // (ProfileType, ProfileName, Position, XDim, YDim, WallThickness, InnerFilletRadius, OuterFilletRadius)
      const xDim = parseFloatScalar(parts[3]);
      const yDim = parseFloatScalar(parts[4]);
      const wt = parseFloatScalar(parts[5]);
      if (!xDim || !yDim || !wt) return null;
      const hx = xDim / 2, hy = yDim / 2;
      const ihx = hx - wt, ihy = hy - wt;
      const outer = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      const hole = [[-ihx, -ihy], [-ihx, ihy], [ihx, ihy], [ihx, -ihy]]; // reversed winding
      return {
        outer: apply2DProfilePosition(entityIndex, parts[2], outer),
        holes: [apply2DProfilePosition(entityIndex, parts[2], hole)]
      };
    }
    case 'IFCISHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, OverallWidth, OverallDepth, WebThickness, FlangeThickness, ...)
      const bf = parseFloatScalar(parts[3]); // flange width
      const h  = parseFloatScalar(parts[4]); // overall depth
      const tw = parseFloatScalar(parts[5]); // web thickness
      const tf = parseFloatScalar(parts[6]); // flange thickness
      if (!bf || !h || !tw || !tf) return null;
      const hx = bf / 2, hy = h / 2, hw = tw / 2;
      const yi = hy - tf;
      const outer = [
        [-hx, -hy], [hx, -hy], [hx, -yi], [hw, -yi],
        [hw,  yi], [hx,  yi], [hx,  hy], [-hx,  hy],
        [-hx, yi], [-hw, yi], [-hw, -yi], [-hx, -yi]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCLSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, Width, Thickness, ...)
      const h = parseFloatScalar(parts[3]);
      const w = parseFloatScalar(parts[4]) || h;
      const t = parseFloatScalar(parts[5]);
      if (!h || !t) return null;
      const outer = [[0, 0], [w, 0], [w, t], [t, t], [t, h], [0, h]];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCTSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, FlangeWidth, WebThickness, FlangeThickness, ...)
      const h = parseFloatScalar(parts[3]);
      const bf = parseFloatScalar(parts[4]);
      const tw = parseFloatScalar(parts[5]);
      const tf = parseFloatScalar(parts[6]);
      if (!h || !bf || !tw || !tf) return null;
      const hx = bf / 2, hw = tw / 2;
      const outer = [
        [-hx, h - tf], [-hx, h], [hx, h], [hx, h - tf],
        [hw, h - tf], [hw, 0], [-hw, 0], [-hw, h - tf]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCCSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, Width, WallThickness, ...)
      const h = parseFloatScalar(parts[3]);
      const w = parseFloatScalar(parts[4]);
      const t = parseFloatScalar(parts[5]);
      if (!h || !w || !t) return null;
      const hx = w / 2, hy = h / 2;
      const outer = [
        [-hx, -hy], [hx, -hy], [hx, -hy + t], [-hx + t, -hy + t],
        [-hx + t, hy - t], [hx, hy - t], [hx, hy], [-hx, hy]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCARBITRARYCLOSEDPROFILEDEF': {
      // (ProfileType, ProfileName, OuterCurve)
      const curveRef = parseRef(parts[2]);
      const outer = resolveCurvePoints2D(entityIndex, curveRef);
      if (!outer || outer.length < 3) return null;
      return { outer, holes: [] };
    }
    case 'IFCARBITRARYPROFILEDEFWITHVOIDS': {
      // (ProfileType, ProfileName, OuterCurve, InnerCurves)
      const curveRef = parseRef(parts[2]);
      const outer = resolveCurvePoints2D(entityIndex, curveRef);
      if (!outer || outer.length < 3) return null;
      const innerRefs = parseRefList(parts[3]);
      const holes = [];
      for (const r of innerRefs) {
        const h = resolveCurvePoints2D(entityIndex, r);
        if (h && h.length >= 3) holes.push(h);
      }
      return { outer, holes };
    }
    case 'IFCUSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, FlangeWidth, WebThickness, FlangeThickness, FilletRadius, EdgeRadius, FlangeSlope)
      const h = parseFloatScalar(parts[3]);
      const b = parseFloatScalar(parts[4]);
      const tw = parseFloatScalar(parts[5]);
      const tf = parseFloatScalar(parts[6]);
      if (!h || !b || !tw || !tf) return null;
      const hx = b / 2, hy = h / 2;
      // C/U-channel: flanges open to the right (positive X)
      const outer = [
        [-hx, -hy], [hx, -hy],
        [hx, -hy + tf], [-hx + tw, -hy + tf],
        [-hx + tw, hy - tf], [hx, hy - tf],
        [hx, hy], [-hx, hy]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCZSHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, Depth, FlangeWidth, WebThickness, FlangeThickness, FilletRadius, EdgeRadius)
      const h = parseFloatScalar(parts[3]);
      const b = parseFloatScalar(parts[4]);
      const tw = parseFloatScalar(parts[5]);
      const tf = parseFloatScalar(parts[6]);
      if (!h || !b || !tw || !tf) return null;
      const hy = h / 2, hw = tw / 2;
      // Z-profile: top flange to the right, bottom flange to the left
      const outer = [
        [-hw, -hy], [b - hw, -hy],
        [b - hw, -hy + tf], [hw, -hy + tf],
        [hw, hy], [-b + hw, hy],
        [-b + hw, hy - tf], [-hw, hy - tf]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCASYMMETRICISHAPEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, BottomFlangeWidth, OverallDepth, WebThickness, BottomFlangeThickness,
      //  BottomFlangeFilletRadius, TopFlangeWidth, TopFlangeThickness, TopFlangeFilletRadius, BottomFlangeEdgeRadius,
      //  BottomFlangeSlope, TopFlangeEdgeRadius, TopFlangeSlope, CentreOfGravityInY)
      const bb = parseFloatScalar(parts[3]); // bottom flange width
      const h  = parseFloatScalar(parts[4]); // depth
      const tw = parseFloatScalar(parts[5]); // web thickness
      const tfb = parseFloatScalar(parts[6]); // bottom flange thickness
      const bt = parseFloatScalar(parts[8]); // top flange width
      const tft = parseFloatScalar(parts[9]); // top flange thickness
      if (!bb || !h || !tw || !tfb || !bt || !tft) return null;
      const hxb = bb / 2, hxt = bt / 2, hy = h / 2, hw = tw / 2;
      const outer = [
        [-hxb, -hy], [hxb, -hy],
        [hxb, -hy + tfb], [hw, -hy + tfb],
        [hw, hy - tft], [hxt, hy - tft],
        [hxt, hy], [-hxt, hy],
        [-hxt, hy - tft], [-hw, hy - tft],
        [-hw, -hy + tfb], [-hxb, -hy + tfb]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCELLIPSEPROFILEDEF': {
      // (ProfileType, ProfileName, Position, SemiAxis1, SemiAxis2)
      const a = parseFloatScalar(parts[3]);
      const b = parseFloatScalar(parts[4]);
      if (!a || !b) return null;
      const outer = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        outer.push([Math.cos(t) * a, Math.sin(t) * b]);
      }
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    case 'IFCTRAPEZIUMPROFILEDEF': {
      // (ProfileType, ProfileName, Position, BottomXDim, TopXDim, YDim, TopXOffset)
      const bx = parseFloatScalar(parts[3]);
      const tx = parseFloatScalar(parts[4]);
      const yDim = parseFloatScalar(parts[5]);
      const offX = parseFloatScalar(parts[6]) || 0;
      if (!bx || !tx || !yDim) return null;
      const hy = yDim / 2;
      // Bottom edge centred on profile origin; top edge offset by TopXOffset.
      const outer = [
        [-bx / 2, -hy], [bx / 2, -hy],
        [offX + tx / 2, hy], [offX - tx / 2, hy]
      ];
      return { outer: apply2DProfilePosition(entityIndex, parts[2], outer), holes: [] };
    }
    default:
      return null;
  }
}

/** Apply IfcAxis2Placement2D (parts ref or '$') to a 2D polygon. */
function apply2DProfilePosition(entityIndex, posRef, polygon) {
  const ref = parseRef(posRef);
  if (!ref) return polygon;
  const pos = entityIndex.byExpressId(ref);
  if (!pos || pos.type !== 'IFCAXIS2PLACEMENT2D') return polygon;
  const posParts = splitParams(pos.params);
  const locId = parseRef(posParts[0]);
  const refDirId = parseRef(posParts[1]);
  const loc = locId ? resolveCoords(entityIndex, locId) : [0, 0];
  const refDir = refDirId ? resolveCoords(entityIndex, refDirId) : [1, 0];
  const cos = refDir[0], sin = refDir[1];
  return polygon.map(([x, y]) => [
    cos * x - sin * y + (loc[0] || 0),
    sin * x + cos * y + (loc[1] || 0)
  ]);
}

/** Resolve a 2D curve (IfcPolyline / IfcIndexedPolyCurve) to [[x,y],...]. */
function resolveCurvePoints2D(entityIndex, curveId) {
  if (!curveId) return null;
  const c = entityIndex.byExpressId(curveId);
  if (!c) return null;
  const parts = splitParams(c.params);

  if (c.type === 'IFCPOLYLINE') {
    const ptRefs = parseRefList(parts[0]);
    const out = [];
    for (const r of ptRefs) {
      const p = entityIndex.byExpressId(r);
      if (!p) continue;
      const coords = p.params.replace(/^\(+|\)+$/g, '').split(',').map(s => parseFloat(s.trim()));
      if (coords.length >= 2) out.push([coords[0], coords[1]]);
    }
    // Drop duplicated closing point if present
    if (out.length >= 2) {
      const first = out[0], last = out[out.length - 1];
      if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
    }
    return out;
  }

  if (c.type === 'IFCINDEXEDPOLYCURVE') {
    // (Points, Segments, SelfIntersect)
    const pointsRef = parseRef(parts[0]);
    if (!pointsRef) return null;
    const ptList = entityIndex.byExpressId(pointsRef);
    if (!ptList || ptList.type !== 'IFCCARTESIANPOINTLIST2D') return null;
    const all = parsePointList(splitParams(ptList.params)[0]);

    // Segments optional: if missing, use points in order
    const segRaw = parts[1];
    if (!segRaw || segRaw === '$' || segRaw === '*') {
      const out = all.map(p => [p[0], p[1]]);
      if (out.length >= 2) {
        const f = out[0], l = out[out.length - 1];
        if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
      }
      return out;
    }

    // Walk typed segments: IfcLineIndex (straight chain) + IfcArcIndex
    // (3-point arc, tessellated into ~12 sub-points for smoothness).
    const segs = parseSegmentList(segRaw);
    const out = [];
    let lastEmittedIdx = null;
    for (const seg of segs) {
      const indices = seg.indices.filter(i => i >= 1 && i <= all.length);
      if (indices.length === 0) continue;
      if (seg.type === 'arc' && indices.length === 3) {
        const p1 = all[indices[0] - 1];
        const p2 = all[indices[1] - 1];
        const p3 = all[indices[2] - 1];
        const arcPts = tessellateArc2D([p1[0], p1[1]], [p2[0], p2[1]], [p3[0], p3[1]], 12);
        for (const pt of arcPts) {
          out.push(pt);
        }
        lastEmittedIdx = indices[2];
      } else {
        // Line segment: each point in turn, skipping duplicates of last emitted
        for (const idx of indices) {
          if (idx === lastEmittedIdx) continue;
          out.push([all[idx - 1][0], all[idx - 1][1]]);
          lastEmittedIdx = idx;
        }
      }
    }
    if (out.length >= 2) {
      const f = out[0], l = out[out.length - 1];
      if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
    }
    return out;
  }

  return null;
}

// -------------------- IfcExtrudedAreaSolid --------------------

/**
 * IFC: IFCEXTRUDEDAREASOLID(SweptArea, Position, ExtrudedDirection, Depth)
 *   SweptArea → IfcProfileDef subtype (rectangle, circle, I-shape, arbitrary, ...)
 *   Position → IfcAxis2Placement3D (extrusion local frame)
 *   ExtrudedDirection → IfcDirection (extrusion vector in profile's local frame)
 *   Depth → real (extrusion length along ExtrudedDirection)
 *
 * Most common solid representation across Revit / Tekla / Civil 3D.
 */
export function extrudedAreaSolidToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCEXTRUDEDAREASOLID') return null;
  const parts = splitParams(entity.params);
  const profileId = parseRef(parts[0]);
  const positionId = parseRef(parts[1]);
  const dirId = parseRef(parts[2]);
  const depth = parseFloatScalar(parts[3]);
  if (!profileId || !depth) return null;

  const profile = resolveProfilePoints(entityIndex, profileId);
  if (!profile || profile.outer.length < 3) return null;

  // Build THREE.Shape (with optional holes) and extrude
  const shape = new THREE.Shape();
  shape.moveTo(profile.outer[0][0], profile.outer[0][1]);
  for (let i = 1; i < profile.outer.length; i++) shape.lineTo(profile.outer[i][0], profile.outer[i][1]);
  shape.closePath();
  for (const hole of profile.holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    shape.holes.push(path);
  }

  const dir = dirId ? resolveCoords(entityIndex, dirId) : [0, 0, 1];
  const dirVec = new THREE.Vector3(dir[0] || 0, dir[1] || 0, dir[2] || 0);
  if (dirVec.lengthSq() < 1e-12) dirVec.set(0, 0, 1);
  else dirVec.normalize();

  let geom;
  try {
    geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12, steps: 1 });
  } catch (e) {
    // Some profiles (self-intersecting curves, degenerate shapes) make
    // ExtrudeGeometry throw inside earcut. Skip rather than crash the load.
    return null;
  }

  // ExtrudeGeometry extrudes along +Z in shape-local coords. Rotate so that
  // the actual ExtrudedDirection becomes the extrusion axis.
  const z = new THREE.Vector3(0, 0, 1);
  if (Math.abs(z.dot(dirVec) - 1) > 1e-6) {
    const q = new THREE.Quaternion().setFromUnitVectors(z, dirVec);
    geom.applyQuaternion(q);
  }

  // Apply IfcAxis2Placement3D for the solid (Position attribute)
  if (positionId) {
    const m = placement3DToMatrix(entityIndex, positionId);
    geom.applyMatrix4(m);
  }

  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  return geom;
}

/**
 * Revolve a 2D profile around an axis to produce a solid of revolution.
 *
 * IfcRevolvedAreaSolid attributes:
 *   SweptArea — profile (we reuse resolveProfilePoints)
 *   Position — IfcAxis2Placement3D (local frame)
 *   Axis — IfcAxis1Placement (revolution axis in local frame)
 *   Angle — IfcPlaneAngleMeasure in radians (full revolution = 2π)
 *
 * Implementation note: THREE.LatheGeometry revolves a 2D contour around the Y
 * axis. We rotate the profile so the local revolution axis becomes +Y, lathe
 * it, then rotate back and apply Position.
 */
export function revolvedAreaSolidToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCREVOLVEDAREASOLID') return null;
  const parts = splitParams(entity.params);
  const profileId = parseRef(parts[0]);
  const positionId = parseRef(parts[1]);
  const axisId = parseRef(parts[2]);
  const angle = parseFloatScalar(parts[3]) || (Math.PI * 2);
  if (!profileId) return null;
  const profile = resolveProfilePoints(entityIndex, profileId);
  if (!profile || profile.outer.length < 3) return null;

  // Resolve revolution axis: IfcAxis1Placement(Location, Axis)
  let axisOrigin = [0, 0, 0];
  let axisDir = [0, 0, 1];
  if (axisId) {
    const ax = entityIndex.byExpressId(axisId);
    if (ax && ax.type === 'IFCAXIS1PLACEMENT') {
      const axParts = splitParams(ax.params);
      const locId = parseRef(axParts[0]);
      const dirId = parseRef(axParts[1]);
      if (locId) axisOrigin = resolveCoords(entityIndex, locId) || axisOrigin;
      if (dirId) axisDir = resolveCoords(entityIndex, dirId) || axisDir;
    }
  }

  // The profile lives in the local XY plane. The revolution axis (axisDir) is
  // a 3D vector in the same local frame. Approximate by treating the axis as
  // a line in the XY plane (IFC always positions the profile so the axis is
  // in-plane — most exporters use axis = [0, 1, 0] i.e. local Y).
  // We project each profile vertex onto a radius about the axis, then lathe.
  const axisVec2 = new THREE.Vector2(axisDir[0] || 0, axisDir[1] || 0);
  if (axisVec2.lengthSq() < 1e-9) axisVec2.set(0, 1);
  axisVec2.normalize();
  const originVec2 = new THREE.Vector2(axisOrigin[0] || 0, axisOrigin[1] || 0);
  // Convert profile outer to (radius, height) pairs along the axis direction.
  // radius = perpendicular distance from axis; height = projection onto axis.
  const perp = new THREE.Vector2(-axisVec2.y, axisVec2.x);
  const lathePoints = [];
  for (const [x, y] of profile.outer) {
    const p = new THREE.Vector2(x, y).sub(originVec2);
    const r = Math.abs(p.dot(perp));
    const h = p.dot(axisVec2);
    lathePoints.push(new THREE.Vector2(r, h));
  }
  // LatheGeometry wants points sorted by Y ascending; if our points aren't,
  // ExtrudeGeometry might still work but normals can flip. We sort to be safe.
  lathePoints.sort((a, b) => a.y - b.y);

  let geom;
  try {
    const segments = Math.max(8, Math.ceil((angle / (Math.PI * 2)) * 32));
    geom = new THREE.LatheGeometry(lathePoints, segments, 0, angle);
  } catch (e) {
    return null;
  }

  // LatheGeometry revolves around Y axis; we need to align local Y of the
  // lathe to the IFC axis direction. The relationship is: lathe Y matches the
  // axisVec direction in the XY plane. Build a basis where lathe Y = (axisVec2 in XY, 0 in Z).
  // For simple case where axisDir == [0,1,0] in local frame, no extra rotation needed.
  // We construct the rotation that maps Y_lathe → axisVec2 in XY plane.
  const angleZ = Math.atan2(axisVec2.x, axisVec2.y);
  if (Math.abs(angleZ) > 1e-6) {
    geom.applyMatrix4(new THREE.Matrix4().makeRotationZ(angleZ));
  }
  // Translate so the lathe origin sits at axisOrigin in local frame.
  geom.applyMatrix4(new THREE.Matrix4().makeTranslation(axisOrigin[0] || 0, axisOrigin[1] || 0, axisOrigin[2] || 0));

  if (positionId) {
    geom.applyMatrix4(placement3DToMatrix(entityIndex, positionId));
  }
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  return geom;
}

/**
 * Sweep a circular cross-section along a 3D directrix curve.
 *
 * IfcSweptDiskSolid(Directrix, Radius, InnerRadius, StartParam, EndParam)
 *   Directrix — IfcCurve subtype, here we support IfcPolyline (3D points)
 *   Radius — outer disk radius
 *   InnerRadius — optional (hollow tube)
 *
 * Used by Tekla / Revit for cables, conduits, handrails, pipework. We build a
 * THREE.TubeGeometry over the directrix points.
 */
export function sweptDiskSolidToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCSWEPTDISKSOLID') return null;
  const parts = splitParams(entity.params);
  const directrixId = parseRef(parts[0]);
  const radius = parseFloatScalar(parts[1]);
  if (!directrixId || !radius || radius <= 0) return null;

  const directrix = entityIndex.byExpressId(directrixId);
  if (!directrix) return null;
  // Only IfcPolyline supported for now (most common in Tekla cable trays).
  // IfcCompositeCurve / IfcTrimmedCurve fall through and return null.
  const points3D = [];
  if (directrix.type === 'IFCPOLYLINE') {
    const pParts = splitParams(directrix.params);
    const ptRefs = parseRefList(pParts[0]);
    for (const r of ptRefs) {
      const c = resolveCoords(entityIndex, r);
      if (c && c.length >= 3) points3D.push(new THREE.Vector3(c[0], c[1], c[2]));
      else if (c && c.length === 2) points3D.push(new THREE.Vector3(c[0], c[1], 0));
    }
  } else if (directrix.type === 'IFCINDEXEDPOLYCURVE') {
    // 3D variant: IfcCartesianPointList3D referenced from IfcIndexedPolyCurve
    const dParts = splitParams(directrix.params);
    const ptListRef = parseRef(dParts[0]);
    if (ptListRef) {
      const ptList = entityIndex.byExpressId(ptListRef);
      if (ptList && (ptList.type === 'IFCCARTESIANPOINTLIST3D' || ptList.type === 'IFCCARTESIANPOINTLIST2D')) {
        const all = parsePointList(splitParams(ptList.params)[0]);
        for (const p of all) {
          points3D.push(new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0));
        }
      }
    }
  } else {
    return null;
  }
  if (points3D.length < 2) return null;

  // Subtract directrix centroid in double precision before TubeGeometry
  // converts to Float32 internally. Civil 3D alignments / Tekla long cable
  // trays often have IfcPolyline points at absolute world coords; without
  // this step TubeGeometry would snap each tube cross-section onto a coarse
  // Float32 grid and the pipe surface would look faceted / jagged.
  let cx = 0, cy = 0, cz = 0;
  for (const p of points3D) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= points3D.length; cy /= points3D.length; cz /= points3D.length;
  for (const p of points3D) { p.x -= cx; p.y -= cy; p.z -= cz; }

  let geom;
  try {
    const curve = new THREE.CatmullRomCurve3(points3D, false, 'catmullrom', 0.0);
    const tubularSegments = Math.max(points3D.length * 4, 16);
    geom = new THREE.TubeGeometry(curve, tubularSegments, radius, 16, false);
  } catch (e) {
    return null;
  }
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  geom.userData = geom.userData || {};
  geom.userData.localOrigin = [cx, cy, cz];
  return geom;
}

/**
 * 2D-pattern CSG for IfcBooleanResult(.DIFFERENCE., Extruded, Extruded).
 *
 * Covers the dominant Tekla pattern: a plate (rectangle extrusion) minus a
 * bolt-hole (circle extrusion) along the same axis. When both operands extrude
 * along their local Z and second's local Z maps to first's local Z in world
 * space, we can transform second's profile into first's profile coordinate
 * frame, add it as a hole, and re-extrude. The result is a single ExtrudeGeometry
 * with a real opening — no shader-level discard, no external CSG library.
 *
 * Returns BufferGeometry (in the parent product's local frame, like
 * extrudedAreaSolidToGeometry) or null when the pattern doesn't fit.
 */
export function tryExtrudedDifference2D(entityIndex, firstId, secondId) {
  const e1 = entityIndex.byExpressId(firstId);
  const e2 = entityIndex.byExpressId(secondId);
  if (!e1 || !e2) return null;
  if (e1.type !== 'IFCEXTRUDEDAREASOLID' || e2.type !== 'IFCEXTRUDEDAREASOLID') return null;

  const p1 = splitParams(e1.params);
  const p2 = splitParams(e2.params);
  const profile1Id = parseRef(p1[0]);
  const profile2Id = parseRef(p2[0]);
  const pos1Id = parseRef(p1[1]);
  const pos2Id = parseRef(p2[1]);
  const dir1Id = parseRef(p1[2]);
  const dir2Id = parseRef(p2[2]);
  const depth1 = parseFloatScalar(p1[3]);
  if (!profile1Id || !profile2Id || !depth1) return null;

  const profile1 = resolveProfilePoints(entityIndex, profile1Id);
  const profile2 = resolveProfilePoints(entityIndex, profile2Id);
  if (!profile1 || !profile2 || profile1.outer.length < 3 || profile2.outer.length < 3) return null;

  // Direction vectors are in each solid's LOCAL frame; default = +Z.
  const dir1 = dir1Id ? resolveCoords(entityIndex, dir1Id) : [0, 0, 1];
  const dir2 = dir2Id ? resolveCoords(entityIndex, dir2Id) : [0, 0, 1];
  const d1 = new THREE.Vector3(dir1[0] || 0, dir1[1] || 0, dir1[2] || 0);
  const d2 = new THREE.Vector3(dir2[0] || 0, dir2[1] || 0, dir2[2] || 0);
  if (d1.lengthSq() < 1e-12) d1.set(0, 0, 1); else d1.normalize();
  if (d2.lengthSq() < 1e-12) d2.set(0, 0, 1); else d2.normalize();

  // Compute relative matrix: takes points from second's local frame into first's local frame.
  // Identity if either has no position attribute.
  const m1 = pos1Id ? placement3DToMatrix(entityIndex, pos1Id) : new THREE.Matrix4();
  const m2 = pos2Id ? placement3DToMatrix(entityIndex, pos2Id) : new THREE.Matrix4();
  const m1inv = new THREE.Matrix4().copy(m1).invert();
  const rel = new THREE.Matrix4().multiplyMatrices(m1inv, m2);

  // The 2D-Boolean shortcut only works if second's extrusion axis (in first's
  // local frame, after applying `rel`) is the same as first's extrusion axis.
  const d2InFirstFrame = d2.clone().transformDirection(rel);
  if (d2InFirstFrame.dot(d1) < 0.9999) return null;

  // Translation + rotation in the plane perpendicular to d1. For d1 = +Z this
  // reduces to (tx, ty) translation and a rotation by (cosA, sinA) around Z.
  // We only support that common case; non-Z extrusion axes fall back.
  if (Math.abs(d1.z - 1) > 1e-3) return null;

  const tx = rel.elements[12];
  const ty = rel.elements[13];
  const cosA = rel.elements[0];
  const sinA = rel.elements[1];

  // Transform second.outer into first's profile frame, then REVERSE the
  // winding so it acts as a hole inside the THREE.Shape.
  const holePoints = profile2.outer.map(([x, y]) => [
    cosA * x - sinA * y + tx,
    sinA * x + cosA * y + ty
  ]).reverse();

  // Build the augmented THREE.Shape: outer from first, holes = first's existing + new.
  const shape = new THREE.Shape();
  shape.moveTo(profile1.outer[0][0], profile1.outer[0][1]);
  for (let i = 1; i < profile1.outer.length; i++) shape.lineTo(profile1.outer[i][0], profile1.outer[i][1]);
  shape.closePath();
  const allHoles = [...profile1.holes, holePoints];
  for (const hole of allHoles) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    shape.holes.push(path);
  }

  let geom;
  try {
    geom = new THREE.ExtrudeGeometry(shape, { depth: depth1, bevelEnabled: false, curveSegments: 12, steps: 1 });
  } catch (e) {
    return null;
  }

  // ExtrudeGeometry extrudes along +Z in shape-local coords; d1 is also +Z so no rotation needed.
  if (pos1Id) {
    geom.applyMatrix4(m1);
  }
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  return geom;
}

/** Local copy of placement3DToMatrix (avoids cyclical import with placement.js). */
function placement3DToMatrix(entityIndex, placementId) {
  const e = entityIndex.byExpressId(placementId);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return new THREE.Matrix4();
  const parts = splitParams(e.params);
  const locId = parseRef(parts[0]);
  const axisId = parseRef(parts[1]);
  const refDirId = parseRef(parts[2]);
  const location = locId ? resolveCoords(entityIndex, locId) : [0, 0, 0];
  const axisVec = axisId ? resolveCoords(entityIndex, axisId) : [0, 0, 1];
  const refDirVec = refDirId ? resolveCoords(entityIndex, refDirId) : [1, 0, 0];
  const z = new THREE.Vector3(axisVec[0], axisVec[1], axisVec[2]).normalize();
  const xRef = new THREE.Vector3(refDirVec[0], refDirVec[1], refDirVec[2]);
  const x = xRef.clone().sub(z.clone().multiplyScalar(z.dot(xRef))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(location[0] || 0, location[1] || 0, location[2] || 0);
  return m;
}

// -------------------- IfcMappedItem helpers (used by geometry-core dispatcher) --------------------

/**
 * Resolve the combined transform for an IFCMAPPEDITEM:
 *   M = (MappingTarget) × inverse(MappingOrigin)
 * Returns { matrix, innerItemRefs } so the caller can recurse into the mapped
 * representation's items.
 */
export function resolveMappedItem(entityIndex, expressId) {
  const item = entityIndex.byExpressId(expressId);
  if (!item || item.type !== 'IFCMAPPEDITEM') return null;
  const parts = splitParams(item.params);
  const sourceRef = parseRef(parts[0]);
  const targetRef = parseRef(parts[1]);
  if (!sourceRef) return null;
  const source = entityIndex.byExpressId(sourceRef);
  if (!source || source.type !== 'IFCREPRESENTATIONMAP') return null;
  const sParts = splitParams(source.params);
  const originId = parseRef(sParts[0]);
  const repId = parseRef(sParts[1]);
  if (!repId) return null;

  const origin = originId ? placement3DToMatrix(entityIndex, originId) : new THREE.Matrix4();
  const target = targetRef ? resolveCartesianTransform(entityIndex, targetRef) : new THREE.Matrix4();

  // Map matrix: target × inverse(origin)
  const matrix = target.clone().multiply(origin.clone().invert());

  const rep = entityIndex.byExpressId(repId);
  if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') return null;
  const repParts = splitParams(rep.params);
  const innerItemRefs = parseRefList(repParts[3]);
  return { matrix, innerItemRefs };
}

/** IfcCartesianTransformationOperator3D → THREE.Matrix4. */
function resolveCartesianTransform(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e) return new THREE.Matrix4();
  // 3D and 3DnonUniform share leading params: (Axis1, Axis2, LocalOrigin, Scale, Axis3)
  const parts = splitParams(e.params);
  const xRefId = parseRef(parts[0]);
  const yRefId = parseRef(parts[1]);
  const originId = parseRef(parts[2]);
  const scale = parseFloatScalar(parts[3]);
  const zRefId = parseRef(parts[4]);
  const origin = originId ? resolveCoords(entityIndex, originId) : [0, 0, 0];
  const xRef = xRefId ? resolveCoords(entityIndex, xRefId) : [1, 0, 0];
  const yRef = yRefId ? resolveCoords(entityIndex, yRefId) : [0, 1, 0];
  const zRef = zRefId ? resolveCoords(entityIndex, zRefId) : null;

  const x = new THREE.Vector3(xRef[0] || 1, xRef[1] || 0, xRef[2] || 0).normalize();
  const y = new THREE.Vector3(yRef[0] || 0, yRef[1] || 1, yRef[2] || 0).normalize();
  let z;
  if (zRef) z = new THREE.Vector3(zRef[0] || 0, zRef[1] || 0, zRef[2] || 1).normalize();
  else z = new THREE.Vector3().crossVectors(x, y).normalize();

  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const m = new THREE.Matrix4().makeBasis(
    x.multiplyScalar(s),
    y.multiplyScalar(s),
    z.multiplyScalar(s)
  );
  m.setPosition(origin[0] || 0, origin[1] || 0, origin[2] || 0);
  return m;
}
