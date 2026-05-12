// Phase 6.11 — IFC4.3 IfcAlignment parser.
//
// Walks the entity graph:
//   IfcAlignment IsNestedBy → IfcAlignmentHorizontal IsNestedBy →
//   IfcAlignmentSegment.DesignParameters → IfcAlignmentHorizontalSegment
//
// Each IfcAlignmentHorizontalSegment is converted to one of the same
// element shapes the LandXML parser produces (line / curve / spiral),
// so the existing discretize.js + alignment-visuals work unchanged.
//
// IfcAlignmentHorizontalSegment fields (in order):
//   StartTag (optional label)
//   EndTag (optional label)
//   StartPoint (ref → IfcCartesianPoint)
//   StartDirection (real, radians from +X CCW)
//   StartRadiusOfCurvature (real, signed; + = curve to LEFT/CCW)
//   EndRadiusOfCurvature (real)
//   SegmentLength (real, positive)
//   GravityCenterLineHeight (optional real)
//   PredefinedType (.LINE. | .CIRCULARARC. | .CLOTHOID. | ...)

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList } from '../geometry/step-helpers.js';
import { extractEntityName } from '../parser/entity-name.js';

function unquoteString(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^'(.*)'$/s);
  return m ? m[1] : null;
}

function parseNum(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseEnum(raw) {
  if (!raw || raw === '$') return null;
  const m = raw.match(/^\.([A-Z_0-9]+)\.$/);
  return m ? m[1] : null;
}

function readPoint2D(entityIndex, expressId) {
  if (!expressId) return null;
  const e = entityIndex.byExpressId(expressId);
  if (!e || e.type !== 'IFCCARTESIANPOINT') return null;
  const parts = splitParams(e.params);
  // IfcCartesianPoint Coordinates is a list "(x, y, z?)"
  const coords = parts[0];
  if (!coords) return null;
  const inner = coords.replace(/^\(/, '').replace(/\)$/, '');
  const nums = inner.split(',').map(s => parseFloat(s.trim()));
  if (nums.some(n => !Number.isFinite(n))) return null;
  return [nums[0], nums[1], nums[2] || 0];
}

/**
 * Build reverse index: parent expressId → list of nested child expressIds
 * via IfcRelNests entities.
 */
function buildNestsIndex(entityIndex) {
  const map = new Map();
  for (const rel of entityIndex.byType('IfcRelNests')) {
    const parts = splitParams(rel.params);
    // IfcRelNests: GlobalId, OwnerHistory, Name, Description, RelatingObject, RelatedObjects
    const parent = parseRef(parts[4]);
    const children = parseRefList(parts[5]);
    if (parent == null) continue;
    let arr = map.get(parent);
    if (!arr) { arr = []; map.set(parent, arr); }
    arr.push(...children);
  }
  return map;
}

/**
 * Parse a single IfcAlignmentHorizontalSegment into a normalized
 * line/curve/spiral element compatible with discretize.js.
 */
function parseHorizontalSegment(entityIndex, hsId, station) {
  const hs = entityIndex.byExpressId(hsId);
  if (!hs || hs.type !== 'IFCALIGNMENTHORIZONTALSEGMENT') return null;
  const parts = splitParams(hs.params);

  const startPoint = readPoint2D(entityIndex, parseRef(parts[2]));
  const startDir = parseNum(parts[3]);
  const r0 = parseNum(parts[4]);
  const r1 = parseNum(parts[5]);
  const length = parseNum(parts[6]);
  const predType = parseEnum(parts[8]);

  if (!startPoint || startDir == null || length == null || length <= 0) return null;

  if (predType === 'LINE' || (r0 === 0 && r1 === 0)) {
    const end = [
      startPoint[0] + length * Math.cos(startDir),
      startPoint[1] + length * Math.sin(startDir),
      startPoint[2],
    ];
    return {
      type: 'line',
      startStation: station,
      endStation: station + length,
      length,
      start: startPoint,
      end,
    };
  }

  if (predType === 'CIRCULARARC' || (r0 !== 0 && r0 === r1)) {
    // Circular arc with constant radius
    const radius = Math.abs(r0);
    if (radius < 1e-6) return null;
    // IFC convention: positive radius = curve to LEFT (CCW), negative = right (CW)
    const ccw = r0 > 0;
    // Perpendicular to startDir, pointing to center
    const perpX = -Math.sin(startDir) * (ccw ? 1 : -1);
    const perpY = Math.cos(startDir) * (ccw ? 1 : -1);
    const center = [
      startPoint[0] + radius * perpX,
      startPoint[1] + radius * perpY,
      startPoint[2],
    ];
    // Start angle from center
    const startAng = Math.atan2(startPoint[1] - center[1], startPoint[0] - center[0]);
    // Sweep angle along arc
    const sweep = (length / radius) * (ccw ? 1 : -1);
    const endAng = startAng + sweep;
    const end = [
      center[0] + radius * Math.cos(endAng),
      center[1] + radius * Math.sin(endAng),
      startPoint[2],
    ];
    return {
      type: 'curve',
      startStation: station,
      endStation: station + length,
      length,
      start: startPoint,
      end,
      center,
      radius,
      rotation: ccw ? 'ccw' : 'cw',
    };
  }

  if (predType === 'CLOTHOID' || r0 !== r1) {
    // Clothoid (Euler spiral) — varying curvature linearly with arc length
    const radiusStart = (r0 == null || r0 === 0) ? Infinity : Math.abs(r0);
    const radiusEnd = (r1 == null || r1 === 0) ? Infinity : Math.abs(r1);
    // Determine end point + heading by integrating (handled in discretize.js)
    // For now provide what discretize expects: start, end (approximate),
    // dirStart, radiusStart/End, length, rotation.
    // discretize.js computes the actual swept path and sets end at the last
    // sampled point — so we can pass a placeholder end.
    const ccw = (r0 > 0) || (r1 > 0);
    return {
      type: 'spiral',
      startStation: station,
      endStation: station + length,
      length,
      start: startPoint,
      end: [
        startPoint[0] + length * Math.cos(startDir),
        startPoint[1] + length * Math.sin(startDir),
        startPoint[2],
      ],
      pi: null,
      radiusStart,
      radiusEnd,
      dirStart: startDir,
      rotation: ccw ? 'ccw' : 'cw',
      spiType: 'clothoid',
      // Override clothoid integration: use raw startDir radian (not the
      // bearing-from-N interpretation discretize.js otherwise tries).
      _useRawDir: true,
    };
  }

  return null;
}

/**
 * List all IfcAlignment entities in a model.
 * @returns {Array<{expressId, name}>}
 */
export function findIfcAlignments(entityIndex) {
  const out = [];
  for (const a of entityIndex.byType('IfcAlignment')) {
    out.push({
      expressId: a.expressId,
      name: extractEntityName(a.params) || `Alignment #${a.expressId}`,
    });
  }
  return out;
}

/**
 * Parse a specific IfcAlignment entity into an alignment object compatible
 * with the LandXML parser output.
 *
 * @param {EntityIndex} entityIndex
 * @param {number} alignmentExpressId
 * @returns {Alignment | null}
 */
export function parseIfcAlignment(entityIndex, alignmentExpressId) {
  const align = entityIndex.byExpressId(alignmentExpressId);
  if (!align || align.type !== 'IFCALIGNMENT') return null;
  const name = extractEntityName(align.params) || 'IfcAlignment';

  const nests = buildNestsIndex(entityIndex);

  // Find horizontal alignment among nested children
  const directChildren = nests.get(alignmentExpressId) || [];
  let horizontalId = null;
  for (const childId of directChildren) {
    const child = entityIndex.byExpressId(childId);
    if (child?.type === 'IFCALIGNMENTHORIZONTAL') {
      horizontalId = childId;
      break;
    }
  }
  if (!horizontalId) return { name, length: 0, staStart: 0, elements: [] };

  // Segments nested under horizontal
  const segChildren = nests.get(horizontalId) || [];
  const elements = [];
  let cumStation = 0;
  for (const segId of segChildren) {
    const seg = entityIndex.byExpressId(segId);
    if (!seg || seg.type !== 'IFCALIGNMENTSEGMENT') continue;
    // IfcAlignmentSegment params: GlobalId, OwnerHistory, Name, Description,
    // ObjectType, ObjectPlacement, Representation, PredefinedType, DesignParameters
    const parts = splitParams(seg.params);
    const designParamsId = parseRef(parts[8]);
    if (!designParamsId) continue;
    const el = parseHorizontalSegment(entityIndex, designParamsId, cumStation);
    if (el) {
      elements.push(el);
      cumStation = el.endStation;
    }
  }

  return {
    name,
    length: cumStation,
    staStart: 0,
    elements,
  };
}
