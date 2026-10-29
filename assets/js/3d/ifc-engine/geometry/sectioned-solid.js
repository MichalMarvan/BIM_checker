/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parseWrappedNum } from './step-helpers.js';
import { evaluateCurve } from '../alignment/curve-evaluator.js';

/* Specification and intentionally limited implementation:
 * https://github.com/buildingSMART/IFC4.3.x-development/blob/master/docs/schemas/resource/IfcGeometricModelResource/Entities/IfcSectionedSolidHorizontal.md
 * https://github.com/buildingSMART/IFC4.3.x-development/blob/master/reference_schemas/IFC4x3_RC1.exp
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcgeometryresource/lexical/ifcdistanceexpression.htm
 * RC1: DistanceExpression, FixedAxisVertical; lateral = left, vertical offset
 * is GLOBAL Z, AlongHorizontal false/unset means 3D distance. FixedAxisVertical
 * controls the PROFILE Y axis, independently of the vertical offset.
 * ADD2: Axis2PlacementLinear -> PointByDistanceExpression (no fourth attribute).
 * Published ADD2 profile-X prose conflicts with its own example. We explicitly
 * follow the correction Axis x RefDirection in buildingSMART PR #1163:
 * https://github.com/buildingSMART/IFC4.x-development/pull/1163
 * Default Axis is tangent-perpendicular upwards (issue #1151); only omitted
 * Axis/RefDirection are currently accepted. This interpretation is recorded
 * in userData.sectionedSolid; it must not be reported as exact IFC conformance.
 * Nonzero ADD2 vertical offsets are rejected while their semantics are disputed:
 * https://github.com/buildingSMART/IFC4.x-development/issues/1151
 * NoLongitudinalOffsets prohibits ANY supplied longitudinal offset, even zero.
 * No resampling/matching of differently sized or tagged profiles: return null.
 * Unsupported curves, non-tangent joins, explicit linear axes, profile curves
 * other than line polygons, and 3D-distance RC1 gradient stations return null.
 */

const EPS = 1e-9;
const MAX_VERTICES = 250000;
const optional = s => s === '$' || s === undefined;
const fail = () => {
    throw new Error('Unsupported or invalid sectioned solid');
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
    const inner = raw.replace(/^IFC(?:NONNEGATIVE|POSITIVE)?LENGTHMEASURE\((.*)\)$/, '$1');
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
function profile(index, id) {
    const e = entity(index, id), p = splitParams(e.params);
    requireValue(p[0] === '.AREA.');
    let rings;
    if (e.type === 'IFCARBITRARYCLOSEDPROFILEDEF' || e.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
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
    requireValue(start && length);
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

function curve(index, id) {
    const e = entity(index, id), p = splitParams(e.params);
    if (e.type === 'IFCLINE' || e.type === 'IFCPOLYLINE') {
        let origin, tangent, length = Infinity;
        if (e.type === 'IFCLINE') {
            origin = vector(index, p[0], 'IFCCARTESIANPOINT', [2, 3]);
            const vp = splitParams(entity(index, parseRef(p[1]), 'IFCVECTOR').params);
            tangent = vector(index, vp[0], 'IFCDIRECTION', [2, 3]);
            requireValue(number(vp[1]) > EPS);
        } else {
            // Straight polyline only; do not invent miters at tangent discontinuities.
            const points = refs(p[0]).map(id => vector(index, `#${id}`, 'IFCCARTESIANPOINT', [2, 3]));
            origin = points[0];
            tangent = [0, 1, 2].map(k => (points[1][k] || 0) - (origin[k] || 0));
            length = 0;
            const unit = new THREE.Vector3(...tangent).normalize();
            for (let i = 1; i < points.length; i++) {
                const d = new THREE.Vector3(...[0, 1, 2].map(k => (points[i][k] || 0) - (points[i - 1][k] || 0)));
                requireValue(d.length() > EPS && d.clone().normalize().dot(unit) > 1 - 1e-10);
                length += d.length();
            }
        }
        const t = new THREE.Vector3(tangent[0], tangent[1], tangent[2] || 0);
        requireValue(t.length() > EPS);
        t.normalize();
        requireValue(Math.hypot(t.x, t.y) > EPS);
        const o = new THREE.Vector3(origin[0], origin[1], origin[2] || 0);
        return { length, breaks: [], gradient: false, horizontalFactor: Math.hypot(t.x, t.y),
            at: d => ({ point: o.clone().addScaledVector(t, d), tangent: t.clone() }) };
    }
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
    return { length: ce.length, breaks, gradient, horizontalFactor: 1, at: d => {
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

function station(index, id, directrix, ce, legacy) {
    let e = entity(index, id), p = splitParams(e.params);
    if (!legacy) {
        requireValue(e.type === 'IFCAXIS2PLACEMENTLINEAR' && p[1] === '$' && p[2] === '$');
        e = entity(index, parseRef(p[0]), 'IFCPOINTBYDISTANCEEXPRESSION');
        p = splitParams(e.params);
        requireValue(parseRef(p[4]) === directrix);
    } else {
        requireValue(e.type === 'IFCDISTANCEEXPRESSION');
    }
    requireValue(p[3] === '$');
    let d = number(p[0]);
    const lateral = number(p[1], 0), vertical = number(p[2], 0);
    if (legacy) {
        requireValue(['.T.', '.F.', '$'].includes(p[4]));
        if (p[4] === '.T.') {
            d /= ce.horizontalFactor;
        } else {
            requireValue(!ce.gradient);
        } // no approximate 3D -> horizontal station inversion
    } else {
        requireValue(vertical === 0);
    }
    requireValue(d >= 0 && d <= ce.length + EPS);
    return { d: Math.min(d, ce.length), lateral, vertical };
}

function cap(rings) {
    const triangles = THREE.ShapeUtils.triangulateShape(rings[0].map(p => new THREE.Vector2(...p)), rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p))));
    const points = rings.flat(), area = rings.reduce((a, r) => a + signedArea(r), 0);
    const covered = triangles.reduce((a, t) => a + Math.abs(signedArea(t.map(i => points[i]))), 0);
    requireValue(area > EPS && Math.abs(covered - area) <= Math.max(EPS, area * 1e-7));
    return triangles;
}

/** IFC sectioned solid in model units; floating origin is reapplied by _itemMatrix.
 * @returns {THREE.BufferGeometry|null} null means unsupported/invalid; never throws.
 */
export function sectionedSolidHorizontalToGeometry(entityIndex, expressId) {
    try {
        const p = splitParams(entity(entityIndex, expressId, 'IFCSECTIONEDSOLIDHORIZONTAL').params);
        requireValue(p.length === 3 || p.length === 4);
        const legacy = p.length === 4, fixed = p[3] === '.T.';
        requireValue(!legacy || ['.T.', '.F.'].includes(p[3]));
        const directrix = parseRef(p[0]), ce = curve(entityIndex, directrix);
        const profiles = refs(p[1]).map(id => profile(entityIndex, id));
        const stations = refs(p[2]).map(id => station(entityIndex, id, directrix, ce, legacy));
        requireValue(profiles.length >= 2 && profiles.length === stations.length);
        const first = profiles[0], sizes = first.rings.map(r => r.length), ringSize = sizes.reduce((a, b) => a + b, 0);
        requireValue(profiles.every(pr => pr.type === first.type && pr.rings.length === sizes.length && pr.rings.every((r, i) => r.length === sizes[i])));
        requireValue(stations.every((s, i) => i === 0 || s.d > stations[i - 1].d + EPS));
        const flattened = profiles.map(pr => pr.rings.flat());
        const extent = Math.max(...flattened.flat().map(p => Math.hypot(...p)));
        const tolerance = Math.max(1e-7, extent * 1e-3);
        const rings = [];
        function ringAt(i, d) {
            const a = stations[i], b = stations[i + 1], t = (d - a.d) / (b.d - a.d);
            const { point, tangent } = ce.at(d);
            const x = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
            const y = fixed ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3().crossVectors(tangent, x).normalize();
            point.addScaledVector(x, a.lateral + t * (b.lateral - a.lateral));
            point.z += a.vertical + t * (b.vertical - a.vertical);
            return flattened[i].map((pa, j) => {
                const pb = flattened[i + 1][j];
                return point.clone().addScaledVector(x, pa[0] + t * (pb[0] - pa[0])).addScaledVector(y, pa[1] + t * (pb[1] - pa[1]));
            });
        }
        function append(r) {
            requireValue((rings.length + 1) * ringSize <= MAX_VERTICES && r.every(v => [v.x, v.y, v.z].every(Number.isFinite)));
            rings.push(r);
        }
        function subdivide(i, a, b, ra, rb, depth) {
            const m = (a + b) / 2, rm = ringAt(i, m);
            // Quarter probes avoid missing symmetric curvature between endpoints.
            const probes = [[0.25, ringAt(i, a + (b - a) / 4)], [0.5, rm], [0.75, ringAt(i, a + 3 * (b - a) / 4)]];
            const error = Math.max(...probes.map(([t, r]) => Math.max(...r.map((v, j) => v.distanceTo(ra[j].clone().lerp(rb[j], t))))));
            if (error > tolerance) {
                requireValue(depth < 14);
                subdivide(i, a, m, ra, rm, depth + 1);
                subdivide(i, m, b, rm, rb, depth + 1);
            } else {
                append(rb);
            }
        }
        append(ringAt(0, stations[0].d));
        for (let i = 0; i < stations.length - 1; i++) {
            const a = stations[i].d, b = stations[i + 1].d;
            // Horizontal/vertical joins exported independently can differ by a few
            // nanometres. Do not create duplicate rings that collapse in Float32.
            const stationTolerance = Math.max(EPS, (b - a) * 1e-8);
            const cuts = [a];
            for (const d of ce.breaks.slice().sort((x, y) => x - y)) {
                if (d > cuts[cuts.length - 1] + stationTolerance && d < b - stationTolerance) {
                    cuts.push(d);
                }
            }
            cuts.push(b);
            for (let j = 1; j < cuts.length; j++) {
                subdivide(i, cuts[j - 1], cuts[j], rings[rings.length - 1], ringAt(i, cuts[j]), 0);
            }
        }
        const indices = [];
        for (let i = 1; i < rings.length; i++) {
            let offset = 0;
            for (const size of sizes) {
                for (let j = 0; j < size; j++) {
                    const a = (i - 1) * ringSize + offset + j, b = (i - 1) * ringSize + offset + (j + 1) % size;
                    indices.push(a, b, b + ringSize, a, b + ringSize, a + ringSize);
                }
                offset += size;
            }
        }
        for (const [a, b, c] of cap(first.rings)) {
            indices.push(c, b, a);
        }
        const end = (rings.length - 1) * ringSize;
        for (const [a, b, c] of cap(profiles[profiles.length - 1].rings)) {
            indices.push(end + a, end + b, end + c);
        }
        // Subtract the double precision centroid BEFORE converting to Float32.
        const origin = rings[0][0].clone(), delta = new THREE.Vector3();
        for (const r of rings) {
            for (const v of r) {
                delta.add(v.clone().sub(origin));
            }
        }
        origin.addScaledVector(delta, 1 / (rings.length * ringSize));
        const positions = new Float32Array(rings.length * ringSize * 3);
        let cursor = 0;
        for (const r of rings) {
            for (const v of r) {
                positions[cursor++] = v.x - origin.x;
                positions[cursor++] = v.y - origin.y;
                positions[cursor++] = v.z - origin.z;
            }
        }
        requireValue(positions.every(Number.isFinite));
        const u = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3();
        for (let i = 0; i < indices.length; i += 3) {
            u.fromArray(positions, 3 * indices[i]);
            v.fromArray(positions, 3 * indices[i + 1]).sub(u);
            w.fromArray(positions, 3 * indices[i + 2]).sub(u);
            requireValue(v.cross(w).lengthSq() > 0);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.userData.localOrigin = origin.toArray();
        geometry.userData.sectionedSolid = { approximation: 'adaptive linear loft', chordTolerance: tolerance,
            placement: legacy ? 'IFC4x3 RC1 FixedAxisVertical' : 'ADD2 default frame; buildingSMART PR #1163 / issue #1151' };
        return geometry;
    } catch {
        return null;
    }
}
