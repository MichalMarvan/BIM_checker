// .bimcache in the user's connected folder — the portable layer.
//
// When a local folder is connected (File System Access API, see
// common/local-folder-storage.js), serialized models are mirrored into
//   <connected-folder>/BIM_checker/cache/<sha256>.bimcache
// Carry the folder to another computer (or let OneDrive/Drive sync it) and
// models open there without parsing — the user's "poor man's cloud".
//
// Everything here degrades silently: no folder connected, permission not
// granted, non-Chromium browser → every call resolves to null/false and the
// IndexedDB layer stays the only cache. The folder connect flow already asks
// for 'readwrite', so no extra permission prompt is needed here (we only
// QUERY, never request — requests need a user gesture).

import { loadRootHandle } from '../../../common/fs-handle-store.js';

const APP_DIR = 'BIM_checker';
const CACHE_DIR = 'cache';

let _warned = false;
function warnOnce(e) {
  if (_warned) return;
  _warned = true;
  console.warn('[folder-cache] disabled:', e?.message || e);
}

/** @returns {Promise<FileSystemDirectoryHandle|null>} */
async function cacheDir(create) {
  try {
    if (typeof indexedDB === 'undefined' || typeof window === 'undefined' || !('showDirectoryPicker' in window)) return null;
    const root = await loadRootHandle();
    if (!root) return null;
    const perm = await root.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
    const app = await root.getDirectoryHandle(APP_DIR, { create });
    return await app.getDirectoryHandle(CACHE_DIR, { create });
  } catch (e) {
    // NotFoundError with create:false just means "no cache dir yet"
    if (e && e.name === 'NotFoundError') return null;
    warnOnce(e);
    return null;
  }
}

/** @returns {Promise<'ok'|'no-folder'|'unsupported'>} */
export async function folderCacheStatus() {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return 'unsupported';
  const dir = await cacheDir(false);
  return dir ? 'ok' : 'no-folder';
}

/** @returns {Promise<ArrayBuffer|null>} */
export async function folderCacheGet(hash) {
  try {
    const dir = await cacheDir(false);
    if (!dir) return null;
    const fh = await dir.getFileHandle(`${hash}.bimcache`);
    const file = await fh.getFile();
    return await file.arrayBuffer();
  } catch (e) {
    if (e && e.name === 'NotFoundError') return null;
    warnOnce(e);
    return null;
  }
}

/** @returns {Promise<boolean>} */
export async function folderCachePut(hash, buf) {
  try {
    const dir = await cacheDir(true);
    if (!dir) return false;
    const fh = await dir.getFileHandle(`${hash}.bimcache`, { create: true });
    const writable = await fh.createWritable();
    await writable.write(buf);
    await writable.close();
    return true;
  } catch (e) {
    warnOnce(e);
    return false;
  }
}

export async function folderCacheDelete(hash) {
  try {
    const dir = await cacheDir(false);
    if (!dir) return;
    await dir.removeEntry(`${hash}.bimcache`);
  } catch (e) { /* disposable cache — ignore */ }
}

/** @returns {Promise<{count: number, bytes: number}>} */
export async function folderCacheStats() {
  const out = { count: 0, bytes: 0 };
  try {
    const dir = await cacheDir(false);
    if (!dir) return out;
    for await (const [name, handle] of dir.entries()) {
      if (!name.endsWith('.bimcache') || handle.kind !== 'file') continue;
      out.count++;
      try { out.bytes += (await handle.getFile()).size; } catch (e) { /* skip */ }
    }
  } catch (e) { /* ignore */ }
  return out;
}
