// IfcPresentationLayerAssignment → element layer ("hladina") index.
//
// Maps each product expressId to its CAD layer name. Layers reference shape
// representations; products reach those through IfcProductDefinitionShape.
// Must run BEFORE EntityIndex.compact() — it relies on shape-representation
// and product-definition-shape entities that compaction later drops.

import { decodeIFCString } from './ifc-decoder.js';
import { PRODUCT_TYPES } from '../constants.js';

/** First single-quoted attribute, IFC-decoded (layer Name). */
function firstQuoted(params) {
  const m = params.match(/'((?:[^']|'')*)'/);
  return m ? decodeIFCString(m[1]) : null;
}

/** Numeric ids from the first parenthesised (#a,#b,...) reference list. */
function refList(params) {
  const m = params.match(/\(([^()]*#[^()]*)\)/);
  if (!m) return [];
  const out = [];
  const re = /#(\d+)/g;
  let r;
  while ((r = re.exec(m[1]))) out.push(parseInt(r[1], 10));
  return out;
}

/** Every #ref in the params (used for products whose rep is a bare ref). */
function allRefs(params) {
  const out = [];
  const re = /#(\d+)/g;
  let r;
  while ((r = re.exec(params))) out.push(parseInt(r[1], 10));
  return out;
}

/**
 * @param {EntityIndex} index
 * @returns {Map<number,string>|null} productExpressId → layer name, or null
 *          when the model declares no presentation layers.
 */
export function buildLayerIndex(index) {
  const shapeRepToLayer = new Map();
  for (const e of index.byType('IFCPRESENTATIONLAYERASSIGNMENT')) {
    const name = firstQuoted(e.params);
    if (!name) continue;
    for (const r of refList(e.params)) shapeRepToLayer.set(r, name);
  }
  // Also IFC2x3 styled variant
  for (const e of index.byType('IFCPRESENTATIONLAYERWITHSTYLE')) {
    const name = firstQuoted(e.params);
    if (!name) continue;
    for (const r of refList(e.params)) shapeRepToLayer.set(r, name);
  }
  if (shapeRepToLayer.size === 0) return null;

  // PDS → layer, via the shape representations it lists
  const pdsToLayer = new Map();
  for (const e of index.byType('IFCPRODUCTDEFINITIONSHAPE')) {
    for (const r of refList(e.params)) {
      const L = shapeRepToLayer.get(r);
      if (L) { pdsToLayer.set(e.expressId, L); break; }
    }
  }

  // Product → layer, via the PDS (or shape rep) it references
  const layerOf = new Map();
  for (const type of PRODUCT_TYPES) {
    for (const e of index.byType(type)) {
      for (const r of allRefs(e.params)) {
        if (shapeRepToLayer.has(r)) { layerOf.set(e.expressId, shapeRepToLayer.get(r)); break; }
        if (pdsToLayer.has(r)) { layerOf.set(e.expressId, pdsToLayer.get(r)); break; }
      }
    }
  }
  return layerOf.size > 0 ? layerOf : null;
}
