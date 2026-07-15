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
import { parseRef, parseRefList, parseWrappedNum } from '../geometry/step-helpers.js';
import { extractEntityName } from '../parser/entity-name.js';
import { getCurveEval } from './curve-evaluator.js';

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
    if (parent === null || parent === undefined) continue;
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

  if (!startPoint || startDir === null || startDir === undefined || length === null || length === undefined || length <= 0) return null;

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
    const radiusStart = (r0 === null || r0 === undefined || r0 === 0) ? Infinity : Math.abs(r0);
    const radiusEnd = (r1 === null || r1 === undefined || r1 === 0) ? Infinity : Math.abs(r1);
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

  // Business vrstva — od zavedení geometrické vrstvy slouží hlavně jako
  // metadata (elementCount, poloměry v UI) a fallback pro soubory bez
  // Representation.
  const elements = [];
  let cumStation = 0;
  if (horizontalId) {
    const segChildren = nests.get(horizontalId) || [];
    for (const segId of segChildren) {
      const seg = entityIndex.byExpressId(segId);
      if (!seg || seg.type !== 'IFCALIGNMENTSEGMENT') continue;
      // IfcAlignmentSegment (IFC 4.3): GlobalId, OwnerHistory, Name, Description,
      // ObjectType, ObjectPlacement, Representation, DesignParameters — tj.
      // 8 atributů, DesignParameters POSLEDNÍ (žádný PredefinedType!). Čteme
      // poslední pole, aby prošly i starší exporty s aritou 9.
      const parts = splitParams(seg.params);
      const designParamsId = parseRef(parts[parts.length - 1]);
      if (!designParamsId) continue;
      const el = parseHorizontalSegment(entityIndex, designParamsId, cumStation);
      if (el) {
        elements.push(el);
        cumStation = el.endStation;
      }
    }
  }

  // Business niveleta (IfcAlignmentVertical) — pro soubory bez geometrické
  // reprezentace. Vrací funkci zAt(station) přes hook v elevationAt.
  let verticalId = null;
  for (const childId of directChildren) {
    const child = entityIndex.byExpressId(childId);
    if (child?.type === 'IFCALIGNMENTVERTICAL') { verticalId = childId; break; }
  }
  const businessVertical = verticalId ? buildBusinessVertical(entityIndex, nests.get(verticalId) || []) : null;

  // Geometrická vrstva (IFC 4.3): Representation → 'Axis'/IfcGradientCurve
  // (fallback 'FootPrint'/IfcCompositeCurve) — preferovaná pro vykreslení,
  // nese i niveletu. Zkouší se i bez business horizontály. Když je geometrie
  // jen 2D (FootPrint bez gradient curve), výšky dodá business niveleta.
  const geo = evaluateGeometricAxis(entityIndex, align, nests, alignmentExpressId, businessVertical);
  if (geo) {
    return {
      name,
      length: geo.length,
      staStart: geo.staStart,
      elements,
      presampled: geo.presampled,
      verticalProfile: (geo.is3D || geo.usedBusinessVertical)
        ? { source: geo.is3D ? 'ifc-gradient-curve' : 'ifc-business', entries: [] }
        : null,
    };
  }

  return {
    name,
    length: cumStation,
    staStart: 0,
    elements,
    verticalProfile: businessVertical ? { source: 'ifc-business', entries: [], zAt: businessVertical } : null,
  };
}

/**
 * Business niveleta: IfcAlignmentVerticalSegment (StartTag, EndTag,
 * StartDistAlong, HorizontalLength, StartHeight, StartGradient, EndGradient,
 * RadiusOfCurvature, PredefinedType) → funkce zAt(station).
 * CONSTANTGRADIENT/PARABOLICARC přesně, CIRCULARARC přesnou kružnicí,
 * CLOTHOID aproximován parabolou (warn).
 */
function buildBusinessVertical(entityIndex, segIds) {
  const entries = [];
  for (const segId of segIds) {
    const seg = entityIndex.byExpressId(segId);
    if (!seg || seg.type !== 'IFCALIGNMENTSEGMENT') continue;
    const dp = entityIndex.byExpressId(parseRef(splitParams(seg.params).slice(-1)[0]));
    if (!dp || dp.type !== 'IFCALIGNMENTVERTICALSEGMENT') continue;
    const p = splitParams(dp.params);
    const d0 = parseWrappedNum(p[2])?.value;
    const hLen = parseWrappedNum(p[3])?.value;
    const h0 = parseWrappedNum(p[4])?.value;
    const g0 = parseWrappedNum(p[5])?.value;
    const g1 = parseWrappedNum(p[6])?.value;
    const R = parseWrappedNum(p[7])?.value;
    const type = (p[8] || '').replace(/\./g, '');
    if (![d0, hLen, h0, g0].every(Number.isFinite) || hLen <= 0) continue;
    let zAt;
    if (type === 'PARABOLICARC' || type === 'CLOTHOID') {
      if (type === 'CLOTHOID') console.warn('[ifc-alignment] vertikální CLOTHOID aproximován parabolou');
      const c2 = Number.isFinite(g1) ? (g1 - g0) / (2 * hLen) : 0;
      zAt = d => h0 + g0 * (d - d0) + c2 * (d - d0) * (d - d0);
    } else if (type === 'CIRCULARARC') {
      // kružnice tečná na sklon g0 v (d0, h0); strana dle znaménka R,
      // fallback dle Δg. z = Cy − s·√(R² − (x−Cx)²)
      const s = Number.isFinite(R) && R !== 0 ? Math.sign(R)
        : Math.sign((Number.isFinite(g1) ? g1 : g0) - g0) || 1;
      const rAbs = Number.isFinite(R) && R !== 0 ? Math.abs(R) : 1e9;
      const th = Math.atan(g0);
      const cx = d0 - s * rAbs * Math.sin(th);
      const cy = h0 + s * rAbs * Math.cos(th);
      zAt = d => {
        const dx = d - cx;
        const disc = rAbs * rAbs - dx * dx;
        if (disc <= 0) return h0 + g0 * (d - d0);
        return cy - s * Math.sqrt(disc);
      };
    } else {
      // CONSTANTGRADIENT (i default)
      zAt = d => h0 + g0 * (d - d0);
    }
    entries.push({ from: d0, to: d0 + hLen, zAt });
  }
  entries.sort((a, b) => a.from - b.from);
  if (entries.length === 0) return null;
  return d => {
    if (d <= entries[0].from) return entries[0].zAt(entries[0].from);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (d >= entries[i].from) return entries[i].zAt(Math.min(d, entries[i].to));
    }
    return entries[0].zAt(entries[0].from);
  };
}

/** Najde IfcGradientCurve/IfcCompositeCurve v Representation alignmentu. */
function findAxisCurveId(entityIndex, alignEntity) {
  const parts = splitParams(alignEntity.params);
  const pdsId = parseRef(parts[6]);
  const pds = pdsId && entityIndex.byExpressId(pdsId);
  if (!pds || pds.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;
  const repIds = parseRefList(splitParams(pds.params)[2]);
  let fallback = null;
  for (const rid of repIds) {
    const rep = entityIndex.byExpressId(rid);
    if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;
    const rp = splitParams(rep.params);
    const ident = unquoteString(rp[1]);
    const items = parseRefList(rp[3]);
    if (items.length === 0) continue;
    if (ident === 'Axis') return items[0];
    if (ident === 'FootPrint' && fallback === null) fallback = items[0];
  }
  return fallback;
}

/**
 * Staničení z referentu: Pset_Stationing.Station − DistanceAlong placementu.
 * Staniční rovnice (víc STATION referentů) zatím nepodporujeme — warn.
 */
function findStationOffset(entityIndex, nests, alignmentExpressId) {
  const children = nests.get(alignmentExpressId) || [];
  const stations = [];
  for (const cid of children) {
    const ref = entityIndex.byExpressId(cid);
    if (!ref || ref.type !== 'IFCREFERENT') continue;
    const rp = splitParams(ref.params);
    if (parseEnum(rp[7]) !== 'STATION') continue;
    // DistanceAlong z IfcLinearPlacement → IfcAxis2PlacementLinear → PBDE
    let distAlong = 0;
    const lp = entityIndex.byExpressId(parseRef(rp[5]));
    if (lp && lp.type === 'IFCLINEARPLACEMENT') {
      const rel = entityIndex.byExpressId(parseRef(splitParams(lp.params)[1]));
      if (rel && rel.type === 'IFCAXIS2PLACEMENTLINEAR') {
        const pbde = entityIndex.byExpressId(parseRef(splitParams(rel.params)[0]));
        if (pbde && pbde.type === 'IFCPOINTBYDISTANCEEXPRESSION') {
          const d = parseWrappedNum(splitParams(pbde.params)[0]);
          if (d) distAlong = d.value;
        }
      }
    }
    // Station z Pset_Stationing
    for (const rel of entityIndex.byType('IfcRelDefinesByProperties')) {
      const relParts = splitParams(rel.params);
      if (!parseRefList(relParts[4]).includes(cid)) continue;
      const pset = entityIndex.byExpressId(parseRef(relParts[5]));
      if (!pset || pset.type !== 'IFCPROPERTYSET') continue;
      const psetParts = splitParams(pset.params);
      if (unquoteString(psetParts[2]) !== 'Pset_Stationing') continue;
      for (const pid of parseRefList(psetParts[4])) {
        const prop = entityIndex.byExpressId(pid);
        if (!prop || prop.type !== 'IFCPROPERTYSINGLEVALUE') continue;
        const propParts = splitParams(prop.params);
        if (unquoteString(propParts[0]) !== 'Station') continue;
        const v = parseWrappedNum(propParts[2]);
        if (v) stations.push(v.value - distAlong);
      }
    }
  }
  if (stations.length > 1) {
    console.warn(`[ifc-alignment] ${stations.length} STATION referentů — staniční rovnice zatím nepodporovány, používám první`);
  }
  return stations.length > 0 ? stations[0] : 0;
}

function evaluateGeometricAxis(entityIndex, alignEntity, nests, alignmentExpressId, businessVertical = null) {
  const curveId = findAxisCurveId(entityIndex, alignEntity);
  if (!curveId) return null;
  const ce = getCurveEval(entityIndex, curveId);
  if (!ce) return null;
  const scale = entityIndex._lengthScale || 1;
  const staStart = findStationOffset(entityIndex, nests, alignmentExpressId);
  const presampled = ce.sample(1.0);
  // 2D půdorys (FootPrint bez gradient curve) + business niveleta → výšky
  // z business vrstvy (staničení = raw distAlong před scale/staStart posunem).
  const usedBusinessVertical = !ce.is3D && !!businessVertical;
  if (usedBusinessVertical) {
    for (let i = 0; i < presampled.points.length; i++) {
      presampled.points[i][2] = businessVertical(presampled.stations[i]);
    }
  }
  for (const p of presampled.points) { p[0] *= scale; p[1] *= scale; p[2] *= scale; }
  for (let i = 0; i < presampled.stations.length; i++) {
    presampled.stations[i] = presampled.stations[i] * scale + staStart;
  }
  return { presampled, length: ce.length * scale, staStart, is3D: ce.is3D, usedBusinessVertical };
}
