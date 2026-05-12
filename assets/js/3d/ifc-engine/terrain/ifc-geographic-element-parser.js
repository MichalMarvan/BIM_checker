// Phase 6.15.2 — Extract terrain mesh from IFC4.3 IfcGeographicElement
// (or IfcSite when no IfcGeographicElement present and IfcSite has explicit
// terrain geometry, e.g. IfcGeographicElement="TERRAIN" predefined type).
//
// Returns TerrainData (vertices + triangles) in alignment frame (E, N, Z).

import * as THREE from 'three';
import { buildEntityGeometry } from '../geometry/geometry-core.js';

/**
 * Find candidate terrain entities in an entityIndex.
 * Returns array of { expressId, type, name }.
 */
export function findTerrainEntities(entityIndex) {
  const candidates = [];
  // IfcGeographicElement (IFC4.3) — primary
  const geoIds = entityIndex.byType('IFCGEOGRAPHICELEMENT') || new Set();
  for (const id of geoIds) {
    const e = entityIndex.byExpressId(id);
    if (!e) continue;
    candidates.push({ expressId: id, type: 'IFCGEOGRAPHICELEMENT', name: _nameOf(e) });
  }
  // IfcSite — fallback (sites sometimes contain terrain TIN as their representation)
  const siteIds = entityIndex.byType('IFCSITE') || new Set();
  for (const id of siteIds) {
    const e = entityIndex.byExpressId(id);
    if (!e) continue;
    candidates.push({ expressId: id, type: 'IFCSITE', name: _nameOf(e) });
  }
  return candidates;
}

function _nameOf(entity) {
  // IfcRoot params: GlobalId, OwnerHistory, Name, Description
  // Quick parse — name is at parts[2] but we don't need full splitParams here
  const m = entity.params.match(/^[^,]*,[^,]*,'([^']*)'/);
  return m ? m[1] : '';
}

/**
 * Extract terrain mesh from an IFC entity → TerrainData.
 * Walks entity geometry via buildEntityGeometry, collects all triangle positions,
 * applies the placement matrix to vertices.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} expressId
 * @returns {{ name, vertices: Array<{x,y,z}>, triangles: Array<[number,number,number]> } | null}
 */
export function extractTerrainFromIfc(entityIndex, expressId) {
  const geom = buildEntityGeometry(entityIndex, expressId);
  if (!geom || geom.items.length === 0) return null;
  const matrix = geom.matrix || new THREE.Matrix4();

  const vertices = [];
  const triangles = [];
  const dedup = new Map();  // "x,y,z" → index for dedup
  const v3 = new THREE.Vector3();

  for (const item of geom.items) {
    const bg = item.bufferGeometry;
    const posAttr = bg.getAttribute('position');
    const idxAttr = bg.getIndex();
    if (!posAttr) continue;

    // Compute per-mesh remap from local vertex index → global terrain vertex index
    const localToGlobal = new Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      v3.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(matrix);
      const key = `${v3.x.toFixed(4)},${v3.y.toFixed(4)},${v3.z.toFixed(4)}`;
      let gi = dedup.get(key);
      if (gi == null) {
        gi = vertices.length;
        vertices.push({ x: v3.x, y: v3.y, z: v3.z });
        dedup.set(key, gi);
      }
      localToGlobal[i] = gi;
    }

    if (idxAttr) {
      const indices = idxAttr.array;
      for (let i = 0; i + 2 < indices.length; i += 3) {
        triangles.push([localToGlobal[indices[i]], localToGlobal[indices[i + 1]], localToGlobal[indices[i + 2]]]);
      }
    } else {
      // Non-indexed — every 3 verts form a triangle
      for (let i = 0; i + 2 < posAttr.count; i += 3) {
        triangles.push([localToGlobal[i], localToGlobal[i + 1], localToGlobal[i + 2]]);
      }
    }
  }

  if (vertices.length === 0 || triangles.length === 0) return null;
  const e = entityIndex.byExpressId(expressId);
  return { name: _nameOf(e) || `Entity #${expressId}`, vertices, triangles };
}
