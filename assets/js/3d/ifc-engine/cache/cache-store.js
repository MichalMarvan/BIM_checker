// IndexedDB store for .bimcache blobs, keyed by SHA-256 of the source IFC.
//
// Separate small DB (not BIMStorage) — the cache is disposable: losing it
// only costs a re-parse. put() retries once after evicting the least
// recently used entries when the browser signals quota pressure.

const REGISTERED_DB = globalThis.BIMDatabaseRegistry?.get?.('modelCache');
const DB_NAME = REGISTERED_DB?.name || 'bim-model-cache';
const STORE = 'models';
const DB_VERSION = REGISTERED_DB?.version || 1;
const DEFAULT_MAX_BYTES = 1024 * 1048576;
const DEFAULT_MAX_ENTRIES = 20;

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
        await enforceLimits(db, hash).catch(e => console.warn('[model-cache] LRU policy failed:', e));
        return true;
    } catch (e) {
        console.warn('[model-cache] put failed:', e);
        return false;
    }
}

function configuredMaxBytes() {
    try {
        const configured = Number(localStorage.getItem('bim:model-cache:max-bytes'));
        if (Number.isFinite(configured) && configured > 0) {
            return Math.max(128 * 1048576, Math.min(configured, 4 * 1024 * 1048576));
        }
    } catch { /* storage unavailable */ }
    return DEFAULT_MAX_BYTES;
}

async function effectiveMaxBytes() {
    let limit = configuredMaxBytes();
    try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.quota) limit = Math.min(limit, Math.max(128 * 1048576, estimate.quota * 0.25));
    } catch { /* use configured limit */ }
    return limit;
}

// Reads only {hash, size, lastUsed} per record via a cursor over the lastUsed
// index (oldest first). Unlike store.getAll(), it never holds every model buffer
// in memory at once — each record's buffer is released as the cursor advances.
function collectMeta(db) {
    return new Promise((resolve, reject) => {
        const entries = [];
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('lastUsed').openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(entries);
                return;
            }
            const rec = cursor.value;
            entries.push({ hash: rec.hash, size: rec.size || 0 });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

async function enforceLimits(db, protectedHash) {
    const entries = await collectMeta(db);
    const byteLimit = await effectiveMaxBytes();
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    let count = entries.length;
    let freed = 0;
    for (const entry of entries) {
        if (count <= DEFAULT_MAX_ENTRIES && total <= byteLimit) break;
        // Preserve the just-written item unless it alone exceeds the limit.
        if (entry.hash === protectedHash && entries.length > 1) continue;
        await tx(db, 'readwrite', s => s.delete(entry.hash));
        total -= entry.size;
        freed += entry.size;
        count -= 1;
    }
    if (freed) console.warn(`[model-cache] policy evicted ${Math.round(freed / 1048576)} MB (LRU)`);
}

async function evictLru(db, bytesToFree) {
    const entries = await collectMeta(db);
    let freed = 0;
    for (const rec of entries) {
        if (freed >= bytesToFree) break;
        await tx(db, 'readwrite', s => s.delete(rec.hash));
        freed += rec.size;
    }
    console.warn(`[model-cache] evicted ${Math.round(freed / 1048576)} MB (LRU)`);
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

/** @returns {Promise<{count: number, bytes: number, maxBytes?: number, maxEntries?: number}>} */
export async function cacheStats() {
    try {
        const db = await openDb();
        const entries = await collectMeta(db);
        return {
            count: entries.length,
            bytes: entries.reduce((n, r) => n + r.size, 0),
            maxBytes: await effectiveMaxBytes(),
            maxEntries: DEFAULT_MAX_ENTRIES,
        };
    } catch (e) {
        return { count: 0, bytes: 0 };
    }
}
