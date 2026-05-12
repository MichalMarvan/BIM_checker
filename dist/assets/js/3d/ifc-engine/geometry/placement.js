// IfcLocalPlacement chain → THREE.Matrix4 world transform.
//
// Math reference (ISO 16739 IFC4):
// - IfcAxis2Placement3D(Location, Axis, RefDirection):
//     Location = origin point
//     Axis = local +Z direction (default 0,0,1)
//     RefDirection = local +X reference (default 1,0,0)
//     Local +Y = Axis × RefDirection (gram-schmidt orthonormalized)
//     Local +X = Y × Z (re-derived to ensure orthogonality)
// - IfcLocalPlacement(PlacementRelTo, RelativePlacement):
//     If PlacementRelTo is null → world coords
//     Else → parent.matrix * this.relativeMatrix

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef } from './step-helpers.js';

const _v3 = new THREE.Vector3();  // scratch for math

/**
 * Parse a 3D vector from a stripped STEP coords string.
 * Example input: "(1.0,2.0,3.0)" → [1, 2, 3]
 */
function parseVec3(rawList) {
  const stripped = rawList.replace(/^\(+|\)+$/g, '');
  return stripped.split(',').map(s => parseFloat(s.trim()));
}

/**
 * Resolve an IfcCartesianPoint or IfcDirection entity by ID to a [x,y,z] array.
 */
function resolveVec3(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity) return null;
  return parseVec3(entity.params);
}

/**
 * Build a Matrix4 from an IfcAxis2Placement3D entity.
 */
function placement3DToMatrix(entityIndex, placement3DId) {
  const entity = entityIndex.byExpressId(placement3DId);
  if (!entity || entity.type !== 'IFCAXIS2PLACEMENT3D') {
    return new THREE.Matrix4();
  }
  const parts = splitParams(entity.params);
  const locationId = parseRef(parts[0]);
  const axisId = parseRef(parts[1]);
  const refDirId = parseRef(parts[2]);

  const location = locationId ? resolveVec3(entityIndex, locationId) : [0, 0, 0];
  const axisVec = axisId ? resolveVec3(entityIndex, axisId) : [0, 0, 1];
  const refDirVec = refDirId ? resolveVec3(entityIndex, refDirId) : [1, 0, 0];

  if (!location) return new THREE.Matrix4();

  // Build orthonormal basis: Z = axis, X = refDir (orthogonalized), Y = Z × X
  const zAxis = new THREE.Vector3(axisVec[0], axisVec[1], axisVec[2]).normalize();
  const xRef  = new THREE.Vector3(refDirVec[0], refDirVec[1], refDirVec[2]);
  const xAxis = xRef.clone().sub(_v3.copy(zAxis).multiplyScalar(zAxis.dot(xRef))).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);

  const m = new THREE.Matrix4();
  m.makeBasis(xAxis, yAxis, zAxis);
  m.setPosition(location[0], location[1], location[2]);
  return m;
}

/**
 * Resolve an IfcLocalPlacement chain to a world Matrix4.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} localPlacementId
 * @returns {THREE.Matrix4} — identity if not found, else chain product
 */
export function resolvePlacement(entityIndex, localPlacementId) {
  const entity = entityIndex.byExpressId(localPlacementId);
  if (!entity || entity.type !== 'IFCLOCALPLACEMENT') {
    return new THREE.Matrix4();
  }
  const parts = splitParams(entity.params);
  const parentId = parseRef(parts[0]);
  const placement3DId = parseRef(parts[1]);

  const localMatrix = placement3DId
    ? placement3DToMatrix(entityIndex, placement3DId)
    : new THREE.Matrix4();

  if (!parentId) return localMatrix;
  const parentMatrix = resolvePlacement(entityIndex, parentId);
  return parentMatrix.clone().multiply(localMatrix);
}

