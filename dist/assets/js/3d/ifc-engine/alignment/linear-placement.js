/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// IFC 4.3 IfcLinearPlacement → THREE.Matrix4.
//
// Priorita dle spec: CartesianPosition (předpočítaný absolutní fallback pro
// aplikace bez podpory lineárního umístění) → jinak evaluace BasisCurve přes
// curve-evaluator. Matice je v jednotkách modelu (lengthScale řeší pipeline
// stejně jako u IfcLocalPlacement).
//
// Kruhový import s placement.js je záměrný a bezpečný — obě vazby se
// používají až za běhu uvnitř funkcí (ESM live bindings).

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseWrappedNum } from '../geometry/step-helpers.js';
import { placement3DToMatrix, resolvePlacement } from '../geometry/placement.js';
import { getCurveEval } from './curve-evaluator.js';

const _v = new THREE.Vector3();

function resolveDir3(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e) return null;
  const m = e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const n = m[1].split(',').map(s => parseFloat(s.trim()));
  return n.length >= 2 ? [n[0], n[1], n[2] || 0] : null;
}

/**
 * IfcPointByDistanceExpression(DistanceAlong, OffsetLateral, OffsetVertical,
 * OffsetLongitudinal, BasisCurve) → { position:[x,y,z], azimuth } | null.
 * OffsetLateral kladně VLEVO od směru staničení, OffsetVertical nahoru.
 */
export function evalPointByDistance(entityIndex, pbdeExpressId) {
  const e = entityIndex.byExpressId(pbdeExpressId);
  if (!e || e.type !== 'IFCPOINTBYDISTANCEEXPRESSION') return null;
  const parts = splitParams(e.params);
  const dist = parseWrappedNum(parts[0]);
  const lat = parseWrappedNum(parts[1]);
  const vert = parseWrappedNum(parts[2]);
  const lon = parseWrappedNum(parts[3]);
  const curveId = parseRef(parts[4]);
  if (!dist || !curveId) return null;
  const ce = getCurveEval(entityIndex, curveId);
  if (!ce) return null;
  const d = dist.value + (lon ? lon.value : 0);
  const r = ce.evalAt(d);
  if (!r) return null;
  const az = r.azimuth;
  const p = [
    r.point[0] + (lat ? lat.value * -Math.sin(az) : 0),
    r.point[1] + (lat ? lat.value * Math.cos(az) : 0),
    r.point[2] + (vert ? vert.value : 0),
  ];
  return { position: p, azimuth: az };
}

/**
 * IfcLinearPlacement(PlacementRelTo, RelativePlacement, CartesianPosition)
 * → world Matrix4 | null.
 */
export function resolveLinearPlacement(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e || e.type !== 'IFCLINEARPLACEMENT') return null;
  const parts = splitParams(e.params);
  const parentId = parseRef(parts[0]);
  const cartesianId = parseRef(parts[2]);

  let local = null;
  if (cartesianId) {
    local = placement3DToMatrix(entityIndex, cartesianId);
  } else {
    const rel = entityIndex.byExpressId(parseRef(parts[1]));
    if (!rel || rel.type !== 'IFCAXIS2PLACEMENTLINEAR') return null;
    const rp = splitParams(rel.params);
    const pbde = evalPointByDistance(entityIndex, parseRef(rp[0]));
    if (!pbde) return null;
    const axisId = parseRef(rp[1]);
    const refDirId = parseRef(rp[2]);
    // Default = tečný rámec (Z svisle, X po vodorovné tečně); explicitní osy respektuj.
    const axis = (axisId && resolveDir3(entityIndex, axisId)) || [0, 0, 1];
    const refDir = (refDirId && resolveDir3(entityIndex, refDirId))
      || [Math.cos(pbde.azimuth), Math.sin(pbde.azimuth), 0];
    const z = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
    const xr = new THREE.Vector3(refDir[0], refDir[1], refDir[2]);
    const x = xr.clone().sub(_v.copy(z).multiplyScalar(z.dot(xr))).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    local = new THREE.Matrix4().makeBasis(x, y, z);
    local.setPosition(pbde.position[0], pbde.position[1], pbde.position[2]);
  }

  if (!parentId) return local;
  const parent = resolvePlacement(entityIndex, parentId);
  return parent.clone().multiply(local);
}
