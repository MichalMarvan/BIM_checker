# Phase 10: Chat-heads UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nahradit "thin header strip" minimalize style messengerovým chat-head stackem nad launcher tlačítkem (max 5 viditelných + "+N" overflow), single-chat-active rule, hover slide-out label, ripple unread state, persistence napříč navigací.

**Architecture:** Nový modul `assets/js/ai-ui/chat-heads.js` drží state (mirror `settings.activeChatHeads`) a renderuje stack do `<div id="chatHeadsStack">` umístěného v body. `chat-panel.js` při `openForAgent`/minimize/close volá API z chat-heads. CSS animace přes `cubic-bezier` spring pro hover slide a `@keyframes` pro ripple.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB (přes existující `chat-storage.js`), CSS keyframes + cubic-bezier transitions, Puppeteer test runner.

**Branch:** `phase-10-chat-heads-ui` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-10-chat-heads-ui-design.md`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/chat-storage.js` | Modify | Add `activeChatHeads: []` do `_defaultSettings()`. (Žádné new helpers — používáme `updateSettings`.) |
| `assets/js/ai-ui/chat-heads.js` | **Create** | State mgmt + DOM render. API: `init`, `addHead`, `removeHead`, `markUnread`, `clearUnread`, `getOpenHead`, `setOpenHead`, `_resetForTest` |
| `assets/js/ai-ui/chat-launcher.js` | Modify | V `init()` injectne `<div id="chatHeadsStack">` do body (vedle launcher) a po init zavolá `chatHeads.init()` |
| `assets/js/ai-ui/chat-panel.js` | Modify | V `openForAgent` po vzniku threadu volá `chatHeads.addHead`+`setOpenHead`. V `_toggleMinimize` při minimalizaci volá `chatHeads.setOpenHead(null)`. V `close()` volá `chatHeads.removeHead(threadId)`. Po dokončení streamu pokud `is-minimized` → `chatHeads.markUnread`. |
| `assets/js/ai-ui/init.js` | Modify | Auto-restore už vyřešený v Phase 9a — bez změn (chat-heads se inicializují přes launcher.init) |
| `assets/css/ai-chat.css` | Modify | New rules `.chat-heads-stack`, `.chat-head`, `.chat-head__circle`, `.chat-head__label`, `.chat-head--unread`, `.chat-heads-overflow`, `.chat-heads-overflow-popover`, keyframes `chatHeadRipple`. Odstranit / přepsat `.chat-panel.is-minimized` (už nemá smysl, panel se schová úplně místo header-strip; toggling minimize = setOpenHead(null)) |
| `dist/...` | Mirror | Každý modifikovaný file přes `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v30 → v31; přidat `chat-heads.js` do `ASSETS_TO_CACHE` |
| `tests/test-suites/chat-heads.test.js` | **Create** | ~10 unit testů |
| `tests/test-runner.html` | Modify | Add new test suite tag |
| `PLAN.md` | Modify | Append Phase 10 section |
| `CHANGELOG.md` | Modify | `[0.8.0]` entry at top |

---

## Cross-cutting conventions

- ES6 modules, dist mirror via `cp` po každém edit
- Test framework lacks `.not` chaining
- Czech messages na uživatel-viditelné stringy (zde žádné — tooltips pojí jen z agent.name)
- Žádné new translations potřeba — UI je čistě vizuální
- `helpers._setCurrentPageForTest` / `_resetForTest` patterns konzistentní s předchozími fázemi

### Existing chat-storage shape recap
`_defaultSettings()` aktuálně:
```js
{ lastActiveAgentId, lastOpenedThreadId, chatPanelOpen, threadsSidebarOpen }
```
(`lastOpenedThreadId` je legacy unused; chat-panel používá `lastActiveThreadId`. Phase 10 nečistí; jen přidává.)

Po Phase 10 přidá:
```js
activeChatHeads: []  // Array<{ agentId, threadId, hasUnread: boolean }>
```

Stack convention: index 0 = top (nejnovější aktivní), index N-1 = bottom (nejstarší). 1 head per agentId (deduplikace).

### Existing chat-panel hooks recap
- `openForAgent(agentId)` (line ~17): `_state.agentId = agentId; window.__bimAiActiveAgentId = agentId; _state.threadId = null; await _refresh*; _panel.classList.add('is-open'); updateSettings({chatPanelOpen:true, lastActiveAgentId, lastActiveThreadId:null})`
- `close()` (line ~50): aborts, hides panel, `updateSettings({chatPanelOpen:false})`
- `_toggleMinimize()` (line ~67): toggles `.is-minimized` class on panel
- `_send()` po vzniku threadu volá `updateSettings({lastActiveThreadId})` (line 233)

Phase 10 vloží `chatHeads.*` calls na konkrétní místa (viz Tasks 4 a 5).

---

## Task 1: Settings shape + chat-heads.js module skeleton (state mgmt only, no DOM)

**Files:**
- Modify: `assets/js/ai/chat-storage.js` — add `activeChatHeads: []` do `_defaultSettings()`
- Create: `assets/js/ai-ui/chat-heads.js` — state mgmt API (no DOM yet)
- Create: `tests/test-suites/chat-heads.test.js` — 6 state tests
- Modify: `tests/test-runner.html` — add script tag

- [ ] **Step 1: Update _defaultSettings() in chat-storage.js**

Open `assets/js/ai/chat-storage.js`. Find:
```js
function _defaultSettings() {
    return {
        lastActiveAgentId: null,
        lastOpenedThreadId: null,
        chatPanelOpen: false,
        threadsSidebarOpen: true
    };
}
```
Replace with:
```js
function _defaultSettings() {
    return {
        lastActiveAgentId: null,
        lastOpenedThreadId: null,
        chatPanelOpen: false,
        threadsSidebarOpen: true,
        activeChatHeads: []
    };
}
```

- [ ] **Step 2: Create chat-heads.js with state-only API**

Create `assets/js/ai-ui/chat-heads.js`:
```js
/**
 * Chat-heads stack manager — single source of truth for active threads
 * shown as circular avatars above the launcher.
 */

import * as storage from '../ai/chat-storage.js';

const MAX_VISIBLE = 5;

const _state = {
    heads: [],          // [{agentId, threadId, hasUnread}, ...] index 0 = top
    openAgentId: null,  // which head is currently the open chat panel
    inited: false
};

let _container = null;

export async function init() {
    const settings = await storage.getSettings();
    _state.heads = Array.isArray(settings.activeChatHeads) ? [...settings.activeChatHeads] : [];
    _state.openAgentId = settings.chatPanelOpen ? settings.lastActiveAgentId : null;
    _state.inited = true;
    await _validateAgainstStorage();
    _render();
}

async function _validateAgainstStorage() {
    // Drop heads whose agent no longer exists
    const valid = [];
    for (const h of _state.heads) {
        try {
            const agent = await storage.getAgent(h.agentId);
            if (agent) valid.push(h);
        } catch (e) { /* drop */ }
    }
    if (valid.length !== _state.heads.length) {
        _state.heads = valid;
        await _persist();
    }
}

async function _persist() {
    await storage.updateSettings({ activeChatHeads: [..._state.heads] });
}

export function setContainer(el) { _container = el; }

export async function addHead({ agentId, threadId }) {
    if (!agentId) return;
    const idx = _state.heads.findIndex(h => h.agentId === agentId);
    if (idx >= 0) {
        _state.heads.splice(idx, 1);
    }
    _state.heads.unshift({ agentId, threadId: threadId || null, hasUnread: false });
    await _persist();
    _render();
}

export async function removeHead(threadIdOrAgent) {
    const before = _state.heads.length;
    _state.heads = _state.heads.filter(h =>
        h.threadId !== threadIdOrAgent && h.agentId !== threadIdOrAgent
    );
    if (_state.heads.length !== before) {
        await _persist();
        _render();
    }
}

export async function markUnread(agentId) {
    const h = _state.heads.find(h => h.agentId === agentId);
    if (!h || h.hasUnread) return;
    h.hasUnread = true;
    await _persist();
    _render();
}

export async function clearUnread(agentId) {
    const h = _state.heads.find(h => h.agentId === agentId);
    if (!h || !h.hasUnread) return;
    h.hasUnread = false;
    await _persist();
    _render();
}

export function setOpenHead(agentId) {
    _state.openAgentId = agentId;
    _render();
}

export function getOpenHead() {
    if (!_state.openAgentId) return null;
    const h = _state.heads.find(h => h.agentId === _state.openAgentId);
    return h ? { agentId: h.agentId, threadId: h.threadId } : null;
}

export function getStateSnapshotForTest() {
    return JSON.parse(JSON.stringify(_state));
}

export function _resetForTest() {
    _state.heads = [];
    _state.openAgentId = null;
    _state.inited = false;
    _container = null;
}

// DOM rendering — implemented in Task 2 (placeholder no-op now)
function _render() { /* implemented in Task 2 */ }
```

- [ ] **Step 3: Create tests/test-suites/chat-heads.test.js**

```js
describe('chat-heads (state)', () => {
    let chatHeads;
    let storage;
    let savedSettings;

    beforeEach(async () => {
        chatHeads = await import('../../assets/js/ai-ui/chat-heads.js');
        storage = await import('../../assets/js/ai/chat-storage.js');
        chatHeads._resetForTest();
        savedSettings = await storage.getSettings();
        await storage.updateSettings({ activeChatHeads: [] });
    });

    afterEach(async () => {
        await storage.updateSettings(savedSettings);
        chatHeads._resetForTest();
    });

    it('addHead persists head to settings', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId, threadId: 't1' });
            const s = await storage.getSettings();
            expect(s.activeChatHeads.length).toBe(1);
            expect(s.activeChatHeads[0].agentId).toBe(agentId);
            expect(s.activeChatHeads[0].threadId).toBe('t1');
            expect(s.activeChatHeads[0].hasUnread).toBe(false);
        } finally {
            await storage.deleteAgent(agentId);
        }
    });

    it('addHead with same agent dedupes and moves to top', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        const b = await storage.saveAgent({ name: 'B', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.addHead({ agentId: b, threadId: 't2' });
            await chatHeads.addHead({ agentId: a, threadId: 't3' });  // re-add a
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(2);
            expect(snap.heads[0].agentId).toBe(a);
            expect(snap.heads[0].threadId).toBe('t3');
            expect(snap.heads[1].agentId).toBe(b);
        } finally {
            await storage.deleteAgent(a);
            await storage.deleteAgent(b);
        }
    });

    it('removeHead by threadId removes the matching entry', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.removeHead('t1');
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(0);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('markUnread / clearUnread toggle flag', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.markUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(true);
            await chatHeads.clearUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(false);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('init() hydrates from storage and drops orphaned agentIds', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        await storage.updateSettings({ activeChatHeads: [
            { agentId: a, threadId: 't1', hasUnread: false },
            { agentId: 'agent_ghost', threadId: 't2', hasUnread: false }
        ]});
        try {
            await chatHeads.init();
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(1);
            expect(snap.heads[0].agentId).toBe(a);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('setOpenHead / getOpenHead reflect open state', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            chatHeads.setOpenHead(a);
            const open = chatHeads.getOpenHead();
            expect(open.agentId).toBe(a);
            expect(open.threadId).toBe('t1');
            chatHeads.setOpenHead(null);
            expect(chatHeads.getOpenHead()).toBe(null);
        } finally {
            await storage.deleteAgent(a);
        }
    });
});
```

- [ ] **Step 4: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/tools-bsdd.test.js"></script>`, add:
```html
    <script src="test-suites/chat-heads.test.js"></script>
```

- [ ] **Step 5: Mirror + run tests**

```bash
cd /home/michal/work/BIM_checker
cp assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js
mkdir -p dist/assets/js/ai-ui
cp assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 678/678 (672 baseline + 6 new).

- [ ] **Step 6: Commit**
```bash
git checkout -b phase-10-chat-heads-ui
git add assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js \
        assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js \
        tests/test-suites/chat-heads.test.js tests/test-runner.html
git commit -m "feat(chat-heads-10): state module + activeChatHeads in settings"
```

---

## Task 2: DOM rendering + container injection

**Files:**
- Modify: `assets/js/ai-ui/chat-heads.js` — implement `_render()`
- Modify: `assets/js/ai-ui/chat-launcher.js` — inject `<div id="chatHeadsStack">` and call `chatHeads.init()` after launcher init

- [ ] **Step 1: Implement _render() in chat-heads.js**

Open `assets/js/ai-ui/chat-heads.js`. Replace the placeholder `function _render() { /* ... */ }` at the bottom with:
```js
function _render() {
    if (!_container) return;
    _container.innerHTML = '';
    const visible = _state.heads.slice(0, MAX_VISIBLE);
    const overflow = _state.heads.slice(MAX_VISIBLE);
    for (const head of visible) {
        const btn = document.createElement('button');
        btn.className = 'chat-head';
        if (head.hasUnread) btn.classList.add('chat-head--unread');
        if (head.agentId === _state.openAgentId) btn.classList.add('chat-head--open');
        btn.dataset.agentId = head.agentId;
        btn.dataset.threadId = head.threadId || '';
        btn.innerHTML = `
            <span class="chat-head__circle">${_iconFor(head.agentId)}</span>
            <span class="chat-head__label">${_escapeHtml(_labelFor(head.agentId))}</span>`;
        btn.addEventListener('click', () => _onHeadClick(head.agentId));
        _container.appendChild(btn);
    }
    if (overflow.length > 0) {
        const pill = document.createElement('button');
        pill.className = 'chat-heads-overflow';
        pill.dataset.count = String(overflow.length);
        pill.textContent = `+${overflow.length}`;
        pill.addEventListener('click', () => _onOverflowClick(overflow));
        _container.appendChild(pill);
    }
}

function _iconFor(agentId) {
    const cached = _agentCache.get(agentId);
    return cached?.icon || '🤖';
}

function _labelFor(agentId) {
    const cached = _agentCache.get(agentId);
    if (!cached) return '…';
    const name = String(cached.name || '').trim();
    return name.length > 16 ? name.slice(0, 15) + '…' : name;
}

function _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

const _agentCache = new Map();

async function _refreshAgentCache() {
    _agentCache.clear();
    for (const h of _state.heads) {
        try {
            const a = await storage.getAgent(h.agentId);
            if (a) _agentCache.set(h.agentId, { name: a.name, icon: a.icon || '🤖' });
        } catch (e) { /* skip */ }
    }
}

function _onHeadClick(agentId) {
    window.dispatchEvent(new CustomEvent('chatHeads:openHead', { detail: { agentId } }));
}

function _onOverflowClick(overflow) {
    window.dispatchEvent(new CustomEvent('chatHeads:overflowOpen', { detail: { heads: overflow } }));
}
```

Update `addHead`/`init` to call `_refreshAgentCache` before `_render`:
```js
// In init(), AFTER _validateAgainstStorage(), BEFORE _render():
    await _refreshAgentCache();

// In addHead(), AFTER _persist(), BEFORE _render():
    await _refreshAgentCache();
```

- [ ] **Step 2: Inject container + init in chat-launcher.js**

Open `assets/js/ai-ui/chat-launcher.js`. Find the `init()` function (line 16). At the END of init body (after the launcher button is appended to body), add:
```js
    // Phase 10: chat-heads stack mounted as sibling of launcher
    let stack = document.getElementById('chatHeadsStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'chatHeadsStack';
        stack.className = 'chat-heads-stack';
        document.body.appendChild(stack);
    }
    const chatHeads = await import('./chat-heads.js');
    chatHeads.setContainer(stack);
    await chatHeads.init();
```

- [ ] **Step 3: Add render integration test**

In `tests/test-suites/chat-heads.test.js`, after the existing tests, append:
```js
    it('_render produces .chat-head buttons in container', async () => {
        const a = await storage.saveAgent({ name: 'AA', provider: 'openai', model: 'm', apiKey: 'k' });
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            const btns = container.querySelectorAll('.chat-head');
            expect(btns.length).toBe(1);
            expect(btns[0].dataset.agentId).toBe(a);
        } finally {
            container.remove();
            await storage.deleteAgent(a);
        }
    });

    it('_render shows +N overflow when more than 5 heads', async () => {
        const ids = [];
        for (let i = 0; i < 7; i++) {
            ids.push(await storage.saveAgent({ name: `A${i}`, provider: 'openai', model: 'm', apiKey: 'k' }));
        }
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            for (let i = 0; i < ids.length; i++) {
                await chatHeads.addHead({ agentId: ids[i], threadId: `t${i}` });
            }
            const visible = container.querySelectorAll('.chat-head');
            const pill = container.querySelector('.chat-heads-overflow');
            expect(visible.length).toBe(5);
            expect(!!pill).toBe(true);
            expect(pill.textContent).toBe('+2');
        } finally {
            container.remove();
            for (const id of ids) await storage.deleteAgent(id).catch(() => {});
        }
    });
```

- [ ] **Step 4: Mirror + run tests**
```bash
cp assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js
cp assets/js/ai-ui/chat-launcher.js dist/assets/js/ai-ui/chat-launcher.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 680/680 (678 + 2).

- [ ] **Step 5: Commit**
```bash
git add assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js \
        assets/js/ai-ui/chat-launcher.js dist/assets/js/ai-ui/chat-launcher.js \
        tests/test-suites/chat-heads.test.js
git commit -m "feat(chat-heads-10): DOM rendering + container injection"
```

---

## Task 3: CSS styling (stack layout, hover slide-out, ripple)

**Files:**
- Modify: `assets/css/ai-chat.css`

- [ ] **Step 1: Append chat-heads CSS rules**

Open `assets/css/ai-chat.css`. At the end of the file, append:
```css
/* === Phase 10: Chat-heads stack === */

.chat-heads-stack {
    position: fixed;
    right: 24px;
    bottom: 96px;            /* sits above the 56px launcher with 16px gap */
    display: flex;
    flex-direction: column-reverse;  /* index 0 = top of stack visually */
    align-items: flex-end;
    gap: 10px;
    z-index: 9001;           /* one above launcher (9000) */
    pointer-events: none;    /* container is transparent — children opt in */
}

.chat-head {
    position: relative;
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    pointer-events: auto;    /* re-enable for buttons */
}

.chat-head__circle {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-gradient, linear-gradient(135deg, #667eea, #5568d3));
    color: white;
    font-size: 20px;
    border: 2px solid var(--bg-primary, #fff);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transition: transform 0.18s ease;
}

.chat-head__label {
    position: absolute;
    top: 50%;
    right: 100%;
    margin-right: 8px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #1f2937);
    padding: 6px 14px;
    border-radius: 22px;
    font-size: 0.88em;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    white-space: nowrap;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-50%) translateX(28px);
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease;
}

.chat-head:hover .chat-head__label,
.chat-head:focus-visible .chat-head__label {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
}

.chat-head:hover .chat-head__circle,
.chat-head:focus-visible .chat-head__circle {
    transform: scale(1.05);
}

.chat-head--open .chat-head__circle {
    box-shadow: 0 0 0 2px var(--primary-color, #667eea), 0 2px 8px rgba(0,0,0,0.15);
}

/* Unread state — radar ripple */
.chat-head--unread::before,
.chat-head--unread::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(59, 130, 246, 0.7);
    z-index: 1;
    pointer-events: none;
    animation: chatHeadRipple 1.6s ease-out infinite;
}
.chat-head--unread::after {
    animation-delay: 0.8s;
}
@keyframes chatHeadRipple {
    0%   { transform: scale(1);   opacity: 0.9; }
    100% { transform: scale(1.6); opacity: 0; }
}

/* Pause animations when tab is hidden — battery friendly */
@media (prefers-reduced-motion: reduce) {
    .chat-head--unread::before,
    .chat-head--unread::after {
        animation: none;
    }
    .chat-head__label {
        transition: opacity 0.1s linear;
    }
}

/* Overflow +N pill */
.chat-heads-overflow {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 0.85em;
    font-weight: 700;
    border: 2px solid var(--bg-primary, #fff);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
}
.chat-heads-overflow:hover { background: rgba(0, 0, 0, 0.75); }

/* Overflow popover */
.chat-heads-overflow-popover {
    position: fixed;
    right: 80px;
    bottom: 96px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-primary, #e5e7eb);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    padding: 8px;
    min-width: 220px;
    max-width: 320px;
    z-index: 9100;
    display: none;
}
.chat-heads-overflow-popover.is-open { display: block; }
.chat-heads-overflow-popover__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-primary, #1f2937);
    transition: background 0.1s ease;
}
.chat-heads-overflow-popover__item:hover { background: var(--bg-secondary, #f3f4f6); }

/* Hide chat-heads stack while panel is open AND not minimized.
   Stack remains visible when panel is fully closed OR when it's collapsed
   to a head (this handles single-chat-active edge cases). */
.chat-panel.is-open:not(.is-minimized) ~ .chat-heads-stack {
    /* leave stack visible — it's about parallel agents, not about active panel */
}

/* Old "minimized header strip" rules: keep .is-minimized but make it non-visible
   (we now collapse to head, not header strip). */
.chat-panel.is-minimized {
    display: none !important;
}
```

- [ ] **Step 2: Mirror + visual smoke test**
```bash
cp assets/css/ai-chat.css dist/assets/css/ai-chat.css
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 680/680 (no new tests; CSS-only change).

- [ ] **Step 3: Commit**
```bash
git add assets/css/ai-chat.css dist/assets/css/ai-chat.css
git commit -m "feat(chat-heads-10): CSS — stack, hover slide-out, ripple, overflow pill"
```

---

## Task 4: chat-panel hooks — addHead, setOpenHead, removeHead, listen for chatHeads:openHead event

**Files:**
- Modify: `assets/js/ai-ui/chat-panel.js`
- Modify: `tests/test-suites/chat-heads.test.js` — add 1 integration test

- [ ] **Step 1: Import chat-heads in chat-panel.js**

Open `assets/js/ai-ui/chat-panel.js`. After existing imports, add:
```js
import * as chatHeads from './chat-heads.js';
```

- [ ] **Step 2: Wire openForAgent → addHead + setOpenHead**

Find `openForAgent(agentId)` function. Replace its body with:
```js
export async function openForAgent(agentId) {
    if (!_panel) _injectPanel();
    _state.agentId = agentId;
    window.__bimAiActiveAgentId = agentId;
    _state.threadId = null;
    await _refreshHeader();
    await _refreshThreadsSidebar();
    await _refreshMessages();
    _panel.classList.add('is-open');
    _panel.classList.remove('is-minimized');
    _hideLauncher(true);
    chatHeads.setOpenHead(agentId);
    await chatHeads.clearUnread(agentId);
    await storage.updateSettings({ chatPanelOpen: true, lastActiveAgentId: agentId, lastActiveThreadId: null });
}
```

- [ ] **Step 3: Wire close() → removeHead + setOpenHead(null)**

Find `close()` function. Replace its body with:
```js
export function close() {
    const removingAgentId = _state.agentId;
    if (_panel) {
        _panel.classList.remove('is-open');
        _panel.classList.remove('is-minimized');
    }
    _hideLauncher(false);
    if (_state.abort) _state.abort.abort();
    window.__bimAiActiveAgentId = null;
    chatHeads.setOpenHead(null);
    if (removingAgentId) chatHeads.removeHead(removingAgentId);
    storage.updateSettings({ chatPanelOpen: false });
}
```

- [ ] **Step 4: Wire _toggleMinimize() → setOpenHead(null) when minimizing**

Find `_toggleMinimize()` function (around line 67):
```js
function _toggleMinimize() {
    if (!_panel) return;
    _panel.classList.toggle('is-minimized');
}
```
Replace with:
```js
function _toggleMinimize() {
    if (!_panel) return;
    const wasMinimized = _panel.classList.contains('is-minimized');
    _panel.classList.toggle('is-minimized');
    if (!wasMinimized) {
        // We are minimizing: hide panel, show head in stack
        _panel.classList.remove('is-open');
        _hideLauncher(false);
        chatHeads.setOpenHead(null);
        storage.updateSettings({ chatPanelOpen: false });
    }
}
```
Why: design choice (spec) — minimize collapses to head; head stays in stack but is no longer "open".

- [ ] **Step 5: Wire _send() — call addHead after thread creation**

Find the block in `_send()` that creates the thread (around line 230):
```js
    if (!_state.threadId) {
        _state.threadId = await storage.createThread(_state.agentId, text);
        await _refreshThreadsSidebar();
        await storage.updateSettings({ lastActiveThreadId: _state.threadId });
    } else {
```
Add a call to `chatHeads.addHead` AFTER `updateSettings`:
```js
    if (!_state.threadId) {
        _state.threadId = await storage.createThread(_state.agentId, text);
        await _refreshThreadsSidebar();
        await storage.updateSettings({ lastActiveThreadId: _state.threadId });
        await chatHeads.addHead({ agentId: _state.agentId, threadId: _state.threadId });
        chatHeads.setOpenHead(_state.agentId);
    } else {
```

Also: for threads that already existed (continuing conversation), call `addHead` in `openForAgent` AFTER the thread loads via thread-list click. Easier: when user clicks an existing thread in the sidebar, the listener at line ~155 sets `_state.threadId`. Add `chatHeads.addHead` there too.

Find the thread sidebar item click handler:
```js
        item.addEventListener('click', () => {
            _state.threadId = thread.id;
            _refreshMessages();
            _refreshThreadsSidebar();
            storage.updateSettings({ lastActiveThreadId: thread.id });
        });
```
Add:
```js
        item.addEventListener('click', () => {
            _state.threadId = thread.id;
            _refreshMessages();
            _refreshThreadsSidebar();
            storage.updateSettings({ lastActiveThreadId: thread.id });
            chatHeads.addHead({ agentId: _state.agentId, threadId: thread.id });
            chatHeads.setOpenHead(_state.agentId);
        });
```

- [ ] **Step 6: Listen for chatHeads:openHead event in chat-panel.js init or init.js**

Open `assets/js/ai-ui/init.js`. After the existing event listeners (around line 50), add:
```js
    // Phase 10: chat-heads → click on a head opens that agent's panel
    window.addEventListener('chatHeads:openHead', async (e) => {
        const m = await getChatPanel();
        await m.openForAgent(e.detail.agentId);
    });
```

- [ ] **Step 7: Add integration test**

In `tests/test-suites/chat-heads.test.js`, append:
```js
    it('chatHeads:openHead event is dispatched on _onHeadClick', async () => {
        const a = await storage.saveAgent({ name: 'EvtTest', provider: 'openai', model: 'm', apiKey: 'k' });
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        let captured = null;
        const listener = (ev) => { captured = ev.detail; };
        window.addEventListener('chatHeads:openHead', listener);
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            const btn = container.querySelector('.chat-head');
            btn.click();
            expect(captured).not.toBe(null);
            expect(captured.agentId).toBe(a);
        } finally {
            window.removeEventListener('chatHeads:openHead', listener);
            container.remove();
            await storage.deleteAgent(a);
        }
    });
```

Note: this uses `not.toBe` which the framework may not support. Substitute with:
```js
            expect(captured !== null).toBe(true);
```

- [ ] **Step 8: Mirror + run tests**
```bash
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
cp assets/js/ai-ui/init.js dist/assets/js/ai-ui/init.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 681/681 (680 + 1).

- [ ] **Step 9: Commit**
```bash
git add assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js \
        assets/js/ai-ui/init.js dist/assets/js/ai-ui/init.js \
        tests/test-suites/chat-heads.test.js
git commit -m "feat(chat-heads-10): chat-panel hooks (open/close/minimize) + event wiring"
```

---

## Task 5: Unread state — markUnread when stream completes while minimized

**Files:**
- Modify: `assets/js/ai-ui/chat-panel.js`
- Modify: `tests/test-suites/chat-heads.test.js`

- [ ] **Step 1: Trigger markUnread on stream completion if minimized**

Open `assets/js/ai-ui/chat-panel.js`. Find the `_send()` function — specifically the loop where `result = await chatCompletion(...)` runs. After `await storage.appendMessage(_state.threadId, assistantMsg);` (around line 260), the message is rendered. We need to detect "panel was minimized when this completed" and call `markUnread`.

Find the line `if (finishReason !== 'tool_calls') {` (around line 270). Inside that block (the early return when stream is complete), BEFORE the `break;` statement, add:
```js
                if (_panel && (!_panel.classList.contains('is-open') || _panel.classList.contains('is-minimized'))) {
                    chatHeads.markUnread(_state.agentId);
                }
```

So the block becomes:
```js
            if (finishReason !== 'tool_calls') {
                if (!streamed && assistantMsg.content) {
                    thinkingDiv.classList.remove('chat-panel__msg--thinking');
                    thinkingDiv.classList.add('chat-panel__msg--assistant');
                    thinkingDiv.textContent = assistantMsg.content;
                }
                if (_panel && (!_panel.classList.contains('is-open') || _panel.classList.contains('is-minimized'))) {
                    chatHeads.markUnread(_state.agentId);
                }
                break;
            }
```

- [ ] **Step 2: Add 2 tests for the unread flow**

In `tests/test-suites/chat-heads.test.js`, append:
```js
    it('markUnread sets ripple class on the head element', async () => {
        const a = await storage.saveAgent({ name: 'UnreadVis', provider: 'openai', model: 'm', apiKey: 'k' });
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.markUnread(a);
            const btn = container.querySelector('.chat-head');
            expect(btn.classList.contains('chat-head--unread')).toBe(true);
            await chatHeads.clearUnread(a);
            const btnAfter = container.querySelector('.chat-head');
            expect(btnAfter.classList.contains('chat-head--unread')).toBe(false);
        } finally {
            container.remove();
            await storage.deleteAgent(a);
        }
    });

    it('openForAgent (or click) clears unread on that head', async () => {
        const a = await storage.saveAgent({ name: 'ClearTest', provider: 'openai', model: 'm', apiKey: 'k' });
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.markUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(true);
            // Simulate openForAgent flow's clearUnread
            await chatHeads.clearUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(false);
        } finally {
            container.remove();
            await storage.deleteAgent(a);
        }
    });
```

- [ ] **Step 3: Mirror + run tests**
```bash
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 683/683 (681 + 2).

- [ ] **Step 4: Commit**
```bash
git add assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js \
        tests/test-suites/chat-heads.test.js
git commit -m "feat(chat-heads-10): unread ripple state + clear on open"
```

---

## Task 6: Overflow popover — +N click shows full list

**Files:**
- Modify: `assets/js/ai-ui/chat-heads.js`
- Modify: `tests/test-suites/chat-heads.test.js`

- [ ] **Step 1: Implement overflow popover in chat-heads.js**

Open `assets/js/ai-ui/chat-heads.js`. Replace the existing `_onOverflowClick` function with:
```js
function _onOverflowClick(overflow) {
    let popover = document.getElementById('chatHeadsOverflowPopover');
    if (popover) { popover.remove(); return; }
    popover = document.createElement('div');
    popover.id = 'chatHeadsOverflowPopover';
    popover.className = 'chat-heads-overflow-popover is-open';
    for (const head of overflow) {
        const item = document.createElement('div');
        item.className = 'chat-heads-overflow-popover__item';
        item.dataset.agentId = head.agentId;
        const cached = _agentCache.get(head.agentId);
        item.innerHTML = `
            <span style="font-size:1.4em">${cached?.icon || '🤖'}</span>
            <span>${_escapeHtml(cached?.name || '…')}</span>`;
        item.addEventListener('click', () => {
            popover.remove();
            window.dispatchEvent(new CustomEvent('chatHeads:openHead', { detail: { agentId: head.agentId } }));
        });
        popover.appendChild(item);
    }
    document.body.appendChild(popover);
    // Close on outside click
    setTimeout(() => {
        const closeOnOutside = (e) => {
            if (!popover.contains(e.target) && !e.target.classList.contains('chat-heads-overflow')) {
                popover.remove();
                document.removeEventListener('click', closeOnOutside);
            }
        };
        document.addEventListener('click', closeOnOutside);
    }, 0);
}
```

- [ ] **Step 2: Add 1 test for overflow popover**

In `tests/test-suites/chat-heads.test.js`, append:
```js
    it('clicking overflow pill creates popover with hidden items', async () => {
        const ids = [];
        for (let i = 0; i < 7; i++) {
            ids.push(await storage.saveAgent({ name: `OF${i}`, provider: 'openai', model: 'm', apiKey: 'k' }));
        }
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            for (let i = 0; i < ids.length; i++) {
                await chatHeads.addHead({ agentId: ids[i], threadId: `t${i}` });
            }
            const pill = container.querySelector('.chat-heads-overflow');
            pill.click();
            const popover = document.getElementById('chatHeadsOverflowPopover');
            expect(!!popover).toBe(true);
            const items = popover.querySelectorAll('.chat-heads-overflow-popover__item');
            expect(items.length).toBe(2);
            popover.remove();
        } finally {
            container.remove();
            for (const id of ids) await storage.deleteAgent(id).catch(() => {});
        }
    });
```

- [ ] **Step 3: Mirror + run tests**
```bash
cp assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 684/684 (683 + 1).

- [ ] **Step 4: Commit**
```bash
git add assets/js/ai-ui/chat-heads.js dist/assets/js/ai-ui/chat-heads.js \
        tests/test-suites/chat-heads.test.js
git commit -m "feat(chat-heads-10): overflow +N popover with click-outside dismiss"
```

---

## Task 7: Wire-up — SW cache + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW cache + add chat-heads.js**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v30';` to `'bim-checker-v31'`.
- In `ASSETS_TO_CACHE`, find existing line `'./assets/js/ai-ui/chat-panel.js',`. AFTER it add:
```
    './assets/js/ai-ui/chat-heads.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 2: Append Phase 10 block to PLAN.md**

After the existing `## Phase 9c` section, append:
```markdown
## Phase 10: Chat-heads UI ✅
- [x] Stack circular avatars above launcher (max 5 + "+N" overflow)
- [x] Single-chat-active rule — opening a head minimizes the previously open one
- [x] Hover slide-out label (right→left, cubic-bezier spring)
- [x] Ripple unread state on stream completion while minimized
- [x] Persistence via `settings.activeChatHeads`; survives page navigation
- [x] +12 tests (672 → 684)

Branch: phase-10-chat-heads-ui
```

- [ ] **Step 3: Insert [0.8.0] block in CHANGELOG.md**

After header, before first existing version block:
```markdown
## [0.8.0] - 2026-05-10

### Added
- Chat-heads UI (Phase 10): minimized chats become circular avatars above the launcher
- `assets/js/ai-ui/chat-heads.js` module — state mgmt + DOM render
- Hover slide-out label (8px gap from circle, spring ease)
- Ripple animation on chat-head when AI response arrives during minimize
- Overflow +N pill + popover for >5 active threads
- `settings.activeChatHeads` for cross-page persistence

### Changed
- Minimize button (▼) on chat panel now collapses panel to chat-head (not header strip)
- Close button (✕) removes the chat-head from the stack (thread persists in storage)
- SW cache bumped v30 → v31
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 684/684.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-10): SW v30→v31 + PLAN/CHANGELOG"
git push -u origin phase-10-chat-heads-ui
```

Capture and report the GitHub PR URL printed by `git push`.

---

## Self-Review Notes

**Spec coverage:**
- Single-chat-active rule → Tasks 4 (open) + 4 (minimize) ✓
- 1 head per agent (dedupe) → Task 1 (`addHead` finds existing index, splices, unshifts) ✓
- Max 5 visible + "+N" → Task 2 (`MAX_VISIBLE = 5`) + Task 6 (popover) ✓
- Hover slide-out → Task 3 CSS ✓
- Label = agent.name truncated → Task 2 (`_labelFor` with 16-char limit) ✓
- Click → openForAgent → Task 4 (event wiring) ✓
- ✕ removes head → Task 4 (close hook) ✓
- ▼ collapses panel, head stays → Task 4 (toggle minimize hook) ✓
- Unread ripple → Tasks 3 (CSS) + 5 (chat-panel trigger) ✓
- Persistence → Task 1 (settings) + Task 2 (init reads) ✓
- Drop orphaned heads → Task 1 (`_validateAgainstStorage`) ✓

**Type consistency:**
- `_state.heads[i] = { agentId, threadId, hasUnread }` everywhere
- `chatHeads.addHead({ agentId, threadId })` shape consistent across chat-panel call sites
- `chatHeads.markUnread(agentId)` (NOT threadId) — single agent → single head, so agentId is the natural key. `removeHead` accepts either threadId or agentId for caller convenience.

**Test count progression:**
- Baseline: 672
- After T1: 678 (+6)
- After T2: 680 (+2)
- After T3: 680 (+0; CSS only)
- After T4: 681 (+1)
- After T5: 683 (+2)
- After T6: 684 (+1)
- After T7: 684 (+0)

**Risks:**
- `.chat-panel.is-minimized { display: none }` — existing minimize behavior fully replaced. If anyone has the panel minimized via the OLD method (header strip) on page load, it now disappears. New behavior: minimize → panel hides + head appears. Phase 9a auto-restore reads `chatPanelOpen` from settings; if `chatPanelOpen=false` on page load, the panel won't auto-open at all (which is correct — heads alone show parallel agents).
- `_validateAgainstStorage` may fail silently on Pi puppeteer due to IndexedDB timing. Mitigation: tests do their own setup/teardown via storage API; the validation runs on init() only.
- Popover doesn't follow scrolling — fixed positioning at `right: 80px; bottom: 96px`. Acceptable since overflow popover is rare.

**Final state:** 684 tests, chat-heads UI feature complete, no breaking changes to existing chat-panel API.
