// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Michal Marvan
//
// Geometry worker: runs buildEntityGeometry over a SHARED byte index.
//
// The main thread parses once (parser.worker.js over a SharedArrayBuffer) and
// hands every geometry worker the same bytes + columns — nothing is copied or
// re-parsed here; the worker only builds its own EntityIndex view (store
// mode) over them. Products arrive in batches of express ids, results go back
// as plain typed arrays (transferred, zero copy), and the pool on the main
// thread rebuilds THREE.BufferGeometry objects from them. The build itself is
// exactly geometry-core's code, so the vertex data is bit-identical to a
// main-thread build.
//
// Protocol:
//   inbound  { cmd: 'init', bytes, fields, typeIndex, styleIds, styleColors,
//              lengthScale, ctxScaleIds, ctxScales, planeAngleScale }
//            { cmd: 'build', batchId, ids: Int32Array }
//   outbound { ready: true }
//            { progress: true }                 — heartbeat (rate limited)
//            { batchId, results: [...], geoms: [...] }  — see serialize*
//            { ok: false, error }               — fatal (init failed)
//
// Instanced leaves (IfcMappedItem → geometry-core's leaf cache, marked by
// userData.leafId) are sent ONCE per worker with copied arrays (the cache keeps
// the original) and referenced by leafId afterwards; everything else is
// transferred.

import { StepByteIndex } from '../parser/byte-lexer.js';
import { EntityIndex } from '../parser/entity-index.js';
import { buildEntityGeometry } from '../geometry/geometry-core.js';

const HEARTBEAT_MS = 250;

let entityIndex = null;
const sentLeaves = new Set();
let lastHeartbeat = 0;

function heartbeat() {
  const now = performance.now();
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    self.postMessage({ progress: true });
  }
}

function init(msg) {
  const byteIndex = StepByteIndex.fromTransferable(msg.bytes, msg.fields);
  entityIndex = new EntityIndex(byteIndex);
  if (msg.typeIndex) {
    entityIndex._store.importTypeIndex(msg.typeIndex);
  }
  const style = new Map();
  if (msg.styleIds) {
    for (let i = 0; i < msg.styleIds.length; i++) {
      style.set(msg.styleIds[i], msg.styleColors[i]);
    }
  }
  entityIndex._styleIndex = style;
  entityIndex._lengthScale = msg.lengthScale;
  if (msg.ctxScaleIds) {
    const ctx = new Map();
    for (let i = 0; i < msg.ctxScaleIds.length; i++) {
      ctx.set(msg.ctxScaleIds[i], msg.ctxScales[i]);
    }
    entityIndex._ctxScaleMap = ctx;
  } else {
    entityIndex._ctxScaleMap = null;
  }
  if (typeof msg.planeAngleScale === 'number') {
    entityIndex._planeAngleScale = msg.planeAngleScale;
  }
  // Leaves are serialised anyway; sharing the cached object avoids a clone
  // per instance here (the pool clones on the main thread when needed).
  entityIndex._shareLeafGeometry = true;
}

/**
 * Plain form of a BufferGeometry: attribute arrays, index, userData. `copy`
 * keeps the worker-side arrays intact (cached leaves); otherwise the buffers
 * are listed in `transfer`.
 */
function serializeGeometry(geom, copy, transfer, seen) {
  const attrs = [];
  for (const name of Object.keys(geom.attributes)) {
    const a = geom.attributes[name];
    const array = copy ? a.array.slice() : a.array;
    attrs.push({ name, array, itemSize: a.itemSize, normalized: !!a.normalized });
    if (!copy && !seen.has(array.buffer)) {
      seen.add(array.buffer);
      transfer.push(array.buffer);
    }
  }
  let index = null;
  if (geom.index) {
    const array = copy ? geom.index.array.slice() : geom.index.array;
    index = { array, itemSize: geom.index.itemSize };
    if (!copy && !seen.has(array.buffer)) {
      seen.add(array.buffer);
      transfer.push(array.buffer);
    }
  }
  return { attrs, index, userData: geom.userData || {} };
}

function build(msg) {
  const ids = msg.ids;
  const results = new Array(ids.length);
  const geoms = [];
  const transfer = [];
  const seen = new Set();
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    const t0 = performance.now();
    let r;
    try {
      r = buildEntityGeometry(entityIndex, id);
    } catch (err) {
      // The main thread rebuilds this product itself (and sees the same error).
      results[k] = { error: err && err.message ? err.message : String(err) };
      heartbeat();
      continue;
    }
    if (!r) {
      results[k] = null;
      heartbeat();
      continue;
    }
    const items = [];
    for (const item of r.items) {
      const g = item.bufferGeometry;
      const leafId = g.userData ? g.userData.leafId : undefined;
      let ref;
      if (leafId !== undefined) {
        if (sentLeaves.has(leafId)) {
          ref = { leafRef: leafId };
        } else {
          sentLeaves.add(leafId);
          geoms.push({ ...serializeGeometry(g, true, transfer, seen), leafId });
          ref = { geomRef: geoms.length - 1 };
        }
      } else {
        geoms.push(serializeGeometry(g, false, transfer, seen));
        ref = { geomRef: geoms.length - 1 };
      }
      items.push({
        ...ref,
        color: item.color,
        parentMatrix: item.parentMatrix ? Array.from(item.parentMatrix.elements) : null,
      });
    }
    const d = r.diagnostics;
    results[k] = {
      matrix: Array.from(r.matrix.elements),
      items,
      diagnostics: {
        unsupportedRepresentationTypes: [...d.unsupportedRepresentationTypes],
        fallbackGeometryCount: d.fallbackGeometryCount,
        exactBooleanDifferenceCount: d.exactBooleanDifferenceCount,
        recursionLimitCount: d.recursionLimitCount,
        invalidReferenceCount: d.invalidReferenceCount,
      },
      ms: performance.now() - t0,
    };
    heartbeat();
  }
  self.postMessage({ batchId: msg.batchId, results, geoms }, transfer);
}

self.onmessage = (event) => {
  const msg = event.data;
  try {
    if (msg && msg.cmd === 'init') {
      init(msg);
      self.postMessage({ ready: true });
    } else if (msg && msg.cmd === 'build') {
      if (!entityIndex) {
        throw new Error('build before init');
      }
      build(msg);
    } else {
      throw new Error(`unknown cmd: ${msg && msg.cmd}`);
    }
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
