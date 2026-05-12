// Phase 6.12.1 — IFC version diff engine.
//
// Compares two loaded models entity-by-entity, producing a structured diff:
//   { added[], removed[], modified[], moved[], stats }
//
// Matching strategy:
//   1. GUID first (exact IfcGloballyUniqueId match) — most reliable
//   2. Fuzzy fallback for unmatched: same ifcType + name match (case-insensitive)
//      + bbox center distance < threshold (default 1m)
//
// Diff dimensions per matched pair:
//   - properties: deep compare propertySets[].properties[].value
//   - geometry: bbox center distance + dims delta beyond tolerance
//   - spatial: parent IfcBuildingStorey changed (via IfcRelContainedInSpatialStructure)
//
// Result entity ref shape: { modelId, expressId, ifcType, name, guid }

import { extractEntityName, extractEntityGuid } from '../parser/entity-name.js';
import { extractPropertiesFor } from '../properties/psets.js';
import { extractSpatialHierarchy } from '../properties/spatial.js';
import { splitParams } from '../parser/step-parser.js';
import { parseRef } from '../geometry/step-helpers.js';
import { resolvePlacement } from '../geometry/placement.js';
import { PRODUCT_TYPES_INCLUDING_SPATIAL } from '../constants.js';

const DEFAULT_BBOX_TOLERANCE_M = 0.001;     // 1mm — below = "no geometry change"
const DEFAULT_FUZZY_DIST_M = 1.0;           // 1m — fuzzy match accepts pairs closer than this

/**
 * @param {EntityIndex} indexV1
 * @param {EntityIndex} indexV2
 * @param {{
 *   bboxToleranceM?: number,
 *   fuzzyDistM?: number,
 *   compareProperties?: boolean,
 *   compareGeometry?: boolean,
 *   compareSpatial?: boolean,
 * }} opts
 * @returns {{
 *   added: EntityRef[],
 *   removed: EntityRef[],
 *   modified: ChangedEntity[],
 *   moved: ChangedEntity[],
 *   unchanged_count: number,
 *   stats: object,
 * }}
 */
export function computeDiff(indexV1, indexV2, opts = {}) {
  const t0 = performance.now();
  const tol = opts.bboxToleranceM ?? DEFAULT_BBOX_TOLERANCE_M;
  const fuzzyDist = opts.fuzzyDistM ?? DEFAULT_FUZZY_DIST_M;
  const cmpProps = opts.compareProperties !== false;
  const cmpGeom = opts.compareGeometry !== false;
  const cmpSpatial = opts.compareSpatial !== false;

  // Build per-entity index for both versions
  const v1Map = buildEntityMap(indexV1);
  const v2Map = buildEntityMap(indexV2);

  // Phase 1: GUID matching
  const v1ByGuid = new Map();
  const v2ByGuid = new Map();
  for (const e of v1Map.values()) if (e.guid) v1ByGuid.set(e.guid, e);
  for (const e of v2Map.values()) if (e.guid) v2ByGuid.set(e.guid, e);

  const matched = new Map(); // v1.expressId → v2 entry
  const unmatched1 = new Map(); // v1
  const unmatched2 = new Map(); // v2

  for (const [v1Id, e1] of v1Map) {
    if (!e1.guid) { unmatched1.set(v1Id, e1); continue; }
    const e2 = v2ByGuid.get(e1.guid);
    if (e2) matched.set(v1Id, { v1: e1, v2: e2 });
    else unmatched1.set(v1Id, e1);
  }
  for (const [v2Id, e2] of v2Map) {
    if (!e2.guid || !v1ByGuid.has(e2.guid)) unmatched2.set(v2Id, e2);
  }

  // Phase 2: fuzzy fallback — same ifcType + name + bbox center distance
  const fuzzyMatched = new Set();   // v2 expressIds that got fuzzy-matched
  for (const e1 of unmatched1.values()) {
    if (!e1.bboxCenter) continue;
    let best = null;
    let bestDist = fuzzyDist;
    for (const e2 of unmatched2.values()) {
      if (fuzzyMatched.has(e2.expressId)) continue;
      if (e1.ifcType !== e2.ifcType) continue;
      if (e1.name && e2.name && e1.name.toLowerCase() !== e2.name.toLowerCase()) continue;
      if (!e2.bboxCenter) continue;
      const d = dist3(e1.bboxCenter, e2.bboxCenter);
      if (d < bestDist) {
        bestDist = d;
        best = e2;
      }
    }
    if (best) {
      matched.set(e1.expressId, { v1: e1, v2: best, fuzzy: true });
      fuzzyMatched.add(best.expressId);
    }
  }

  // Phase 3: classify matched as modified / moved / unchanged
  const modified = [];
  const moved = [];
  let unchangedCount = 0;

  // Pre-compute spatial parent maps if needed
  let parentV1, parentV2;
  if (cmpSpatial) {
    parentV1 = buildSpatialParentMap(indexV1);
    parentV2 = buildSpatialParentMap(indexV2);
  }

  for (const { v1, v2, fuzzy } of matched.values()) {
    const changes = [];
    if (cmpProps) {
      const propDiff = diffProperties(indexV1, v1.expressId, indexV2, v2.expressId);
      if (propDiff.length > 0) changes.push({ kind: 'properties', details: propDiff });
    }
    if (cmpGeom) {
      const geomDiff = diffGeometry(v1, v2, tol);
      if (geomDiff) changes.push({ kind: 'geometry', details: geomDiff });
    }
    if (cmpSpatial && parentV1 && parentV2) {
      const p1 = parentV1.get(v1.expressId) || null;
      const p2 = parentV2.get(v2.expressId) || null;
      if ((p1 || p2) && p1?.guid !== p2?.guid) {
        moved.push({
          v1: refOf(v1), v2: refOf(v2), fuzzyMatch: !!fuzzy,
          fromParent: p1, toParent: p2,
        });
        continue; // moved entities are reported separately, not in 'modified'
      }
    }
    if (changes.length > 0) {
      modified.push({ v1: refOf(v1), v2: refOf(v2), fuzzyMatch: !!fuzzy, changes });
    } else {
      unchangedCount++;
    }
  }

  const removed = [...unmatched1.values()]
    .filter(e => !findInValues(matched, m => m.v1.expressId === e.expressId))
    .map(refOf);
  const added = [...unmatched2.values()]
    .filter(e => !fuzzyMatched.has(e.expressId))
    .map(refOf);

  return {
    added,
    removed,
    modified,
    moved,
    unchanged_count: unchangedCount,
    stats: {
      v1Count: v1Map.size,
      v2Count: v2Map.size,
      matchedCount: matched.size,
      durationMs: Math.round(performance.now() - t0),
    },
  };
}

// ---------- helpers ----------

function findInValues(map, predicate) {
  for (const v of map.values()) if (predicate(v)) return true;
  return false;
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function refOf(e) {
  return { expressId: e.expressId, ifcType: e.ifcType, name: e.name, guid: e.guid };
}

function buildEntityMap(entityIndex) {
  const map = new Map();
  for (const t of entityIndex.types()) {
    if (!PRODUCT_TYPES_INCLUDING_SPATIAL.has(t)) continue;
    for (const entity of entityIndex.byType(t)) {
      const parts = splitParams(entity.params);
      const placementId = parseRef(parts[5]);
      let bboxCenter = null;
      if (placementId) {
        try {
          const matrix = resolvePlacement(entityIndex, placementId);
          bboxCenter = [matrix.elements[12], matrix.elements[13], matrix.elements[14]];
        } catch {}
      }
      map.set(entity.expressId, {
        expressId: entity.expressId,
        ifcType: entity.type,
        name: extractEntityName(entity.params),
        guid: extractEntityGuid(entity.params),
        bboxCenter,
      });
    }
  }
  return map;
}

function diffProperties(indexV1, expressId1, indexV2, expressId2) {
  const p1 = extractPropertiesFor(indexV1, expressId1);
  const p2 = extractPropertiesFor(indexV2, expressId2);
  if (!p1 && !p2) return [];
  const flat1 = flattenProperties(p1);
  const flat2 = flattenProperties(p2);
  const allKeys = new Set([...flat1.keys(), ...flat2.keys()]);
  const diffs = [];
  for (const k of allKeys) {
    const v1 = flat1.get(k);
    const v2 = flat2.get(k);
    if (v1 === undefined && v2 !== undefined) {
      diffs.push({ path: k, change: 'added', to: v2 });
    } else if (v1 !== undefined && v2 === undefined) {
      diffs.push({ path: k, change: 'removed', from: v1 });
    } else if (String(v1) !== String(v2)) {
      diffs.push({ path: k, change: 'changed', from: v1, to: v2 });
    }
  }
  return diffs;
}

function flattenProperties(props) {
  const flat = new Map();
  if (!props) return flat;
  for (const ps of props.propertySets || []) {
    for (const p of ps.properties || []) {
      flat.set(`${ps.name}.${p.name}`, p.value);
    }
  }
  return flat;
}

function diffGeometry(e1, e2, tolM) {
  if (!e1.bboxCenter || !e2.bboxCenter) return null;
  const d = dist3(e1.bboxCenter, e2.bboxCenter);
  if (d <= tolM) return null;
  return {
    centerShiftM: d,
    fromCenter: e1.bboxCenter,
    toCenter: e2.bboxCenter,
  };
}

/** Build entityId → { ifcType, name, guid } parent storey/space map via IfcRelContainedInSpatialStructure. */
function buildSpatialParentMap(entityIndex) {
  const map = new Map();
  // Iterate IfcRelContainedInSpatialStructure rels
  for (const rel of entityIndex.byType('IfcRelContainedInSpatialStructure')) {
    const parts = splitParams(rel.params);
    // parts[4] = RelatedElements (list of refs), parts[5] = RelatingStructure
    const elementRefs = (parts[4] || '').match(/#\d+/g)?.map(s => parseInt(s.slice(1), 10)) || [];
    const structureId = parseRef(parts[5]);
    if (!structureId) continue;
    const structure = entityIndex.byExpressId(structureId);
    if (!structure) continue;
    const ref = {
      expressId: structureId,
      ifcType: structure.type,
      name: extractEntityName(structure.params),
      guid: extractEntityGuid(structure.params),
    };
    for (const id of elementRefs) map.set(id, ref);
  }
  return map;
}
