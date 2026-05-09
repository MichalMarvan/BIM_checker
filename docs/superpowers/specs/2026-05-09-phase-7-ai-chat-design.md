# Phase 7 — AI Chat Infrastructure Design

**Date:** 2026-05-09
**Status:** Approved (pending implementation plan)
**Branch target:** `phase-7-ai-chat`
**Source reference:** `/home/michal/work/bim-ai-viewer` (functioning prior art)

## Goal

Bring AI agents into BIM_checker. Phase 7 delivers the **infrastructure only**:

- Settings UI for managing AI agents (providers, models, system prompts)
- Bottom-right circular launcher button → popover with favorite agents
- Right-side floating chat panel with persisted threads sidebar
- IndexedDB storage for agents, threads, and messages
- 5 OpenAI-compatible providers (Ollama, Google AI, OpenAI, OpenRouter, Custom)
- Streaming chat completions with provider error handling
- Full CZ + EN i18n coverage

**Tools (function calling) are out of scope.** The framework is wired (empty `tool-defs.js`, stub `tool-executor.js`) so Phase 8+ can add BIM_checker-specific tools incrementally without touching the chat shell.

## Non-goals

| Feature | Reason | Future phase |
|---------|--------|--------------|
| BIM_checker function-calling tools | Each tool is a separate scope; Phase 7 proves the chat shell works | Phase 8 |
| 3D viewer tools (highlight, focus, search) | Depends on completing 3D viewer integration | Phase 9+ |
| Image / vision input | Multimodal chat | Unplanned |
| Token counting / cost estimation | Nice-to-have | Unplanned |
| Conversation export (JSON / Markdown) | Nice-to-have | On request |
| MCP server integration | Deeper architecture, scope shift | On request |
| Prompt templates / quick actions | Simplification vs bim-ai-viewer | Phase 8 |
| Cross-device sync of agents | Requires backend | Unplanned |

## Strategy

**Direct port of `bim-ai-viewer`'s AI layer** with adaptation to BIM_checker:

- Storage backend → reuse `bim_checker_storage` IndexedDB (new keys, no new DB)
- ES6 module pattern (bim-ai-viewer style, BIM_checker already supports via `update-checker.js`)
- CSS variables → map to BIM_checker's `--primary-color` / `--bg-secondary` etc.
- i18n → integrate into existing `assets/js/common/translations.js`

Approximately **60–70% direct port**, 30–40% new (storage adapter, threads UI, BIM_checker theming).

---

## 1. Architecture and file structure

### 1.1 New files in `assets/js/ai/` (logic layer, ported from bim-ai-viewer)

| File | Responsibility | Source |
|------|---------------|--------|
| `ai-client.js` | OpenAI-compatible chat completion + fetchModels + testConnection. Streaming support. | Direct port (~115 lines) |
| `providers.js` | 5 provider definitions (name, default endpoint, needsKey) | Direct port (~25 lines) |
| `agent-manager.js` | Agent CRUD wrapper around `chat-storage`. Resolves effective endpoint. | Adapted (~250 lines) |
| `tool-defs.js` | Tool definitions for AI function calling. **Phase 7 exports `[]`.** | New stub (~30 lines) |
| `tool-executor.js` | Executes tool calls against project. **Phase 7 returns `{error: 'Tools disabled in Phase 7'}`.** | New stub (~50 lines) |
| `chat-storage.js` | IndexedDB CRUD for agents, threads, messages, settings. Reuses `bim_checker_storage` DB. | New (~250 lines) |

### 1.2 New files in `assets/js/ai-ui/` (UI layer, ported and adapted)

| File | Responsibility |
|------|---------------|
| `init.js` | Bootstraps launcher + navbar settings button on every page (DOMContentLoaded). |
| `chat-panel.js` | Right-side floating panel. Threads sidebar + messages + input. Streaming render. |
| `settings-modal.js` | Popup modal: agent list, agent form, optional advanced endpoint section. |
| `chat-launcher.js` | Bottom-right circular button + popover with favorite agents. |
| `chat-i18n-helpers.js` | Small re-export of `t()` and event re-render helpers, isolates i18n integration. |

### 1.3 New CSS

`assets/css/ai-chat.css` — single stylesheet covering `.chat-launcher`, `.chat-panel`, `.ai-settings-modal`, `.agent-form`, `.thread-list`, `.message-bubble`, `.tool-call-display` (Phase 8-ready), `.popover-menu`. Maps to BIM_checker CSS variables.

### 1.4 Modifications to existing files

**Each of three pages** (`pages/ids-ifc-validator.html`, `ids-parser-visualizer.html`, `ifc-viewer-multi-file.html`):

- Insert `<button class="ai-settings-btn" id="aiSettingsBtn">` into `.navbar-actions` between `wizard-help-btn` and `language-switcher`.
- Insert `<link rel="stylesheet" href="../assets/css/ai-chat.css">` in `<head>`.
- Insert `<script type="module" src="../assets/js/ai-ui/init.js"></script>` at end of `<body>`.

No other HTML changes. The chat panel, launcher button, and settings modal are injected lazily from JS.

**`assets/js/common/translations.js`** — add ~56 new keys × 2 languages.

**`tests/test-runner.html`** — register 5 new test suite scripts.

**`eslint.config.js`** — add `ChatStorage`, `AgentManager`, `AIClient` to globals (ES6 modules export them but tests reference via `window.*` for integration tests).

**`sw.js`** — bump `CACHE_VERSION` v14 → v15. Add new files to `ASSETS_TO_CACHE`.

**`PLAN.md`** — Phase 7 entry.

**`CHANGELOG.md`** — `[0.3.0]` entry (minor bump for new feature).

All of the above mirrored to `dist/`.

### 1.5 Boot flow

```
Page load → DOMContentLoaded
  ↓
init.js executes:
  1. Inject <button class="chat-launcher">🤖</button> into <body> immediately
     (spinner-style icon initially; replaced after agents load)
  2. Wire #aiSettingsBtn click → openSettingsModal()
  3. Wire .chat-launcher click → openLauncherPopover()
  4. async: load agents + settings from IndexedDB → cache in module-scope variable
  5. After load: re-render launcher button to active state; popover ready to open
```

The launcher button is visible from the first paint with a placeholder state, so users see the entry point immediately. Popover opening before agents finish loading shows a brief "loading…" indicator (typically 50–100 ms in practice).

Phase 7 does NOT auto-restore chat panel state on page load — user opens chat manually each session. (`lastOpenedThreadId` is persisted but consumed only when user re-opens the panel; the panel remembers the last thread within a session, not across page reloads.)

Settings modal and chat panel are NOT pre-injected. They lazy-inject DOM on first open (same pattern as `bug-report.js`).

---

## 2. UI components

### 2.1 Navbar settings button

```html
<button class="ai-settings-btn" id="aiSettingsBtn"
        title="AI agenti — nastavení"
        data-i18n-title="ai.settings.tooltip"
        aria-label="AI settings">
    <!-- gear SVG icon, 24×24 viewBox -->
</button>
```

Styling matches `bug-report-btn` and `wizard-header-btn` (40×40 px, transparent background, hover highlight).

### 2.2 Bottom-right launcher button

Circular 56×56 px button injected into `<body>` at `position: fixed; bottom: 24px; right: 24px; z-index: 9000;`. Gradient background (uses BIM_checker's `--primary-gradient`), drop-shadow, hover scale 1.05.

```html
<button class="chat-launcher" id="chatLauncher" aria-label="AI Asistent" title="...">
    <svg><!-- robot icon --></svg>
</button>
```

Click toggles popover.

### 2.3 Launcher popover

Lazy-injected on first launcher click. Position above the button (`bottom: 96px; right: 24px`).

```
┌─ AI Agenti ─────────────┐
│ 🔍 Hledáč objektů      │
│ 📝 Validator helper    │
│ 📊 Reportér            │
├─────────────────────────│
│ ⚙️ Spravovat agenty    │
└─────────────────────────┘
```

- Lists favorite agents (sorted by `favoriteOrder` ascending) — max 5 in MVP, scrollable if more.
- If no agents exist → shows "Žádní agenti. Vytvořit prvního agenta" item that opens settings modal.
- Click on agent → close popover + open chat panel for that agent.
- "⚙️ Spravovat agenty" link → close popover + open settings modal.
- Click outside / Escape → close popover.

### 2.4 Settings modal

Lazy-injected. Reuses `.modal-overlay` + `.modal-container` pattern from `bug-report.js`. Width 720 px desktop, full-width below 768 px.

**Default view — agent list:**

```
┌─ AI Agenti ──────────────────────────────────  ✕ ┐
│                                                    │
│ ┌─ Agenti ─────────────────────────────────────┐ │
│ │ 🔍 Hledáč objektů  [Google AI · gemini-2.5-flash] │
│ │   ⭐ favorit                       [✏️] [🗑️]  │ │
│ │                                                │ │
│ │ 📝 Validator helper  [Custom · llama3.2]       │ │
│ │                                    [✏️] [🗑️]  │ │
│ │                                                │ │
│ │ [➕ Přidat agenta]                              │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌─ Pokročilé: vlastní endpointy ── (rozbalit) ──┐ │
│ └────────────────────────────────────────────────┘ │
│                                       [Zavřít]    │
└────────────────────────────────────────────────────┘
```

The "advanced endpoints" section is collapsed by default and remains a stub in Phase 7 (no functionality yet — placeholder for future endpoint library).

**Form view — edit/create agent:**

```
┌─ Upravit agenta ─────────────────────────────  ✕ ┐
│                                                    │
│ Ikona:       [🔍] (single emoji input or picker)   │
│ Název:       [_______________________________]    │
│ Provider:    [Google AI ▾]                         │
│ Endpoint:    [https://...] (visible only for       │
│              Custom provider; pre-filled with      │
│              provider default for others, editable)│
│ API klíč:    [********************************]   │
│ Model:       [gemini-2.5-flash ▾]   [↻ načíst]    │
│ Temperature: [▬▬▬▬▬░░░░░] 0.7                     │
│ System prompt:                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ Jsi AI asistent pomáhající s validací IFC...   │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ☑ Zobrazit v launcheru (favorit)                   │
│                                                    │
│                       [Zrušit]      [Uložit]      │
└────────────────────────────────────────────────────┘
```

Validation:
- Name: trim non-empty
- Provider: required (default "google")
- Endpoint: if Custom provider → required + must start with `http://` or `https://`
- Model: required after provider has produced a model list (or fallback text input)
- Temperature: 0–1 via slider, step 0.05
- API key: stored as-is in IndexedDB (no encryption — see §6.5)

Save flow:
- New agent → push to `ai_agents` array with generated id, `createdAt = updatedAt = now`
- Edit → preserve id + createdAt, bump updatedAt
- Toast `ai.agent.saved` with name interpolation

Delete flow:
- `confirm()` with `ai.agent.deleteConfirm`
- Cascade delete: remove agent, all its threads, all `ai_messages_<threadId>` keys
- Toast `ai.agent.deleted`

### 2.5 Chat panel

Right-side floating panel: 480 px wide on desktop, 100% on tablets/mobile.

```
┌─ AI: 🔍 Hledáč objektů ────────  [↔]  ✕ ┐
├──────────────────┬────────────────────────┤
│                  │                        │
│ Konverzace:      │  ─ User · 14:32 ──    │
│ ─────────────    │  Najdi všechny stěny  │
│ • Dnes 14:32     │                        │
│ • Včera          │  ─ AI · 14:32 ──      │
│ • Pondělí        │  V tomto projektu jsou│
│                  │  3 nahrané IFC...      │
│ ⊕ Nová           │                        │
│                  │  ⓘ Phase 7: tooly       │
│ (collapse ←)     │  zatím nejsou aktivní  │
├──────────────────┴────────────────────────┤
│ [_____________________________] [▶]      │
└──────────────────────────────────────────┘
```

**Header:**
- Agent icon + name
- `↔` button → toggle threads sidebar
- `✕` close → hides panel (state preserved in memory; reopens to last thread)

**Threads sidebar (collapsible, default open):**
- Lists threads filtered by `agentId`, sorted by `updatedAt` desc
- Each thread shows truncated title (first user message, max 30 chars) + relative time ("teď", "5 min", "včera", "pondělí", "12. dub")
- "⊕ Nová konverzace" button at top creates a new empty thread (no messages until user types)
- Click on thread → load messages + activate
- Right-click / long-press on thread → context menu with "Smazat" (confirm + cascading delete messages)

**Messages area:**
- Scrollable, auto-scroll to bottom on new message
- User messages: right-aligned, primary-color background, white text
- AI messages: left-aligned, secondary background, primary text
- Markdown render (use existing pattern from bim-ai-viewer's `chat-ui.js` — basic md: bold, italic, code, links, lists)
- "Tools disabled" info banner: rendered as the first child of the message area on every thread render in Phase 7. It scrolls with the conversation (not sticky). Once Phase 8 wires real tools, this banner is removed by changing the `aiToolsEnabled` flag in `init.js`.

**Streaming display:**
- User sends → user message appended → "thinking" placeholder appears (animated dots)
- Streaming chunks → "thinking" placeholder replaced with growing AI message
- On `finish_reason: 'stop'` → finalize message, save to thread, scroll

**Input area:**
- Textarea with auto-grow (1 row min, 5 rows max)
- Enter = send, Shift+Enter = newline
- Send button (▶) disabled when textarea empty or AI is responding

### 2.6 Responsive behaviour

| Breakpoint | Chat panel | Settings modal | Launcher popover |
|------------|-----------|----------------|------------------|
| Desktop ≥ 1024 px | 480 px wide | 720 px wide | Float above launcher |
| Tablet 768–1023 | 100% wide | 90% wide | Float above launcher |
| Mobile < 768 px | Fullscreen | Fullscreen | Bottom sheet (full-width) |

### 2.7 Z-index structure

```
99999  toast notifications (existing)
 9100  settings modal overlay
 9050  chat panel
 9000  launcher button + popover
 1000  navbar (existing)
```

---

## 3. Data model

**Backend:** existing `bim_checker_storage` IndexedDB DB, object store `storage` (keyPath `key`). New keys added; no migration; missing keys initialise to defaults.

### 3.1 Storage keys

| Key | Type | Contents |
|-----|------|----------|
| `ai_agents` | Array | All agents (~500 B each) |
| `ai_settings` | Object | Global AI settings (last active agent etc.) |
| `ai_threads` | Array | Thread metadata (no messages) |
| `ai_messages_<threadId>` | Array | Messages of one thread (lazy-loaded) |

Endpoints are **not** stored separately — each agent inlines its `baseUrl` and `apiKey`. The "endpoint library" feature from bim-ai-viewer is YAGNI for Phase 7.

### 3.2 Agent shape

```js
{
    id: '1715190000-abc',         // string, generated on create
    name: 'Hledáč objektů',
    icon: '🔍',                    // emoji or default '🤖'
    provider: 'google',            // 'ollama' | 'google' | 'openai' | 'openrouter' | 'custom'
    baseUrl: '',                   // empty = use provider default
    apiKey: 'AIza...',             // can be empty for Ollama
    model: 'gemini-2.5-flash',
    systemPrompt: 'Jsi asistent...',
    temperature: 0.7,              // 0..1
    isFavorite: true,
    favoriteOrder: 0,
    createdAt: 1715190000000,
    updatedAt: 1715190500000
}
```

Defaults on create: `provider: 'google'`, `temperature: 0.7`, `isFavorite: true`, `icon: '🤖'`, `systemPrompt: ''`.

### 3.3 Settings shape

```js
{
    lastActiveAgentId: 'string | null',
    lastOpenedThreadId: 'string | null',
    chatPanelOpen: false,
    threadsSidebarOpen: true
}
```

### 3.4 Thread shape

```js
{
    id: '1715190100-def',
    agentId: '1715190000-abc',
    title: 'Najdi všechny stěny',     // first user message, trimmed to 60 chars
    createdAt: 1715190100000,
    updatedAt: 1715190200000,
    messageCount: 8
}
```

### 3.5 Message shape

```js
{
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: 'text obsah',
    toolCalls: [/* prepared for Phase 8 */],
    toolCallId: 'call_xxx',           // for tool role
    name: 'tool_name',                // for tool role
    timestamp: 1715190100000
}
```

In Phase 7, `toolCalls` is always `undefined` or empty `[]` — tool role messages won't appear because no tools are enabled.

### 3.6 Storage API surface

`assets/js/ai/chat-storage.js`:

```js
// Agents
async listAgents()
async getAgent(id)
async saveAgent(data)                       // upsert by id; returns id
async deleteAgent(id)                       // cascading delete threads + messages
async setFavorite(id, isFavorite, order)
async listFavorites()                       // sorted by favoriteOrder

// Settings
async getSettings()                         // with defaults
async updateSettings(partial)               // merge

// Threads
async listThreads(agentId)
async getThread(id)
async createThread(agentId, firstMessage)   // creates thread + first message
async deleteThread(id)
async updateThreadTitle(id, title)

// Messages
async listMessages(threadId)
async appendMessage(threadId, message)      // also updates thread.updatedAt + messageCount
async clearThread(threadId)
```

All operations are async (IndexedDB). No write-through cache in Phase 7 — direct IDB hits.

### 3.7 Cleanup

No automatic cleanup in Phase 7. Users delete threads manually. Cascading delete on agent removal frees orphaned messages. If thread limits become necessary they can be added in Phase 8+.

---

## 4. Provider integration

All 5 providers speak **OpenAI-compatible API**. Single `ai-client.js` handles all of them.

### 4.1 Provider registry

```js
export const PROVIDERS = {
    ollama:     { name: 'Ollama',      endpoint: 'http://localhost:11434/v1', needsKey: false },
    google:     { name: 'Google AI',   endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true },
    openai:     { name: 'OpenAI',      endpoint: 'https://api.openai.com/v1', needsKey: true },
    openrouter: { name: 'OpenRouter',  endpoint: 'https://openrouter.ai/api/v1', needsKey: true },
    custom:     { name: 'Custom',      endpoint: '', needsKey: false }
};
```

Effective endpoint resolution: `agent.baseUrl || PROVIDERS[agent.provider].endpoint`.

### 4.2 ai-client surface

```js
// Chat completion. Supports streaming via stream:true.
export async function chatCompletion(endpoint, apiKey, model, messages, tools, options = {})
    // body: { model, messages, tools?, temperature?, stream?: true }
    // returns: { content, toolCalls } for non-streaming
    //          AsyncIterator<{ delta, toolCalls? }> for streaming

// List available models.
export async function fetchModels(endpoint, apiKey)
    // GET /models
    // returns: Array<{id: string}>

// Test endpoint reachability.
export async function testConnection(endpoint, apiKey)
    // returns: { ok: boolean, error?: string, latencyMs?: number }
```

All requests use `Authorization: Bearer <apiKey>` header when `needsKey === true`.

### 4.3 Streaming

OpenAI-style Server-Sent Events with `data: {...}\n\n` chunks ending with `data: [DONE]`. The `chatCompletion` function with `stream: true` returns an `AsyncIterator` yielding `{ delta: 'partial text', toolCalls?: [...] }`.

Chat panel streaming flow:
1. User submits message → append user bubble immediately
2. Show "thinking" placeholder with animated dots
3. Iterate the chunks → progressively replace placeholder text with assistant message
4. On final chunk → finalize bubble, persist to thread, scroll to bottom

In Phase 7, `toolCalls` chunks are ignored (logged via `console.warn` for debugging).

**Cancellation:** if the user closes the chat panel mid-stream, the iteration is aborted (`AbortController`). Any partial assistant content received so far IS persisted to the thread (so users can scroll back and see what was generated). The thread is then in a "completed" state — there's no resume.

**ID generation:** all generated IDs (agent, thread, message) follow the `${Date.now()}-${random6chars}` pattern established in Phase 6 presets — collision-resistant within a single session and human-debuggable.

### 4.4 Models loading

When the agent form opens:
- If agent already has `endpoint` + `apiKey` → trigger `fetchModels()` async, populate the `<select>`
- If new agent → after user picks provider and enters API key → "↻ Načíst modely" button calls `fetchModels()`
- If `fetchModels()` fails → fall back to `<input type="text">` for manual model name entry

In-session cache: once a (endpoint, apiKey) pair has produced a model list, it's not refetched until the user explicitly clicks the reload button.

### 4.5 Provider-specific notes

**Ollama:** `http://localhost:11434/v1`, no API key required. Models listed via `/v1/models`. **Constraint:** browser blocks HTTP fetch from HTTPS origin (mixed content). Chrome's localhost soft-fail may allow it; Firefox blocks. Practical: Ollama is for local dev, not prod CDN.

**Google AI:** `https://generativelanguage.googleapis.com/v1beta/openai`. Bearer auth. Models like `gemini-2.5-flash`, `gemini-2.5-pro`. Full tool-calling support.

**OpenAI:** `https://api.openai.com/v1`. Bearer auth. Models like `gpt-4`, `gpt-4-turbo`. Full tool-calling support.

**OpenRouter:** `https://openrouter.ai/api/v1`. Bearer auth. ~100+ models. Tool-calling support varies per model.

**Custom:** user-supplied URL. Validated to start with `http://` or `https://` on save. `needsKey` is implicit (some local endpoints don't need auth).

### 4.6 Error handling

| Error | Detection | UX |
|-------|-----------|-----|
| Network failure | `fetch` reject | Toast `ai.error.network` |
| 401 / 403 | response.status | Toast `ai.error.invalidApiKey` (interpolated with provider name) |
| 404 model not found | response body | Toast `ai.error.modelNotFound` (interpolated) |
| 429 rate limit | response.status | Toast `ai.error.rateLimit` |
| 5xx | response.status | Toast `ai.error.providerDown` |
| CORS preflight failure | network error type | Toast `ai.error.cors` |
| Mixed content (HTTP from HTTPS) | network error | Toast `ai.error.mixedContent` |

All errors → `ErrorHandler.error()` toast. User input preserved in textarea (not discarded).

### 4.7 Out of scope of provider integration in Phase 7

- Function calling / tool calls (no `tools` parameter sent in request body)
- Vision / image inputs
- Token counting / cost estimation
- Beyond `temperature`: no top_p, max_tokens, etc. — provider defaults

---

## 5. Internationalization

### 5.1 Namespace

All keys under `ai.*`:

| Group | Keys | Count |
|-------|------|-------|
| `ai.settings.*` | `tooltip`, `title`, `agentsHeading`, `addAgent`, `close`, `advancedSection` | 6 |
| `ai.agent.*` | `editTitle`, `createTitle`, `nameLabel`, `iconLabel`, `providerLabel`, `endpointLabel`, `apiKeyLabel`, `modelLabel`, `modelLoadBtn`, `tempLabel`, `systemPromptLabel`, `systemPromptPlaceholder`, `favoriteToggle`, `cancel`, `save`, `nameRequired`, `urlInvalid`, `saved`, `deleted`, `deleteConfirm` | 20 |
| `ai.launcher.*` | `tooltip`, `popoverTitle`, `noAgents`, `createFirst`, `manageAgents` | 5 |
| `ai.chat.*` | `headerLabel`, `toggleThreadsBtn`, `closeBtn`, `inputPlaceholder`, `sendBtn`, `thinking`, `empty`, `toolsDisabled` | 8 |
| `ai.thread.*` | `newConversation`, `threadsHeading`, `noThreads`, `deleteConfirm`, `untitledTitle` | 5 |
| `ai.error.*` | `network`, `invalidApiKey`, `modelNotFound`, `rateLimit`, `providerDown`, `cors`, `mixedContent`, `unknown` | 8 |
| `ai.endpoint.*` | `connecting`, `ok`, `fail`, `loadModelsBtn`, `loadModelsFailed` | 5 |

**Total: 57 keys × 2 languages = 114 entries.**

### 5.2 Critical translations

| Key | CZ | EN |
|-----|-----|-----|
| `ai.settings.tooltip` | AI agenti — nastavení | AI agents — settings |
| `ai.settings.title` | AI Agenti | AI Agents |
| `ai.settings.addAgent` | ➕ Přidat agenta | ➕ Add agent |
| `ai.agent.providerLabel` | Provider | Provider |
| `ai.agent.systemPromptPlaceholder` | Jsi asistent pomáhající uživateli s validací IFC souborů... | You are an assistant helping the user with IFC file validation... |
| `ai.agent.deleteConfirm` | Smazat agenta '{name}'? Všechny konverzace s ním se taky smažou. | Delete agent '{name}'? All conversations with this agent will also be deleted. |
| `ai.agent.favoriteToggle` | Zobrazit v launcheru | Show in launcher |
| `ai.launcher.tooltip` | AI Asistent | AI Assistant |
| `ai.launcher.noAgents` | Žádní agenti. Nejdřív si vytvořte agenta v nastavení. | No agents yet. Create one in settings first. |
| `ai.launcher.manageAgents` | ⚙️ Spravovat agenty | ⚙️ Manage agents |
| `ai.chat.empty` | Napište zprávu, abychom začali. | Type a message to get started. |
| `ai.chat.toolsDisabled` | V této fázi (Phase 7) nemá agent přístup k nástrojům — pouze chat. | In this phase (Phase 7) the agent has no tool access — chat only. |
| `ai.chat.thinking` | Přemýšlí... | Thinking... |
| `ai.thread.newConversation` | + Nová konverzace | + New conversation |
| `ai.error.network` | Síťová chyba. Zkuste znovu. | Network error. Try again. |
| `ai.error.invalidApiKey` | Neplatný API klíč pro {provider}. | Invalid API key for {provider}. |
| `ai.error.mixedContent` | HTTP endpoint nelze volat z HTTPS stránky. Použijte lokální dev server. | HTTP endpoint cannot be called from HTTPS page. Use local dev server. |

### 5.3 Interpolation

Same `{name}` placeholder pattern as Phase 6 `presets.*` keys. Implementation:

```js
const msg = t('ai.agent.deleteConfirm').replace('{name}', agent.name);
```

### 5.4 Provider names

`PROVIDERS[key].name` ("Google AI", "OpenAI", etc.) are brand names — **not translated**.

### 5.5 Dynamic API messages

Provider error messages (e.g. Google AI's "API key invalid: ...") render in the provider's own language (typically EN). Our toasts wrap them: `t('ai.error.invalidApiKey').replace('{provider}', name) + '\n' + originalError`.

### 5.6 Re-render on language change

`languageChanged` event listener on:
- Chat panel (if open) → re-render labels and placeholders
- Settings modal (if open) → re-render labels and placeholders
- Launcher popover (if open) → re-render

Same pattern as Phase 6.

---

## 6. Edge cases, testing, and out-of-scope

### 6.1 Test suites (~36 new tests)

**`tests/test-suites/ai-chat-storage.test.js`** (~12 tests):
- `saveAgent` create + list returns it
- `saveAgent` upsert by id (preserves createdAt, bumps updatedAt)
- `deleteAgent` removes + cascading delete threads + messages
- `getAgent` for unknown id returns `null`
- `setFavorite` toggles `isFavorite` + updates `favoriteOrder`
- `listFavorites` filters + sorts by `favoriteOrder`
- `createThread` with first message creates both thread and `ai_messages_<id>`
- `appendMessage` updates `thread.updatedAt` and `messageCount`
- `listThreads(agentId)` filters by agent
- `deleteThread` removes thread + messages
- `getSettings` returns defaults if empty
- Corrupted JSON in any key → returns sensible default

**`tests/test-suites/ai-agent-manager.test.js`** (~6 tests):
- Create agent applies defaults (`provider=google`, `temp=0.7`, `isFavorite=true`)
- Update preserves id + createdAt, bumps updatedAt
- `listFavorites` order respects `favoriteOrder`
- `getEffectiveEndpoint(agent)` resolves `baseUrl || PROVIDERS[provider].endpoint`
- URL validation: rejects strings not starting with `http://` or `https://`
- Cascading delete propagation when removing agent

**`tests/test-suites/ai-client.test.js`** (~8 tests, mocked fetch):
- `chatCompletion` sends correct request body (model, messages, temperature)
- Adds `Authorization: Bearer` header only when apiKey present
- Returns parsed `{content, toolCalls}` for non-streaming responses
- Streaming yields chunks via AsyncIterator
- 401 → throws structured error `{status: 401, code: 'auth'}`
- 429 → throws with `code: 'rate_limit'`
- Network error → throws with `code: 'network'`
- `fetchModels` returns `Array<{id}>`

**`tests/test-suites/ai-ui-integration.test.js`** (~8 tests, headless DOM):
- Click `#aiSettingsBtn` → settings modal opens
- Empty state shows "no agents yet" message
- "+ Add agent" → form opens with default values
- Save valid form → agent appears in list
- Click launcher → popover with no agents shows "Create first" item
- After saving favorite agent → popover lists it
- Click on agent in popover → chat panel opens with agent name in header
- Sending message (with mocked AI client) → message appears in panel

**`tests/test-suites/ai-i18n.test.js`** (~2 tests):
- All ~57 `ai.*` keys present in both `cs` and `en` blocks
- No missing keys when iterating `[data-i18n]` elements in injected modal/panel

**Total: ~36 new tests.** Suite total: 481 + 36 = ~517.

### 6.2 What we don't test

| Out of scope | Reason |
|-------------|--------|
| Real provider API calls | No stable test API key in CI; mocked `fetch` covers logic |
| Streaming against real SSE | Mock chunks; manual smoke tests confirm real provider |
| CORS behaviour across browsers | Not consistently testable |
| Visual regression | No screenshot diff infrastructure |
| Performance / latency | Manual smoke checks |
| PWA offline cache validation | Cache wiring is a Task 15-style chore, not behavioural test |

### 6.3 Known limitations

- **Ollama from prod CDN**: not feasible due to mixed content. Use local dev server or HTTPS reverse proxy.
- **No backend = API keys live in browser IndexedDB.** Single-user PWA assumption. Anyone with browser access sees keys.
- **Cloudflare Pages = no server-side proxy.** All AI fetches are direct from browser. Some custom endpoints may have CORS issues — user-config problem, not our scope.
- **No client-side rate-limit guard.** Provider returns 429 → we toast it. Users manage their quotas.

### 6.4 Explicit out-of-scope reminder

| Feature | Scope phase |
|---------|-------------|
| Tool calling (function calls) | Phase 8 |
| BIM_checker tools (storage, validation, files) | Phase 8 |
| 3D viewer tools | Phase 9+ |
| Image / vision input | Unplanned |
| Token counting | Unplanned |
| Conversation export | On request |
| MCP server integration | On request |
| Prompt templates / quick actions | Phase 8 |
| Multi-message regenerate | Unplanned |
| Search across threads | Unplanned (until necessary) |

---

## 7. File touch list

### Created

| File | Purpose |
|------|---------|
| `assets/js/ai/ai-client.js` | OpenAI-compatible API client |
| `assets/js/ai/providers.js` | Provider registry |
| `assets/js/ai/agent-manager.js` | Agent CRUD wrapper |
| `assets/js/ai/tool-defs.js` | Tool definitions (empty stub in Phase 7) |
| `assets/js/ai/tool-executor.js` | Tool dispatch (stub returning `tools_disabled`) |
| `assets/js/ai/chat-storage.js` | IndexedDB CRUD |
| `assets/js/ai-ui/init.js` | Bootstraps launcher + navbar wiring |
| `assets/js/ai-ui/chat-panel.js` | Chat panel UI |
| `assets/js/ai-ui/settings-modal.js` | Settings modal UI |
| `assets/js/ai-ui/chat-launcher.js` | Bottom-right launcher + popover |
| `assets/js/ai-ui/chat-i18n-helpers.js` | i18n helpers (re-renders on language change) |
| `assets/css/ai-chat.css` | All AI UI styling |
| `tests/test-suites/ai-chat-storage.test.js` | Storage unit tests |
| `tests/test-suites/ai-agent-manager.test.js` | Agent manager unit tests |
| `tests/test-suites/ai-client.test.js` | API client unit tests with mocked fetch |
| `tests/test-suites/ai-ui-integration.test.js` | DOM integration tests |
| `tests/test-suites/ai-i18n.test.js` | i18n key coverage tests |

### Modified

| File | What changes |
|------|--------------|
| `pages/ids-ifc-validator.html` | Add `aiSettingsBtn` to navbar, ai-chat.css link, init.js script |
| `pages/ids-parser-visualizer.html` | Same |
| `pages/ifc-viewer-multi-file.html` | Same |
| `assets/js/common/translations.js` | 57 new keys × 2 languages |
| `tests/test-runner.html` | Register 5 new suite scripts |
| `eslint.config.js` | Add globals for new modules |
| `sw.js` | Cache version v14 → v15, add new files to ASSETS_TO_CACHE |
| `PLAN.md` | Phase 7 entry |
| `CHANGELOG.md` | `[0.3.0]` entry |

All of the above mirrored to `dist/`.

---

## 8. Estimated size

| Layer | Lines (approx) |
|-------|---------------|
| `assets/js/ai/*` (logic) | ~700 (port + adapt) |
| `assets/js/ai-ui/*` (UI) | ~1200 (port + thread sidebar + popover) |
| `assets/css/ai-chat.css` | ~500 |
| Tests | ~700 |
| HTML edits (3 pages × ~5 lines) | ~15 |
| Translations | ~120 (57 keys × 2 languages, formatted) |
| **Total** | **~3200 lines** |
