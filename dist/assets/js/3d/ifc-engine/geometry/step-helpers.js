// Shared STEP parsing helpers used across geometry modules.
// Extracted in Phase 2 from duplicated copies in placement.js, mesh-types.js, geometry-core.js.

/**
 * Parse a STEP entity reference like "#42" → 42, or "$"/"*" → null.
 */
export function parseRef(s) {
  if (!s || s === '$' || s === '*') return null;
  const m = s.match(/^#(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Parse list of STEP refs from "(#40,#41,#42)" → [40, 41, 42].
 * Skips invalid entries silently.
 */
export function parseRefList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  if (!inner) return [];
  return inner.split(',')
    .map(s => s.trim())
    .map(parseRef)
    .filter(n => n !== null);
}

/**
 * Parse list of points from STEP nested params:
 *   "((0.0,0.0,0.0),(1.0,0.0,0.0),...)" → [[0,0,0],[1,0,0],...]
 *
 * Each inner "(x,y,z)" is split into [x,y,z]. Outer parens stripped once.
 */
export function parsePointList(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const matches = inner.match(/\(([^()]+)\)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).split(',').map(s => parseFloat(s.trim())));
}

/**
 * Parse a STEP numeric value that may be wrapped in a typed measure:
 *   "IFCLENGTHMEASURE(1133.04)" → { value: 1133.04, type: 'IFCLENGTHMEASURE' }
 *   "5.49"                      → { value: 5.49, type: null }
 *   "$" / "*" / non-numeric     → null
 * IFC4.3 wraps IfcCurveSegment.SegmentStart/SegmentLength and
 * IfcPointByDistanceExpression.DistanceAlong this way.
 */
export function parseWrappedNum(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^([A-Z][A-Z0-9_]*)\((.*)\)$/s);
  const inner = m ? m[2] : raw;
  const n = parseFloat(inner);
  if (!Number.isFinite(n)) return null;
  return { value: n, type: m ? m[1] : null };
}
