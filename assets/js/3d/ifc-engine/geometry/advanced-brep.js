/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
import * as THREE from '../../../vendor/three/three.module.js';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parseWrappedNum } from './step-helpers.js';
import { placement3DToMatrix } from './placement.js';
import { mergeVerticesInPlace, computeCreasedVertexNormals, tryExtrudedDifference2D,
  extrudedAreaSolidToGeometry } from './mesh-types.js';

/**
 * Bounded, approximate surface tessellation; no CAD-kernel dependency.
 * Supports planes, cylinders, spheres, cones (radians), ring tori and non-rational
 * B-splines with knots. Lines, polylines, circles and non-rational B-splines are
 * accepted as edge curves. Surface/seam curves use their 3D curve, not pcurves.
 * Closed spline seams are unwrapped in UV. Holes are triangulated in UV before
 * subdivision; failed bounds invalidate the WHOLE face, never fill its holes.
 * Numerical spline inversion and fixed sampling are approximations, not a
 * watertight CAD tessellation (adjacent faces may have different subdivisions).
 * Singular/pole-crossing trims, non-contractible trims without a seam, rational
 * splines, general pcurves and advanced breps with voids are unsupported.
 * Swept surfaces support arbitrary open profiles made of two-point polylines
 * or B-spline/circle curves. Revolution uses Axis1Placement in the surface
 * frame; extrusion uses an unbounded sweep trimmed by the face. Other profiles
 * (including multi-segment polylines with sharp corners) are unsupported.
 * Such faces are skipped and listed in userData.advancedBrep.skippedFaces; no surviving triangles means null.
 * 2D edge curves in older examples are accepted only in the global XY plane at
 * the common endpoint Z; arbitrary 2D curves require pcurve support.
 * CSG follows geometry-core: exact existing extruded-difference pattern, else
 * first operand with explicit approximation metadata. No general CSG solver.
 * All positions stay double precision until localOrigin has been subtracted.
 */
const TAU = 2 * Math.PI;
const SEGMENTS = 64;
const MAX_POINTS = 500000;
const EPS = 1e-9;
const V = a => new THREE.Vector3(a[0], a[1], a[2] ?? 0);
function requireValue(ok, reason = 'Invalid or unsupported geometry') {
  if (!ok) {
    throw new Error(reason);
  }
}
function entity(index, id, type) {
  const e = index.byExpressId(id);
  requireValue(e && (!type || e.type === type), `Missing/invalid ${type || 'entity'} #${id}`);
  return e;
}
const params = (index, id, type) => splitParams(entity(index, id, type).params);
function number(raw) {
  const n = parseWrappedNum(raw);
  requireValue(n && Number.isFinite(n.value));
  return n.value;
}
const tuple = raw => splitParams(raw.slice(1, -1)).map(number);
function coords(index, id, type = 'IFCCARTESIANPOINT') {
  const a = tuple(params(index, id, type)[0]);
  requireValue(a.length === 2 || a.length === 3);
  return a;
}
function frame(index, raw) {
  const id = parseRef(raw);
  if (raw === '$' || raw === undefined) {
    return new THREE.Matrix4();
  }
  const e = entity(index, id);
  const p = splitParams(e.params);
  coords(index, parseRef(p[0]));
  if (e.type === 'IFCAXIS2PLACEMENT2D') {
    const o = coords(index, parseRef(p[0]));
    const x = p[1] === '$' ? new THREE.Vector3(1, 0, 0) : V(coords(index, parseRef(p[1]), 'IFCDIRECTION')).normalize();
    requireValue(x.lengthSq() > EPS);
    return new THREE.Matrix4().makeBasis(x, new THREE.Vector3(-x.y, x.x, 0), new THREE.Vector3(0, 0, 1)).setPosition(V(o));
  }
  requireValue(e.type === 'IFCAXIS2PLACEMENT3D');
  for (const ref of p.slice(1, 3)) {
    if (parseRef(ref)) {
      coords(index, parseRef(ref), 'IFCDIRECTION');
    }
  }
  const m = placement3DToMatrix(index, id);
  requireValue(Number.isFinite(m.determinant()) && Math.abs(m.determinant()) > 0.9);
  return m;
}
function clean(points, tolerance = EPS) {
  return points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > tolerance);
}
function knotVector(mult, knots, degree, count) {
  const m = tuple(mult), k = tuple(knots);
  requireValue(Number.isInteger(degree) && degree >= 1 && degree <= 10 && m.length === k.length && count <= 1000);
  const out = [];
  m.forEach((n, i) => {
    requireValue(Number.isInteger(n) && n > 0 && n <= degree + 1 && (i === 0 || k[i] > k[i - 1]));
    for (let j = 0; j < n; j++) {
      out.push(k[i]);
    }
  });
  requireValue(out.length === count + degree + 1 && out[count] > out[degree]);
  return out;
}
// Iterative Cox-de Boor basis; normalized input avoids conditioning on IFC knot units.
function basis(t, degree, knots, count) {
  const x = knots[degree] + Math.max(0, Math.min(1, t)) * (knots[count] - knots[degree]);
  let b = Array(knots.length - 1).fill(0);
  let span = count - 1;
  if (t < 1) {
    for (let i = degree; i < count; i++) {
      if (x >= knots[i] && x < knots[i + 1]) {
        span = i; break;
      }
    }
  }
  b[span] = 1;
  for (let d = 1; d <= degree; d++) {
    const next = Array(b.length - 1).fill(0);
    for (let i = 0; i < next.length; i++) {
      const l = knots[i + d] - knots[i], r = knots[i + d + 1] - knots[i + 1];
      next[i] = (l ? (x - knots[i]) / l * b[i] : 0) + (r ? (knots[i + d + 1] - x) / r * b[i + 1] : 0);
    }
    b = next;
  }
  return b.slice(0, count);
}
const wrap = t => ((t % 1) + 1) % 1;
function curve(index, id, z = 0, depth = 0) {
  requireValue(depth < 8);
  const e = entity(index, id), p = splitParams(e.params);
  if (e.type === 'IFCSURFACECURVE' || e.type === 'IFCSEAMCURVE') {
    return curve(index, parseRef(p[0]), z, depth + 1);
  }
  if (e.type === 'IFCCIRCLE') {
    const m = frame(index, p[0]), inv = m.clone().invert(), r = number(p[1]);
    requireValue(r > 0);
    if (entity(index, parseRef(p[0])).type === 'IFCAXIS2PLACEMENT2D') {
      m.elements[14] = z;
    }
    inv.copy(m).invert();
    return { periodic: true, at: t => new THREE.Vector3(r * Math.cos(t * TAU), r * Math.sin(t * TAU), 0).applyMatrix4(m),
      inverse: point => {
        const a = point.clone().applyMatrix4(inv); return wrap(Math.atan2(a.y, a.x) / TAU);
      } };
  }
  if (e.type === 'IFCPOLYLINE' || e.type === 'IFCBSPLINECURVEWITHKNOTS') {
    const cp = parseRefList(p[e.type === 'IFCPOLYLINE' ? 0 : 1]).map(id => {
      const a = coords(index, id); return new THREE.Vector3(a[0], a[1], a[2] ?? z);
    });
    requireValue(cp.length >= 2 && cp.length <= 1000);
    if (e.type === 'IFCPOLYLINE') {
      return { cp, at: t => {
        const s = Math.max(0, Math.min(1, t)) * (cp.length - 1), i = Math.min(cp.length - 2, Math.floor(s));
        return cp[i].clone().lerp(cp[i + 1], s - i);
      } };
    }
    const degree = number(p[0]), knots = knotVector(p[5], p[6], degree, cp.length);
    return { periodic: p[3] === '.T.', at: t => {
      const b = basis(t, degree, knots, cp.length), v = new THREE.Vector3();
      cp.forEach((point, i) => v.addScaledVector(point, b[i])); return v;
    } };
  }
  throw new Error(`Unsupported edge curve ${e.type}`);
}
function curveParameter(c, point) {
  if (c.inverse) {
    return c.inverse(point);
  }
  let best = 0, distance = Infinity;
  for (let i = 0; i <= SEGMENTS; i++) {
    const d = c.at(i / SEGMENTS).distanceToSquared(point);
    if (d < distance) {
      best = i / SEGMENTS; distance = d;
    }
  }
  let lo = Math.max(0, best - 1 / SEGMENTS), hi = Math.min(1, best + 1 / SEGMENTS);
  for (let i = 0; i < 35; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (c.at(a).distanceToSquared(point) < c.at(b).distanceToSquared(point)) {
      hi = b;
    } else {
      lo = a;
    }
  }
  const t = (lo + hi) / 2;
  return c.at(best).distanceToSquared(point) < c.at(t).distanceToSquared(point) ? best : t;
}
function edgePoints(index, id) {
  const o = params(index, id, 'IFCORIENTEDEDGE');
  const p = params(index, parseRef(o[2]), 'IFCEDGECURVE');
  const vertex = ref => V(coords(index, parseRef(params(index, parseRef(ref), 'IFCVERTEXPOINT')[0])));
  const start = vertex(p[0]), end = vertex(p[1]);
  requireValue(p[3] === '.T.' || p[3] === '.F.');
  const e = entity(index, parseRef(p[2]));
  let points;
  if (e.type === 'IFCLINE') {
    points = [start, end];
  } else {
    const c = curve(index, e.expressId ?? parseRef(p[2]), start.z);
    // Two-point polylines in the specification examples may be 2D even on
    // a 3D edge. The topological vertices determine that straight segment.
    if (c.cp?.length === 2) {
      points = [start, end];
    } else {
      const a = curveParameter(c, start);
      let b = curveParameter(c, end);
      const forward = p[3] === '.T.';
      if (c.periodic) {
        if (forward && b <= a + EPS) {
          b += 1;
        }
        if (!forward && b >= a - EPS) {
          b -= 1;
        }
      } else {
        requireValue(forward ? b > a : b < a, 'Edge sense disagrees with curve');
      }
      const sample = t => c.at(c.periodic ? wrap(t) : t);
      const tol = Math.max(1e-6, start.distanceTo(end) * 1e-5);
      requireValue(sample(a).distanceTo(start) < tol && sample(b).distanceTo(end) < tol, 'Edge endpoints off curve');
      const n = Math.max(2, Math.ceil(Math.abs(b - a) * SEGMENTS));
      const ts = c.cp ? [a, ...c.cp.map((_, i) => i / (c.cp.length - 1)).filter(t => t > Math.min(a, b) && t < Math.max(a, b)), b].sort((x, y) => forward ? x - y : y - x)
        : Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
      points = ts.map(sample);
      points[0] = start; points[points.length - 1] = end;
    }
  }
  requireValue(o[3] === '.T.' || o[3] === '.F.');
  if (o[3] === '.F.') {
    points.reverse();
  }
  return points;
}
function loopPoints(index, id) {
  const e = entity(index, id), p = splitParams(e.params);
  if (e.type === 'IFCPOLYLOOP') {
    const pts = parseRefList(p[0]).map(id => V(coords(index, id)));
    requireValue(pts.length >= 3); return [...pts, pts[0].clone()];
  }
  requireValue(e.type === 'IFCEDGELOOP');
  const out = [];
  for (const id of parseRefList(p[0])) {
    const pts = edgePoints(index, id);
    requireValue(!out.length || out[out.length - 1].distanceTo(pts[0]) < 1e-5, 'Disconnected edge loop');
    out.push(...(out.length ? pts.slice(1) : pts));
    requireValue(out.length < 10000);
  }
  requireValue(out.length >= 3 && out[0].distanceTo(out[out.length - 1]) < 1e-5, 'Open edge loop');
  return clean(out);
}
function splineSurface(index, p) {
  const cp = splitParams(p[2].slice(1, -1)).map(row => parseRefList(row).map(id => V(coords(index, id))));
  const nu = cp.length, nv = cp[0]?.length, du = number(p[0]), dv = number(p[1]);
  requireValue(nu >= 2 && nv >= 2 && nu * nv <= 10000 && cp.every(row => row.length === nv));
  const ku = knotVector(p[7], p[9], du, nu), kv = knotVector(p[8], p[10], dv, nv);
  const periods = [p[4] === '.T.' ? 1 : 0, p[5] === '.T.' ? 1 : 0];
  const at = (u, v) => {
    const bu = basis(periods[0] ? wrap(u) : u, du, ku, nu), bv = basis(periods[1] ? wrap(v) : v, dv, kv, nv);
    const point = new THREE.Vector3();
    cp.forEach((row, i) => row.forEach((p, j) => point.addScaledVector(p, bu[i] * bv[j])));
    return point;
  };
  return { at, periods, steps: [1 / 24, 1 / 48], numerical: true };
}
function sweptSurface(index, type, p, trimPoints) {
  // IfcSweptSurface.SweptCurve is an IfcProfileDef, not a direct curve ref:
  // https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcSurfaceOfLinearExtrusion.htm
  const profile = params(index, parseRef(p[0]), 'IFCARBITRARYOPENPROFILEDEF');
  requireValue(profile[0] === '.CURVE.');
  const c = curve(index, parseRef(profile[2]));
  requireValue(!c.cp || c.cp.length === 2, 'Multi-segment swept profile unsupported');
  const m = frame(index, p[1]), inv = m.clone().invert();
  if (type === 'IFCSURFACEOFLINEAREXTRUSION') {
    const direction = V(coords(index, parseRef(p[2]), 'IFCDIRECTION'));
    requireValue(direction.lengthSq() > EPS && number(p[3]) > 0); direction.normalize();
    const trim = trimPoints.map(q => q.clone().applyMatrix4(inv).dot(direction));
    const profileRange = Array.from({ length: SEGMENTS + 1 }, (_, i) => c.at(i / SEGMENTS).dot(direction));
    const lo = Math.min(...trim) - Math.max(...profileRange), hi = Math.max(...trim) - Math.min(...profileRange);
    requireValue(hi > lo);
    return { at: (u, v) => c.at(c.periodic ? wrap(u) : u).addScaledVector(direction, lo + v * (hi - lo)).applyMatrix4(m),
      periods: [c.periodic ? 1 : 0, 0], steps: [c.cp ? Infinity : 1 / SEGMENTS, Infinity], numerical: true };
  }
  const axis = params(index, parseRef(p[2]), 'IFCAXIS1PLACEMENT');
  const origin = V(coords(index, parseRef(axis[0]))), direction = axis[1] === '$' ? new THREE.Vector3(0, 0, 1) : V(coords(index, parseRef(axis[1]), 'IFCDIRECTION'));
  requireValue(direction.lengthSq() > EPS); direction.normalize();
  return { at: (u, v) => c.at(c.periodic ? wrap(v) : v).sub(origin).applyAxisAngle(direction, u * TAU).add(origin).applyMatrix4(m),
    periods: [1, c.periodic ? 1 : 0], steps: [1 / SEGMENTS, c.cp ? Infinity : 1 / SEGMENTS], numerical: true };
}
function surface(index, id, trimPoints) {
  const e = entity(index, id), p = splitParams(e.params);
  if (e.type === 'IFCBSPLINESURFACEWITHKNOTS') {
    return splineSurface(index, p);
  }
  if (e.type === 'IFCSURFACEOFLINEAREXTRUSION' || e.type === 'IFCSURFACEOFREVOLUTION') {
    return sweptSurface(index, e.type, p, trimPoints);
  }
  const supported = ['IFCPLANE', 'IFCCYLINDRICALSURFACE', 'IFCSPHERICALSURFACE', 'IFCCONICALSURFACE', 'IFCTOROIDALSURFACE'];
  requireValue(supported.includes(e.type), `Unsupported surface ${e.type}`);
  const m = frame(index, p[0]), inv = m.clone().invert();
  const local = point => point.clone().applyMatrix4(inv);
  if (e.type === 'IFCPLANE') {
    return { at: (u, v) => new THREE.Vector3(u, v, 0).applyMatrix4(m),
      inverse: point => {
        const q = local(point); return [q.x, q.y];
      }, periods: [0, 0], steps: [Infinity, Infinity] };
  }
  const r = number(p[1]); requireValue(r > 0);
  let at, inverse, periods = [1, 0], steps = [1 / SEGMENTS, Infinity];
  if (e.type === 'IFCCYLINDRICALSURFACE') {
    at = (u, v) => new THREE.Vector3(r * Math.cos(u * TAU), r * Math.sin(u * TAU), v);
    inverse = q => [Math.atan2(q.y, q.x) / TAU, q.z];
  } else if (e.type === 'IFCSPHERICALSURFACE') {
    at = (u, v) => new THREE.Vector3(r * Math.cos(v * TAU) * Math.cos(u * TAU), r * Math.cos(v * TAU) * Math.sin(u * TAU), r * Math.sin(v * TAU));
    inverse = q => [Math.atan2(q.y, q.x) / TAU, Math.atan2(q.z, Math.hypot(q.x, q.y)) / TAU];
    steps = [1 / SEGMENTS, 1 / SEGMENTS];
  } else if (e.type === 'IFCCONICALSURFACE') {
    // Compatibility extension: IfcConicalSurface is not in every IFC schema.
    const a = number(p[2]); requireValue(Math.abs(a) < Math.PI / 2);
    at = (u, v) => new THREE.Vector3((r + v * Math.tan(a)) * Math.cos(u * TAU), (r + v * Math.tan(a)) * Math.sin(u * TAU), v);
    inverse = q => [Math.atan2(q.y, q.x) / TAU, q.z];
  } else {
    const minor = number(p[2]); requireValue(minor > 0 && minor < r, 'Only ring tori supported');
    at = (u, v) => new THREE.Vector3((r + minor * Math.cos(v * TAU)) * Math.cos(u * TAU), (r + minor * Math.cos(v * TAU)) * Math.sin(u * TAU), minor * Math.sin(v * TAU));
    inverse = q => [Math.atan2(q.y, q.x) / TAU, Math.atan2(q.z, Math.hypot(q.x, q.y) - r) / TAU];
    periods = [1, 1]; steps = [1 / SEGMENTS, 1 / SEGMENTS];
  }
  return { at: (u, v) => at(u, v).applyMatrix4(m), inverse: point => inverse(local(point)), periods, steps };
}
// Closest-point inversion of a regular B-spline patch, seeded by a coarse grid.
// Reject off-surface/inversion failures rather than drawing an unrelated patch.
function inverseSurface(s, point, previous, tolerance) {
  let uv;
  if (s.inverse) {
    uv = s.inverse(point);
  } else {
    let best = Infinity;
    const consider = candidate => {
      const d = s.at(...candidate).distanceToSquared(point);
      if (d < best) {
        best = d; uv = candidate.slice();
      }
    };
    if (previous) {
      consider(previous);
    }
    if (!s.seeds) {
      s.seeds = [];
      for (let i = 0; i <= 16; i++) {
        for (let j = 0; j <= 16; j++) {
          s.seeds.push({ uv: [i / 16, j / 16], point: s.at(i / 16, j / 16) });
        }
      }
    }
    for (const seed of s.seeds) {
      const d = seed.point.distanceToSquared(point);
      if (d < best) {
        best = d; uv = seed.uv.slice();
      }
    }
    for (let i = 0; i < 35; i++) {
      const q = s.at(...uv), error = point.clone().sub(q), h = 1e-5;
      const derivative = k => {
        const a = uv.slice(), b = uv.slice();
        a[k] -= h; b[k] += h;
        if (!s.periods[k]) {
          a[k] = Math.max(0, a[k]); b[k] = Math.min(1, b[k]);
        }
        return s.at(...b).sub(s.at(...a)).divideScalar(b[k] - a[k]);
      };
      const u = derivative(0), v = derivative(1), a = u.dot(u), b = u.dot(v), c = v.dot(v), det = a * c - b * b;
      if (Math.abs(det) < 1e-24) {
        break;
      }
      const eu = u.dot(error), ev = v.dot(error);
      const delta = [(c * eu - b * ev) / det, (a * ev - b * eu) / det];
      let improved = false;
      for (let scale = 1; scale >= 1 / 128; scale /= 2) {
        const next = uv.map((t, k) => s.periods[k] ? t + scale * delta[k] : Math.max(0, Math.min(1, t + scale * delta[k])));
        if (s.at(...next).distanceToSquared(point) < error.lengthSq()) {
          uv = next; improved = true; break;
        }
      }
      if (!improved || error.length() < tolerance * 0.01) {
        break;
      }
    }
  }
  requireValue(uv.every(Number.isFinite) && s.at(...uv).distanceTo(point) <= tolerance, 'Trim is off surface / inverse failed');
  if (previous) {
    uv = uv.map((t, k) => s.periods[k] ? t + Math.round((previous[k] - t) / s.periods[k]) * s.periods[k] : t);
  }
  return uv;
}
function planarSurface(points) {
  const o = points[0], n = new THREE.Vector3();
  for (let i = 1; i < points.length - 1; i++) {
    n.add(new THREE.Vector3().crossVectors(points[i].clone().sub(o), points[i + 1].clone().sub(o)));
  }
  requireValue(n.lengthSq() > 1e-24); n.normalize();
  const u = points.find(p => p.distanceTo(o) > EPS).clone().sub(o).normalize(), v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { inverse: p => {
    const q = p.clone().sub(o); return [q.dot(u), q.dot(v)];
  },
  at: (x, y) => o.clone().addScaledVector(u, x).addScaledVector(v, y), periods: [0, 0], steps: [Infinity, Infinity] };
}
function faceMesh(index, id) {
  const e = entity(index, id), p = splitParams(e.params);
  requireValue(['IFCFACE', 'IFCFACESURFACE', 'IFCADVANCEDFACE'].includes(e.type));
  requireValue(e.type === 'IFCFACE' || p[2] === '.T.' || p[2] === '.F.');
  const bounds = parseRefList(p[0]).map(id => {
    const b = entity(index, id), bp = splitParams(b.params);
    requireValue(b.type === 'IFCFACEBOUND' || b.type === 'IFCFACEOUTERBOUND');
    const points = loopPoints(index, parseRef(bp[0]));
    requireValue(bp[1] === '.T.' || bp[1] === '.F.');
    if (bp[1] === '.F.') {
      points.reverse();
    }
    return { outer: b.type === 'IFCFACEOUTERBOUND', points };
  });
  requireValue(bounds.length > 0 && bounds.filter(b => b.outer).length <= 1);
  // No explicit outer bound: choose the largest projected loop below.
  const explicit = bounds.findIndex(b => b.outer);
  if (explicit > 0) {
    [bounds[0], bounds[explicit]] = [bounds[explicit], bounds[0]];
  }
  if (explicit < 0 && e.type === 'IFCFACE') {
    // A face may use only IfcFaceBound, with its inner bound listed first.
    // Infer the outer BEFORE choosing the plane normal, so a clockwise hole
    // does not reverse the entire face.
    const areaVector = points => {
      const n = new THREE.Vector3(), o = points[0];
      for (let i = 1; i < points.length - 1; i++) {
        n.add(new THREE.Vector3().crossVectors(points[i].clone().sub(o), points[i + 1].clone().sub(o)));
      }
      return n.lengthSq();
    };
    const areas = bounds.map(b => areaVector(b.points)), largest = areas.indexOf(Math.max(...areas));
    [bounds[0], bounds[largest]] = [bounds[largest], bounds[0]];
  }
  const s = e.type === 'IFCFACE' ? planarSurface(bounds[0].points) : surface(index, parseRef(p[1]), bounds.flatMap(b => b.points));
  const box = new THREE.Box3().setFromPoints(bounds.flatMap(b => b.points));
  const tolerance = Math.max(1e-6, box.getSize(new THREE.Vector3()).length() * 1e-5);
  const rings = bounds.map(b => {
    const uv = [];
    for (const point of b.points) {
      uv.push(inverseSurface(s, point, uv[uv.length - 1], tolerance));
    }
    requireValue(Math.hypot(uv[0][0] - uv[uv.length - 1][0], uv[0][1] - uv[uv.length - 1][1]) < 1e-5,
      'Periodic trim needs an explicit seam');
    uv.pop();
    const ring = clean(uv.map(a => new THREE.Vector2(...a)));
    requireValue(ring.length >= 3); return ring;
  });
  if (explicit < 0) {
    let largest = 0;
    rings.forEach((r, i) => {
      if (Math.abs(THREE.ShapeUtils.area(r)) > Math.abs(THREE.ShapeUtils.area(rings[largest]))) {
        largest = i;
      }
    });
    [rings[0], rings[largest]] = [rings[largest], rings[0]];
  }
  // Put holes on the same periodic branch as their outer boundary.
  const center = ring => ring.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(ring.length);
  const outerCenter = center(rings[0]);
  for (const hole of rings.slice(1)) {
    const c = center(hole), shift = s.periods.map((period, k) => period ? Math.round((outerCenter.getComponent(k) - c.getComponent(k)) / period) * period : 0);
    hole.forEach(p => p.add(new THREE.Vector2(...shift)));
  }
  const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1)), uv = rings.flat();
  requireValue(triangles.length > 0, 'Trim triangulation failed');
  const positions = [], indices = [], reverse = e.type !== 'IFCFACE' && p[2] === '.F.';
  function emit(a, b, c, depth = 0) {
    const edges = [[a, b, c], [b, c, a], [c, a, b]];
    const lengths = edges.map(([p, q]) => Math.hypot(...[0, 1].map(k => (p.getComponent(k) - q.getComponent(k)) / s.steps[k])));
    const longest = lengths.indexOf(Math.max(...lengths));
    if (lengths[longest] > 1.01 && depth < 20) {
      const [p, q, opposite] = edges[longest], mid = p.clone().add(q).multiplyScalar(0.5);
      emit(p, mid, opposite, depth + 1); emit(mid, q, opposite, depth + 1); return;
    }
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if ((cross < 0) !== reverse) {
      [b, c] = [c, b];
    }
    const base = positions.length / 3;
    for (const p of [a, b, c]) {
      positions.push(...s.at(p.x, p.y).toArray());
    }
    indices.push(base, base + 1, base + 2);
    requireValue(positions.length / 3 < MAX_POINTS, 'Face tessellation budget exceeded');
  }
  for (const t of triangles) {
    emit(...t.map(i => uv[i]));
  }
  return { positions, indices, sampled: s.steps.some(Number.isFinite) };
}
function geometry(positions, indices, metadata) {
  if (!indices.length || !positions.every(Number.isFinite)) {
    return null;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((v, i) => {
    const k = i % 3; min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
  });
  const origin = min.map((v, k) => v + (max[k] - v) / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions.map((v, i) => v - origin[i % 3]), 3));
  g.setIndex(indices); g.userData.localOrigin = origin;
  g.userData.advancedBrep = metadata;
  mergeVerticesInPlace(g, Math.max(1e-9, Math.hypot(...max.map((v, k) => v - min[k])) * 1e-9));
  if (!g.index.count) {
    g.dispose(); return null;
  }
  computeCreasedVertexNormals(g); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
function facesToGeometry(index, faceIds) {
  const positions = [], indices = [], skippedFaces = [];
  let sampled = false, faces = 0;
  for (const id of faceIds) {
    try {
      const mesh = faceMesh(index, id), base = positions.length / 3;
      requireValue(base + mesh.positions.length / 3 < MAX_POINTS, 'Geometry tessellation budget exceeded');
      for (const p of mesh.positions) {
        positions.push(p);
      }
      for (const i of mesh.indices) {
        indices.push(base + i);
      }
      sampled ||= mesh.sampled; faces++;
    } catch (error) {
      skippedFaces.push({ id, reason: error.message });
    }
  }
  return geometry(positions, indices, { faces, sampled, partial: skippedFaces.length > 0, skippedFaces });
}
export function advancedBrepToGeometry(entityIndex, id) {
  try {
    const p = params(entityIndex, id, 'IFCADVANCEDBREP');
    return facesToGeometry(entityIndex, parseRefList(params(entityIndex, parseRef(p[0]), 'IFCCLOSEDSHELL')[0]));
  } catch {
    return null;
  }
}
export function faceBasedSurfaceModelToGeometry(entityIndex, id) {
  try {
    const p = params(entityIndex, id, 'IFCFACEBASEDSURFACEMODEL');
    const faces = parseRefList(p[0]).flatMap(id => {
      const e = entity(entityIndex, id);
      requireValue(['IFCCONNECTEDFACESET', 'IFCOPENSHELL', 'IFCCLOSEDSHELL'].includes(e.type));
      return parseRefList(splitParams(e.params)[0]);
    });
    return facesToGeometry(entityIndex, faces);
  } catch {
    return null;
  }
}
function primitive(index, id, seen) {
  requireValue(!seen.has(id) && seen.size < 32, 'Cyclic/deep CSG tree'); seen.add(id);
  const e = entity(index, id), p = splitParams(e.params);
  if (e.type === 'IFCCSGSOLID') {
    return primitive(index, parseRef(p[0]), seen);
  }
  if (e.type === 'IFCBOOLEANRESULT' || e.type === 'IFCBOOLEANCLIPPINGRESULT') {
    const a = parseRef(p[1]), b = parseRef(p[2]);
    requireValue(['.DIFFERENCE.', '.UNION.', '.INTERSECTION.'].includes(p[0]) && a && b);
    let g = p[0] === '.DIFFERENCE.' ? tryExtrudedDifference2D(index, a, b) : null;
    if (g) {
      g.userData.csg = { exactBooleanDifference: true, method: 'existing-extruded-2D-pattern' };
      g.computeBoundingBox(); return g;
    }
    g = primitive(index, a, seen);
    if (g) {
      g.userData.csg = { ...g.userData.csg, approximate: true, firstOperandOnly: true, operator: p[0], skippedOperand: b };
    }
    return g;
  }
  if (e.type === 'IFCEXTRUDEDAREASOLID') {
    const g = extrudedAreaSolidToGeometry(index, id);
    if (g) {
      g.computeBoundingBox();
    }
    return g;
  }
  const types = ['IFCBLOCK', 'IFCRIGHTCIRCULARCYLINDER', 'IFCSPHERE', 'IFCRIGHTCIRCULARCONE', 'IFCRECTANGULARPYRAMID'];
  requireValue(types.includes(e.type));
  const m = frame(index, p[0]), dimensions = p.slice(1).map(number);
  requireValue(dimensions.every(n => n > 0));
  let g;
  if (e.type === 'IFCBLOCK') {
    requireValue(dimensions.length === 3);
    const [x, y, z] = dimensions; g = new THREE.BoxGeometry(x, y, z); g.translate(x / 2, y / 2, z / 2);
  } else if (e.type === 'IFCRECTANGULARPYRAMID') {
    requireValue(dimensions.length === 3);
    const [x, y, z] = dimensions;
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, x,0,0, x,y,0, 0,y,0, x/2,y/2,z], 3));
    g.setIndex([0,2,1, 0,3,2, 0,1,4, 1,2,4, 2,3,4, 3,0,4]);
  } else if (e.type === 'IFCSPHERE') {
    requireValue(dimensions.length === 1); g = new THREE.SphereGeometry(dimensions[0], SEGMENTS, SEGMENTS / 2);
    g.rotateX(Math.PI / 2);
  } else {
    requireValue(dimensions.length === 2);
    const [height, radius] = dimensions;
    g = new THREE.CylinderGeometry(e.type === 'IFCRIGHTCIRCULARCONE' ? 0 : radius, radius, height, SEGMENTS);
    g.rotateX(Math.PI / 2); g.translate(0, 0, height / 2);
  }
  // Rotate small local coordinates only. Placement translation stays a double.
  const origin = new THREE.Vector3().setFromMatrixPosition(m); m.setPosition(0, 0, 0);
  g.applyMatrix4(m); g.userData.localOrigin = origin.toArray();
  g.userData.csg = { primitive: e.type, sampled: !['IFCBLOCK', 'IFCRECTANGULARPYRAMID'].includes(e.type) };
  computeCreasedVertexNormals(g); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
export function csgPrimitiveToGeometry(entityIndex, id) {
  try {
    return primitive(entityIndex, id, new Set());
  } catch {
    return null;
  }
}
