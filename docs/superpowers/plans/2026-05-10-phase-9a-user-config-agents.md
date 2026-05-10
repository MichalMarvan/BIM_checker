# Phase 9a: User Config + Agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 AI tools for user-facing settings (theme, language, wizard, PWA, bug report) and agent self-management (list/create/update/delete with active-agent guard), plus the plumbing to identify the currently-active chat agent.

**Architecture:** Continues the Phase 8 pattern — one module per tool category (`tool-settings.js`, `tool-agents.js`), each exporting an async function and a `register(registerFn)` hook. `tool-executor.js` already auto-bootstraps registered modules. Tool definitions live in `tool-defs.js` with Czech descriptions. Active-agent identity is exposed via a single global `window.__bimAiActiveAgentId`, set/cleared by chat-panel.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB (via `chat-storage.js`), localStorage (theme/wizard state), native `confirm()` for destructive ops, custom Jasmine-like test framework with `.includes()` (no `.not` chaining), Puppeteer headless test runner via `node tests/run-tests.js`.

**Branch:** `phase-9a-user-config-agents` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-10-phase-9-comprehensive-ai-tools-design.md`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/tools/tool-settings.js` | **Create** | 8 tools: theme×2, language×2, wizard×2, PWA install, bug report |
| `assets/js/ai/tools/tool-agents.js` | **Create** | 5 tools: list_agents, get_active_agent, create_agent, update_agent, delete_agent |
| `assets/js/ai/tool-executor.js` | Modify | Add 2 imports + 2 `register()` calls in `_bootstrap()` |
| `assets/js/ai/tool-defs.js` | Modify | Add 13 OpenAI-format tool definitions in Czech (16 → 29) |
| `assets/js/ai-ui/chat-panel.js` | Modify | Set `window.__bimAiActiveAgentId` in `openForAgent`; clear in `close` |
| `assets/js/common/pwa.js` | Modify | Expose `window.PWA = { canInstall, prompt }` so tool can trigger install |
| `assets/js/common/translations.js` | Modify | Add CZ + EN i18n keys for tool-call bubbles' new states (no new keys for now — reuse Phase 8 keys) |
| `dist/...` | Mirror | Each modified file copied to `dist/` |
| `sw.js` + `dist/sw.js` | Modify | Bump CACHE_VERSION v23 → v24 + add 2 new tool files to ASSETS_TO_CACHE |
| `tests/test-suites/tools-settings.test.js` | **Create** | ~14 tests |
| `tests/test-suites/tools-agents.test.js` | **Create** | ~12 tests |
| `tests/test-suites/chat-panel-tool-loop.test.js` | Modify | Update count assertions: 16 → 29 |
| `tests/test-suites/ai-bootstrap.test.js` | Modify | Update count assertion: 16 → 29 |
| `tests/test-runner.html` | Modify | Add 2 new `<script>` tags |
| `PLAN.md` | Modify | Add Phase 9a section |
| `CHANGELOG.md` | Modify | Add `[0.5.0]` entry |

---

## Cross-cutting conventions (carried from Phase 8)

- All tool handlers are `async`, return plain objects, never throw (catch and return `{ error, message }`).
- Every module has `register(registerFn)` that calls `registerFn(name, fn)` once per tool.
- Tool-defs.js entries are pure data (function name, Czech description, parameters JSONSchema-lite).
- Destructive ops call `window.confirm(question_in_cs)`, return `{ cancelled: true }` on dismissal.
- Tests use `expect(arr.includes(x)).toBe(false)` — no `.not` chaining.
- After every code change, mirror to `dist/` via `cp <src> <dst>`.
- Final test count after Phase 9a: 587 + ~26 = **613** tests.

---

## Task 1: Active-agent plumbing + tool-settings.js (theme + language)

**Files:**
- Modify: `assets/js/ai-ui/chat-panel.js` — set/clear `window.__bimAiActiveAgentId`
- Create: `assets/js/ai/tools/tool-settings.js` — 4 tools (`get_theme`, `set_theme`, `get_language`, `set_language`) + `register()`
- Create: `tests/test-suites/tools-settings.test.js`
- Modify: `tests/test-runner.html` — add new test suite script tag
- Mirror: `dist/assets/js/ai-ui/chat-panel.js`, `dist/assets/js/ai/tools/tool-settings.js`

- [ ] **Step 1: Wire active-agent global in chat-panel.js**

In `assets/js/ai-ui/chat-panel.js`, locate the `openForAgent(agentId)` function. After `_state.agentId = agentId;`, add:
```js
    window.__bimAiActiveAgentId = agentId;
```

In `close()`, after `if (_state.abort) _state.abort.abort();`, add:
```js
    window.__bimAiActiveAgentId = null;
```

- [ ] **Step 2: Create tool-settings.js with theme + language tools**

Create `assets/js/ai/tools/tool-settings.js`:
```js
import * as helpers from './_helpers.js';

export async function get_theme() {
    if (typeof window.ThemeManager === 'undefined') {
        return { error: 'theme_manager_not_available' };
    }
    return { theme: window.ThemeManager.getTheme ? window.ThemeManager.getTheme() : (localStorage.getItem('theme') || 'light') };
}

export async function set_theme(args) {
    helpers.validateArgs(args, { theme: { required: true, enum: ['light', 'dark'] } });
    if (typeof window.ThemeManager === 'undefined') {
        return { error: 'theme_manager_not_available' };
    }
    window.ThemeManager.setTheme(args.theme);
    return { applied: args.theme };
}

export async function get_language() {
    if (typeof window.i18n === 'undefined') return { error: 'i18n_not_available' };
    return { lang: window.i18n.getCurrentLanguage ? window.i18n.getCurrentLanguage() : (localStorage.getItem('lang') || 'cs') };
}

export async function set_language(args) {
    helpers.validateArgs(args, { lang: { required: true, enum: ['cs', 'en'] } });
    if (typeof window.i18n === 'undefined') return { error: 'i18n_not_available' };
    window.i18n.setLanguage(args.lang);
    return { applied: args.lang };
}

export function register(registerFn) {
    registerFn('get_theme', get_theme);
    registerFn('set_theme', set_theme);
    registerFn('get_language', get_language);
    registerFn('set_language', set_language);
}
```

- [ ] **Step 3: Verify ThemeManager and i18n public APIs**

Run:
```bash
grep -nE "getTheme|setTheme|getCurrentLanguage|setLanguage" /home/michal/work/BIM_checker/assets/js/common/theme.js /home/michal/work/BIM_checker/assets/js/common/i18n.js
```
Expected: `setTheme` exists in theme.js; `setLanguage` exists in i18n.js. If `getTheme` or `getCurrentLanguage` don't exist, the tool falls back to `localStorage` reads (already coded above) — no change needed.

- [ ] **Step 4: Create tests/test-suites/tools-settings.test.js**

```js
describe('tool-settings', () => {
    let settingsTools;
    let helpers;
    let savedTheme;
    let savedLang;

    beforeEach(async () => {
        settingsTools = await import('../../assets/js/ai/tools/tool-settings.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        savedTheme = localStorage.getItem('theme');
        savedLang = localStorage.getItem('lang');
    });

    afterEach(() => {
        if (savedTheme === null) localStorage.removeItem('theme'); else localStorage.setItem('theme', savedTheme);
        if (savedLang === null) localStorage.removeItem('lang'); else localStorage.setItem('lang', savedLang);
    });

    it('get_theme returns current theme string', async () => {
        const r = await settingsTools.get_theme({});
        expect(typeof r.theme).toBe('string');
    });

    it('set_theme applies dark theme', async () => {
        const r = await settingsTools.set_theme({ theme: 'dark' });
        expect(r.applied).toBe('dark');
    });

    it('set_theme rejects invalid value', async () => {
        let threw = false;
        try { await settingsTools.set_theme({ theme: 'rainbow' }); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('get_language returns current lang', async () => {
        const r = await settingsTools.get_language({});
        expect(['cs', 'en'].includes(r.lang)).toBe(true);
    });

    it('set_language applies en', async () => {
        const r = await settingsTools.set_language({ lang: 'en' });
        expect(r.applied).toBe('en');
    });

    it('set_language rejects invalid lang', async () => {
        let threw = false;
        try { await settingsTools.set_language({ lang: 'fr' }); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('register adds 4 tools to executor', async () => {
        const exec = await import('../../assets/js/ai/tool-executor.js');
        exec._resetRegistryForTest();
        let count = 0;
        const fakeRegister = () => { count++; };
        settingsTools.register(fakeRegister);
        expect(count).toBe(4);
        exec._reinitializeForTest();
    });
});
```

- [ ] **Step 5: Add test suite script tag**

In `tests/test-runner.html`, find the line `<script src="test-suites/chat-panel-tool-loop.test.js"></script>` and add BEFORE it:
```html
    <script src="test-suites/tools-settings.test.js"></script>
```

- [ ] **Step 6: Mirror to dist + run tests**

```bash
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
cp assets/js/ai/tools/tool-settings.js dist/assets/js/ai/tools/tool-settings.js
mkdir -p dist/assets/js/ai/tools
node tests/run-tests.js 2>&1 | tail -3
```
Expected: `594/594 tests passed` (587 baseline + 7 new). The 4 settings tools haven't been registered into the executor yet (Task 6 wires that), so the "all 16 tools" assertion in chat-panel-tool-loop.test.js is still 16 — that's fine.

- [ ] **Step 7: Commit**

```bash
git checkout -b phase-9a-user-config-agents
git add assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js \
        assets/js/ai/tools/tool-settings.js dist/assets/js/ai/tools/tool-settings.js \
        tests/test-suites/tools-settings.test.js tests/test-runner.html
git commit -m "feat(ai-tools-9a): theme + language tools + active-agent global"
```

---

## Task 2: tool-settings.js — wizard, PWA install, bug report

**Files:**
- Modify: `assets/js/common/pwa.js` — expose `window.PWA = { canInstall, prompt }` API
- Modify: `assets/js/ai/tools/tool-settings.js` — add 4 tools
- Modify: `tests/test-suites/tools-settings.test.js` — add ~7 tests
- Mirror: dist

- [ ] **Step 1: Refactor pwa.js to expose programmatic API**

In `assets/js/common/pwa.js`, after the existing IIFE body but BEFORE the closing `})();` line, add:
```js
    // Phase 9a: programmatic API for AI install_pwa tool
    window.PWA = {
        canInstall: () => !!deferredPrompt,
        prompt: async () => {
            if (!deferredPrompt) return { available: false };
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            const accepted = result.outcome === 'accepted';
            if (accepted && installBtn) installBtn.classList.add(UNAVAILABLE_CLASS);
            deferredPrompt = null;
            return { available: true, accepted };
        }
    };
```

- [ ] **Step 2: Add 4 new tools to tool-settings.js**

Open `assets/js/ai/tools/tool-settings.js`. Append these exports BEFORE the existing `register()` function:
```js
export async function start_wizard(args) {
    if (typeof window.wizard === 'undefined' || !window.wizard.start) {
        return { error: 'wrong_page', message: 'Průvodce je dostupný jen na podstránkách (validator/parser/viewer).' };
    }
    if (args && args.page) {
        // currentPage is set internally by WizardManager; only honour if step set is appropriate
        if (typeof window.wizard.setCurrentPage === 'function') {
            window.wizard.setCurrentPage(args.page);
        }
    }
    window.wizard.start();
    return { started: true };
}

export async function dismiss_wizard() {
    if (typeof window.wizard === 'undefined' || !window.wizard.stop) {
        return { error: 'wrong_page' };
    }
    window.wizard.stop();
    return { dismissed: true };
}

export async function install_pwa() {
    if (typeof window.PWA === 'undefined') return { error: 'pwa_not_available' };
    if (!window.PWA.canInstall()) return { available: false, message: 'Browser instalační prompt zatím není připraven, zkuste později.' };
    return await window.PWA.prompt();
}

export async function open_bug_report(args) {
    if (typeof window.BugReport === 'undefined') return { error: 'bug_report_not_available' };
    window.BugReport.open();
    if (args && args.description) {
        const ta = document.getElementById('bugReportDesc');
        if (ta) ta.value = args.description;
    }
    return { opened: true };
}
```

Then replace the existing `register()` body to register all 8 tools:
```js
export function register(registerFn) {
    registerFn('get_theme', get_theme);
    registerFn('set_theme', set_theme);
    registerFn('get_language', get_language);
    registerFn('set_language', set_language);
    registerFn('start_wizard', start_wizard);
    registerFn('dismiss_wizard', dismiss_wizard);
    registerFn('install_pwa', install_pwa);
    registerFn('open_bug_report', open_bug_report);
}
```

- [ ] **Step 3: Add tests for new tools**

In `tests/test-suites/tools-settings.test.js`, BEFORE the `register adds 4 tools` test (which we'll update next), add:
```js
    it('start_wizard returns wrong_page when window.wizard is missing', async () => {
        const orig = window.wizard;
        delete window.wizard;
        try {
            const r = await settingsTools.start_wizard({});
            expect(r.error).toBe('wrong_page');
        } finally {
            if (orig) window.wizard = orig;
        }
    });

    it('start_wizard returns started when wizard exists', async () => {
        const orig = window.wizard;
        let startCalled = false;
        window.wizard = { start: () => { startCalled = true; }, stop: () => {} };
        try {
            const r = await settingsTools.start_wizard({});
            expect(r.started).toBe(true);
            expect(startCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.wizard; else window.wizard = orig;
        }
    });

    it('dismiss_wizard returns dismissed', async () => {
        const orig = window.wizard;
        let stopCalled = false;
        window.wizard = { start: () => {}, stop: () => { stopCalled = true; } };
        try {
            const r = await settingsTools.dismiss_wizard({});
            expect(r.dismissed).toBe(true);
            expect(stopCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.wizard; else window.wizard = orig;
        }
    });

    it('install_pwa returns available:false when no prompt cached', async () => {
        const orig = window.PWA;
        window.PWA = { canInstall: () => false, prompt: async () => ({ available: false }) };
        try {
            const r = await settingsTools.install_pwa({});
            expect(r.available).toBe(false);
        } finally {
            if (orig === undefined) delete window.PWA; else window.PWA = orig;
        }
    });

    it('install_pwa calls PWA.prompt when available', async () => {
        const orig = window.PWA;
        let promptCalled = false;
        window.PWA = { canInstall: () => true, prompt: async () => { promptCalled = true; return { available: true, accepted: true }; } };
        try {
            const r = await settingsTools.install_pwa({});
            expect(r.accepted).toBe(true);
            expect(promptCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.PWA; else window.PWA = orig;
        }
    });

    it('open_bug_report calls BugReport.open and prefills description', async () => {
        const orig = window.BugReport;
        let opened = false;
        // Inject the textarea so prefill has somewhere to write
        const ta = document.createElement('textarea');
        ta.id = 'bugReportDesc';
        document.body.appendChild(ta);
        window.BugReport = { open: () => { opened = true; } };
        try {
            const r = await settingsTools.open_bug_report({ description: 'lorem ipsum' });
            expect(r.opened).toBe(true);
            expect(opened).toBe(true);
            expect(document.getElementById('bugReportDesc').value).toBe('lorem ipsum');
        } finally {
            ta.remove();
            if (orig === undefined) delete window.BugReport; else window.BugReport = orig;
        }
    });

    it('open_bug_report works without description arg', async () => {
        const orig = window.BugReport;
        window.BugReport = { open: () => {} };
        try {
            const r = await settingsTools.open_bug_report({});
            expect(r.opened).toBe(true);
        } finally {
            if (orig === undefined) delete window.BugReport; else window.BugReport = orig;
        }
    });
```

Then update the `register adds 4 tools to executor` test:
```js
    it('register adds 8 tools to executor', async () => {
        const exec = await import('../../assets/js/ai/tool-executor.js');
        exec._resetRegistryForTest();
        let count = 0;
        const fakeRegister = () => { count++; };
        settingsTools.register(fakeRegister);
        expect(count).toBe(8);
        exec._reinitializeForTest();
    });
```

- [ ] **Step 4: Mirror + run tests**

```bash
cp assets/js/common/pwa.js dist/assets/js/common/pwa.js
cp assets/js/ai/tools/tool-settings.js dist/assets/js/ai/tools/tool-settings.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 601/601 (594 + 7 new tests).

- [ ] **Step 5: Commit**

```bash
git add assets/js/common/pwa.js dist/assets/js/common/pwa.js \
        assets/js/ai/tools/tool-settings.js dist/assets/js/ai/tools/tool-settings.js \
        tests/test-suites/tools-settings.test.js
git commit -m "feat(ai-tools-9a): wizard + PWA install + bug report tools"
```

---

## Task 3: tool-agents.js — list_agents + get_active_agent

**Files:**
- Create: `assets/js/ai/tools/tool-agents.js`
- Create: `tests/test-suites/tools-agents.test.js`
- Modify: `tests/test-runner.html` — add new test script tag
- Mirror: dist

- [ ] **Step 1: Create tool-agents.js with two read-only tools**

Create `assets/js/ai/tools/tool-agents.js`:
```js
import * as helpers from './_helpers.js';
import * as chatStorage from '../chat-storage.js';

function _safeAgent(a) {
    return {
        id: a.id,
        name: a.name,
        icon: a.icon || '🤖',
        provider: a.provider,
        model: a.model,
        baseUrl: a.baseUrl || '',
        // apiKey intentionally omitted
        systemPrompt: a.systemPrompt || '',
        temperature: typeof a.temperature === 'number' ? a.temperature : 0.7
    };
}

export async function list_agents() {
    const list = await chatStorage.listAgents();
    return list.map(_safeAgent);
}

export async function get_active_agent() {
    const id = window.__bimAiActiveAgentId;
    if (!id) return { error: 'no_active_agent', message: 'Žádný agent právě neřídí chat.' };
    const agent = await chatStorage.getAgent(id);
    if (!agent) return { error: 'not_found', message: 'Aktivní agent nebyl nalezen v úložišti.' };
    return _safeAgent(agent);
}

export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
}
```

- [ ] **Step 2: Create tests/test-suites/tools-agents.test.js**

```js
describe('tool-agents (read)', () => {
    let agentTools;
    let chatStorage;

    beforeEach(async () => {
        agentTools = await import('../../assets/js/ai/tools/tool-agents.js');
        chatStorage = await import('../../assets/js/ai/chat-storage.js');
    });

    afterEach(() => {
        delete window.__bimAiActiveAgentId;
    });

    it('list_agents returns array without apiKey field', async () => {
        const id = await chatStorage.saveAgent({ name: 'Test', provider: 'openai', model: 'gpt-4', apiKey: 'sk-secret' });
        try {
            const list = await agentTools.list_agents({});
            const me = list.find(a => a.id === id);
            expect(!!me).toBe(true);
            expect(me.name).toBe('Test');
            expect('apiKey' in me).toBe(false);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('get_active_agent returns no_active_agent when global is unset', async () => {
        delete window.__bimAiActiveAgentId;
        const r = await agentTools.get_active_agent({});
        expect(r.error).toBe('no_active_agent');
    });

    it('get_active_agent returns the agent when global is set', async () => {
        const id = await chatStorage.saveAgent({ name: 'Active', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id;
        try {
            const r = await agentTools.get_active_agent({});
            expect(r.id).toBe(id);
            expect(r.name).toBe('Active');
            expect('apiKey' in r).toBe(false);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('get_active_agent returns not_found when id has no record', async () => {
        window.__bimAiActiveAgentId = 'agent_nope';
        const r = await agentTools.get_active_agent({});
        expect(r.error).toBe('not_found');
    });

    it('register adds 2 tools', async () => {
        let count = 0;
        agentTools.register(() => { count++; });
        expect(count).toBe(2);
    });
});
```

- [ ] **Step 3: Add test runner script tag**

In `tests/test-runner.html`, after the `tools-settings.test.js` line, add:
```html
    <script src="test-suites/tools-agents.test.js"></script>
```

- [ ] **Step 4: Mirror + run tests**

```bash
cp assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 606/606 (601 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js \
        tests/test-suites/tools-agents.test.js tests/test-runner.html
git commit -m "feat(ai-tools-9a): list_agents + get_active_agent"
```

---

## Task 4: create_agent + update_agent (with active-agent guard)

**Files:**
- Modify: `assets/js/ai/tools/tool-agents.js` — append two functions, update `register()`
- Modify: `tests/test-suites/tools-agents.test.js` — append tests

- [ ] **Step 1: Add create_agent and update_agent**

In `assets/js/ai/tools/tool-agents.js`, BEFORE the existing `register()` function, append:
```js
export async function create_agent(args) {
    helpers.validateArgs(args, {
        name: { required: true },
        provider: { required: true },
        model: { required: true },
        apiKey: { required: true }
    });
    if (typeof args.name !== 'string' || args.name.trim().length === 0) {
        throw new Error('name must be a non-empty string');
    }
    const id = await chatStorage.saveAgent({
        name: args.name.trim(),
        provider: args.provider,
        model: args.model,
        apiKey: args.apiKey,
        systemPrompt: args.systemPrompt || '',
        temperature: typeof args.temperature === 'number' ? args.temperature : 0.7,
        icon: args.icon || '🤖',
        baseUrl: args.baseUrl || ''
    });
    return { id, created: true };
}

export async function update_agent(args) {
    helpers.validateArgs(args, { id: { required: true } });
    if (window.__bimAiActiveAgentId && args.id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: 'Aktuálně běžící agent nelze měnit. Přepni se na jiného agenta nebo to udělej v UI.' };
    }
    const existing = await chatStorage.getAgent(args.id);
    if (!existing) return { error: 'not_found', message: 'Agent s tímto id neexistuje.' };
    const patch = { id: args.id };
    for (const k of ['name', 'icon', 'provider', 'baseUrl', 'apiKey', 'model', 'systemPrompt', 'temperature']) {
        if (k in args) patch[k] = args[k];
    }
    await chatStorage.saveAgent(patch);
    return { id: args.id, updated: true };
}
```

- [ ] **Step 2: Update register() in tool-agents.js**

Replace the existing `register()` body:
```js
export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
    registerFn('create_agent', create_agent);
    registerFn('update_agent', update_agent);
}
```

- [ ] **Step 3: Append tests**

In `tests/test-suites/tools-agents.test.js`, BEFORE the existing `register adds 2 tools` test, add:
```js
    it('create_agent stores a new agent and returns id', async () => {
        const r = await agentTools.create_agent({ name: 'New', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            expect(r.created).toBe(true);
            expect(typeof r.id).toBe('string');
            const stored = await chatStorage.getAgent(r.id);
            expect(stored.name).toBe('New');
        } finally {
            await chatStorage.deleteAgent(r.id);
        }
    });

    it('create_agent rejects empty name', async () => {
        let threw = false;
        try { await agentTools.create_agent({ name: '   ', provider: 'openai', model: 'gpt-4', apiKey: 'k' }); }
        catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('update_agent patches fields on non-active agent', async () => {
        const id = await chatStorage.saveAgent({ name: 'Old', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            const r = await agentTools.update_agent({ id, name: 'NewName', temperature: 0.2 });
            expect(r.updated).toBe(true);
            const stored = await chatStorage.getAgent(id);
            expect(stored.name).toBe('NewName');
            expect(stored.temperature).toBe(0.2);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('update_agent refuses when target is the active agent', async () => {
        const id = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id;
        try {
            const r = await agentTools.update_agent({ id, name: 'tryRename' });
            expect(r.error).toBe('cannot_modify_active');
            const stored = await chatStorage.getAgent(id);
            expect(stored.name).toBe('A');
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('update_agent returns not_found for missing id', async () => {
        const r = await agentTools.update_agent({ id: 'agent_nope_1234', name: 'X' });
        expect(r.error).toBe('not_found');
    });
```

Update the existing register count test:
```js
    it('register adds 4 tools', async () => {
        let count = 0;
        agentTools.register(() => { count++; });
        expect(count).toBe(4);
    });
```

- [ ] **Step 4: Mirror + run tests**

```bash
cp assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 611/611 (606 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js \
        tests/test-suites/tools-agents.test.js
git commit -m "feat(ai-tools-9a): create_agent + update_agent (active-agent guard)"
```

---

## Task 5: delete_agent (with confirm + last_agent + active-agent guards)

**Files:**
- Modify: `assets/js/ai/tools/tool-agents.js` — append `delete_agent`, update `register()`
- Modify: `tests/test-suites/tools-agents.test.js` — append tests

- [ ] **Step 1: Add delete_agent**

In `assets/js/ai/tools/tool-agents.js`, BEFORE `register()`, append:
```js
export async function delete_agent(args) {
    helpers.validateArgs(args, { id: { required: true } });
    if (window.__bimAiActiveAgentId && args.id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: 'Aktuálně běžící agent nelze smazat.' };
    }
    const all = await chatStorage.listAgents();
    if (all.length <= 1) {
        return { error: 'last_agent', message: 'Nelze smazat posledního zbývajícího agenta.' };
    }
    const target = all.find(a => a.id === args.id);
    if (!target) return { error: 'not_found' };
    if (!confirm(`Smazat agenta '${target.name}'?`)) return { cancelled: true };
    const ok = await chatStorage.deleteAgent(args.id);
    return { deleted: ok };
}
```

Update `register()`:
```js
export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
    registerFn('create_agent', create_agent);
    registerFn('update_agent', update_agent);
    registerFn('delete_agent', delete_agent);
}
```

- [ ] **Step 2: Append tests**

In `tests/test-suites/tools-agents.test.js`, BEFORE the (just-updated) register count test, add:
```js
    it('delete_agent refuses when target is active', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'B', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id1;
        try {
            const r = await agentTools.delete_agent({ id: id1 });
            expect(r.error).toBe('cannot_modify_active');
            const still = await chatStorage.getAgent(id1);
            expect(!!still).toBe(true);
        } finally {
            await chatStorage.deleteAgent(id1);
            await chatStorage.deleteAgent(id2);
        }
    });

    it('delete_agent refuses when only one agent remains', async () => {
        // Wipe all agents first
        const before = await chatStorage.listAgents();
        for (const a of before) await chatStorage.deleteAgent(a.id);
        const id = await chatStorage.saveAgent({ name: 'Only', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            const r = await agentTools.delete_agent({ id });
            expect(r.error).toBe('last_agent');
            const still = await chatStorage.getAgent(id);
            expect(!!still).toBe(true);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('delete_agent returns cancelled when confirm dismissed', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'B', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await agentTools.delete_agent({ id: id1 });
            expect(r.cancelled).toBe(true);
            const still = await chatStorage.getAgent(id1);
            expect(!!still).toBe(true);
        } finally {
            window.confirm = orig;
            await chatStorage.deleteAgent(id1);
            await chatStorage.deleteAgent(id2);
        }
    });

    it('delete_agent succeeds with confirm and non-active id', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'Keep', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'Bye', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await agentTools.delete_agent({ id: id2 });
            expect(r.deleted).toBe(true);
            const gone = await chatStorage.getAgent(id2);
            expect(gone).toBe(null);
        } finally {
            window.confirm = orig;
            await chatStorage.deleteAgent(id1).catch(() => {});
            await chatStorage.deleteAgent(id2).catch(() => {});
        }
    });
```

Update the register count test:
```js
    it('register adds 5 tools', async () => {
        let count = 0;
        agentTools.register(() => { count++; });
        expect(count).toBe(5);
    });
```

- [ ] **Step 3: Mirror + run tests**

```bash
cp assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 615/615 (611 + 4 new).

- [ ] **Step 4: Commit**

```bash
git add assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js \
        tests/test-suites/tools-agents.test.js
git commit -m "feat(ai-tools-9a): delete_agent (confirm + last_agent + active guards)"
```

---

## Task 6: Wire-up — tool-defs.js + executor bootstrap + count assertions + sw cache + PLAN/CHANGELOG

**Files:**
- Modify: `assets/js/ai/tool-defs.js` — add 13 OpenAI-format definitions
- Modify: `assets/js/ai/tool-executor.js` — import + register the 2 new modules
- Modify: `tests/test-suites/chat-panel-tool-loop.test.js` — count 16 → 29
- Modify: `tests/test-suites/ai-bootstrap.test.js` — count 16 → 29
- Modify: `sw.js` + `dist/sw.js` — bump v23 → v24, add 2 files to ASSETS_TO_CACHE
- Modify: `PLAN.md` — append Phase 9a entry
- Modify: `CHANGELOG.md` — add `[0.5.0]` entry
- Mirror: dist for all changed files

- [ ] **Step 1: Add 13 entries to tool-defs.js**

In `assets/js/ai/tool-defs.js`, find the closing `];` of `TOOL_DEFINITIONS`. BEFORE that closing bracket, insert (preserving the trailing comma on the previous entry):
```js
    {
        type: 'function',
        function: {
            name: 'get_theme',
            description: 'Vrátí aktuální barevné téma (light/dark).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_theme',
            description: 'Přepne barevné téma. Bere efekt okamžitě.',
            parameters: {
                type: 'object',
                properties: { theme: { type: 'string', enum: ['light', 'dark'] } },
                required: ['theme']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_language',
            description: 'Vrátí aktuální jazyk UI (cs/en).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_language',
            description: 'Přepne jazyk UI. Spustí re-render textů.',
            parameters: {
                type: 'object',
                properties: { lang: { type: 'string', enum: ['cs', 'en'] } },
                required: ['lang']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'start_wizard',
            description: 'Spustí onboarding průvodce. Funguje jen na podstránkách (validator/parser/viewer), ne na homepage.',
            parameters: {
                type: 'object',
                properties: {
                    page: { type: 'string', enum: ['validator', 'parser', 'viewer'], description: 'Volitelné — který set kroků použít. Pokud nezadáno, použije se aktuální stránka.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dismiss_wizard',
            description: 'Zavře aktivního průvodce.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'install_pwa',
            description: 'Spustí browser dialog pro instalaci PWA. Pokud browser instalační prompt nemá k dispozici, vrátí available:false.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'open_bug_report',
            description: 'Otevře dialog hlášení chyby. Volitelně předvyplní popis.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'Předvyplněný text popisu.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_agents',
            description: 'Vrátí seznam všech AI agentů (bez API klíčů).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_active_agent',
            description: 'Vrátí informace o aktuálně běžícím agentovi (tom, co řídí tento chat).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_agent',
            description: 'Vytvoří nového AI agenta. Vyžaduje API klíč.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    provider: { type: 'string', description: 'openai | anthropic | google | mistral | groq | other' },
                    model: { type: 'string' },
                    apiKey: { type: 'string' },
                    systemPrompt: { type: 'string' },
                    temperature: { type: 'number' },
                    icon: { type: 'string' },
                    baseUrl: { type: 'string' }
                },
                required: ['name', 'provider', 'model', 'apiKey']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_agent',
            description: 'Upraví existujícího agenta podle id. NESMÍ být použit na aktuálně běžícího agenta — vrátí cannot_modify_active.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    icon: { type: 'string' },
                    provider: { type: 'string' },
                    model: { type: 'string' },
                    apiKey: { type: 'string' },
                    systemPrompt: { type: 'string' },
                    temperature: { type: 'number' },
                    baseUrl: { type: 'string' }
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_agent',
            description: 'Smaže agenta podle id. Před smazáním otevře potvrzovací dialog. Nemůže smazat aktuálně běžícího agenta ani posledního zbývajícího.',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id']
            }
        }
    }
```

- [ ] **Step 2: Wire executor bootstrap to import 2 new modules**

Open `assets/js/ai/tool-executor.js`. After the existing imports (e.g. `import * as uiTools from './tools/tool-ui.js';`), add:
```js
import * as settingsTools from './tools/tool-settings.js';
import * as agentTools from './tools/tool-agents.js';
```

In the `_bootstrap()` function, after `uiTools.register(_registerTool);`, add:
```js
    settingsTools.register(_registerTool);
    agentTools.register(_registerTool);
```

- [ ] **Step 3: Update count assertions**

In `tests/test-suites/chat-panel-tool-loop.test.js`, locate the test `'all 16 tools registered after module load'` and update:
```js
    it('all 29 tools registered after module load', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        executor._reinitializeForTest();
        expect(executor._registrySizeForTest()).toBe(29);
    });
```
And the `'TOOL_DEFINITIONS contains 16 entries'`:
```js
    it('TOOL_DEFINITIONS contains 29 entries', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(TOOL_DEFINITIONS.length).toBe(29);
    });
```

In `tests/test-suites/ai-bootstrap.test.js`, find the assertion that mentions 16 tools (likely `TOOL_DEFINITIONS.length).toBe(16)` or similar, and bump to 29).

Run:
```bash
grep -n "16\b" tests/test-suites/ai-bootstrap.test.js
```
Expected output shows the line(s) with the 16 assertion. Edit to 29.

- [ ] **Step 4: Bump SW cache + add new files to ASSETS_TO_CACHE**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v23';` to `const CACHE_VERSION = 'bim-checker-v24';`
- In `ASSETS_TO_CACHE`, find the existing line `'./assets/js/ai/tools/tool-ui.js',` and AFTER it add:
```js
    './assets/js/ai/tools/tool-settings.js',
    './assets/js/ai/tools/tool-agents.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 5: Update PLAN.md**

Open `PLAN.md`. Find the existing `## Phase 8` section. AFTER the entire Phase 8 block, append:
```markdown
## Phase 9a: User config + agents ✅
- [x] 13 tools (settings 8, agents 5)
- [x] Active-agent global (`window.__bimAiActiveAgentId`) prevents self-modification
- [x] Agent CRUD: list/create/update/delete with `cannot_modify_active` and `last_agent` guards
- [x] PWA programmatic API (`window.PWA.canInstall/prompt`)
- [x] ~26 new tests (587 → 615)

Branch: phase-9a-user-config-agents
```

- [ ] **Step 6: Update CHANGELOG.md**

Open `CHANGELOG.md`. Insert at the top of the entries (after the header, before `[0.4.0]`):
```markdown
## [0.5.0] - 2026-05-10

### Added
- AI tools (Phase 9a, 13 new): settings (theme/language/wizard/PWA install/bug report) + agent CRUD
- `window.PWA.canInstall()` / `window.PWA.prompt()` programmatic install API
- `window.__bimAiActiveAgentId` global identifies the agent driving the current chat
- Active-agent guard: `update_agent`/`delete_agent` refuse with `cannot_modify_active` if target == active id
- `last_agent` guard: refuse to delete the only remaining agent

### Changed
- `tool-executor.js` `_bootstrap()` now also registers `tool-settings` and `tool-agents` modules
- SW cache bumped v23 → v24
```

- [ ] **Step 7: Mirror everything + final test pass**

```bash
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
cp assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js
cp sw.js dist/sw.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 615/615.

- [ ] **Step 8: Commit + push branch**

```bash
git add assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js \
        assets/js/ai/tool-executor.js dist/assets/js/ai/tool-executor.js \
        tests/test-suites/chat-panel-tool-loop.test.js \
        tests/test-suites/ai-bootstrap.test.js \
        sw.js dist/sw.js \
        PLAN.md CHANGELOG.md
git commit -m "feat(ai-tools-9a): wire defs + executor bootstrap + cache bump + docs"
git push -u origin phase-9a-user-config-agents
```

Capture the GitHub PR URL printed by `git push` and report it.

---

## Self-Review Notes

**Spec coverage:**
- Tier A "User config & navigation" 8 tools → Tasks 1-2 ✓
- Tier A "Agent self-management" 4 tools → Tasks 4-5 ✓
- `get_active_agent` (Tier C misc) → Task 3 ✓
- Active-agent guard plumbing → Task 1 (chat-panel) + Tasks 4-5 (consumers) ✓
- Czech tool descriptions → Task 6 ✓
- Native confirm() on destructive → Task 5 ✓
- Error model carried forward → Tasks 4-5 ✓

**Type consistency:**
- `_safeAgent()` shape used in both `list_agents` and `get_active_agent` returns
- `chatStorage.saveAgent` does both create and update — consistent
- All registrations use the same `register(registerFn)` signature

**Final test target:** 587 (Phase 8 baseline) + 26 new in Phase 9a = **613 tests minimum**, plan budgets 615 to allow for incidental sub-tests.

**Risks:**
- `helpers.validateArgs` doesn't fully validate enum values — tools still rely on backend (e.g., `set_theme` enum is checked by validateArgs reading the schema). Verify by running Step 4 of Task 1 — the "rejects invalid value" test will fail-fast if validateArgs ignores enum.
- If `helpers.validateArgs` doesn't enforce enums, change those tests to call the underlying `setTheme` and assert it's a no-op or error response — but this is a Phase 8 helper bug to file, not Phase 9a's concern.
