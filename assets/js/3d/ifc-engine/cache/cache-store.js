// IndexedDB store for .bimcache blobs, keyed by SHA-256 of the source IFC.
//
// Separate small DB (not BIMStorage) — the cache is disposable: losing it
// only costs a re-parse. put() retries once after evicting the least
// recently used entries when the browser signals quota pressure.

const DB_NAME = 'bim-model-cache';
const STORE = 'models';
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'hash' });
        store.createIndex('lastUsed', 'lastUsed');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('idb tx aborted'));
  });
}

/** @returns {Promise<ArrayBuffer|null>} */
export async function cacheGet(hash) {
  try {
    const db = await openDb();
    const rec = await tx(db, 'readonly', s => s.get(hash));
    if (!rec) return null;
    // touch lastUsed (fire and forget)
    tx(db, 'readwrite', s => s.put({ ...rec, lastUsed: Date.now() })).catch(() => {});
    return rec.buf;
  } catch (e) {
    console.warn('[model-cache] get failed:', e);
    return null;
  }
}

/** Store a serialized model. Evicts LRU entries once on quota pressure. */
export async function cachePut(hash, buf, meta = {}) {
  const rec = { hash, buf, name: meta.name || '', size: buf.byteLength, created: Date.now(), lastUsed: Date.now() };
  try {
    const db = await openDb();
    try {
      await tx(db, 'readwrite', s => s.put(rec));
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e)))) {
        await evictLru(db, Math.max(rec.size * 2, 256 * 1048576));
        await tx(db, 'readwrite', s => s.put(rec));
      } else {
        throw e;
      }
    }
    return true;
  } catch (e) {
    console.warn('[model-cache] put failed:', e);
    return false;
  }
}

async function evictLru(db, bytesToFree) {
  const all = await tx(db, 'readonly', s => s.getAll());
  const entries = (all || []).sort((a, b) => a.lastUsed - b.lastUsed);
  let freed = 0;
  for (const rec of entries) {
    if (freed >= bytesToFree) break;
    await tx(db, 'readwrite', s => s.delete(rec.hash));
    freed += rec.size || 0;
  }
  console.log(`[model-cache] evicted ${Math.round(freed / 1048576)} MB (LRU)`);
}

export async function cacheDelete(hash) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', s => s.delete(hash));
  } catch (e) { /* disposable cache — ignore */ }
}

export async function cacheClear() {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', s => s.clear());
  } catch (e) { /* ignore */ }
}

/** @returns {Promise<{count: number, bytes: number}>} */
export async function cacheStats() {
  try {
    const db = await openDb();
    const all = await tx(db, 'readonly', s => s.getAll());
    return { count: all.length, bytes: all.reduce((n, r) => n + (r.size || 0), 0) };
  } catch (e) {
    return { count: 0, bytes: 0 };
  }
}
