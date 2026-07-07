// Walks IFC Representation tree → dispatches geometry items by type → assembles
// per-entity result with world matrix.
//
// Dispatched geometry types (Phase 2):
//   - IFCTRIANGULATEDFACESET (Revit, IFC4 face sets)
//   - IFCFACETEDBREP (Tekla)
//   - IFCSHELLBASEDSURFACEMODEL (Civil 3D)
//   - IFCPOLYGONALFACESET (modern n-gon face set)
//   - IFCEXTRUDEDAREASOLID (Revit + Tekla — extruded profiles)
//
// Container types unwrapped during traversal:
//   - IFCMAPPEDITEM (instance reference with transform)
//   - IFCBOOLEANRESULT / IFCBOOLEANCLIPPINGRESULT (CSG — Phase 2 stub:
//     uses FirstOperand only, ignores SecondOperand subtraction)

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { resolvePlacement } from './placement.js';
import {
  triangulatedFaceSetToGeometry,
  facetedBrepToGeometry,
  shellBasedSurfaceModelToGeometry,
  polygonalFaceSetToGeometry,
  extrudedAreaSolidToGeometry,
  revolvedAreaSolidToGeometry,
  sweptDiskSolidToGeometry,
  resolveMappedItem,
  tryExtrudedDifference2D,
} from './mesh-types.js';
import { parseRef, parseRefList } from './step-helpers.js';

/**
 * Build BufferGeometry for a single leaf geometry entity (no container types).
 *
 * `useCache` — set on the IfcMappedItem path: Revit/Tekla exports instance the
 * same IfcRepresentationMap thousands of times (furniture, fixtures, bolts),
 * and re-triangulating + re-welding the source per instance dominated load
 * time on large files. The first build is stored on the index and returned
 * as-is; later hits return a clone (own typed arrays, so downstream matrix
 * bakes can't corrupt siblings). index.js drops the cache after compact().
 *
 * @returns {THREE.BufferGeometry | null}
 */
function buildLeafGeometry(entityIndex, itemExpressId, useCache = false) {
  if (useCache) {
    let cache = entityIndex._leafGeomCache;
    if (!cache) cache = entityIndex._leafGeomCache = new Map();
    if (cache.has(itemExpressId)) {
      const cached = cache.get(itemExpressId);
      if (!cached) return null;
      // Merged pipeline only reads leaf buffers (bakes copies), so instances
      // can share one geometry. The legacy per-mesh path bakes matrices INTO
      // the buffers later — there every instance needs its own copy.
      return entityIndex._shareLeafGeometry ? cached : cached.clone();
    }
    const geom = buildLeafGeometryUncached(entityIndex, itemExpressId);
    if (geom) geom.userData.leafId = itemExpressId;
    cache.set(itemExpressId, geom);
    return geom;
  }
  return buildLeafGeometryUncached(entityIndex, itemExpressId);
}

function buildLeafGeometryUncached(entityIndex, itemExpressId) {
  const entity = entityIndex.byExpressId(itemExpressId);
  if (!entity) return null;
  switch (entity.type) {
    case 'IFCTRIANGULATEDFACESET':
      return triangulatedFaceSetToGeometry(entityIndex, itemExpressId);
    case 'IFCFACETEDBREP':
      return facetedBrepToGeometry(entityIndex, itemExpressId);
    case 'IFCSHELLBASEDSURFACEMODEL':
      return shellBasedSurfaceModelToGeometry(entityIndex, itemExpressId);
    case 'IFCPOLYGONALFACESET':
      return polygonalFaceSetToGeometry(entityIndex, itemExpressId);
    case 'IFCEXTRUDEDAREASOLID':
      return extrudedAreaSolidToGeometry(entityIndex, itemExpressId);
    case 'IFCREVOLVEDAREASOLID':
      return revolvedAreaSolidToGeometry(entityIndex, itemExpressId);
    case 'IFCSWEPTDISKSOLID':
      return sweptDiskSolidToGeometry(entityIndex, itemExpressId);
    default:
      return null;
  }
}

/**
 * Resolve the "FirstOperand" of a Boolean result entity to a leaf id.
 * Recursively unwraps nested booleans — Phase 2 ignores the SecondOperand
 * (subtraction / intersection), so openings appear filled but the body is visible.
 */
function unwrapBooleanFirstOperand(entityIndex, expressId, visited = new Set()) {
  if (visited.has(expressId)) return null;
  visited.add(expressId);
  const e = entityIndex.byExpressId(expressId);
  if (!e) return null;
  if (e.type !== 'IFCBOOLEANRESULT' && e.type !== 'IFCBOOLEANCLIPPINGRESULT') return expressId;
  const parts = splitParams(e.params);
  // (Operator, FirstOperand, SecondOperand)
  const firstId = parseRef(parts[1]);
  if (!firstId) return null;
  return unwrapBooleanFirstOperand(entityIndex, firstId, visited);
}

/**
 * Walk an Items list, expanding IFCMAPPEDITEM and IFCBOOLEANRESULT containers,
 * and push every leaf geometry to `out` with its accumulated local matrix.
 *
 * @param {EntityIndex} entityIndex
 * @param {number[]} itemRefs
 * @param {THREE.Matrix4} parentMatrix — pre-composed transforms from outer maps
 * @param {Array<{bufferGeometry, bbox, color}>} out
 * @param {number} depth — recursion guard
 */
function expandItems(entityIndex, itemRefs, parentMatrix, out, depth = 0, inMapped = false) {
  if (depth > 8) return;
  for (const itemRef of itemRefs) {
    const item = entityIndex.byExpressId(itemRef);
    if (!item) continue;

    // IFCMAPPEDITEM → recurse into mapped representation with combined matrix
    if (item.type === 'IFCMAPPEDITEM') {
      const resolved = resolveMappedItem(entityIndex, itemRef);
      if (!resolved) continue;
      const childMatrix = parentMatrix.clone().multiply(resolved.matrix);
      expandItems(entityIndex, resolved.innerItemRefs, childMatrix, out, depth + 1, true);
      continue;
    }

    // IFCBOOLEANRESULT / IFCBOOLEANCLIPPINGRESULT — try the 2D-pattern CSG path
    // for (.DIFFERENCE., Extruded, Extruded). Covers Tekla plate-with-bolt-hole
    // and similar coplanar subtractions. Falls back to FirstOperand-only when
    // the operands don't fit the pattern.
    if (item.type === 'IFCBOOLEANRESULT' || item.type === 'IFCBOOLEANCLIPPINGRESULT') {
      const parts = splitParams(item.params);
      const operator = (parts[0] || '').trim();
      const firstId = parseRef(parts[1]);
      const secondId = parseRef(parts[2]);
      if (operator === '.DIFFERENCE.' && firstId && secondId) {
        const csgGeom = tryExtrudedDifference2D(entityIndex, firstId, secondId);
        if (csgGeom) {
          csgGeom.computeBoundingBox();
          const color = entityIndex._styleIndex?.get(itemRef);
          // Carry parentMatrix on the item so viewer-core composes it with
          // mesh.matrix instead of baking into the vertex buffer; this keeps
          // the float32 buffer small even when parentMatrix has huge
          // translation (e.g. IfcMappedItem placing a profile at absolute
          // world coords).
          out.push({
            bufferGeometry: csgGeom,
            bbox: csgGeom.boundingBox,
            color,
            parentMatrix: parentMatrix.equals(_IDENTITY) ? null : parentMatrix.clone(),
          });
          continue;
        }
      }
      const leafId = unwrapBooleanFirstOperand(entityIndex, itemRef);
      if (!leafId) continue;
      expandItems(entityIndex, [leafId], parentMatrix, out, depth + 1, inMapped);
      continue;
    }

    // Leaf geometry — cache/instance when reached through an IfcMappedItem
    const geom = buildLeafGeometry(entityIndex, itemRef, inMapped);
    if (!geom) continue;
    geom.computeBoundingBox();
    const color = entityIndex._styleIndex?.get(itemRef);
    out.push({
      bufferGeometry: geom,
      bbox: geom.boundingBox,
      color,
      parentMatrix: parentMatrix.equals(_IDENTITY) ? null : parentMatrix.clone(),
    });
  }
}

const _IDENTITY = new THREE.Matrix4();

/**
 * Build geometry for a single IFC product entity (IfcMember, IfcWall, IfcSlab, etc.).
 *
 * Returns null only if the entity has no Representation. If Representation
 * exists but yields no items (unsupported geometry types), returns
 * { matrix, items: [] }.
 *
 * IfcProduct attribute order: GlobalId(0), OwnerHistory(1), Name(2), Description(3),
 *                              ObjectType(4), ObjectPlacement(5), Representation(6), Tag(7), ...
 *
 * @param {EntityIndex} entityIndex
 * @param {number} productExpressId
 * @returns {{ matrix: THREE.Matrix4, items: Array<{ bufferGeometry, bbox, color }> } | null}
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
  let ctxScale = null;
  for (const shapeRepRef of shapeRepRefs) {
    const shapeRep = entityIndex.byExpressId(shapeRepRef);
    if (!shapeRep || shapeRep.type !== 'IFCSHAPEREPRESENTATION') continue;
    // IFCSHAPEREPRESENTATION(ContextOfItems, RepresentationIdentifier, RepresentationType, Items)
    const sParts = splitParams(shapeRep.params);
    // Filter to body-like representations to avoid loading IfcBoundingBox /
    // 'Axis' / 'FootPrint' alongside Body — those bloat the scene with lines.
    const repIdRaw = sParts[1] || '';
    const repTypeRaw = sParts[2] || '';
    if (/'Axis'|'FootPrint'|'Box'|'Annotation'|'Profile'/.test(repIdRaw)) continue;
    if (/'BoundingBox'|'Curve2D'/.test(repTypeRaw)) continue;
    // Mixed-unit merged files: remember which context this product draws in
    // (first body rep wins — a product's reps share their source context).
    if (ctxScale === null && entityIndex._ctxScaleMap) {
      const ctxRef = parseRef(sParts[0]);
      const s = ctxRef !== null ? entityIndex._ctxScaleMap.get(ctxRef) : undefined;
      if (typeof s === 'number') ctxScale = s;
    }
    const itemRefs = parseRefList(sParts[3]);
    expandItems(entityIndex, itemRefs, new THREE.Matrix4(), items);
  }

  const matrix = placementId ? resolvePlacement(entityIndex, placementId) : new THREE.Matrix4();
  // Per-context unit correction (merged mm+m files): the viewer applies the
  // global lengthScale to the whole model group, so a product whose context
  // was authored in different units gets the outermost ratio here. Placement
  // translation and geometry are both in source units — one uniform scale on
  // the assembled matrix converts the entire product.
  if (ctxScale !== null) {
    const globalScale = entityIndex._lengthScale || 1;
    if (globalScale > 0 && Math.abs(ctxScale - globalScale) / globalScale > 1e-9) {
      matrix.premultiply(new THREE.Matrix4().makeScale(
        ctxScale / globalScale, ctxScale / globalScale, ctxScale / globalScale));
    }
  }
  return { matrix, items };
}
