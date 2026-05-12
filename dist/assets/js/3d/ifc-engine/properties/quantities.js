// Phase 6.3.2 — IFC element quantities extractor.
//
// IFC schema:
//   IfcRelDefinesByProperties(GlobalId, OwnerHistory, Name, Description,
//     RelatedObjects, RelatingPropertyDefinition)
//   IfcElementQuantity(GlobalId, OwnerHistory, Name, Description,
//     MethodOfMeasurement, Quantities)
//   IfcQuantityLength(Name, Description, Unit, LengthValue, Formula)
//   IfcQuantityArea(Name, Description, Unit, AreaValue, Formula)
//   IfcQuantityVolume(Name, Description, Unit, VolumeValue, Formula)
//   IfcQuantityCount(Name, Description, Unit, CountValue, Formula)
//   IfcQuantityWeight(Name, Description, Unit, WeightValue, Formula)
//
// IfcRelDefinesByProperties.RelatingPropertyDefinition can point to either
// IfcPropertySet OR IfcElementQuantity — we already have the rel index from
// psets.js but that one filters for psets. Build a separate quantities index.

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';

const _quantityIndexCache = new WeakMap();

const QUANTITY_TYPES = {
  IFCQUANTITYLENGTH: { kind: 'length', valueIndex: 3 },
  IFCQUANTITYAREA:   { kind: 'area', valueIndex: 3 },
  IFCQUANTITYVOLUME: { kind: 'volume', valueIndex: 3 },
  IFCQUANTITYCOUNT:  { kind: 'count', valueIndex: 3 },
  IFCQUANTITYWEIGHT: { kind: 'weight', valueIndex: 3 },
};

function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^'(.*)'$/s);
  return m ? m[1] : null;
}

function parseFloatStrict(raw) {
  if (raw == null || raw === '$') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function buildRelToQuantityIndex(entityIndex) {
  let cached = _quantityIndexCache.get(entityIndex);
  if (cached) return cached;
  cached = new Map();
  const rels = entityIndex.byType('IfcRelDefinesByProperties');
  for (const rel of rels) {
    const parts = splitParams(rel.params);
    const relatedRefs = parseRefList(parts[4]);
    const targetRef = parseRef(parts[5]);
    if (targetRef == null) continue;
    const target = entityIndex.byExpressId(targetRef);
    if (!target || target.type !== 'IFCELEMENTQUANTITY') continue;
    for (const refId of relatedRefs) {
      let arr = cached.get(refId);
      if (!arr) { arr = []; cached.set(refId, arr); }
      arr.push(targetRef);
    }
  }
  _quantityIndexCache.set(entityIndex, cached);
  return cached;
}

function extractSingleQuantity(entityIndex, qtyId) {
  const qty = entityIndex.byExpressId(qtyId);
  if (!qty) return null;
  const meta = QUANTITY_TYPES[qty.type];
  if (!meta) return null;
  const parts = splitParams(qty.params);
  const name = unquoteString(parts[0]);
  if (!name) return null;
  const value = parseFloatStrict(parts[meta.valueIndex]);
  if (value == null) return null;
  return { name, kind: meta.kind, value };
}

/**
 * Extract IFC element quantities for a single entity.
 * @param {EntityIndex} entityIndex
 * @param {number} expressId
 * @returns {Array<{name, kind, value}>}
 */
export function extractIfcQuantities(entityIndex, expressId) {
  const index = buildRelToQuantityIndex(entityIndex);
  const qsetIds = index.get(expressId) || [];
  const out = [];
  for (const qsetId of qsetIds) {
    const qset = entityIndex.byExpressId(qsetId);
    if (!qset) continue;
    const parts = splitParams(qset.params);
    const qtyRefs = parseRefList(parts[5]);
    for (const qtyId of qtyRefs) {
      const q = extractSingleQuantity(entityIndex, qtyId);
      if (q) out.push(q);
    }
  }
  return out;
}
