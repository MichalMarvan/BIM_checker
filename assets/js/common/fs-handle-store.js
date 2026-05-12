/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Persists FileSystemDirectoryHandle records in IndexedDB as named projects.
 * Handle is serializable via structured clone — IDB stores it directly.
 *
 * v2 schema:
 *   - store `handles` (key: 'root') — legacy single-handle slot, kept for back-compat read during migration
 *   - store `projects` (keyPath: id) — list of named projects {id, name, handle, addedAt}
 *
 * Active project is tracked in localStorage['activeProjectId'].
 */

const DB_NAME = 'bim-checker-fs-handles';
const HANDLES_STORE = 'handles';
const PROJECTS_STORE = 'projects';
const DB_VERSION = 2;
const ROOT_KEY = 'root';
const ACTIVE_PROJECT_KEY = 'activeProjectId';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(HANDLES_STORE)) {
                db.createObjectStore(HANDLES_STORE);
            }
            if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
                db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ---------- Legacy single-handle API (still used by local-folder-storage's connect/restore as the "currently in-use" cached handle) ----------

export async function saveRootHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        tx.objectStore(HANDLES_STORE).put(handle, ROOT_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadRootHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLES_STORE, 'readonly');
        const req = tx.objectStore(HANDLES_STORE).get(ROOT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function clearRootHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLES_STORE, 'readwrite');
        tx.objectStore(HANDLES_STORE).delete(ROOT_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

// ---------- Projects API ----------

function genId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function _putProject(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, 'readwrite');
        tx.objectStore(PROJECTS_STORE).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

async function _getAllProjects() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, 'readonly');
        const req = tx.objectStore(PROJECTS_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function _getProject(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, 'readonly');
        const req = tx.objectStore(PROJECTS_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function _deleteProject(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, 'readwrite');
        tx.objectStore(PROJECTS_STORE).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * One-shot migration from legacy single-handle slot to a named project.
 * Idempotent: runs only if projects list is empty AND legacy handle exists.
 * Sets the migrated project as active.
 */
async function maybeMigrateLegacy() {
    const projects = await _getAllProjects();
    if (projects.length > 0) return;
    const legacy = await loadRootHandle();
    if (!legacy) return;
    const record = {
        id: genId(),
        name: legacy.name || 'My folder',
        handle: legacy,
        addedAt: Date.now()
    };
    await _putProject(record);
    // If a previous build set 'localFolder' as active backend, treat this project as active.
    if (localStorage.getItem('activeBackend') === 'localFolder' && !localStorage.getItem(ACTIVE_PROJECT_KEY)) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, record.id);
    }
}

export async function listProjects() {
    await maybeMigrateLegacy();
    const all = await _getAllProjects();
    return all.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function getProject(id) {
    return _getProject(id);
}

export async function addProject(name, handle) {
    const record = {
        id: genId(),
        name: name || handle.name || 'Project',
        handle,
        addedAt: Date.now()
    };
    await _putProject(record);
    // Keep legacy ROOT_KEY in sync so older code paths that read it see the active handle.
    try { await saveRootHandle(handle); } catch (_) { /* ignore */ }
    return record;
}

export async function renameProject(id, newName) {
    const record = await _getProject(id);
    if (!record) return false;
    record.name = newName;
    await _putProject(record);
    return true;
}

export async function removeProject(id) {
    await _deleteProject(id);
    if (localStorage.getItem(ACTIVE_PROJECT_KEY) === id) {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
        localStorage.removeItem('activeBackend');
        try { await clearRootHandle(); } catch (_) { /* ignore */ }
    }
}

export function getActiveProjectId() {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export async function setActiveProject(id) {
    const record = await _getProject(id);
    if (!record) return null;
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    localStorage.setItem('activeBackend', 'localFolder');
    try { await saveRootHandle(record.handle); } catch (_) { /* ignore */ }
    return record;
}

export function clearActiveProject() {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    localStorage.removeItem('activeBackend');
    clearRootHandle().catch(() => {});
}

export async function getActiveProject() {
    const id = getActiveProjectId();
    if (!id) return null;
    return _getProject(id);
}

if (typeof window !== 'undefined') {
    window.BIMFsHandleStore = { saveRootHandle, loadRootHandle, clearRootHandle };
    window.BIMProjects = {
        list: listProjects,
        get: getProject,
        add: addProject,
        rename: renameProject,
        remove: removeProject,
        getActiveId: getActiveProjectId,
        getActive: getActiveProject,
        setActive: setActiveProject,
        clearActive: clearActiveProject
    };
}
