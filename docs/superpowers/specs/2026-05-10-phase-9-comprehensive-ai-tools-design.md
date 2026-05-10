# Phase 9: Comprehensive AI Tools — Design

**Status:** Draft for user review
**Date:** 2026-05-10
**Builds on:** Phase 8 (16 tools, OpenAI function calling, REGISTRY router)

## Goal

Give the AI agent access to every user-facing feature of BIM_checker:
- Theme + language switching, wizard launch, navigation enhancements
- Agent self-management (CRUD other agents — never the active one)
- Folder/file management beyond simple listing (create, rename, delete, move)
- Validation presets (named save/load/delete/apply)
- IDS deep-dive (specifications, requirements, facets) and IFC validation result drilldown
- IDS XML generation (create new IDS via the existing generator)
- bSDD lookup (gated by integration readiness)
- Misc: bug report, PWA install prompt

After Phase 9 the agent can drive a full BIM-checking workflow end-to-end through chat.

## Architecture (unchanged from Phase 8)

- Each tool lives in `assets/js/ai/tools/tool-<area>.js`, exports an async function plus a `register(registerFn)` hook.
- `tool-executor.js` calls every module's `register()` once at module load (`_bootstrap`); REGISTRY maps name → handler.
- `tool-defs.js` ships OpenAI-format function definitions in Czech for every tool.
- Tools are available from any page (cross-page strategy, established in Phase 8).
- Destructive operations call native `window.confirm()`; on cancel, return `{ cancelled: true }`.
- Error shape: `{ error: 'code', message: 'cs message' }`; never throw.
- Tests live in `tests/test-suites/tools-<area>.test.js`. No `.not` chaining. Each test isolates state via `_setCurrentPageForTest` / `_resetRegistryForTest` / mocks.

## Tool catalog (40 new tools)

### Tier A — User config & navigation (8 tools)
File: `tool-settings.js` (new), extends `tool-ui.js`

| Tool | Args | Behavior |
|---|---|---|
| `get_theme` | – | Returns `'light' \| 'dark'`. Reads `localStorage.theme` via existing ThemeManager. |
| `set_theme` | `theme: 'light'\|'dark'` | Calls `window.ThemeManager.setTheme(theme)`. |
| `get_language` | – | Returns active locale (`'cs'\|'en'`). |
| `set_language` | `lang: 'cs'\|'en'` | Calls `window.i18n.setLanguage(lang)`; triggers `languageChanged` event. |
| `start_wizard` | `page?: 'home'\|'validator'\|'parser'\|'viewer'` | Calls `window.WizardManager.start(page \|\| current)`. |
| `dismiss_wizard` | – | Calls `WizardManager.dismiss()`. |
| `install_pwa` | – | Triggers stored `beforeinstallprompt`. Returns `{ available: false }` if no prompt cached. |
| `open_bug_report` | `description?: string` | Opens the existing bug-report dialog with the description prefilled. User submits manually. (`window.BugReport.open()` takes no args today; tool prefills via DOM after open.) |

### Tier A — Agent self-management (4 tools)
File: `tool-agents.js` (new)

| Tool | Args | Behavior |
|---|---|---|
| `list_agents` | – | Returns array `[{ id, name, icon, model, provider }]`. Hides API keys. |
| `create_agent` | `name, model, provider, apiKey, systemPrompt?, temperature?, icon?` | Calls `chat-storage.createAgent`. Validates required fields. |
| `update_agent` | `id, ...partial` | Refuses with `error: 'cannot_modify_active'` if `id === currentAgentId`. Otherwise patches via `chat-storage.updateAgent`. |
| `delete_agent` | `id` | Same active-guard. Native `confirm()` before delete. Refuses to delete the last remaining agent (`error: 'last_agent'`). |

Note: the active-agent guard reads `currentAgentId` from chat-panel state. Implementation: chat-panel exposes `window.__currentAgentId` (or via existing settings store). The tool helper validates.

### Tier B — Folders & files (10 tools)
Extends `tool-storage.js` with mutating operations.

| Tool | Args | Behavior |
|---|---|---|
| `create_folder` | `type: 'ifc'\|'ids', name, parent?: string` | Wraps `BIMStorage.<type>Storage.createFolder`. `parent` defaults to `'root'`. Returns `{ folderId }`. |
| `rename_folder` | `type, folderId, newName` | Wraps `renameFolder`. Refuses on `'root'`. |
| `delete_folder` | `type, folderId` | Native `confirm()`. Refuses `'root'`. Cascades per existing `deleteFolder`. |
| `move_file` | `type, fileName, targetFolderName` | Resolves names to ids, calls `moveFile`. If folder name is ambiguous, returns `error: 'ambiguous_folder'` with candidate paths. |
| `move_files_batch` | `type, fileNames: string[], targetFolderName` | Sequential moves; returns `{ moved: [...], skipped: [{name, reason}] }`. |
| `download_file` | `type, name` | Returns `{ name, mimeType, base64 }`. Used by chat panel to offer a download link to the user. |
| `get_file_snippet` | `type, name, maxBytes?: number` | Returns first N bytes (default 8000) as text. Useful for the LLM to peek at file contents. |
| `get_file_summary` | `type, name` | For IFC: counts entities by top-level type, returns size + modifiedAt. For IDS: returns spec count + info block. |
| `apply_preset` | `presetName: string` | Sets last-session from preset, dispatches `ai:applyLastSession`, optionally navigates. Returns `{ applied: true, navigating?: bool }`. |
| `replace_file_content` | `type, name, content` | Replaces file content. Native `confirm()` first. |

### Tier B — Validation presets (4 tools)
File: `tool-presets.js` (new)

| Tool | Args | Behavior |
|---|---|---|
| `list_presets` | – | Returns `[{ id, name, groupCount, updatedAt }]` from `ValidationPresets.list()`. |
| `save_preset` | `name, useCurrentGroups?: boolean` | If `useCurrentGroups` and on validator: snapshot current `validationGroups`. Otherwise snapshot `loadLastSession`. Calls `ValidationPresets.save`. Returns `{ presetId }`. |
| `delete_preset` | `id` | Native `confirm()`. Wraps `ValidationPresets.delete(id)`. |
| `load_preset` | `id, andNavigate?: boolean` | Sets last-session from preset, dispatches event. If not on validator and `andNavigate`, also sets autorun flag and navigates. |

### Tier C — IDS / Validation deep-dive (6 tools)
Extends `tool-ids.js` and `tool-validator.js`.

| Tool | Args | Behavior |
|---|---|---|
| `get_specification_detail` | `idsFileName, specName \| specIndex` | Returns `{ name, applicability: [...], requirements: [...], cardinality, ifcVersion }`. Reads via `parseIDS`. |
| `get_facet_detail` | `idsFileName, specName, facetType, index` | Returns single facet (entity/attribute/property/...) full structure. |
| `get_validation_failures` | `groupIndex, ifcFileName?` | Page-locked to validator. Returns failed requirements grouped by spec, with entity/property breakdown. Top 50 failures, `truncated` flag. |
| `count_failures_by_requirement` | `groupIndex` | Page-locked. Returns `[{ specName, requirement, failed, total }]`. |
| `compare_ifc_files` | `fileNamesA: string[], fileNamesB: string[]` | Returns `{ a: { typeName: count, ... }, b: { ... }, delta: { typeName: bMinusA, ... } }`. Pure read-only. |
| `find_property_in_ifc` | `fileName, propertyName, value?` | Searches all entities for a property name (and optional exact value match). Returns up to 50 matches. |

### Tier C — IDS generation & ecosystem (6 tools)
Extends `tool-ids.js`. Some gated.

| Tool | Args | Gating |
|---|---|---|
| `generate_ids_skeleton` | `title, ifcVersion?, author? (email)` | Always available. Calls existing `IDSXMLGenerator.generate(...)`. |
| `add_specification_to_ids` | `idsFileName, name, applicabilityFacets, requirementFacets` | Available. Mutates an in-memory IDS object then writes back to storage. |
| `validate_ids_xml` | `idsFileName` | Calls `IDSXSDValidator.validate(content)`. Returns errors. |
| `bsdd_search` | `query, classificationUri?` | Gated: `error: 'integration_disabled'` until bSDD module ships. Returns `{ results: [...] }` once enabled. |
| `bsdd_get_property` | `uri` | Gated. Returns property details. |
| `export_validation_xlsx` | – | Page-locked to validator. Calls existing Excel export. Returns `{ filename }`. |

### Tier C — Misc (2 tools)
Extends `tool-ui.js` minimally; everything else is in the already-listed categories.

| Tool | Args | Behavior |
|---|---|---|
| `get_active_agent` | – | Returns `{ id, name, model, provider }` of the agent currently driving the chat. Lets the LLM know which agent is "self". |
| `request_user_attention` | `message: string` | Shows toast/notification (uses existing ErrorHandler.info or similar). For when AI needs to flag something the user might miss. |

## Sub-phase breakdown

### Phase 9a — User config + agents + navigation (13 tools, ~6 tasks)
Files: `tool-settings.js`, `tool-agents.js`, extend `tool-ui.js`.
- All Tier A "User config & navigation" tools (8)
- All Tier A "Agent self-management" tools (4)
- `get_active_agent` from misc (1)
- Active-agent guard plumbing (chat-panel exposes currentAgentId)

### Phase 9b — Storage, presets & file ops (15 tools, ~7 tasks)
Files: extend `tool-storage.js`, new `tool-presets.js`.
- All Tier B Folders & files (10)
- All Tier B Presets (4)
- `request_user_attention` (1) — depends on toast infra used in 9b for download links

### Phase 9c — Domain deep-dive + IDS gen + bSDD (12 tools, ~7 tasks)
Files: extend `tool-ids.js`, `tool-validator.js`, `tool-ifc.js`.
- All Tier C IDS/Validation deep-dive (6)
- All Tier C IDS gen & ecosystem (6) — bSDD tools shipped as gated stubs, real impl when bSDD module lands

Each sub-phase: own branch, own PR, own subagent-driven implementation cycle. Spec stays single source of truth.

## Cross-cutting concerns

### System prompt (per-agent, optional update)
Default system prompt for new agents (creatable via `create_agent`) gets a Phase 9 boilerplate listing key tool capabilities — agent ergonomics rather than a hard requirement. Existing agents are not auto-modified.

### Active-agent identification
Chat-panel module exposes the active agent id on `window.__bimAiActiveAgentId` (or via a getter on chat-storage). `tool-agents.js` reads it before any update/delete.

### Confirmations
Native `window.confirm()` for: `delete_folder`, `delete_agent`, `delete_preset`, `replace_file_content`. Returns `{ cancelled: true }` on dismiss. Mockable in tests via `window.confirm = () => true/false`.

### Error model (Phase 8 baseline carried forward)
- `unknown_tool` — router didn't find handler
- `wrong_page` — page-locked tool called from wrong page
- `validator_not_ready` — `validateAll` not bound on the page
- `not_found` — name doesn't resolve to a record
- `ambiguous_folder` — multiple folders match a name
- `last_agent` — refusal to delete the only remaining agent
- `cannot_modify_active` — agent CRUD targeted self
- `integration_disabled` — gated tool not yet wired (bSDD)
- `execution_error` — uncaught from handler, logged with stack

### Tool count budget
Phase 8 = 16. Phase 9 adds 40. Total 56. OpenAI tools array supports thousands; LLM context for definitions is the constraint. Czech descriptions are ~60-100 tokens each → ~3000-5000 token budget for definitions, well within model windows. No issue.

### Cross-page tools
Same strategy as Phase 8 hotfix: tools that require validator context use last-session preset + autorun flag for "set up here, run there" flows. Tools that only read state on the current page report `wrong_page`.

## Test plan

Per tool, minimum:
- Happy path
- Each error code that tool can return
- Confirmation dismissal (where applicable)

Plus integration tests:
- `chat-panel-tool-loop.test.js` updated count assertions: 16 → 29 (after 9a) → 44 (after 9b) → 56 (after 9c)
- `tool-executor.test.js`: spot-check that all categories register
- `tools-agents.test.js`: active-agent guard prevents self-mutation
- `tools-storage.test.js`: dedupe still passes (regression)

Target: ~120 new test cases. Phase 9a brings ~30, Phase 9b ~50, Phase 9c ~40.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM accidentally deletes user's agents/files | Native confirm() on every destructive op + active-agent guard |
| LLM creates infinite agent CRUD loop | Existing MAX_ITERATIONS=5 in chat-panel loop catches it |
| File replace_file_content corrupts IFC | Confirm + content size guard (warn if size delta > 50%) |
| bSDD network calls fail silently | Gated stub returns `error: 'integration_disabled'` until ready; not a Phase 9 blocker |
| Tool catalog too long for LLM | Czech descriptions tight; can swap to English for token-savings later if needed |
| Active agent id detection fails | Fall back to `error: 'cannot_determine_active'` rather than allowing modification |

## Out of scope (later phases)

- Multi-step workflow definition (saved AI macros)
- IFC writeback (creating/editing IFC entities through chat) — too risky without proper undo
- Real-time validation streaming (tool that returns partial validation updates)
- Phase 9 chat-heads UI (already deferred separately)

## Migration notes

- No breaking changes to Phase 8 tools.
- `tool-defs.js` grows from 16 entries to 56 (after 9a → 29, after 9b → 44, after 9c → 56).
- SW cache bumps once per sub-phase (v23 → v24 → v25 → v26).
- PLAN.md and CHANGELOG entries per sub-phase merge.
