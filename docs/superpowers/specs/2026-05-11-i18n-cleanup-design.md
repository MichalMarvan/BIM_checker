# Complete English Localization (i18n Cleanup)

**Status:** Approved for implementation
**Date:** 2026-05-11
**Source:** User-supplied brief (i18n Cleanup Brief: Complete English Localization)
**Trigger:** LinkedIn feedback from external user on LinkedIn — "When choosing English language, not everything is translated."

## Goal

User in EN UI mode visits all 4 pages, hovers every button, triggers errors, opens AI chat — sees **zero Czech text** anywhere.

## Problem

- `translations.js` dictionary is complete (916 CS + 916 EN keys).
- **154+ hardcoded CS strings** live in 20 JS files bypassing i18n.
- **8 HTML elements** lack `data-i18n` attribute.
- 4 `<title>` tags hardcoded CS (untranslatable via current i18n traversal — engine only scans `<body>`).

Verified by grep: 72 CS chars in `tool-defs.js`, 67 in `index.html`, 51 in `ifc-viewer-multi-file.html`, etc.

## User decisions (brainstorm)

| Topic | Choice |
|---|---|
| Sample IDS in parser.js (CS XML content for "Načíst ukázkový IDS") | **EN only sample** — international audience priority |
| `<title>` tag mechanism | **Extend i18n.js** with `data-i18n-title-tag` attribute (cleaner than per-page JS, no flash) |
| Agent preset `systemPrompt` language | **Dynamic CS/EN per UI lang** — preset has `systemPromptCs` + `systemPromptEn`, picked at create-from-preset based on current UI language |
| Regression prevention | **Hard fail CI test** — grep CS chars in non-translations files |
| PR scope | **Single PR** — all 166 fixes + i18n.js extension + regression test |

## Architecture

### 1. i18n.js engine extension (new capability)

Add support for `<title data-i18n-title-tag="page.title.x">` attribute. On `setLanguage(lang)`:
- Find element with `data-i18n-title-tag` (only `<title>` is expected, in `<head>`)
- Look up `t(key)`, assign to `document.title`

Also `data-i18n-meta-description` for `<meta name="description" content="...">` to enable EN search/share previews.

### 2. Translations additions to `translations.js`

New keys (estimated ~80-100):

| Namespace | Examples |
|---|---|
| `page.title.*` | `page.title.index`, `page.title.validator`, `page.title.parser`, `page.title.viewer` |
| `page.meta.description.*` | One per page |
| `update.*` (existing partial) | `update.newVersion`, `update.download`, `update.later`, `update.closeAria` |
| `wizard.*` (existing partial) | Fill missing CS+EN for help.title/help.about/help.faq/help.shortcuts/start/completed/etc. |
| `parser.error.*` | (Empty file errors etc., if missing) |
| `validator.error.*` | (Missing groups, etc.) |
| `viewer.error.*` | `viewer.error.encryptedFile`, `viewer.error.invalidHeader`, `viewer.error.noDataSection`, `viewer.warn.largeFile`, `viewer.warn.cancelled`, `viewer.warn.skippedGeometry` |
| `ai.tool.*` | Per-tool response messages (validator, agents, presets, storage, ids, settings, ui) — ~30 keys |
| `chat.*` | `chat.emptyConversation`, `chat.time.now` |
| `progress.*` | `progress.completedCount` |
| `home.toolLink` | "Otevřít nástroj →" — shared by 3 tool cards |
| `viewer.dropHint`, `viewer.loadingStatus` | Drop zone subtitle, loading status |

### 3. HTML changes

Per the brief — 8 elements add `data-i18n`, 4 `<title>` get `data-i18n-title-tag`.

Plus: `<meta name="description" data-i18n-meta-description="page.meta.description.x">` on each page.

### 4. JS source changes

Group by file priority. Each file imports `import { i18n } from '../common/i18n.js'` (or relative path) where missing.

For string interpolation, convert `${var}` → `i18n.t('key', { name: value })` with `{name}` syntax matching existing i18n placeholder convention.

**Order of operations (one commit per group):**

1. **i18n.js extension + new translation keys** — foundation for everything else
2. **update-checker.js + wizard.js** — HIGH visibility (banner + every page)
3. **parser.js incl. EN sample IDS rewrite** — visible on parser page + demo content
4. **viewer-parser.js error messages** — visible when user uploads invalid IFC
5. **validator.js + chat-panel.js + progress-panel.js + settings-modal.js** — UI text
6. **All AI tool-*.js files (8 files)** — AI chat response text
7. **agent-presets.js CS/EN dual systemPrompt** — agent creation
8. **chat-storage.js + tool-ui.js + tool-bsdd.js misc** — small leftovers
9. **HTML data-i18n + title-tag additions** — 4 HTML files
10. **Regression test + verification**

### 5. Agent preset CS/EN split

Schema change in `agent-presets.js`:

```js
// Before:
{
    name: 'Storage Organizér',
    description: 'Pomáhá s organizací IFC/IDS souborů...',
    systemPrompt: 'Pomáháš uživateli organizovat...'
}

// After:
{
    nameCs: 'Storage Organizér',
    nameEn: 'Storage Organizer',
    descriptionCs: 'Pomáhá s organizací IFC/IDS souborů...',
    descriptionEn: 'Helps organize IFC/IDS files...',
    systemPromptCs: 'Pomáháš uživateli organizovat...',
    systemPromptEn: 'You help the user organize IFC/IDS files...'
}
```

Consumer (settings-modal "Start from preset" flow): reads `nameCs`/`nameEn`/`systemPromptCs`/`systemPromptEn` based on `i18n.getLanguage()`. Creates agent with selected variant — once created, agent is independent.

Migration: existing user agents in IndexedDB are not affected. Only NEW agents from preset get language-aware prompts.

### 5b. CSS pseudo-element content

`assets/css/index.css:778` has `.file-tree-modern:empty::before { content: "Žádné soubory" }` — CSS pseudo-element string content that bypasses DOM-based i18n. Two-language CSS via `:lang(en)` selector:

```css
.file-tree-modern:empty::before {
    content: "Žádné soubory";
}
html[data-lang="en"] .file-tree-modern:empty::before {
    content: "No files";
}
```

The existing `<script>` block in each HTML head already sets `document.documentElement.setAttribute('data-lang', lang)`, so the selector chain works.

### 6. Regression test

New file `tests/test-suites/i18n-completeness.test.js`:

```js
describe('i18n-completeness — no hardcoded Czech outside translations', () => {
    it('no CS diacritics in JS source files', async () => {
        const excluded = ['translations.js', 'i18n.js', 'vendor/'];
        const csCharRegex = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
        const findings = [];
        // ... fetch each .js file, scan for CS chars, exclude allowlist
        // CS chars allowed in: comments (lines starting //), translations.js, i18n.js
        expect(findings).toEqual([]);
    });

    it('no CS diacritics in HTML files outside data-i18n fallback', async () => {
        // Allow CS in data-i18n attribute fallback text content (engine overwrites on lang switch)
        // Disallow CS in places where no data-i18n attribute is present
        // ...
    });
});
```

Implementation: fetch source files via `../assets/js/...` URLs (same pattern as other test suites). Walk through allowlist. Allow CS in:
- `translations.js` (the dictionary)
- `i18n.js` (it has CS comments)
- Comment lines (start with `//` or `/*`)
- Variable identifiers (rare, like `sejmutiOrnice` — out of scope)
- HTML text inside elements that ALSO have `data-i18n*` attribute (these are fallback text, engine overwrites)
- `tool-defs.js` (LLM-facing, kept EN per scope decision — but currently has CS, will be replaced in Task)
- `tests/` directory (test suites may reference CS strings for assertions)
- `agent-presets.js` `systemPromptCs` / `nameCs` / `descriptionCs` fields (intentional CS variants)
- `index.css` `content: "Žádné soubory"` (handled via :lang(en) selector — allowlist this exact line)

## File-by-file plan

| File | Action | Strings |
|---|---|---|
| `assets/js/common/i18n.js` | Add `data-i18n-title-tag` + `data-i18n-meta-description` handlers | 0 (engine) |
| `assets/js/common/translations.js` | Add ~80-100 new keys CS+EN | — |
| `assets/js/common/update-checker.js` | Replace 5 hardcoded CS | 5 |
| `assets/js/common/wizard.js` | Replace 7 hardcoded CS via `i18n.t()` | 7 |
| `assets/js/common/progress-panel.js` | Replace 1 string | 1 |
| `assets/js/parser.js` | Replace 11 strings + rewrite Czech sample IDS to EN | 11 |
| `assets/js/validator.js` | Replace 6 strings | 6 |
| `assets/js/ifc/viewer-parser.js` | Replace 9 error strings | 9 |
| `assets/js/ai/tools/tool-validator.js` | Replace 10 strings | 10 |
| `assets/js/ai/tools/tool-agents.js` | Replace 8 strings | 8 |
| `assets/js/ai/tools/tool-settings.js` | Replace 3 strings | 3 |
| `assets/js/ai/tools/tool-storage.js` | Replace 3 strings | 3 |
| `assets/js/ai/tools/tool-ids.js` | Replace 2 strings | 2 |
| `assets/js/ai/tools/tool-ui.js` | Replace 1 string | 1 |
| `assets/js/ai/tools/tool-bsdd.js` | Replace 1 string | 1 |
| `assets/js/ai/tools/tool-presets.js` | Replace 1 string | 1 |
| `assets/js/ai/chat-storage.js` | Replace 1 string | 1 |
| `assets/js/ai-ui/settings-modal.js` | Replace 1 string | 1 |
| `assets/js/ai-ui/chat-panel.js` | Replace 1 string ("teď") | 1 |
| `assets/js/ai/agent-presets.js` | Split CS/EN dual fields | 5 presets × 3 fields |
| `index.html` | Add `data-i18n` to 4 elements + title-tag + meta-description | 4 |
| `pages/ids-ifc-validator.html` | Add data-i18n to 2 + title-tag + meta-description | 2 |
| `pages/ids-parser-visualizer.html` | Add title-tag + meta-description | 0 |
| `pages/ifc-viewer-multi-file.html` | Add data-i18n to 2 + title-tag + meta-description | 2 |
| `assets/css/index.css` | Dual-language `:empty::before` via `:lang(en)` selector | 1 |
| `tests/test-suites/i18n-completeness.test.js` | NEW regression test | — |
| `tests/test-runner.html` | Register test suite | — |

**Out of scope:**
- `tool-defs.js` — 71 strings stay in EN (LLM-facing tool schema, not user-facing)
- `functions/api/bug-report.js` — Cloudflare function, GitHub issue body (audience = maintainers)
- Vendor files (`xlsx.full.min.js`, etc.)
- Comments and variable identifiers in CS

## Cross-cutting

- Service Worker bump: v45 → v46 (i18n.js + translations.js changed, cache invalidate)
- PLAN.md + CHANGELOG.md `[0.10.6]` entry
- Tests: 737 baseline → ~743 expected (add ~5 regression-test cases for i18n-completeness suite)

## Risks

| Risk | Mitigation |
|---|---|
| Some translation keys may already exist but with different naming — duplicate noise | Search existing keys before adding new; reuse where possible |
| `${var}` interpolation conversion may miss edge cases (escaped quotes, nested templates) | Test each interpolation manually after change; verify rendering in browser |
| i18n.js extension change must not break existing `data-i18n` flow | Preserve existing behavior; only ADD new attribute support |
| Agent presets schema change breaks existing test or settings-modal "Start from preset" flow | Update consumer code; keep test coverage |
| Regression test false positives (e.g., CS char inside template literal that's actually a placeholder) | Allowlist comment lines + translations.js + i18n.js + targeted exclude patterns |
| EN-translated sample IDS demo content must still parse correctly | Test by loading the EN sample, verify all specifications render |

## Test strategy

1. **Unit**: i18n.js extension — test `data-i18n-title-tag` correctly updates `document.title` on language switch
2. **Existing i18n test**: still passes (key coverage)
3. **NEW regression test**: i18n-completeness — fails if any non-allowlisted CS char found in non-translations JS/HTML
4. **Manual verification (acceptance criteria)**: switch to EN, click through every page, hover every button, trigger error messages, open AI chat panel, run tools, view update banner mock — see zero CS

## Acceptance criteria

- User on EN UI sees zero CS text anywhere in app chrome (HTML, JS strings, error messages, tool responses, banners, modals, wizard).
- Agent created from preset (in EN UI) has EN system prompt.
- Sample IDS demo loaded in either CS or EN UI is EN content (international audience choice).
- Regression test runs in CI; PR fails if new CS string added outside `translations.js`.
- 737/737+ tests pass.
- external user invited to retest after merge.

## Out of scope (later)

- Per-language sample IDS variants (dynamic CS↔EN switch)
- `tool-defs.js` localization (LLM-facing)
- Comment/variable identifier translation
- HTML `title` attribute Czech fallback cleanup (engine overrides anyway)
- Other languages beyond CS/EN (DE/SK/PL etc.)
