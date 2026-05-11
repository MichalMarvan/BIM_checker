# Complete English Localization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** User in EN UI mode sees zero Czech text across all 4 pages, all UI states, all AI tool responses, all error messages.

**Architecture:** Extend i18n.js with `data-i18n-content` attribute handler (for `<meta name="description">`). Add ~100 new translation keys (CS + EN). Replace 154+ hardcoded CS strings across 20 source files with `i18n.t()` calls. Refactor `agent-presets.js` to dual-language schema. Rewrite Czech sample IDS in `parser.js` to English. Add regression test that fails CI if CS chars appear outside allowlist.

**Tech Stack:** Vanilla JS, existing `i18n.js` engine, custom Jasmine-like test framework.

**Branch:** `i18n-cleanup-complete-en` (cut from `master`, spec already committed there).

**Spec:** `docs/superpowers/specs/2026-05-11-i18n-cleanup-design.md`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/common/i18n.js` | Modify | Add `data-i18n-content` handler (for `<meta>` content attribute) |
| `assets/js/common/translations.js` | Modify | Add ~100 new keys CS+EN incrementally per task |
| `index.html` | Modify | Add `data-i18n` to title + tool-card-link × 3 + meta description |
| `pages/ids-ifc-validator.html` | Modify | Add `data-i18n` to title + empty state text + meta description |
| `pages/ids-parser-visualizer.html` | Modify | Add `data-i18n-content` to meta description (title already done) |
| `pages/ifc-viewer-multi-file.html` | Modify | Add `data-i18n` to drop-zone-subtitle + loading-subtitle + meta description |
| `assets/js/common/update-checker.js` | Modify | Replace 5 CS strings via `i18n.t()` |
| `assets/js/common/wizard.js` | Modify | Replace 7 CS strings via `i18n.t()` |
| `assets/js/common/progress-panel.js` | Modify | Replace 1 CS string |
| `assets/js/parser.js` | Modify | Replace 11 strings + rewrite Czech sample IDS to EN |
| `assets/js/validator.js` | Modify | Replace 6 strings |
| `assets/js/ifc/viewer-parser.js` | Modify | Replace 9 error strings |
| `assets/js/ai/tools/tool-validator.js` | Modify | Replace 10 strings |
| `assets/js/ai/tools/tool-agents.js` | Modify | Replace 8 strings |
| `assets/js/ai/tools/tool-storage.js` | Modify | Replace 3 strings |
| `assets/js/ai/tools/tool-settings.js` | Modify | Replace 3 strings |
| `assets/js/ai/tools/tool-ids.js` | Modify | Replace 2 strings |
| `assets/js/ai/tools/tool-ui.js` | Modify | Replace 1 string |
| `assets/js/ai/tools/tool-bsdd.js` | Modify | Replace 1 string |
| `assets/js/ai/tools/tool-presets.js` | Modify | Replace 1 string |
| `assets/js/ai/chat-storage.js` | Modify | Replace 1 string |
| `assets/js/ai-ui/settings-modal.js` | Modify | Replace 1 string + update "Start from preset" consumer |
| `assets/js/ai-ui/chat-panel.js` | Modify | Replace 1 string ("teď") |
| `assets/js/ids/ids-editor-modals.js` | Modify | Replace 1 string |
| `assets/js/ai/agent-presets.js` | Modify | Dual-language schema (CS/EN) for 5 presets |
| `assets/js/ai/tool-defs.js` | Modify | Replace 71 CS strings with EN (LLM-facing) |
| `assets/css/index.css` | Modify | Dual-language `:empty::before` via `:lang(en)` selector |
| `tests/test-suites/i18n-completeness.test.js` | **Create** | Regression test (~5 cases) |
| `tests/test-runner.html` | Modify | Register new test suite |
| `dist/...` | Mirror | `cp` all changed files |
| `sw.js` + `dist/sw.js` | Modify | Bump v45 → v46 |
| `PLAN.md` | Modify | Append i18n cleanup entry |
| `CHANGELOG.md` | Modify | `[0.10.6]` entry |

---

## Cross-cutting conventions

- All new translation keys: lowercase dot-namespaces (e.g., `viewer.error.encryptedFile`)
- Placeholders use `{name}` syntax in translations.js, called via `i18n.t('key', { name: value })`
- Each modified file may need `import { i18n } from 'relative/path/to/i18n.js'` if not already imported — verify each task
- All file edits: mirror to `dist/` after change via `cp`
- Test framework: no `.not` chaining; use `expect(x.includes(y)).toBe(false)`

### i18n.js access patterns in the codebase

Different files access i18n differently — preserve existing pattern per file:
- ES module: `import { i18n } from '../common/i18n.js'`
- Global: `window.i18n.t(...)` or `window.t(...)`
- Aliased shorthand: many files import as `t` like `const { t } = i18n` — verify per file

Convention used in this plan: when inserting new `i18n.t()` calls, use the same access pattern already used elsewhere in that file. If unsure, prefer `window.i18n.t(...)`.

---

## Task 1: i18n.js engine extension + page-level translations

**Files:**
- Modify: `assets/js/common/i18n.js`
- Modify: `assets/js/common/translations.js`
- Modify: `index.html`, `pages/ids-ifc-validator.html`, `pages/ids-parser-visualizer.html`, `pages/ifc-viewer-multi-file.html`

- [ ] **Step 1: Add `data-i18n-content` handler in `i18n.js` `updatePage()`**

In `assets/js/common/i18n.js`, find the section after `data-i18n-rows` handler (around line 186, just before the lang/data-lang attribute lines). Insert this new block:

```js
        // 5b. Content attributes (e.g., <meta name="description" content="..." data-i18n-content="page.meta.description.x">)
        document.querySelectorAll('[data-i18n-content]').forEach(el => {
            const key = el.getAttribute('data-i18n-content');
            el.setAttribute('content', this.t(key));
        });
```

- [ ] **Step 2: Add page-level keys to `translations.js`**

Find the `cs:` section and add to it (alphabetical position is fine — just append into the right namespace block):

```js
        // Page titles (in <title> tag) — Phase i18n cleanup
        'page.title.index': 'BIM Checker — Nástroje pro IFC a IDS',
        'page.title.validator': 'BIM Checker — IDS-IFC Validátor',
        'page.title.parser': 'BIM Checker — IDS Parser a Vizualizér',
        'page.title.viewer': 'BIM Checker — IFC Multi-File Viewer',

        // Meta descriptions
        'page.meta.description.index': 'Profesionální nástroje pro validaci a analýzu BIM dat (IFC a IDS). Validátor, parser, viewer.',
        'page.meta.description.validator': 'Validace IFC modelů proti IDS specifikacím. Detailní výsledky, statistiky, Excel export.',
        'page.meta.description.parser': 'Zobrazení a analýza IDS (Information Delivery Specification) souborů. Stromová struktura, raw XML, XSD validace.',
        'page.meta.description.viewer': 'Pokročilý prohlížeč pro více IFC souborů najednou. Sjednocená tabulka entit, vyhledávání, správa PSet, CSV export.',

        // Home tool card link (shared by 3 tool cards on homepage)
        'home.toolLink': 'Otevřít nástroj →',

        // Viewer-specific HTML text
        'viewer.dropHint': 'nebo klikněte pro výběr',
        'viewer.loadingStatus': 'Prosím čekejte...',

        // Validator empty-state hint text (inside <p data-i18n="validator.group.clickToAdd">)
        // — already a key, no change needed (existing 'validator.group.clickToAdd')
```

Find the `en:` section and add matching keys:

```js
        // Page titles
        'page.title.index': 'BIM Checker — Tools for IFC and IDS',
        'page.title.validator': 'BIM Checker — IDS-IFC Validator',
        'page.title.parser': 'BIM Checker — IDS Parser & Visualizer',
        'page.title.viewer': 'BIM Checker — IFC Multi-File Viewer',

        // Meta descriptions
        'page.meta.description.index': 'Professional tools for BIM data validation and analysis (IFC and IDS). Validator, parser, viewer.',
        'page.meta.description.validator': 'Validate IFC models against IDS specifications. Detailed results, statistics, Excel export.',
        'page.meta.description.parser': 'View and analyze IDS (Information Delivery Specification) files. Tree structure, raw XML, XSD validation.',
        'page.meta.description.viewer': 'Advanced viewer for multiple IFC files at once. Unified entity table, search, PSet management, CSV export.',

        // Home tool card link
        'home.toolLink': 'Open tool →',

        // Viewer-specific HTML text
        'viewer.dropHint': 'or click to select',
        'viewer.loadingStatus': 'Please wait...',
```

- [ ] **Step 3: Update `index.html`**

Change `<title>BIM Checker - Nástroje pro práci s IFC a IDS</title>` to:
```html
<title data-i18n="page.title.index">BIM Checker - Nástroje pro práci s IFC a IDS</title>
```

Find `<meta name="description" content="..."` (around line 13, current EN content), and add `data-i18n-content`:
```html
<meta name="description" content="Professional tools for BIM data validation and analysis (IFC and IDS). Validator, parser, viewer." data-i18n-content="page.meta.description.index">
```

For all 3 tool-card-link spans (around lines 421, 448, 474), change:
```html
<span class="tool-card-link">Otevřít nástroj →</span>
```
to:
```html
<span class="tool-card-link" data-i18n="home.toolLink">Otevřít nástroj →</span>
```

- [ ] **Step 4: Update `pages/ids-ifc-validator.html`**

Change `<title>IDS-IFC Validátor</title>` (line 8) to:
```html
<title data-i18n="page.title.validator">IDS-IFC Validátor</title>
```

Find `<meta name="description"...` and add `data-i18n-content="page.meta.description.validator"`.

Validator empty state — the brief reports `<p data-i18n="validator.group.clickToAdd">Klikněte na "➕ Přidat validační skupinu" pro začátek</p>` containing inline `"➕ Přidat..."`. The text is already keyed; no source change needed.

- [ ] **Step 5: Update `pages/ids-parser-visualizer.html`**

Title is already `<title data-i18n="parser.title"></title>` — change to use new key:
```html
<title data-i18n="page.title.parser"></title>
```

Add `data-i18n-content="page.meta.description.parser"` to the `<meta name="description">` tag.

- [ ] **Step 6: Update `pages/ifc-viewer-multi-file.html`**

Title is already `<title data-i18n="viewer.title"></title>` — change to:
```html
<title data-i18n="page.title.viewer"></title>
```

Find `<p class="drop-zone-subtitle">nebo klikněte pro výběr</p>` (line ~156) and change to:
```html
<p class="drop-zone-subtitle" data-i18n="viewer.dropHint">or click to select</p>
```

Find `<p class="loading-subtitle" id="loadingStatus">Prosím čekejte...</p>` (line ~171) and change to:
```html
<p class="loading-subtitle" id="loadingStatus" data-i18n="viewer.loadingStatus">Please wait...</p>
```

Add `data-i18n-content="page.meta.description.viewer"` to the `<meta name="description">` tag.

- [ ] **Step 7: Mirror dist**
```bash
cp assets/js/common/i18n.js dist/assets/js/common/i18n.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
cp index.html dist/index.html
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
```

- [ ] **Step 8: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 737/737 (no new tests yet, no regressions).

- [ ] **Step 9: Commit**
```bash
git add assets/js/common/i18n.js assets/js/common/translations.js index.html pages/*.html dist/
git commit -m "feat(i18n): add data-i18n-content + page-level translations + HTML hookup"
```

---

## Task 2: update-checker.js + wizard.js — HIGH visibility

**Files:**
- Modify: `assets/js/common/update-checker.js`
- Modify: `assets/js/common/wizard.js`
- Modify: `assets/js/common/translations.js` (add missing wizard keys if any)

- [ ] **Step 1: Read `update-checker.js` lines 60-90**

```bash
sed -n '60,90p' assets/js/common/update-checker.js
```

Confirm hardcoded CS strings present. Note current i18n import style (if any) at top of file.

- [ ] **Step 2: Replace 5 CS strings in `update-checker.js`**

In `assets/js/common/update-checker.js`, change line 69:
```html
<span class="update-notification-title" data-i18n="update.newVersion">Nová verze k dispozici!</span>
```
to:
```html
<span class="update-notification-title" data-i18n="update.newVersion">${i18n.t('update.newVersion')}</span>
```

Change line 70 (close button aria-label):
```html
<button class="update-notification-close" aria-label="Zavřít">&times;</button>
```
to:
```html
<button class="update-notification-close" aria-label="${i18n.t('update.close')}" data-i18n-aria-label="update.close">&times;</button>
```

For line 77 (download button):
```html
<a href="${releaseUrl}" target="_blank" rel="noopener noreferrer" class="update-notification-btn primary" data-i18n="update.download">Stáhnout novou verzi</a>
```
Change `Stáhnout novou verzi` to `${i18n.t('update.download')}`.

For line 78 (later button):
```html
<button class="update-notification-btn secondary update-notification-later" data-i18n="update.later">Později</button>
```
Change to use `${i18n.t('update.later')}`.

- [ ] **Step 3: Verify i18n keys exist in translations.js**

Open `assets/js/common/translations.js`, search for `update.newVersion`, `update.download`, `update.later`. If `update.close` doesn't exist, add it:

```js
// cs
'update.close': 'Zavřít',
// en
'update.close': 'Close',
```

Also extend `data-i18n-aria-label` handler in `i18n.js` if not already there:

In `i18n.js` `updatePage()`, after the title handler (around line 179), add:
```js
        // 3b. aria-label attributes (e.g., <button data-i18n-aria-label="update.close" aria-label="Close">)
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            el.setAttribute('aria-label', this.t(key));
        });
```

- [ ] **Step 4: Replace 7 CS strings in `wizard.js`**

In `assets/js/common/wizard.js`, locate each hardcoded CS string and replace with `this.i18n.t(...)` or `i18n.t(...)` (use whichever pattern the file uses).

Line 367: `<span data-i18n="wizard.help.title">Nápověda</span>` — already has data-i18n, just verify the fallback text is harmless (engine overwrites). NO ACTION needed, but if string template includes the CS text inside `${...}`, replace inner content with `${i18n.t('wizard.help.title')}`.

Line 635:
```js
'Nový zde? Klikni pro průvodce!';
```
Replace with:
```js
this.i18n ? this.i18n.t('wizard.tooltip.newHere') : 'New here? Click for tour!';
```

Add to translations.js:
```js
// cs
'wizard.tooltip.newHere': 'Nový zde? Klikni pro průvodce!',
// en
'wizard.tooltip.newHere': 'New here? Click for tour!',
```

Line 753:
```js
i18n ? i18n.t('wizard.completed') : 'Průvodce dokončen!'
```
The fallback string "Průvodce dokončen!" — change to English: `'Tour complete!'`.

Verify `wizard.completed` exists in translations.js with both CS+EN values.

Other hardcoded strings inside template literals (Spustit průvodce, O této stránce, Časté otázky, Klávesové zkratky) — they appear to be DEFAULT/FALLBACK text inside `data-i18n` attributes (lines 367-414). The engine overwrites on language load. If the EN fallback (string itself) is also CS, change it to EN per spec.

For each: change inner fallback text to EN. Example:
```html
<span data-i18n="wizard.help.title">Nápověda</span>
```
to:
```html
<span data-i18n="wizard.help.title">Help</span>
```

Apply this pattern to all 5 wizard fallback strings (lines 367, 381, 391, 403, 414).

- [ ] **Step 5: Mirror dist**
```bash
cp assets/js/common/update-checker.js dist/assets/js/common/update-checker.js
cp assets/js/common/wizard.js dist/assets/js/common/wizard.js
cp assets/js/common/i18n.js dist/assets/js/common/i18n.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
```

- [ ] **Step 6: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 737/737.

- [ ] **Step 7: Commit**
```bash
git add assets/js/common/update-checker.js assets/js/common/wizard.js assets/js/common/i18n.js assets/js/common/translations.js dist/
git commit -m "feat(i18n): localize update-checker + wizard (12 strings) + aria-label handler"
```

---

## Task 3: parser.js — strings + rewrite Czech sample IDS to EN

**Files:**
- Modify: `assets/js/parser.js`
- Modify: `assets/js/common/translations.js`

- [ ] **Step 1: Replace 4 utility strings (lines 446, 462, 462)**

Line 446 — replace Czech key in regex-explain dict:
```js
'sejmutí ornice': `${t('regex.explain.exactText')} "sejmutí ornice"`,
```
Replace with English-keyed entry:
```js
'topsoil removal': `${t('regex.explain.exactText')} "topsoil removal"`,
```
(Or keep both for backwards compat if user-facing — verify by checking how the dict is used. If for explanation of pattern matches in user UI, EN-only is fine.)

Line 462:
```js
if (pattern.includes('á-ž') || pattern.includes('Á-Ž')) {
```
Keep this — it's a pattern detection, not a user-facing string. CS chars here are intentional for the algorithm.

- [ ] **Step 2: Rewrite sample IDS XML (lines 699-823) to English**

The sample IDS contains hardcoded Czech XML strings. Replace with EN equivalents:

```js
        const sampleIDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
    <ids:info>
        <ids:title>Sample IDS — Complex Requirements</ids:title>
        <ids:author>ids@checkthebim.com</ids:author>
        <ids:version>1.0</ids:version>
        <ids:description>Example IDS file with various requirement types including regex patterns</ids:description>
        <ids:date>2026-05-11</ids:date>
    </ids:info>
    <ids:specifications>
        <!-- Specification 1: Fire safety properties of walls -->
        <ids:specification name="Wall fire safety properties" ifcVersion="IFC4">
```

Continue for the remaining specs:
- `Protipožární vlastnosti stěn` → `Wall fire safety properties`
- `Kódování místností` → `Room coding`
- `Nosné stěny` → `Load-bearing walls`
- `Železobeton` → `Reinforced concrete` (option value)
- `Identifikace zařízení` → `Equipment identification`

Read the existing sample (lines 699-823 in current parser.js), and provide EN replacement for every CS string within. Keep XML structure identical, only translate text content.

- [ ] **Step 3: Mirror dist**
```bash
cp assets/js/parser.js dist/assets/js/parser.js
```

- [ ] **Step 4: Run tests + manual check**
```bash
node tests/run-tests.js 2>&1 | tail -5
```

Then manually verify in browser: open parser, click "Load sample IDS", confirm EN content displays.

- [ ] **Step 5: Commit**
```bash
git add assets/js/parser.js dist/assets/js/parser.js
git commit -m "feat(i18n): rewrite Czech sample IDS in parser.js to English (international audience)"
```

---

## Task 4: viewer-parser.js error messages

**Files:**
- Modify: `assets/js/ifc/viewer-parser.js`
- Modify: `assets/js/common/translations.js`

- [ ] **Step 1: Add 9 new translation keys**

In `translations.js` (`cs:` section):
```js
        // IFC viewer parser errors (Phase i18n cleanup)
        'viewer.error.encryptedFile': 'Soubor je zašifrovaný (Microsoft Intune). Dešifrujte ho před nahráním.',
        'viewer.error.invalidIfcHeader': 'Neplatný IFC formát — soubor neobsahuje standardní IFC hlavičku.',
        'viewer.error.noDataSection': 'Neplatný IFC formát — soubor neobsahuje datovou sekci.',
        'viewer.warn.largeFile': '⚠️ Velmi velký soubor ({sizeMB} MB)!\n\n',
        'viewer.warn.largeFileExplain': 'Pro optimalizaci budou přeskočeny geometrické entity (viewer je nepotřebuje pro zobrazení properties).\n\n',
        'viewer.warn.largeFileContinue': 'Chcete pokračovat?',
        'viewer.warn.cancelled': 'Načítání zrušeno uživatelem.',
        'viewer.log.largeFileOptimized': '[IFC Parser] Velký soubor ({sizeMB} MB) — používám optimalizovaný parser.',
        'viewer.log.skippedGeometry': '[IFC Parser] Přeskočeno {count} geometrických entit pro optimalizaci.',
```

In `en:` section:
```js
        'viewer.error.encryptedFile': 'File is encrypted (Microsoft Intune). Decrypt it before uploading.',
        'viewer.error.invalidIfcHeader': 'Invalid IFC format — file does not contain a standard IFC header.',
        'viewer.error.noDataSection': 'Invalid IFC format — file does not contain a data section.',
        'viewer.warn.largeFile': '⚠️ Very large file ({sizeMB} MB)!\n\n',
        'viewer.warn.largeFileExplain': 'For optimization, geometry entities will be skipped (the viewer does not need them to display properties).\n\n',
        'viewer.warn.largeFileContinue': 'Continue?',
        'viewer.warn.cancelled': 'Loading cancelled by user.',
        'viewer.log.largeFileOptimized': '[IFC Parser] Large file ({sizeMB} MB) — using optimized parser.',
        'viewer.log.skippedGeometry': '[IFC Parser] Skipped {count} geometry entities for optimization.',
```

- [ ] **Step 2: Replace 9 CS strings in viewer-parser.js**

In `assets/js/ifc/viewer-parser.js`, replace each hardcoded CS string with `i18n.t()` call. First, verify i18n import — if missing, add at top:
```js
import { i18n } from '../common/i18n.js';
```

Replacements:

Line 267:
```js
message: 'Soubor je zašifrovaný (Microsoft Intune). Dešifrujte ho před nahráním.'
```
→
```js
message: i18n.t('viewer.error.encryptedFile')
```

Line 276:
```js
message: 'Neplatný IFC formát - soubor neobsahuje standardní IFC hlavičku.'
```
→
```js
message: i18n.t('viewer.error.invalidIfcHeader')
```

Line 284:
```js
message: 'Neplatný IFC formát - soubor neobsahuje datovou sekci.'
```
→
```js
message: i18n.t('viewer.error.noDataSection')
```

Line 512-515 (multi-line concat):
```js
`⚠️ Velmi velký soubor (${sizeMB} MB)!\n\n` +
'Pro optimalizaci budou přeskočeny geometrické entity (viewer je nepotřebuje pro zobrazení properties).\n\n' +
'Chcete pokračovat?'
```
→
```js
i18n.t('viewer.warn.largeFile', { sizeMB }) +
i18n.t('viewer.warn.largeFileExplain') +
i18n.t('viewer.warn.largeFileContinue')
```

Line 518:
```js
throw new Error('Načítání zrušeno uživatelem.');
```
→
```js
throw new Error(i18n.t('viewer.warn.cancelled'));
```

Line 522 (console.info):
```js
console.info(`[IFC Parser] Velký soubor (${sizeMB} MB) - používám optimalizovaný parser.`);
```
→
```js
console.info(i18n.t('viewer.log.largeFileOptimized', { sizeMB }));
```

Line 609 (console.info):
```js
console.info(`[IFC Parser] Přeskočeno ${skippedEntities.toLocaleString()} geometrických entit pro optimalizaci.`);
```
→
```js
console.info(i18n.t('viewer.log.skippedGeometry', { count: skippedEntities.toLocaleString() }));
```

- [ ] **Step 3: Mirror + tests + commit**
```bash
cp assets/js/ifc/viewer-parser.js dist/assets/js/ifc/viewer-parser.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js 2>&1 | tail -5
git add assets/js/ifc/viewer-parser.js assets/js/common/translations.js dist/
git commit -m "feat(i18n): localize viewer-parser.js error messages (9 strings)"
```

---

## Task 5: validator.js + progress-panel.js + settings-modal.js + chat-panel.js + ids-editor-modals.js

**Files:**
- Modify: `assets/js/validator.js` (6 strings)
- Modify: `assets/js/common/progress-panel.js` (1 string)
- Modify: `assets/js/ai-ui/settings-modal.js` (1 string)
- Modify: `assets/js/ai-ui/chat-panel.js` (1 string)
- Modify: `assets/js/ids/ids-editor-modals.js` (1 string)
- Modify: `assets/js/common/translations.js` (add ~10 keys)

- [ ] **Step 1: Add translation keys**

In `translations.js`:

cs:
```js
'validator.results.lineLabel': 'Řádek',
'validator.results.fileCountLabel': 'souborů',
'validator.results.fileCountSingular': 'soubor',
'progress.completedCount': '✓ {count} dokončeno',
'settings.modal.errorNoModel': 'Vyber nebo zadej model agenta — bez modelu API odmítne request.',
'chat.time.now': 'teď',
```

en:
```js
'validator.results.lineLabel': 'Line',
'validator.results.fileCountLabel': 'files',
'validator.results.fileCountSingular': 'file',
'progress.completedCount': '✓ {count} done',
'settings.modal.errorNoModel': 'Select or enter an agent model — without a model, the API rejects the request.',
'chat.time.now': 'now',
```

For `ids-editor-modals.js` line 167 — first find what the actual CS string is via grep:
```bash
grep -n "[áčďéěíňóřšťúůýž]" /home/michal/work/BIM_checker/assets/js/ids/ids-editor-modals.js
```
Add appropriate key + i18n.t() call.

- [ ] **Step 2: Replace strings in `validator.js`**

Line 1534:
```js
<li><strong>${e.line ? 'Řádek ' + e.line + ': ' : ''}</strong>${escapeHtml(e.message)}</li>
```
→
```js
<li><strong>${e.line ? i18n.t('validator.results.lineLabel') + ' ' + e.line + ': ' : ''}</strong>${escapeHtml(e.message)}</li>
```

Line 2583:
```js
document.getElementById('currentFile').textContent = `${t('validator.loading.validating')} ${ifcFiles.length} IFC ${ifcFiles.length === 1 ? 'soubor' : 'souborů'}…`;
```
→
```js
document.getElementById('currentFile').textContent = `${t('validator.loading.validating')} ${ifcFiles.length} IFC ${ifcFiles.length === 1 ? t('validator.results.fileCountSingular') : t('validator.results.fileCountLabel')}…`;
```

Lines 2638, 2648, 2649 — these have `data-i18n` attributes already. Just change inner fallback text to English:
```html
<h2 data-i18n="presets.saveModal.title">Save preset</h2>
<button class="btn btn-secondary" id="savePresetCancel" data-i18n="presets.saveModal.cancel">Cancel</button>
<button class="btn btn-primary" id="savePresetConfirm" data-i18n="presets.saveModal.save">Save</button>
```

- [ ] **Step 3: Replace string in `progress-panel.js` line 126**

```js
headerHtml = `<div class="validation-progress__completed">✓ ${completedFiles.length} dokončeno</div>`;
```
→
```js
headerHtml = `<div class="validation-progress__completed">${i18n.t('progress.completedCount', { count: completedFiles.length })}</div>`;
```

Verify i18n import — add if missing.

- [ ] **Step 4: Replace string in `settings-modal.js` line 256**

```js
ErrorHandler.error('Vyber nebo zadej model agenta — bez modelu API odmítne request.');
```
→
```js
ErrorHandler.error(i18n.t('settings.modal.errorNoModel'));
```

- [ ] **Step 5: Replace string in `chat-panel.js` line 411**

```js
if (diff < 60000) return 'teď';
```
→
```js
if (diff < 60000) return i18n.t('chat.time.now');
```

- [ ] **Step 6: Replace string in `ids-editor-modals.js`** (per grep result from Step 1)

Apply same pattern.

- [ ] **Step 7: Mirror + test + commit**
```bash
cp assets/js/validator.js dist/assets/js/validator.js
cp assets/js/common/progress-panel.js dist/assets/js/common/progress-panel.js
cp assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
cp assets/js/ai-ui/chat-panel.js dist/assets/js/ai-ui/chat-panel.js
cp assets/js/ids/ids-editor-modals.js dist/assets/js/ids/ids-editor-modals.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js 2>&1 | tail -5
git add assets/js/validator.js assets/js/common/progress-panel.js assets/js/ai-ui/settings-modal.js assets/js/ai-ui/chat-panel.js assets/js/ids/ids-editor-modals.js assets/js/common/translations.js dist/
git commit -m "feat(i18n): localize validator + progress-panel + settings-modal + chat-panel + ids-editor (10 strings)"
```

---

## Task 6: AI tool-*.js files + chat-storage.js (8 files, ~30 strings)

**Files:**
- Modify: `assets/js/ai/tools/tool-validator.js` (10 strings)
- Modify: `assets/js/ai/tools/tool-agents.js` (8 strings)
- Modify: `assets/js/ai/tools/tool-storage.js` (3 strings)
- Modify: `assets/js/ai/tools/tool-settings.js` (3 strings)
- Modify: `assets/js/ai/tools/tool-ids.js` (2 strings)
- Modify: `assets/js/ai/tools/tool-ui.js` (1 string)
- Modify: `assets/js/ai/tools/tool-bsdd.js` (1 string)
- Modify: `assets/js/ai/tools/tool-presets.js` (1 string)
- Modify: `assets/js/ai/chat-storage.js` (1 string)
- Modify: `assets/js/common/translations.js` (~30 new keys under `ai.tool.*` namespace)

- [ ] **Step 1: Add translation keys**

In `translations.js` cs:
```js
// AI tool responses (Phase i18n cleanup)
'ai.tool.validator.viewerOnly': 'Výsledky validace jsou viditelné jen na stránce Validator.',
'ai.tool.validator.notRun': 'Validace nebyla spuštěna nebo výsledky chybí.',
'ai.tool.validator.deleteGroupConfirm': 'Smazat validační skupinu #{n}?',
'ai.tool.validator.switchingToValidator': 'Přepínám na Validator a spouštím validaci. Chat panel se po obnovení stránky zavře, ale výsledky uvidíš v UI.',
'ai.tool.validator.validationStarted': 'Validace spuštěna. Výsledky uvidíš v panelu.',
'ai.tool.validator.failuresReadOnly': 'Failures lze číst pouze na stránce Validator (po spuštění validace).',
'ai.tool.validator.notRunShort': 'Validace nebyla spuštěna.',
'ai.tool.validator.excelExportPageOnly': 'Excel export funguje jen na Validator stránce po spuštění validace.',
'ai.tool.validator.exportNotAvailable': 'exportToXLSX není dostupný — validace nebyla spuštěna nebo strana je špatně načtená.',
'ai.tool.validator.exportTriggered': 'Export spuštěn — soubor by se měl stáhnout do tvého OS.',

'ai.tool.agents.noActive': 'Žádný agent právě neřídí chat.',
'ai.tool.agents.activeNotFound': 'Aktivní agent nebyl nalezen v úložišti.',
'ai.tool.agents.missingIdentifier': 'Zadej buď id nebo name.',
'ai.tool.agents.cannotModifyActive': 'Aktuálně běžící agent nelze měnit. Přepni se na jiného agenta nebo to udělej v UI.',
'ai.tool.agents.notFound': 'Agent s tímto id neexistuje.',
'ai.tool.agents.cannotDeleteActive': 'Aktuálně běžící agent nelze smazat.',
'ai.tool.agents.lastAgent': 'Nelze smazat posledního zbývajícího agenta.',

'ai.tool.storage.cannotRenameRoot': 'Kořenovou složku nelze přejmenovat.',
'ai.tool.storage.cannotDeleteRoot': 'Kořenovou složku nelze smazat.',
'ai.tool.storage.sizeDeltaWarning': ' POZOR: nová velikost se liší o {pct}%.',

'ai.tool.settings.wizardSubpagesOnly': 'Průvodce je dostupný jen na podstránkách (validator/parser/viewer).',
'ai.tool.settings.installPromptNotReady': 'Browser instalační prompt zatím není připraven, zkuste později.',

'ai.tool.ids.generatorNotAvailable': 'IDS XML generator není načtený na této stránce.',
'ai.tool.ids.xsdValidatorNotAvailable': 'XSD validátor není k dispozici (jen na podstránkách).',

'ai.tool.ui.pageRedirect': 'Stránka se nyní přesměruje. Chat panel se zavře, otevřete jej znovu po načtení.',
'ai.tool.bsdd.disabled': 'bSDD integrace zatím není zapojena. Implementace přijde v další fázi.',
'ai.tool.presets.noGroups': 'Nejsou žádné skupiny k uložení (validator je prázdný a žádný last-session preset).',

'chat.emptyConversation': '(prázdná konverzace)',
```

In `translations.js` en (matching keys with EN values):
```js
'ai.tool.validator.viewerOnly': 'Validation results are only visible on the Validator page.',
'ai.tool.validator.notRun': 'Validation has not been run or results are missing.',
'ai.tool.validator.deleteGroupConfirm': 'Delete validation group #{n}?',
'ai.tool.validator.switchingToValidator': 'Switching to Validator and starting validation. Chat panel will close after page reload, but you will see results in the UI.',
'ai.tool.validator.validationStarted': 'Validation started. You will see results in the panel.',
'ai.tool.validator.failuresReadOnly': 'Failures can only be read on the Validator page (after running validation).',
'ai.tool.validator.notRunShort': 'Validation has not been run.',
'ai.tool.validator.excelExportPageOnly': 'Excel export only works on the Validator page after running validation.',
'ai.tool.validator.exportNotAvailable': 'exportToXLSX is not available — validation has not been run or page loaded incorrectly.',
'ai.tool.validator.exportTriggered': 'Export started — the file should download to your OS.',

'ai.tool.agents.noActive': 'No agent is currently driving the chat.',
'ai.tool.agents.activeNotFound': 'Active agent was not found in storage.',
'ai.tool.agents.missingIdentifier': 'Provide either id or name.',
'ai.tool.agents.cannotModifyActive': 'The currently running agent cannot be modified. Switch to another agent or do it in the UI.',
'ai.tool.agents.notFound': 'Agent with this id does not exist.',
'ai.tool.agents.cannotDeleteActive': 'The currently running agent cannot be deleted.',
'ai.tool.agents.lastAgent': 'Cannot delete the last remaining agent.',

'ai.tool.storage.cannotRenameRoot': 'The root folder cannot be renamed.',
'ai.tool.storage.cannotDeleteRoot': 'The root folder cannot be deleted.',
'ai.tool.storage.sizeDeltaWarning': ' WARNING: new size differs by {pct}%.',

'ai.tool.settings.wizardSubpagesOnly': 'The tour is only available on subpages (validator/parser/viewer).',
'ai.tool.settings.installPromptNotReady': 'Browser install prompt is not ready yet, try later.',

'ai.tool.ids.generatorNotAvailable': 'IDS XML generator is not loaded on this page.',
'ai.tool.ids.xsdValidatorNotAvailable': 'XSD validator is not available (only on subpages).',

'ai.tool.ui.pageRedirect': 'The page will redirect now. The chat panel will close, reopen it after loading.',
'ai.tool.bsdd.disabled': 'bSDD integration is not yet wired in. Implementation in next phase.',
'ai.tool.presets.noGroups': 'No groups to save (validator is empty and no last-session preset).',

'chat.emptyConversation': '(empty conversation)',
```

- [ ] **Step 2: Replace strings in each tool-*.js file**

For each file, follow this pattern (illustrated for tool-validator.js):

In `assets/js/ai/tools/tool-validator.js`, verify i18n import at top — usually `import { i18n } from '../../common/i18n.js'`. If not present, add it.

Replace each hardcoded CS message:
```js
message: 'Výsledky validace jsou viditelné jen na stránce Validator.'
```
→
```js
message: i18n.t('ai.tool.validator.viewerOnly')
```

For string with template interpolation (line 69):
```js
if (!confirm(`Smazat validační skupinu #${args.index + 1}?`)) return { cancelled: true };
```
→
```js
if (!confirm(i18n.t('ai.tool.validator.deleteGroupConfirm', { n: args.index + 1 }))) return { cancelled: true };
```

Apply this pattern to all 10 strings in tool-validator.js, 8 in tool-agents.js, 3 in tool-storage.js, etc. See spec for exact line numbers.

Each replacement is mechanical: identify CS string, look up corresponding key, replace.

- [ ] **Step 3: Mirror + test + commit**
```bash
cp assets/js/ai/tools/*.js dist/assets/js/ai/tools/
cp assets/js/ai/chat-storage.js dist/assets/js/ai/chat-storage.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js 2>&1 | tail -5
git add assets/js/ai/tools/*.js assets/js/ai/chat-storage.js assets/js/common/translations.js dist/
git commit -m "feat(i18n): localize AI tool responses (~30 strings across 9 files)"
```

---

## Task 7: agent-presets.js — dual CS/EN schema + settings-modal consumer

**Files:**
- Modify: `assets/js/ai/agent-presets.js`
- Modify: `assets/js/ai-ui/settings-modal.js` (where presets are consumed)

- [ ] **Step 1: Refactor agent-presets.js schema**

Read current file:
```bash
cat assets/js/ai/agent-presets.js
```

Schema change for each of 5 presets (Generalista, Storage Organizér, Validátor, Settings Butler, IFC Analyst):

Before:
```js
{
    id: 'generalist',
    name: 'Generalista',
    description: 'Univerzální asistent s přístupem ke všem 56 toolům.',
    icon: '🤖',
    systemPrompt: 'Jsi AI asistent v aplikaci BIM_checker. Pomáháš...',
    ...
}
```

After:
```js
{
    id: 'generalist',
    icon: '🤖',
    nameCs: 'Generalista',
    nameEn: 'Generalist',
    descriptionCs: 'Univerzální asistent s přístupem ke všem 56 toolům.',
    descriptionEn: 'General-purpose assistant with access to all 56 tools.',
    systemPromptCs: 'Jsi AI asistent v aplikaci BIM_checker. Pomáháš...',
    systemPromptEn: 'You are an AI assistant in the BIM_checker app. You help...',
    ...
}
```

Add EN translations for all 5 presets (name, description, systemPrompt).

EN versions to add:

| Preset | nameEn | descriptionEn |
|---|---|---|
| generalist | Generalist | General-purpose assistant with access to all 56 tools. |
| storage-organizer | Storage Organizer | Helps organize IFC/IDS files — folders, moves, downloads. |
| validator | Validator | Runs validations, reads results, exports to Excel. |
| settings-butler | Settings Butler | Manages app settings and AI agents. |
| ifc-analyst | IFC Analyst | Deep IFC analysis — entities, properties, comparisons. |

systemPrompts EN (concise, translates intent):
- generalist: `'You are an AI assistant in the BIM_checker app. You help with validating IFC files against IDS specifications, organizing files, generating IDS, and analyzing models. Respond in English, be concise.'`
- storage-organizer: `'You help users organize IFC and IDS files in BIM_checker storage. Create, rename, and delete folders; move files; display overviews. Respond in English, be concise.'`
- validator: `'You help users run IFC validations against IDS specifications. Build validation groups, run checks, analyze results, point to specific failures. Respond in English, be concise.'`
- settings-butler: `'You help users with BIM_checker app settings — theme, language, AI agents, tour, PWA install. Respond in English, be concise.'`
- ifc-analyst: `'You help users explore IFC file contents — find entities by type, read property sets, compare files, locate specific property values. Respond in English, be concise.'`

Add a helper function at end of file:
```js
/**
 * Get preset's locale-aware fields based on current i18n language.
 * @param {Object} preset - The preset object with _Cs and _En variants
 * @param {string} lang - Current language ('cs' or 'en')
 * @returns {Object} Resolved preset with name, description, systemPrompt fields
 */
export function resolvePreset(preset, lang) {
    const isEn = lang === 'en';
    return {
        ...preset,
        name: isEn ? preset.nameEn : preset.nameCs,
        description: isEn ? preset.descriptionEn : preset.descriptionCs,
        systemPrompt: isEn ? preset.systemPromptEn : preset.systemPromptCs,
    };
}
```

- [ ] **Step 2: Update consumers in settings-modal.js**

Find the "Start from preset" flow in `assets/js/ai-ui/settings-modal.js`. Wherever a preset is read for display (dropdown) or for agent creation, route through `resolvePreset(preset, i18n.getLanguage())`.

For example:
```js
const presets = AGENT_PRESETS.map(p => resolvePreset(p, i18n.getLanguage()));
// or for single preset:
const resolved = resolvePreset(selectedPreset, i18n.getLanguage());
```

Update the import line:
```js
import { AGENT_PRESETS, resolvePreset } from '../ai/agent-presets.js';
```

- [ ] **Step 3: Mirror + test + commit**
```bash
cp assets/js/ai/agent-presets.js dist/assets/js/ai/agent-presets.js
cp assets/js/ai-ui/settings-modal.js dist/assets/js/ai-ui/settings-modal.js
node tests/run-tests.js 2>&1 | tail -5
git add assets/js/ai/agent-presets.js assets/js/ai-ui/settings-modal.js dist/
git commit -m "feat(i18n): agent presets dual CS/EN schema with locale-aware resolution"
```

---

## Task 8: tool-defs.js — replace CS with EN (LLM-facing)

**Files:**
- Modify: `assets/js/ai/tool-defs.js`

- [ ] **Step 1: Replace all 71 hardcoded CS strings with EN equivalents**

This file contains JSON Schema tool definitions for AI function calling. The strings are tool/parameter descriptions sent to the LLM — they guide the LLM in choosing the right tool. Industry default is English.

Read the file in chunks and rewrite each description in English. The transformation is mechanical translation, no logic change.

Examples (sample):
- `'Typ souborů'` → `'File type'`
- `'Volitelný filtr — jméno nebo část cesty složky. Vrátí soubory ze složky a všech podsložek.'` → `'Optional filter — folder name or path fragment. Returns files from the folder and all subfolders.'`
- `'Vrátí seznam složek v úložišti spolu s jejich přímými soubory. Použij když uživatel mluví o složce a chceš vědět, které soubory v ní jsou.'` → `'Returns a list of folders in storage with their direct files. Use when the user talks about a folder and you want to know which files are in it.'`

For all 71 strings, apply this translation pattern. Use professional English (no awkward phrasing).

- [ ] **Step 2: Mirror + test + commit**
```bash
cp assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
node tests/run-tests.js 2>&1 | tail -5
git add assets/js/ai/tool-defs.js dist/assets/js/ai/tool-defs.js
git commit -m "feat(i18n): tool-defs.js — replace CS tool descriptions with EN (LLM-facing schema)"
```

---

## Task 9: CSS pseudo-element dual-language + regression test

**Files:**
- Modify: `assets/css/index.css`
- Create: `tests/test-suites/i18n-completeness.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Update CSS `:empty::before` for both languages**

In `assets/css/index.css`, find the rule (line 777):
```css
.file-tree-modern:empty::before {
    content: "Žádné soubory";
    display: block;
    text-align: center;
    color: var(--text-tertiary);
    font-style: italic;
    padding: var(--spacing-2xl);
}
```

Add EN variant immediately after:
```css
html[data-lang="en"] .file-tree-modern:empty::before {
    content: "No files";
}
```

- [ ] **Step 2: Create regression test**

Create `tests/test-suites/i18n-completeness.test.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('i18n-completeness — no hardcoded Czech outside allowlist', () => {
    const CS_CHARS_REGEX = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

    /**
     * Allowlist — paths matching any of these substrings can contain CS chars.
     * - translations.js: the dictionary itself
     * - i18n.js: engine code with CS comments
     * - tests/: test suites may reference CS strings for assertions
     * - vendor/: third-party
     * - agent-presets.js: contains intentional Cs variants (nameCs, systemPromptCs)
     */
    const PATH_ALLOWLIST = [
        'translations.js', 'i18n.js', 'agent-presets.js', 'vendor/', 'tests/'
    ];

    /**
     * Files to scan — explicit list to avoid recursive directory traversal in browser.
     */
    const FILES_TO_SCAN = [
        '../index.html',
        '../pages/ids-ifc-validator.html',
        '../pages/ids-parser-visualizer.html',
        '../pages/ifc-viewer-multi-file.html',
        '../assets/js/index.js',
        '../assets/js/parser.js',
        '../assets/js/validator.js',
        '../assets/js/common/update-checker.js',
        '../assets/js/common/wizard.js',
        '../assets/js/common/progress-panel.js',
        '../assets/js/ifc/viewer-parser.js',
        '../assets/js/ai/tools/tool-validator.js',
        '../assets/js/ai/tools/tool-agents.js',
        '../assets/js/ai/tools/tool-storage.js',
        '../assets/js/ai/tools/tool-settings.js',
        '../assets/js/ai/tools/tool-ids.js',
        '../assets/js/ai/tools/tool-ui.js',
        '../assets/js/ai/tools/tool-bsdd.js',
        '../assets/js/ai/tools/tool-presets.js',
        '../assets/js/ai/chat-storage.js',
        '../assets/js/ai/tool-defs.js',
        '../assets/js/ai-ui/settings-modal.js',
        '../assets/js/ai-ui/chat-panel.js',
        '../assets/js/ids/ids-editor-modals.js'
    ];

    /**
     * Strip C-style comments and line comments to allow CS in comments.
     */
    function stripComments(text) {
        return text
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
    }

    /**
     * For HTML files: strip data-i18n* element TEXT content (fallback text engine overwrites).
     * Conservative: just remove text nodes inside elements that contain a data-i18n attribute on the open tag.
     */
    function stripDataI18nFallbackText(text) {
        // Match opening tag with data-i18n attribute through closing of that text portion
        // Simplification: replace text between > and < where preceding tag has data-i18n
        // This is approximate but catches common patterns
        return text.replace(/<([a-z][a-z0-9]*)\b[^>]*\bdata-i18n[^>]*>([^<]*)</gi, '<$1>__I18N_FALLBACK__<');
    }

    it('all scanned files exist', async () => {
        for (const path of FILES_TO_SCAN) {
            const res = await fetch(path);
            expect(res.ok).toBe(true);
        }
    });

    it('no CS diacritics in JS files outside comments', async () => {
        const findings = [];
        for (const path of FILES_TO_SCAN) {
            if (!path.endsWith('.js')) continue;
            const res = await fetch(path);
            const text = stripComments(await res.text());
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                if (CS_CHARS_REGEX.test(line)) {
                    findings.push(`${path}:${i + 1}: ${line.trim().slice(0, 80)}`);
                }
            });
        }
        if (findings.length > 0) {
            console.error('CS diacritics found:\n' + findings.join('\n'));
        }
        expect(findings.length).toBe(0);
    });

    it('no CS diacritics in HTML files outside data-i18n fallback', async () => {
        const findings = [];
        for (const path of FILES_TO_SCAN) {
            if (!path.endsWith('.html')) continue;
            const res = await fetch(path);
            let text = stripComments(await res.text());
            text = stripDataI18nFallbackText(text);
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                if (CS_CHARS_REGEX.test(line)) {
                    findings.push(`${path}:${i + 1}: ${line.trim().slice(0, 80)}`);
                }
            });
        }
        if (findings.length > 0) {
            console.error('CS diacritics found:\n' + findings.join('\n'));
        }
        expect(findings.length).toBe(0);
    });
});
```

- [ ] **Step 3: Register test in test-runner.html**

After `<script src="test-suites/mobile-viewer.test.js"></script>`, add:
```html
    <script src="test-suites/i18n-completeness.test.js"></script>
```

- [ ] **Step 4: Mirror + test + commit**
```bash
cp assets/css/index.css dist/assets/css/index.css
node tests/run-tests.js 2>&1 | tail -10
```
Expected: 740-744/740-744 (737 + ~4 new test cases). All passing.

If failing — investigate which strings still slip through. Add corresponding key + replacement, re-test.

```bash
git add assets/css/index.css dist/assets/css/index.css tests/test-suites/i18n-completeness.test.js tests/test-runner.html
git commit -m "feat(i18n): regression test + CSS dual-language pseudo-element"
```

---

## Task 10: SW + docs + push + PR

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: SW v45 → v46**

In `sw.js` and `dist/sw.js`: change `bim-checker-v45` → `bim-checker-v46`.

- [ ] **Step 2: Append to PLAN.md**

After Phase 12 COMPLETE section, append:
```markdown
## i18n Complete EN Localization ✅
- [x] i18n.js engine extended with `data-i18n-content` + `data-i18n-aria-label` handlers
- [x] ~100 new translation keys CS+EN (page.title, page.meta.description, viewer.error, ai.tool.*, etc.)
- [x] 154+ hardcoded CS strings replaced via `i18n.t()` across 20 files
- [x] Sample IDS in parser.js rewritten to English (international audience)
- [x] Agent presets dual CS/EN schema with locale-aware resolution
- [x] tool-defs.js (LLM-facing) replaced CS → EN
- [x] CSS `:empty::before` dual-language via `:lang(en)` selector
- [x] Regression test enforces no CS chars outside allowlist
- [x] +N tests (737 → 7XX)

Branch: i18n-cleanup-complete-en

Trigger: LinkedIn feedback from external user on LinkedIn.
```

- [ ] **Step 3: Insert `[0.10.6]` in CHANGELOG.md**

Before `[0.10.5]`:
```markdown
## [0.10.6] - 2026-05-11

### Added
- `data-i18n-content` attribute handler in i18n.js (for `<meta>` content)
- `data-i18n-aria-label` attribute handler (for accessibility labels)
- ~100 new translation keys (CS + EN)
- Regression test enforces no CS chars in source outside translations.js / i18n.js / tests / agent-presets / vendor
- Agent presets: dual CS/EN schema (`nameCs`/`nameEn`, `systemPromptCs`/`systemPromptEn`) — locale-aware at agent creation

### Changed
- 154+ hardcoded Czech strings replaced via `i18n.t()` across 20 source files
- Sample IDS in `parser.js` rewritten to English (international audience priority)
- `tool-defs.js` LLM-facing tool descriptions translated to English (industry default)
- CSS `.file-tree-modern:empty::before` dual-language via `html[data-lang="en"]` selector
- HTML `<title>` and `<meta name="description">` localized via new attribute handlers
- SW cache bumped v45 → v46

### Fixed
- LinkedIn user-reported issue: EN UI mode no longer leaks Czech text anywhere

### Notes
- Trigger: feedback from external user on LinkedIn
- Verification: switch UI to EN, navigate all 4 pages, hover buttons, trigger errors, open AI chat → zero CS
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: all passing.

- [ ] **Step 5: Manual verification**

Open `index.html` in browser. Switch language to EN. Visit every page. Hover every button. Trigger an invalid file upload. Open AI chat (if agent exists). Verify no CS appears anywhere.

- [ ] **Step 6: Commit + push + PR**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(i18n): SW v45→v46 + PLAN/CHANGELOG"
git push
gh pr create --title "i18n: complete English localization (user feedback)" --body "..."
```

PR body should mention: the LinkedIn feedback, scope (~166 fixes), acceptance criteria, manual test plan.

Report PR URL.

---

## Self-Review

**Spec coverage:**
- All 154+ hardcoded CS strings addressed → Tasks 2-8 ✓
- 8 HTML data-i18n additions → Task 1 ✓
- 4 page-title localizations → Task 1 ✓
- Meta description localization → Task 1 ✓
- Agent presets dual schema → Task 7 ✓
- Sample IDS EN rewrite → Task 3 ✓
- CSS pseudo-element → Task 9 ✓
- Regression test → Task 9 ✓
- tool-defs.js → Task 8 ✓

**Type consistency:**
- All translation keys follow lowercase-dot convention
- `i18n.t()` calls use existing pattern per file
- New `resolvePreset()` function exports cleanly from agent-presets.js
- `data-i18n-content` handler doesn't break existing data-i18n flow

**Test count progression:**
- Baseline: 737
- After T1-T8: 737 (no new tests until T9)
- After T9: ~741 (+4 regression test cases)
- After T10: same

**Risks (from spec, with mitigation):**
- Duplicate key naming — search before adding ✓ each task says "search existing keys"
- `${var}` interpolation conversion edge cases — manual test per file ✓ Tasks include browser verification
- Engine extension breaking existing — only ADD, no rename ✓ T1 step 1 is additive only
- Agent preset schema breaks "Start from preset" — T7 includes consumer update ✓
- Regression test false positives — allowlist refined (tests/, agent-presets.js) ✓ Task 9
- EN sample IDS parse issue — T3 step 4 includes browser verification ✓

**Estimated total time:** 8 hours for thorough work
- T1 (engine + HTML + page-level keys): 1h
- T2 (update-checker + wizard): 45min
- T3 (parser.js + sample IDS rewrite): 1.5h
- T4 (viewer-parser errors): 45min
- T5 (validator + 5 misc files): 1h
- T6 (8 AI tool files): 1.5h
- T7 (agent-presets dual schema): 45min
- T8 (tool-defs.js 71 strings): 1h
- T9 (CSS + regression test): 30min
- T10 (SW + docs + verify + PR): 30min

**Out of scope:**
- HTML `title` attribute CS fallback cleanup (engine overrides — cosmetic only)
- Comments in CS (developer-facing)
- Variable identifier naming (CS variable names like `sejmutiOrnice`)
- Other languages (DE/SK/PL/etc.) — separate effort
- `functions/api/bug-report.js` — GitHub issue body for maintainers

**Final state:** ~741 tests pass, regression test gates future regressions, EN UI shows zero CS text, user invited to retest.
