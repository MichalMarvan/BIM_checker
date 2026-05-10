# Phase 11: Per-agent tool routing + preset agents — Design

**Status:** Draft for user review
**Date:** 2026-05-10
**Builds on:** Phase 8/9/10 (56 AI tools + chat-heads). Shares categorization with the upcoming AI help modal spec.

## Goal

Vyřešit problém **velkého payloadu** (56 toolů ≈ 16k tokenů jen tool defs), který způsobuje pomalost Gemini a vyšší cost. Plus zlepšit UX přes **preset agenty** s jasným zaměřením.

Tři propojené části:
- **A** — Per-agent `enabledTools` whitelist + filter v chat-panel před API requestem
- **B** — 6 předdefinovaných preset agentů (Generalista, Storage Organizér, Validator, IDS Author, Settings Butler, IFC Analytik)
- **C** — Settings UI: accordion picker s 9 kategoriemi a check-all/uncheck-all per kategorii. "Start from preset" dropdown při vytváření agenta.

## Decisions

| Téma | Volba |
|---|---|
| Storage shape | `agent.enabledTools: string[] \| null \| undefined`. `null`/`undefined` = všech 56 (no breaking change pro existující agenty). Pole jmen = exact whitelist. |
| Filtrace v requestu | `chat-panel._send` před voláním `chatCompletion`: pokud `agent.enabledTools` je pole, filtruje `TOOL_DEFINITIONS` na ty, jejichž `function.name` je v whitelistu. Executor REGISTRY zůstává plný (= unknown_tool error pokud LLM vyhalucinuje neaktivní tool). |
| Default pro nové agenty | "Generalista" preset = `enabledTools = null` (vše). Ostatní presety mají explicit whitelist. |
| Tool kategorie | 9 sekcí (sdíleno s help modal spec): Settings (8), Agents (5), Storage & files (12), Presety (5), Validation (8), IDS specs+gen (6), IFC analysis (5), bSDD (2), Misc (3). Total 54 + 2 gated bSDD. Drobná korekce: validation = 5 read+write + 2 drilldown + 1 export = 8 ✓ |
| Kategorizace zdroj | Nový soubor `assets/js/ai/tool-catalog.js` jako single source of truth pro `category` per tool. Importované z Settings i help modal. |
| UI v Settings | Tool picker zobrazený **pod** existujícími poli (po system prompt). Accordion: kliknu na "Storage & files (12)" → rozbalí seznam checkboxů. Header má check-all/uncheck-all link. |
| "Start from preset" | Dropdown při Create-mode (ne Edit) nad formulářem. Volba presetu prefilluje: name, icon, systemPrompt, enabledTools. Uživatel dál může cokoli upravit. |
| Edit existujícího agenta | Tool picker reflektuje aktuální stav. Změny se uloží jako součást Save. |
| Behavior při missing tool | Pokud `enabledTools` obsahuje jméno tool která už neexistuje (např. po smazání tool v budoucí fázi), filtrace ho prostě nezahrne. Žádný error. |
| Per-preset systemPrompt | Krátký Czech popis role (1-2 věty) — pomáhá LLM "vstoupit" do role. |
| Migration | Existující agenti zůstávají s `enabledTools = undefined` → posílá se 56 toolů. Žádné UI změny pro ně, dokud user neupraví. |

## Preset agents

Definice v novém modulu `assets/js/ai/agent-presets.js`:

```js
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

## Architecture

### A — Storage shape

`chat-storage.saveAgent(data)` už dnes prochází přes spread, takže `enabledTools` se automaticky zachová. Jen třeba updatovat `_safeAgent` v `tool-agents.js` pokud chceme aby AI ho viděl (např. v `get_active_agent` výsledku):

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

### Tool filtering v _send

V `chat-panel.js _send()`, BEFORE volání `chatCompletion`:
```js
const filteredTools = (agent.enabledTools && Array.isArray(agent.enabledTools))
    ? TOOL_DEFINITIONS.filter(t => agent.enabledTools.includes(t.function.name))
    : TOOL_DEFINITIONS;

// ... pass filteredTools instead of TOOL_DEFINITIONS to chatCompletion(...)
```

Pokud `filteredTools` empty (uživatel zakázal vše), pošleme prázdné pole — Gemini akceptuje, AI bude odpovídat jen textem. To je validní stav.

### B — Tool catalog data structure

Nový soubor `assets/js/ai/tool-catalog.js`:
```js
/**
 * Single source of truth for tool categorization.
 * Shared between Settings tool picker and AI help modal.
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
    { id: 'agents', icon: '🤖', labelKey: 'ai.category.agents', tools: [...5...] },
    { id: 'storage', icon: '📁', labelKey: 'ai.category.storage', tools: [...12...] },
    { id: 'presets', icon: '📋', labelKey: 'ai.category.presets', tools: [...5...] },
    { id: 'validation', icon: '✓', labelKey: 'ai.category.validation', tools: [...8...] },
    { id: 'ids', icon: '📐', labelKey: 'ai.category.ids', tools: [...6...] },
    { id: 'ifc', icon: '🏗️', labelKey: 'ai.category.ifc', tools: [...5...] },
    { id: 'bsdd', icon: '🔗', labelKey: 'ai.category.bsdd', tools: [...2...] },
    { id: 'misc', icon: '⋯', labelKey: 'ai.category.misc', tools: [...3...] }
];

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

i18n keys jen labels (krátké, 1-3 slovech), žádné popisy — popisy zůstávají v `tool-defs.js`. Cíl: Settings tool picker zobrazí jen jméno + label, ne plný description.

### C — Settings UI tool picker

V agent form (`settings-modal.js`), pod existujícím system prompt textareou, přidáme novou sekci:

```html
<div class="agent-form__row">
    <label>${t('ai.agent.enabledToolsLabel')}</label>
    <div class="agent-form__tool-picker" id="agentToolPicker">
        <!-- Accordion populated by JS -->
    </div>
    <div class="agent-form__row__quickactions">
        <button type="button" id="toolPickerSelectAll">${t('ai.agent.selectAllTools')}</button>
        <button type="button" id="toolPickerSelectNone">${t('ai.agent.selectNoTools')}</button>
        <span class="agent-form__tool-counter" id="toolPickerCounter">56 / 56</span>
    </div>
</div>
```

Each category jako `<details>` accordion:
```html
<details class="tool-picker-category">
    <summary>
        <span class="category-icon">⚙️</span>
        <span class="category-label">Settings</span>
        <span class="category-count">8/8</span>
        <button class="category-toggle-all" data-cat="settings">vše/nic</button>
    </summary>
    <ul>
        <li><label><input type="checkbox" data-tool="get_theme" checked> get_theme</label></li>
        ...
    </ul>
</details>
```

JS:
- `_renderToolPicker(enabledTools)` — kreslí accordion s checkboxy reflecting current state. `enabledTools = null` → vše checked.
- Změna checkboxu aktualizuje per-category count + global counter
- "Select all/none" buttons in header
- Per-category toggle button (vše/nic v té kategorii)
- Save: collected checkboxů → array; pokud `length === TOTAL_TOOLS`, save jako `enabledTools: null` (clean default)

### "Start from preset" UI

V create-mode form (`_state.editingId === null`), nad existujícími poli:
```html
<div class="agent-form__row agent-form__preset-row">
    <label>${t('ai.agent.startFromPreset')}</label>
    <select id="agentPresetSelect">
        <option value="">${t('ai.agent.noPreset')}</option>
        <option value="general">${t('ai.preset.general')} (vše)</option>
        <option value="storage">${t('ai.preset.storage')} 📁</option>
        <option value="validator">${t('ai.preset.validator')} ✓</option>
        <option value="ids-author">${t('ai.preset.idsAuthor')} 📐</option>
        <option value="settings">${t('ai.preset.settings')} ⚙️</option>
        <option value="ifc-analyst">${t('ai.preset.ifcAnalyst')} 🏗️</option>
    </select>
</div>
```

JS listener: change na select → `getPreset(value)` → prefill `#agentName`, `#agentIcon`, `#agentSystemPrompt`, `_renderToolPicker(preset.enabledTools)`. Uživatel pak dál může upravit cokoli.

## Files affected

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai/tool-catalog.js` | **Create** | TOOL_CATEGORIES data + helpers |
| `assets/js/ai/agent-presets.js` | **Create** | AGENT_PRESETS data + `getPreset(id)` |
| `assets/js/ai/tools/tool-agents.js` | Modify | `_safeAgent` adds `enabledTools` |
| `assets/js/ai-ui/chat-panel.js` | Modify | Filter TOOL_DEFINITIONS by `agent.enabledTools` before chatCompletion |
| `assets/js/ai-ui/settings-modal.js` | Modify | Tool picker (accordion) + "Start from preset" dropdown; save logic packs enabledTools array (or null) |
| `assets/css/ai-chat.css` | Modify | `.agent-form__tool-picker`, `.tool-picker-category` styles |
| `assets/js/common/translations.js` | Modify | Add `ai.category.*` (9), `ai.tool.*.label` (56), `ai.preset.*` (6), `ai.agent.*` form labels |
| `dist/...` | Mirror | All files |
| `sw.js` + `dist/sw.js` | Modify | Bump v34 → v35; add `tool-catalog.js` + `agent-presets.js` |
| `tests/test-suites/tool-routing.test.js` | **Create** | ~6 tests |
| `tests/test-runner.html` | Modify | Add new test suite |
| `PLAN.md` | Modify | Phase 11 entry |
| `CHANGELOG.md` | Modify | `[0.9.0]` |

## Test plan

`tests/test-suites/tool-routing.test.js` (~6 tests):
1. `TOOL_CATEGORIES` covers all 56 tools (no orphan)
2. `getAllToolNames()` returns 56 unique names
3. `getCategoryForTool('set_theme')` returns `'settings'`
4. `getPreset('storage')` returns valid preset with enabledTools containing storage tools
5. Settings save with empty tool picker → saves `enabledTools: []`; with all checked → saves `null` (clean default)
6. `_safeAgent` includes `enabledTools` field

Plus 1-2 integration tests:
- Apply preset → form fields prefilled correctly
- Per-category select-all button toggles all in that cat

## Migration / risks

- **Backward compatibility**: existující agenti = `enabledTools undefined` → posílá se 56 tools (zero behavior change)
- **Add tools later** (Phase 12+): nový tool nepatří do žádného whitelistu existujících agentů → musí ho uživatel ručně přidat. Trade-off: bez tohoto by se mu nepatrně rozšířily payloads.
- **Tool renaming**: pokud někdo přejmenuje tool name v Phase 12, whitelist se rozbije. Mitigace: tool names jsou semi-public API, neměnit lehce.
- **bSDD gated tools**: zařazené v kategorii bsdd. Default uživatel je vybere → AI je má v whitelistu → AI je zavolá → executor vrátí `integration_disabled`. OK.

## Out of scope

- Tool subset templates beyond the 6 presets (user může později duplikovat a customizovat agenta)
- Per-page tool overrides (rozšíření filterů by mohlo jít — Phase 12+)
- Cost estimation / token counting v UI
- AI sám doporučí "tihle 3 tooly potřebuješ" — to je další featura

## Open question (defaulted)

- Should "Start from preset" pre-set the API key + model? **No** — keys/models jsou per-uživatel, presety jen role-specific config (name, prompt, enabledTools, icon).
- Should existing agents auto-migrate to "Generalista" preset? **No** — jsou kompatibilní as-is, žádná migration potřeba.
