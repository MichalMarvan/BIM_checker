// IfcBooleanResult (.DIFFERENCE.) with an IfcExtrudedAreaSolid second operand
// that does NOT share the first operand's extrusion axis.
//
// Corpus (RuzLet, Tekla IFC2X3): U-profile beams notched by a prism extruded
// perpendicular to the beam axis, plates with a notched (non-convex) cutter
// extruded in the opposite direction, and chains DIFF(DIFF(DIFF(beam, cut),
// cut), cut). tryExtrudedDifference2D only handles the coplanar/parallel
// pattern and tryHalfSpaceDifference only half spaces — everything else fell
// back to the FirstOperand-only approximation.
//
// Method. The cutter is a straight extrusion of a simple polygon, i.e. the
// union of convex prisms C_k (one prism for a convex profile, one per earcut
// triangle otherwise), each the intersection of half spaces H (two caps along
// the extrusion plus one per polygon edge). With U = ∪ C_k:
//   ∂(first − U) = (∂first ∩ ¬U)  ∪  ∪_k reversed(∂C_k ∩ first ∩ ¬(∪_{j≠k} C_j))
// - ∂first ∩ ¬U: every triangle of `first` minus each prism in turn. A convex
//   polygon minus a convex polytope is a sequence of plane clips (outside H_1;
//   inside H_1 ∧ outside H_2; ...) giving convex pieces — no caps needed.
// - ∂C_k ∩ first: the cut faces of prism k. They are exactly the cap faces of
//   the core first ∩ C_k, a chain of capped plane clips — the existing exact
//   IfcHalfSpaceSolid path in halfspace-clip.js, driven through a virtual
//   overlay of the EntityIndex (synthesised IFCPLANE / IFCHALFSPACESOLID and a
//   virtual leaf per intermediate mesh). The core's triangles lying in a
//   cutting plane are collected, trimmed by the other prisms (which removes
//   the faces shared between adjacent prisms) and flipped.
// - A face of `first` lying in a cutting plane is decided by its normal: with
//   the material outside the prism it is untouched; with the material inside,
//   it is cut away and its region is also removed from the rebuilt cap.
// Pieces meet with matching geometry but not matching topology, so edges
// lying in cutting planes are split at vertices lying on them (T-junction
// repair). The result is a clean closed surface, so chained booleans can feed
// into each other. No new dependency, no duplicated clipping/capping code.
//
// Returns null (caller keeps its fallback) for: profiles with voids, arcs in
// the boundary, non-extruded second operands, a first operand that the
// half-space clipper cannot cap, an empty result, or a kept coplanar face
// (material outside the prism) over which the clipper still rebuilt a cap.
//
// Precision: intermediate cores pass through Float32 BufferGeometry (the
// tryHalfSpaceDifference contract). The first operand is re-centred at the
// cutter and pre-snapped onto the planes, and the seam tolerance covers the
// Float32 rounding of the intermediate cores (see the tolerance notes in
// tryBooleanDifference), so skin and cut faces weld into one closed surface.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef } from './step-helpers.js';
import { placement3DToMatrix } from './placement.js';
import { tryHalfSpaceDifference } from './halfspace-clip.js';
import {
  tryExtrudedDifference2D,
  mergeVerticesInPlace,
  computeCreasedVertexNormals,
} from './mesh-types.js';

const BOOLEAN_TYPES = new Set(['IFCBOOLEANRESULT', 'IFCBOOLEANCLIPPINGRESULT']);
const MAX_CHAIN_DEPTH = 16;
const CIRCLE_SEGMENTS = 32;
// Virtual entity ids live far above any real STEP id (parseRef accepts any \d+).
const VIRTUAL_BASE = 2 ** 40;

/**
 * Evaluate `first − second` where `second` is an IfcExtrudedAreaSolid with a
 * simple (void-free, arc-free) profile, in any position relative to `first`.
 * Contract identical to tryHalfSpaceDifference: operands are in the boolean
 * result's object frame, the result carries userData.localOrigin, null =
 * unsupported.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} firstOperandId
 * @param {number} secondOperandId
 * @param {(entityIndex, id: number) => THREE.BufferGeometry | null} buildLeafGeometry
 * @returns {THREE.BufferGeometry | null}
 */
export function tryBooleanDifference(entityIndex, firstOperandId, secondOperandId, buildLeafGeometry, depth = 0) {
  if (depth > MAX_CHAIN_DEPTH) {
    return null;
  }
  const prisms = resolveCutterPrisms(entityIndex, secondOperandId);
  if (!prisms) {
    return null;
  }

  const original = resolveFirstOperand(entityIndex, firstOperandId, buildLeafGeometry, depth);
  if (!original) {
    return null;
  }
  const originalMesh = readMesh(original);
  if (!originalMesh) {
    return null;
  }

  // Tolerances. The cores clip with their own diagonal-relative epsilon
  // (1e-6·diag of the mesh at each step: the whole first operand at first,
  // the cutter's extent at the end) and pass through Float32 between steps
  // (rounding up to ~2.4e-7·diag of the intermediate core). The skin must
  // agree with them on what lies in a plane, and the seams must absorb that
  // rounding, so:
  //   epsSnap — vertices of `first` within the largest core epsilon of a plane
  //             are projected onto it exactly (in doubles) up front;
  //   eps     — everything else (skin clipping, cap detection, T-junction
  //             repair, welding) tolerates the intermediate Float32 noise.
  // The first operand is also re-centred at the cutter so Float32 precision
  // is best where the cut happens.
  const { origin, diag } = cutterFrame(prisms);
  const originalDiag = meshDiagonal(originalMesh);
  const eps = Math.max(diag * 1e-6, originalDiag * 2.4e-7);
  const epsSnap = Math.max(eps, originalDiag * 1e-6);
  if (!(eps > 0)) {
    return null;
  }
  const base = snapToPlanes(originalMesh, prisms, origin, epsSnap);
  if (!base) {
    return null;
  }
  const baseMesh = readMesh(base);
  if (!baseMesh) {
    return null;
  }
  // Planes that remove most of the first operand go first, so the cores get
  // small (and their epsilon consistent with ours) as early as possible.
  for (const planes of prisms) {
    sortByRemoval(planes, baseMesh, eps);
  }

  // Cores: first ∩ C_k as chains of plane clips, each keeping the inward side.
  const v = virtualOverlay(entityIndex);
  const leafBuilder = (ix, id) => v.leaves.get(id) || buildLeafGeometry(ix, id);
  const active = []; // prisms that intersect `first`
  for (const planes of prisms) {
    let core = base;
    const cutting = []; // indices of planes that actually split the core
    let disjoint = false;
    for (let i = 0; i < planes.length; i++) {
      const coreMesh = readMesh(core);
      if (!coreMesh) {
        return null;
      }
      const c = classify(coreMesh, planes[i].n, planes[i].o, eps);
      if (c === 'neg') { // first entirely outside this prism
        disjoint = true;
        break;
      }
      if (c === 'pos') { // first entirely inside this half space
        continue;
      }
      // AgreementFlag .T.: material opposite the normal is removed → keeps the inward side.
      const half = v.add('IFCHALFSPACESOLID', `#${v.plane(planes[i].o, planes[i].n)},.T.`);
      core = tryHalfSpaceDifference(v.index, v.leaf(core), half, leafBuilder);
      if (!core) {
        return null;
      }
      cutting.push(i);
    }
    if (disjoint) {
      continue;
    }
    if (cutting.length === 0) { // first ⊂ C_k → empty result (caller falls back)
      return null;
    }
    const coreMesh = readMesh(core);
    if (!coreMesh) {
      return null;
    }
    active.push({
      planes: planes.map(p => localPlane(p, origin)),
      cutting,
      coreMesh,
      coplanar: new Map(), // plane index → coplanar faces of `first` with material inside
      keptCoplanar: new Map(), // plane index → coplanar faces kept (material outside)
    });
  }
  if (active.length === 0) {
    return original;
  }

  const positions = [];
  const indices = [];
  if (!clipSkin(baseMesh, active, eps, positions, indices)) {
    return null;
  }
  for (let k = 0; k < active.length; k++) {
    if (!collectCutFaces(active, k, origin, eps, positions, indices)) {
      return null;
    }
  }

  const cuttingPlanes = active.flatMap(a => a.cutting.map(i => a.planes[i]));
  const repaired = repairTJunctions(positions, dropSlivers(positions, indices, eps), cuttingPlanes, eps);
  return buildGeometry(positions, dropSlivers(positions, repaired, eps), origin, eps);
}

// -------------------- operands --------------------

function resolveFirstOperand(entityIndex, id, buildLeafGeometry, depth) {
  const e = entityIndex.byExpressId(id);
  if (!e) {
    return null;
  }
  if (!BOOLEAN_TYPES.has(e.type)) {
    return buildLeafGeometry(entityIndex, id);
  }
  const parts = splitParams(e.params);
  const operator = (parts[0] || '').trim();
  const firstId = parseRef(parts[1]);
  const secondId = parseRef(parts[2]);
  if (operator !== '.DIFFERENCE.' || !firstId || !secondId) {
    return null;
  }
  return tryExtrudedDifference2D(entityIndex, firstId, secondId)
    || tryHalfSpaceDifference(entityIndex, firstId, secondId, buildLeafGeometry)
    || tryBooleanDifference(entityIndex, firstId, secondId, buildLeafGeometry, depth + 1);
}

/**
 * IfcExtrudedAreaSolid with a simple profile → convex prisms, each as bounding
 * planes with INWARD normals (object frame): two caps + one per polygon edge.
 * @returns {Array<Array<{n: THREE.Vector3, o: THREE.Vector3}>> | null}
 */
function resolveCutterPrisms(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e || e.type !== 'IFCEXTRUDEDAREASOLID') {
    return null;
  }
  const parts = splitParams(e.params);
  const profileId = parseRef(parts[0]);
  const positionId = parseRef(parts[1]);
  const dirId = parseRef(parts[2]);
  const depth = parseFloat(parts[3]);
  if (!profileId || !Number.isFinite(depth) || depth <= 0) {
    return null;
  }

  const profile = resolveProfilePolygon(entityIndex, profileId);
  if (!profile) {
    return null;
  }

  const m = positionId ? placement3DToMatrix(entityIndex, positionId) : new THREE.Matrix4();
  const dirRaw = dirId ? resolveVec(entityIndex, dirId) : [0, 0, 1];
  const d = new THREE.Vector3(dirRaw[0] || 0, dirRaw[1] || 0, dirRaw[2] || 0);
  if (d.lengthSq() < 1e-20) {
    return null;
  }
  d.normalize();
  if (Math.abs(d.z) < 1e-6) {
    return null;
  } // extrusion parallel to the profile plane → degenerate

  // Prism frame: Z along the extrusion, polygon = profile projected along d
  // onto the plane through the local origin perpendicular to d (the side
  // faces of a sheared prism are parallel to d, so this is its exact shadow).
  const zp = d.clone();
  const xRef = Math.abs(zp.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const xp = xRef.sub(zp.clone().multiplyScalar(zp.dot(xRef))).normalize();
  const yp = new THREE.Vector3().crossVectors(zp, xp);
  const polygon = profile.map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0);
    return [p.dot(xp), p.dot(yp)];
  });
  const convexPieces = decomposeConvex(polygon);
  if (!convexPieces) {
    return null;
  }
  const frame = m.clone().multiply(new THREE.Matrix4().makeBasis(xp, yp, zp));
  const frameNormal = new THREE.Matrix3().getNormalMatrix(frame);

  const capNormal = new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize();
  const zTop = depth * d.z; // signed local z of the top cap
  const loPoint = new THREE.Vector3(0, 0, Math.min(0, zTop)).applyMatrix4(m);
  const hiPoint = new THREE.Vector3(0, 0, Math.max(0, zTop)).applyMatrix4(m);
  if (!isFiniteVec(capNormal) || !isFiniteVec(loPoint) || !isFiniteVec(hiPoint)) {
    return null;
  }

  const prisms = [];
  for (const piece of convexPieces) {
    // Caps first: for the common "cutter passes right through" case they leave
    // the core untouched and the chain stays short.
    const planes = [{ n: capNormal, o: loPoint }, { n: capNormal.clone().negate(), o: hiPoint }];
    const n = piece.length;
    for (let i = 0; i < n; i++) {
      const a = piece[i], b = piece[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const len = Math.hypot(ex, ey);
      if (len < 1e-12) {
        continue;
      }
      const nObj = new THREE.Vector3(-ey / len, ex / len, 0).applyMatrix3(frameNormal).normalize();
      const oObj = new THREE.Vector3(a[0], a[1], 0).applyMatrix4(frame);
      if (!isFiniteVec(nObj) || !isFiniteVec(oObj)) {
        return null;
      }
      planes.push({ n: nObj, o: oObj });
    }
    if (planes.length < 5) {
      return null;
    }
    prisms.push(planes);
  }
  return prisms;
}

/** Simple polygon → CCW convex pieces: itself when convex, else its earcut triangles. */
function decomposeConvex(polygon) {
  const n = polygon.length;
  if (n < 3) {
    return null;
  }
  let area = 0, scale = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
    scale = Math.max(scale, Math.abs(a[0]), Math.abs(a[1]));
  }
  if (Math.abs(area) < 1e-18) {
    return null;
  }
  const ccw = area < 0 ? [...polygon].reverse() : polygon;
  const tol = -(scale * scale) * 1e-9;
  let convex = true;
  for (let i = 0; i < n && convex; i++) {
    const a = ccw[i], b = ccw[(i + 1) % n], c = ccw[(i + 2) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < tol) {
      convex = false;
    }
  }
  if (convex) {
    return [ccw];
  }
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(ccw.map(([x, y]) => new THREE.Vector2(x, y)), []);
  } catch {
    return null;
  }
  if (!tris || tris.length === 0) {
    return null;
  }
  const pieces = [];
  for (const t of tris) {
    const tri = t.map(i => ccw[i]);
    const a = tri[0], b = tri[1], c = tri[2];
    const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(twice) <= scale * scale * 1e-12) {
      continue;
    } // degenerate earcut triangle
    pieces.push(twice < 0 ? [a, c, b] : tri);
  }
  return pieces.length ? pieces : null;
}

/** Profile → 2D outer polygon (profile Position applied), or null for voids / unsupported. */
function resolveProfilePolygon(entityIndex, profileId) {
  const profile = entityIndex.byExpressId(profileId);
  if (!profile) {
    return null;
  }
  const parts = splitParams(profile.params);
  let pts = null;
  switch (profile.type) {
    case 'IFCRECTANGLEPROFILEDEF': {
      const hx = parseFloat(parts[3]) / 2, hy = parseFloat(parts[4]) / 2;
      if (!(hx > 0) || !(hy > 0)) {
        return null;
      }
      pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      break;
    }
    case 'IFCCIRCLEPROFILEDEF': {
      const r = parseFloat(parts[3]);
      if (!(r > 0)) {
        return null;
      }
      pts = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        pts.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      break;
    }
    case 'IFCARBITRARYCLOSEDPROFILEDEF': {
      const curveId = parseRef(parts[2]);
      pts = curveId ? resolveClosedPolyline(entityIndex, curveId) : null;
      break;
    }
    default:
      return null;
  }
  if (!pts) {
    return null;
  }
  pts = apply2DPosition(entityIndex, parts[2], pts);
  // Drop duplicate / closing points.
  const clean = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return null;
    }
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) {
      continue;
    }
    clean.push(p);
  }
  if (clean.length > 1) {
    const a = clean[0], b = clean[clean.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) {
      clean.pop();
    }
  }
  return clean.length >= 3 ? clean : null;
}

function resolveClosedPolyline(entityIndex, curveId) {
  const curve = entityIndex.byExpressId(curveId);
  if (!curve) {
    return null;
  }
  if (curve.type === 'IFCPOLYLINE') {
    const pts = [];
    for (const ref of splitParams(curve.params)[0].replace(/^\(/, '').replace(/\)$/, '').split(',')) {
      const id = parseRef(ref.trim());
      const p = id ? entityIndex.byExpressId(id) : null;
      if (!p || p.type !== 'IFCCARTESIANPOINT') {
        return null;
      }
      const c = resolveVec(entityIndex, id);
      if (c.length < 2) {
        return null;
      }
      pts.push([c[0], c[1]]);
    }
    return pts;
  }
  if (curve.type === 'IFCINDEXEDPOLYCURVE') {
    const cp = splitParams(curve.params);
    const segments = (cp[1] || '$').trim();
    if (segments !== '$' && segments !== '*') {
      return null;
    } // arcs → unsupported
    const listId = parseRef(cp[0]);
    const list = listId ? entityIndex.byExpressId(listId) : null;
    if (!list || list.type !== 'IFCCARTESIANPOINTLIST2D') {
      return null;
    }
    const matches = splitParams(list.params)[0].match(/\(([^()]+)\)/g);
    if (!matches) {
      return null;
    }
    return matches.map(mm => mm.slice(1, -1).split(',').map(s => parseFloat(s.trim())));
  }
  return null;
}

function apply2DPosition(entityIndex, posRef, polygon) {
  const ref = parseRef(posRef);
  const pos = ref ? entityIndex.byExpressId(ref) : null;
  if (!pos || pos.type !== 'IFCAXIS2PLACEMENT2D') {
    return polygon;
  }
  const pp = splitParams(pos.params);
  const locId = parseRef(pp[0]);
  const refDirId = parseRef(pp[1]);
  const loc = locId ? resolveVec(entityIndex, locId) : [0, 0];
  const refDir = refDirId ? resolveVec(entityIndex, refDirId) : [1, 0];
  const len = Math.hypot(refDir[0] || 0, refDir[1] || 0) || 1;
  const cos = (refDir[0] || 0) / len, sin = (refDir[1] || 0) / len;
  return polygon.map(([x, y]) => [cos * x - sin * y + (loc[0] || 0), sin * x + cos * y + (loc[1] || 0)]);
}

function resolveVec(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e) {
    return [];
  }
  return e.params.replace(/^\(+|\)+$/g, '').split(',').map(s => parseFloat(s.trim()));
}

function isFiniteVec(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// -------------------- virtual entity overlay --------------------

/**
 * EntityIndex view that answers synthesised ids from a local map and
 * everything else from the real index. tryHalfSpaceDifference and
 * placement3DToMatrix only call byExpressId.
 */
function virtualOverlay(entityIndex) {
  const entities = new Map();
  const leaves = new Map();
  let next = VIRTUAL_BASE;
  const index = Object.create(entityIndex);
  index.byExpressId = (id) => entities.get(id) || entityIndex.byExpressId(id);
  const add = (type, params) => {
    const id = next++;
    entities.set(id, { expressId: id, type, params, line: -1 });
    return id;
  };
  const num = (x) => (Number.isInteger(x) ? `${x}.` : `${x}`);
  const point = (p) => add('IFCCARTESIANPOINT', `(${num(p.x)},${num(p.y)},${num(p.z)})`);
  const direction = (d) => add('IFCDIRECTION', `(${num(d.x)},${num(d.y)},${num(d.z)})`);
  return {
    index, leaves, add,
    /** Register an intermediate BufferGeometry as a virtual leaf entity. */
    leaf(geom) {
      const id = add('IFCVIRTUALLEAF', '');
      leaves.set(id, geom);
      return id;
    },
    /** IFCPLANE through `o` with normal `n`. */
    plane(o, n) {
      const placement = add('IFCAXIS2PLACEMENT3D', `#${point(o)},#${direction(n)},$`);
      return add('IFCPLANE', `#${placement}`);
    },
  };
}

// -------------------- mesh helpers (doubles, object frame via origin) --------------------

function readMesh(geom) {
  const posAttr = geom.getAttribute('position');
  if (!posAttr || posAttr.count < 3) {
    return null;
  }
  const lo = geom.userData?.localOrigin;
  const origin = lo && lo.length === 3 ? [lo[0], lo[1], lo[2]] : [0, 0, 0];
  const positions = posAttr.array;
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) {
      return null;
    }
  }
  const indices = geom.index ? geom.index.array : null;
  return { positions, indices, origin, count: posAttr.count };
}

function meshDiagonal(mesh) {
  const p = mesh.positions;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < minX) {
      minX = p[i];
    } if (p[i] > maxX) {
      maxX = p[i];
    }
    if (p[i + 1] < minY) {
      minY = p[i + 1];
    } if (p[i + 1] > maxY) {
      maxY = p[i + 1];
    }
    if (p[i + 2] < minZ) {
      minZ = p[i + 2];
    } if (p[i + 2] > maxZ) {
      maxZ = p[i + 2];
    }
  }
  return Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) : 0;
}

function triangleAt(mesh, t) {
  const idx = mesh.indices, p = mesh.positions;
  return [0, 1, 2].map(k => {
    const i = (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
    return [p[i], p[i + 1], p[i + 2]];
  });
}

function triangleCount(mesh) {
  return mesh.indices ? Math.floor(mesh.indices.length / 3) : Math.floor(mesh.count / 3);
}

/** 'pos' = all vertices on the normal side of the plane, 'neg' = all on the other, 'split' otherwise. */
function classify(mesh, n, o, eps) {
  const ox = o.x - mesh.origin[0], oy = o.y - mesh.origin[1], oz = o.z - mesh.origin[2];
  const d = -(n.x * ox + n.y * oy + n.z * oz);
  const p = mesh.positions;
  let neg = false, pos = false;
  for (let i = 0; i < p.length; i += 3) {
    const dv = n.x * p[i] + n.y * p[i + 1] + n.z * p[i + 2] + d;
    if (dv < -eps) {
      neg = true;
    } else if (dv > eps) {
      pos = true;
    }
    if (neg && pos) {
      return 'split';
    }
  }
  return neg ? 'neg' : 'pos';
}

/** Centre and size of the cutter from its plane points (object frame). */
function cutterFrame(prisms) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let sx = 0, sy = 0, sz = 0, count = 0;
  for (const planes of prisms) {
    for (const { o } of planes) {
      sx += o.x; sy += o.y; sz += o.z; count++;
      min[0] = Math.min(min[0], o.x); max[0] = Math.max(max[0], o.x);
      min[1] = Math.min(min[1], o.y); max[1] = Math.max(max[1], o.y);
      min[2] = Math.min(min[2], o.z); max[2] = Math.max(max[2], o.z);
    }
  }
  return {
    origin: [sx / count, sy / count, sz / count],
    diag: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
  };
}

/**
 * Copy of `mesh` re-centred at `origin` with every vertex within eps of a
 * cutter plane projected onto that plane (in doubles). Same index buffer.
 */
function snapToPlanes(mesh, prisms, origin, eps) {
  const planes = prisms.flat().map(p => localPlane(p, origin));
  const src = mesh.positions;
  const n = mesh.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = src[i * 3] + mesh.origin[0] - origin[0];
    let y = src[i * 3 + 1] + mesh.origin[1] - origin[1];
    let z = src[i * 3 + 2] + mesh.origin[2] - origin[2];
    for (let pass = 0; pass < 2; pass++) {
      for (const P of planes) {
        const dv = P.nx * x + P.ny * y + P.nz * z + P.d;
        if (Math.abs(dv) <= eps) {
          x -= dv * P.nx; y -= dv * P.ny; z -= dv * P.nz;
        }
      }
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (mesh.indices) {
    geom.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.indices), 1));
  }
  geom.userData = { localOrigin: [origin[0], origin[1], origin[2]] };
  return geom;
}

/** Order planes (in place) by how many vertices of `mesh` lie on their removed side, most first. */
function sortByRemoval(planes, mesh, eps) {
  const p = mesh.positions;
  const removed = planes.map(plane => {
    const P = localPlane(plane, mesh.origin);
    let count = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (P.nx * p[i] + P.ny * p[i + 1] + P.nz * p[i + 2] + P.d < -eps) {
        count++;
      }
    }
    return count;
  });
  const order = planes.map((_, i) => i).sort((a, b) => removed[b] - removed[a] || a - b);
  const sorted = order.map(i => planes[i]);
  for (let i = 0; i < planes.length; i++) {
    planes[i] = sorted[i];
  }
}

/** Plane (object frame) → { nx, ny, nz, d } on positions relative to `origin`. */
function localPlane(plane, origin) {
  const n = plane.n;
  const d = -(n.x * (plane.o.x - origin[0]) + n.y * (plane.o.y - origin[1]) + n.z * (plane.o.z - origin[2]));
  return { nx: n.x, ny: n.y, nz: n.z, d };
}

function planeDistance(P, pt, eps) {
  const dv = P.nx * pt[0] + P.ny * pt[1] + P.nz * pt[2] + P.d;
  return Math.abs(dv) <= eps ? 0 : dv;
}

function polygonNormal(poly) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

// -------------------- polygon minus convex polytope --------------------

/**
 * Convex polygon minus the intersection of `planes` (inward normals) as
 * convex pieces: piece_i = poly ∩ ¬H_i, poly ← poly ∩ H_i. Distances within
 * eps snap to 0 and count as inside, matching clipMeshByPlane.
 * `onCoplanar(planeIndex, poly)` decides a polygon lying in a plane:
 * 'outside' keeps it whole, 'inside' continues with the next plane, null aborts.
 * @returns {number[][][] | null} the outside pieces
 */
function subtractConvex(poly, planes, eps, onCoplanar) {
  const pieces = [];
  for (let pi = 0; pi < planes.length; pi++) {
    const P = planes[pi];
    const ds = poly.map(pt => planeDistance(P, pt, eps));
    if (ds.every(d => d === 0)) {
      const verdict = onCoplanar ? onCoplanar(pi, poly) : 'inside';
      if (verdict === null) {
        return null;
      }
      if (verdict === 'outside') {
        pieces.push(poly); return pieces;
      }
      continue;
    }
    if (ds.every(d => d >= 0)) {
      continue;
    } // entirely inside this half space
    if (ds.every(d => d <= 0)) {
      pieces.push(poly); return pieces;
    } // entirely outside → piece, done
    const outside = [], inside = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const da = ds[k], db = ds[(k + 1) % poly.length];
      if (da >= 0) {
        inside.push(a);
      }
      if (da <= 0) {
        outside.push(a);
      }
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const s = da / (da - db);
        const c = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])];
        inside.push(c); outside.push(c);
      }
    }
    if (outside.length >= 3) {
      pieces.push(outside);
    }
    poly = inside;
    if (poly.length < 3) {
      return pieces;
    }
  }
  return pieces; // remainder lies inside the polytope → removed
}

function emitPolygon(poly, outPos, outIdx, flip = false) {
  if (poly.length < 3) {
    return;
  }
  const base = outPos.length / 3;
  for (const pt of poly) {
    outPos.push(pt[0], pt[1], pt[2]);
  }
  for (let i = 1; i + 1 < poly.length; i++) {
    if (flip) {
      outIdx.push(base, base + i + 1, base + i);
    } else {
      outIdx.push(base, base + i, base + i + 1);
    }
  }
}

/**
 * ∂first minus every active prism, triangle by triangle. A triangle lying in
 * a cutting plane is kept when the material of `first` is outside the prism
 * (normal pointing inward), otherwise it is cut and remembered so the prism's
 * rebuilt cap can be trimmed by it. Returns false when that face's material
 * is outside the prism although `first` also crosses the plane: the cap
 * rebuilt by the clipper then covers it and the caller must fall back.
 */
function clipSkin(mesh, active, eps, outPos, outIdx) {
  const count = triangleCount(mesh);
  for (let t = 0; t < count; t++) {
    const tri = triangleAt(mesh, t);
    const normal = polygonNormal(tri);
    let polys = [tri];
    for (const prism of active) {
      const next = [];
      for (const poly of polys) {
        const pieces = subtractConvex(poly, prism.planes, eps, (pi, p) => {
          const P = prism.planes[pi];
          const dot = normal[0] * P.nx + normal[1] * P.ny + normal[2] * P.nz;
          if (!prism.cutting.includes(pi)) {
            return dot > 0 ? 'outside' : 'inside';
          }
          const record = dot > 0 ? prism.keptCoplanar : prism.coplanar;
          if (!record.has(pi)) {
            record.set(pi, []);
          }
          record.get(pi).push(p);
          return dot > 0 ? 'outside' : 'inside'; // material outside / inside the half space
        });
        if (!pieces) {
          return false;
        }
        next.push(...pieces);
      }
      polys = next;
      if (polys.length === 0) {
        break;
      }
    }
    for (const poly of polys) {
      emitPolygon(poly, outPos, outIdx);
    }
  }
  return true;
}

/** Cut faces of prism k: its core's cap triangles, trimmed by the other prisms and by coplanar faces, flipped. */
function collectCutFaces(active, k, outOrigin, eps, outPos, outIdx) {
  const prism = active[k];
  const mesh = prism.coreMesh;
  const shift = [mesh.origin[0] - outOrigin[0], mesh.origin[1] - outOrigin[1], mesh.origin[2] - outOrigin[2]];
  const coreEps = Math.max(eps, meshDiagonal(mesh) * 1e-6);
  // Plane local to outOrigin → local to the core's origin: p_out = p_core + shift.
  const corePlanes = prism.cutting.map(i => {
    const P = prism.planes[i];
    return { nx: P.nx, ny: P.ny, nz: P.nz, d: P.d + P.nx * shift[0] + P.ny * shift[1] + P.nz * shift[2] };
  });
  const count = triangleCount(mesh);
  for (let t = 0; t < count; t++) {
    const tri = triangleAt(mesh, t);
    let planeIndex = -1;
    for (let c = 0; c < corePlanes.length; c++) {
      if (tri.every(pt => planeDistance(corePlanes[c], pt, coreEps) === 0)) {
        planeIndex = prism.cutting[c]; break;
      }
    }
    if (planeIndex < 0) {
      continue;
    }
    const cap = tri.map(pt => [pt[0] + shift[0], pt[1] + shift[1], pt[2] + shift[2]]);
    // A cap rebuilt over a kept coplanar face (pocket floor flush with the
    // cutter) would double that face with the opposite orientation.
    for (const face of prism.keptCoplanar.get(planeIndex) || []) {
      const cx = (cap[0][0] + cap[1][0] + cap[2][0]) / 3, cy = (cap[0][1] + cap[1][1] + cap[2][1]) / 3, cz = (cap[0][2] + cap[1][2] + cap[2][2]) / 3;
      if (facePrism(face, prism.planes[planeIndex]).every(E => planeDistance(E, [cx, cy, cz], eps) >= 0)) {
        return false;
      }
    }
    let polys = [cap];
    // Faces shared with another prism lie on its boundary and count as inside it.
    for (let j = 0; j < active.length && polys.length; j++) {
      if (j === k) {
        continue;
      }
      const next = [];
      for (const poly of polys) {
        next.push(...(subtractConvex(poly, active[j].planes, eps) || []));
      }
      polys = next;
    }
    // Regions where `first` had a coplanar face with its material inside: no cut face there.
    for (const face of prism.coplanar.get(planeIndex) || []) {
      if (!polys.length) {
        break;
      }
      const edges = facePrism(face, prism.planes[planeIndex]);
      const next = [];
      for (const poly of polys) {
        next.push(...(subtractConvex(poly, edges, eps) || []));
      }
      polys = next;
    }
    for (const poly of polys) {
      emitPolygon(poly, outPos, outIdx, true);
    }
  }
  return true;
}

/** In-plane half spaces (inward normals) bounding a convex coplanar face, as planes ⊥ P. */
function facePrism(face, P) {
  const planes = [];
  const n = face.length;
  for (let i = 0; i < n; i++) {
    const a = face[i], b = face[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    // inward = P.n × edge, checked against a third vertex
    let nx = P.ny * ez - P.nz * ey, ny = P.nz * ex - P.nx * ez, nz = P.nx * ey - P.ny * ex;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-300) {
      continue;
    }
    nx /= len; ny /= len; nz /= len;
    const c = face[(i + 2) % n];
    if (nx * (c[0] - a[0]) + ny * (c[1] - a[1]) + nz * (c[2] - a[2]) < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }
    planes.push({ nx, ny, nz, d: -(nx * a[0] + ny * a[1] + nz * a[2]) });
  }
  return planes;
}

// -------------------- topology clean-up --------------------

/**
 * Skin pieces and cap faces meet along the cutting planes with matching
 * geometry but not matching topology: a later plane splits an earlier piece's
 * edge, and a cap loop carries the crossings of the core's own triangle
 * diagonals. Every output edge lying in a cutting plane is therefore split at
 * the vertices (of that plane) lying strictly inside it, and the affected
 * triangles are re-fanned from their centroid. Only vertices and edges on the
 * cutting planes take part, so the search stays small.
 */
function repairTJunctions(positions, indices, planes, eps) {
  const nVerts = positions.length / 3;
  const dist = (P, i) => P.nx * positions[i * 3] + P.ny * positions[i * 3 + 1] + P.nz * positions[i * 3 + 2] + P.d;
  // Per plane: unique positions on it (duplicates from separate pieces collapse by key).
  const perPlane = planes.map(() => ({ ids: [], seen: new Set() }));
  const onPlane = new Array(nVerts);
  for (let i = 0; i < nVerts; i++) {
    let mask = 0;
    for (let k = 0; k < planes.length; k++) {
      if (Math.abs(dist(planes[k], i)) > eps) {
        continue;
      }
      mask |= 1 << k;
      const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
      if (!perPlane[k].seen.has(key)) {
        perPlane[k].seen.add(key); perPlane[k].ids.push(i);
      }
    }
    onPlane[i] = mask;
  }
  const midsOf = (a, b) => {
    const mask = onPlane[a] & onPlane[b];
    if (!mask) {
      return null;
    }
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const ex = positions[b * 3] - ax, ey = positions[b * 3 + 1] - ay, ez = positions[b * 3 + 2] - az;
    const len2 = ex * ex + ey * ey + ez * ez;
    if (len2 <= eps * eps) {
      return null;
    }
    const found = [];
    for (let k = 0; k < planes.length; k++) {
      if (!(mask & (1 << k))) {
        continue;
      }
      for (const v of perPlane[k].ids) {
        if (v === a || v === b) {
          continue;
        }
        const vx = positions[v * 3] - ax, vy = positions[v * 3 + 1] - ay, vz = positions[v * 3 + 2] - az;
        const s = (vx * ex + vy * ey + vz * ez) / len2;
        if (s <= 0 || s >= 1) {
          continue;
        }
        if (s * s * len2 <= eps * eps || (1 - s) * (1 - s) * len2 <= eps * eps) {
          continue;
        }
        const px = vx - s * ex, py = vy - s * ey, pz = vz - s * ez;
        if (px * px + py * py + pz * pz > eps * eps) {
          continue;
        }
        found.push({ s, v });
      }
    }
    if (found.length === 0) {
      return null;
    }
    found.sort((u, w) => u.s - w.s);
    const mids = [];
    let last = -Infinity;
    for (const { s, v } of found) {
      if ((s - last) * (s - last) * len2 <= eps * eps) {
        continue;
      }
      mids.push(v); last = s;
    }
    return mids;
  };
  const out = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    let ring = null;
    for (let k = 0; k < 3; k++) {
      const mids = midsOf(tri[k], tri[(k + 1) % 3]);
      if (!mids) {
        continue;
      }
      if (!ring) {
        ring = [[tri[0]], [tri[1]], [tri[2]]];
      }
      ring[k].push(...mids);
    }
    if (!ring) {
      out.push(tri[0], tri[1], tri[2]); continue;
    }
    const loop = ring.flat();
    let cx = 0, cy = 0, cz = 0;
    for (const i of loop) {
      cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
    }
    const c = positions.length / 3;
    positions.push(cx / loop.length, cy / loop.length, cz / loop.length);
    for (let i = 0; i < loop.length; i++) {
      out.push(c, loop[i], loop[(i + 1) % loop.length]);
    }
  }
  return out;
}

/**
 * Drop triangles thinner than the seam tolerance (height = doubled area /
 * longest edge): Float32 noise slivers along plane intersections. Real faces
 * of any thickness above it survive.
 */
function dropSlivers(positions, indices, minHeight) {
  const p = positions;
  const kept = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const wx = p[c] - p[b], wy = p[c + 1] - p[b + 1], wz = p[c + 2] - p[b + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const twiceArea = Math.hypot(cx, cy, cz);
    const longest = Math.sqrt(Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz, wx * wx + wy * wy + wz * wz));
    if (!(longest > 0) || twiceArea / longest <= minHeight) {
      continue;
    }
    kept.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return kept;
}

/**
 * Weld vertices within `tol` of each other (true neighbourhood search, not
 * grid rounding: seams between skin and cores straddle grid cells). Returns
 * the remapped index array; positions of representatives are kept.
 */
function weldIndices(positions, indices, tol) {
  const n = positions.length / 3;
  const cells = new Map();
  const remap = new Int32Array(n).fill(-1);
  const key = (ix, iy, iz) => `${ix}|${iy}|${iz}`;
  const tol2 = tol * tol;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const cx = Math.floor(x / tol), cy = Math.floor(y / tol), cz = Math.floor(z / tol);
    let rep = -1;
    for (let dx = -1; dx <= 1 && rep < 0; dx++) {
      for (let dy = -1; dy <= 1 && rep < 0; dy++) {
        for (let dz = -1; dz <= 1 && rep < 0; dz++) {
          const bucket = cells.get(key(cx + dx, cy + dy, cz + dz));
          if (!bucket) {
            continue;
          }
          for (const j of bucket) {
            const ex = positions[j * 3] - x, ey = positions[j * 3 + 1] - y, ez = positions[j * 3 + 2] - z;
            if (ex * ex + ey * ey + ez * ez <= tol2) {
              rep = j; break;
            }
          }
        }
      }
    }
    if (rep < 0) {
      rep = i;
      const k = key(cx, cy, cz);
      if (!cells.has(k)) {
        cells.set(k, []);
      }
      cells.get(k).push(i);
    }
    remap[i] = rep;
  }
  const out = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a === b || b === c || a === c) {
      continue;
    }
    out.push(a, b, c);
  }
  return out;
}

/** Double positions relative to `origin` → BufferGeometry re-centred in doubles, welded, creased normals. */
function buildGeometry(allPositions, rawIndices, origin, eps) {
  const welded = weldIndices(allPositions, rawIndices, Math.max(1e-4, eps));
  if (welded.length < 3) {
    return null;
  }
  // Compact to referenced vertices only.
  const compact = new Map();
  const positions = [];
  const indices = welded.map(i => {
    let c = compact.get(i);
    if (c === undefined) {
      c = positions.length / 3;
      compact.set(i, c);
      positions.push(allPositions[i * 3], allPositions[i * 3 + 1], allPositions[i * 3 + 2]);
    }
    return c;
  });
  const n = positions.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;
  const float32 = new Float32Array(positions.length);
  for (let i = 0; i < n; i++) {
    float32[i * 3] = positions[i * 3] - cx;
    float32[i * 3 + 1] = positions[i * 3 + 1] - cy;
    float32[i * 3 + 2] = positions[i * 3 + 2] - cz;
  }
  for (let i = 0; i < float32.length; i++) {
    if (!Number.isFinite(float32[i])) {
      return null;
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(float32, 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.userData = { localOrigin: [origin[0] + cx, origin[1] + cy, origin[2] + cz] };
  // Seams between skin and cores differ by the cores' Float32 rounding.
  mergeVerticesInPlace(geom, Math.max(1e-4, eps));
  computeCreasedVertexNormals(geom);
  geom.computeBoundingBox();
  if (!geom.index || geom.index.count < 3) {
    return null;
  }
  return geom;
}
