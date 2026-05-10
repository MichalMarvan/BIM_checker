# Phase 8 — AI Tools / Function Calling Design

**Date:** 2026-05-09
**Status:** Approved (pending implementation plan)
**Branch target:** `phase-8-ai-tools`
**Predecessor:** Phase 7 (AI chat infrastructure) — chat shell, 5 providers, IndexedDB persistence, empty `tool-defs.js`, stub `tool-executor.js`

## Goal

Give AI agents real tools so they can manipulate BIM_checker on the user's behalf. Phase 7 ships chat-only — agents can talk but cannot do. Phase 8 wires up function calling end-to-end with **15 BIM_checker-specific tools** spanning storage management, validation workflow, IDS specifications, IFC content queries, and UI navigation.

The agent on any of the 4 pages (homepage, validator, parser, viewer) gets the same tool set. Cross-page mutations write to IndexedDB; the validator picks up changes via a `ai:applyLastSession` re-render event so the agent doesn't have to navigate the user just to add a group.

## Non-goals

| Feature | Reason | Future phase |
|---------|--------|--------------|
| 3D viewer tools (highlight, focus, search 3D) | 3D viewer integration not yet polished | Phase 10+ |
| Image / vision input | Multimodal | Unplanned |
| Per-agent tool subset | Every agent gets all 15 tools | Phase 9+ if needed |
| Cost tracking / token usage display | Out of scope for assistant feature | Unplanned |
| Custom user-defined tools / MCP plugins | Major architecture shift | Unplanned |
| Tool result streaming | Tool results delivered as one JSON blob | Unplanned |
| Multi-step undo | Users reverse manually | Unplanned |
| Excel / PDF export tools | Specialized; can add later | On request |

## Strategy

Phase 7 already ships the chat shell, OpenAI-compatible provider abstraction, IndexedDB persistence, and an empty `tool-defs.js` + stub `tool-executor.js`. Phase 8 fills the stubs and adds the iteration loop that consumes `tool_calls` from the API.

The hard part is not the loop — it's the **per-tool implementation** and a **cross-page strategy** that lets agents mutate validator state without forcing a page reload. We solve cross-page by making `add_validation_group` etc. write to the existing `validation-presets` last-session slot (built in Phase 6), and adding a single `ai:applyLastSession` event listener in `validator.js` that re-renders when the slot changes.

Tools are split into 6 sub-files by domain (storage, validator, ids, ifc, ui, helpers) for readability. A central `tool-executor.js` routes `tool_calls` to the right module via a flat REGISTRY. Heavy IFC content queries are backed by an LRU cache (max 3 parsed files) using the existing `IFCParserCore` module from Phase 4.

---

## 1. Architecture and file structure

### 1.1 Files to create

| File | Responsibility |
|------|---------------|
| `assets/js/ai/tools/_helpers.js` | `getCurrentPageId()`, LRU cache for parsed IFC files, `validateArgs()` schema check |
| `assets/js/ai/tools/tool-storage.js` | 2 storage tools (`list_storage_files`, `delete_file_from_storage`) |
| `assets/js/ai/tools/tool-validator.js` | 5 validator tools (`list_validation_groups`, `add_validation_group`, `delete_validation_group`, `run_validation`, `get_validation_results`) |
| `assets/js/ai/tools/tool-ids.js` | 1 IDS tool (`list_ids_specifications`) |
| `assets/js/ai/tools/tool-ifc.js` | 5 IFC content tools (`search_ifc_entities`, `get_entity_properties`, `count_entities_by_type`, `find_ifc_files_with_entity`, `get_property_value`) |
| `assets/js/ai/tools/tool-ui.js` | 2 UI tools (`get_current_page`, `navigate_to_page`) |

### 1.2 Files to modify

| File | What changes |
|------|--------------|
| `assets/js/ai/tool-defs.js` | Phase 7 stub `[]` → 15 OpenAI-format function definitions |
| `assets/js/ai/tool-executor.js` | Phase 7 stub → router that dispatches `tool_call` to the right module via flat REGISTRY |
| `assets/js/ai-ui/chat-panel.js` | Add tool-call loop (max 5 iterations); render tool-call bubbles inline |
| `assets/js/validator.js` | Add `ai:applyLastSession` event listener — when AI mutates last-session preset, validator re-renders without page reload |
| `assets/js/common/translations.js` | +5 keys × 2 langs = 10 entries under `ai.chat.tool*` |
| `tests/test-runner.html` | Register 8 new test suites |
| `sw.js` | `CACHE_VERSION` v18 → v19, add 6 tool sub-files to `ASSETS_TO_CACHE` |
| `eslint.config.js` | Globals as needed |
| `PLAN.md` | Phase 8 milestone entry |
| `CHANGELOG.md` | `[0.4.0]` entry |

All `assets/`, `pages/`, `sw.js` mirrored to `dist/`.

### 1.3 Tool-call loop placement

Lives **directly in `chat-panel.js`** rather than extracted to a separate service. The loop is small (~80 lines) and the surrounding state (current thread, abort controller, streaming UI) is already in `chat-panel.js`. Extracting would duplicate state.

If the loop grows beyond ~150 lines or needs to run from contexts other than the chat panel, we extract to `assets/js/ai/tool-loop.js` in a follow-up.

### 1.4 Module dependency graph

```
chat-panel.js
    ├─ ai-client.js (Phase 7)
    ├─ chat-storage.js (Phase 7)
    ├─ tool-defs.js  ← reads TOOL_DEFINITIONS
    └─ tool-executor.js
         ├─ tools/_helpers.js
         ├─ tools/tool-storage.js
         ├─ tools/tool-validator.js
         │   └─ validation-presets.js (Phase 6)
         ├─ tools/tool-ids.js
         │   └─ ids-parser.js
         ├─ tools/tool-ifc.js
         │   └─ ifc-parser-core.js (Phase 4)
         └─ tools/tool-ui.js
```

No circular imports. Each tool module imports only from `_helpers.js` and from existing project modules (BIMStorage, ValidationPresets, IFCParserCore, IDSParser).

---

## 2. Tool catalog (15 tools)

### 2.1 Tier 1 — Information access (read-only, available everywhere)

| # | Tool | Description (CZ, lives in tool-defs) | Parameters | Returns |
|---|------|--------------------------------------|------------|---------|
| 1 | `list_storage_files` | Vypíše všechny soubory v IndexedDB úložišti pro daný typ | `{type: 'ifc' \| 'ids'}` | `[{name, size, folder, modifiedAt}]` |
| 2 | `get_validation_results` | Vrátí poslední výsledky validace ze stránky Validator | `{}` | `{groups: [{ifcCount, idsName, passed, failed, total}]}` nebo `{empty: true}` |
| 3 | `list_ids_specifications` | Specifikace v IDS souboru | `{filename: string}` | `[{name, identifier, applicability, requirements}]` |
| 4 | `get_current_page` | Aktuální stránka aplikace | `{}` | `{page: 'home' \| 'validator' \| 'parser' \| 'viewer'}` |
| 5 | `list_validation_groups` | Aktuální validační skupiny | `{}` | `[{index, ifcFileNames, idsFileName, hasResults}]` |

### 2.2 Tier 2 — Workflow automation (writes; native `confirm()` for destructive)

| # | Tool | Description (CZ) | Parameters | Returns |
|---|------|------------------|------------|---------|
| 6 | `add_validation_group` | Přidá novou validační skupinu (IFC + IDS dle jmen) | `{ifcFileNames: string[], idsFileName: string}` | `{groupIndex, missingFiles?}` |
| 7 | `delete_validation_group` | Smaže validační skupinu | `{index: number}` | `{deleted: bool, cancelled?: bool}` |
| 8 | `run_validation` | Spustí validaci všech skupin | `{}` | `{started: true}` nebo `{error: 'wrong_page'}` |
| 9 | `navigate_to_page` | Přepne stránku (vyvolá page reload) | `{page: 'home' \| 'validator' \| 'parser' \| 'viewer'}` | `{navigating: true, target, warning}` |
| 10 | `delete_file_from_storage` | Smaže soubor z úložiště | `{type: 'ifc' \| 'ids', name: string}` | `{deleted: bool, cancelled?: bool}` |

`upload_file_to_storage` was originally in Tier 2 but is **deferred** — uploading requires a file picker which agent cannot drive directly. User uploads via existing UI; agent can `list_storage_files` to verify result. Cuts the scope to 15 tools cleanly.

### 2.3 Tier 3 — IFC content queries (read-only, heavy compute, LRU-cached)

| # | Tool | Description (CZ) | Parameters | Returns |
|---|------|------------------|------------|---------|
| 11 | `search_ifc_entities` | Najde entity podle IFC typu v souboru | `{filename: string, entityType: string}` | `{results: [{expressId, name, guid}], truncated?: bool}` (limit 50) |
| 12 | `get_entity_properties` | Plné PSets jedné entity | `{filename: string, expressId: number}` | `{entityType, name, guid, propertySets: [{name, properties: [...]}]}` |
| 13 | `count_entities_by_type` | Histogram IFC typů v souboru | `{filename: string}` | `{IfcWall: 12, IfcDoor: 5, ...}` |
| 14 | `find_ifc_files_with_entity` | Které soubory obsahují daný typ | `{entityType: string}` | `[{filename, count}]` |
| 15 | `get_property_value` | Konkrétní hodnota property | `{filename, expressId, psetName, propertyName}` | `{value, unit?}` nebo `{notFound: true}` |

### 2.4 Tool definition format (JSON Schema, OpenAI-compatible)

```js
{
    type: 'function',
    function: {
        name: 'list_storage_files',
        description: 'Vypíše všechny soubory v IndexedDB úložišti pro daný typ.',
        parameters: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['ifc', 'ids'], description: 'Typ souborů' }
            },
            required: ['type']
        }
    }
}
```

Same shape for all 15 tools. Descriptions in Czech (matches Phase 7 system prompt language). Modern providers handle Czech tool descriptions cleanly.

---

## 3. Cross-page strategy

The agent is available on all 4 pages. Tools that mutate validator state (`add_validation_group`, `delete_validation_group`) need to work whether the user is on the validator page or not.

### 3.1 Two-mode execution per write tool

**On validator page** — call existing project APIs directly:
1. Mutate the current `validationGroups` array via the same path the user's clicks would take
2. Re-render via `renderValidationGroups()`
3. The Phase 6 `saveLastSession` debounced hook in `renderValidationGroups()` already persists to IDB

**Off validator page** — write to the `validation-presets` last-session slot directly:
1. Read current last session via `ValidationPresets.loadLastSession()`
2. Apply the mutation in memory (push group, splice index, etc.)
3. Write back via `ValidationPresets.saveLastSession()` + `flushLastSession()`
4. Validator's auto-restore (Phase 6) picks up changes when user navigates there

### 3.2 Re-render event for on-page tools

Even when on the validator page, tools should not duplicate the entire `addValidationGroup → file-attach → render` flow. Instead, all write tools follow the **same pattern**:

1. Update `last_session` preset in IndexedDB (works regardless of page)
2. Dispatch `ai:applyLastSession` custom event (via `window.dispatchEvent`)
3. If validator.js is loaded on the current page, its listener picks up the event and re-renders

`validator.js` listener (added in this phase):

```js
window.addEventListener('ai:applyLastSession', async () => {
    const last = await ValidationPresets.loadLastSession();
    if (!last) return;
    validationGroups.length = 0;
    const hydrated = await ValidationPresets.fromPresetGroups(last.groups);
    for (const g of hydrated) validationGroups.push(g);
    renderValidationGroups();
    updateValidateButton();
});
```

This is the same logic as Phase 6's auto-restore on DOMContentLoaded — refactored to a function that the listener also calls.

### 3.3 `run_validation` is page-locked

Validation requires the validator's worker pool, IDS XSD validator, and runtime. None of that loads on other pages. Tool returns `{error: 'wrong_page', message: 'Pro spuštění validace navigujte na Validator (zavolejte navigate_to_page).'}` and the agent can chain `navigate_to_page('validator')` if appropriate.

### 3.4 Page detection

URL path heuristic in `_helpers.getCurrentPageId()`:
- `/` or `/index.html` → `home`
- contains `ids-ifc-validator` → `validator`
- contains `ids-parser-visualizer` → `parser`
- contains `ifc-viewer-multi-file` → `viewer`
- otherwise → `unknown`

---

## 4. Tool execution loop

The OpenAI-compatible API protocol:

1. Client sends user message + `tools[]` array
2. Provider responds with either:
   - `finish_reason: "stop"` + content → done
   - `finish_reason: "tool_calls"` + array of tool calls → execute, send results back
3. Each tool call has `{id, type:'function', function:{name, arguments(JSON string)}}`
4. Client sends new request with the assistant's message AND `role:'tool'` messages keyed by `tool_call_id`
5. Loop until `stop` or max iterations

### 4.1 Loop pseudocode (in `chat-panel.js _send`)

```js
let iteration = 0;
const MAX_ITERATIONS = 5;
let messages = await _buildMessages();

while (iteration < MAX_ITERATIONS) {
    iteration++;

    const result = await chatCompletion(endpoint, agent.apiKey, agent.model,
        messages, TOOL_DEFINITIONS, {
            temperature: agent.temperature,
            signal: _state.abort.signal,
            onStream: (delta, full) => _renderAssistantStreaming(full)
        });

    const choice = result?.choices?.[0];
    const finishReason = choice?.finish_reason;
    const assistantMsg = choice?.message;

    await storage.appendMessage(_state.threadId, assistantMsg);
    messages.push(assistantMsg);

    if (finishReason !== 'tool_calls') {
        _finalizeAssistantBubble(assistantMsg.content);
        break;
    }

    const toolCalls = assistantMsg.tool_calls || [];
    _renderToolCallIndicator(toolCalls);

    const results = await Promise.all(
        toolCalls.map(tc => _executeOneToolCall(tc))
    );

    for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const toolMsg = {
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify(results[i])
        };
        await storage.appendMessage(_state.threadId, toolMsg);
        messages.push(toolMsg);
    }

    _renderToolCallsResolved(toolCalls, results);
}

if (iteration >= MAX_ITERATIONS) {
    _finalizeAssistantBubble(t('ai.chat.maxIterations'));
}
```

### 4.2 Tool-call bubble UI

Tool calls display **inline between user message and final AI text**. Visual treatment: subtle gray background, monospace font for `name(args)` line, smaller text. Pattern from bim-ai-viewer.

Render order in messages area:
1. User bubble (right-aligned, primary color)
2. Tool-call bubble (left, gray) — "🔧 Volám nástroj: search_ifc_entities, args: {filename: 'building.ifc', entityType: 'IfcWall'}"
3. Tool-result bubble (left, gray) — "✓ Vrátilo: 12 entit"
4. (Repeat 2-3 if multiple iterations)
5. Assistant bubble (left, secondary background) — final text

Tool-call bubbles **persist** across thread reloads — they're stored as `role: 'tool'` messages in IndexedDB. When re-rendering thread, special render path detects `assistantMsg.tool_calls` and pairs with following `role: 'tool'` messages.

### 4.3 Cancellation

User closes chat panel mid-loop → `_state.abort.abort()` (existing Phase 7 behavior). The next `chatCompletion` rejects with `AbortError`. Loop catches and exits silently (Phase 7 already swallows AbortError). Pending tool executions ARE NOT cancelled — Promise.all waits — but their results are discarded (no further iteration).

### 4.4 Error handling per tool call

Each tool call is wrapped in try/catch in `_executeOneToolCall`:

- `JSON.parse` of arguments fails → `{error: 'invalid_arguments', details: e.message}`
- Tool throws → `{error: 'execution_error', message: e.message, tool: name}`
- Tool not in REGISTRY → `{error: 'unknown_tool', name}`

Errors are passed back as the tool result, the LLM sees them and can recover (try different params, give up gracefully, etc.).

---

## 5. Per-tool implementation details

### 5.1 Shared helpers

```js
// _helpers.js

export function getCurrentPageId() {
    const path = location.pathname;
    if (path.endsWith('/') || path.endsWith('/index.html')) return 'home';
    if (path.includes('ids-ifc-validator')) return 'validator';
    if (path.includes('ids-parser-visualizer')) return 'parser';
    if (path.includes('ifc-viewer-multi-file')) return 'viewer';
    return 'unknown';
}

// LRU cache (max 3 parsed IFC files)
const _ifcParseCache = new Map();
const MAX_CACHE = 3;

export async function getParsedIfc(filename) {
    if (_ifcParseCache.has(filename)) {
        const v = _ifcParseCache.get(filename);
        _ifcParseCache.delete(filename);
        _ifcParseCache.set(filename, v);
        return v.entities;
    }
    await BIMStorage.init();
    const meta = await BIMStorage.getFile('ifc', filename);
    if (!meta) throw new Error(`File not found: ${filename}`);
    const content = await BIMStorage.getFileContent('ifc', meta.id);
    const entities = await parseIFCFileAsync(content, filename);

    if (_ifcParseCache.size >= MAX_CACHE) {
        const oldest = _ifcParseCache.keys().next().value;
        _ifcParseCache.delete(oldest);
    }
    _ifcParseCache.set(filename, { entities, parsedAt: Date.now() });
    return entities;
}

export function validateArgs(args, schema) {
    for (const [key, def] of Object.entries(schema)) {
        if (def.required && (args[key] === undefined || args[key] === null)) {
            throw new Error(`Missing required arg: ${key}`);
        }
        if (args[key] !== undefined && def.enum && !def.enum.includes(args[key])) {
            throw new Error(`Invalid value for ${key}: must be one of ${def.enum.join(', ')}`);
        }
    }
}

// Test-only — lets test suites pin a page identity
export function _setCurrentPageForTest(id) { _testPageOverride = id; }
let _testPageOverride = null;
```

### 5.2 Storage tools (example)

```js
// tool-storage.js
import * as helpers from './_helpers.js';

export async function list_storage_files(args) {
    helpers.validateArgs(args, { type: { required: true, enum: ['ifc', 'ids'] } });
    await BIMStorage.init();
    const files = await BIMStorage.getFiles(args.type);
    return files.map(f => ({
        name: f.name, size: f.size, folder: f.folderId, modifiedAt: f.modifiedAt
    }));
}

export async function delete_file_from_storage(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (!confirm(`Smazat soubor '${args.name}' z úložiště?`)) return { cancelled: true };
    await BIMStorage.init();
    const file = await BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    await BIMStorage.deleteFile(args.type, file.id);
    return { deleted: true };
}

```

`upload_file_to_storage` and `get_file_info` were considered but are **NOT in the catalog**:
- `upload_file_to_storage` — agents cannot drive a file picker from JS without user gesture.
- `get_file_info` — `list_storage_files` already returns metadata for all files; per-file lookup is duplicate. Reduces catalog to a clean 15.

### 5.3 Validator tools — unified dispatch

All validator write tools follow the same recipe:

1. Validate args
2. Read last-session via `ValidationPresets.loadLastSession()`
3. Apply mutation in memory
4. Write back via `ValidationPresets.saveLastSession()` + `flushLastSession()`
5. Dispatch `ai:applyLastSession` event
6. Return result

```js
// tool-validator.js
export async function add_validation_group(args) {
    helpers.validateArgs(args, {
        ifcFileNames: { required: true },
        idsFileName: { required: true }
    });
    const last = (await ValidationPresets.loadLastSession()) || { groups: [] };
    last.groups.push({
        ifcFileNames: args.ifcFileNames,
        idsFileName: args.idsFileName
    });
    ValidationPresets.saveLastSession(last.groups);
    ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return {
        groupIndex: last.groups.length - 1,
        appliedTo: helpers.getCurrentPageId() === 'validator'
            ? 'live UI'
            : 'last-session preset (visible after navigating to Validator)'
    };
}

export async function delete_validation_group(args) {
    helpers.validateArgs(args, { index: { required: true } });
    if (!confirm(`Smazat validační skupinu #${args.index + 1}?`)) return { cancelled: true };
    const last = (await ValidationPresets.loadLastSession()) || { groups: [] };
    if (args.index < 0 || args.index >= last.groups.length) return { error: 'index_out_of_range' };
    last.groups.splice(args.index, 1);
    ValidationPresets.saveLastSession(last.groups);
    ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return { deleted: true };
}

export async function run_validation(args) {
    if (helpers.getCurrentPageId() !== 'validator') {
        return {
            error: 'wrong_page',
            message: 'Pro spuštění validace navigujte na Validator (zavolejte navigate_to_page).'
        };
    }
    if (typeof window.validateAll !== 'function') return { error: 'validator_not_ready' };
    window.validateAll();
    return { started: true, message: 'Validace spuštěna. Výsledky uvidíte v panelu.' };
}

export async function get_validation_results(args) {
    if (helpers.getCurrentPageId() !== 'validator') {
        return { error: 'wrong_page', message: 'Výsledky jsou viditelné jen na stránce Validator.' };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { empty: true, message: 'Validace nebyla spuštěna nebo výsledky chybí.' };
    }
    return {
        groups: window.validationResults.map((r, i) => ({
            index: i,
            ifcCount: r.ifcFiles?.length || 0,
            idsName: r.idsFile?.name,
            passed: r.summary?.passed || 0,
            failed: r.summary?.failed || 0,
            total: r.summary?.total || 0
        }))
    };
}

export async function list_validation_groups(args) {
    const last = (await ValidationPresets.loadLastSession()) || { groups: [] };
    return last.groups.map((g, i) => ({
        index: i,
        ifcFileNames: g.ifcFileNames,
        idsFileName: g.idsFileName,
        hasResults: false  // resultStatus is page-only; for cross-page accuracy we'd query window.validationResults
    }));
}
```

### 5.4 IFC tools — LRU cache backed

```js
// tool-ifc.js
import * as helpers from './_helpers.js';

export async function search_ifc_entities(args) {
    helpers.validateArgs(args, { filename: { required: true }, entityType: { required: true } });
    const entities = await helpers.getParsedIfc(args.filename);
    const target = args.entityType.toUpperCase();
    const all = entities.filter(e => e.entity?.toUpperCase() === target);
    const matches = all.slice(0, 50).map(e => ({
        expressId: e.id, name: e.name, guid: e.guid
    }));
    return {
        results: matches,
        truncated: all.length > 50,
        totalCount: all.length
    };
}

export async function count_entities_by_type(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    const entities = await helpers.getParsedIfc(args.filename);
    const counts = {};
    for (const e of entities) {
        const type = e.entity || 'Unknown';
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

// get_entity_properties, find_ifc_files_with_entity, get_property_value — analogous patterns
```

### 5.5 UI tools

```js
// tool-ui.js
import * as helpers from './_helpers.js';

export async function get_current_page(args) {
    return { page: helpers.getCurrentPageId() };
}

export async function navigate_to_page(args) {
    helpers.validateArgs(args, {
        page: { required: true, enum: ['home', 'validator', 'parser', 'viewer'] }
    });
    const pathMap = {
        home: '/index.html',
        validator: '/pages/ids-ifc-validator.html',
        parser: '/pages/ids-parser-visualizer.html',
        viewer: '/pages/ifc-viewer-multi-file.html'
    };
    setTimeout(() => { window.location.href = pathMap[args.page]; }, 100);
    return {
        navigating: true,
        target: args.page,
        warning: 'Stránka se nyní přesměruje. Chat panel se zavře, otevřete jej znovu po načtení.'
    };
}
```

### 5.6 IDS tool

```js
// tool-ids.js
export async function list_ids_specifications(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    await BIMStorage.init();
    const meta = await BIMStorage.getFile('ids', args.filename);
    if (!meta) return { error: 'not_found' };
    const content = await BIMStorage.getFileContent('ids', meta.id);
    const parsed = await IDSParser.parse(content);
    return parsed.specifications.map(s => ({
        name: s.name,
        identifier: s.identifier,
        applicability: s.applicability?.facets?.map(f => f.type) || [],
        requirements: s.requirements?.facets?.length || 0
    }));
}
```

### 5.7 Tool-executor router

```js
// tool-executor.js
import * as storage from './tools/tool-storage.js';
import * as validator from './tools/tool-validator.js';
import * as ids from './tools/tool-ids.js';
import * as ifc from './tools/tool-ifc.js';
import * as ui from './tools/tool-ui.js';

const REGISTRY = {
    list_storage_files: storage.list_storage_files,
    delete_file_from_storage: storage.delete_file_from_storage,

    list_validation_groups: validator.list_validation_groups,
    add_validation_group: validator.add_validation_group,
    delete_validation_group: validator.delete_validation_group,
    run_validation: validator.run_validation,
    get_validation_results: validator.get_validation_results,

    list_ids_specifications: ids.list_ids_specifications,

    search_ifc_entities: ifc.search_ifc_entities,
    get_entity_properties: ifc.get_entity_properties,
    count_entities_by_type: ifc.count_entities_by_type,
    find_ifc_files_with_entity: ifc.find_ifc_files_with_entity,
    get_property_value: ifc.get_property_value,

    get_current_page: ui.get_current_page,
    navigate_to_page: ui.navigate_to_page
};

export async function executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall;
    const fn = REGISTRY[name];
    if (!fn) return { error: 'unknown_tool', name };
    try {
        return await fn(args);
    } catch (e) {
        return { error: 'execution_error', message: e.message, tool: name };
    }
}
```

---

## 6. Internationalization

5 new keys × CZ + EN = 10 entries appended to existing `assets/js/common/translations.js`:

| Key | CZ | EN |
|-----|----|----|
| `ai.chat.toolCalling` | Volám nástroj | Calling tool |
| `ai.chat.toolReturned` | Vrátilo | Returned |
| `ai.chat.toolFailed` | Chyba nástroje | Tool error |
| `ai.chat.toolCancelled` | Akce zrušena | Action cancelled |
| `ai.chat.maxIterations` | Příliš mnoho iterací nástrojů — agent se zacyklil. Zkuste přeformulovat dotaz. | Too many tool iterations — agent in loop. Try rephrasing. |

Tool definition descriptions (`function.description` field in JSON Schema) are NOT i18n keys — they're hardcoded Czech strings in `tool-defs.js`. The provider sends them to the model verbatim; the model uses them to choose tools and produces final answers in the user's language (controlled by the agent's system prompt). Putting tool descriptions through the i18n layer would require re-uploading translations to the model on every language switch, which is overkill for Phase 8.

Confirm dialog texts (`Smazat soubor 'X'?`) are hardcoded Czech in tool implementations — could be migrated to i18n keys later if EN-only users complain. Out of scope for Phase 8.

---

## 7. Edge cases, testing, out-of-scope

### 7.1 Test suites (~59 tests)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `tools-helpers.test.js` | ~6 | LRU eviction, page detection, args validation |
| `tools-storage.test.js` | ~10 | 4 storage tools — happy paths, missing files, confirm cancel |
| `tools-validator.test.js` | ~12 | 5 validator tools — on-page vs off-page paths |
| `tools-ids.test.js` | ~3 | 1 IDS tool — load + parse |
| `tools-ifc.test.js` | ~12 | 5 IFC tools — cache hit/miss, truncation |
| `tools-ui.test.js` | ~5 | 2 UI tools — page detect, navigate stub |
| `tool-executor.test.js` | ~5 | Router — unknown tool, error wrap |
| `chat-panel-tool-loop.test.js` | ~6 | Loop integration — single, multi, max-iterations, abort |

Total ~59 new tests. Suite total: 527 (Phase 7) + 59 = ~586.

### 7.2 Mocking strategy

- **BIMStorage** — real IndexedDB in headless Chromium; `beforeEach` seeds known fixtures, clears between tests.
- **Validator window functions** (`validateAll`, `addValidationGroup`) — replaced with simple spy functions during validator tool tests.
- **`location.pathname`** — cannot mutate directly; use `_helpers._setCurrentPageForTest(id)` test-only export.
- **IFC content** — inline minimal valid IFC string (~30 lines, 2 IfcWalls + 1 IfcDoor). Avoids fixture file noise.
- **`fetch`** — same mock pattern as Phase 7 ai-client tests for the loop integration tests.
- **`confirm`** — `window.confirm = () => true` (or `false`) injected per test.

### 7.3 What we don't test

- Real LLM calls — no API key in CI; loop tests use mocked fetch responses.
- Cross-page navigation behavior — `navigate_to_page` triggers reload that puppeteer can't resume.
- Visual regression of tool-call bubbles — no screenshot diff infra.
- Performance benchmarks of IFC parse cache hit ratios — measured manually via DevTools if needed.

### 7.4 Performance expectations

| Tool | Latency | Notes |
|------|---------|-------|
| Tier 1 (read) | < 50 ms | IndexedDB read |
| `add_validation_group` | < 100 ms | IDB write + event dispatch |
| `run_validation` | seconds–minutes | Triggers existing worker pool |
| `search_ifc_entities` (cache miss) | 500 ms – 2 s | Worker IFC parse |
| `search_ifc_entities` (cache hit) | < 5 ms | LRU memory |
| `get_property_value` (cache miss) | 500 ms – 2 s | Same as parse |

LRU cache holds **max 3 parsed files** — 4th access evicts the LRU oldest. For typical workflows (user asks several questions about the same file), cache hit rate should be ~90% after the first query.

### 7.5 Out-of-scope reminder

| Feature | Phase |
|---------|-------|
| 3D viewer tools (highlight, focus, search) | Phase 10+ |
| Image / vision input | Unplanned |
| Per-agent tool subset | Phase 9+ if needed |
| Cost tracking / token usage display | Unplanned |
| Custom user-defined tools / MCP plugins | Unplanned |
| Tool result streaming | Unplanned |
| Multi-step undo | Unplanned |
| Excel / PDF export tools | On request |

---

## 8. File touch list

### Created (~14 files)

| Path | Purpose |
|------|---------|
| `assets/js/ai/tools/_helpers.js` | LRU cache, page detection, args validation |
| `assets/js/ai/tools/tool-storage.js` | 2 storage tools (list, delete) |
| `assets/js/ai/tools/tool-validator.js` | 5 validator tools |
| `assets/js/ai/tools/tool-ids.js` | 1 IDS tool |
| `assets/js/ai/tools/tool-ifc.js` | 5 IFC content tools |
| `assets/js/ai/tools/tool-ui.js` | 2 UI tools |
| `tests/test-suites/tools-helpers.test.js` | Helper unit tests |
| `tests/test-suites/tools-storage.test.js` | Storage tools tests |
| `tests/test-suites/tools-validator.test.js` | Validator tools tests |
| `tests/test-suites/tools-ids.test.js` | IDS tool tests |
| `tests/test-suites/tools-ifc.test.js` | IFC tools tests |
| `tests/test-suites/tools-ui.test.js` | UI tools tests |
| `tests/test-suites/tool-executor.test.js` | Router tests |
| `tests/test-suites/chat-panel-tool-loop.test.js` | Loop integration tests |

### Modified

| Path | What changes |
|------|--------------|
| `assets/js/ai/tool-defs.js` | 15 OpenAI-format function definitions |
| `assets/js/ai/tool-executor.js` | REGISTRY router |
| `assets/js/ai-ui/chat-panel.js` | Tool-call loop + bubble rendering |
| `assets/js/validator.js` | `ai:applyLastSession` event listener |
| `assets/js/common/translations.js` | +10 entries |
| `tests/test-runner.html` | Register 8 new test suites |
| `eslint.config.js` | New globals |
| `sw.js` | v18 → v19, cache 6 tool sub-files |
| `PLAN.md` | Phase 8 entry |
| `CHANGELOG.md` | `[0.4.0]` entry |

All under `assets/`, `pages/`, `sw.js` mirrored to `dist/`.

---

## 9. Estimated size

| Layer | LOC (approx) |
|-------|--------------|
| `assets/js/ai/tools/*` (6 files, 15 implementations + helpers) | ~750 |
| `tool-defs.js` (15 definitions) | ~200 |
| `tool-executor.js` (router) | ~50 |
| `chat-panel.js` loop + tool-call bubble UI | ~150 |
| `validator.js` event listener + extracted apply function | ~30 |
| Translations | ~30 |
| **Tests** (8 suites × avg 80 LOC) | ~640 |
| HTML edits (test-runner) | ~10 |
| sw.js + docs | ~30 |
| **Total** | **~1880 LOC** |

Smaller than Phase 7 (~3200 LOC) and slightly larger than Phase 6 (~1500 LOC). Reasonable Phase 8 scope.

---

## 10. Compatibility with later phases

**Phase 9 (chat-heads UI)** — pure visual changes to the chat panel position/state. Tool loop logic is unaffected.

**Phase 10+ (3D viewer tools)** — adds new entries to REGISTRY in `tool-executor.js` and a new `tools/tool-viewer.js` file. The architecture set up in Phase 8 (sub-file per domain, flat REGISTRY) accommodates this cleanly.

If Phase 11+ adds **per-agent tool subset filtering**, `getToolsForAgent(agent)` in `tool-defs.js` (currently returns all definitions) becomes the filtering point. No structural change needed.
