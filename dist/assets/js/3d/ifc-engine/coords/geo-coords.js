// IFC geo-reference extraction:
//   - IfcSite RefLatitude / RefLongitude / RefElevation
//   - IfcMapConversion Eastings/Northings/OrthogonalHeight/Scale/Rotation
//   - IfcProjectedCRS Name/GeodeticDatum/VerticalDatum/MapProjection/MapZone
//   - bboxCenter computed from product entity placements (used for federation)

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { decodeIFCString } from '../parser/ifc-decoder.js';
import { parseRef } from '../geometry/step-helpers.js';
import { resolvePlacement } from '../geometry/placement.js';
import { PRODUCT_TYPES } from '../constants.js';

/**
 * Parse a STEP compound numeric list "(50,4,33,500000)" → [50, 4, 33, 500000].
 */
function parseCompoundList(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  if (!inner) return null;
  const nums = inner.split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));
  return nums.length > 0 ? nums : null;
}

/**
 * Convert IFC compound angle list [d, m, s, us?] → decimal degrees.
 */
function compoundToDecimal(parts) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [d, m, s, us = 0] = parts;
  const sign = d < 0 ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + s / 3600 + us / 3.6e9);
}

/**
 * Strip outer single quotes from a STEP string param.
 */
function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^'(.*)'$/s);
  return m ? decodeIFCString(m[1]) : null;
}

/**
 * Parse a STEP scalar number "1.5" → 1.5, "$" → null.
 */
function parseNum(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

/**
 * Extract IfcSite coords (parts[9]=RefLat, [10]=RefLon, [11]=RefElevation).
 */
function extractSiteCoords(entityIndex) {
  const sites = entityIndex.byType('IfcSite');
  if (sites.length === 0) return { refLat: null, refLon: null, refElevation: null };
  const site = sites[0];
  const parts = splitParams(site.params);
  return {
    refLat: compoundToDecimal(parseCompoundList(parts[9])),
    refLon: compoundToDecimal(parseCompoundList(parts[10])),
    refElevation: parseNum(parts[11]),
  };
}

/**
 * Extract IfcMapConversion (parts[2]=Eastings, [3]=Northings, [4]=OrthogonalHeight,
 * [5]=XAxisAbscissa, [6]=XAxisOrdinate, [7]=Scale).
 */
function extractMapConversion(entityIndex) {
  const convs = entityIndex.byType('IfcMapConversion');
  if (convs.length === 0) return null;
  const c = convs[0];
  const parts = splitParams(c.params);
  const eastings = parseNum(parts[2]);
  const northings = parseNum(parts[3]);
  const orthogonalHeight = parseNum(parts[4]);
  const xAxisAbscissa = parseNum(parts[5]);
  const xAxisOrdinate = parseNum(parts[6]);
  const scale = parseNum(parts[7]) ?? 1;
  let rotationDeg = null;
  if (xAxisAbscissa !== null && xAxisOrdinate !== null) {
    rotationDeg = Math.atan2(xAxisOrdinate, xAxisAbscissa) * 180 / Math.PI;
  }
  return { eastings, northings, orthogonalHeight, scale, rotationDeg };
}

/**
 * Extract IfcProjectedCRS (parts[0]=Name, [2]=GeodeticDatum, [3]=VerticalDatum,
 * [4]=MapProjection, [5]=MapZone).
 */
function extractProjectedCRS(entityIndex) {
  const crs = entityIndex.byType('IfcProjectedCRS');
  if (crs.length === 0) return null;
  const c = crs[0];
  const parts = splitParams(c.params);
  return {
    name: unquoteString(parts[0]),
    datum: unquoteString(parts[2]),
    verticalDatum: unquoteString(parts[3]),
    projection: unquoteString(parts[4]),
    zone: unquoteString(parts[5]),
  };
}

/**
 * Compute bbox center from product entity placements.
 * Returns [cx, cy, cz] or null if no products with placements.
 */
function computeBboxCenter(entityIndex) {
  const positions = [];
  for (const t of entityIndex.types()) {
    if (!PRODUCT_TYPES.has(t)) continue;
    for (const entity of entityIndex.byType(t)) {
      const parts = splitParams(entity.params);
      const placementId = parseRef(parts[5]);
      if (!placementId) continue;
      const matrix = resolvePlacement(entityIndex, placementId);
      const pos = new THREE.Vector3();
      pos.setFromMatrixPosition(matrix);
      positions.push([pos.x, pos.y, pos.z]);
    }
  }
  if (positions.length === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

/**
 * Extract all geo-coords data from a parsed IFC.
 * @param {EntityIndex} entityIndex
 * @returns {{ refLat, refLon, refElevation, mapConversion, projectedCRS, bboxCenter }}
 */
export function extractCoords(entityIndex) {
  const site = extractSiteCoords(entityIndex);
  return {
    refLat: site.refLat,
    refLon: site.refLon,
    refElevation: site.refElevation,
    mapConversion: extractMapConversion(entityIndex),
    projectedCRS: extractProjectedCRS(entityIndex),
    bboxCenter: computeBboxCenter(entityIndex),
  };
}
