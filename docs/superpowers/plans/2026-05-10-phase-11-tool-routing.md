# Phase 11: Per-agent Tool Routing + Preset Agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snížit payload Gemini requestů (z ~16k tokenů na ~2-5k pro vybrané use cases) přidáním `agent.enabledTools` whitelist + 6 předdefinovaných preset agentů + Settings UI tool pickeru organizovaného do 9 kategorií.

**Architecture:** Nová data soubora `tool-catalog.js` (kategorizace 56 toolů) a `agent-presets.js` (6 presetů s rolí-specific systemPrompt + tool subset). `chat-panel._send` filtruje `TOOL_DEFINITIONS` před API call podle `agent.enabledTools`. Settings UI rozšířený o accordion picker s per-category toggles a "Start from preset" dropdown při create-mode.

**Tech Stack:** Vanilla JS ES6 modules, IndexedDB (existing chat-storage), CSS accordion s `<details>` element, Puppeteer test runner.

**Branch:** `phase-11-tool-routing` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-10-phase-11-tool-routing-presets-design.md`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/tool-catalog.js` | **Create** | TOOL_CATEGORIES (9 cats covering all 56 tools) + getAllToolNames, getCategoryForTool, TOTAL_TOOLS |
| `assets/js/ai/agent-presets.js` | **Create** | AGENT_PRESETS (6 entries) + getPreset(id) |
| `assets/js/ai-ui/chat-panel.js` | Modify | `_send` filtruje TOOL_DEFINITIONS podle `agent.enabledTools` před `chatCompletion` |
| `assets/js/ai/tools/tool-agents.js` | Modify | `_safeAgent` zahrne `enabledTools` field |
| `assets/js/ai-ui/settings-modal.js` | Modify | Tool picker accordion + counter + "Start from preset" dropdown; save logic |
| `assets/js/common/translations.js` | Modify | +~70 i18n keys (categories, preset names, tool labels, form labels) CZ + EN |
| `assets/css/ai-chat.css` | Modify | `.agent-form__tool-picker`, `.tool-picker-category`, related styles |
| `dist/...` | Mirror | Each via `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v34 → v35; add `tool-catalog.js` + `agent-presets.js` to ASSETS_TO_CACHE |
| `tests/test-suites/tool-routing.test.js` | **Create** | ~8 tests covering catalog + presets + filter logic |
| `tests/test-suites/settings-picker.test.js` | **Create** | ~6 tests for Settings UI picker |
| `tests/test-runner.html` | Modify | 2 new script tags |
| `PLAN.md` | Modify | Phase 11 entry |
| `CHANGELOG.md` | Modify | `[0.9.0]` |

---

## Cross-cutting conventions

- ES6 modules, dist mirror via `cp` after every edit
- Test framework: no `.not` chaining
- Czech messages on user-visible errors
- Storage shape: existing agents have `enabledTools: undefined` → backward compat (filter sends all 56)

### Tool catalog breakdown (verified by grep)

| Category | Count | Tool names |
|---|---|---|
| Settings | 8 | get_theme, set_theme, get_language, set_language, start_wizard, dismiss_wizard, install_pwa, open_bug_report |
| Agents | 5 | list_agents, get_active_agent, create_agent, update_agent, delete_agent |
| Storage | 12 | list_storage_files, list_storage_folders, delete_file_from_storage, create_folder, rename_folder, delete_folder, move_file, move_files_batch, download_file, get_file_snippet, get_file_summary, replace_file_content |
| Presets | 5 | list_presets, save_preset, delete_preset, load_preset, apply_preset |
| Validation | 8 | list_validation_groups, add_validation_group, delete_validation_group, run_validation, get_validation_results, get_validation_failures, count_failures_by_requirement, export_validation_xlsx |
| IDS | 6 | list_ids_specifications, get_specification_detail, get_facet_detail, generate_ids_skeleton, add_specification_to_ids, validate_ids_xml |
| IFC | 7 | search_ifc_entities, count_entities_by_type, find_ifc_files_with_entity, get_entity_properties, get_property_value, compare_ifc_files, find_property_in_ifc |
| bSDD | 2 | bsdd_search, bsdd_get_property |
| Misc | 3 | get_current_page, navigate_to_page, request_user_attention |
| **Total** | **56** | |

---

## Task 1: tool-catalog.js — single source of truth for categorization

**Files:**
- Create: `assets/js/ai/tool-catalog.js`
- Create: `tests/test-suites/tool-routing.test.js` (start with catalog tests)
- Modify: `tests/test-runner.html` (add script tag)

- [ ] **Step 1: Create assets/js/ai/tool-catalog.js**

```js
/**
 * Single source of truth for tool categorization.
 * Used by Settings tool picker and (future) AI help modal.
 * Tool names match exactly the `function.name` values in tool-defs.js.
 */

export const TOOL_CATEGORIES = [
    {
        id: 'settings',
        icon: '⚙️',
        labelKey: 'ai.category.settings',
        tools: [
            { name: 'get_theme', labelKey: 'ai.tool.get_theme.label' },
            { name: 'set_theme', labelKey: 'ai.tool.set_theme.label' },
            { name: 'get_language', labelKey: 'ai.tool.get_language.label' },
            { name: 'set_language', labelKey: 'ai.tool.set_language.label' },
            { name: 'start_wizard', labelKey: 'ai.tool.start_wizard.label' },
            { name: 'dismiss_wizard', labelKey: 'ai.tool.dismiss_wizard.label' },
            { name: 'install_pwa', labelKey: 'ai.tool.install_pwa.label' },
            { name: 'open_bug_report', labelKey: 'ai.tool.open_bug_report.label' }
        ]
    },
    {
        id: 'agents',
        icon: '🤖',
        labelKey: 'ai.category.agents',
        tools: [
            { name: 'list_agents', labelKey: 'ai.tool.list_agents.label' },
            { name: 'get_active_agent', labelKey: 'ai.tool.get_active_agent.label' },
            { name: 'create_agent', labelKey: 'ai.tool.create_agent.label' },
            { name: 'update_agent', labelKey: 'ai.tool.update_agent.label' },
            { name: 'delete_agent', labelKey: 'ai.tool.delete_agent.label' }
        ]
    },
    {
        id: 'storage',
        icon: '📁',
        labelKey: 'ai.category.storage',
        tools: [
            { name: 'list_storage_files', labelKey: 'ai.tool.list_storage_files.label' },
            { name: 'list_storage_folders', labelKey: 'ai.tool.list_storage_folders.label' },
            { name: 'delete_file_from_storage', labelKey: 'ai.tool.delete_file_from_storage.label' },
            { name: 'create_folder', labelKey: 'ai.tool.create_folder.label' },
            { name: 'rename_folder', labelKey: 'ai.tool.rename_folder.label' },
            { name: 'delete_folder', labelKey: 'ai.tool.delete_folder.label' },
            { name: 'move_file', labelKey: 'ai.tool.move_file.label' },
            { name: 'move_files_batch', labelKey: 'ai.tool.move_files_batch.label' },
            { name: 'download_file', labelKey: 'ai.tool.download_file.label' },
            { name: 'get_file_snippet', labelKey: 'ai.tool.get_file_snippet.label' },
            { name: 'get_file_summary', labelKey: 'ai.tool.get_file_summary.label' },
            { name: 'replace_file_content', labelKey: 'ai.tool.replace_file_content.label' }
        ]
    },
    {
        id: 'presets',
        icon: '📋',
        labelKey: 'ai.category.presets',
        tools: [
            { name: 'list_presets', labelKey: 'ai.tool.list_presets.label' },
            { name: 'save_preset', labelKey: 'ai.tool.save_preset.label' },
            { name: 'delete_preset', labelKey: 'ai.tool.delete_preset.label' },
            { name: 'load_preset', labelKey: 'ai.tool.load_preset.label' },
            { name: 'apply_preset', labelKey: 'ai.tool.apply_preset.label' }
        ]
    },
    {
        id: 'validation',
        icon: '✓',
        labelKey: 'ai.category.validation',
        tools: [
            { name: 'list_validation_groups', labelKey: 'ai.tool.list_validation_groups.label' },
            { name: 'add_validation_group', labelKey: 'ai.tool.add_validation_group.label' },
            { name: 'delete_validation_group', labelKey: 'ai.tool.delete_validation_group.label' },
            { name: 'run_validation', labelKey: 'ai.tool.run_validation.label' },
            { name: 'get_validation_results', labelKey: 'ai.tool.get_validation_results.label' },
            { name: 'get_validation_failures', labelKey: 'ai.tool.get_validation_failures.label' },
            { name: 'count_failures_by_requirement', labelKey: 'ai.tool.count_failures_by_requirement.label' },
            { name: 'export_validation_xlsx', labelKey: 'ai.tool.export_validation_xlsx.label' }
        ]
    },
    {
        id: 'ids',
        icon: '📐',
        labelKey: 'ai.category.ids',
        tools: [
            { name: 'list_ids_specifications', labelKey: 'ai.tool.list_ids_specifications.label' },
            { name: 'get_specification_detail', labelKey: 'ai.tool.get_specification_detail.label' },
            { name: 'get_facet_detail', labelKey: 'ai.tool.get_facet_detail.label' },
            { name: 'generate_ids_skeleton', labelKey: 'ai.tool.generate_ids_skeleton.label' },
            { name: 'add_specification_to_ids', labelKey: 'ai.tool.add_specification_to_ids.label' },
            { name: 'validate_ids_xml', labelKey: 'ai.tool.validate_ids_xml.label' }
        ]
    },
    {
        id: 'ifc',
        icon: '🏗️',
        labelKey: 'ai.category.ifc',
        tools: [
            { name: 'search_ifc_entities', labelKey: 'ai.tool.search_ifc_entities.label' },
            { name: 'count_entities_by_type', labelKey: 'ai.tool.count_entities_by_type.label' },
            { name: 'find_ifc_files_with_entity', labelKey: 'ai.tool.find_ifc_files_with_entity.label' },
            { name: 'get_entity_properties', labelKey: 'ai.tool.get_entity_properties.label' },
            { name: 'get_property_value', labelKey: 'ai.tool.get_property_value.label' },
            { name: 'compare_ifc_files', labelKey: 'ai.tool.compare_ifc_files.label' },
            { name: 'find_property_in_ifc', labelKey: 'ai.tool.find_property_in_ifc.label' }
        ]
    },
    {
        id: 'bsdd',
        icon: '🔗',
        labelKey: 'ai.category.bsdd',
        tools: [
            { name: 'bsdd_search', labelKey: 'ai.tool.bsdd_search.label' },
            { name: 'bsdd_get_property', labelKey: 'ai.tool.bsdd_get_property.label' }
        ]
    },
    {
        id: 'misc',
        icon: '⋯',
        labelKey: 'ai.category.misc',
        tools: [
            { name: 'get_current_page', labelKey: 'ai.tool.get_current_page.label' },
            { name: 'navigate_to_page', labelKey: 'ai.tool.navigate_to_page.label' },
            { name: 'request_user_attention', labelKey: 'ai.tool.request_user_attention.label' }
        ]
    }
];

export const TOTAL_TOOLS = TOOL_CATEGORIES.reduce((sum, c) => sum + c.tools.length, 0);

export function getAllToolNames() {
    return TOOL_CATEGORIES.flatMap(c => c.tools.map(t => t.name));
}

export function getCategoryForTool(toolName) {
    for (const cat of TOOL_CATEGORIES) {
        if (cat.tools.some(t => t.name === toolName)) return cat.id;
    }
    return null;
}
```

- [ ] **Step 2: Create tests/test-suites/tool-routing.test.js (catalog tests)**

```js
describe('tool-catalog', () => {
    let catalog;
    let defs;

    beforeEach(async () => {
        catalog = await import('../../assets/js/ai/tool-catalog.js');
        defs = await import('../../assets/js/ai/tool-defs.js');
    });

    it('TOOL_CATEGORIES covers exactly all 56 tool names from TOOL_DEFINITIONS', async () => {
        const catalogNames = new Set(catalog.getAllToolNames());
        const defNames = new Set(defs.TOOL_DEFINITIONS.map(d => d.function.name));
        expect(catalogNames.size).toBe(56);
        expect(defNames.size).toBe(56);
        let missing = 0;
        for (const n of defNames) if (!catalogNames.has(n)) missing++;
        expect(missing).toBe(0);
    });

    it('TOTAL_TOOLS equals 56', async () => {
        expect(catalog.TOTAL_TOOLS).toBe(56);
    });

    it('getCategoryForTool returns correct category for known tool', async () => {
        expect(catalog.getCategoryForTool('set_theme')).toBe('settings');
        expect(catalog.getCategoryForTool('move_file')).toBe('storage');
        expect(catalog.getCategoryForTool('apply_preset')).toBe('presets');
        expect(catalog.getCategoryForTool('compare_ifc_files')).toBe('ifc');
    });

    it('getCategoryForTool returns null for unknown tool', async () => {
        expect(catalog.getCategoryForTool('nonexistent_tool_xyz')).toBe(null);
    });

    it('no tool name appears in more than one category', async () => {
        const allNames = catalog.getAllToolNames();
        const unique = new Set(allNames);
        expect(unique.size).toBe(allNames.length);
    });
});
```

- [ ] **Step 3: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/chat-heads.test.js"></script>`, add:
```html
    <script src="test-suites/tool-routing.test.js"></script>
```

- [ ] **Step 4: Mirror + run tests**
```bash
cd /home/michal/work/BIM_checker
mkdir -p dist/assets/js/ai
cp assets/js/ai/tool-catalog.js dist/assets/js/ai/tool-catalog.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 689/689 (684 + 5 new).

- [ ] **Step 5: Commit**
```bash
git checkout -b phase-11-tool-routing
git add assets/js/ai/tool-catalog.js dist/assets/js/ai/tool-catalog.js \
        tests/test-suites/tool-routing.test.js tests/test-runner.html
git commit -m "feat(ai-routing-11): tool-catalog.js — 9 categories covering all 56 tools"
```

---

## Task 2: agent-presets.js — 6 predefined agent roles

**Files:**
- Create: `assets/js/ai/agent-presets.js`
- Modify: `tests/test-suites/tool-routing.test.js` — add preset tests

- [ ] **Step 1: Create assets/js/ai/agent-presets.js**

```js
/**
 * Predefined agent presets — name, icon, systemPrompt, enabledTools subset.
 * Used by Settings UI "Start from preset" dropdown.
 */

export const AGENT_PRESETS = [
    {
        id: 'general',
        name: 'Generalista',
        icon: '🤖',
        description: 'Univerzální asistent s přístupem ke všem 56 toolům.',
        enabledTools: null,
        systemPrompt: 'Jsi AI asistent v aplikaci BIM_checker. Pomáháš uživateli s validací IFC souborů vůči IDS specifikacím, organizací souborů, generováním IDS a analýzou BIM dat. Komunikuj česky, stručně a věcně.'
    },
    {
        id: 'storage',
        name: 'Storage Organizér',
        icon: '📁',
        description: 'Pomáhá s organizací IFC/IDS souborů — složky, přesouvání, downloads.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders', 'delete_file_from_storage',
            'create_folder', 'rename_folder', 'delete_folder',
            'move_file', 'move_files_batch',
            'download_file', 'get_file_snippet', 'get_file_summary', 'replace_file_content',
            'get_current_page', 'navigate_to_page', 'request_user_attention'
        ],
        systemPrompt: 'Pomáháš uživateli organizovat IFC a IDS soubory v úložišti BIM_checker. Vytvářej, přejmenovávej a maž složky; přesouvej soubory; zobrazuj přehledy. Komunikuj česky.'
    },
    {
        id: 'validator',
        name: 'Validator',
        icon: '✓',
        description: 'Spouští validace, čte výsledky, exportuje do Excelu.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders', 'list_ids_specifications',
            'list_validation_groups', 'add_validation_group', 'delete_validation_group',
            'run_validation', 'get_validation_results',
            'get_validation_failures', 'count_failures_by_requirement',
            'export_validation_xlsx',
            'list_presets', 'save_preset', 'load_preset', 'apply_preset',
            'get_current_page', 'navigate_to_page'
        ],
        systemPrompt: 'Pomáháš uživateli spouštět validace IFC souborů vůči IDS specifikacím. Sestavuj validační skupiny, spouštěj kontrolu, analyzuj výsledky a poukazuj na chyby. Pracuj efektivně se savedanými presety. Komunikuj česky.'
    },
    {
        id: 'ids-author',
        name: 'IDS Author',
        icon: '📐',
        description: 'Generuje a upravuje IDS specifikace.',
        enabledTools: [
            'list_storage_files', 'list_ids_specifications',
            'get_specification_detail', 'get_facet_detail',
            'generate_ids_skeleton', 'add_specification_to_ids', 'validate_ids_xml',
            'replace_file_content', 'download_file',
            'get_current_page', 'navigate_to_page'
        ],
        systemPrompt: 'Pomáháš uživateli tvořit a upravovat IDS (Information Delivery Specification) soubory ve formátu XML. Generuj kostry, přidávej specifikace s applicability/requirement facety, validuj XML proti XSD schématu. Komunikuj česky, ptej se na detaily struktury.'
    },
    {
        id: 'settings',
        name: 'Settings Butler',
        icon: '⚙️',
        description: 'Spravuje nastavení aplikace a AI agenty.',
        enabledTools: [
            'get_theme', 'set_theme', 'get_language', 'set_language',
            'start_wizard', 'dismiss_wizard', 'install_pwa', 'open_bug_report',
            'list_agents', 'get_active_agent', 'create_agent', 'update_agent', 'delete_agent',
            'get_current_page', 'navigate_to_page', 'request_user_attention'
        ],
        systemPrompt: 'Pomáháš uživateli s nastavením aplikace BIM_checker — téma, jazyk, AI agenti, průvodce, instalace PWA. Komunikuj česky, věcně.'
    },
    {
        id: 'ifc-analyst',
        name: 'IFC Analytik',
        icon: '🏗️',
        description: 'Hloubková analýza IFC souborů — entity, properties, porovnání.',
        enabledTools: [
            'list_storage_files', 'list_storage_folders',
            'search_ifc_entities', 'count_entities_by_type', 'find_ifc_files_with_entity',
            'get_entity_properties', 'get_property_value',
            'compare_ifc_files', 'find_property_in_ifc',
            'get_file_summary',
            'get_current_page', 'navigate_to_page'
        ],
        systemPrompt: 'Pomáháš uživateli zkoumat obsah IFC souborů — hledat entity podle typu, číst property sety, porovnávat soubory, najít konkrétní property values. Komunikuj česky, pracuj s Express ID a IFC typy.'
    }
];

export function getPreset(id) {
    return AGENT_PRESETS.find(p => p.id === id) || null;
}
```

- [ ] **Step 2: Append preset tests to tool-routing.test.js**

Open `tests/test-suites/tool-routing.test.js`. At the END of the describe block (before closing `});`), add:
```js
});

describe('agent-presets', () => {
    let presets;
    let catalog;

    beforeEach(async () => {
        presets = await import('../../assets/js/ai/agent-presets.js');
        catalog = await import('../../assets/js/ai/tool-catalog.js');
    });

    it('AGENT_PRESETS contains exactly 6 presets', async () => {
        expect(presets.AGENT_PRESETS.length).toBe(6);
    });

    it('getPreset returns valid preset for known id', async () => {
        const p = presets.getPreset('validator');
        expect(p.name).toBe('Validator');
        expect(Array.isArray(p.enabledTools)).toBe(true);
        expect(p.enabledTools.includes('run_validation')).toBe(true);
    });

    it('getPreset returns null for unknown id', async () => {
        expect(presets.getPreset('nonexistent')).toBe(null);
    });

    it('general preset has enabledTools=null (means all tools)', async () => {
        expect(presets.getPreset('general').enabledTools).toBe(null);
    });

    it('all preset enabledTools reference valid tool names in catalog', async () => {
        const allNames = new Set(catalog.getAllToolNames());
        for (const p of presets.AGENT_PRESETS) {
            if (!p.enabledTools) continue;
            for (const name of p.enabledTools) {
                expect(allNames.has(name)).toBe(true);
            }
        }
    });
});
```

Note: this adds a SECOND describe block in the same file. That's fine.

- [ ] **Step 3: Mirror + run tests**
```bash
cp assets/js/ai/agent-presets.js dist/assets/js/ai/agent-presets.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 694/694 (689 + 5 new).

- [ ] **Step 4: Commit**
```bash
git add assets/js/ai/agent-presets.js dist/assets/js/ai/agent-presets.js \
        tests/test-suites/tool-routing.test.js
git commit -m "feat(ai-routing-11): agent-presets.js — 6 role-specific presets"
```

---

## Task 3: chat-panel.js — filter TOOL_DEFINITIONS by agent.enabledTools

**Files:**
- Modify: `assets/js/ai-ui/chat-panel.js`
- Modify: `assets/js/ai/tools/tool-agents.js` — `_safeAgent` includes enabledTools
- Modify: `tests/test-suites/tool-routing.test.js` — filter logic tests

- [ ] **Step 1: Find _send in chat-panel.js and inject filter**

Open `assets/js/ai-ui/chat-panel.js`. Find the `_send` function. Locate where `chatCompletion` is called:
```js
            const result = await chatCompletion(
                getEffectiveEndpoint(agent),
                agent.apiKey,
                agent.model,
                messages,
                TOOL_DEFINITIONS,
                ...
```

Just BEFORE the `chatCompletion` call (above the `const result = await chatCompletion(...)` line), add the filter:
```js
            const filteredTools = (agent.enabledTools && Array.isArray(agent.enabledTools))
                ? TOOL_DEFINITIONS.filter(t => agent.enabledTools.includes(t.function.name))
                : TOOL_DEFINITIONS;
```

Then replace the `TOOL_DEFINITIONS` arg in the call with `filteredTools`. Final block:
```js
            const filteredTools = (agent.enabledTools && Array.isArray(agent.enabledTools))
                ? TOOL_DEFINITIONS.filter(t => agent.enabledTools.includes(t.function.name))
                : TOOL_DEFINITIONS;
            const result = await chatCompletion(
                getEffectiveEndpoint(agent),
                agent.apiKey,
                agent.model,
                messages,
                filteredTools,
                {
                    temperature: agent.temperature,
                    signal: _state.abort.signal,
                    onStream: (delta, full) => { ... }
                }
            );
```

- [ ] **Step 2: Update _safeAgent in tool-agents.js to include enabledTools**

Open `assets/js/ai/tools/tool-agents.js`. Find `_safeAgent`:
```js
function _safeAgent(a) {
    return {
        id: a.id,
        name: a.name,
        icon: a.icon || '🤖',
        provider: a.provider,
        model: a.model,
        baseUrl: a.baseUrl || '',
        systemPrompt: a.systemPrompt || '',
        temperature: typeof a.temperature === 'number' ? a.temperature : 0.7
    };
}
```
Replace with:
```js
function _safeAgent(a) {
    return {
        id: a.id,
        name: a.name,
        icon: a.icon || '🤖',
        provider: a.provider,
        model: a.model,
        baseUrl: a.baseUrl || '',
        systemPrompt: a.systemPrompt || '',
        temperature: typeof a.temperature === 'number' ? a.temperature : 0.7,
        enabledTools: a.enabledTools || null
    };
}
```

- [ ] **Step 3: Add filter tests to tool-routing.test.js**

Open `tests/test-suites/tool-routing.test.js`. Append new describe block at end:
```js

describe('chat-panel tool filtering', () => {
    let defs;

    beforeEach(async () => {
        defs = await import('../../assets/js/ai/tool-defs.js');
    });

    it('filter passes all 56 tools when enabledTools is null', async () => {
        const enabledTools = null;
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(56);
    });

    it('filter restricts to whitelist when enabledTools is array', async () => {
        const enabledTools = ['set_theme', 'get_theme', 'list_agents'];
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(3);
        const names = filteredTools.map(t => t.function.name).sort();
        expect(names).toEqual(['get_theme', 'list_agents', 'set_theme']);
    });

    it('filter returns empty array when enabledTools is empty array', async () => {
        const enabledTools = [];
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(0);
    });
});
```

- [ ] **Step 4: Add _safeAgent test in tools-agents.test.js**

Open `tests/test-suites/tools-agents.test.js`. Find the existing `list_agents returns array without apiKey field` test. AFTER it, add:
```js
    it('list_agents includes enabledTools field (null by default)', async () => {
        const id = await chatStorage.saveAgent({ name: 'EtTest', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            const list = await agentTools.list_agents({});
            const me = list.find(a => a.id === id);
            expect('enabledTools' in me).toBe(true);
            expect(me.enabledTools).toBe(null);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('list_agents preserves enabledTools array when set', async () => {
        const id = await chatStorage.saveAgent({ name: 'EtArr', provider: 'openai', model: 'gpt-4', apiKey: 'k', enabledTools: ['get_theme', 'set_theme'] });
        try {
            const list = await agentTools.list_agents({});
            const me = list.find(a => a.id === id);
            expect(Array.isArray(me.enabledTools)).toBe(true);
            expect(me.enabledTools.length).toBe(2);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });
```

- [ ] **Step 5: Mirror + run tests**
```bash
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
cp assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 699/699 (694 + 5 new).

- [ ] **Step 6: Commit**
```bash
git add assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js \
        assets/js/ai/tools/tool-agents.js dist/assets/js/ai/tools/tool-agents.js \
        tests/test-suites/tool-routing.test.js \
        tests/test-suites/tools-agents.test.js
git commit -m "feat(ai-routing-11): filter TOOL_DEFINITIONS by agent.enabledTools"
```

---

## Task 4: translations.js — all i18n keys for categories + tool labels + presets

**Files:**
- Modify: `assets/js/common/translations.js`

- [ ] **Step 1: Add CZ block of new keys**

Open `assets/js/common/translations.js`. Find the existing `'ai.chat.maxIterations': '...'` line (the last key in the `ai.chat.*` section that Phase 8/9 added). AFTER that line, add:
```js
        // Phase 11: tool categories
        'ai.category.settings': 'Nastavení',
        'ai.category.agents': 'AI agenti',
        'ai.category.storage': 'Úložiště souborů',
        'ai.category.presets': 'Validační presety',
        'ai.category.validation': 'Validace',
        'ai.category.ids': 'IDS — specs & generování',
        'ai.category.ifc': 'IFC analýza',
        'ai.category.bsdd': 'bSDD (gated)',
        'ai.category.misc': 'Ostatní',

        // Phase 11: agent presets
        'ai.preset.general': 'Generalista',
        'ai.preset.storage': 'Storage Organizér',
        'ai.preset.validator': 'Validator',
        'ai.preset.idsAuthor': 'IDS Author',
        'ai.preset.settings': 'Settings Butler',
        'ai.preset.ifcAnalyst': 'IFC Analytik',

        // Phase 11: tool labels (short Czech descriptions for UI)
        'ai.tool.get_theme.label': 'Číst aktuální téma',
        'ai.tool.set_theme.label': 'Přepnout téma',
        'ai.tool.get_language.label': 'Číst jazyk',
        'ai.tool.set_language.label': 'Přepnout jazyk',
        'ai.tool.start_wizard.label': 'Spustit průvodce',
        'ai.tool.dismiss_wizard.label': 'Zavřít průvodce',
        'ai.tool.install_pwa.label': 'Instalovat PWA',
        'ai.tool.open_bug_report.label': 'Otevřít report chyby',
        'ai.tool.list_agents.label': 'Seznam agentů',
        'ai.tool.get_active_agent.label': 'Aktivní agent',
        'ai.tool.create_agent.label': 'Vytvořit agenta',
        'ai.tool.update_agent.label': 'Upravit agenta',
        'ai.tool.delete_agent.label': 'Smazat agenta',
        'ai.tool.list_storage_files.label': 'Vypsat soubory',
        'ai.tool.list_storage_folders.label': 'Vypsat složky',
        'ai.tool.delete_file_from_storage.label': 'Smazat soubor',
        'ai.tool.create_folder.label': 'Vytvořit složku',
        'ai.tool.rename_folder.label': 'Přejmenovat složku',
        'ai.tool.delete_folder.label': 'Smazat složku',
        'ai.tool.move_file.label': 'Přesunout soubor',
        'ai.tool.move_files_batch.label': 'Přesunout více souborů',
        'ai.tool.download_file.label': 'Stáhnout soubor',
        'ai.tool.get_file_snippet.label': 'Náhled obsahu',
        'ai.tool.get_file_summary.label': 'Souhrn souboru',
        'ai.tool.replace_file_content.label': 'Přepsat obsah',
        'ai.tool.list_presets.label': 'Seznam presetů',
        'ai.tool.save_preset.label': 'Uložit preset',
        'ai.tool.delete_preset.label': 'Smazat preset',
        'ai.tool.load_preset.label': 'Načíst preset',
        'ai.tool.apply_preset.label': 'Aplikovat preset',
        'ai.tool.list_validation_groups.label': 'Validační skupiny',
        'ai.tool.add_validation_group.label': 'Přidat skupinu',
        'ai.tool.delete_validation_group.label': 'Smazat skupinu',
        'ai.tool.run_validation.label': 'Spustit validaci',
        'ai.tool.get_validation_results.label': 'Výsledky validace',
        'ai.tool.get_validation_failures.label': 'Selhané requirementy',
        'ai.tool.count_failures_by_requirement.label': 'Histogram chyb',
        'ai.tool.export_validation_xlsx.label': 'Export Excel',
        'ai.tool.list_ids_specifications.label': 'Seznam IDS specifikací',
        'ai.tool.get_specification_detail.label': 'Detail specifikace',
        'ai.tool.get_facet_detail.label': 'Detail facetu',
        'ai.tool.generate_ids_skeleton.label': 'Generovat IDS kostru',
        'ai.tool.add_specification_to_ids.label': 'Přidat specifikaci',
        'ai.tool.validate_ids_xml.label': 'Validovat IDS XML',
        'ai.tool.search_ifc_entities.label': 'Hledat entity',
        'ai.tool.count_entities_by_type.label': 'Počet entit per typ',
        'ai.tool.find_ifc_files_with_entity.label': 'Soubory s typem',
        'ai.tool.get_entity_properties.label': 'Property sety entity',
        'ai.tool.get_property_value.label': 'Hodnota property',
        'ai.tool.compare_ifc_files.label': 'Porovnat IFC',
        'ai.tool.find_property_in_ifc.label': 'Hledat property',
        'ai.tool.bsdd_search.label': 'Hledat v bSDD',
        'ai.tool.bsdd_get_property.label': 'Detail bSDD property',
        'ai.tool.get_current_page.label': 'Aktuální stránka',
        'ai.tool.navigate_to_page.label': 'Přepnout stránku',
        'ai.tool.request_user_attention.label': 'Toast notifikace',

        // Phase 11: Settings form labels
        'ai.agent.enabledToolsLabel': 'Povolené tooly',
        'ai.agent.selectAllTools': 'Vybrat vše',
        'ai.agent.selectNoTools': 'Žádné',
        'ai.agent.toolCounterFormat': '{enabled} / {total}',
        'ai.agent.startFromPreset': 'Začít z presetu',
        'ai.agent.noPreset': '— žádný (prázdný formulář) —',
        'ai.agent.categoryToggleAll': 'vše/nic',
```

- [ ] **Step 2: Add EN block of equivalent keys**

In the same file, find the `'ai.chat.maxIterations': 'Too many tool iterations...'` line in the EN section. AFTER it, add:
```js
        // Phase 11: tool categories
        'ai.category.settings': 'Settings',
        'ai.category.agents': 'AI agents',
        'ai.category.storage': 'File storage',
        'ai.category.presets': 'Validation presets',
        'ai.category.validation': 'Validation',
        'ai.category.ids': 'IDS — specs & generation',
        'ai.category.ifc': 'IFC analysis',
        'ai.category.bsdd': 'bSDD (gated)',
        'ai.category.misc': 'Other',

        // Phase 11: agent presets
        'ai.preset.general': 'Generalist',
        'ai.preset.storage': 'Storage Organizer',
        'ai.preset.validator': 'Validator',
        'ai.preset.idsAuthor': 'IDS Author',
        'ai.preset.settings': 'Settings Butler',
        'ai.preset.ifcAnalyst': 'IFC Analyst',

        // Phase 11: tool labels
        'ai.tool.get_theme.label': 'Read current theme',
        'ai.tool.set_theme.label': 'Switch theme',
        'ai.tool.get_language.label': 'Read language',
        'ai.tool.set_language.label': 'Switch language',
        'ai.tool.start_wizard.label': 'Start wizard',
        'ai.tool.dismiss_wizard.label': 'Close wizard',
        'ai.tool.install_pwa.label': 'Install PWA',
        'ai.tool.open_bug_report.label': 'Open bug report',
        'ai.tool.list_agents.label': 'List agents',
        'ai.tool.get_active_agent.label': 'Active agent',
        'ai.tool.create_agent.label': 'Create agent',
        'ai.tool.update_agent.label': 'Update agent',
        'ai.tool.delete_agent.label': 'Delete agent',
        'ai.tool.list_storage_files.label': 'List files',
        'ai.tool.list_storage_folders.label': 'List folders',
        'ai.tool.delete_file_from_storage.label': 'Delete file',
        'ai.tool.create_folder.label': 'Create folder',
        'ai.tool.rename_folder.label': 'Rename folder',
        'ai.tool.delete_folder.label': 'Delete folder',
        'ai.tool.move_file.label': 'Move file',
        'ai.tool.move_files_batch.label': 'Move multiple files',
        'ai.tool.download_file.label': 'Download file',
        'ai.tool.get_file_snippet.label': 'File content preview',
        'ai.tool.get_file_summary.label': 'File summary',
        'ai.tool.replace_file_content.label': 'Replace content',
        'ai.tool.list_presets.label': 'List presets',
        'ai.tool.save_preset.label': 'Save preset',
        'ai.tool.delete_preset.label': 'Delete preset',
        'ai.tool.load_preset.label': 'Load preset',
        'ai.tool.apply_preset.label': 'Apply preset',
        'ai.tool.list_validation_groups.label': 'Validation groups',
        'ai.tool.add_validation_group.label': 'Add group',
        'ai.tool.delete_validation_group.label': 'Delete group',
        'ai.tool.run_validation.label': 'Run validation',
        'ai.tool.get_validation_results.label': 'Validation results',
        'ai.tool.get_validation_failures.label': 'Failed requirements',
        'ai.tool.count_failures_by_requirement.label': 'Failure histogram',
        'ai.tool.export_validation_xlsx.label': 'Export Excel',
        'ai.tool.list_ids_specifications.label': 'List IDS specs',
        'ai.tool.get_specification_detail.label': 'Spec detail',
        'ai.tool.get_facet_detail.label': 'Facet detail',
        'ai.tool.generate_ids_skeleton.label': 'Generate IDS skeleton',
        'ai.tool.add_specification_to_ids.label': 'Add specification',
        'ai.tool.validate_ids_xml.label': 'Validate IDS XML',
        'ai.tool.search_ifc_entities.label': 'Search entities',
        'ai.tool.count_entities_by_type.label': 'Count entities by type',
        'ai.tool.find_ifc_files_with_entity.label': 'Files containing type',
        'ai.tool.get_entity_properties.label': 'Entity property sets',
        'ai.tool.get_property_value.label': 'Property value',
        'ai.tool.compare_ifc_files.label': 'Compare IFC',
        'ai.tool.find_property_in_ifc.label': 'Find property',
        'ai.tool.bsdd_search.label': 'Search bSDD',
        'ai.tool.bsdd_get_property.label': 'bSDD property detail',
        'ai.tool.get_current_page.label': 'Current page',
        'ai.tool.navigate_to_page.label': 'Navigate page',
        'ai.tool.request_user_attention.label': 'Toast notification',

        // Phase 11: Settings form labels
        'ai.agent.enabledToolsLabel': 'Enabled tools',
        'ai.agent.selectAllTools': 'Select all',
        'ai.agent.selectNoTools': 'None',
        'ai.agent.toolCounterFormat': '{enabled} / {total}',
        'ai.agent.startFromPreset': 'Start from preset',
        'ai.agent.noPreset': '— none (blank form) —',
        'ai.agent.categoryToggleAll': 'all/none',
```

- [ ] **Step 3: Mirror + run tests**
```bash
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 699/699 (no new tests; text-only additions).

- [ ] **Step 4: Commit**
```bash
git add assets/js/common/translations.js dist/assets/js/common/translations.js
git commit -m "feat(ai-routing-11): i18n keys (CZ+EN) for categories, presets, tool labels"
```

---

## Task 5: Settings UI — tool picker accordion + counter + select-all

**Files:**
- Modify: `assets/js/ai-ui/settings-modal.js`
- Modify: `assets/css/ai-chat.css`
- Create: `tests/test-suites/settings-picker.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Read settings-modal.js to find form render location**

Run:
```bash
grep -nE "agent-form__row|agentSystemPrompt|agentTemp" /home/michal/work/BIM_checker/assets/js/ai-ui/settings-modal.js | head
```
Expected: shows positions of form rows. Plan adds tool picker AFTER the system prompt row.

- [ ] **Step 2: Add tool picker block to agent form template in settings-modal.js**

Open `settings-modal.js`. Find the form template area (look for `agentSystemPrompt` textarea). AFTER the row containing `agentSystemPrompt`, add a new form row with the picker placeholder. The exact location varies — find the line `<textarea id="agentSystemPrompt"` and walk to the closing `</div>` of that `agent-form__row` div. After that closing `</div>`, insert:

```html
            <div class="agent-form__row">
                <label>${t('ai.agent.enabledToolsLabel')}</label>
                <div class="agent-form__tool-picker" id="agentToolPicker"></div>
                <div class="agent-form__tool-picker-actions">
                    <button type="button" id="toolPickerSelectAll" class="agent-form__tool-picker-action">${t('ai.agent.selectAllTools')}</button>
                    <button type="button" id="toolPickerSelectNone" class="agent-form__tool-picker-action">${t('ai.agent.selectNoTools')}</button>
                    <span class="agent-form__tool-counter" id="toolPickerCounter">56 / 56</span>
                </div>
            </div>
```

- [ ] **Step 3: Add _renderToolPicker function**

Open `settings-modal.js`. At the top, AFTER existing imports, add:
```js
import { TOOL_CATEGORIES, TOTAL_TOOLS } from '../ai/tool-catalog.js';
```

Then in the file, near the form helpers (or at the end of the module, just before the existing exports), add:
```js
function _renderToolPicker(enabledTools) {
    const container = _modal.querySelector('#agentToolPicker');
    if (!container) return;
    const enabledSet = enabledTools === null || enabledTools === undefined
        ? new Set(TOOL_CATEGORIES.flatMap(c => c.tools.map(t => t.name)))
        : new Set(enabledTools);

    container.innerHTML = '';
    for (const cat of TOOL_CATEGORIES) {
        const details = document.createElement('details');
        details.className = 'tool-picker-category';
        details.dataset.catId = cat.id;
        const enabledInCat = cat.tools.filter(t => enabledSet.has(t.name)).length;
        details.innerHTML = `
            <summary>
                <span class="category-icon">${cat.icon}</span>
                <span class="category-label">${escapeHtml(t(cat.labelKey))}</span>
                <span class="category-count">${enabledInCat}/${cat.tools.length}</span>
                <button type="button" class="category-toggle-all" data-cat="${cat.id}">${escapeHtml(t('ai.agent.categoryToggleAll'))}</button>
            </summary>
            <ul class="tool-picker-tool-list">
                ${cat.tools.map(toolDef => `
                    <li>
                        <label>
                            <input type="checkbox" data-tool="${toolDef.name}" ${enabledSet.has(toolDef.name) ? 'checked' : ''}>
                            <span class="tool-name">${escapeHtml(toolDef.name)}</span>
                            <span class="tool-label">${escapeHtml(t(toolDef.labelKey))}</span>
                        </label>
                    </li>
                `).join('')}
            </ul>`;
        container.appendChild(details);
    }
    _updateToolPickerCounter();
    _attachToolPickerListeners();
}

function _attachToolPickerListeners() {
    const container = _modal.querySelector('#agentToolPicker');
    container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => {
        cb.addEventListener('change', () => _updateToolPickerCounter());
    });
    container.querySelectorAll('.category-toggle-all').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const catId = btn.dataset.cat;
            const details = container.querySelector(`details[data-cat-id="${catId}"]`);
            const cbs = details.querySelectorAll('input[type="checkbox"][data-tool]');
            const allChecked = Array.from(cbs).every(cb => cb.checked);
            cbs.forEach(cb => { cb.checked = !allChecked; });
            _updateToolPickerCounter();
        });
    });
    _modal.querySelector('#toolPickerSelectAll').addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => { cb.checked = true; });
        _updateToolPickerCounter();
    });
    _modal.querySelector('#toolPickerSelectNone').addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => { cb.checked = false; });
        _updateToolPickerCounter();
    });
}

function _updateToolPickerCounter() {
    const container = _modal.querySelector('#agentToolPicker');
    const total = TOTAL_TOOLS;
    const enabled = container.querySelectorAll('input[type="checkbox"][data-tool]:checked').length;
    _modal.querySelector('#toolPickerCounter').textContent = `${enabled} / ${total}`;
    container.querySelectorAll('details.tool-picker-category').forEach(details => {
        const catId = details.dataset.catId;
        const cat = TOOL_CATEGORIES.find(c => c.id === catId);
        const enabledInCat = Array.from(details.querySelectorAll('input[type="checkbox"][data-tool]:checked')).length;
        const countSpan = details.querySelector('.category-count');
        countSpan.textContent = `${enabledInCat}/${cat.tools.length}`;
    });
}

function _collectEnabledTools() {
    const container = _modal.querySelector('#agentToolPicker');
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"][data-tool]:checked'))
        .map(cb => cb.dataset.tool);
    if (checked.length === TOTAL_TOOLS) return null;
    return checked;
}
```

- [ ] **Step 4: Wire _renderToolPicker into form open + save**

Find the function that opens the agent form (it injects the form HTML). At the end of that function (after the form is in DOM), add a call to render the picker:
```js
    _renderToolPicker(agent ? agent.enabledTools : null);
```
(`agent` is the existing variable representing the agent being edited; for create-mode it's the defaults object from `_newAgentDefaults()`. Both have `.enabledTools` undefined initially → picker shows all checked.)

Then find the save handler (the function that calls `await storage.saveAgent(data);`). BEFORE the `await storage.saveAgent`, append `data.enabledTools` field:
```js
    data.enabledTools = _collectEnabledTools();
```

(`null` if all checked = generalist; otherwise array of names.)

- [ ] **Step 5: Add CSS rules**

Open `assets/css/ai-chat.css`. At the end of the file, append:
```css
/* === Phase 11: Tool picker === */

.agent-form__tool-picker {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
    background: var(--bg-secondary, #f9fafb);
    border: 1px solid var(--border-primary, #e5e7eb);
    border-radius: 8px;
}

.tool-picker-category {
    background: var(--bg-primary, #fff);
    border-radius: 6px;
    border: 1px solid var(--border-primary, #e5e7eb);
}
.tool-picker-category > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-weight: 500;
    list-style: none;
}
.tool-picker-category > summary::-webkit-details-marker { display: none; }
.tool-picker-category > summary::before {
    content: '▶';
    font-size: 0.7em;
    margin-right: 4px;
    transition: transform 0.15s;
}
.tool-picker-category[open] > summary::before { transform: rotate(90deg); }
.tool-picker-category .category-icon { font-size: 1.1em; }
.tool-picker-category .category-label { flex: 1; }
.tool-picker-category .category-count {
    font-size: 0.85em;
    color: var(--text-tertiary, #6b7280);
    font-variant-numeric: tabular-nums;
}
.tool-picker-category .category-toggle-all {
    font-size: 0.8em;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border-primary, #d1d5db);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary, #4b5563);
}
.tool-picker-category .category-toggle-all:hover {
    background: var(--bg-secondary, #f3f4f6);
}

.tool-picker-tool-list {
    list-style: none;
    margin: 0;
    padding: 4px 12px 8px 32px;
}
.tool-picker-tool-list li { padding: 2px 0; }
.tool-picker-tool-list label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.9em;
}
.tool-picker-tool-list .tool-name {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.85em;
    color: var(--text-secondary, #4b5563);
}
.tool-picker-tool-list .tool-label {
    color: var(--text-tertiary, #6b7280);
    flex: 1;
}

.agent-form__tool-picker-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
}
.agent-form__tool-picker-action {
    padding: 4px 12px;
    background: var(--bg-secondary, #f3f4f6);
    border: 1px solid var(--border-primary, #d1d5db);
    border-radius: 6px;
    font-size: 0.9em;
    cursor: pointer;
}
.agent-form__tool-picker-action:hover {
    background: var(--bg-tertiary, #e5e7eb);
}
.agent-form__tool-counter {
    margin-left: auto;
    font-size: 0.9em;
    font-weight: 600;
    color: var(--primary-color, #667eea);
    font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Create tests/test-suites/settings-picker.test.js**

```js
describe('settings tool picker (state logic)', () => {
    let catalog;

    beforeEach(async () => {
        catalog = await import('../../assets/js/ai/tool-catalog.js');
    });

    it('null enabledTools means all 56 enabled', async () => {
        const enabledTools = null;
        const enabledSet = enabledTools === null || enabledTools === undefined
            ? new Set(catalog.TOOL_CATEGORIES.flatMap(c => c.tools.map(t => t.name)))
            : new Set(enabledTools);
        expect(enabledSet.size).toBe(56);
    });

    it('subset enabledTools restricts to those names', async () => {
        const enabledTools = ['get_theme', 'set_theme'];
        const enabledSet = new Set(enabledTools);
        expect(enabledSet.has('get_theme')).toBe(true);
        expect(enabledSet.has('list_agents')).toBe(false);
    });

    it('collect counts: full whitelist returns null (default)', async () => {
        const checked = catalog.getAllToolNames();
        const result = checked.length === catalog.TOTAL_TOOLS ? null : checked;
        expect(result).toBe(null);
    });

    it('collect counts: partial returns array', async () => {
        const checked = ['get_theme', 'set_theme', 'list_agents'];
        const result = checked.length === catalog.TOTAL_TOOLS ? null : checked;
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
    });
});
```

- [ ] **Step 7: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/tool-routing.test.js"></script>`, add:
```html
    <script src="test-suites/settings-picker.test.js"></script>
```

- [ ] **Step 8: Mirror + run tests**
```bash
cp assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
cp assets/css/ai-chat.css dist/assets/css/ai-chat.css
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 703/703 (699 + 4 new).

- [ ] **Step 9: Commit**
```bash
git add assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js \
        assets/css/ai-chat.css dist/assets/css/ai-chat.css \
        tests/test-suites/settings-picker.test.js tests/test-runner.html
git commit -m "feat(ai-routing-11): Settings tool picker accordion + counter + select-all"
```

---

## Task 6: "Start from preset" dropdown in agent create-mode

**Files:**
- Modify: `assets/js/ai-ui/settings-modal.js`
- Modify: `tests/test-suites/settings-picker.test.js`

- [ ] **Step 1: Import agent-presets in settings-modal.js**

At the top of `settings-modal.js`, add the import:
```js
import { AGENT_PRESETS, getPreset } from '../ai/agent-presets.js';
```

- [ ] **Step 2: Add preset dropdown to create-mode form**

Find the agent form template area. Just BEFORE the existing first form row (the one with `<label>${t('ai.agent.nameLabel')}</label>`), add a new row that's conditionally shown when creating:
```html
            ${!agent.id ? `
            <div class="agent-form__row agent-form__preset-row">
                <label>${t('ai.agent.startFromPreset')}</label>
                <select id="agentPresetSelect">
                    <option value="">${t('ai.agent.noPreset')}</option>
                    ${AGENT_PRESETS.map(p => `<option value="${p.id}">${escapeHtml(p.icon + ' ' + p.name)}</option>`).join('')}
                </select>
            </div>
            ` : ''}
```

Note: this uses the `agent` variable from outer scope. If `agent.id` is truthy (edit mode), the block renders empty.

- [ ] **Step 3: Wire dropdown to prefill form**

In the function that builds the form (right after the form HTML is inserted), add:
```js
    const presetSelect = _modal.querySelector('#agentPresetSelect');
    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            const preset = getPreset(e.target.value);
            if (!preset) return;
            _modal.querySelector('#agentName').value = preset.name;
            _modal.querySelector('#agentIcon').value = preset.icon;
            _modal.querySelector('#agentSystemPrompt').value = preset.systemPrompt;
            _renderToolPicker(preset.enabledTools);
        });
    }
```

(Place this after the existing form wiring — near where `_renderToolPicker(...)` is called for the first time.)

- [ ] **Step 4: Add tests for preset dropdown**

Open `tests/test-suites/settings-picker.test.js`. At the END of the existing describe block, before its closing `});`, append:
```js
    it('preset apply: validator preset sets correct fields', async () => {
        const presets = await import('../../assets/js/ai/agent-presets.js');
        const p = presets.getPreset('validator');
        expect(p.name).toBe('Validator');
        expect(p.icon).toBe('✓');
        expect(Array.isArray(p.enabledTools)).toBe(true);
        expect(p.enabledTools.includes('run_validation')).toBe(true);
        expect(p.systemPrompt.length > 0).toBe(true);
    });

    it('preset apply: general preset has null enabledTools (all)', async () => {
        const presets = await import('../../assets/js/ai/agent-presets.js');
        const p = presets.getPreset('general');
        expect(p.enabledTools).toBe(null);
    });
```

- [ ] **Step 5: Mirror + run tests**
```bash
cp assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 705/705 (703 + 2 new).

- [ ] **Step 6: Commit**
```bash
git add assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js \
        tests/test-suites/settings-picker.test.js
git commit -m "feat(ai-routing-11): 'Start from preset' dropdown in agent create-mode"
```

---

## Task 7: Wire-up — SW cache bump + ASSETS_TO_CACHE + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW cache + add new files to ASSETS_TO_CACHE**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v34';` to `'bim-checker-v35'`.
- In `ASSETS_TO_CACHE`, find existing line `'./assets/js/ai/tool-executor.js',`. AFTER it add:
```
    './assets/js/ai/tool-catalog.js',
    './assets/js/ai/agent-presets.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 2: Append Phase 11 to PLAN.md**

After the existing `## Phase 10` section, append:
```markdown
## Phase 11: Tool routing + preset agents ✅
- [x] Per-agent `enabledTools` whitelist filter v chat-panel
- [x] Tool catalog: 9 kategorií covering 56 toolů (`tool-catalog.js`)
- [x] 6 preset agentů (`agent-presets.js`): Generalist, Storage Organizer, Validator, IDS Author, Settings Butler, IFC Analyst
- [x] Settings UI tool picker (accordion + counter + per-cat select-all)
- [x] "Start from preset" dropdown při create-mode
- [x] Backward compat: existující agenti `enabledTools=undefined` = all 56 (no change)
- [x] ~21 new tests (684 → 705)

Branch: phase-11-tool-routing
```

- [ ] **Step 3: Insert [0.9.0] in CHANGELOG.md**

After header, before first existing version:
```markdown
## [0.9.0] - 2026-05-10

### Added
- Per-agent tool routing (Phase 11): `agent.enabledTools` whitelist filters `TOOL_DEFINITIONS` before each API call — drastically reduces Gemini payload for focused agents
- `assets/js/ai/tool-catalog.js`: 9 categories covering all 56 tools (single source of truth, shared with future help modal)
- `assets/js/ai/agent-presets.js`: 6 role-specific presets — Generalist, Storage Organizer, Validator, IDS Author, Settings Butler, IFC Analyst
- Settings tool picker: accordion grouped by category, counter "X/56", select-all/none + per-category toggles
- "Start from preset" dropdown when creating agents — prefills name, icon, system prompt, enabledTools
- ~70 new i18n keys (CZ + EN) for categories, presets, tool labels

### Changed
- `_safeAgent` in tool-agents.js now exposes `enabledTools` field to AI
- SW cache bumped v34 → v35

### Backward compatibility
- Existing agents with `enabledTools=undefined` continue to receive all 56 tools (zero behavior change)
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 705/705.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-11): SW v34→v35 + PLAN/CHANGELOG"
git push -u origin phase-11-tool-routing
```

Capture and report the GitHub PR URL printed by `git push`.

---

## Self-Review Notes

**Spec coverage:**
- Per-agent `enabledTools` whitelist → Task 3 ✓
- 6 preset agents with names + icons + systemPrompts + enabledTools → Task 2 ✓
- 9 categories single source of truth (`tool-catalog.js`) → Task 1 ✓
- Settings UI accordion + counter + select-all → Task 5 ✓
- "Start from preset" dropdown → Task 6 ✓
- `_safeAgent` exposes `enabledTools` → Task 3 ✓
- Backward compat (undefined = all) → Task 3 (filter logic) ✓
- i18n CZ + EN → Task 4 ✓
- CSS for picker → Task 5 ✓

**Type consistency:**
- `agent.enabledTools` shape: `string[] | null | undefined` — consistent across storage, filter, _safeAgent, save logic
- `TOOL_CATEGORIES` schema: `{ id, icon, labelKey, tools: [{ name, labelKey }] }` — consistent in catalog + Settings render + tests
- `getPreset(id)` returns `{ id, name, icon, description, enabledTools, systemPrompt }` — same shape used in spec, plan, code, tests
- `_collectEnabledTools()` returns `null` (all) or `string[]` — matches storage shape exactly

**Test count progression:**
- Baseline: 684
- After T1: 689 (+5: catalog coverage, total, getCategoryForTool×2, dedupe)
- After T2: 694 (+5: preset count, getPreset valid/invalid, general null, all-refs-valid)
- After T3: 699 (+5: filter null/array/empty, list_agents enabledTools null/array)
- After T4: 699 (no new)
- After T5: 703 (+4: settings-picker.test.js)
- After T6: 705 (+2: preset apply tests)
- After T7: 705 (no new)

**Risks:**
- Translations.js is large — adding ~70 keys × 2 langs means ~140 lines per language. Diff is mechanical but bulky. Reviewer should focus on key naming consistency (uses `ai.tool.<name>.label` pattern uniformly).
- `_collectEnabledTools()` returns `null` when all are checked — by design, but caller (chat-panel filter) must handle both `null` and arrays correctly. Covered by Task 3 tests.
- Preset dropdown override: changing preset mid-edit will OVERWRITE the form (intended behavior). User may lose unsaved tweaks. Mitigation: maybe add a confirm? Out of scope for now — note in CHANGELOG.

**Final state:** 705 tests, per-agent tool routing live, 6 presets shipped, Settings UI usable for tool selection. Token cost reduced ~5-15× for focused agents (e.g., Theme bot = 4 tools = ~1k vs 16k tokens).
