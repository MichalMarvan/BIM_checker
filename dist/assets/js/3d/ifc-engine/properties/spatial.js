// Phase 6.1.2 — Spatial hierarchy extractor.
//
// IFC schema:
//   IfcRelAggregates(GlobalId, OwnerHistory, Name, Description, RelatingObject, RelatedObjects)
//     - parent → child structural aggregation
//     - Project → Site, Site → Building, Building → Storey, Storey → Space
//
//   IfcRelContainedInSpatialStructure(GlobalId, OwnerHistory, Name, Description,
//     RelatedElements, RelatingStructure)
//     - storey → contained elements (Wall, Slab, Beam, ...)
//     - RelatingStructure is parent (storey/space), RelatedElements is array of children
//
// Result tree node shape:
//   { type, expressId, name, guid, children: SpatialNode[], elements: ElementRef[] }
//
// "children" = sub-spatial-structures (recursive),
// "elements" = leaf entities contained in this structure.

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';
import { extractEntityName, extractEntityGuid } from '../parser/entity-name.js';

const SPATIAL_TYPES = new Set([
  'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE',
]);

/**
 * Build spatial hierarchy tree rooted at IfcProject.
 *
 * @param {EntityIndex} entityIndex
 * @returns {SpatialNode | null}
 */
export function extractSpatialHierarchy(entityIndex) {
  const projects = entityIndex.byType('IfcProject');
  if (!projects.length) return null;

  // Build parent → children map from IfcRelAggregates
  const aggregates = new Map(); // parentExpressId → childExpressId[]
  for (const rel of entityIndex.byType('IfcRelAggregates')) {
    const parts = splitParams(rel.params);
    const parent = parseRef(parts[4]);
    const children = parseRefList(parts[5]);
    if (parent == null) continue;
    let arr = aggregates.get(parent);
    if (!arr) { arr = []; aggregates.set(parent, arr); }
    arr.push(...children);
  }

  // Build storey → contained elements from IfcRelContainedInSpatialStructure
  const contained = new Map(); // structureExpressId → elementExpressId[]
  for (const rel of entityIndex.byType('IfcRelContainedInSpatialStructure')) {
    const parts = splitParams(rel.params);
    const elements = parseRefList(parts[4]);
    const structure = parseRef(parts[5]);
    if (structure == null) continue;
    let arr = contained.get(structure);
    if (!arr) { arr = []; contained.set(structure, arr); }
    arr.push(...elements);
  }

  return buildNode(entityIndex, projects[0].expressId, aggregates, contained);
}

function buildNode(entityIndex, expressId, aggregates, contained) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity) return null;

  const node = {
    type: entity.type,
    expressId,
    name: extractEntityName(entity.params) || '',
    guid: extractEntityGuid(entity.params) || '',
    children: [],
    elements: [],
  };

  // Recurse into spatial sub-structures
  const childIds = aggregates.get(expressId) || [];
  for (const childId of childIds) {
    const childEntity = entityIndex.byExpressId(childId);
    if (!childEntity) continue;
    if (SPATIAL_TYPES.has(childEntity.type)) {
      const childNode = buildNode(entityIndex, childId, aggregates, contained);
      if (childNode) node.children.push(childNode);
    }
  }

  // Add contained elements (leaf elements directly housed in this structure)
  const elementIds = contained.get(expressId) || [];
  for (const elementId of elementIds) {
    const elementEntity = entityIndex.byExpressId(elementId);
    if (!elementEntity) continue;
    node.elements.push({
      type: elementEntity.type,
      expressId: elementId,
      name: extractEntityName(elementEntity.params) || '',
      guid: extractEntityGuid(elementEntity.params) || '',
    });
  }

  return node;
}

/**
 * Walk tree, collecting all leaf element expressIds reachable from the given node.
 * Useful for storey filter: "hide all elements in this storey".
 *
 * @param {SpatialNode} node
 * @returns {number[]}
 */
export function collectAllElementIds(node) {
  if (!node) return [];
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const e of n.elements) out.push(e.expressId);
    for (const c of n.children) stack.push(c);
  }
  return out;
}
