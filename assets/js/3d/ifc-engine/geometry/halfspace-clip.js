// IfcBooleanClippingResult / IfcBooleanResult (.DIFFERENCE.) with an
// IfcHalfSpaceSolid / IfcPolygonalBoundedHalfSpace second operand.
//
// Revit/Tekla/ArchiCAD clip walls, roofs, beams and columns by planes this
// way (roof-cut walls, mitred beam ends). The first operand is an arbitrary
// leaf solid; the second is an infinite half-space bounded by an IfcPlane.
// The result is computed exactly on the triangle mesh of the first operand:
// every triangle is clipped against the plane, the removed side is dropped,
// and the cut loop(s) are capped with earcut (holes supported, e.g. a hollow
// tube cut by a plane gives an annulus cap).
//
// IFC4 semantics (ISO 16739, IfcHalfSpaceSolid.AgreementFlag):
//   TRUE  — the BaseSurface normal points AWAY from the material of the half
//           space, i.e. the half-space material is the side opposite the normal.
//   FALSE — the normal points INTO the material.
// DIFFERENCE removes the half-space material, so for TRUE the kept side is the
// positive side of the plane normal, for FALSE the negative side.
//
// IfcPolygonalBoundedHalfSpace additionally restricts the half space to an
// infinite prism: PolygonalBoundary (closed 2D polyline in Position's XY)
// extruded along Position's Z. That case is handled exactly only when it is
// safe to do so with plane clips alone (first operand entirely inside or
// entirely outside the prism, or convex polygon); otherwise null is returned
// and the caller keeps its existing fallback.
//
// Float32: positions are read from the leaf BufferGeometry (Float32 relative
// to userData.localOrigin) and clipped in doubles; the plane is moved into
// that local frame first, so georeferenced (S-JTSK) solids do not lose
// precision. The returned geometry carries its own userData.localOrigin.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef } from './step-helpers.js';
import { placement3DToMatrix } from './placement.js';
import {
  tryExtrudedDifference2D,
  mergeVerticesInPlace,
  computeCreasedVertexNormals,
} from './mesh-types.js';

const BOOLEAN_TYPES = new Set(['IFCBOOLEANRESULT', 'IFCBOOLEANCLIPPINGRESULT']);
const HALFSPACE_TYPES = new Set(['IFCHALFSPACESOLID', 'IFCPOLYGONALBOUNDEDHALFSPACE']);
const MAX_CHAIN_DEPTH = 16;

/**
 * Evaluate `first − second` where `second` is an IfcHalfSpaceSolid or an
 * IfcPolygonalBoundedHalfSpace. Both operands are expressed in the boolean
 * result's object coordinate system (same frame as the leaf geometry).
 *
 * Chained clips (Revit roofs: CLIP(CLIP(Extruded, Half), Half)) are followed
 * recursively through the FirstOperand; a nested boolean that is not a
 * half-space clip is handed to tryExtrudedDifference2D, otherwise null.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} firstOperandId
 * @param {number} secondOperandId
 * @param {(entityIndex, id: number) => THREE.BufferGeometry | null} buildLeafGeometry
 * @returns {THREE.BufferGeometry | null} null = unsupported → caller falls back
 */
export function tryHalfSpaceDifference(entityIndex, firstOperandId, secondOperandId, buildLeafGeometry, depth = 0) {
  if (depth > MAX_CHAIN_DEPTH) return null;
  const second = entityIndex.byExpressId(secondOperandId);
  if (!second || !HALFSPACE_TYPES.has(second.type)) return null;

  const halfSpace = resolveHalfSpace(entityIndex, second);
  if (!halfSpace) return null;

  const base = resolveFirstOperand(entityIndex, firstOperandId, buildLeafGeometry, depth);
  if (!base) return null;

  const mesh = meshFromGeometry(base);
  if (!mesh) return null;

  let result;
  if (!halfSpace.boundary) {
    result = clipMeshByPlane(mesh, halfSpace.keepPlane);
  } else {
    result = clipMeshByBoundedHalfSpace(mesh, halfSpace);
  }
  if (!result) return null;
  return geometryFromMesh(result);
}

// -------------------- operands --------------------

function resolveFirstOperand(entityIndex, id, buildLeafGeometry, depth) {
  const e = entityIndex.byExpressId(id);
  if (!e) return null;
  if (!BOOLEAN_TYPES.has(e.type)) return buildLeafGeometry(entityIndex, id);
  const parts = splitParams(e.params);
  const operator = (parts[0] || '').trim();
  const firstId = parseRef(parts[1]);
  const secondId = parseRef(parts[2]);
  if (operator !== '.DIFFERENCE.' || !firstId || !secondId) return null;
  const nested = tryHalfSpaceDifference(entityIndex, firstId, secondId, buildLeafGeometry, depth + 1);
  if (nested) return nested;
  return tryExtrudedDifference2D(entityIndex, firstId, secondId);
}

/**
 * @returns {{ keepPlane: {n: THREE.Vector3, o: THREE.Vector3}, boundary: null | {matrix, polygon: number[][]} } | null}
 * keepPlane: points with (p − o)·n > 0 are kept (material NOT removed).
 */
function resolveHalfSpace(entityIndex, entity) {
  const parts = splitParams(entity.params);
  const surfaceId = parseRef(parts[0]);
  const agreement = (parts[1] || '').trim();
  if (!surfaceId || (agreement !== '.T.' && agreement !== '.F.')) return null;
  const surface = entityIndex.byExpressId(surfaceId);
  if (!surface || surface.type !== 'IFCPLANE') return null;
  const posId = parseRef(splitParams(surface.params)[0]);
  if (!posId) return null;
  const m = placement3DToMatrix(entityIndex, posId);
  const o = new THREE.Vector3().setFromMatrixPosition(m);
  const n = new THREE.Vector3(m.elements[8], m.elements[9], m.elements[10]);
  if (!isFiniteVec(o) || !isFiniteVec(n) || n.lengthSq() < 1e-20) return null;
  n.normalize();
  // AgreementFlag TRUE: material on the side opposite the normal → keep the
  // normal side. FALSE: material on the normal side → keep the opposite side.
  if (agreement === '.F.') n.negate();
  const keepPlane = { n, o };

  if (entity.type === 'IFCHALFSPACESOLID') return { keepPlane, boundary: null };

  // IFCPOLYGONALBOUNDEDHALFSPACE(BaseSurface, AgreementFlag, Position, PolygonalBoundary)
  const positionId = parseRef(parts[2]);
  const boundaryId = parseRef(parts[3]);
  if (!positionId || !boundaryId) return null;
  const polygon = resolveBoundaryPolygon(entityIndex, boundaryId);
  if (!polygon) return null;
  const matrix = placement3DToMatrix(entityIndex, positionId);
  return { keepPlane, boundary: { matrix, polygon } };
}

/** Closed IfcPolyline / IfcIndexedPolyCurve (segment-free) → 2D points, CCW, no duplicates. */
function resolveBoundaryPolygon(entityIndex, curveId) {
  const curve = entityIndex.byExpressId(curveId);
  if (!curve) return null;
  let pts = null;
  if (curve.type === 'IFCPOLYLINE') {
    const refs = splitParams(curve.params)[0];
    pts = [];
    for (const ref of refs.replace(/^\(/, '').replace(/\)$/, '').split(',')) {
      const id = parseRef(ref.trim());
      const p = id ? entityIndex.byExpressId(id) : null;
      if (!p || p.type !== 'IFCCARTESIANPOINT') return null;
      const c = p.params.replace(/^\(+|\)+$/g, '').split(',').map(s => parseFloat(s.trim()));
      if (c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
      pts.push([c[0], c[1]]);
    }
  } else if (curve.type === 'IFCINDEXEDPOLYCURVE') {
    const cp = splitParams(curve.params);
    const segments = (cp[1] || '$').trim();
    if (segments !== '$' && segments !== '*') return null; // arcs → unsupported
    const listId = parseRef(cp[0]);
    const list = listId ? entityIndex.byExpressId(listId) : null;
    if (!list || list.type !== 'IFCCARTESIANPOINTLIST2D') return null;
    const inner = splitParams(list.params)[0];
    const matches = inner.match(/\(([^()]+)\)/g);
    if (!matches) return null;
    pts = matches.map(mm => mm.slice(1, -1).split(',').map(s => parseFloat(s.trim())));
    if (pts.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  } else {
    return null;
  }
  // Drop closing duplicate and consecutive duplicates.
  const clean = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
    clean.push(p);
  }
  if (clean.length > 1) {
    const a = clean[0], b = clean[clean.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) clean.pop();
  }
  if (clean.length < 3) return null;
  let area = 0;
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i], b = clean[(i + 1) % clean.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-18) return null;
  if (area < 0) clean.reverse();
  return clean;
}

function isFiniteVec(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// -------------------- mesh model (doubles, local frame) --------------------

/**
 * @typedef {{ positions: number[], indices: number[], origin: number[] }} Mesh
 * positions are doubles relative to `origin` (object frame = position + origin).
 */

/**
 * Read a BufferGeometry into a positionally welded double-precision mesh.
 * Leaf geometries come out of computeCreasedVertexNormals with vertices
 * duplicated along crease edges; the cut-loop search needs true shared
 * edges, so exact-position duplicates are merged back into one index.
 */
function meshFromGeometry(geom) {
  const posAttr = geom.getAttribute('position');
  if (!posAttr || posAttr.count < 3) return null;
  const src = posAttr.array;
  const remap = new Int32Array(posAttr.count);
  const byPosition = new Map();
  const positions = [];
  for (let i = 0; i < posAttr.count; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const key = `${x},${y},${z}`;
    let id = byPosition.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      byPosition.set(key, id);
      positions.push(x, y, z);
    }
    remap[i] = id;
  }
  const srcIdx = geom.index ? geom.index.array : null;
  const triCount = srcIdx ? Math.floor(srcIdx.length / 3) : Math.floor(posAttr.count / 3);
  const indices = [];
  for (let t = 0; t < triCount; t++) {
    const a = remap[srcIdx ? srcIdx[t * 3] : t * 3];
    const b = remap[srcIdx ? srcIdx[t * 3 + 1] : t * 3 + 1];
    const c = remap[srcIdx ? srcIdx[t * 3 + 2] : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  if (indices.length < 3) return null;
  const lo = geom.userData?.localOrigin;
  const origin = lo && lo.length === 3 ? [lo[0], lo[1], lo[2]] : [0, 0, 0];
  return { positions, indices, origin };
}

function meshDiagonal(mesh) {
  const p = mesh.positions;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1];
    if (p[i + 2] < minZ) minZ = p[i + 2]; if (p[i + 2] > maxZ) maxZ = p[i + 2];
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/** Plane (object frame) → signed-distance function on mesh-local positions. */
function localPlane(mesh, plane) {
  const n = plane.n;
  const ox = plane.o.x - mesh.origin[0];
  const oy = plane.o.y - mesh.origin[1];
  const oz = plane.o.z - mesh.origin[2];
  const d = -(n.x * ox + n.y * oy + n.z * oz);
  return { nx: n.x, ny: n.y, nz: n.z, d };
}

// -------------------- plane clip --------------------

/**
 * Clip a triangle mesh, keeping the positive side of `plane` and capping the
 * cut. Returns a new Mesh, or null when the clip cannot be done reliably
 * (nothing kept is a valid, empty result → returns an empty mesh).
 */
function clipMeshByPlane(mesh, plane) {
  const P = localPlane(mesh, plane);
  const diag = meshDiagonal(mesh);
  if (diag <= 0) return null;
  const eps = diag * 1e-6;

  const pos = mesh.positions;
  const nVerts = pos.length / 3;
  const dist = new Float64Array(nVerts);
  let anyNeg = false, anyPos = false;
  for (let i = 0; i < nVerts; i++) {
    const dv = P.nx * pos[i * 3] + P.ny * pos[i * 3 + 1] + P.nz * pos[i * 3 + 2] + P.d;
    dist[i] = Math.abs(dv) <= eps ? 0 : dv;
    if (dist[i] < 0) anyNeg = true; else if (dist[i] > 0) anyPos = true;
  }
  // Entirely on the kept side (or lying in the plane) → unchanged.
  if (!anyNeg) return { positions: pos.slice(), indices: mesh.indices.slice(), origin: mesh.origin.slice() };
  // Entirely removed.
  if (!anyPos) return { positions: [], indices: [], origin: mesh.origin.slice() };

  const outPos = pos.slice();
  const outIdx = [];
  const edgeCut = new Map(); // "a:b" (a<b) → new vertex index on the plane
  const onPlane = new Set(); // vertex indices with dist == 0 (original + cut)
  for (let i = 0; i < nVerts; i++) if (dist[i] === 0) onPlane.add(i);

  const cutVertex = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    let v = edgeCut.get(key);
    if (v !== undefined) return v;
    const da = dist[a], db = dist[b];
    const t = da / (da - db);
    v = outPos.length / 3;
    for (let k = 0; k < 3; k++) outPos.push(pos[a * 3 + k] + t * (pos[b * 3 + k] - pos[a * 3 + k]));
    edgeCut.set(key, v);
    onPlane.add(v);
    return v;
  };

  const idx = mesh.indices;
  const poly = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const d0 = dist[tri[0]], d1 = dist[tri[1]], d2 = dist[tri[2]];
    if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
      if (d0 === 0 && d1 === 0 && d2 === 0) continue; // coplanar with the cut: cap rebuilds it
      outIdx.push(tri[0], tri[1], tri[2]);
      continue;
    }
    if (d0 <= 0 && d1 <= 0 && d2 <= 0) continue;
    // Sutherland–Hodgman against the half-plane dist >= 0.
    poly.length = 0;
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const da = dist[a], db = dist[b];
      if (da >= 0) poly.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) poly.push(cutVertex(a, b));
    }
    if (poly.length === 3) outIdx.push(poly[0], poly[1], poly[2]);
    else if (poly.length === 4) outIdx.push(poly[0], poly[1], poly[2], poly[0], poly[2], poly[3]);
  }

  const result = { positions: outPos, indices: outIdx, origin: mesh.origin.slice() };
  dropDegenerateTriangles(result, diag);

  // Cap: boundary edges of the kept mesh whose endpoints both lie in the plane.
  const loops = cutLoops(result, onPlane);
  if (loops === null) return null;
  if (loops.length) {
    const ok = appendCaps(result, loops, [-P.nx, -P.ny, -P.nz], diag);
    if (!ok) return null;
  }
  return result;
}

function dropDegenerateTriangles(mesh, diag) {
  const p = mesh.positions, idx = mesh.indices;
  const minArea2 = (diag * 1e-9) ** 2; // squared doubled-area threshold
  const kept = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    if (idx[t] === idx[t + 1] || idx[t + 1] === idx[t + 2] || idx[t] === idx[t + 2]) continue;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz <= minArea2) continue;
    kept.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  mesh.indices = kept;
}

/**
 * Boundary edges (no opposite twin) of the kept mesh with both endpoints on
 * the cut plane, linked into closed loops. Returns [] when there is no cut,
 * null when the boundary is not a set of simple closed loops.
 */
function cutLoops(mesh, onPlane) {
  const idx = mesh.indices;
  const directed = new Set();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) directed.add(`${idx[t + k]}:${idx[t + (k + 1) % 3]}`);
  }
  // Undirected adjacency of boundary edges lying in the plane. Boundary edges
  // of the open mesh run "a→b" with no "b→a" twin; a twin pair cancels.
  const adjacency = new Map();
  const seenUndirected = new Set();
  for (const key of directed) {
    const [a, b] = key.split(':').map(Number);
    if (!onPlane.has(a) || !onPlane.has(b)) continue;
    if (directed.has(`${b}:${a}`)) continue;
    const ukey = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seenUndirected.has(ukey)) continue;
    seenUndirected.add(ukey);
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  if (adjacency.size === 0) return [];
  for (const nbrs of adjacency.values()) if (nbrs.length !== 2) return null;

  const loops = [];
  const visited = new Set();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const loop = [start];
    visited.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const [n0, n1] = adjacency.get(cur);
      const next = n0 !== prev ? n0 : n1;
      if (next === start) break;
      if (visited.has(next)) return null; // figure-eight / pinch
      visited.add(next);
      loop.push(next);
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/**
 * Triangulate the cut loops in the plane with outward normal `normal`
 * (pointing to the removed side) and append the cap triangles.
 */
function appendCaps(mesh, loops, normal, diag) {
  const p = mesh.positions;
  const z = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const ref = Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(ref, z).normalize(); // u × v = z
  const v = new THREE.Vector3().crossVectors(z, u);

  const project = (i) => new THREE.Vector2(
    u.x * p[i * 3] + u.y * p[i * 3 + 1] + u.z * p[i * 3 + 2],
    v.x * p[i * 3] + v.y * p[i * 3 + 1] + v.z * p[i * 3 + 2]);

  // Orient every loop CCW in (u,v) (= normal along z), then nest by containment.
  const flat = loops.map(loop => {
    const pts2 = loop.map(project);
    if (THREE.ShapeUtils.isClockWise(pts2)) { loop.reverse(); pts2.reverse(); }
    return { ids: loop, pts: pts2, area: Math.abs(THREE.ShapeUtils.area(pts2)) };
  });
  const minArea = (diag * 1e-9) ** 2;
  const live = flat.filter(l => l.area > minArea);
  // Containment depth: number of other loops that contain this loop's first point.
  for (const l of live) {
    l.depth = 0;
    for (const other of live) {
      if (other === l || other.area <= l.area) continue;
      if (pointInPolygon(l.pts[0], other.pts)) l.depth += 1;
    }
  }
  // Triangle clipping puts a cut vertex on every crossed edge, including the
  // diagonals of quads, so the loops carry runs of collinear points. Earcut's
  // hole bridging trips over those (missing cap triangles), so each loop is
  // simplified before triangulation and the collinear points are re-inserted
  // afterwards by fanning the affected cap triangles from their centroid.
  const outers = live.filter(l => l.depth % 2 === 0);
  const capStart = mesh.indices.length;
  for (const outer of outers) {
    const holes = live.filter(h => h.depth === outer.depth + 1 && pointInPolygon(h.pts[0], outer.pts));
    const between = new Map(); // "min:max" → { from, mids } for simplified loop edges
    const outerS = simplifyLoop(outer, between);
    if (!outerS) return false;
    const holesS = [];
    for (const h of holes) {
      const s = simplifyLoop({ ids: [...h.ids].reverse(), pts: [...h.pts].reverse() }, between); // earcut wants CW holes
      if (!s) return false;
      holesS.push(s);
    }
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(outerS.pts, holesS.map(h => h.pts));
    } catch (e) {
      return false;
    }
    if (!tris || tris.length === 0) return false;
    const ids = [...outerS.ids];
    for (const h of holesS) ids.push(...h.ids);
    for (const t of tris) {
      const a = ids[t[0]], b = ids[t[1]], c = ids[t[2]];
      if (a === undefined || b === undefined || c === undefined) return false;
      pushCapTriangle(mesh, a, b, c, between);
    }
  }
  // Every cut-loop edge must be used exactly once by the cap; otherwise the
  // triangulation went wrong and the caller is better off with its fallback.
  const capEdges = new Map();
  for (let i = capStart; i + 2 < mesh.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[i + k], b = mesh.indices[i + (k + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      capEdges.set(key, (capEdges.get(key) || 0) + 1);
    }
  }
  for (const l of live) {
    for (let i = 0; i < l.ids.length; i++) {
      const a = l.ids[i], b = l.ids[(i + 1) % l.ids.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (capEdges.get(key) !== 1) return false;
    }
  }
  dropDegenerateTriangles(mesh, diag);
  return true;
}

/** Drop collinear run points from a loop; record them per surviving edge. */
function simplifyLoop(loop, between) {
  const { ids, pts } = loop;
  const n = ids.length;
  const keep = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], q = pts[i], r = pts[(i + 1) % n];
    const ux = q.x - p.x, uy = q.y - p.y, vx = r.x - q.x, vy = r.y - q.y;
    const cross = ux * vy - uy * vx;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const collinear = Math.abs(cross) <= 1e-9 * lu * lv && (ux * vx + uy * vy) > 0;
    if (!collinear) keep.push(i);
  }
  if (keep.length < 3) return null;
  for (let k = 0; k < keep.length; k++) {
    const i0 = keep[k], i1 = keep[(k + 1) % keep.length];
    const mids = [];
    for (let i = (i0 + 1) % n; i !== i1; i = (i + 1) % n) mids.push(ids[i]);
    if (mids.length === 0) continue;
    const a = ids[i0], b = ids[i1];
    between.set(a < b ? `${a}:${b}` : `${b}:${a}`, { from: a, mids });
  }
  return { ids: keep.map(i => ids[i]), pts: keep.map(i => pts[i]) };
}

/** Append cap triangle (a,b,c), re-inserting collinear loop points on its edges. */
function pushCapTriangle(mesh, a, b, c, between) {
  const corners = [a, b, c];
  let poly = null;
  for (let k = 0; k < 3; k++) {
    const x = corners[k], y = corners[(k + 1) % 3];
    const entry = between.get(x < y ? `${x}:${y}` : `${y}:${x}`);
    if (!entry) continue;
    if (!poly) poly = [[a], [b], [c]];
    poly[k].push(...(entry.from === x ? entry.mids : [...entry.mids].reverse()));
  }
  if (!poly) {
    mesh.indices.push(a, b, c);
    return;
  }
  const ring = poly.flat();
  const p = mesh.positions;
  let cx = 0, cy = 0, cz = 0;
  for (const i of ring) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
  const centre = p.length / 3;
  p.push(cx / ring.length, cy / ring.length, cz / ring.length);
  for (let i = 0; i < ring.length; i++) mesh.indices.push(centre, ring[i], ring[(i + 1) % ring.length]);
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// -------------------- polygonal bounded half space --------------------

/**
 * first − (H ∩ Prism). Exact decomposition into plane clips:
 *   first − (H ∩ P) = (first − H) ∪ (first ∩ H ∩ ¬P)
 * and, for a convex prism with side half-spaces S1..Sk (inside = ∩ Si),
 *   ¬P = ¬S1 ∪ (S1 ∩ ¬S2) ∪ (S1 ∩ S2 ∩ ¬S3) ∪ ... (disjoint pieces).
 * Each piece is a chain of capped plane clips. Pieces share internal faces
 * with opposite orientation, so signed volume stays exact.
 */
function clipMeshByBoundedHalfSpace(mesh, halfSpace) {
  const { keepPlane, boundary } = halfSpace;
  const sides = prismSidePlanes(boundary); // keep-INSIDE planes, object frame
  if (!sides) return null;

  const diag = meshDiagonal(mesh);
  if (diag <= 0) return null;
  const eps = diag * 1e-6;

  // Trivial cases from the mesh's position relative to the prism.
  const classify = (plane) => {
    const P = localPlane(mesh, plane);
    let neg = false, pos = false;
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      const dv = P.nx * p[i] + P.ny * p[i + 1] + P.nz * p[i + 2] + P.d;
      if (dv < -eps) neg = true; else if (dv > eps) pos = true;
      if (neg && pos) break;
    }
    return neg ? (pos ? 'split' : 'outside') : 'inside';
  };
  const classes = sides.map(classify);
  if (classes.some(c => c === 'outside')) {
    // Whole solid outside the prism → nothing is removed.
    return { positions: mesh.positions.slice(), indices: mesh.indices.slice(), origin: mesh.origin.slice() };
  }
  if (classes.every(c => c === 'inside')) return clipMeshByPlane(mesh, keepPlane);

  // General convex case: (first − H) + Σ pieces of (first ∩ H ∩ ¬P).
  const parts = [];
  const outsideH = clipMeshByPlane(mesh, keepPlane);
  if (!outsideH) return null;
  parts.push(outsideH);
  let insideH = clipMeshByPlane(mesh, negate(keepPlane));
  if (!insideH) return null;
  let remaining = insideH; // first ∩ H ∩ S1 ∩ ... ∩ S(i-1)
  for (let i = 0; i < sides.length; i++) {
    if (remaining.indices.length === 0) break;
    const piece = clipMeshByPlane(remaining, negate(sides[i]));
    if (!piece) return null;
    parts.push(piece);
    remaining = clipMeshByPlane(remaining, sides[i]);
    if (!remaining) return null;
  }
  const merged = { positions: [], indices: [], origin: mesh.origin.slice() };
  for (const part of parts) {
    const base = merged.positions.length / 3;
    merged.positions.push(...part.positions);
    for (const i of part.indices) merged.indices.push(base + i);
  }
  return merged;
}

function negate(plane) {
  return { n: plane.n.clone().negate(), o: plane.o };
}

/** Side planes of the prism (normal pointing INSIDE), null if polygon is not convex. */
function prismSidePlanes(boundary) {
  const { matrix, polygon } = boundary;
  const n = polygon.length;
  // Convexity: all consecutive cross products ≥ 0 (polygon is CCW).
  let scale = 0;
  for (const p of polygon) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]));
  const tol = -(scale * scale) * 1e-9;
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n], c = polygon[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross < tol) return null;
  }
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const planes = [];
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-12) continue;
    // CCW polygon: inside is to the left of the edge → inward normal (−ey, ex).
    const nLocal = new THREE.Vector3(-ey / len, ex / len, 0);
    const nObj = nLocal.applyMatrix3(normalMatrix).normalize();
    const oObj = new THREE.Vector3(a[0], a[1], 0).applyMatrix4(matrix);
    if (!isFiniteVec(nObj) || !isFiniteVec(oObj)) return null;
    planes.push({ n: nObj, o: oObj });
  }
  return planes.length >= 3 ? planes : null;
}

// -------------------- output --------------------

function geometryFromMesh(mesh) {
  const { positions, indices } = mesh;
  if (indices.length < 3) return null;
  // Re-centre in doubles so the Float32 buffer stays small around the kept part.
  const n = positions.length / 3;
  let cx = 0, cy = 0, cz = 0;
  const used = new Uint8Array(n);
  let count = 0;
  for (const i of indices) {
    if (used[i]) continue;
    used[i] = 1; count++;
    cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
  }
  if (count === 0) return null;
  cx /= count; cy /= count; cz /= count;
  const float32 = new Float32Array(positions.length);
  for (let i = 0; i < n; i++) {
    float32[i * 3] = positions[i * 3] - cx;
    float32[i * 3 + 1] = positions[i * 3 + 1] - cy;
    float32[i * 3 + 2] = positions[i * 3 + 2] - cz;
  }
  for (let i = 0; i < float32.length; i++) if (!Number.isFinite(float32[i])) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(float32, 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.userData = { localOrigin: [mesh.origin[0] + cx, mesh.origin[1] + cy, mesh.origin[2] + cz] };
  mergeVerticesInPlace(geom, 1e-4);
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  if (!geom.index || geom.index.count < 3) return null;
  return geom;
}
