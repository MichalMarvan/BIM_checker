// Dynamic product-type discovery.
//
// PRODUCT_TYPES in constants.js is a curated whitelist, but real exports keep
// surfacing types outside it (IfcFurniture, IfcFlowTerminal, IfcLightFixture,
// IFC4X3 civil types…). Anything missed was invisible to search, the model
// tree, bbox/coords and RAG. Instead of chasing an ever-growing list, detect
// products structurally: a type is product-like when its entities carry
// ObjectPlacement + a ProductDefinitionShape representation (checked on a
// small sample — types are homogeneous in practice).

import { splitParams } from './step-parser.js';
import { parseRef } from '../geometry/step-helpers.js';
import { PRODUCT_TYPES, SPATIAL_CONTAINER_TYPES, HIDDEN_PRODUCT_TYPES } from '../constants.js';

// Types that structurally look like products but must stay out of listings:
// relationships/properties never have a shape, so the main risk is annotation
// and grid noise plus the hidden set (openings, spaces are listed separately).
const EXCLUDED = new Set(['IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT']);

/**
 * Set of product-like types present in this model: the static whitelist
 * union structurally-detected ones. Cached on the index (types don't change
 * after parse). Must be called BEFORE index.compact() to see representations;
 * the cached copy stays valid afterwards.
 */
export function detectProductTypes(index) {
  if (index._productTypes) return index._productTypes;
  const result = new Set();
  for (const t of index.types()) {
    if (PRODUCT_TYPES.has(t)) { result.add(t); continue; }
    if (SPATIAL_CONTAINER_TYPES.has(t) || HIDDEN_PRODUCT_TYPES.has(t) || EXCLUDED.has(t)) continue;
    if (t.endsWith('TYPE') || t.startsWith('IFCREL')) continue;
    const entities = index.byType(t);
    // Sample up to 3 entities — one malformed instance shouldn't decide.
    const sample = entities.length > 3 ? entities.slice(0, 3) : entities;
    for (const e of sample) {
      const parts = splitParams(e.params);
      const repRef = parseRef(parts[6]);
      if (!repRef) continue;
      const shape = index.byExpressId(repRef);
      if (shape && shape.type === 'IFCPRODUCTDEFINITIONSHAPE') { result.add(t); break; }
    }
  }
  index._productTypes = result;
  return result;
}
