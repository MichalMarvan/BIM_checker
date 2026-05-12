// Extract IFC PropertySets for an entity by walking IFCRELDEFINESBYPROPERTIES.
//
// IFC4 schema:
//   IfcRelDefinesByProperties(GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatingPropertyDefinition)
//   IfcPropertySet(GlobalId, OwnerHistory, Name, Description, HasProperties)
//   IfcPropertySingleValue(Name, Description, NominalValue, Unit)
//
// NominalValue is wrapped: IFCLABEL('foo'), IFCREAL(1.0), IFCBOOLEAN(.T.), IFC*MEASURE(2.5), etc.
// Unwrap to primitive + remember the wrapper type.

import { splitParams } from '../parser/step-parser.js';
import { decodeIFCString } from '../parser/ifc-decoder.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';

// Module-level cache: WeakMap<EntityIndex, Map<expressId, Array<relDefinesId>>>
// First call per index builds the reverse lookup; subsequent calls are O(1).
const _relIndexCache = new WeakMap();

/**
 * Build (or fetch cached) reverse index: entityExpressId → array of IFCRELDEFINESBYPROPERTIES IDs.
 */
function getRelIndex(entityIndex) {
  let cached = _relIndexCache.get(entityIndex);
  if (cached) return cached;

  cached = new Map();
  const rels = entityIndex.byType('IfcRelDefinesByProperties');
  for (const rel of rels) {
    const parts = splitParams(rel.params);
    const relatedRefs = parseRefList(parts[4]);
    for (const refId of relatedRefs) {
      let arr = cached.get(refId);
      if (!arr) {
        arr = [];
        cached.set(refId, arr);
      }
      arr.push(rel.expressId);
    }
  }
  _relIndexCache.set(entityIndex, cached);
  return cached;
}

/**
 * Strip outer single quotes from a STEP string param.
 * "'foo'" → "foo". Returns null for "$".
 */
function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^'(.*)'$/s);
  return m ? decodeIFCString(m[1]) : null;
}

/**
 * Unwrap a NominalValue IFC type wrapper.
 *
 * Examples:
 *   "IFCLABEL('foo')"      → { value: 'foo',   type: 'IFCLABEL' }
 *   "IFCREAL(1.5)"         → { value: 1.5,     type: 'IFCREAL' }
 *   "IFCBOOLEAN(.T.)"      → { value: true,    type: 'IFCBOOLEAN' }
 *   "IFCBOOLEAN(.F.)"      → { value: false,   type: 'IFCBOOLEAN' }
 *   "IFCLENGTHMEASURE(2)"  → { value: 2,       type: 'IFCLENGTHMEASURE' }
 *   "$"                    → { value: null,    type: null }
 */
function unwrapNominalValue(raw) {
  if (!raw || raw === '$' || raw === '*') return { value: null, type: null };

  const wrapMatch = raw.match(/^(IFC[A-Z0-9_]+)\s*\((.*)\)$/);
  if (!wrapMatch) {
    return { value: raw, type: null };
  }
  const type = wrapMatch[1];
  const inner = wrapMatch[2].trim();

  if (inner.startsWith("'") && inner.endsWith("'")) {
    return { value: decodeIFCString(inner.slice(1, -1)), type };
  }
  if (inner === '.T.') return { value: true, type };
  if (inner === '.F.') return { value: false, type };
  if (inner === '.U.') return { value: null, type };
  const num = parseFloat(inner);
  if (!Number.isNaN(num)) return { value: num, type };
  return { value: inner, type };
}

/**
 * Extract a single IFCPROPERTYSINGLEVALUE → { name, value, type }.
 */
function extractSingleValue(entityIndex, propId) {
  const prop = entityIndex.byExpressId(propId);
  if (!prop || prop.type !== 'IFCPROPERTYSINGLEVALUE') return null;
  const parts = splitParams(prop.params);
  const name = unquoteString(parts[0]);
  if (!name) return null;
  const { value, type } = unwrapNominalValue(parts[2]);
  return { name, value, type };
}

/**
 * Extract a full IFCPROPERTYSET → { name, properties: [...] }.
 */
function extractPropertySet(entityIndex, psetId) {
  const pset = entityIndex.byExpressId(psetId);
  if (!pset || pset.type !== 'IFCPROPERTYSET') return null;
  const parts = splitParams(pset.params);
  const name = unquoteString(parts[2]) || 'Unnamed PSet';
  const propRefs = parseRefList(parts[4]);
  const properties = [];
  for (const propId of propRefs) {
    const prop = extractSingleValue(entityIndex, propId);
    if (prop) properties.push(prop);
  }
  return { name, properties };
}

/**
 * Extract direct entity attributes (Name, ObjectType, Tag) — IfcProduct subtype attrs.
 */
function extractAttributes(parts) {
  return [
    { name: 'GlobalId', value: unquoteString(parts[0]), type: 'IFCGLOBALLYUNIQUEID' },
    { name: 'Name', value: unquoteString(parts[2]), type: 'IFCLABEL' },
    { name: 'Description', value: unquoteString(parts[3]), type: 'IFCTEXT' },
    { name: 'ObjectType', value: unquoteString(parts[4]), type: 'IFCLABEL' },
  ];
}

/**
 * Extract full property data for a single IFC entity.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} expressId
 * @returns {{ category, guid, name, attributes, propertySets } | null}
 */
export function extractPropertiesFor(entityIndex, expressId) {
  const entity = entityIndex.byExpressId(expressId);
  if (!entity) return null;

  const parts = splitParams(entity.params);
  const guid = unquoteString(parts[0]) || '';
  const name = unquoteString(parts[2]) || '';
  const attributes = extractAttributes(parts);

  const relIndex = getRelIndex(entityIndex);
  const relIds = relIndex.get(expressId) || [];
  const propertySets = [];
  for (const relId of relIds) {
    const rel = entityIndex.byExpressId(relId);
    if (!rel) continue;
    const relParts = splitParams(rel.params);
    const psetId = parseRef(relParts[5]);
    if (!psetId) continue;
    const pset = extractPropertySet(entityIndex, psetId);
    if (pset) propertySets.push(pset);
  }

  return {
    category: entity.type,
    guid,
    name,
    attributes,
    propertySets,
  };
}
