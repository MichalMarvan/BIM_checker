/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
import * as THREE from '../../../vendor/three/three.module.js';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parseWrappedNum } from './step-helpers.js';
import { evaluateCurve } from '../alignment/curve-evaluator.js';
import { triangulatedFaceSetToGeometry } from './mesh-types.js';

/* IFC4 / IFC4x3 ADD2, model units; Position is baked before localOrigin.
 * FixedReference projects onto the tangent-normal plane to define profile X.
 * https://github.com/buildingSMART/IFC4.x-development/blob/ifc4.3-main/docs/schemas/resource/IfcGeometricModelResource/Entities/IfcFixedReferenceSweptAreaSolid.md
 * https://github.com/buildingSMART/IFC4.x-development/blob/ifc4.3-main/docs/schemas/resource/IfcGeometricModelResource/Entities/IfcTriangulatedIrregularNetwork.md
 * Strict profile/alignment helpers follow sectioned-solid.js: mesh-types.js's
 * profile/curve resolvers are private and its 2D resolver cannot resolve a 3D axis.
 * Profiles: rectangle, circle/hollow circle (64 sides), closed line polygons
 * with holes, recursive uniform 2D derived profiles. Curves: line, polyline,
 * indexed line/arc chains, classic composites, alignment line/circle/clothoid
 * composites and line/circle gradients. Non-tangent joins return null.
 * Alignment trims accept length measures (3D arc length for gradients); native
 * alignment/indexed-arc parameters are deliberately rejected as ambiguous.
 * SegmentedReferenceCurve supports only verified zero-deviation, zero-cant line
 * segments; other cant/elevation definitions return null, never a flattened base.
 * Unsupported profiles/segments/placements return null.
 * Adaptive tessellation is approximate; no global sweep self-intersection test.
 * TIN preserves visible triangles, remaps PnIndex, removes all negative Flags.
 * Positive breakline flags do not override the shared angle-based normal routine.
 */

const EPS = 1e-9;
const MAX_VERTICES = 250000;
const optional = s => s === '$' || s === undefined;
const fail = () => {
  throw new Error('Unsupported or invalid swept geometry');
};
function requireValue(ok) {
  if (!ok) {
    fail();
  }
}
function entity(index, id, type) {
  const e = index.byExpressId(id);
  requireValue(e && (!type || e.type === type));
  return e;
}
function number(raw, defaultValue) {
  if (optional(raw) && defaultValue !== undefined) {
    return defaultValue;
  }
  requireValue(typeof raw === 'string');
  const inner = raw.replace(/^IFC(?:(?:NONNEGATIVE|POSITIVE)?LENGTHMEASURE|PARAMETERVALUE)\((.*)\)$/, '$1');
  requireValue(/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?$/.test(inner));
  const n = parseWrappedNum(raw);
  requireValue(n && Number.isFinite(n.value));
  return n.value;
}
function refs(raw) {
  requireValue(typeof raw === 'string' && /^\(\s*#\d+(?:\s*,\s*#\d+)*\s*\)$/.test(raw));
  return parseRefList(raw);
}
function tuple(raw) {
  requireValue(raw?.startsWith('(') && raw.endsWith(')'));
  return splitParams(raw.slice(1, -1)).map(s => number(s));
}
function vector(index, raw, type, dimensions) {
  const e = entity(index, parseRef(raw), type);
  const a = tuple(splitParams(e.params)[0]);
  requireValue(dimensions.includes(a.length));
  return a;
}
function placement2D(index, raw) {
  if (optional(raw)) {
    return { point: [0, 0], direction: [1, 0] };
  }
  const p = splitParams(entity(index, parseRef(raw), 'IFCAXIS2PLACEMENT2D').params);
  const point = vector(index, p[0], 'IFCCARTESIANPOINT', [2]);
  const d = optional(p[1]) ? [1, 0] : vector(index, p[1], 'IFCDIRECTION', [2]);
  const norm = Math.hypot(...d);
  requireValue(norm > EPS);
  return { point, direction: d.map(x => x / norm) };
}
function signedArea(ring) {
  const o = ring[0];
  return ring.reduce((a, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return a + (p[0] - o[0]) * (q[1] - o[1]) - (q[0] - o[0]) * (p[1] - o[1]);
  }, 0) / 2;
}
function polygon(index, id) {
  const e = entity(index, id), p = splitParams(e.params);
  let points;
  if (e.type === 'IFCPOLYLINE') {
    points = refs(p[0]).map(id => vector(index, `#${id}`, 'IFCCARTESIANPOINT', [2]));
  } else if (e.type === 'IFCINDEXEDPOLYCURVE') {
    requireValue(p[2] !== '.T.');
    const pp = splitParams(entity(index, parseRef(p[0]), 'IFCCARTESIANPOINTLIST2D').params);
    requireValue(optional(pp[1])); // Tag matching is deliberately unsupported.
    const all = splitParams(pp[0].slice(1, -1)).map(tuple);
    requireValue(all.every(v => v.length === 2));
    if (optional(p[1])) {
      points = all;
    } else {
      const path = [];
      for (const seg of splitParams(p[1].slice(1, -1))) {
        const m = seg.match(/^IFCLINEINDEX\(\(([^()]*)\)\)$/);
        requireValue(m);
        const ids = m[1].split(',').map(s => Number(s.trim()));
        requireValue(ids.length >= 2 && ids.every(i => Number.isInteger(i) && i >= 1 && i <= all.length));
        if (path.length) {
          requireValue(path[path.length - 1] === ids[0]);
        }
        path.push(...(path.length ? ids.slice(1) : ids));
      }
      points = path.map(i => all[i - 1]);
    }
  } else {
    fail();
  }
  requireValue(points.length >= 4 && points.length <= 2049);
  requireValue(Math.hypot(...points[0].map((v, k) => v - points[points.length - 1][k])) < EPS);
  return points.slice(0, -1);
}

// resolveProfilePoints in mesh-types.js is PRIVATE. Small strict subset is
// duplicated here rather than changing its exports or accepting its fallbacks.
function profile(index, id, depth = 0) {
  requireValue(depth < 8);
  const e = entity(index, id), p = splitParams(e.params);
  requireValue(p[0] === '.AREA.');
  let rings;
  if (e.type === 'IFCDERIVEDPROFILEDEF') {
    const parent = profile(index, parseRef(p[2]), depth + 1);
    const op = entity(index, parseRef(p[3]), 'IFCCARTESIANTRANSFORMATIONOPERATOR2D');
    const q = splitParams(op.params);
    const x = optional(q[0]) ? [1, 0] : vector(index, q[0], 'IFCDIRECTION', [2]);
    const n = Math.hypot(...x); requireValue(n > EPS);
    x[0] /= n; x[1] /= n;
    const y = optional(q[1]) ? [-x[1], x[0]] : vector(index, q[1], 'IFCDIRECTION', [2]);
    const yn = Math.hypot(...y); requireValue(yn > EPS);
    y[0] /= yn; y[1] /= yn;
    requireValue(Math.abs(x[0] * y[0] + x[1] * y[1]) < EPS);
    const o = vector(index, q[2], 'IFCCARTESIANPOINT', [2]);
    const scale = number(q[3], 1); requireValue(scale > EPS);
    rings = parent.rings.map(r => r.map(([a, b]) => [o[0] + scale * (a*x[0] + b*y[0]), o[1] + scale * (a*x[1] + b*y[1])]));
  } else if (e.type === 'IFCARBITRARYCLOSEDPROFILEDEF' || e.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
    rings = [polygon(index, parseRef(p[2]))];
    if (e.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      rings.push(...refs(p[3]).map(id => polygon(index, id)));
    }
  } else {
    if (e.type === 'IFCRECTANGLEPROFILEDEF') {
      const w = number(p[3]) / 2, h = number(p[4]) / 2;
      requireValue(w > EPS && h > EPS);
      rings = [[[-w, -h], [w, -h], [w, h], [-w, h]]];
    } else if (e.type === 'IFCCIRCLEPROFILEDEF' || e.type === 'IFCCIRCLEHOLLOWPROFILEDEF') {
      const r = number(p[3]);
      requireValue(r > EPS);
      const circle = radius => Array.from({ length: 64 }, (_, i) => [radius * Math.cos(i * Math.PI / 32), radius * Math.sin(i * Math.PI / 32)]);
      rings = [circle(r)];
      if (e.type === 'IFCCIRCLEHOLLOWPROFILEDEF') {
        const t = number(p[4]);
        requireValue(t > EPS && t < r);
        rings.push(circle(r - t));
      }
    } else {
      fail();
    }
    const pos = placement2D(index, p[2]), [c, s] = pos.direction;
    rings = rings.map(r => r.map(([x, y]) => [pos.point[0] + c * x - s * y, pos.point[1] + s * x + c * y]));
  }
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i], area = signedArea(r);
    requireValue(r.length >= 3 && Math.abs(area) > EPS);
    requireValue(r.every((p, j) => Math.hypot(p[0] - r[(j + 1) % r.length][0], p[1] - r[(j + 1) % r.length][1]) > EPS));
    // Keep the first vertex fixed so reversing winding preserves correspondence.
    if ((area > 0) !== (i === 0)) {
      rings[i] = [r[0], ...r.slice(1).reverse()];
    }
  }
  return { type: e.type, rings };
}

function segmentData(index, id, vertical = false) {
  const p = splitParams(entity(index, id, 'IFCCURVESEGMENT').params);
  requireValue(parseRef(p[1]));
  const pos = placement2D(index, p[1]);
  const start = parseWrappedNum(p[2]), length = parseWrappedNum(p[3]);
  requireValue(start && length && Number.isFinite(start.value) && Number.isFinite(length.value));
  number(p[2]); number(p[3]); // parseWrappedNum alone accepts trailing garbage.
  if (entity(index, parseRef(p[4])).type === 'IFCCLOTHOID') {
    requireValue(Math.abs(start.value) + Math.abs(length.value) <= 100000);
  }
  requireValue([null, 'IFCLENGTHMEASURE', 'IFCNONNEGATIVELENGTHMEASURE', 'IFCPARAMETERVALUE'].includes(start.type));
  requireValue([null, 'IFCLENGTHMEASURE', 'IFCNONNEGATIVELENGTHMEASURE', 'IFCPARAMETERVALUE'].includes(length.type));
  const parent = entity(index, parseRef(p[4])), pp = splitParams(parent.params);
  requireValue(['IFCLINE', 'IFCCIRCLE', ...(vertical ? [] : ['IFCCLOTHOID'])].includes(parent.type));
  if (parent.type === 'IFCLINE') {
    vector(index, pp[0], 'IFCCARTESIANPOINT', [2]);
    const vp = splitParams(entity(index, parseRef(pp[1]), 'IFCVECTOR').params);
    requireValue(Math.hypot(...vector(index, vp[0], 'IFCDIRECTION', [2])) > EPS && number(vp[1]) > EPS);
  } else {
    placement2D(index, pp[0]);
    requireValue(parent.type === 'IFCCIRCLE' ? number(pp[1]) > EPS : Math.abs(number(pp[1])) > EPS);
  }
  // Vertical evaluator interprets length as a length, not circle radians.
  if (vertical) {
    requireValue(start.type !== 'IFCPARAMETERVALUE' && length.type !== 'IFCPARAMETERVALUE');
  }
  return { p, pos, length: length.value };
}

function segmentCurve(index, id) {
  // Reuse the analytic segment anchoring without exporting private helpers.
  const wrapper = { byExpressId: ref => ref === -1 ? { type: 'IFCCOMPOSITECURVE', params: `(#${id}),.F.` } : index.byExpressId(ref) };
  const ce = evaluateCurve(wrapper, -1);
  requireValue(ce && ce.length > EPS);
  return ce;
}

function alignmentCurve(index, id) {
  const e = entity(index, id), p = splitParams(e.params);
  requireValue(e.type === 'IFCCOMPOSITECURVE' || e.type === 'IFCGRADIENTCURVE');
  const gradient = e.type === 'IFCGRADIENTCURVE';
  const base = gradient ? entity(index, parseRef(p[2]), 'IFCCOMPOSITECURVE') : e;
  const bp = splitParams(base.params);
  requireValue(bp[1] !== '.T.' && p[1] !== '.T.');
  const breaks = [0];
  let previous = null, total = 0;
  for (const sid of refs(bp[0])) {
    const s = segmentData(index, sid);
    if (Math.abs(s.length) < EPS) {
      continue;
    }
    const single = segmentCurve(index, sid);
    const start = single.evalAt(0), end = single.evalAt(single.length);
    if (previous) {
      requireValue(Math.hypot(...start.point.map((v, k) => v - previous.point[k])) < Math.max(1e-6, total * 1e-8));
      requireValue(Math.cos(start.azimuth - previous.azimuth) > 1 - 1e-9);
    }
    total += single.length;
    breaks.push(total);
    previous = end;
  }
  requireValue(total > EPS);
  const vertical = [];
  requireValue(!gradient || optional(p[3])); // explicit end placement not interpreted
  if (gradient) {
    for (const sid of refs(p[0])) {
      const s = segmentData(index, sid, true);
      if (Math.abs(s.length) < EPS) {
        continue;
      }
      requireValue(s.pos.direction[0] > EPS);
      const single = segmentCurve(index, sid);
      const start = single.evalAt(0), end = single.evalAt(single.length);
      // A vertical curve is a monotonic graph z(horizontal distance).
      requireValue(end.point[0] > start.point[0] + EPS);
      for (let i = 0; i <= 8; i++) {
        requireValue(Math.cos(single.evalAt(single.length * i / 8).azimuth) > EPS);
      }
      const prev = vertical[vertical.length - 1];
      if (prev) {
        requireValue(Math.hypot(start.point[0] - prev.end.point[0], start.point[1] - prev.end.point[1]) < Math.max(1e-6, total * 1e-8));
        requireValue(Math.cos(start.azimuth - prev.end.azimuth) > 1 - 1e-9);
      }
      vertical.push({ single, start, end });
      breaks.push(start.point[0]);
    }
    requireValue(vertical.length > 0);
  }
  const ce = evaluateCurve(index, gradient ? parseRef(p[2]) : id);
  requireValue(ce);
  return { length: ce.length, breaks, gradient, at: d => {
    const r = ce.evalAt(d);
    let slope = 0;
    if (gradient) {
      // The shared gradient evaluator clamps missing vertical ranges and uses
      // length*cos(startSlope) for circular ranges. Instead invert x(s) of its
      // analytic 2D segment evaluator, and reject missing coverage explicitly.
      const precision = Math.max(1e-6, total * 1e-8);
      const v = vertical.find(v => d >= v.start.point[0] - precision && d <= v.end.point[0] + precision);
      requireValue(v);
      let lo = 0, hi = v.single.length;
      for (let i = 0; i < 42; i++) {
        const mid = (lo + hi) / 2;
        if (v.single.evalAt(mid).point[0] < d) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const z = v.single.evalAt((lo + hi) / 2);
      r.point[2] = z.point[1];
      slope = Math.tan(z.azimuth);
    }
    return { point: new THREE.Vector3(...r.point), tangent: new THREE.Vector3(Math.cos(r.azimuth), Math.sin(r.azimuth), slope).normalize() };
  } };
}

function list(raw) {
  requireValue(raw?.startsWith('(') && raw.endsWith(')'));
  return splitParams(raw.slice(1, -1));
}
function point3(index, raw, type = 'IFCCARTESIANPOINT') {
  const a = vector(index, raw, type, [2, 3]);
  return new THREE.Vector3(a[0], a[1], a[2] || 0);
}
function unit(v) {
  requireValue(v.length() > EPS);
  return v.normalize();
}
function placement3D(index, raw) {
  if (optional(raw)) {
    return new THREE.Matrix4();
  }
  const p = splitParams(entity(index, parseRef(raw), 'IFCAXIS2PLACEMENT3D').params);
  const o = vector(index, p[0], 'IFCCARTESIANPOINT', [3]);
  const z = unit(optional(p[1]) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(...vector(index, p[1], 'IFCDIRECTION', [3])));
  const x = optional(p[2]) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(...vector(index, p[2], 'IFCDIRECTION', [3]));
  unit(x.addScaledVector(z, -x.dot(z)));
  return new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z).setPosition(...o);
}
function lineCurve(a, b) {
  const delta = b.clone().sub(a), length = delta.length(), t = unit(delta);
  return { length, breaks: [], paramLength: 1, paramAt: u => u * length,
    at: s => ({ point: a.clone().addScaledVector(t, s), tangent: t.clone() }) };
}
function chain(curves) {
  requireValue(curves.length > 0 && curves.length <= 4096);
  let length = 0, paramLength = 0, previous;
  const breaks = [0], entries = [];
  for (const c of curves) {
    requireValue(c.length > EPS && Number.isFinite(c.length));
    const start = c.at(0), end = c.at(c.length);
    if (previous) {
      requireValue(start.point.distanceTo(previous.point) < Math.max(1e-6, length * 1e-8));
      requireValue(start.tangent.dot(previous.tangent) > 1 - 1e-9);
    }
    entries.push({ c, start: length, paramStart: paramLength });
    breaks.push(...c.breaks.map(d => d + length));
    length += c.length; paramLength += c.paramLength;
    breaks.push(length); previous = end;
  }
  return { length, breaks, paramLength,
    paramAt: u => {
      requireValue(Number.isFinite(paramLength) && u >= 0 && u <= paramLength);
      const e = entries.find(e => u <= e.paramStart + e.c.paramLength) || entries[entries.length - 1];
      return e.start + e.c.paramAt(u - e.paramStart);
    },
    at: d => {
      const e = entries.find(e => d < e.start + e.c.length) || entries[entries.length - 1];
      return e.c.at(d - e.start);
    } };
}
function arcCurve(a, b, c) {
  const ab = b.clone().sub(a), ac = c.clone().sub(a), n = new THREE.Vector3().crossVectors(ab, ac);
  requireValue(n.lengthSq() > EPS * EPS * ab.lengthSq() * ac.lengthSq());
  const center = new THREE.Vector3().crossVectors(ac, n).multiplyScalar(ab.lengthSq())
    .add(new THREE.Vector3().crossVectors(n, ab).multiplyScalar(ac.lengthSq()))
    .multiplyScalar(1 / (2 * n.lengthSq())).add(a);
  n.normalize();
  const x = a.clone().sub(center), radius = x.length(); x.normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  const angle = p => {
    const v = p.clone().sub(center); return (Math.atan2(v.dot(y), v.dot(x)) + 2*Math.PI) % (2*Math.PI);
  };
  const end = angle(c); requireValue(angle(b) < end && end > EPS);
  return { length: end * radius, breaks: [], paramLength: NaN,
    at: d => {
      const theta = d / radius;
      return { point: center.clone().addScaledVector(x, radius * Math.cos(theta)).addScaledVector(y, radius * Math.sin(theta)),
        tangent: x.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(y, Math.cos(theta)) };
    } };
}

// A deliberately narrow segmented-reference case with no change to the locus
// or frame. Locations are (horizontal station, elevation deviation, 0), NOT
// Cartesian points on BaseCurve. Require full coverage and an explicit end.
function unmodifiedReferenceCurve(index, p, depth) {
  requireValue(p[1] !== '.T.');
  const base = directrix(index, parseRef(p[2]), depth + 1);
  requireValue(Number.isFinite(base.length) && !base.paramAt);
  const precision = Math.max(1e-6, base.length * 1e-8);
  function station(raw) {
    const e = entity(index, parseRef(raw));
    if (e.type === 'IFCAXIS2PLACEMENT2D') {
      const pos = placement2D(index, raw);
      requireValue(Math.abs(pos.point[1]) < EPS && pos.direction[0] > 1 - EPS);
      return pos.point[0];
    }
    const m = placement3D(index, raw).elements;
    requireValue(Math.abs(m[13]) < EPS && Math.abs(m[14]) < EPS);
    requireValue(m[0] > 1 - EPS && m[5] > 1 - EPS && m[10] > 1 - EPS);
    return m[12];
  }
  const ids = refs(p[0]);
  let end = 0, terminal = false;
  for (let i = 0; i < ids.length; i++) {
    const s = splitParams(entity(index, ids[i], 'IFCCURVESEGMENT').params);
    const start = parseWrappedNum(s[2]), length = parseWrappedNum(s[3]);
    requireValue(start && length && start.type === 'IFCLENGTHMEASURE' && length.type === 'IFCLENGTHMEASURE');
    requireValue(number(s[2]) === 0 && number(s[3]) >= 0);
    requireValue(Math.abs(station(s[1]) - end) < precision);
    const lp = splitParams(entity(index, parseRef(s[4]), 'IFCLINE').params);
    vector(index, lp[0], 'IFCCARTESIANPOINT', [2]);
    const vp = splitParams(entity(index, parseRef(lp[1]), 'IFCVECTOR').params);
    requireValue(Math.hypot(...vector(index, vp[0], 'IFCDIRECTION', [2])) > EPS && number(vp[1]) > EPS);
    if (length.value === 0) {
      requireValue(i === ids.length - 1);
      terminal = true;
    }
    end += length.value;
  }
  requireValue(Math.abs(end - base.length) < precision);
  if (!optional(p[3])) {
    requireValue(Math.abs(station(p[3]) - end) < precision);
  } else {
    requireValue(terminal);
  }
  return base;
}

function directrix(index, id, depth = 0) {
  requireValue(depth < 8);
  const e = entity(index, id), p = splitParams(e.params);
  if (e.type === 'IFCSEGMENTEDREFERENCECURVE') {
    return unmodifiedReferenceCurve(index, p, depth);
  }
  if (e.type === 'IFCLINE') {
    const o = point3(index, p[0]), vp = splitParams(entity(index, parseRef(p[1]), 'IFCVECTOR').params);
    const t = unit(point3(index, vp[0], 'IFCDIRECTION')), mag = number(vp[1]); requireValue(mag > EPS);
    return { length: Infinity, breaks: [], paramAt: u => u * mag,
      at: d => ({ point: o.clone().addScaledVector(t, d), tangent: t.clone() }) };
  }
  if (e.type === 'IFCPOLYLINE') {
    const points = refs(p[0]).map(r => point3(index, `#${r}`));
    return chain(points.slice(1).map((b, i) => lineCurve(points[i], b)));
  }
  if (e.type === 'IFCINDEXEDPOLYCURVE') {
    requireValue(p[2] !== '.T.');
    const pe = entity(index, parseRef(p[0]));
    requireValue(['IFCCARTESIANPOINTLIST2D', 'IFCCARTESIANPOINTLIST3D'].includes(pe.type));
    const dimension = pe.type.endsWith('3D') ? 3 : 2;
    const points = list(splitParams(pe.params)[0]).map(raw => {
      const a = tuple(raw); requireValue(a.length === dimension);
      return new THREE.Vector3(a[0], a[1], a[2] || 0);
    });
    if (optional(p[1])) {
      return chain(points.slice(1).map((b, i) => lineCurve(points[i], b)));
    }
    const curves = []; let last;
    for (const raw of list(p[1])) {
      const m = raw.match(/^IFC(LINE|ARC)INDEX\((\([^()]*\))\)$/); requireValue(m);
      const ids = tuple(m[2]);
      requireValue(ids.length >= 2 && ids.every(i => Number.isInteger(i) && i >= 1 && i <= points.length));
      requireValue(last === undefined || last === ids[0]); last = ids[ids.length - 1];
      const v = ids.map(i => points[i - 1]);
      if (m[1] === 'ARC') {
        requireValue(v.length === 3); curves.push(arcCurve(...v));
      } else {
        curves.push(...v.slice(1).map((b, i) => lineCurve(v[i], b)));
      }
    }
    return chain(curves);
  }
  if (e.type === 'IFCCOMPOSITECURVE' && refs(p[0]).every(r => entity(index, r).type === 'IFCCOMPOSITECURVESEGMENT')) {
    requireValue(p[1] !== '.T.');
    return chain(refs(p[0]).map(r => {
      const s = splitParams(entity(index, r).params);
      requireValue(['.T.', '.F.'].includes(s[1]));
      const c = directrix(index, parseRef(s[2]), depth + 1);
      if (s[1] === '.T.') {
        return c;
      }
      return { ...c, breaks: c.breaks.map(d => c.length - d),
        paramAt: u => c.length - c.paramAt(c.paramLength - u),
        at: d => {
          const v = c.at(c.length - d); v.tangent.negate(); return v;
        } };
    }));
  }
  requireValue(e.type === 'IFCCOMPOSITECURVE' || e.type === 'IFCGRADIENTCURVE');
  return alignmentCurve(index, id);
}

// Convert real 3D arc length to the gradient's horizontal station. The analytic
// tangent supplies ds/du; adaptive Simpson integration avoids chord-length bias.
function gradientLengthToStation(ce, target) {
  const speed = d => {
    const t = ce.at(d).tangent; return 1 / Math.hypot(t.x, t.y);
  };
  function integral(a, b, depth = 0) {
    const m = (a + b) / 2, fa = speed(a), fm = speed(m), fb = speed(b);
    const coarse = (b-a) * (fa + 4*fm + fb) / 6;
    const fine = (b-a) * (fa + 4*speed((a+m)/2) + 2*fm + 4*speed((m+b)/2) + fb) / 12;
    if (Math.abs(fine-coarse) < 1e-9 * Math.max(1, b-a)) {
      return fine;
    }
    requireValue(depth < 14);
    return integral(a, m, depth+1) + integral(m, b, depth+1);
  }
  const cuts = [...new Set([0, ...ce.breaks.filter(d => d > 0 && d < ce.length), ce.length])].sort((a,b) => a-b);
  let length = 0;
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i-1], b = cuts[i], span = integral(a,b);
    if (target <= length + span + EPS) {
      let lo = a, hi = b;
      for (let j = 0; j < 40; j++) {
        const m = (lo + hi) / 2;
        if (length + integral(a,m) < target) {
          lo = m;
        } else {
          hi = m;
        }
      }
      return (lo + hi) / 2;
    }
    length += span;
  }
  fail();
}
function trim(raw, ce, end) {
  if (optional(raw)) {
    requireValue(Number.isFinite(ce.length)); return end ? ce.length : 0;
  }
  const w = parseWrappedNum(raw);
  requireValue(w && Number.isFinite(w.value));
  number(raw);
  let d;
  if (['IFCLENGTHMEASURE', 'IFCNONNEGATIVELENGTHMEASURE'].includes(w.type)) {
    requireValue(w.value >= 0 || !Number.isFinite(ce.length));
    d = ce.gradient ? gradientLengthToStation(ce, w.value) : w.value;
  } else {
    requireValue((w.type === null || w.type === 'IFCPARAMETERVALUE') && ce.paramAt);
    d = ce.paramAt(w.value);
  }
  requireValue(Number.isFinite(d) && (!Number.isFinite(ce.length) || (d >= 0 && d <= ce.length + EPS)));
  return d;
}
function cap(rings) {
  const triangles = THREE.ShapeUtils.triangulateShape(rings[0].map(p => new THREE.Vector2(...p)), rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p))));
  const points = rings.flat(), area = rings.reduce((a, r) => a + signedArea(r), 0);
  const covered = triangles.reduce((a, t) => a + Math.abs(signedArea(t.map(i => points[i]))), 0);
  requireValue(area > EPS && Math.abs(covered - area) <= Math.max(EPS, area * 1e-7));
  return triangles;
}

/** @returns {THREE.BufferGeometry|null} Invalid/unsupported input never throws. */
export function fixedReferenceSweptAreaSolidToGeometry(entityIndex, expressId) {
  try {
    const p = splitParams(entity(entityIndex, expressId, 'IFCFIXEDREFERENCESWEPTAREASOLID').params);
    requireValue(p.length === 6);
    const pr = profile(entityIndex, parseRef(p[0])), flat = pr.rings.flat();
    const matrix = placement3D(entityIndex, p[1]), ce = directrix(entityIndex, parseRef(p[2]));
    const fixed = unit(new THREE.Vector3(...vector(entityIndex, p[5], 'IFCDIRECTION', [3])));
    const start = trim(p[3], ce, false), end = trim(p[4], ce, true);
    requireValue(end > start + EPS);
    const tolerance = Math.max(1e-7, Math.max(...flat.map(p => Math.hypot(...p))) * 1e-3);
    const ringSize = flat.length, rings = [];
    function ringAt(d) {
      const { point, tangent } = ce.at(d);
      const x = unit(fixed.clone().addScaledVector(tangent, -fixed.dot(tangent)));
      const y = new THREE.Vector3().crossVectors(tangent, x);
      return flat.map(([a,b]) => point.clone().addScaledVector(x,a).addScaledVector(y,b).applyMatrix4(matrix));
    }
    function append(r) {
      requireValue((rings.length+1) * ringSize <= MAX_VERTICES && r.every(v => v.toArray().every(Number.isFinite)));
      rings.push(r);
    }
    function subdivide(a,b,ra,rb,depth) {
      const probes = [0.25,0.5,0.75].map(t => [t,ringAt(a+(b-a)*t)]);
      const error = Math.max(...probes.map(([t,r]) => Math.max(...r.map((v,i) => v.distanceTo(ra[i].clone().lerp(rb[i],t))))));
      if (error > tolerance) {
        requireValue(depth < 14);
        const m = (a+b)/2, rm = probes[1][1];
        subdivide(a,m,ra,rm,depth+1); subdivide(m,b,rm,rb,depth+1);
      } else {
        append(rb);
      }
    }
    const cuts = [start];
    for (const d of ce.breaks.slice().sort((a,b) => a-b)) {
      if (d > cuts[cuts.length-1] + Math.max(EPS,(end-start)*1e-8) && d < end - EPS) {
        cuts.push(d);
      }
    }
    cuts.push(end); append(ringAt(start));
    for (let i=1;i<cuts.length;i++) {
      subdivide(cuts[i-1],cuts[i],rings[rings.length-1],ringAt(cuts[i]),0);
    }
    const indices = [];
    for (let i=1;i<rings.length;i++) {
      let offset = 0;
      for (const r of pr.rings) {
        for (let j=0;j<r.length;j++) {
          const a=(i-1)*ringSize+offset+j, b=(i-1)*ringSize+offset+(j+1)%r.length;
          indices.push(a,b,b+ringSize,a,b+ringSize,a+ringSize);
        }
        offset += r.length;
      }
    }
    const last = (rings.length-1)*ringSize;
    for (const [a,b,c] of cap(pr.rings)) {
      indices.push(c,b,a,last+a,last+b,last+c);
    }
    const origin = rings[0][0].clone(), delta = new THREE.Vector3();
    for (const r of rings) {
      for (const v of r) {
        delta.add(v.clone().sub(origin));
      }
    }
    origin.addScaledVector(delta,1/(rings.length*ringSize));
    const positions = new Float32Array(rings.length*ringSize*3); let cursor=0;
    for (const r of rings) {
      for (const v of r) {
        for (const value of v.clone().sub(origin).toArray()) {
          positions[cursor++]=value;
        }
      }
    }
    requireValue(positions.every(Number.isFinite));
    const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
    for (let i=0;i<indices.length;i+=3) {
      a.fromArray(positions,3*indices[i]); b.fromArray(positions,3*indices[i+1]).sub(a); c.fromArray(positions,3*indices[i+2]).sub(a);
      requireValue(b.cross(c).lengthSq()>0);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3)); g.setIndex(indices);
    g.computeVertexNormals(); g.computeBoundingBox(); g.userData.localOrigin=origin.toArray();
    g.userData.fixedReferenceSweep={ approximation:'adaptive linear loft', chordTolerance:tolerance, startStation:start, endStation:end };
    return g;
  } catch {
    return null;
  }
}

/** IFC4x3 TIN adds Flags after the five inherited face-set attributes. */
export function triangulatedIrregularNetworkToGeometry(entityIndex, expressId) {
  let geometry;
  try {
    const e = entity(entityIndex, expressId, 'IFCTRIANGULATEDIRREGULARNETWORK');
    const p = splitParams(e.params);
    requireValue(p.length === 6 && p[2] === '.F.');
    const cp = splitParams(entity(entityIndex, parseRef(p[0]), 'IFCCARTESIANPOINTLIST3D').params);
    const points = list(cp[0]).map(tuple);
    requireValue(points.length >= 3 && points.every(p => p.length === 3));
    const triangles = list(p[3]).map(tuple), flags = tuple(p[5]);
    requireValue(triangles.length > 0 && flags.length === triangles.length && flags.every(Number.isInteger));
    const mapping = optional(p[4]) ? null : tuple(p[4]);
    requireValue(!mapping || mapping.every(i => Number.isInteger(i) && i >= 1 && i <= points.length));
    const visible = [];
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      requireValue(t.length === 3 && t.every(j => Number.isInteger(j) && j >= 1 && j <= (mapping ? mapping.length : points.length)));
      if (flags[i] < 0) {
        continue;
      }
      const mapped = t.map(j => mapping ? mapping[j - 1] : j);
      const [a, b, c] = mapped.map(j => new THREE.Vector3(...points[j - 1]));
      requireValue(b.sub(a).cross(c.sub(a)).lengthSq() > 0);
      visible.push(mapped);
    }
    requireValue(visible.length > 0);
    // Compact coordinates so invisible faces cannot enlarge the bbox. Resolve
    // PnIndex here: the shared converter assumes direct coordinate indices.
    const used = [...new Set(visible.flat())];
    const remap = new Map(used.map((v, i) => [v, i + 1]));
    let coordId = expressId + 1;
    while (entityIndex.byExpressId(coordId)) {
      coordId++;
    }
    const adapted = { ...e, type: 'IFCTRIANGULATEDFACESET',
      params: `#${coordId},$,.F.,(${visible.map(t => `(${t.map(j => remap.get(j)).join(',')})`).join(',')}),$` };
    const coords = { type: 'IFCCARTESIANPOINTLIST3D',
      params: `(${used.map(i => `(${points[i - 1].join(',')})`).join(',')})` };
    const wrapper = { byExpressId: id => id === expressId ? adapted
      : id === coordId ? coords : entityIndex.byExpressId(id) };
    geometry = triangulatedFaceSetToGeometry(wrapper, expressId);
    requireValue(geometry && geometry.attributes.position.array.every(Number.isFinite));
    // The shared converter welds at 1e-4 model units. Reject triangles which
    // collapse under that tolerance instead of returning a degenerate mesh.
    const pos = geometry.attributes.position, ix = geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < ix.count; i += 3) {
      a.fromBufferAttribute(pos, ix.getX(i));
      b.fromBufferAttribute(pos, ix.getX(i + 1)).sub(a);
      c.fromBufferAttribute(pos, ix.getX(i + 2)).sub(a);
      requireValue(b.cross(c).lengthSq() > 0);
    }
    geometry.computeBoundingBox();
    return geometry;
  } catch {
    geometry?.dispose();
    return null;
  }
}
