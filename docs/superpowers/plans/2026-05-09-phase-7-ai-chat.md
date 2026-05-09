# Phase 7 — AI Chat Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring AI chat infrastructure into BIM_checker — settings UI, bottom-right launcher, right-side chat panel with persisted threads, 5 OpenAI-compatible providers. No tools (function calling) yet — Phase 8+ adds them incrementally.

**Architecture:** Port `bim-ai-viewer`'s AI layer (~60–70%) with adaptation: storage backend uses BIM_checker's existing `bim_checker_storage` IndexedDB DB; ES6 modules (already supported via `update-checker.js` precedent); CSS variables map to BIM_checker tokens; i18n integrated into existing `translations.js`.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB (existing `BIMStorage`-style raw IDB access), no build step, custom Jasmine-like tests run by `node tests/run-tests.js` (Puppeteer headless Chromium).

**Spec:** `docs/superpowers/specs/2026-05-09-phase-7-ai-chat-design.md`

**Source reference:** `/home/michal/work/bim-ai-viewer/assets/js/ai/*` and `/home/michal/work/bim-ai-viewer/assets/js/ui/{chat-ui,settings-ui}.js`

---

## File structure

### Created

| File | Responsibility |
|------|---------------|
| `assets/js/ai/providers.js` | Provider registry (Ollama / Google / OpenAI / OpenRouter / Custom) |
| `assets/js/ai/ai-client.js` | OpenAI-compatible chat completion + fetchModels + testConnection (streaming) |
| `assets/js/ai/agent-manager.js` | Agent CRUD wrapper around chat-storage |
| `assets/js/ai/tool-defs.js` | Tool definitions — Phase 7 exports `[]` |
| `assets/js/ai/tool-executor.js` | Tool dispatch — Phase 7 returns `tools_disabled` |
| `assets/js/ai/chat-storage.js` | IndexedDB CRUD: agents, threads, messages, settings |
| `assets/js/ai-ui/init.js` | DOMContentLoaded bootstrap: launcher inject + navbar wiring |
| `assets/js/ai-ui/chat-launcher.js` | Bottom-right circular button + popover |
| `assets/js/ai-ui/settings-modal.js` | Settings popup: agent list + agent form |
| `assets/js/ai-ui/chat-panel.js` | Right-side panel: threads sidebar + messages + input + streaming |
| `assets/js/ai-ui/chat-i18n-helpers.js` | i18n re-render on `languageChanged` event |
| `assets/css/ai-chat.css` | All AI UI styling |
| `tests/test-suites/ai-chat-storage.test.js` | Storage CRUD tests |
| `tests/test-suites/ai-agent-manager.test.js` | Agent manager tests |
| `tests/test-suites/ai-client.test.js` | API client tests with mocked fetch |
| `tests/test-suites/ai-ui-integration.test.js` | DOM integration tests |
| `tests/test-suites/ai-i18n.test.js` | i18n key coverage |

### Modified

| File | What changes |
|------|--------------|
| `pages/ids-ifc-validator.html` + dist | Add `aiSettingsBtn` to navbar, ai-chat.css link, init.js script |
| `pages/ids-parser-visualizer.html` + dist | Same |
| `pages/ifc-viewer-multi-file.html` + dist | Same |
| `assets/js/common/translations.js` + dist | 57 new keys × 2 languages |
| `tests/test-runner.html` | Register 5 new test suite scripts |
| `eslint.config.js` | Add module globals |
| `sw.js` + dist | `CACHE_VERSION` v14 → v15, add new files to `ASSETS_TO_CACHE` |
| `PLAN.md` | Phase 7 milestone entry |
| `CHANGELOG.md` | `[0.3.0]` entry |

All `assets/`, `pages/`, `sw.js` mirrored to `dist/` per project convention.

---

## Implementation tasks

### Task 1: Bootstrap module skeletons + test harness

**Goal:** Empty files exist with minimal exports; test-runner loads them; one smoke test passes. Establishes framework for TDD on subsequent tasks.

**Files:**
- Create: `assets/js/ai/providers.js`, `ai-client.js`, `agent-manager.js`, `tool-defs.js`, `tool-executor.js`, `chat-storage.js`
- Create: `dist/assets/js/ai/*` mirrors
- Create: `tests/test-suites/ai-bootstrap.test.js`
- Modify: `tests/test-runner.html` (register module + test scripts)
- Modify: `eslint.config.js` (add globals)

- [ ] **Step 1: Create `assets/js/ai/providers.js`**

```js
/**
 * Provider presets — predefined LLM endpoint configurations
 */

export const PROVIDERS = {
    ollama:     { name: 'Ollama',      endpoint: 'http://localhost:11434/v1', needsKey: false },
    google:     { name: 'Google AI',   endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true },
    openai:     { name: 'OpenAI',      endpoint: 'https://api.openai.com/v1', needsKey: true },
    openrouter: { name: 'OpenRouter',  endpoint: 'https://openrouter.ai/api/v1', needsKey: true },
    custom:     { name: 'Custom',      endpoint: '', needsKey: false }
};

export function detectProvider(url) {
    if (!url) return 'custom';
    const lower = url.toLowerCase();
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) return 'ollama';
    if (lower.includes('generativelanguage.googleapis.com')) return 'google';
    if (lower.includes('api.openai.com')) return 'openai';
    if (lower.includes('openrouter.ai')) return 'openrouter';
    return 'custom';
}
```

- [ ] **Step 2: Create stubs for the other 5 modules**

`assets/js/ai/ai-client.js`:
```js
export async function chatCompletion() { throw new Error('not implemented'); }
export async function fetchModels() { throw new Error('not implemented'); }
export async function testConnection() { throw new Error('not implemented'); }
```

`assets/js/ai/chat-storage.js`:
```js
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
```

`assets/js/ai/agent-manager.js`:
```js
import * as storage from './chat-storage.js';
import { PROVIDERS } from './providers.js';

export async function loadAgents() { return storage.listAgents(); }
export async function loadFavorites() { return storage.listFavorites(); }
export async function getAgent(id) { return storage.getAgent(id); }

export function getEffectiveEndpoint(agent) {
    if (!agent) return '';
    return agent.baseUrl || (PROVIDERS[agent.provider]?.endpoint || '');
}

export function validateUrl(url) {
    if (!url) return false;
    return /^https?:\/\//.test(url);
}
```

`assets/js/ai/tool-defs.js`:
```js
/**
 * Tool definitions for AI function calling.
 *
 * Phase 7 ships an empty list — chat works in pure-completion mode.
 * Phase 8+ will populate with BIM_checker-specific tools (storage ops,
 * validation control, file management, etc.).
 */
export const TOOL_DEFINITIONS = [];

export function getToolsForAgent(/* agent */) {
    return TOOL_DEFINITIONS;
}
```

`assets/js/ai/tool-executor.js`:
```js
/**
 * Executes tool calls dispatched by the AI.
 *
 * Phase 7 returns `tools_disabled` for any call. Phase 8+ will implement
 * real tools.
 */
export async function executeToolCall(toolCall) {
    console.warn('[tool-executor] Phase 7: tools disabled. Call ignored:', toolCall);
    return {
        toolCallId: toolCall?.id,
        result: { error: 'tools_disabled', message: 'Tools are not available in Phase 7' }
    };
}
```

- [ ] **Step 3: Mirror to dist/**

```bash
mkdir -p dist/assets/js/ai
cp assets/js/ai/*.js dist/assets/js/ai/
```

- [ ] **Step 4: Add ESLint globals**

In `eslint.config.js`, after the `IFCParserCore: 'readonly'` line (or `ValidationPresets: 'readonly'` if Phase 6 was last), append:

```js
                // Phase 7: AI chat
                AIClient: 'readonly',
                ChatStorage: 'readonly',
                AgentManager: 'readonly',
                ChatLauncher: 'readonly',
                ChatPanel: 'readonly',
                SettingsModal: 'readonly'
```

(Mind comma on previous line.)

- [ ] **Step 5: Create `tests/test-suites/ai-bootstrap.test.js`**

```js
describe('AI bootstrap', () => {
    it('PROVIDERS exposes all 5 providers', async () => {
        const { PROVIDERS } = await import('../../assets/js/ai/providers.js');
        const expected = ['ollama', 'google', 'openai', 'openrouter', 'custom'];
        for (const key of expected) {
            expect(typeof PROVIDERS[key]).toBe('object');
            expect(typeof PROVIDERS[key].name).toBe('string');
            expect(typeof PROVIDERS[key].endpoint).toBe('string');
            expect(typeof PROVIDERS[key].needsKey).toBe('boolean');
        }
    });

    it('detectProvider returns correct keys', async () => {
        const { detectProvider } = await import('../../assets/js/ai/providers.js');
        expect(detectProvider('http://localhost:11434/v1')).toBe('ollama');
        expect(detectProvider('https://api.openai.com/v1')).toBe('openai');
        expect(detectProvider('https://generativelanguage.googleapis.com/v1beta/openai')).toBe('google');
        expect(detectProvider('https://openrouter.ai/api/v1')).toBe('openrouter');
        expect(detectProvider('https://example.com/v1')).toBe('custom');
        expect(detectProvider('')).toBe('custom');
    });

    it('chat-storage exposes the API surface as functions', async () => {
        const storage = await import('../../assets/js/ai/chat-storage.js');
        const expected = ['listAgents','getAgent','saveAgent','deleteAgent',
            'setFavorite','listFavorites','getSettings','updateSettings',
            'listThreads','getThread','createThread','deleteThread','updateThreadTitle',
            'listMessages','appendMessage','clearThread'];
        for (const fn of expected) expect(typeof storage[fn]).toBe('function');
    });

    it('TOOL_DEFINITIONS is empty in Phase 7', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
        expect(TOOL_DEFINITIONS.length).toBe(0);
    });
});
```

- [ ] **Step 6: Register test suite in `tests/test-runner.html`**

Find the test-suites block and append after the last `<script src="test-suites/...">` line:

```html
    <script src="test-suites/ai-bootstrap.test.js"></script>
```

NOTE: Use plain `<script src="...">` (not `type="module"`) for ALL AI test files in this plan — that matches the pattern of every existing test suite. The test files themselves use dynamic `import()` to load AI modules, which works inside classic scripts. Test framework globals (`describe`/`it`/`expect`/`beforeEach`) are window-level, available regardless of script type.

The AI modules (`assets/js/ai/*.js`, `assets/js/ai-ui/*.js`) are NOT registered in `test-runner.html` — they are pulled in dynamically by tests. They ARE registered in the three pages' `<script type="module" src="../assets/js/ai-ui/init.js">` (Task 8), which transitively imports the rest.

- [ ] **Step 7: Run tests**

```bash
node tests/run-tests.js
```
Expected: previous count (~481 if Phase 6 merged) + 4 new tests = ~485, all pass.

If any test fails because of module loading (404 on import path, or `import` not allowed), adjust the script tag in test-runner to `type="module"` or restructure imports. Re-run until green.

- [ ] **Step 8: Commit**

```bash
git add assets/js/ai/ dist/assets/js/ai/ \
        tests/test-suites/ai-bootstrap.test.js \
        tests/test-runner.html eslint.config.js
git commit -m "feat(ai): bootstrap AI module skeletons + test harness"
```

---

### Task 2: chat-storage agents CRUD

**Goal:** TDD-implement `saveAgent`, `listAgents`, `getAgent`, `deleteAgent`, `setFavorite`, `listFavorites`. Tests cover create, upsert, defaults, cascading delete (agents → threads → messages), favorite ordering.

**Files:**
- Modify: `assets/js/ai/chat-storage.js` + dist mirror
- Create: `tests/test-suites/ai-chat-storage.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/ai-chat-storage.test.js`:
```js
describe('chat-storage agents', () => {
    let storage;

    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        // Wipe all AI keys before each test
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_SETTINGS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
    });

    it('listAgents() returns [] when nothing saved', async () => {
        const agents = await storage.listAgents();
        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBe(0);
    });

    it('saveAgent creates new agent with generated id', async () => {
        const id = await storage.saveAgent({ name: 'Test', provider: 'google' });
        expect(typeof id).toBe('string');
        expect(id.length > 0).toBe(true);
        const agents = await storage.listAgents();
        expect(agents.length).toBe(1);
        expect(agents[0].name).toBe('Test');
        expect(agents[0].provider).toBe('google');
    });

    it('saveAgent applies defaults: temperature, isFavorite, icon, systemPrompt', async () => {
        const id = await storage.saveAgent({ name: 'D', provider: 'openai' });
        const agent = await storage.getAgent(id);
        expect(agent.temperature).toBe(0.7);
        expect(agent.isFavorite).toBe(true);
        expect(agent.icon).toBe('🤖');
        expect(agent.systemPrompt).toBe('');
    });

    it('saveAgent with id updates existing agent (preserves createdAt)', async () => {
        const id = await storage.saveAgent({ name: 'Orig', provider: 'google' });
        const created = (await storage.getAgent(id)).createdAt;
        await new Promise(r => setTimeout(r, 5));
        await storage.saveAgent({ id, name: 'Updated', provider: 'google' });
        const after = await storage.getAgent(id);
        expect(after.name).toBe('Updated');
        expect(after.createdAt).toBe(created);
        expect(after.updatedAt > created).toBe(true);
    });

    it('saveAgent throws on empty name', async () => {
        let threw = false;
        try { await storage.saveAgent({ name: '   ', provider: 'google' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('getAgent returns null for unknown id', async () => {
        expect(await storage.getAgent('nope')).toBe(null);
    });

    it('deleteAgent removes; list no longer contains', async () => {
        const id = await storage.saveAgent({ name: 'A', provider: 'google' });
        await storage.saveAgent({ name: 'B', provider: 'google' });
        const ok = await storage.deleteAgent(id);
        expect(ok).toBe(true);
        const list = await storage.listAgents();
        expect(list.length).toBe(1);
        expect(list[0].name).toBe('B');
    });

    it('deleteAgent returns false for unknown id', async () => {
        expect(await storage.deleteAgent('nope')).toBe(false);
    });

    it('setFavorite toggles isFavorite + favoriteOrder', async () => {
        const id = await storage.saveAgent({ name: 'F', provider: 'google' });
        await storage.setFavorite(id, false, 0);
        let agent = await storage.getAgent(id);
        expect(agent.isFavorite).toBe(false);
        await storage.setFavorite(id, true, 5);
        agent = await storage.getAgent(id);
        expect(agent.isFavorite).toBe(true);
        expect(agent.favoriteOrder).toBe(5);
    });

    it('listFavorites returns only favorites sorted by favoriteOrder', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'google' });
        const b = await storage.saveAgent({ name: 'B', provider: 'google' });
        const c = await storage.saveAgent({ name: 'C', provider: 'google' });
        await storage.setFavorite(a, true, 2);
        await storage.setFavorite(b, false, 0);
        await storage.setFavorite(c, true, 1);
        const favs = await storage.listFavorites();
        expect(favs.length).toBe(2);
        expect(favs[0].name).toBe('C');  // order 1
        expect(favs[1].name).toBe('A');  // order 2
    });
});
```

In `tests/test-runner.html`, after `ai-bootstrap.test.js` line, add:
```html
    <script src="test-suites/ai-chat-storage.test.js"></script>
```

- [ ] **Step 2: Run tests; verify failures**

```bash
node tests/run-tests.js
```
Expected: 10 new failures (stub methods).

- [ ] **Step 3: Implement agent CRUD**

In `assets/js/ai/chat-storage.js`, replace the stub agent functions:

```js
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
    // Cascading delete: threads + messages
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
```

NOTE: `deleteAgent` calls `listThreads(id)` which is still a stub returning `[]`. That's fine for now — Task 3 implements threads, and the cascading-delete behavior will work once threads are saved. The test for cascading delete is in Task 3 because it requires the threads API.

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: ~495 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js
git add assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js \
        tests/test-suites/ai-chat-storage.test.js tests/test-runner.html
git commit -m "feat(ai): chat-storage agents CRUD with TDD"
```

---

### Task 3: chat-storage threads + messages + settings

**Goal:** TDD-implement thread + message + settings APIs. Verify cascading delete from Task 2.

**Files:**
- Modify: `assets/js/ai/chat-storage.js` + dist mirror
- Modify: `tests/test-suites/ai-chat-storage.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/test-suites/ai-chat-storage.test.js`:
```js
describe('chat-storage settings', () => {
    let storage;
    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_SETTINGS);
    });

    it('getSettings returns defaults when empty', async () => {
        const s = await storage.getSettings();
        expect(s.lastActiveAgentId).toBe(null);
        expect(s.chatPanelOpen).toBe(false);
        expect(s.threadsSidebarOpen).toBe(true);
    });

    it('updateSettings merges partial updates', async () => {
        await storage.updateSettings({ chatPanelOpen: true });
        const s1 = await storage.getSettings();
        expect(s1.chatPanelOpen).toBe(true);
        expect(s1.threadsSidebarOpen).toBe(true);  // default preserved
        await storage.updateSettings({ threadsSidebarOpen: false });
        const s2 = await storage.getSettings();
        expect(s2.chatPanelOpen).toBe(true);  // earlier update preserved
        expect(s2.threadsSidebarOpen).toBe(false);
    });
});

describe('chat-storage threads', () => {
    let storage;
    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
    });

    it('createThread creates thread + first user message', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'Hello world');
        expect(typeof tid).toBe('string');
        const thread = await storage.getThread(tid);
        expect(thread.agentId).toBe(agentId);
        expect(thread.title).toBe('Hello world');
        expect(thread.messageCount).toBe(1);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(1);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('Hello world');
    });

    it('createThread truncates long titles to 60 chars', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const longMsg = 'x'.repeat(200);
        const tid = await storage.createThread(agentId, longMsg);
        const thread = await storage.getThread(tid);
        expect(thread.title.length <= 60).toBe(true);
    });

    it('listThreads filters by agentId, sorted by updatedAt desc', async () => {
        const a1 = await storage.saveAgent({ name: 'A1', provider: 'google' });
        const a2 = await storage.saveAgent({ name: 'A2', provider: 'google' });
        const t1 = await storage.createThread(a1, 'msg1');
        await new Promise(r => setTimeout(r, 5));
        const t2 = await storage.createThread(a2, 'msg2');
        await new Promise(r => setTimeout(r, 5));
        const t3 = await storage.createThread(a1, 'msg3');
        const a1Threads = await storage.listThreads(a1);
        expect(a1Threads.length).toBe(2);
        expect(a1Threads[0].id).toBe(t3);  // most recent first
        expect(a1Threads[1].id).toBe(t1);
    });

    it('appendMessage updates thread.updatedAt + messageCount', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'first');
        const before = (await storage.getThread(tid)).updatedAt;
        await new Promise(r => setTimeout(r, 5));
        await storage.appendMessage(tid, { role: 'assistant', content: 'hi' });
        const after = await storage.getThread(tid);
        expect(after.updatedAt > before).toBe(true);
        expect(after.messageCount).toBe(2);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(2);
        expect(msgs[1].role).toBe('assistant');
    });

    it('deleteThread removes thread metadata + messages', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'msg');
        await storage.appendMessage(tid, { role: 'assistant', content: 'reply' });
        const ok = await storage.deleteThread(tid);
        expect(ok).toBe(true);
        expect(await storage.getThread(tid)).toBe(null);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(0);
    });

    it('deleteAgent cascades to delete threads + messages', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'msg');
        await storage.appendMessage(tid, { role: 'assistant', content: 'reply' });
        await storage.deleteAgent(agentId);
        expect(await storage.getThread(tid)).toBe(null);
        expect((await storage.listMessages(tid)).length).toBe(0);
    });
});
```

- [ ] **Step 2: Run tests; verify failures**

```bash
node tests/run-tests.js
```
Expected: ~7 new failures.

- [ ] **Step 3: Implement settings + threads + messages**

In `assets/js/ai/chat-storage.js`, replace the stub functions:

```js
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
```

- [ ] **Step 4: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: ~502 tests, all pass.

- [ ] **Step 5: Mirror + commit**

```bash
cp assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js
git add assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js \
        tests/test-suites/ai-chat-storage.test.js
git commit -m "feat(ai): chat-storage threads + messages + settings"
```

---

### Task 4: agent-manager port

**Goal:** Implement agent-manager wrapper with `loadAgents`, `getEffectiveEndpoint`, `validateUrl`. URL validation rejects non-http(s).

**Files:**
- Modify: `assets/js/ai/agent-manager.js` + dist mirror
- Create: `tests/test-suites/ai-agent-manager.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write failing tests**

`tests/test-suites/ai-agent-manager.test.js`:
```js
describe('agent-manager', () => {
    let manager, storage;

    beforeEach(async () => {
        manager = await import('../../assets/js/ai/agent-manager.js');
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
    });

    it('loadAgents returns empty array initially', async () => {
        expect((await manager.loadAgents()).length).toBe(0);
    });

    it('loadFavorites returns sorted favorites', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'google' });
        const b = await storage.saveAgent({ name: 'B', provider: 'google' });
        await storage.setFavorite(a, true, 1);
        await storage.setFavorite(b, true, 0);
        const favs = await manager.loadFavorites();
        expect(favs.length).toBe(2);
        expect(favs[0].name).toBe('B');
    });

    it('getEffectiveEndpoint returns provider default when baseUrl empty', () => {
        const agent = { provider: 'google', baseUrl: '' };
        expect(manager.getEffectiveEndpoint(agent)).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    });

    it('getEffectiveEndpoint returns baseUrl when set', () => {
        const agent = { provider: 'custom', baseUrl: 'https://my.example.com/v1' };
        expect(manager.getEffectiveEndpoint(agent)).toBe('https://my.example.com/v1');
    });

    it('getEffectiveEndpoint returns "" for null agent', () => {
        expect(manager.getEffectiveEndpoint(null)).toBe('');
    });

    it('validateUrl accepts http and https only', () => {
        expect(manager.validateUrl('http://localhost')).toBe(true);
        expect(manager.validateUrl('https://example.com')).toBe(true);
        expect(manager.validateUrl('ftp://example.com')).toBe(false);
        expect(manager.validateUrl('javascript:alert(1)')).toBe(false);
        expect(manager.validateUrl('')).toBe(false);
        expect(manager.validateUrl(null)).toBe(false);
    });
});
```

In `tests/test-runner.html`, after `ai-chat-storage.test.js`, add:
```html
    <script src="test-suites/ai-agent-manager.test.js"></script>
```

- [ ] **Step 2: Run tests; verify they pass**

```bash
node tests/run-tests.js
```
Expected: 6 new tests pass (the stub already has these implementations from Task 1). If any fail, fix in agent-manager.js.

- [ ] **Step 3: Mirror + commit**

```bash
cp assets/js/ai/agent-manager.js dist/assets/js/ai/agent-manager.js
git add assets/js/ai/agent-manager.js dist/assets/js/ai/agent-manager.js \
        tests/test-suites/ai-agent-manager.test.js tests/test-runner.html
git commit -m "feat(ai): agent-manager helpers with TDD"
```

---

### Task 5: ai-client port (chat completion + streaming + fetchModels)

**Goal:** Port chat completion + streaming SSE consumer + fetchModels + testConnection from bim-ai-viewer. Test with mocked fetch.

**Files:**
- Modify: `assets/js/ai/ai-client.js` + dist mirror
- Create: `tests/test-suites/ai-client.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Replace ai-client.js with full port**

`assets/js/ai/ai-client.js`:
```js
/**
 * AI client — direct browser calls to OpenAI-compatible endpoints
 * Supports streaming via Server-Sent Events.
 */

export async function chatCompletion(endpoint, apiKey, model, messages, tools, options = {}) {
    const { temperature = 0.7, maxTokens, signal, onStream } = options;
    const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const body = { model, messages, temperature };
    if (tools?.length) body.tools = tools;
    if (maxTokens) body.max_tokens = maxTokens;
    if (onStream) body.stream = true;

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const err = new Error(`LLM error (${res.status}): ${errText}`);
        err.status = res.status;
        if (res.status === 401 || res.status === 403) err.code = 'auth';
        else if (res.status === 429) err.code = 'rate_limit';
        else if (res.status >= 500) err.code = 'server';
        else err.code = 'http';
        throw err;
    }

    if (onStream && body.stream) {
        return readStream(res, onStream);
    }

    return res.json();
}

async function readStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    const toolCalls = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
                const json = JSON.parse(line.slice(6));
                const choice = json.choices?.[0];
                const delta = choice?.delta;

                if (delta?.content) {
                    fullContent += delta.content;
                    onChunk(delta.content, fullContent);
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index || 0;
                        if (!toolCalls[idx]) {
                            toolCalls[idx] = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                        }
                        if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                }
            } catch { /* skip malformed SSE line */ }
        }
    }

    const result = {
        choices: [{
            message: {
                role: 'assistant',
                content: fullContent || null
            },
            finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
        }]
    };
    if (toolCalls.length) result.choices[0].message.tool_calls = toolCalls;
    return result;
}

export async function fetchModels(endpoint, apiKey) {
    const url = `${endpoint.replace(/\/+$/, '')}/models`;
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);

    const data = await res.json();
    return (data.data || data.models || []).map(m => m.id || m.name || m).sort();
}

export async function testConnection(endpoint, apiKey) {
    try {
        const models = await fetchModels(endpoint, apiKey);
        return { ok: true, models };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
```

- [ ] **Step 2: Write tests with mocked fetch**

`tests/test-suites/ai-client.test.js`:
```js
describe('ai-client', () => {
    let client;
    let originalFetch;

    beforeEach(async () => {
        client = await import('../../assets/js/ai/ai-client.js');
        originalFetch = window.fetch;
    });

    afterEach(() => {
        window.fetch = originalFetch;
    });

    function mockFetch(responseFn) {
        window.fetch = (...args) => Promise.resolve(responseFn(...args));
    }

    it('chatCompletion sends correct body with model + messages + temperature', async () => {
        let captured = null;
        mockFetch((url, opts) => {
            captured = { url, body: JSON.parse(opts.body) };
            return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
                { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
        await client.chatCompletion('https://api.example.com/v1', 'key123', 'm1',
            [{ role: 'user', content: 'hi' }], [], { temperature: 0.5 });
        expect(captured.url).toBe('https://api.example.com/v1/chat/completions');
        expect(captured.body.model).toBe('m1');
        expect(captured.body.messages[0].content).toBe('hi');
        expect(captured.body.temperature).toBe(0.5);
    });

    it('chatCompletion adds Authorization header when apiKey present', async () => {
        let capturedHeaders = null;
        mockFetch((url, opts) => {
            capturedHeaders = opts.headers;
            return new Response('{}', { status: 200 });
        });
        await client.chatCompletion('https://api.example.com/v1', 'sk-abc', 'm', [], []);
        expect(capturedHeaders['Authorization']).toBe('Bearer sk-abc');
    });

    it('chatCompletion does not add Authorization when apiKey empty', async () => {
        let capturedHeaders = null;
        mockFetch((url, opts) => {
            capturedHeaders = opts.headers;
            return new Response('{}', { status: 200 });
        });
        await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(capturedHeaders['Authorization']).toBe(undefined);
    });

    it('chatCompletion 401 throws with code "auth"', async () => {
        mockFetch(() => new Response('Unauthorized', { status: 401 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err).not.toBe(undefined);
        expect(err.status).toBe(401);
        expect(err.code).toBe('auth');
    });

    it('chatCompletion 429 throws with code "rate_limit"', async () => {
        mockFetch(() => new Response('Too many', { status: 429 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err.code).toBe('rate_limit');
    });

    it('chatCompletion 500 throws with code "server"', async () => {
        mockFetch(() => new Response('Boom', { status: 500 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err.code).toBe('server');
    });

    it('fetchModels returns sorted array of ids', async () => {
        mockFetch(() => new Response(
            JSON.stringify({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] }),
            { status: 200 }));
        const models = await client.fetchModels('https://api.example.com/v1', 'k');
        expect(models[0]).toBe('gpt-3.5');
        expect(models[1]).toBe('gpt-4');
    });

    it('testConnection returns {ok:true, models} on success', async () => {
        mockFetch(() => new Response(
            JSON.stringify({ data: [{ id: 'm1' }] }),
            { status: 200 }));
        const result = await client.testConnection('https://api.example.com/v1', 'k');
        expect(result.ok).toBe(true);
        expect(result.models[0]).toBe('m1');
    });

    it('testConnection returns {ok:false, error} on failure', async () => {
        mockFetch(() => new Response('nope', { status: 404 }));
        const result = await client.testConnection('https://api.example.com/v1', 'k');
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
    });
});
```

In `tests/test-runner.html`, after `ai-agent-manager.test.js`, add:
```html
    <script src="test-suites/ai-client.test.js"></script>
```

- [ ] **Step 3: Run tests; verify all pass**

```bash
node tests/run-tests.js
```
Expected: ~511 tests, all pass.

- [ ] **Step 4: Mirror + commit**

```bash
cp assets/js/ai/ai-client.js dist/assets/js/ai/ai-client.js
git add assets/js/ai/ai-client.js dist/assets/js/ai/ai-client.js \
        tests/test-suites/ai-client.test.js tests/test-runner.html
git commit -m "feat(ai): ai-client port — chat completion + streaming + models"
```

---

### Task 6: i18n keys

**Goal:** Add 57 keys × CZ + EN to `translations.js`. No code changes, no tests yet (i18n test suite is Task 16).

**Files:**
- Modify: `assets/js/common/translations.js` + dist mirror

- [ ] **Step 1: Add Czech keys**

In `assets/js/common/translations.js`, find the CZ block (`cs:` or similar) and append before its closing brace. Insert after Phase 6 `presets.*` keys:

```js
        // Phase 7: AI chat
        'ai.settings.tooltip': 'AI agenti — nastavení',
        'ai.settings.title': 'AI Agenti',
        'ai.settings.agentsHeading': 'Agenti',
        'ai.settings.addAgent': '➕ Přidat agenta',
        'ai.settings.close': 'Zavřít',
        'ai.settings.advancedSection': 'Pokročilé: vlastní endpointy',

        'ai.agent.editTitle': 'Upravit agenta',
        'ai.agent.createTitle': 'Vytvořit agenta',
        'ai.agent.nameLabel': 'Název',
        'ai.agent.iconLabel': 'Ikona',
        'ai.agent.providerLabel': 'Provider',
        'ai.agent.endpointLabel': 'Endpoint URL',
        'ai.agent.apiKeyLabel': 'API klíč',
        'ai.agent.modelLabel': 'Model',
        'ai.agent.modelLoadBtn': '↻ Načíst modely',
        'ai.agent.tempLabel': 'Temperatura',
        'ai.agent.systemPromptLabel': 'System prompt',
        'ai.agent.systemPromptPlaceholder': 'Jsi asistent pomáhající uživateli s validací IFC souborů a správou IDS specifikací. Odpovídej česky a stručně.',
        'ai.agent.favoriteToggle': 'Zobrazit v launcheru',
        'ai.agent.cancel': 'Zrušit',
        'ai.agent.save': 'Uložit',
        'ai.agent.nameRequired': 'Název je povinný',
        'ai.agent.urlInvalid': 'URL musí začínat http:// nebo https://',
        'ai.agent.saved': "Agent '{name}' uložen",
        'ai.agent.deleted': "Agent '{name}' smazán",
        'ai.agent.deleteConfirm': "Smazat agenta '{name}'? Všechny konverzace s ním se taky smažou.",

        'ai.launcher.tooltip': 'AI Asistent',
        'ai.launcher.popoverTitle': 'AI Agenti',
        'ai.launcher.noAgents': 'Žádní agenti. Nejdřív si vytvořte agenta v nastavení.',
        'ai.launcher.createFirst': '➕ Vytvořit prvního agenta',
        'ai.launcher.manageAgents': '⚙️ Spravovat agenty',

        'ai.chat.headerLabel': 'AI: {agentName}',
        'ai.chat.toggleThreadsBtn': 'Přepnout konverzace',
        'ai.chat.closeBtn': 'Zavřít chat',
        'ai.chat.inputPlaceholder': 'Zpráva pro agenta...',
        'ai.chat.sendBtn': 'Odeslat',
        'ai.chat.thinking': 'Přemýšlí...',
        'ai.chat.empty': 'Napište zprávu, abychom začali.',
        'ai.chat.toolsDisabled': 'V této fázi (Phase 7) nemá agent přístup k nástrojům — pouze chat.',

        'ai.thread.newConversation': '+ Nová konverzace',
        'ai.thread.threadsHeading': 'Konverzace',
        'ai.thread.noThreads': 'Žádné konverzace',
        'ai.thread.deleteConfirm': 'Smazat konverzaci?',
        'ai.thread.untitledTitle': 'Bez názvu',

        'ai.error.network': 'Síťová chyba. Zkuste znovu.',
        'ai.error.invalidApiKey': "Neplatný API klíč pro {provider}.",
        'ai.error.modelNotFound': "Model '{model}' nenalezen.",
        'ai.error.rateLimit': 'Rate limit překročen. Počkejte chvíli.',
        'ai.error.providerDown': 'Provider má výpadek. Zkuste později.',
        'ai.error.cors': 'CORS: provider nedovoluje fetch z prohlížeče.',
        'ai.error.mixedContent': 'HTTP endpoint nelze volat z HTTPS stránky. Použijte lokální dev server.',
        'ai.error.unknown': 'Neznámá chyba: {message}',

        'ai.endpoint.connecting': 'Testuji spojení...',
        'ai.endpoint.ok': '✓ Spojení OK ({latencyMs}ms)',
        'ai.endpoint.fail': '✗ Spojení selhalo: {error}',
        'ai.endpoint.loadModelsBtn': '↻ Načíst dostupné modely',
        'ai.endpoint.loadModelsFailed': 'Nelze načíst modely. Zadejte ručně.',
```

- [ ] **Step 2: Add English keys**

In the EN block, mirror with same key structure:

```js
        // Phase 7: AI chat
        'ai.settings.tooltip': 'AI agents — settings',
        'ai.settings.title': 'AI Agents',
        'ai.settings.agentsHeading': 'Agents',
        'ai.settings.addAgent': '➕ Add agent',
        'ai.settings.close': 'Close',
        'ai.settings.advancedSection': 'Advanced: custom endpoints',

        'ai.agent.editTitle': 'Edit agent',
        'ai.agent.createTitle': 'Create agent',
        'ai.agent.nameLabel': 'Name',
        'ai.agent.iconLabel': 'Icon',
        'ai.agent.providerLabel': 'Provider',
        'ai.agent.endpointLabel': 'Endpoint URL',
        'ai.agent.apiKeyLabel': 'API key',
        'ai.agent.modelLabel': 'Model',
        'ai.agent.modelLoadBtn': '↻ Load models',
        'ai.agent.tempLabel': 'Temperature',
        'ai.agent.systemPromptLabel': 'System prompt',
        'ai.agent.systemPromptPlaceholder': 'You are an assistant helping the user with IFC file validation and IDS specification management. Be concise.',
        'ai.agent.favoriteToggle': 'Show in launcher',
        'ai.agent.cancel': 'Cancel',
        'ai.agent.save': 'Save',
        'ai.agent.nameRequired': 'Name is required',
        'ai.agent.urlInvalid': 'URL must start with http:// or https://',
        'ai.agent.saved': "Agent '{name}' saved",
        'ai.agent.deleted': "Agent '{name}' deleted",
        'ai.agent.deleteConfirm': "Delete agent '{name}'? All conversations with this agent will also be deleted.",

        'ai.launcher.tooltip': 'AI Assistant',
        'ai.launcher.popoverTitle': 'AI Agents',
        'ai.launcher.noAgents': 'No agents yet. Create one in settings first.',
        'ai.launcher.createFirst': '➕ Create first agent',
        'ai.launcher.manageAgents': '⚙️ Manage agents',

        'ai.chat.headerLabel': 'AI: {agentName}',
        'ai.chat.toggleThreadsBtn': 'Toggle conversations',
        'ai.chat.closeBtn': 'Close chat',
        'ai.chat.inputPlaceholder': 'Message the agent...',
        'ai.chat.sendBtn': 'Send',
        'ai.chat.thinking': 'Thinking...',
        'ai.chat.empty': 'Type a message to get started.',
        'ai.chat.toolsDisabled': 'In this phase (Phase 7) the agent has no tool access — chat only.',

        'ai.thread.newConversation': '+ New conversation',
        'ai.thread.threadsHeading': 'Conversations',
        'ai.thread.noThreads': 'No conversations',
        'ai.thread.deleteConfirm': 'Delete conversation?',
        'ai.thread.untitledTitle': 'Untitled',

        'ai.error.network': 'Network error. Try again.',
        'ai.error.invalidApiKey': "Invalid API key for {provider}.",
        'ai.error.modelNotFound': "Model '{model}' not found.",
        'ai.error.rateLimit': 'Rate limit exceeded. Please wait.',
        'ai.error.providerDown': 'Provider is down. Try later.',
        'ai.error.cors': 'CORS: provider does not allow browser fetch.',
        'ai.error.mixedContent': 'HTTP endpoint cannot be called from HTTPS page. Use local dev server.',
        'ai.error.unknown': 'Unknown error: {message}',

        'ai.endpoint.connecting': 'Testing connection...',
        'ai.endpoint.ok': '✓ Connection OK ({latencyMs}ms)',
        'ai.endpoint.fail': '✗ Connection failed: {error}',
        'ai.endpoint.loadModelsBtn': '↻ Load available models',
        'ai.endpoint.loadModelsFailed': 'Cannot load models. Enter manually.',
```

- [ ] **Step 3: Mirror + run tests + commit**

```bash
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js
git add assets/js/common/translations.js dist/assets/js/common/translations.js
git commit -m "feat(ai): translations CZ + EN for AI chat"
```

Expected: ~511 tests still pass (no behavioural changes).

---

### Task 7: CSS — `ai-chat.css`

**Goal:** All visual styling for launcher, settings modal, chat panel, popover, agent form, missing/loading states.

**Files:**
- Create: `assets/css/ai-chat.css` + dist mirror

- [ ] **Step 1: Create the stylesheet**

`assets/css/ai-chat.css`:
```css
/* ===========================================
   Phase 7: AI chat — launcher, panel, modal
   =========================================== */

/* --- Navbar settings button --- */
.ai-settings-btn {
    background: transparent;
    border: none;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-primary, #1f2937);
    transition: background 0.15s ease;
}
.ai-settings-btn:hover { background: var(--bg-secondary, #f3f4f6); }
.ai-settings-btn svg { width: 22px; height: 22px; }

/* --- Bottom-right launcher --- */
.chat-launcher {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #5568d3 100%));
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.chat-launcher:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(102,126,234,0.4); }
.chat-launcher svg { width: 28px; height: 28px; }

/* --- Launcher popover --- */
.chat-launcher-popover {
    position: fixed;
    bottom: 96px;
    right: 24px;
    min-width: 240px;
    max-width: 320px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-primary, #e5e7eb);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    padding: 8px;
    z-index: 9000;
    display: none;
}
.chat-launcher-popover.is-open { display: block; }
.chat-launcher-popover__title {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--text-tertiary, #6b7280);
    padding: 8px 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.chat-launcher-popover__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-primary, #1f2937);
    font-size: 0.95em;
    transition: background 0.1s ease;
}
.chat-launcher-popover__item:hover { background: var(--bg-secondary, #f3f4f6); }
.chat-launcher-popover__item__icon { font-size: 1.2em; }
.chat-launcher-popover__divider {
    height: 1px;
    background: var(--border-primary, #e5e7eb);
    margin: 4px 0;
}

/* --- Settings modal extends existing .modal-overlay --- */
.ai-settings-modal .modal-container { max-width: 720px; }
.ai-settings-modal__agents { display: flex; flex-direction: column; gap: 12px; }
.ai-settings-modal__agent-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-secondary, #f8f9fa);
    border-radius: 8px;
    border: 1px solid var(--border-primary, #e5e7eb);
}
.ai-settings-modal__agent-icon { font-size: 1.5em; }
.ai-settings-modal__agent-info { flex: 1; }
.ai-settings-modal__agent-name { font-weight: 600; }
.ai-settings-modal__agent-meta { font-size: 0.85em; color: var(--text-tertiary, #6b7280); }
.ai-settings-modal__agent-actions { display: flex; gap: 8px; }
.ai-settings-modal__icon-btn {
    background: transparent;
    border: 1px solid var(--border-primary, #e5e7eb);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
}
.ai-settings-modal__icon-btn:hover { background: var(--bg-tertiary, #e5e7eb); }
.ai-settings-modal__add-btn {
    align-self: flex-start;
    padding: 10px 16px;
    background: var(--primary-color, #667eea);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
}
.ai-settings-modal__advanced { margin-top: 24px; }
.ai-settings-modal__advanced summary {
    cursor: pointer;
    padding: 8px 0;
    color: var(--text-tertiary, #6b7280);
}

/* --- Agent form --- */
.agent-form { display: flex; flex-direction: column; gap: 16px; }
.agent-form__row { display: flex; flex-direction: column; gap: 6px; }
.agent-form__row label { font-weight: 500; font-size: 0.9em; }
.agent-form__row input[type="text"],
.agent-form__row input[type="password"],
.agent-form__row select,
.agent-form__row textarea {
    padding: 10px 12px;
    border: 1px solid var(--border-primary, #d1d5db);
    border-radius: 6px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #1f2937);
    font-size: 0.95em;
    font-family: inherit;
}
.agent-form__row textarea { min-height: 100px; resize: vertical; }
.agent-form__row__row { display: flex; gap: 8px; align-items: center; }
.agent-form__row__row select { flex: 1; }
.agent-form__temp-display {
    font-variant-numeric: tabular-nums;
    color: var(--primary-color, #667eea);
    font-weight: 600;
    margin-left: 8px;
}
.agent-form__error {
    color: var(--danger, #dc2626);
    font-size: 0.85em;
    display: none;
}
.agent-form__error.is-visible { display: block; }
.agent-form__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

/* --- Chat panel --- */
.chat-panel {
    position: fixed;
    top: 60px;
    right: 0;
    bottom: 0;
    width: 480px;
    background: var(--bg-primary, #fff);
    border-left: 1px solid var(--border-primary, #e5e7eb);
    box-shadow: -4px 0 16px rgba(0,0,0,0.05);
    display: none;
    flex-direction: column;
    z-index: 9050;
}
.chat-panel.is-open { display: flex; }
.chat-panel__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-primary, #e5e7eb);
}
.chat-panel__header__title { flex: 1; font-weight: 600; }
.chat-panel__header__btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--text-primary, #1f2937);
}
.chat-panel__header__btn:hover { background: var(--bg-secondary, #f3f4f6); }

.chat-panel__body { flex: 1; display: flex; overflow: hidden; }

.chat-panel__threads {
    width: 200px;
    border-right: 1px solid var(--border-primary, #e5e7eb);
    overflow-y: auto;
    padding: 8px;
    background: var(--bg-secondary, #fafbfc);
    flex: 0 0 auto;
    transition: width 0.2s ease, padding 0.2s ease;
}
.chat-panel__threads.is-collapsed { width: 0; padding: 0; overflow: hidden; }
.chat-panel__threads__heading {
    font-size: 0.8em;
    font-weight: 600;
    color: var(--text-tertiary, #6b7280);
    padding: 4px 8px;
    text-transform: uppercase;
}
.chat-panel__threads__new {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    background: transparent;
    border: 1px dashed var(--border-primary, #cbd5e1);
    border-radius: 6px;
    color: var(--primary-color, #667eea);
    cursor: pointer;
    margin: 4px 0 8px;
    font-weight: 500;
}
.chat-panel__threads__item {
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9em;
}
.chat-panel__threads__item:hover { background: var(--bg-tertiary, rgba(0,0,0,0.04)); }
.chat-panel__threads__item.is-active { background: var(--primary-light, #e0e7ff); color: var(--primary-color, #667eea); font-weight: 500; }
.chat-panel__threads__item__title { font-weight: 500; line-height: 1.3; }
.chat-panel__threads__item__time { font-size: 0.75em; color: var(--text-tertiary, #6b7280); margin-top: 2px; }

.chat-panel__messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.chat-panel__tools-banner {
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.1);
    border-left: 3px solid var(--warning, #f59e0b);
    border-radius: 4px;
    font-size: 0.85em;
    color: var(--text-tertiary, #6b7280);
}

.chat-panel__msg {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    line-height: 1.5;
    word-wrap: break-word;
}
.chat-panel__msg--user {
    align-self: flex-end;
    background: var(--primary-color, #667eea);
    color: white;
}
.chat-panel__msg--assistant {
    align-self: flex-start;
    background: var(--bg-secondary, #f3f4f6);
    color: var(--text-primary, #1f2937);
}
.chat-panel__msg--thinking {
    align-self: flex-start;
    color: var(--text-tertiary, #6b7280);
    font-style: italic;
}
.chat-panel__msg pre,
.chat-panel__msg code {
    background: rgba(0,0,0,0.06);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.9em;
}

.chat-panel__input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-primary, #e5e7eb);
}
.chat-panel__input textarea {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--border-primary, #d1d5db);
    border-radius: 8px;
    background: var(--bg-primary, #fff);
    resize: none;
    min-height: 38px;
    max-height: 120px;
    font-family: inherit;
    font-size: 0.95em;
}
.chat-panel__input button {
    background: var(--primary-color, #667eea);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0 16px;
    cursor: pointer;
    font-weight: 500;
}
.chat-panel__input button:disabled { opacity: 0.5; cursor: not-allowed; }

/* --- Responsive --- */
@media (max-width: 1023px) {
    .chat-panel { width: 100%; }
    .ai-settings-modal .modal-container { max-width: 90%; }
}
@media (max-width: 767px) {
    .chat-panel__threads { width: 160px; }
    .chat-launcher-popover {
        bottom: 0;
        right: 0;
        left: 0;
        max-width: 100%;
        border-radius: 12px 12px 0 0;
    }
}
```

- [ ] **Step 2: Mirror + commit**

```bash
mkdir -p dist/assets/css
cp assets/css/ai-chat.css dist/assets/css/ai-chat.css
git add assets/css/ai-chat.css dist/assets/css/ai-chat.css
git commit -m "feat(ai): CSS for launcher, panel, modal, popover, agent form"
```

---

### Task 8: HTML modifications — settings button + script tags + CSS link

**Goal:** Add navbar settings button + load AI module + load CSS in 3 pages.

**Files:**
- Modify: `pages/ids-ifc-validator.html` + dist mirror
- Modify: `pages/ids-parser-visualizer.html` + dist mirror
- Modify: `pages/ifc-viewer-multi-file.html` + dist mirror

- [ ] **Step 1: Add CSS link + script tag + navbar button to validator**

In `pages/ids-ifc-validator.html`:

1. After existing `<link rel="stylesheet" href="../assets/css/progress-panel.css">` line, add:
```html
    <link rel="stylesheet" href="../assets/css/ai-chat.css">
```

2. In navbar, find `<button class="wizard-header-btn" id="wizard-help-btn"`. **AFTER** that button's closing `</button>` tag, add:
```html
                <!-- Phase 7: AI settings -->
                <button class="ai-settings-btn" id="aiSettingsBtn" title="AI agenti — nastavení" data-i18n-title="ai.settings.tooltip" aria-label="AI settings">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                </button>
```

3. At end of `<body>`, before `</body>`, add:
```html
    <script type="module" src="../assets/js/ai-ui/init.js"></script>
```

- [ ] **Step 2: Repeat for parser-visualizer and viewer**

`pages/ids-parser-visualizer.html` and `pages/ifc-viewer-multi-file.html`: same three insertions. Settings button placement: directly after `wizard-help-btn` (or `wizard-tour-btn` if help button differs in that page — verify by reading).

- [ ] **Step 3: Mirror to dist + run tests**

```bash
cp pages/ids-ifc-validator.html      dist/pages/ids-ifc-validator.html
cp pages/ids-parser-visualizer.html  dist/pages/ids-parser-visualizer.html
cp pages/ifc-viewer-multi-file.html  dist/pages/ifc-viewer-multi-file.html
node tests/run-tests.js
```
Expected: ~511 still pass. (init.js will 404 on test runner since it doesn't exist yet — but tests don't load these pages.)

- [ ] **Step 4: Commit**

```bash
git add pages/*.html dist/pages/*.html
git commit -m "feat(ai): navbar settings button + AI script + CSS in 3 pages"
```

---

### Task 9: chat-launcher.js — bottom-right button + popover

**Goal:** Inject the circular robot button + popover with favorite agents. Click handlers wire to (yet-undefined) settings/chat openers via custom events.

**Files:**
- Create: `assets/js/ai-ui/chat-launcher.js` + dist mirror
- Create: `assets/js/ai-ui/chat-i18n-helpers.js` + dist mirror

- [ ] **Step 1: Create i18n helper module**

`assets/js/ai-ui/chat-i18n-helpers.js`:
```js
/**
 * i18n helpers — re-export `t()` for module use, register
 * languageChanged listeners that re-render AI UI elements.
 */

export function t(key, params) {
    if (typeof window.t !== 'function') return key;
    let result = window.t(key);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, v);
        }
    }
    return result;
}

const _reRenderCallbacks = [];
let _wired = false;

export function onLanguageChange(callback) {
    _reRenderCallbacks.push(callback);
    if (!_wired) {
        window.addEventListener('languageChanged', () => {
            for (const cb of _reRenderCallbacks) {
                try { cb(); } catch (e) { console.warn('[ai-i18n] re-render error:', e); }
            }
        });
        _wired = true;
    }
}
```

- [ ] **Step 2: Create chat-launcher.js**

`assets/js/ai-ui/chat-launcher.js`:
```js
/**
 * Bottom-right circular launcher button + popover with favorite agents.
 *
 * Emits custom events:
 *   ai:openSettings   — user wants to open settings modal
 *   ai:openChat       — { detail: { agentId } } — user wants to chat with agent
 */

import { listFavorites } from '../ai/chat-storage.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';

let _button = null;
let _popover = null;
let _open = false;

export async function init() {
    _injectButton();
    _injectPopover();
    document.addEventListener('click', _onDocClick);
    onLanguageChange(_rerenderPopover);
}

function _injectButton() {
    if (document.getElementById('chatLauncher')) return;
    _button = document.createElement('button');
    _button.id = 'chatLauncher';
    _button.className = 'chat-launcher';
    _button.setAttribute('aria-label', t('ai.launcher.tooltip'));
    _button.title = t('ai.launcher.tooltip');
    _button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <line x1="8" y1="16" x2="8" y2="16"/>
            <line x1="16" y1="16" x2="16" y2="16"/>
        </svg>`;
    _button.addEventListener('click', _toggle);
    document.body.appendChild(_button);
}

function _injectPopover() {
    if (document.getElementById('chatLauncherPopover')) return;
    _popover = document.createElement('div');
    _popover.id = 'chatLauncherPopover';
    _popover.className = 'chat-launcher-popover';
    document.body.appendChild(_popover);
}

async function _toggle() {
    if (_open) return _close();
    await _rerenderPopover();
    _popover.classList.add('is-open');
    _open = true;
}

function _close() {
    if (!_open) return;
    _popover.classList.remove('is-open');
    _open = false;
}

function _onDocClick(e) {
    if (!_open) return;
    if (e.target === _button || _button.contains(e.target)) return;
    if (e.target === _popover || _popover.contains(e.target)) return;
    _close();
}

async function _rerenderPopover() {
    if (!_popover) return;
    const favs = await listFavorites();
    _popover.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'chat-launcher-popover__title';
    title.textContent = t('ai.launcher.popoverTitle');
    _popover.appendChild(title);

    if (favs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-launcher-popover__item';
        empty.textContent = t('ai.launcher.noAgents');
        empty.style.color = 'var(--text-tertiary)';
        empty.style.fontStyle = 'italic';
        _popover.appendChild(empty);
        const create = document.createElement('div');
        create.className = 'chat-launcher-popover__item';
        create.textContent = t('ai.launcher.createFirst');
        create.addEventListener('click', () => {
            _close();
            window.dispatchEvent(new CustomEvent('ai:openSettings'));
        });
        _popover.appendChild(create);
        return;
    }

    for (const agent of favs.slice(0, 8)) {
        const item = document.createElement('div');
        item.className = 'chat-launcher-popover__item';
        item.innerHTML = `
            <span class="chat-launcher-popover__item__icon">${agent.icon || '🤖'}</span>
            <span>${escapeHtml(agent.name)}</span>`;
        item.addEventListener('click', () => {
            _close();
            window.dispatchEvent(new CustomEvent('ai:openChat', { detail: { agentId: agent.id } }));
        });
        _popover.appendChild(item);
    }

    const divider = document.createElement('div');
    divider.className = 'chat-launcher-popover__divider';
    _popover.appendChild(divider);

    const manage = document.createElement('div');
    manage.className = 'chat-launcher-popover__item';
    manage.textContent = t('ai.launcher.manageAgents');
    manage.addEventListener('click', () => {
        _close();
        window.dispatchEvent(new CustomEvent('ai:openSettings'));
    });
    _popover.appendChild(manage);
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
}
```

- [ ] **Step 3: Mirror + commit**

```bash
mkdir -p dist/assets/js/ai-ui
cp assets/js/ai-ui/*.js dist/assets/js/ai-ui/
git add assets/js/ai-ui/ dist/assets/js/ai-ui/
git commit -m "feat(ai): chat launcher button + popover with favorites"
```

---

### Task 10: settings-modal.js — agent list + form CRUD

**Goal:** Settings modal: list of agents, add/edit form with provider picker, model loading, temperature slider, save flow.

**Files:**
- Create: `assets/js/ai-ui/settings-modal.js` + dist mirror

- [ ] **Step 1: Create settings-modal.js**

`assets/js/ai-ui/settings-modal.js`:
```js
/**
 * Settings modal — manage AI agents.
 * Exports a single `open()` function that injects the modal lazily on first call.
 */

import * as storage from '../ai/chat-storage.js';
import { PROVIDERS } from '../ai/providers.js';
import { fetchModels } from '../ai/ai-client.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';

let _modal = null;
let _state = { view: 'list', editingId: null, modelsCache: {} };

export async function open() {
    if (!_modal) _injectModal();
    await _renderListView();
    _modal.classList.add('active');
}

function _close() {
    if (_modal) _modal.classList.remove('active');
}

function _injectModal() {
    _modal = document.createElement('div');
    _modal.className = 'modal-overlay ai-settings-modal';
    _modal.id = 'aiSettingsModal';
    _modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2 id="aiSettingsTitle">AI Agenti</h2>
                <button class="modal-close" id="aiSettingsClose">&times;</button>
            </div>
            <div class="modal-body" id="aiSettingsBody"></div>
        </div>`;
    document.body.appendChild(_modal);
    _modal.querySelector('#aiSettingsClose').addEventListener('click', _close);
    _modal.addEventListener('click', (e) => {
        if (e.target === _modal) _close();
    });
    onLanguageChange(() => {
        if (_state.view === 'list') _renderListView();
        else _renderFormView(_state.editingId);
    });
}

async function _renderListView() {
    _state.view = 'list';
    _modal.querySelector('#aiSettingsTitle').textContent = t('ai.settings.title');
    const body = _modal.querySelector('#aiSettingsBody');
    const agents = await storage.listAgents();
    body.innerHTML = '';

    const heading = document.createElement('h3');
    heading.textContent = t('ai.settings.agentsHeading');
    heading.style.cssText = 'margin: 0 0 12px; font-size: 1em;';
    body.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'ai-settings-modal__agents';
    body.appendChild(list);

    for (const agent of agents) {
        const row = document.createElement('div');
        row.className = 'ai-settings-modal__agent-row';
        const provName = PROVIDERS[agent.provider]?.name || agent.provider;
        row.innerHTML = `
            <div class="ai-settings-modal__agent-icon">${escapeHtml(agent.icon || '🤖')}</div>
            <div class="ai-settings-modal__agent-info">
                <div class="ai-settings-modal__agent-name">${escapeHtml(agent.name)}</div>
                <div class="ai-settings-modal__agent-meta">
                    ${escapeHtml(provName)} · ${escapeHtml(agent.model || '(model nezvolen)')}
                    ${agent.isFavorite ? ' · ⭐' : ''}
                </div>
            </div>
            <div class="ai-settings-modal__agent-actions">
                <button class="ai-settings-modal__icon-btn" data-action="edit" title="Upravit">✏️</button>
                <button class="ai-settings-modal__icon-btn" data-action="delete" title="Smazat">🗑️</button>
            </div>`;
        row.querySelector('[data-action="edit"]').addEventListener('click', () => _renderFormView(agent.id));
        row.querySelector('[data-action="delete"]').addEventListener('click', () => _deleteAgent(agent.id));
        list.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'ai-settings-modal__add-btn';
    addBtn.textContent = t('ai.settings.addAgent');
    addBtn.addEventListener('click', () => _renderFormView(null));
    body.appendChild(addBtn);

    const advanced = document.createElement('details');
    advanced.className = 'ai-settings-modal__advanced';
    advanced.innerHTML = `<summary>${t('ai.settings.advancedSection')}</summary>
        <p style="color: var(--text-tertiary); padding: 8px 0;">
            (Nepoužito v Phase 7 — připraveno pro budoucí endpoint library.)
        </p>`;
    body.appendChild(advanced);
}

async function _renderFormView(agentId) {
    _state.view = 'form';
    _state.editingId = agentId;
    const agent = agentId ? await storage.getAgent(agentId) : _newAgentDefaults();
    _modal.querySelector('#aiSettingsTitle').textContent = agentId ? t('ai.agent.editTitle') : t('ai.agent.createTitle');
    const body = _modal.querySelector('#aiSettingsBody');

    body.innerHTML = `
        <form class="agent-form" id="agentForm">
            <div class="agent-form__row">
                <label>${t('ai.agent.iconLabel')}</label>
                <input type="text" id="agentIcon" maxlength="4" value="${escapeAttr(agent.icon || '🤖')}" style="width:80px;">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.nameLabel')}</label>
                <input type="text" id="agentName" maxlength="80" value="${escapeAttr(agent.name || '')}">
                <div class="agent-form__error" id="agentNameError">${t('ai.agent.nameRequired')}</div>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.providerLabel')}</label>
                <select id="agentProvider">
                    ${Object.entries(PROVIDERS).map(([k, p]) =>
                        `<option value="${k}"${k === agent.provider ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.endpointLabel')}</label>
                <input type="text" id="agentEndpoint" placeholder="https://..." value="${escapeAttr(agent.baseUrl || '')}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.apiKeyLabel')}</label>
                <input type="password" id="agentApiKey" value="${escapeAttr(agent.apiKey || '')}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.modelLabel')}</label>
                <div class="agent-form__row__row">
                    <select id="agentModelSelect" style="display:none"></select>
                    <input type="text" id="agentModelText" value="${escapeAttr(agent.model || '')}" placeholder="model id">
                    <button type="button" id="agentLoadModelsBtn">${t('ai.agent.modelLoadBtn')}</button>
                </div>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.tempLabel')}<span class="agent-form__temp-display" id="tempDisplay">${agent.temperature.toFixed(2)}</span></label>
                <input type="range" id="agentTemp" min="0" max="1" step="0.05" value="${agent.temperature}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.systemPromptLabel')}</label>
                <textarea id="agentSystemPrompt" placeholder="${escapeAttr(t('ai.agent.systemPromptPlaceholder'))}">${escapeHtml(agent.systemPrompt || '')}</textarea>
            </div>
            <div class="agent-form__row">
                <label>
                    <input type="checkbox" id="agentFav"${agent.isFavorite ? ' checked' : ''}>
                    ${t('ai.agent.favoriteToggle')}
                </label>
            </div>
            <div class="agent-form__actions">
                <button type="button" id="agentCancelBtn" class="ai-settings-modal__icon-btn">${t('ai.agent.cancel')}</button>
                <button type="submit" class="ai-settings-modal__add-btn">${t('ai.agent.save')}</button>
            </div>
        </form>`;

    body.querySelector('#agentTemp').addEventListener('input', (e) => {
        body.querySelector('#tempDisplay').textContent = parseFloat(e.target.value).toFixed(2);
    });
    body.querySelector('#agentCancelBtn').addEventListener('click', () => _renderListView());
    body.querySelector('#agentLoadModelsBtn').addEventListener('click', () => _loadModelsIntoForm());
    body.querySelector('#agentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        _saveFromForm();
    });
}

async function _loadModelsIntoForm() {
    const provider = _modal.querySelector('#agentProvider').value;
    const baseUrl = _modal.querySelector('#agentEndpoint').value || PROVIDERS[provider].endpoint;
    const apiKey = _modal.querySelector('#agentApiKey').value;
    if (!baseUrl) return;
    const cacheKey = `${baseUrl}::${apiKey}`;
    const select = _modal.querySelector('#agentModelSelect');
    const text = _modal.querySelector('#agentModelText');
    try {
        const models = _state.modelsCache[cacheKey] || await fetchModels(baseUrl, apiKey);
        _state.modelsCache[cacheKey] = models;
        const current = text.value;
        select.innerHTML = models.map(m => `<option value="${escapeAttr(m)}"${m === current ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
        select.style.display = '';
        text.style.display = 'none';
        select.addEventListener('change', () => { text.value = select.value; });
        if (current) select.value = current;
    } catch (e) {
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.error(t('ai.endpoint.loadModelsFailed'));
        }
        console.warn('Failed to load models:', e);
    }
}

async function _saveFromForm() {
    const name = _modal.querySelector('#agentName').value.trim();
    const errEl = _modal.querySelector('#agentNameError');
    if (!name) {
        errEl.classList.add('is-visible');
        return;
    }
    errEl.classList.remove('is-visible');
    const data = {
        id: _state.editingId || undefined,
        name,
        icon: _modal.querySelector('#agentIcon').value || '🤖',
        provider: _modal.querySelector('#agentProvider').value,
        baseUrl: _modal.querySelector('#agentEndpoint').value.trim(),
        apiKey: _modal.querySelector('#agentApiKey').value,
        model: _modal.querySelector('#agentModelSelect').style.display === 'none'
            ? _modal.querySelector('#agentModelText').value.trim()
            : _modal.querySelector('#agentModelSelect').value,
        systemPrompt: _modal.querySelector('#agentSystemPrompt').value,
        temperature: parseFloat(_modal.querySelector('#agentTemp').value),
        isFavorite: _modal.querySelector('#agentFav').checked
    };
    try {
        await storage.saveAgent(data);
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.success(t('ai.agent.saved').replace('{name}', name));
        }
        await _renderListView();
        // Notify launcher to re-render favorites
        window.dispatchEvent(new CustomEvent('ai:agentsChanged'));
    } catch (e) {
        console.error('Save failed:', e);
    }
}

async function _deleteAgent(id) {
    const agent = await storage.getAgent(id);
    if (!agent) return;
    const msg = t('ai.agent.deleteConfirm').replace('{name}', agent.name);
    if (!confirm(msg)) return;
    await storage.deleteAgent(id);
    if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.success(t('ai.agent.deleted').replace('{name}', agent.name));
    }
    await _renderListView();
    window.dispatchEvent(new CustomEvent('ai:agentsChanged'));
}

function _newAgentDefaults() {
    return {
        icon: '🤖', name: '', provider: 'google', baseUrl: '', apiKey: '',
        model: '', systemPrompt: '', temperature: 0.7, isFavorite: true
    };
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
```

- [ ] **Step 2: Mirror + commit**

```bash
cp assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
git add assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
git commit -m "feat(ai): settings modal with agent CRUD form"
```

---

### Task 11: chat-panel.js — threads sidebar + messages + streaming

**Goal:** Right-side panel with threads sidebar, messages area, input, and streaming AI responses.

**Files:**
- Create: `assets/js/ai-ui/chat-panel.js` + dist mirror

- [ ] **Step 1: Create chat-panel.js**

`assets/js/ai-ui/chat-panel.js`:
```js
/**
 * Chat panel — right-side floating panel with threads sidebar + messages + streaming input.
 *
 * Public API: openForAgent(agentId), close()
 */

import * as storage from '../ai/chat-storage.js';
import { chatCompletion } from '../ai/ai-client.js';
import { getEffectiveEndpoint } from '../ai/agent-manager.js';
import { TOOL_DEFINITIONS } from '../ai/tool-defs.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';

let _panel = null;
let _state = { agentId: null, threadId: null, busy: false, abort: null };

export async function openForAgent(agentId) {
    if (!_panel) _injectPanel();
    _state.agentId = agentId;
    _state.threadId = null;
    await _refreshHeader();
    await _refreshThreadsSidebar();
    await _refreshMessages();
    _panel.classList.add('is-open');
    await storage.updateSettings({ chatPanelOpen: true, lastActiveAgentId: agentId });
}

export function close() {
    if (_panel) _panel.classList.remove('is-open');
    if (_state.abort) _state.abort.abort();
    storage.updateSettings({ chatPanelOpen: false });
}

function _injectPanel() {
    _panel = document.createElement('aside');
    _panel.id = 'aiChatPanel';
    _panel.className = 'chat-panel';
    _panel.innerHTML = `
        <div class="chat-panel__header">
            <span class="chat-panel__header__title" id="chatHeaderTitle"></span>
            <button class="chat-panel__header__btn" id="chatToggleThreads" title="${t('ai.chat.toggleThreadsBtn')}">↔</button>
            <button class="chat-panel__header__btn" id="chatCloseBtn" title="${t('ai.chat.closeBtn')}">✕</button>
        </div>
        <div class="chat-panel__body">
            <aside class="chat-panel__threads" id="chatThreadsSidebar"></aside>
            <main class="chat-panel__messages" id="chatMessages"></main>
        </div>
        <div class="chat-panel__input">
            <textarea id="chatInput" placeholder="${t('ai.chat.inputPlaceholder')}" rows="1"></textarea>
            <button id="chatSendBtn">${t('ai.chat.sendBtn')}</button>
        </div>`;
    document.body.appendChild(_panel);

    _panel.querySelector('#chatCloseBtn').addEventListener('click', close);
    _panel.querySelector('#chatToggleThreads').addEventListener('click', _toggleThreadsSidebar);
    _panel.querySelector('#chatSendBtn').addEventListener('click', _send);
    const input = _panel.querySelector('#chatInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _send();
        }
    });
    input.addEventListener('input', _autoGrowInput);
    onLanguageChange(() => {
        _refreshHeader();
        _panel.querySelector('#chatInput').placeholder = t('ai.chat.inputPlaceholder');
        _panel.querySelector('#chatSendBtn').textContent = t('ai.chat.sendBtn');
    });
}

function _autoGrowInput() {
    const ta = _panel.querySelector('#chatInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

async function _toggleThreadsSidebar() {
    const sidebar = _panel.querySelector('#chatThreadsSidebar');
    sidebar.classList.toggle('is-collapsed');
    await storage.updateSettings({ threadsSidebarOpen: !sidebar.classList.contains('is-collapsed') });
}

async function _refreshHeader() {
    const agent = await storage.getAgent(_state.agentId);
    if (!agent) return;
    const title = t('ai.chat.headerLabel').replace('{agentName}', `${agent.icon || '🤖'} ${agent.name}`);
    _panel.querySelector('#chatHeaderTitle').textContent = title;
}

async function _refreshThreadsSidebar() {
    const sidebar = _panel.querySelector('#chatThreadsSidebar');
    sidebar.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'chat-panel__threads__heading';
    heading.textContent = t('ai.thread.threadsHeading');
    sidebar.appendChild(heading);

    const newBtn = document.createElement('button');
    newBtn.className = 'chat-panel__threads__new';
    newBtn.textContent = t('ai.thread.newConversation');
    newBtn.addEventListener('click', () => {
        _state.threadId = null;
        _refreshMessages();
    });
    sidebar.appendChild(newBtn);

    const threads = await storage.listThreads(_state.agentId);
    if (threads.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 12px; color: var(--text-tertiary); font-size: 0.85em; text-align: center;';
        empty.textContent = t('ai.thread.noThreads');
        sidebar.appendChild(empty);
        return;
    }

    for (const thread of threads) {
        const item = document.createElement('div');
        item.className = 'chat-panel__threads__item';
        if (thread.id === _state.threadId) item.classList.add('is-active');
        item.innerHTML = `
            <div class="chat-panel__threads__item__title">${escapeHtml(thread.title || t('ai.thread.untitledTitle'))}</div>
            <div class="chat-panel__threads__item__time">${_relativeTime(thread.updatedAt)}</div>`;
        item.addEventListener('click', () => {
            _state.threadId = thread.id;
            _refreshMessages();
            _refreshThreadsSidebar();
        });
        sidebar.appendChild(item);
    }
}

async function _refreshMessages() {
    const main = _panel.querySelector('#chatMessages');
    main.innerHTML = '';

    // Phase 7 banner
    const banner = document.createElement('div');
    banner.className = 'chat-panel__tools-banner';
    banner.textContent = t('ai.chat.toolsDisabled');
    main.appendChild(banner);

    if (!_state.threadId) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; color: var(--text-tertiary); padding: 24px;';
        empty.textContent = t('ai.chat.empty');
        main.appendChild(empty);
        return;
    }

    const msgs = await storage.listMessages(_state.threadId);
    for (const m of msgs) {
        if (m.role === 'system' || m.role === 'tool') continue;  // not displayed in Phase 7
        _appendBubble(m.role, m.content || '');
    }
    main.scrollTop = main.scrollHeight;
}

function _appendBubble(role, content) {
    const main = _panel.querySelector('#chatMessages');
    const div = document.createElement('div');
    div.className = `chat-panel__msg chat-panel__msg--${role}`;
    div.textContent = content;
    main.appendChild(div);
    main.scrollTop = main.scrollHeight;
    return div;
}

async function _send() {
    if (_state.busy) return;
    const input = _panel.querySelector('#chatInput');
    const text = input.value.trim();
    if (!text) return;

    const agent = await storage.getAgent(_state.agentId);
    if (!agent) return;

    if (!_state.threadId) {
        _state.threadId = await storage.createThread(_state.agentId, text);
        await _refreshThreadsSidebar();
    } else {
        await storage.appendMessage(_state.threadId, { role: 'user', content: text });
    }

    _appendBubble('user', text);
    input.value = '';
    _autoGrowInput();

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'chat-panel__msg chat-panel__msg--thinking';
    thinkingDiv.textContent = t('ai.chat.thinking');
    _panel.querySelector('#chatMessages').appendChild(thinkingDiv);

    _state.busy = true;
    _state.abort = new AbortController();

    try {
        const allMsgs = await storage.listMessages(_state.threadId);
        const apiMessages = [];
        if (agent.systemPrompt) apiMessages.push({ role: 'system', content: agent.systemPrompt });
        for (const m of allMsgs) {
            apiMessages.push({ role: m.role, content: m.content });
        }

        const endpoint = getEffectiveEndpoint(agent);
        let streamed = '';
        const result = await chatCompletion(endpoint, agent.apiKey, agent.model, apiMessages, TOOL_DEFINITIONS, {
            temperature: agent.temperature,
            signal: _state.abort.signal,
            onStream: (delta, full) => {
                streamed = full;
                thinkingDiv.classList.remove('chat-panel__msg--thinking');
                thinkingDiv.classList.add('chat-panel__msg--assistant');
                thinkingDiv.textContent = full;
                _panel.querySelector('#chatMessages').scrollTop = 1e9;
            }
        });

        const finalContent = streamed || result?.choices?.[0]?.message?.content || '';
        thinkingDiv.classList.remove('chat-panel__msg--thinking');
        thinkingDiv.classList.add('chat-panel__msg--assistant');
        thinkingDiv.textContent = finalContent;

        await storage.appendMessage(_state.threadId, { role: 'assistant', content: finalContent });
    } catch (err) {
        thinkingDiv.classList.remove('chat-panel__msg--thinking');
        thinkingDiv.classList.add('chat-panel__msg--assistant');
        thinkingDiv.textContent = `[Error] ${err.message || err}`;
        const errKey = _errorKeyFromException(err);
        if (typeof ErrorHandler !== 'undefined' && errKey) {
            ErrorHandler.error(t(errKey).replace('{provider}', PROVIDERS_NAME(agent.provider)));
        }
    } finally {
        _state.busy = false;
        _state.abort = null;
    }
}

function _errorKeyFromException(err) {
    if (!err) return null;
    if (err.code === 'auth') return 'ai.error.invalidApiKey';
    if (err.code === 'rate_limit') return 'ai.error.rateLimit';
    if (err.code === 'server') return 'ai.error.providerDown';
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) return 'ai.error.network';
    return 'ai.error.unknown';
}

function PROVIDERS_NAME(key) {
    const map = { ollama:'Ollama', google:'Google AI', openai:'OpenAI', openrouter:'OpenRouter', custom:'Custom' };
    return map[key] || key;
}

function _relativeTime(ms) {
    const diff = Date.now() - ms;
    if (diff < 60000) return 'teď';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`;
    return new Date(ms).toLocaleDateString();
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
```

- [ ] **Step 2: Mirror + commit**

```bash
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
git add assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
git commit -m "feat(ai): chat panel with threads sidebar + streaming"
```

---

### Task 12: init.js — DOMContentLoaded bootstrap

**Goal:** Wire navbar settings button, launcher, and event listeners on page load.

**Files:**
- Create: `assets/js/ai-ui/init.js` + dist mirror

- [ ] **Step 1: Create init.js**

`assets/js/ai-ui/init.js`:
```js
/**
 * AI chat bootstrap — runs on DOMContentLoaded on every page.
 *
 * Wires:
 *   - #aiSettingsBtn click → open settings modal (lazy)
 *   - <body> launcher button + popover (lazy)
 *   - 'ai:openSettings' / 'ai:openChat' / 'ai:agentsChanged' custom events
 */

import * as launcher from './chat-launcher.js';

let _settingsModalPromise = null;
let _chatPanelPromise = null;

async function getSettingsModal() {
    if (!_settingsModalPromise) {
        _settingsModalPromise = import('./settings-modal.js');
    }
    return _settingsModalPromise;
}

async function getChatPanel() {
    if (!_chatPanelPromise) {
        _chatPanelPromise = import('./chat-panel.js');
    }
    return _chatPanelPromise;
}

async function init() {
    // Inject launcher button immediately
    await launcher.init();

    // Wire navbar settings button
    const settingsBtn = document.getElementById('aiSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            const m = await getSettingsModal();
            await m.open();
        });
    }

    // Listen for custom events from launcher
    window.addEventListener('ai:openSettings', async () => {
        const m = await getSettingsModal();
        await m.open();
    });

    window.addEventListener('ai:openChat', async (e) => {
        const m = await getChatPanel();
        await m.openForAgent(e.detail.agentId);
    });

    // When agents change, re-render launcher popover
    window.addEventListener('ai:agentsChanged', () => {
        // Launcher's popover re-renders next time it opens.
        // Already wired through onLanguageChange + listFavorites call on open.
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
```

- [ ] **Step 2: Mirror + commit + manual smoke-test**

```bash
cp assets/js/ai-ui/init.js dist/assets/js/ai-ui/init.js
node tests/run-tests.js
```
Expected: ~511 still pass.

Smoke test (optional, manual):
```bash
python3 -m http.server 8080 &
SERVER=$!
# Open http://localhost:8080/pages/ids-ifc-validator.html in a browser
# Verify: navbar gear icon visible, bottom-right robot button visible
# Click gear → settings modal opens with empty list + "Add agent" button
# Click robot → popover with "No agents yet"
kill $SERVER
```

```bash
git add assets/js/ai-ui/init.js dist/assets/js/ai-ui/init.js
git commit -m "feat(ai): init.js bootstraps launcher + settings + chat panel events"
```

---

### Task 13: ai-ui-integration.test.js — DOM end-to-end tests

**Goal:** Headless test that loads a page in Puppeteer, exercises settings flow, agent creation, popover, chat panel opening.

**Files:**
- Create: `tests/test-suites/ai-ui-integration.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create integration test**

NOTE: This test file relies on Puppeteer loading a full HTML page (validator.html), unlike the other unit tests which run inside test-runner.html. The existing test-runner pattern may or may not support this. If it doesn't, write a separate smoke test runner in `tests/ai-ui-smoke.js` invoked manually, and document this as a manual Phase 7 verification step rather than auto-test.

For a truly framework-compatible integration test, write tests that exercise modules directly (without full page load):

`tests/test-suites/ai-ui-integration.test.js`:
```js
describe('ai-ui integration (in-page, lightweight)', () => {
    let storage;

    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
    });

    it('launcher.init injects button + popover into body', async () => {
        // Clean any previous injection
        document.getElementById('chatLauncher')?.remove();
        document.getElementById('chatLauncherPopover')?.remove();

        const launcher = await import('../../assets/js/ai-ui/chat-launcher.js');
        await launcher.init();
        expect(!!document.getElementById('chatLauncher')).toBe(true);
        expect(!!document.getElementById('chatLauncherPopover')).toBe(true);
    });

    it('launcher popover shows "no agents" when empty', async () => {
        document.getElementById('chatLauncher')?.click();
        await new Promise(r => setTimeout(r, 100));
        const popover = document.getElementById('chatLauncherPopover');
        expect(popover.classList.contains('is-open')).toBe(true);
        const items = popover.querySelectorAll('.chat-launcher-popover__item');
        // First item is "no agents" text, second is "create first"
        expect(items.length >= 1).toBe(true);
    });

    it('saving an agent makes it appear in popover', async () => {
        await storage.saveAgent({ name: 'TestAgent', provider: 'google', isFavorite: true });
        document.getElementById('chatLauncher')?.click();
        await new Promise(r => setTimeout(r, 100));
        const items = document.querySelectorAll('.chat-launcher-popover__item');
        const names = Array.from(items).map(i => i.textContent.trim());
        expect(names.some(n => n.includes('TestAgent'))).toBe(true);
    });

    it('settings-modal.open injects modal into body', async () => {
        const modal = await import('../../assets/js/ai-ui/settings-modal.js');
        await modal.open();
        expect(!!document.getElementById('aiSettingsModal')).toBe(true);
        expect(document.getElementById('aiSettingsModal').classList.contains('active')).toBe(true);
    });

    it('chat-panel.openForAgent opens panel with agent name in header', async () => {
        const id = await storage.saveAgent({ name: 'ChatTest', provider: 'google', icon: '🦊' });
        const panel = await import('../../assets/js/ai-ui/chat-panel.js');
        await panel.openForAgent(id);
        expect(!!document.getElementById('aiChatPanel')).toBe(true);
        expect(document.getElementById('aiChatPanel').classList.contains('is-open')).toBe(true);
        expect(document.getElementById('chatHeaderTitle').textContent.includes('ChatTest')).toBe(true);
    });
});
```

In `tests/test-runner.html`, add:
```html
    <script src="test-suites/ai-ui-integration.test.js"></script>
```

NOTE: This integration suite assumes the test-runner page renders DOM and allows querying `document` inside tests. Verify the existing framework supports this (other tests in the codebase like `bug-report-frontend.test.js` already do — confirm by reading one of them).

- [ ] **Step 2: Run tests**

```bash
node tests/run-tests.js
```
Expected: ~516 tests pass (5 new). If any fail, the most likely cause is event timing — increase the `setTimeout` waits or wait for explicit selectors.

- [ ] **Step 3: Commit**

```bash
git add tests/test-suites/ai-ui-integration.test.js tests/test-runner.html
git commit -m "test(ai): integration tests for launcher + modal + chat panel"
```

---

### Task 14: i18n test suite

**Goal:** Verify all 57 `ai.*` keys present in both `cs` and `en`.

**Files:**
- Create: `tests/test-suites/ai-i18n.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Write test**

`tests/test-suites/ai-i18n.test.js`:
```js
describe('AI i18n key coverage', () => {
    const REQUIRED_KEYS = [
        'ai.settings.tooltip','ai.settings.title','ai.settings.agentsHeading','ai.settings.addAgent','ai.settings.close','ai.settings.advancedSection',
        'ai.agent.editTitle','ai.agent.createTitle','ai.agent.nameLabel','ai.agent.iconLabel','ai.agent.providerLabel','ai.agent.endpointLabel','ai.agent.apiKeyLabel','ai.agent.modelLabel','ai.agent.modelLoadBtn','ai.agent.tempLabel','ai.agent.systemPromptLabel','ai.agent.systemPromptPlaceholder','ai.agent.favoriteToggle','ai.agent.cancel','ai.agent.save','ai.agent.nameRequired','ai.agent.urlInvalid','ai.agent.saved','ai.agent.deleted','ai.agent.deleteConfirm',
        'ai.launcher.tooltip','ai.launcher.popoverTitle','ai.launcher.noAgents','ai.launcher.createFirst','ai.launcher.manageAgents',
        'ai.chat.headerLabel','ai.chat.toggleThreadsBtn','ai.chat.closeBtn','ai.chat.inputPlaceholder','ai.chat.sendBtn','ai.chat.thinking','ai.chat.empty','ai.chat.toolsDisabled',
        'ai.thread.newConversation','ai.thread.threadsHeading','ai.thread.noThreads','ai.thread.deleteConfirm','ai.thread.untitledTitle',
        'ai.error.network','ai.error.invalidApiKey','ai.error.modelNotFound','ai.error.rateLimit','ai.error.providerDown','ai.error.cors','ai.error.mixedContent','ai.error.unknown',
        'ai.endpoint.connecting','ai.endpoint.ok','ai.endpoint.fail','ai.endpoint.loadModelsBtn','ai.endpoint.loadModelsFailed'
    ];

    it('all required ai.* keys are present in CZ', () => {
        // The translations object structure varies; access via the existing t() function or window.translations.
        const cs = window.translations?.cs || window.translations?.cz;
        for (const key of REQUIRED_KEYS) {
            expect(typeof cs[key]).toBe('string');
            expect(cs[key].length > 0).toBe(true);
        }
    });

    it('all required ai.* keys are present in EN', () => {
        const en = window.translations?.en;
        for (const key of REQUIRED_KEYS) {
            expect(typeof en[key]).toBe('string');
            expect(en[key].length > 0).toBe(true);
        }
    });

    it('total key count is at least 57', () => {
        const cs = window.translations?.cs || window.translations?.cz;
        const aiKeys = Object.keys(cs).filter(k => k.startsWith('ai.'));
        expect(aiKeys.length >= 57).toBe(true);
    });
});
```

In `tests/test-runner.html`, add:
```html
    <script src="test-suites/ai-i18n.test.js"></script>
```

(Note: this test reads `window.translations` directly, so it doesn't need to be a module.)

- [ ] **Step 2: Run + commit**

```bash
node tests/run-tests.js
git add tests/test-suites/ai-i18n.test.js tests/test-runner.html
git commit -m "test(ai): i18n key coverage for ai.* keys"
```

Expected: ~519 tests pass.

---

### Task 15: PWA cache + sw.js bump + PLAN/CHANGELOG

**Goal:** Final wiring so new files ship with PWA, existing installs pick up update, project docs reflect Phase 7.

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add new files to ASSETS_TO_CACHE + bump version**

In `sw.js`, find `ASSETS_TO_CACHE`. Add after `'./assets/js/common/validation-presets.js'`:

```js
    './assets/js/ai/providers.js',
    './assets/js/ai/ai-client.js',
    './assets/js/ai/agent-manager.js',
    './assets/js/ai/tool-defs.js',
    './assets/js/ai/tool-executor.js',
    './assets/js/ai/chat-storage.js',
    './assets/js/ai-ui/init.js',
    './assets/js/ai-ui/chat-launcher.js',
    './assets/js/ai-ui/settings-modal.js',
    './assets/js/ai-ui/chat-panel.js',
    './assets/js/ai-ui/chat-i18n-helpers.js',
    './assets/css/ai-chat.css',
```

Change `CACHE_VERSION` from `'bim-checker-v14'` (or current value) to `'bim-checker-v15'`.

- [ ] **Step 2: Update PLAN.md**

In `PLAN.md`, after the Phase 6 / CLS hotfix block, before the `---` divider, add:

```markdown
### AI chat infrastructure (Phase 7, 2026-05-09)
- [x] `ValidationPresets`-style storage modul (`chat-storage.js`) — agents, threads, messages, settings v IndexedDB
- [x] 5 OpenAI-compatible provideři: Ollama (lokální), Google AI, OpenAI, OpenRouter, Custom
- [x] Streaming chat completion přes Server-Sent Events
- [x] Right-side chat panel s threads sidebarem + bottom-right kruhový launcher s popoverem oblíbených agentů
- [x] Settings modal s agent CRUD (provider, model, system prompt, temperature)
- [x] CZ + EN i18n (57 nových klíčů)
- [x] Mimo scope: tools / function calling (Phase 8+), 3D viewer integrace (Phase 9+)
- [x] +38 unit + 5 integračních testů
```

- [ ] **Step 3: Update CHANGELOG.md**

In `CHANGELOG.md`, insert above the most recent entry:

```markdown
## [0.3.0] — 2026-05-09

### Added
- AI chat infrastructure — settings UI for managing AI agents, bottom-right launcher with popover, right-side chat panel with persisted threads. 5 OpenAI-compatible providers (Ollama, Google AI, OpenAI, OpenRouter, Custom). Streaming responses via SSE.
- IndexedDB schema extension for AI: `ai_agents`, `ai_settings`, `ai_threads`, `ai_messages_<threadId>` keys in existing `bim_checker_storage` DB.
- 57 new CZ + EN i18n keys under `ai.*` namespace.

### Changed
- Three pages (validator, parser, viewer) gain a navbar settings ⚙️ icon and a bottom-right 🤖 launcher button. Settings modal and chat panel are lazy-injected on first open.

### Internal
- New `assets/js/ai/` (logic) and `assets/js/ai-ui/` (UI) module trees.
- 43 new tests (38 unit + 5 integration). Total suite ~520.
- Tools (function calling) intentionally out of scope — framework wired with empty `tool-defs` and stub `tool-executor` so Phase 8+ can add BIM_checker-specific tools incrementally.
```

(Adjust test count in CHANGELOG to match actual `node tests/run-tests.js` output.)

- [ ] **Step 4: Mirror sw.js + final test + commit**

```bash
cp sw.js dist/sw.js
node tests/run-tests.js
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(ai): cache bump v14->v15 + PLAN/CHANGELOG entries"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin phase-7-ai-chat
```

This is the last task — Phase 7 complete. Merge to master with `--no-ff` follows the same convention as previous phases; that step is owned by the human reviewing the branch.

---

## Notes for the implementer

- ES modules with `type="module"` script tags are required for the AI-UI modules. The test-runner needs them too. If the existing test framework strictly assumes IIFE-style scripts, the bootstrap test (Task 1, Step 7) will surface the issue — fix early.
- Lazy injection pattern (modal + panel injected on first use) matches `bug-report.js` precedent. Keep modules small and side-effect-free at import time except for `init.js`.
- Custom event bus (`ai:openSettings`, `ai:openChat`, `ai:agentsChanged`) keeps modules loosely coupled. Avoid direct cross-module imports between UI modules.
- Streaming uses `onStream` callback in `chatCompletion`. The chat panel's send flow shows the "thinking" placeholder which is gradually filled in. If a provider doesn't support streaming, omit `onStream` from options and the call falls back to non-streaming JSON response.
- IDs are generated as `${Date.now()}-${random6chars}` matching Phase 6 presets.
- Cascading delete (agent → threads → messages) is implemented in `deleteAgent`. Tested in Task 3.
- API keys live in IndexedDB plain-text. Single-user PWA assumption; documented in spec §6.5.
