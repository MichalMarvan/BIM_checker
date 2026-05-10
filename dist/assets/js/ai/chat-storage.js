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

// Agents CRUD
export async function listAgents() {
    return (await _get(KEY_AGENTS)) || [];
}

export async function getAgent(id) {
    const list = await listAgents();
    return list.find(a => a.id === id) || null;
}

export async function saveAgent(data) {
    const name = String(data.name || '').trim();
    if (name.length === 0) throw new Error('Agent name required');

    const list = await listAgents();
    const now = Date.now();

    if (data.id) {
        const idx = list.findIndex(a => a.id === data.id);
        if (idx === -1) throw new Error('Agent not found');
        const merged = {
            ...list[idx],
            ...data,
            name,
            updatedAt: now
        };
        list[idx] = merged;
        await _put(KEY_AGENTS, list);
        return merged.id;
    }

    const id = _genId();
    const agent = {
        id,
        name,
        icon: data.icon || '🤖',
        provider: data.provider || 'google',
        baseUrl: data.baseUrl || '',
        apiKey: data.apiKey || '',
        model: data.model || '',
        systemPrompt: data.systemPrompt || '',
        temperature: typeof data.temperature === 'number' ? data.temperature : 0.7,
        isFavorite: data.isFavorite !== false,
        favoriteOrder: typeof data.favoriteOrder === 'number' ? data.favoriteOrder : list.length,
        createdAt: now,
        updatedAt: now
    };
    list.push(agent);
    await _put(KEY_AGENTS, list);
    return id;
}

export async function deleteAgent(id) {
    const list = await listAgents();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await _put(KEY_AGENTS, list);
    // Cascading delete: threads + messages (listThreads is still a stub in this task — returns [])
    const threads = await listThreads(id);
    for (const t of threads) {
        await _delete(KEY_MSGS_PFX + t.id);
    }
    const allThreads = (await _get(KEY_THREADS)) || [];
    const remaining = allThreads.filter(t => t.agentId !== id);
    await _put(KEY_THREADS, remaining);
    return true;
}

export async function setFavorite(id, isFavorite, order) {
    const list = await listAgents();
    const agent = list.find(a => a.id === id);
    if (!agent) return;
    agent.isFavorite = !!isFavorite;
    if (typeof order === 'number') agent.favoriteOrder = order;
    agent.updatedAt = Date.now();
    await _put(KEY_AGENTS, list);
}

export async function listFavorites() {
    const all = await listAgents();
    return all
        .filter(a => a.isFavorite)
        .sort((a, b) => (a.favoriteOrder || 0) - (b.favoriteOrder || 0));
}

export async function getSettings() {
    const stored = await _get(KEY_SETTINGS);
    return { ..._defaultSettings(), ...(stored || {}) };
}

export async function updateSettings(partial) {
    const current = await getSettings();
    await _put(KEY_SETTINGS, { ...current, ...partial });
}

export async function listThreads(agentId) {
    const all = (await _get(KEY_THREADS)) || [];
    return all
        .filter(t => t.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThread(id) {
    const all = (await _get(KEY_THREADS)) || [];
    return all.find(t => t.id === id) || null;
}

export async function createThread(agentId, firstMessage) {
    const all = (await _get(KEY_THREADS)) || [];
    const id = _genId();
    const now = Date.now();
    const title = String(firstMessage || '(prázdná konverzace)').slice(0, 60);
    const thread = {
        id,
        agentId,
        title,
        createdAt: now,
        updatedAt: now,
        messageCount: 0
    };
    all.push(thread);
    await _put(KEY_THREADS, all);
    if (firstMessage) {
        await appendMessage(id, { role: 'user', content: firstMessage, timestamp: now });
    }
    return id;
}

export async function deleteThread(id) {
    const all = (await _get(KEY_THREADS)) || [];
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    await _put(KEY_THREADS, all);
    await _delete(KEY_MSGS_PFX + id);
    return true;
}

export async function updateThreadTitle(id, title) {
    const all = (await _get(KEY_THREADS)) || [];
    const t = all.find(x => x.id === id);
    if (!t) return;
    t.title = String(title).slice(0, 60);
    t.updatedAt = Date.now();
    await _put(KEY_THREADS, all);
}

export async function listMessages(threadId) {
    return (await _get(KEY_MSGS_PFX + threadId)) || [];
}

export async function appendMessage(threadId, message) {
    const msgs = await listMessages(threadId);
    const stamped = { timestamp: Date.now(), ...message };
    msgs.push(stamped);
    await _put(KEY_MSGS_PFX + threadId, msgs);
    // Update thread.updatedAt + messageCount
    const all = (await _get(KEY_THREADS)) || [];
    const t = all.find(x => x.id === threadId);
    if (t) {
        t.updatedAt = stamped.timestamp;
        t.messageCount = msgs.length;
        await _put(KEY_THREADS, all);
    }
}

export async function clearThread(threadId) {
    await _delete(KEY_MSGS_PFX + threadId);
    const all = (await _get(KEY_THREADS)) || [];
    const t = all.find(x => x.id === threadId);
    if (t) {
        t.messageCount = 0;
        await _put(KEY_THREADS, all);
    }
}

function _defaultSettings() {
    return {
        lastActiveAgentId: null,
        lastOpenedThreadId: null,
        chatPanelOpen: false,
        threadsSidebarOpen: true,
        activeChatHeads: []
    };
}

// Internal exports for tests (not part of public API)
export const _internals = { _get, _put, _delete, _genId, KEY_AGENTS, KEY_SETTINGS, KEY_THREADS, KEY_MSGS_PFX };
