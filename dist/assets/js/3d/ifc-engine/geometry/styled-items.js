// Resolves IFC style chain → RGB color for geometry items.
//
// IFC chain (IFC2x3 + IFC4):
//   IFCSTYLEDITEM(geomItemRef, (styleRefs), name)
//     ↓ styleRefs may be:
//   IFCPRESENTATIONSTYLEASSIGNMENT((styleRefs))   — wrapper (optional in IFC4)
//   IFCSURFACESTYLE(name, side, (renderingRefs))
//   IFCSURFACESTYLERENDERING(surfaceColour, transparency, ..., reflectanceMethod)
//   IFCCOLOURRGB(name, R, G, B)                   — values in [0,1]
//
// Build index ONCE per model: Map<geomItemExpressId, hexColor | null>.

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList } from './step-helpers.js';

/**
 * Walk all IFCSTYLEDITEM entities and build map: geomItem expressId → hex color.
 * Items without resolvable color are absent from the map.
 *
 * @param {EntityIndex} entityIndex
 * @returns {Map<number, number>} expressId → 0xRRGGBB
 */
export function buildStyleIndex(entityIndex) {
  const map = new Map();
  const styledItems = entityIndex.byType('IFCSTYLEDITEM') || [];
  for (const styled of styledItems) {
    const parts = splitParams(styled.params);
    // IFCSTYLEDITEM(Item, Styles, Name)
    const itemRef = parseRef(parts[0]);
    const styleRefs = parseRefList(parts[1]);
    if (!itemRef || styleRefs.length === 0) continue;
    const color = resolveColorFromStyles(entityIndex, styleRefs);
    if (color != null) map.set(itemRef, color);
  }
  return map;
}

/**
 * Follow style refs through possible wrappers to find RGB color.
 * Returns hex int or null.
 */
function resolveColorFromStyles(entityIndex, styleRefs) {
  for (const styleRef of styleRefs) {
    const entity = entityIndex.byExpressId(styleRef);
    if (!entity) continue;

    if (entity.type === 'IFCPRESENTATIONSTYLEASSIGNMENT') {
      // Wrapper — recurse into inner styles
      const innerRefs = parseRefList(splitParams(entity.params)[0]);
      const c = resolveColorFromStyles(entityIndex, innerRefs);
      if (c != null) return c;
      continue;
    }
    if (entity.type === 'IFCSURFACESTYLE') {
      // IFCSURFACESTYLE(Name, Side, Styles)
      const renderingRefs = parseRefList(splitParams(entity.params)[2]);
      for (const rRef of renderingRefs) {
        const r = entityIndex.byExpressId(rRef);
        if (!r) continue;
        if (r.type === 'IFCSURFACESTYLERENDERING' || r.type === 'IFCSURFACESTYLESHADING') {
          // First param is SurfaceColour ref (IfcColourRgb)
          const colRef = parseRef(splitParams(r.params)[0]);
          const col = readColourRgb(entityIndex, colRef);
          if (col != null) return col;
        }
      }
      continue;
    }
    if (entity.type === 'IFCSURFACESTYLERENDERING' || entity.type === 'IFCSURFACESTYLESHADING') {
      const colRef = parseRef(splitParams(entity.params)[0]);
      const col = readColourRgb(entityIndex, colRef);
      if (col != null) return col;
      continue;
    }
    // Direct IfcColourRgb? Unlikely but handle gracefully.
    const direct = readColourRgb(entityIndex, styleRef);
    if (direct != null) return direct;
  }
  return null;
}

/**
 * Read IFCCOLOURRGB(Name, Red, Green, Blue) and pack to 0xRRGGBB.
 * Components are floats in [0, 1].
 */
function readColourRgb(entityIndex, colourRef) {
  if (!colourRef) return null;
  const entity = entityIndex.byExpressId(colourRef);
  if (!entity || entity.type !== 'IFCCOLOURRGB') return null;
  const parts = splitParams(entity.params);
  // IFCCOLOURRGB(Name, Red, Green, Blue)
  const r = parseFloat(parts[1]);
  const g = parseFloat(parts[2]);
  const b = parseFloat(parts[3]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  const ri = Math.max(0, Math.min(255, Math.round(r * 255)));
  const gi = Math.max(0, Math.min(255, Math.round(g * 255)));
  const bi = Math.max(0, Math.min(255, Math.round(b * 255)));
  return (ri << 16) | (gi << 8) | bi;
}
