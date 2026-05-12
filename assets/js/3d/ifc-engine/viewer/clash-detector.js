// Phase 6.7 — Clash detector.
//
// Two-phase: bbox broad-phase + optional triangle-vs-triangle narrow-phase
// via three-mesh-bvh (lazy-loaded).
//
// detectClashes(viewer, opts) → { clashes, stats }
//
// opts:
//   method:    'bbox' | 'mesh'
//   pairing:   'all' | 'types' | 'sets'
//   typeRules: [{ a: 'IfcWall', b: 'IfcPipeFitting' }, ...]
//   setItems:  { a: [{modelId, expressId}], b: [{modelId, expressId}] }
//   clashTypes:        ['hard', 'clearance', 'duplicate']
//   clearanceMm:       50    // gap < this counts as clearance
//   duplicateToleranceMm: 100 // bbox center distance < this AND same ifcType
//   modelUnitsToMm:    1000  // engine works in meters by default → 1m=1000mm
//
// clashes:
//   { id, type: 'hard'|'clearance'|'duplicate',
//     a: { modelId, expressId, ifcType, name },
//     b: { modelId, expressId, ifcType, name },
//     distance: number,        // mm; 0 for hard, >0 for clearance, ~0 for duplicate
//     clashPoint: [x,y,z],     // bbox-overlap center or midpoint between bboxes
//   }

import * as THREE from 'three';

let _bvhPromise = null;
async function loadBvh() {
  if (!_bvhPromise) {
    _bvhPromise = import('https://esm.sh/three-mesh-bvh@0.7.4').then(m => m);
  }
  return _bvhPromise;
}

function bboxOf(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return box;
}

function bboxIntersects(a, b) {
  return !(a.max.x < b.min.x || a.min.x > b.max.x ||
           a.max.y < b.min.y || a.min.y > b.max.y ||
           a.max.z < b.min.z || a.min.z > b.max.z);
}

/** Minimum distance between two non-overlapping AABBs in 3D, or 0 if overlapping. */
function bboxDistance(a, b) {
  const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function bboxOverlapCenter(a, b) {
  const min = new THREE.Vector3(
    Math.max(a.min.x, b.min.x),
    Math.max(a.min.y, b.min.y),
    Math.max(a.min.z, b.min.z),
  );
  const max = new THREE.Vector3(
    Math.min(a.max.x, b.max.x),
    Math.min(a.max.y, b.max.y),
    Math.min(a.max.z, b.max.z),
  );
  return [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2];
}

function midpointBetweenBoxes(a, b) {
  const ca = a.getCenter(new THREE.Vector3());
  const cb = b.getCenter(new THREE.Vector3());
  return [(ca.x + cb.x) / 2, (ca.y + cb.y) / 2, (ca.z + cb.z) / 2];
}

function entityKey(modelId, expressId) {
  return `${modelId}|${expressId}`;
}

function buildEntityList(viewer, predicate) {
  // Group meshes by entity (modelId, expressId) — one entity may have
  // multiple meshes (multiple representations).
  const entities = new Map(); // key → { modelId, expressId, ifcType, meshes, bbox }
  for (const { meshes } of viewer._models.values()) {
    for (const mesh of meshes) {
      const ud = mesh.userData;
      if (!ud?.modelId || ud.expressId == null) continue;
      const key = entityKey(ud.modelId, ud.expressId);
      let entry = entities.get(key);
      if (!entry) {
        entry = {
          modelId: ud.modelId, expressId: ud.expressId, ifcType: ud.ifcType,
          meshes: [], bbox: new THREE.Box3(),
        };
        entities.set(key, entry);
      }
      entry.meshes.push(mesh);
      const meshBox = bboxOf(mesh);
      entry.bbox.union(meshBox);
    }
  }
  const list = [...entities.values()];
  return predicate ? list.filter(predicate) : list;
}

function buildPairs(entities, opts) {
  const pairs = [];
  if (opts.pairing === 'all') {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) pairs.push([entities[i], entities[j]]);
    }
  } else if (opts.pairing === 'types') {
    const rules = opts.typeRules || [];
    if (rules.length === 0) return [];
    const byType = new Map();
    for (const e of entities) {
      const t = String(e.ifcType || '').toUpperCase();
      let arr = byType.get(t);
      if (!arr) { arr = []; byType.set(t, arr); }
      arr.push(e);
    }
    const seen = new Set();
    for (const r of rules) {
      const ta = String(r.a).toUpperCase();
      const tb = String(r.b).toUpperCase();
      const setA = byType.get(ta) || [];
      const setB = byType.get(tb) || [];
      for (const a of setA) {
        for (const b of setB) {
          if (a === b) continue;
          const k1 = `${a.modelId}|${a.expressId}|${b.modelId}|${b.expressId}`;
          const k2 = `${b.modelId}|${b.expressId}|${a.modelId}|${a.expressId}`;
          if (seen.has(k1) || seen.has(k2)) continue;
          seen.add(k1);
          pairs.push([a, b]);
        }
      }
    }
  } else if (opts.pairing === 'sets') {
    const a = opts.setItems?.a || [];
    const b = opts.setItems?.b || [];
    const aKeys = new Set(a.map(it => entityKey(it.modelId, it.expressId)));
    const bKeys = new Set(b.map(it => entityKey(it.modelId, it.expressId)));
    const aEntities = entities.filter(e => aKeys.has(entityKey(e.modelId, e.expressId)));
    const bEntities = entities.filter(e => bKeys.has(entityKey(e.modelId, e.expressId)));
    const seen = new Set();
    for (const ea of aEntities) {
      for (const eb of bEntities) {
        if (ea === eb) continue;
        const k1 = `${ea.modelId}|${ea.expressId}|${eb.modelId}|${eb.expressId}`;
        const k2 = `${eb.modelId}|${eb.expressId}|${ea.modelId}|${ea.expressId}`;
        if (seen.has(k1) || seen.has(k2)) continue;
        seen.add(k1);
        pairs.push([ea, eb]);
      }
    }
  }
  return pairs;
}

async function ensureMeshBvh(mesh) {
  if (mesh.geometry.boundsTree) return;
  const bvh = await loadBvh();
  // Patch THREE prototype if needed — the lib provides install function
  if (typeof bvh.computeBoundsTree === 'function') {
    THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = bvh.disposeBoundsTree;
    THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
  }
  mesh.geometry.computeBoundsTree();
}

async function meshIntersects(meshA, meshB) {
  await ensureMeshBvh(meshA);
  await ensureMeshBvh(meshB);
  meshA.updateMatrixWorld(true);
  meshB.updateMatrixWorld(true);
  // BVH.intersectsBox uses local-space box; transform mesh A's geometry into
  // mesh B's local space and check intersection.
  const bvhA = meshA.geometry.boundsTree;
  // Combined matrix: A_local → B_local
  const matrix = new THREE.Matrix4()
    .copy(meshB.matrixWorld).invert().multiply(meshA.matrixWorld);
  return bvhA.intersectsGeometry(meshB.geometry, matrix);
}

export async function detectClashes(viewer, opts) {
  const stats = { entitiesScanned: 0, pairsTested: 0, clashesFound: 0, durationMs: 0 };
  const t0 = performance.now();

  const method = opts.method || 'bbox';
  const clashTypes = new Set(opts.clashTypes || ['hard']);
  const clearanceM = (opts.clearanceMm ?? 0) / (opts.modelUnitsToMm || 1000);
  const dupTolM = (opts.duplicateToleranceMm ?? 100) / (opts.modelUnitsToMm || 1000);

  const entities = buildEntityList(viewer);
  stats.entitiesScanned = entities.length;
  const pairs = buildPairs(entities, opts);
  stats.pairsTested = pairs.length;

  const clashes = [];
  let id = 0;
  for (const [a, b] of pairs) {
    const dist = bboxDistance(a.bbox, b.bbox);
    let isHard = dist === 0 && bboxIntersects(a.bbox, b.bbox);
    let isClearance = !isHard && dist > 0 && dist <= clearanceM;
    let isDuplicate = false;

    if (clashTypes.has('duplicate') && a.ifcType === b.ifcType) {
      const ca = a.bbox.getCenter(new THREE.Vector3());
      const cb = b.bbox.getCenter(new THREE.Vector3());
      if (ca.distanceTo(cb) <= dupTolM) isDuplicate = true;
    }

    if (!isHard && !isClearance && !isDuplicate) continue;

    // Mesh narrow-phase for hard: refine bbox-positive into actual triangle test
    if (isHard && method === 'mesh') {
      let actualHit = false;
      try {
        outer: for (const mA of a.meshes) {
          for (const mB of b.meshes) {
            if (await meshIntersects(mA, mB)) { actualHit = true; break outer; }
          }
        }
      } catch (err) {
        console.warn('Mesh BVH intersection failed:', err);
        actualHit = true; // fall back to bbox-positive
      }
      if (!actualHit) {
        // Bbox said clash but triangles don't actually intersect — possibly
        // demote to clearance if within range, otherwise drop.
        const refinedDist = 0; // unknown precise distance; conservatively 0
        if (clearanceM > 0 && refinedDist <= clearanceM && clashTypes.has('clearance')) {
          isHard = false;
          isClearance = true;
        } else {
          continue;
        }
      }
    }

    let type, distMm;
    if (isHard && clashTypes.has('hard')) {
      type = 'hard'; distMm = 0;
    } else if (isClearance && clashTypes.has('clearance')) {
      type = 'clearance'; distMm = dist * (opts.modelUnitsToMm || 1000);
    } else if (isDuplicate) {
      type = 'duplicate'; distMm = 0;
    } else continue;

    const clashPoint = isHard
      ? bboxOverlapCenter(a.bbox, b.bbox)
      : midpointBetweenBoxes(a.bbox, b.bbox);

    clashes.push({
      id: `clash_${++id}`,
      type,
      a: { modelId: a.modelId, expressId: a.expressId, ifcType: a.ifcType },
      b: { modelId: b.modelId, expressId: b.expressId, ifcType: b.ifcType },
      distance: distMm,
      clashPoint,
    });
  }
  stats.clashesFound = clashes.length;
  stats.durationMs = Math.round(performance.now() - t0);
  return { clashes, stats };
}
