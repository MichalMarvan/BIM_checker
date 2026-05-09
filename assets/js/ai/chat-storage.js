const DB_NAME = 'bim_checker_storage';
const STORE = 'storage';

const KEY_AGENTS    = 'ai_agents';
const KEY_SETTINGS  = 'ai_settings';
const KEY_THREADS   = 'ai_threads';
const KEY_MSGS_PFX  = 'ai_messages_';

let _dbPromise = null;

function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'key' });
            }
        };
    });
    return _dbPromise;
}

async function _get(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE], 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result?.value);
        req.onerror = () => reject(req.error);
    });
}

async function _put(key, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE], 'readwrite');
        const req = tx.objectStore(STORE).put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function _delete(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE], 'readwrite');
        const req = tx.objectStore(STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function _genId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Public API — implemented in subsequent tasks
export async function listAgents() { return []; }
export async function getAgent() { return null; }
export async function saveAgent() { return null; }
export async function deleteAgent() { return false; }
export async function setFavorite() {}
export async function listFavorites() { return []; }

export async function getSettings() { return _defaultSettings(); }
export async function updateSettings() {}

export async function listThreads() { return []; }
export async function getThread() { return null; }
export async function createThread() { return null; }
export async function deleteThread() { return false; }
export async function updateThreadTitle() {}

export async function listMessages() { return []; }
export async function appendMessage() {}
export async function clearThread() {}

function _defaultSettings() {
    return {
        lastActiveAgentId: null,
        lastOpenedThreadId: null,
        chatPanelOpen: false,
        threadsSidebarOpen: true
    };
}

// Internal exports for tests (not part of public API)
export const _internals = { _get, _put, _delete, _genId, KEY_AGENTS, KEY_SETTINGS, KEY_THREADS, KEY_MSGS_PFX };
