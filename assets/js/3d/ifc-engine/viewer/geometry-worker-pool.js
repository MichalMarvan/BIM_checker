// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Michal Marvan
//
// Main-thread side of the geometry workers (workers/geometry.worker.js).
//
// buildGeometryParallel() takes the products of one model (express ids in the
// order addModel would build them) and returns one slot per product with the
// SAME shape buildEntityGeometry returns — THREE.BufferGeometry items, matrix,
// diagnostics — or `undefined` for a slot the workers did not deliver (worker
// error, aborted pool, per-product exception). The caller builds those on the
// main thread, which is the full fallback path: with zero workers every slot
// is undefined and addModel behaves exactly as before.
//
// Requirements for the parallel path (canBuildInWorkers): cross-origin
// isolated page, SharedArrayBuffer-backed byte index (store mode before
// compact()), Worker available. Everything is shared, nothing re-parsed.
//
// Watchdog: a worker heartbeats every ~250 ms while building; when NO worker
// has sent anything for `idleTimeoutMs` the pool aborts (terminate all) and
// the caller falls back for the missing slots. Worker results are stored by
// slot, so the order (and with it the merged buffer, table and .bimcache) is
// independent of which worker finished first.

import * as THREE from 'three';
import { sharedMemoryAvailable } from '../parser/byte-lexer.js';

export const GEOMETRY_IDLE_TIMEOUT_MS = 60000;
export const GEOMETRY_BATCH_SIZE = 64;
export const GEOMETRY_MAX_WORKERS = 6;
// 'auto' mode stays on the main thread below this many products: starting
// N module workers (three.js + engine load, cold JIT in each) costs more than
// a small model's build (measured: 202 products — 1.0 s main vs 2.0 s workers).
export const GEOMETRY_WORKERS_MIN_PRODUCTS = 500;

/** N = min(hardwareConcurrency − 1, 6), at least 1. */
export function geometryWorkerCount() {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  return Math.max(1, Math.min(hc - 1, GEOMETRY_MAX_WORKERS));
}

/** The parallel path is possible for this index in this context. */
export function canBuildInWorkers(entityIndex) {
  return typeof Worker === 'function'
    && sharedMemoryAvailable()
    && !!(entityIndex && entityIndex._store && entityIndex._store.index && entityIndex._store.index.isShared);
}

/** Rebuild a BufferGeometry from the worker's plain form (see serializeGeometry). */
function materializeGeometry(s) {
  const g = new THREE.BufferGeometry();
  for (const a of s.attrs) {
    g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  }
  if (s.index) {
    g.setIndex(new THREE.BufferAttribute(s.index.array, s.index.itemSize));
  }
  g.userData = s.userData || {};
  // geometry-core computes the box right after building (expandItems); same
  // call on the same data gives the same box.
  g.computeBoundingBox();
  return g;
}

/**
 * Init payload for one worker: the shared index + the per-model lookups
 * geometry-core reads off the EntityIndex (all as typed arrays / numbers).
 */
function initPayload(entityIndex) {
  const store = entityIndex._store;
  const { fields } = store.index.toTransferable();
  const style = entityIndex._styleIndex;
  let styleIds = null;
  let styleColors = null;
  if (style && style.size) {
    styleIds = new Int32Array(style.size);
    styleColors = new Float64Array(style.size);
    let k = 0;
    for (const [id, color] of style) {
      styleIds[k] = id;
      styleColors[k] = color;
      k++;
    }
  }
  const ctx = entityIndex._ctxScaleMap;
  let ctxScaleIds = null;
  let ctxScales = null;
  if (ctx && ctx.size) {
    ctxScaleIds = new Int32Array(ctx.size);
    ctxScales = new Float64Array(ctx.size);
    let k = 0;
    for (const [id, s] of ctx) {
      ctxScaleIds[k] = id;
      ctxScales[k] = s;
      k++;
    }
  }
  return {
    cmd: 'init',
    bytes: store.index.bytes.buffer,
    fields,
    typeIndex: store.exportTypeIndex(),
    styleIds,
    styleColors,
    lengthScale: entityIndex._lengthScale,
    ctxScaleIds,
    ctxScales,
    planeAngleScale: typeof entityIndex._planeAngleScale === 'number' ? entityIndex._planeAngleScale : null,
  };
}

/**
 * @param {EntityIndex} entityIndex — store mode over a shared byte index
 * @param {number[]} expressIds — products in build order (one slot each)
 * @param {{
 *   shareLeafGeometry?: boolean,   // merged pipeline: instances share one BufferGeometry
 *   workers?: number,              // default geometryWorkerCount()
 *   batchSize?: number,            // default GEOMETRY_BATCH_SIZE
 *   idleTimeoutMs?: number,        // default GEOMETRY_IDLE_TIMEOUT_MS
 *   workerUrl?: string,            // default workers/geometry.worker.js
 *   onProgress?: (done: number, total: number) => void,
 * }} [opts]
 * @returns {Promise<{ results: Array<object|null|undefined>, timings: Float64Array,
 *   workersUsed: number, delivered: number, missing: number, error: string|null }>}
 */
export function buildGeometryParallel(entityIndex, expressIds, opts = {}) {
  const total = expressIds.length;
  const results = new Array(total);
  const timings = new Float64Array(total);
  const summary = { results, timings, workersUsed: 0, delivered: 0, missing: total, error: null };
  if (total === 0 || !canBuildInWorkers(entityIndex)) {
    summary.error = total === 0 ? null : 'parallel geometry unavailable (not cross-origin isolated or index not shared)';
    return Promise.resolve(summary);
  }
  const workerCount = Math.max(1, Math.min(opts.workers || geometryWorkerCount(), total));
  const batchSize = Math.max(1, opts.batchSize || GEOMETRY_BATCH_SIZE);
  const idleTimeoutMs = opts.idleTimeoutMs || GEOMETRY_IDLE_TIMEOUT_MS;
  const workerUrl = opts.workerUrl || new URL('../workers/geometry.worker.js', import.meta.url).href;
  const shareLeaves = !!opts.shareLeafGeometry;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  return new Promise((resolve) => {
    const workers = [];
    const leafCache = new Map();   // leafId → BufferGeometry (first arrival wins; data is deterministic)
    let nextBatch = 0;
    let inFlight = 0;
    let done = false;
    let timer = null;
    let payload;

    const finish = (error) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      for (const w of workers) {
        w.terminate();
      }
      workers.length = 0;
      summary.error = error || null;
      summary.missing = total - summary.delivered;
      resolve(summary);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(`geometry workers produced no message for ${idleTimeoutMs / 1000}s`), idleTimeoutMs);
    };

    const materialize = (msg) => {
      const geoms = msg.geoms.map((s) => {
        if (s.leafId !== undefined) {
          let g = leafCache.get(s.leafId);
          if (!g) {
            g = materializeGeometry(s);
            leafCache.set(s.leafId, g);
          }
          return g;
        }
        return materializeGeometry(s);
      });
      const out = new Array(msg.results.length);
      for (let k = 0; k < msg.results.length; k++) {
        const r = msg.results[k];
        if (r === null) {
          out[k] = null;
          continue;
        }
        if (!r || r.error) {
          out[k] = undefined;
          continue;
        }
        const items = [];
        let ok = true;
        for (const it of r.items) {
          let g = it.leafRef !== undefined ? leafCache.get(it.leafRef) : geoms[it.geomRef];
          if (!g) {
            ok = false;
            break;
          }
          // Legacy per-mesh path bakes matrices INTO the buffers later, so
          // every instance of a leaf needs its own copy (geometry-core does
          // the same clone when _shareLeafGeometry is off).
          if (!shareLeaves && g.userData && g.userData.leafId !== undefined) {
            g = g.clone();
          }
          items.push({
            bufferGeometry: g,
            bbox: g.boundingBox,
            color: it.color,
            parentMatrix: it.parentMatrix ? new THREE.Matrix4().fromArray(it.parentMatrix) : null,
          });
        }
        if (!ok) {
          out[k] = undefined;
          continue;
        }
        out[k] = {
          matrix: new THREE.Matrix4().fromArray(r.matrix),
          items,
          diagnostics: {
            unsupportedRepresentationTypes: new Set(r.diagnostics.unsupportedRepresentationTypes),
            fallbackGeometryCount: r.diagnostics.fallbackGeometryCount,
            exactBooleanDifferenceCount: r.diagnostics.exactBooleanDifferenceCount,
            recursionLimitCount: r.diagnostics.recursionLimitCount,
            invalidReferenceCount: r.diagnostics.invalidReferenceCount,
          },
          ms: r.ms,
        };
      }
      return out;
    };

    const dispatch = (w) => {
      if (done) {
        return;
      }
      if (nextBatch >= total) {
        if (inFlight === 0) {
          finish(null);
        }
        return;
      }
      const start = nextBatch;
      const end = Math.min(total, start + batchSize);
      nextBatch = end;
      const ids = new Int32Array(end - start);
      for (let i = start; i < end; i++) {
        ids[i - start] = expressIds[i];
      }
      w.__busy = true;
      inFlight++;
      w.postMessage({ cmd: 'build', batchId: start, ids }, [ids.buffer]);
    };

    const onMessage = (w, e) => {
      const msg = e.data;
      if (done) {
        return;
      }
      arm();
      if (!msg || msg.progress) {
        return;
      }
      if (msg.ready) {
        w.__ready = true;
        dispatch(w);
        return;
      }
      if (msg.ok === false) {
        finish(`geometry worker error: ${msg.error}`);
        return;
      }
      if (typeof msg.batchId === 'number') {
        inFlight--;
        w.__busy = false;
        let out;
        try {
          out = materialize(msg);
        } catch (err) {
          finish(`geometry result unusable: ${err.message}`);
          return;
        }
        const start = msg.batchId;
        for (let k = 0; k < out.length; k++) {
          const slot = start + k;
          if (slot >= total) {
            break;
          }
          if (out[k] !== undefined) {
            results[slot] = out[k];
            timings[slot] = out[k] ? out[k].ms : 0;
            summary.delivered++;
          }
        }
        if (onProgress) {
          onProgress(summary.delivered, total);
        }
        dispatch(w);
      }
    };

    try {
      payload = initPayload(entityIndex);
      for (let i = 0; i < workerCount; i++) {
        const w = new Worker(workerUrl, { type: 'module' });
        w.__ready = false;
        w.__busy = false;
        w.onmessage = (e) => onMessage(w, e);
        w.onerror = (e) => {
          // One broken worker costs its in-flight batch (those slots stay
          // undefined → main thread); the others carry on.
          if (done) {
            return;
          }
          w.terminate();
          const idx = workers.indexOf(w);
          if (idx >= 0) {
            workers.splice(idx, 1);
          }
          if (w.__busy) {
            inFlight--;
          }
          w.__busy = false;
          if (workers.length === 0) {
            finish(`geometry worker failed: ${e && e.message ? e.message : 'worker error'}`);
          } else if (inFlight === 0 && nextBatch >= total) {
            finish(null);
          }
        };
        workers.push(w);
        w.postMessage(payload);
      }
      summary.workersUsed = workers.length;
      arm();
    } catch (err) {
      finish(`geometry workers could not start: ${err.message}`);
    }
  });
}
