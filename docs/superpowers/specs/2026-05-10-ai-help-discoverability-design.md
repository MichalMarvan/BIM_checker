# AI help & discoverability — Design

**Status:** Draft for user review
**Date:** 2026-05-10
**Builds on:** Phase 8/9/10 (56 AI tools + chat-heads UI), existing wizard infrastructure (`wizard-steps.js`).

## Goal

Pomoct uživateli **najít a pochopit** AI funkce:
- **A — Wizard step** "AI agent": nový krok v každém page-wizardu s krátkým popisem a 2-3 příklady dotazů
- **B — AI help modal**: kategorizovaný seznam všech 56 toolů s příklady, dostupný přes "?" ikonku v chat panel headeru
- **C — FAQ Q&A** v translations: ~10 typických dotazů "Jak to udělat přes AI?" pro snazší searchabilitu (i kdyby přes Ctrl-F)

## Decisions

| Téma | Volba |
|---|---|
| Wizard step pozice | Na **konci** existujícího page-flow (uživatel nejdřív projde běžné UI, pak "a navíc máš AI") |
| Wizard step target | `#chatLauncher` button (44px, vpravo dole) |
| Wizard step content | Krátký popis + 3 typické příklady dotazů (přes `<ul>` v contentu) |
| Pages s wizardem | index, validator, parser, viewer (všechny 4) |
| AI help modal trigger | Nová "?" ikonka v `chat-panel__header`, mezi history clock a ▼ minimize |
| Modal layout | Accordion — kategorie sbalené, klik na header rozbalí |
| Modal kategorie | 9 sekcí podle Tier z Phase 9 spec: Settings (8), Agents (5), Storage & files (12), Presets (5), Validation (8), IDS specs+gen (6), IFC analysis (5), bSDD (2 gated), Misc (3) |
| Per-tool entry | Czech name + 1 řádek popisu (= existing tool description z `tool-defs.js`) + 1 example query |
| FAQ entries | ~10 Q&A pairs jako `ai.faq.q1.question` / `ai.faq.q1.answer` v translations.js |
| Trigger pro FAQ | FAQ je zobrazená jako footer sekce help modalu pod accordion (nebo jako poslední accordion kategorie "Časté dotazy") |

## Architecture

### A — Wizard step

Na konci každého page entry v `wizard-steps.js` přidáme nový step:
```js
{
    id: 'ai-agent',
    target: '#chatLauncher',
    title: 'wizard.ai.title',
    content: 'wizard.ai.content',
    icon: '🤖',
    position: 'left',
    required: false,
    blockInteraction: false
}
```

Translation:
```js
'wizard.ai.title': 'AI agent',
'wizard.ai.content': 'Tady najdeš AI agenta, kterému můžeš zadat úkoly v běžné češtině. Klikni a vyber agenta. Příklady: <ul><li>"Přepni na dark mode"</li><li>"Spusť validaci všech IFC souborů"</li><li>"Vygeneruj prázdný IDS"</li></ul>Plný seznam toolů otevřeš přes "?" v chat headeru.'
```

### B — AI help modal

**Trigger button** v chat panel headeru:
```html
<button class="chat-panel__header__btn" id="chatHelpBtn" title="${t('ai.chat.helpBtn')}">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-2.5 1.5-2.5 4"/>
        <line x1="12" y1="17" x2="12" y2="17.5"/>
    </svg>
</button>
```

Vložen mezi `#chatToggleThreads` a `#chatMinimizeBtn` v `_injectPanel()`.

**Modal struktura** (nový element injectovaný do body při prvním kliknutí):
```html
<div class="ai-help-modal modal-overlay" id="aiHelpModal">
    <div class="modal-container ai-help-modal__container">
        <div class="modal-header">
            <h2>${t('ai.help.title')}</h2>
            <button class="modal-close" data-action="close">×</button>
        </div>
        <div class="modal-body">
            <p class="ai-help-modal__intro">${t('ai.help.intro')}</p>

            <details class="ai-help-modal__category">
                <summary><span class="category-icon">⚙️</span> ${t('ai.help.cat.settings.title')} <span class="category-count">8</span></summary>
                <ul class="ai-help-modal__tools">
                    <li><strong>get_theme</strong> — ${t('ai.help.tool.get_theme')}<br><em>"Jaké mám teď téma?"</em></li>
                    <li><strong>set_theme</strong> — ${t('ai.help.tool.set_theme')}<br><em>"Přepni na dark mode"</em></li>
                    <!-- ...8 entries... -->
                </ul>
            </details>

            <details class="ai-help-modal__category">
                <summary>...</summary>
                ...
            </details>

            <!-- FAQ jako poslední accordion -->
            <details class="ai-help-modal__category ai-help-modal__faq">
                <summary><span class="category-icon">❓</span> ${t('ai.help.cat.faq.title')} <span class="category-count">10</span></summary>
                <ul class="ai-help-modal__faq-list">
                    <li><strong>${t('ai.faq.q1.question')}</strong><br>${t('ai.faq.q1.answer')}</li>
                    ...
                </ul>
            </details>
        </div>
    </div>
</div>
```

**Implementace** v novém modulu `assets/js/ai-ui/help-modal.js`:
```js
let _injected = false;

export function open() {
    if (!_injected) _inject();
    document.getElementById('aiHelpModal').classList.add('active');
}

function _inject() { /* build modal DOM with all categories from a JS data structure */ }
```

**Tool catalog data** (taky v `help-modal.js` — local data structure, NE re-import z tool-defs.js, aby se nemíchaly Czech help texts s LLM-facing tool descriptions):
```js
const HELP_CATEGORIES = [
    { id: 'settings', icon: '⚙️', titleKey: 'ai.help.cat.settings.title', tools: [
        { name: 'get_theme', exKey: 'ai.help.ex.get_theme' },
        { name: 'set_theme', exKey: 'ai.help.ex.set_theme' },
        ...
    ]},
    { id: 'agents', icon: '🤖', ... },
    { id: 'storage', icon: '📁', ... },
    { id: 'presets', icon: '📋', ... },
    { id: 'validation', icon: '✓', ... },
    { id: 'ids', icon: '📐', ... },
    { id: 'ifc', icon: '🏗️', ... },
    { id: 'bsdd', icon: '🔗', ... },
    { id: 'misc', icon: '⋯', ... }
];
```

Pro každý tool: i18n key na **example query** (Czech). Tool description je už v translations.js přes `ai.help.tool.<name>` (krátký Czech popis pro UX, oddělený od `tool-defs.js` description určeného pro LLM).

**Files affected:**
- `assets/js/ai-ui/chat-panel.js` — přidat `#chatHelpBtn` do `_injectPanel`, listener volá `helpModal.open()`
- `assets/js/ai-ui/help-modal.js` — **new** module
- `assets/css/ai-chat.css` — `.ai-help-modal__*` styles
- `assets/js/common/translations.js` — i18n keys
- `dist/...` mirrors
- `sw.js` v32→v33 + `help-modal.js` v `ASSETS_TO_CACHE`

### C — FAQ entries

V translations.js sekce `ai.faq.q1` až `ai.faq.q10` s pairs `.question` / `.answer`. Příklady:
- Q1: "Jak změním téma přes AI?" — A: "Otevři chat 🤖, vyber agenta a napiš 'Přepni na dark/light mode'."
- Q2: "Jak spustím validaci přes AI?" — A: "Napiš 'Spusť validaci všech IFC souborů vůči souboru X.ids'. AI vytvoří validační skupinu, přepne na Validator a spustí."
- Q3: "Můžu AI nechat vytvořit IDS?" — A: "Ano: 'Vygeneruj IDS s názvem Y a autorem me@example.com'. Nebo 'Přidej do existujícího IDS specifikaci...'."
- Q4: "Jak AI vidí moje soubory?" — A: "AI má read+write přístup k IFC a IDS souborům v IndexedDB úložišti. Může je vypsat, přesouvat mezi složkami, stahovat lokálně, mazat (vždy s potvrzením)."
- Q5: "Jak smažu agenta přes AI?" — A: "Napiš 'Smaž agenta XYZ'. AI tě požádá o potvrzení. Pozor: aktuálně běžící agent (ten co řídí chat) sám sebe smazat nemůže."
- Q6: "Co znamená modré pulsování u kolečka?" — A: "Agent dokončil odpověď zatímco byl chat minimalizovaný. Klikni na kolečko pro otevření a uvidíš odpověď. Po otevření pulsování zmizí."
- Q7: "Jak uložím aktuální validační skupinu jako preset?" — A: "Na Validator stránce řekni 'Ulož aktuální skupinu jako preset XYZ'. Pak ho můžeš kdykoli načíst přes 'Načti preset XYZ'."
- Q8: "Můžu AI nechat hledat property v IFC?" — A: "'Najdi v souboru X.ifc property IsExternal s hodnotou .T.' — AI vrátí seznam entit (max 50)."
- Q9: "Jak AI exportuje výsledky validace?" — A: "Na Validator stránce po dokončení validace řekni 'Stáhni mi excel s výsledky'. AI spustí export, soubor se stáhne automaticky."
- Q10: "Co když AI ignoruje moji žádost?" — A: "Některé LLM modely občas v dlouhé konverzaci přestanou volat tools. Zkus nový thread (✕ a otevřít agenta znovu) nebo explicitní formulaci 'Použij tool set_theme s argumentem dark'."

EN equivalent všechny v translations.js.

## Files affected

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/common/wizard-steps.js` | Modify | Add `ai-agent` step at the end of each of 4 page entries |
| `assets/js/common/translations.js` | Modify | Add `wizard.ai.*`, `ai.chat.helpBtn`, `ai.help.*`, `ai.faq.q1..q10.*` keys (CZ + EN) |
| `assets/js/ai-ui/chat-panel.js` | Modify | Add help button to `_injectPanel`, listener opens help modal |
| `assets/js/ai-ui/help-modal.js` | **Create** | `open()` exports, builds DOM on first open, accordion categories with all 56 tools + FAQ |
| `assets/css/ai-chat.css` | Modify | `.ai-help-modal__*` styles (extends existing `.modal-overlay`) |
| `dist/...` | Mirror | All modified files |
| `sw.js` + `dist/sw.js` | Modify | Bump v32 → v33; add `help-modal.js` to `ASSETS_TO_CACHE` |
| `tests/test-suites/help-modal.test.js` | **Create** | ~5 tests (modal opens, accordion sections present, all 56 tools listed, FAQ section present) |
| `tests/test-runner.html` | Modify | Add new test suite tag |
| `PLAN.md` | Modify | Append "Phase 11: AI help & discoverability" entry |
| `CHANGELOG.md` | Modify | `[0.9.0]` |

**No changes to:**
- `tool-defs.js` — LLM-facing descriptions stay as-is
- `wizard.js` — uses existing step-render machinery
- Phase 9/10 chat-heads logic

## Test plan

`tests/test-suites/help-modal.test.js` (~5 tests):
1. `open()` injects modal into DOM and adds `.active` class
2. Modal contains 9 `<details>` accordion blocks (8 categories + FAQ)
3. Each category accordion contains the right number of tools (settings: 8, agents: 5, ...)
4. FAQ accordion contains 10 Q/A pairs
5. Calling `open()` twice doesn't duplicate DOM (idempotency)

Plus 1 integration test in `chat-heads.test.js` or new file: clicking `#chatHelpBtn` calls `helpModal.open()` (mocked).

## Migration / risks

- Žádné breaking changes
- Při změně tool catalogu (Phase 11+) bude potřeba updatovat `HELP_CATEGORIES` data v `help-modal.js`. Tool seznam je tam udržován ručně — to je trade-off za to, že Czech help texty jsou oddělené od LLM-facing tool descriptions.
- Risk: i18n keys za 56 toolů + 10 FAQ + 9 kategorií = ~150 nových keys × 2 jazyky. Větší PR co do textu, ale mechanický.

## Out of scope

- Search/filter v help modalu (uživatel scrolluje accordion)
- "Spustit example" button next to each tool (klikni → vloží do chat input)
- Per-page contextual help (modal je univerzální)

## Open question (default chosen)

- FAQ scope: 10 Q&A. Pokud chceš víc/míň, řekni před implementací.
