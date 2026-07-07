// IFC length-unit resolution.
//
// Two jobs:
//   1. extractLengthScale(index) — the model's global scale-to-metres factor.
//      Resolved from IfcProject.UnitsInContext first (authoritative per spec),
//      falling back to a scan of all IfcUnitAssignment entities. Supports both
//      IfcSIUnit (prefix × metre) and IfcConversionBasedUnit (feet, inches…).
//   2. buildContextScaleMap(index) — per-geometric-context scale for merged
//      files. Xbim-style merges concatenate several source models into one
//      file: each source block keeps its own IfcGeometricRepresentationContext
//      and (orphaned) IfcUnitAssignment, but only one IfcProject survives. When
//      the sources disagree on LENGTHUNIT (mm vs m), a single global scale
//      renders one block 1000× off. Assignments and contexts of one source
//      block occupy the same contiguous expressId range, so each context is
//      paired with the nearest preceding assignment.

import { splitParams } from './step-parser.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';

// IFC SI unit prefix → multiplier (per ISO 16739).
const IFC_PREFIX_SCALE = {
  '.EXA.': 1e18, '.PETA.': 1e15, '.TERA.': 1e12, '.GIGA.': 1e9, '.MEGA.': 1e6,
  '.KILO.': 1e3, '.HECTO.': 1e2, '.DECA.': 1e1,
  '': 1, '$': 1, '*': 1,
  '.DECI.': 1e-1, '.CENTI.': 1e-2, '.MILLI.': 1e-3, '.MICRO.': 1e-6,
  '.NANO.': 1e-9, '.PICO.': 1e-12, '.FEMTO.': 1e-15, '.ATTO.': 1e-18,
};

/** Scale factor of one IfcSIUnit / IfcConversionBasedUnit entity, or null. */
function lengthUnitScale(index, unitEntity, depth = 0) {
  if (!unitEntity || depth > 3) return null;
  const parts = splitParams(unitEntity.params);
  if (unitEntity.type === 'IFCSIUNIT') {
    // IfcSIUnit(Dimensions, UnitType, Prefix, Name)
    if ((parts[1] || '').trim() !== '.LENGTHUNIT.') return null;
    if ((parts[3] || '').trim() !== '.METRE.') return null;
    const scale = IFC_PREFIX_SCALE[(parts[2] || '').trim()];
    return (typeof scale === 'number' && scale > 0) ? scale : 1;
  }
  if (unitEntity.type === 'IFCCONVERSIONBASEDUNIT') {
    // IfcConversionBasedUnit(Dimensions, UnitType, Name, ConversionFactor)
    if ((parts[1] || '').trim() !== '.LENGTHUNIT.') return null;
    const mwuRef = parseRef(parts[3]);
    const mwu = mwuRef ? index.byExpressId(mwuRef) : null;
    if (!mwu) return null;
    // IfcMeasureWithUnit(ValueComponent, UnitComponent) — value is a typed
    // literal like IFCLENGTHMEASURE(0.3048) or IFCRATIOMEASURE(0.3048).
    const mParts = splitParams(mwu.params);
    const valMatch = (mParts[0] || '').match(/\(\s*([-0-9.Ee+]+)\s*\)/) || (mParts[0] || '').match(/^([-0-9.Ee+]+)$/);
    const value = valMatch ? parseFloat(valMatch[1]) : NaN;
    if (!Number.isFinite(value) || value <= 0) return null;
    const baseRef = parseRef(mParts[1]);
    const base = baseRef ? index.byExpressId(baseRef) : null;
    const baseScale = base ? lengthUnitScale(index, base, depth + 1) : 1;
    return value * (baseScale || 1);
  }
  return null;
}

/** Length scale of one IfcUnitAssignment, or null when it has no length unit. */
function assignmentLengthScale(index, assignment) {
  const unitRefs = parseRefList(splitParams(assignment.params)[0]);
  for (const uref of unitRefs) {
    const scale = lengthUnitScale(index, index.byExpressId(uref));
    if (scale !== null) return scale;
  }
  return null;
}

/**
 * Global scale-to-metres factor. IfcProject.UnitsInContext wins; otherwise
 * first assignment carrying a length unit; 1 when nothing is declared.
 */
export function extractLengthScale(index) {
  // IfcProject(GlobalId, OwnerHistory, Name, Description, ObjectType,
  //            LongName, Phase, RepresentationContexts, UnitsInContext)
  for (const project of (index.byType('IFCPROJECT') || [])) {
    const uaRef = parseRef(splitParams(project.params)[8]);
    const ua = uaRef ? index.byExpressId(uaRef) : null;
    if (!ua) continue;
    const scale = assignmentLengthScale(index, ua);
    if (scale !== null) return scale;
  }
  for (const ua of (index.byType('IFCUNITASSIGNMENT') || [])) {
    const scale = assignmentLengthScale(index, ua);
    if (scale !== null) return scale;
  }
  return 1;
}

/**
 * Map<contextExpressId, lengthScale> for merged files with conflicting unit
 * assignments; null for normal single-unit files (the common case — callers
 * skip all per-context work then). Subcontexts inherit their parent's scale.
 */
export function buildContextScaleMap(index) {
  const assignments = (index.byType('IFCUNITASSIGNMENT') || [])
    .map(ua => ({ id: ua.expressId, scale: assignmentLengthScale(index, ua) }))
    .filter(a => a.scale !== null)
    .sort((a, b) => a.id - b.id);
  if (assignments.length < 2) return null;
  const distinct = new Set(assignments.map(a => a.scale));
  if (distinct.size < 2) return null;

  const map = new Map();
  const contexts = (index.byType('IFCGEOMETRICREPRESENTATIONCONTEXT') || [])
    .slice().sort((a, b) => a.expressId - b.expressId);
  for (const ctx of contexts) {
    // nearest assignment declared before this context (same source block)
    let scale = assignments[0].scale;
    for (const a of assignments) {
      if (a.id > ctx.expressId) break;
      scale = a.scale;
    }
    map.set(ctx.expressId, scale);
  }
  // IfcGeometricRepresentationSubContext(Id, Type, *, *, *, *, ParentContext, …)
  const subs = index.byType('IFCGEOMETRICREPRESENTATIONSUBCONTEXT') || [];
  for (const sub of subs) {
    const parentRef = parseRef(splitParams(sub.params)[6]);
    if (parentRef !== null && map.has(parentRef)) map.set(sub.expressId, map.get(parentRef));
  }
  return map.size > 0 ? map : null;
}
