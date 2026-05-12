// Phase 6.13.1 — RAG index. Multi-level chunks + IDB cache + cosine search.
//
// Chunk levels (each entity contributes to multiple):
//   level=entity       — 1 chunk per IFC entity (most granular)
//   level=storey       — 1 chunk per IfcBuildingStorey aggregating its contents
//   level=model        — 1 chunk per loaded model with overall summary
//
// Each chunk: { id, modelId, level, refExpressId?, ifcType?, text, embedding }
//
// IDB store keyed by `${modelId}|${chunkId}` so multi-model federation is fine.
// Content hash from model meta (entityCount + typeCount + name) used as cache
// invalidator — change anything → re-index.

import { embed, embedBatch, cosineSim } from './rag-embedder.js';
import { extractEntityName, extractEntityGuid } from '../parser/entity-name.js';
import { extractPropertiesFor } from '../properties/psets.js';
import { extractSpatialHierarchy, collectAllElementIds } from '../properties/spatial.js';
import { PRODUCT_TYPES } from '../constants.js';
import { splitParams } from '../parser/step-parser.js';

const DB_NAME = 'bim_ai_viewer_rag';
const DB_VERSION = 1;
const STORE = 'embeddings';
const META_STORE = 'meta';

// ---------- IDB ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('modelId', 'modelId', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'modelId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getIdbMeta(modelId) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(modelId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

async function putIdbMeta(record) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(META_STORE, 'readwrite');
      t.objectStore(META_STORE).put(record);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  });
}

async function getIdbChunks(modelId) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(STORE, 'readonly');
      const idx = t.objectStore(STORE).index('modelId');
      const req = idx.getAll(modelId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

async function putIdbChunks(chunks) {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      for (const c of chunks) s.put(c);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  });
}

async function clearIdbModel(modelId) {
  const chunks = await getIdbChunks(modelId);
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      for (const c of chunks) s.delete(c.key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  });
}

// ---------- Chunk text builders ----------

/** Build short descriptive text for one entity. */
function buildEntityText(entityIndex, expressId, parentName) {
  const e = entityIndex.byExpressId(expressId);
  if (!e) return '';
  const name = extractEntityName(e.params) || `#${expressId}`;
  const ifcType = e.type;
  // Pset properties (top 5 by name, to keep chunk short)
  const props = extractPropertiesFor(entityIndex, expressId);
  const propStrs = [];
  if (props?.propertySets) {
    for (const ps of props.propertySets) {
      for (const p of ps.properties) {
        if (p.value != null && propStrs.length < 8) {
          propStrs.push(`${p.name}=${p.value}`);
        }
      }
    }
  }
  const parts = [ifcType, name];
  if (parentName) parts.push(`v ${parentName}`);
  if (propStrs.length) parts.push(propStrs.join(', '));
  return parts.join(' · ');
}

/** Build a storey-level summary chunk. */
function buildStoreyText(node, entityIndex) {
  const ids = collectAllElementIds(node);
  // Count by IFC type
  const typeCount = new Map();
  for (const id of ids) {
    const e = entityIndex.byExpressId(id);
    if (!e) continue;
    typeCount.set(e.type, (typeCount.get(e.type) || 0) + 1);
  }
  const typeStr = [...typeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t, c]) => `${c}× ${t}`)
    .join(', ');
  const name = node.name || `storey #${node.expressId}`;
  return `Patro ${name}: ${ids.length} prvků celkem. Obsahuje: ${typeStr}.`;
}

/** Build a per-model summary chunk. */
function buildModelText(modelMeta, entityIndex, allChunks) {
  // Aggregate type stats
  const typeCount = new Map();
  for (const t of entityIndex.types()) {
    if (!PRODUCT_TYPES.has(t)) continue;
    const cnt = entityIndex.byType(t).length;
    if (cnt > 0) typeCount.set(t, cnt);
  }
  const top = [...typeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, c]) => `${c}× ${t}`)
    .join(', ');
  return `Model ${modelMeta.name} (schéma ${modelMeta.schema}, ${modelMeta.entityCount} entit, ${modelMeta.typeCount} typů). Hlavní obsah: ${top}.`;
}

// ---------- Public ----------

/**
 * Build content hash from model meta — used as cache key invalidator.
 * Same hash = re-use cached embeddings.
 */
function contentHash(modelMeta) {
  return `${modelMeta.name}|${modelMeta.schema}|${modelMeta.entityCount}|${modelMeta.typeCount}`;
}

/**
 * Compute parent storey/space name for an entity expressId.
 * Returns null if entity is not contained in a spatial structure.
 */
function buildSpatialParentMap(entityIndex) {
  const map = new Map();
  for (const rel of entityIndex.byType('IfcRelContainedInSpatialStructure')) {
    const parts = splitParams(rel.params);
    const elementRefs = (parts[4] || '').match(/#\d+/g)?.map(s => parseInt(s.slice(1), 10)) || [];
    const structureRef = (parts[5] || '').match(/#(\d+)/)?.[1];
    if (!structureRef) continue;
    const structureId = parseInt(structureRef, 10);
    const structure = entityIndex.byExpressId(structureId);
    if (!structure) continue;
    const name = extractEntityName(structure.params) || structure.type;
    for (const id of elementRefs) map.set(id, name);
  }
  return map;
}

/**
 * Build (or load from cache) the multi-level chunk index for a model.
 * Calls progressCb(stage, n, total) periodically.
 *
 * @param {string} modelId
 * @param {{ meta: ModelMeta, index: EntityIndex }} model
 * @param {(stage: string, n: number, total: number) => void} progressCb
 * @returns {Promise<Array<Chunk>>}
 */
export async function indexModel(modelId, model, progressCb = () => {}) {
  const hash = contentHash(model.meta);
  // Try cache
  const meta = await getIdbMeta(modelId);
  if (meta && meta.contentHash === hash) {
    progressCb('loading-cache', 0, 0);
    const cached = await getIdbChunks(modelId);
    if (cached.length > 0) {
      // IndexedDB serializes Float32Array as plain array — restore type
      for (const c of cached) {
        if (Array.isArray(c.embedding)) c.embedding = new Float32Array(c.embedding);
      }
      progressCb('done', cached.length, cached.length);
      return cached;
    }
  }

  // Re-index
  progressCb('preparing', 0, 0);
  const chunks = [];
  const parentMap = buildSpatialParentMap(model.index);

  // Entity-level chunks (all PRODUCT_TYPES)
  let totalEntities = 0;
  const entityIds = [];
  for (const t of model.index.types()) {
    if (!PRODUCT_TYPES.has(t)) continue;
    for (const e of model.index.byType(t)) {
      entityIds.push({ expressId: e.expressId, ifcType: e.type });
      totalEntities++;
    }
  }
  progressCb('entities', 0, totalEntities);

  for (let i = 0; i < entityIds.length; i++) {
    const { expressId, ifcType } = entityIds[i];
    const text = buildEntityText(model.index, expressId, parentMap.get(expressId));
    if (!text) continue;
    const e = model.index.byExpressId(expressId);
    chunks.push({
      key: `${modelId}|entity:${expressId}`,
      modelId,
      level: 'entity',
      refExpressId: expressId,
      ifcType,
      name: extractEntityName(e.params) || null,
      guid: extractEntityGuid(e.params) || null,
      text,
      embedding: null,  // filled below
    });
    if ((i & 31) === 0) progressCb('entities', i + 1, totalEntities);
  }

  // Storey-level chunks
  const tree = extractSpatialHierarchy(model.index);
  if (tree) {
    function walkStoreys(node) {
      if (node.type === 'IFCBUILDINGSTOREY') {
        const text = buildStoreyText(node, model.index);
        chunks.push({
          key: `${modelId}|storey:${node.expressId}`,
          modelId,
          level: 'storey',
          refExpressId: node.expressId,
          ifcType: 'IFCBUILDINGSTOREY',
          name: node.name || null,
          text,
          embedding: null,
        });
      }
      for (const c of node.children) walkStoreys(c);
    }
    walkStoreys(tree);
  }

  // Model-level chunk
  const modelText = buildModelText(model.meta, model.index, chunks);
  chunks.push({
    key: `${modelId}|model`,
    modelId,
    level: 'model',
    refExpressId: null,
    ifcType: 'PROJECT',
    name: model.meta.name,
    text: modelText,
    embedding: null,
  });

  // Embed all texts
  progressCb('embedding', 0, chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].embedding = await embed(chunks[i].text);
    if ((i & 7) === 0) progressCb('embedding', i + 1, chunks.length);
  }
  progressCb('embedding', chunks.length, chunks.length);

  // Persist
  await clearIdbModel(modelId);
  // IDB serializes Float32Array as plain array, but we restore on load
  await putIdbChunks(chunks.map(c => ({
    ...c,
    embedding: Array.from(c.embedding),
  })));
  await putIdbMeta({ modelId, contentHash: hash, chunkCount: chunks.length, indexedAt: Date.now() });
  progressCb('done', chunks.length, chunks.length);

  // Restore typed array for in-memory return
  for (const c of chunks) {
    if (Array.isArray(c.embedding)) c.embedding = new Float32Array(c.embedding);
  }
  return chunks;
}

/**
 * Cosine-similarity search across pre-built chunks.
 * @param {Float32Array} queryVec
 * @param {Array<Chunk>} chunks
 * @param {{ k?: number, level?: 'entity'|'storey'|'model'|null, modelId?: string }} opts
 * @returns {Array<{ chunk: Chunk, score: number }>}
 */
export function searchChunks(queryVec, chunks, opts = {}) {
  const k = opts.k || 10;
  const filtered = chunks.filter(c => {
    if (opts.level && c.level !== opts.level) return false;
    if (opts.modelId && c.modelId !== opts.modelId) return false;
    return true;
  });
  const scored = [];
  for (const c of filtered) {
    if (!c.embedding) continue;
    const score = cosineSim(queryVec, c.embedding);
    scored.push({ chunk: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Drop all RAG cache for a model (e.g. on unload). */
export async function dropModelCache(modelId) {
  await clearIdbModel(modelId);
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const t = db.transaction(META_STORE, 'readwrite');
      t.objectStore(META_STORE).delete(modelId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  });
}
