// Walks IFC Representation tree → dispatches geometry items by type → assembles
// per-entity result with world matrix.

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { resolvePlacement } from './placement.js';
import { triangulatedFaceSetToGeometry, facetedBrepToGeometry } from './mesh-types.js';
import { parseRef, parseRefList } from './step-helpers.js';

/**
 * Dispatch a single geometry item entity (by ID) to the appropriate parser.
 * @returns {THREE.BufferGeometry | null}
 */
function buildGeometryItem(entityIndex, itemExpressId) {
  const entity = entityIndex.byExpressId(itemExpressId);
  if (!entity) return null;
  switch (entity.type) {
    case 'IFCTRIANGULATEDFACESET':
      return triangulatedFaceSetToGeometry(entityIndex, itemExpressId);
    case 'IFCFACETEDBREP':
      return facetedBrepToGeometry(entityIndex, itemExpressId);
    // Phase 6+: IFCEXTRUDEDAREASOLID, IFCREVOLVEDAREASOLID, IFCBOOLEANRESULT,
    //          IFCSWEPTDISKSOLID, IFCSHELLBASEDSURFACEMODEL, etc.
    default:
      return null;
  }
}

/**
 * Build geometry for a single IFC product entity (IfcMember, IfcWall, IfcSlab, etc.).
 *
 * Returns null only if the entity has no Representation. If Representation
 * exists but contains only unsupported geometry types, returns
 * { matrix, items: [] }.
 *
 * IfcProduct attribute order: GlobalId(0), OwnerHistory(1), Name(2), Description(3),
 *                              ObjectType(4), ObjectPlacement(5), Representation(6), Tag(7), ...
 *
 * @param {EntityIndex} entityIndex
 * @param {number} productExpressId
 * @returns {{ matrix: THREE.Matrix4, items: Array<{ bufferGeometry: THREE.BufferGeometry, bbox: THREE.Box3 }> } | null}
 */
export function buildEntityGeometry(entityIndex, productExpressId) {
  const entity = entityIndex.byExpressId(productExpressId);
  if (!entity) return null;

  const parts = splitParams(entity.params);
  const placementId = parseRef(parts[5]);
  const representationId = parseRef(parts[6]);
  if (!representationId) return null;

  const repShape = entityIndex.byExpressId(representationId);
  if (!repShape || repShape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;
  const repShapeParts = splitParams(repShape.params);
  // IFCPRODUCTDEFINITIONSHAPE(Name, Description, Representations) — Representations at index 2
  const shapeRepRefs = parseRefList(repShapeParts[2]);

  const items = [];
  for (const shapeRepRef of shapeRepRefs) {
    const shapeRep = entityIndex.byExpressId(shapeRepRef);
    if (!shapeRep || shapeRep.type !== 'IFCSHAPEREPRESENTATION') continue;
    // IFCSHAPEREPRESENTATION(ContextOfItems, RepresentationIdentifier, RepresentationType, Items)
    const sParts = splitParams(shapeRep.params);
    const itemRefs = parseRefList(sParts[3]);
    for (const itemRef of itemRefs) {
      const bufferGeometry = buildGeometryItem(entityIndex, itemRef);
      if (!bufferGeometry) continue;
      bufferGeometry.computeBoundingBox();
      // styleIndex (built by engine.loadIfc once per model) maps geometry item
      // expressId → hex color from IfcStyledItem chain. Color is undefined when
      // no style exists; viewer-core falls back to per-type default.
      const color = entityIndex._styleIndex?.get(itemRef);
      items.push({ bufferGeometry, bbox: bufferGeometry.boundingBox, color });
    }
  }

  const matrix = placementId ? resolvePlacement(entityIndex, placementId) : new THREE.Matrix4();
  return { matrix, items };
}
