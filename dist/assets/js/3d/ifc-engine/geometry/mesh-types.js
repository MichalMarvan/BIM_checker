// IfcTriangulatedFaceSet + IfcFacetedBrep → THREE.BufferGeometry.
// Phase 1: only mesh-style geometry. ExtrudedAreaSolid + boolean come later.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parsePointList } from './step-helpers.js';

/**
 * Parse a list of integer triplets from STEP params:
 *   "((1,3,2),(1,4,3),...)" → [[1,3,2],[1,4,3],...]
 */
function parseIntTripleList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseInt(s.trim(), 10)));
}

/**
 * Convert IfcTriangulatedFaceSet → THREE.BufferGeometry.
 *
 * IFC4: IFCTRIANGULATEDFACESET(Coordinates, Closed, Normals, CoordIndex, PnIndex)
 * - Coordinates → IfcCartesianPointList3D (list of points)
 * - CoordIndex → triangle indices, 1-based per STEP, converted to 0-based
 * - Normals/PnIndex ignored — we use computeVertexNormals()
 *
 * @returns {THREE.BufferGeometry | null}
 */
export function triangulatedFaceSetToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCTRIANGULATEDFACESET') return null;

  const parts = splitParams(entity.params);
  const coordRef = parseRef(parts[0]);
  if (!coordRef) return null;

  // Coordinates: IfcCartesianPointList3D — single attribute is the list of points
  const coordEntity = entityIndex.byExpressId(coordRef);
  if (!coordEntity || coordEntity.type !== 'IFCCARTESIANPOINTLIST3D') return null;
  const coordParts = splitParams(coordEntity.params);
  const points = parsePointList(coordParts[0]);

  // CoordIndex (parts[3]) → list of triangle (i,j,k) tuples, 1-based STEP indices
  if (!parts[3] || parts[3] === '$') return null;
  const triangles = parseIntTripleList(parts[3]);

  // Build BufferGeometry
  const positionArr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positionArr[i * 3] = points[i][0];
    positionArr[i * 3 + 1] = points[i][1];
    positionArr[i * 3 + 2] = points[i][2];
  }

  const indexArr = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    // STEP indices are 1-based → subtract 1 for 0-based BufferAttribute
    indexArr[i * 3]     = triangles[i][0] - 1;
    indexArr[i * 3 + 1] = triangles[i][1] - 1;
    indexArr[i * 3 + 2] = triangles[i][2] - 1;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positionArr, 3));
  geom.setIndex(new THREE.BufferAttribute(indexArr, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Convert IfcFacetedBrep → THREE.BufferGeometry.
 *
 * IFC4: IFCFACETEDBREP(Outer) → IFCCLOSEDSHELL → IFCFACE → IFCFACEOUTERBOUND
 *       → IFCPOLYLOOP → IFCCARTESIANPOINT
 *
 * Each face is fan-triangulated (works for convex polygons, which IFC requires).
 * Vertices are NOT deduplicated across faces — each face gets fresh verts so
 * face normals stay sharp after computeVertexNormals().
 *
 * @returns {THREE.BufferGeometry | null}
 */
export function facetedBrepToGeometry(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity || entity.type !== 'IFCFACETEDBREP') return null;

  const parts = splitParams(entity.params);
  const shellRef = parseRef(parts[0]);
  if (!shellRef) return null;

  const shell = entityIndex.byExpressId(shellRef);
  if (!shell || shell.type !== 'IFCCLOSEDSHELL') return null;

  const shellParts = splitParams(shell.params);
  const faceRefs = parseRefList(shellParts[0]);

  const positions = [];
  const indices = [];

  for (const faceRef of faceRefs) {
    const face = entityIndex.byExpressId(faceRef);
    if (!face) continue;

    const faceParts = splitParams(face.params);
    const boundRefs = parseRefList(faceParts[0]);

    for (const boundRef of boundRefs) {
      const bound = entityIndex.byExpressId(boundRef);
      if (!bound) continue;
      // IFCFACEBOUND and IFCFACEOUTERBOUND both have (Bound, Orientation)
      const boundParts = splitParams(bound.params);
      const loopRef = parseRef(boundParts[0]);
      const loop = entityIndex.byExpressId(loopRef);
      if (!loop || loop.type !== 'IFCPOLYLOOP') continue;

      const loopParts = splitParams(loop.params);
      const pointRefs = parseRefList(loopParts[0]);

      // Resolve each point to [x,y,z]
      // IFCCARTESIANPOINT params look like "(0.0,1.0,2.0)" — parse coords directly
      const polygon = [];
      for (const ptRef of pointRefs) {
        const pt = entityIndex.byExpressId(ptRef);
        if (!pt || pt.type !== 'IFCCARTESIANPOINT') continue;
        const inner = pt.params.replace(/^\(/, '').replace(/\)$/, '');
        const coords = inner.split(',').map(s => parseFloat(s.trim()));
        if (coords.length === 3) polygon.push(coords);
      }

      if (polygon.length < 3) continue;

      // Fan-triangulate the polygon
      const baseIndex = positions.length / 3;
      for (const v of polygon) {
        positions.push(v[0], v[1], v[2]);
      }
      for (let i = 1; i < polygon.length - 1; i++) {
        indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
      }
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.computeVertexNormals();
  return geom;
}

