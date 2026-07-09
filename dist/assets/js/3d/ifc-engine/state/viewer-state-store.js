// IndexedDB store pro stav vieweru per model — měření + řezné roviny, plus
// uložené pohledy (views). Samostatná malá DB (ne BIMStorage) po vzoru
// cache/cache-store.js: vlastní openDb()/tx() promise helpery, jedna sdílená
// _dbPromise (bezpečné při souběžném otevírání).
//
// Store `modelState` (keyPath contentHash): stav navázaný na konkrétní model.
// Store `views` (keyPath id, index `models` multiEntry): pohledy sdílené napříč
// modely. Pohled s prázdným polem `models` (legacy migrace) není přes multiEntry
// index dosažitelný — index nad prázdným polem neindexuje nic — proto
// viewsForModels() čte celý store jednou a filtruje v JS. Store je malý, tak je
// tato jednoduchá a korektní varianta v pořádku.

const DB_NAME = 'bim-viewer-state';
const STORE_STATE = 'modelState';
const STORE_VIEWS = 'views';
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'contentHash' });
      }
      if (!db.objectStoreNames.contains(STORE_VIEWS)) {
        const views = db.createObjectStore(STORE_VIEWS, { keyPath: 'id' });
        views.createIndex('models', 'models', { multiEntry: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

function tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('idb tx aborted'));
  });
}

// ── modelState ──────────────────────────────────────────────────────────

/** @returns {Promise<object|null>} */
export async function stateGet(contentHash) {
  try {
    const db = await openDb();
    const rec = await tx(db, STORE_STATE, 'readonly', s => s.get(contentHash));
    return rec || null;
  } catch (e) {
    console.warn('[viewer-state] stateGet failed:', e);
    return null;
  }
}

/** Uloží stav modelu; doc se naklonuje a doplní se contentHash (originál se nemění). */
export async function statePut(contentHash, doc) {
  const rec = { ...(doc || {}), contentHash };
  const db = await openDb();
  await tx(db, STORE_STATE, 'readwrite', s => s.put(rec));
  return true;
}

export async function stateDelete(contentHash) {
  try {
    const db = await openDb();
    await tx(db, STORE_STATE, 'readwrite', s => s.delete(contentHash));
  } catch (e) {
    console.warn('[viewer-state] stateDelete failed:', e);
  }
}

// ── views ───────────────────────────────────────────────────────────────

export async function viewPut(view) {
  const db = await openDb();
  await tx(db, STORE_VIEWS, 'readwrite', s => s.put(view));
  return true;
}

export async function viewDelete(id) {
  try {
    const db = await openDb();
    await tx(db, STORE_VIEWS, 'readwrite', s => s.delete(id));
  } catch (e) {
    console.warn('[viewer-state] viewDelete failed:', e);
  }
}

/** @returns {Promise<object[]>} */
export async function viewsAll() {
  try {
    const db = await openDb();
    const all = await tx(db, STORE_VIEWS, 'readonly', s => s.getAll());
    return all || [];
  } catch (e) {
    console.warn('[viewer-state] viewsAll failed:', e);
    return [];
  }
}

/**
 * Pohledy relevantní pro dané modely: union přes shodu v poli `models`, plus
 * legacy pohledy s prázdným `models` (ty index nezachytí). Čte store jednou a
 * filtruje v JS — dedup dle id je tím zaručen automaticky.
 * @returns {Promise<object[]>}
 */
export async function viewsForModels(contentHashes) {
  const wanted = new Set(contentHashes || []);
  const all = await viewsAll();
  return all.filter(v => {
    const models = Array.isArray(v.models) ? v.models : [];
    if (models.length === 0) return true;            // legacy — vždy zahrnout
    return models.some(h => wanted.has(h));
  });
}
