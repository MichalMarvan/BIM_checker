# Index nástroje 1×4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karty nástrojů na index.html v jedné řadě 1×4, menší, bez šedých feature štítků, s aktuálními popisy.

**Architecture:** Čistě prezentační změna — HTML (odstranit feature bloky, nové default texty), translations.js (smazat feature klíče cs+en, nové desc cs+en), index.css (explicitní 4/2/1 sloupce + zmenšení karty). Žádná JS logika.

**Tech Stack:** Vanilla HTML/CSS, i18n přes `data-i18n` + translations.js.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-index-tools-redesign-design.md`.
- i18n klíče se mažou/mění VŽDY v obou jazycích (cs blok ~ř. 19–169, en blok ~ř. 1306–1456) — hlídá i18n-completeness test.
- index.html a assets/css/index.css jsou v SW ASSETS_TO_CACHE → na konci bump `sw.js` CACHE_VERSION v147 → v148 (ověř aktuální číslo).
- Na konci `node scripts/build-dist.cjs` (dist mirror) a `node tests/run-tests.js` (vše zelené).
- Vizuální kontrola přes Chrome MCP: šířky ~1400 px (1×4), ~900 px (2×2), ~400 px (1 sloupec).

---

### Task 1: Obsah — HTML + translations (feature štítky pryč, nové popisy)

**Files:**
- Modify: `index.html:397-503` (sekce `.tools-grid-modern`)
- Modify: `assets/js/common/translations.js` (cs: ř. ~19–22, 145–169; en: ř. ~1306–1309, 1432–1456)

**Interfaces:**
- Produces: karty bez `.tool-card-features`; i18n klíče `tools.*.feature*` neexistují; `tools.*.desc` mají nové texty (cs i en).

- [ ] **Step 1: index.html — u všech 4 karet smaž blok `<div class="tool-card-features">…</div>`** (u viewer karty ř. 412–419, 3d ř. 441–445, parser ř. 465–472, validator ř. 491–498) a přepiš default popisy:

```html
<!-- viewer -->
<p class="tool-card-description" data-i18n="tools.viewer.desc">
    Tabulková analýza a porovnání více IFC souborů najednou — vyhledávání, filtry, export CSV.
</p>
<!-- viewer3d -->
<p class="tool-card-description" data-i18n="tools.viewer3d.desc">
    3D prohlížeč IFC modelů s podporou IFC 4.3 — federace, měření, řezy, osy tras a georeference.
</p>
<!-- parser -->
<p class="tool-card-description" data-i18n="tools.parser.desc">
    Přehledné zobrazení IDS specifikací — strom požadavků, vysvětlení pravidel i surové XML.
</p>
<!-- validator -->
<p class="tool-card-description" data-i18n="tools.validator.desc">
    Kontrola IFC modelů proti IDS specifikacím s detailními výsledky a exportem.
</p>
```

- [ ] **Step 2: translations.js — cs blok:** smaž řádky s klíči `tools.viewer3d.feature1–3` (ř. 20–22), `tools.viewer.feature1–6` (ř. 146–151), `tools.parser.feature1–6` (ř. 155–160), `tools.validator.feature1–6` (ř. 164–169) a nastav:

```js
'tools.viewer3d.desc': '3D prohlížeč IFC modelů s podporou IFC 4.3 — federace, měření, řezy, osy tras a georeference.',
'tools.viewer.desc': 'Tabulková analýza a porovnání více IFC souborů najednou — vyhledávání, filtry, export CSV.',
'tools.parser.desc': 'Přehledné zobrazení IDS specifikací — strom požadavků, vysvětlení pravidel i surové XML.',
'tools.validator.desc': 'Kontrola IFC modelů proti IDS specifikacím s detailními výsledky a exportem.',
```

- [ ] **Step 3: translations.js — en blok:** smaž `tools.viewer3d.feature1–3` (ř. ~1307–1309), `tools.viewer.feature1–6` (~1433–1438), `tools.parser.feature1–6` (~1442–1447), `tools.validator.feature1–6` (~1451–1456) a nastav:

```js
'tools.viewer3d.desc': '3D viewer for IFC models with IFC 4.3 support — federation, measurements, sections, alignments and georeferencing.',
'tools.viewer.desc': 'Tabular analysis and comparison of multiple IFC files at once — search, filters, CSV export.',
'tools.parser.desc': 'Clear view of IDS specifications — requirement tree, rule explanations and raw XML.',
'tools.validator.desc': 'Validation of IFC models against IDS specifications with detailed results and export.',
```

- [ ] **Step 4: Ověř testy** — Run: `node tests/run-tests.js 2>&1 | tail -3` → Expected: All tests passed (i18n-completeness projde, klíče smazány symetricky). Zkontroluj i `grep -c "feature-tag" index.html` → 0 a `grep -c "tools.viewer.feature" assets/js/common/translations.js` → 0.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/js/common/translations.js
git commit -m "feat(index): karty nástrojů bez feature štítků + aktuální popisy (plán index-tools-1x4)"
```

---

### Task 2: Layout CSS + SW bump + dist + vizuální verifikace

**Files:**
- Modify: `assets/css/index.css:1000-1004` (grid), `1006-1019` (padding), `1050-1063` (ikona), `1096-1101` (titulek), `1109-1129` (smazat features CSS), `1131-1133` (footer)
- Modify: `sw.js:3` (CACHE_VERSION)

**Interfaces:**
- Consumes: HTML bez `.tool-card-features` (Task 1).

- [ ] **Step 1: index.css — grid 4/2/1 a zmenšení karet.** Nahraď:

```css
.tools-grid-modern {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-lg);
}

@media (max-width: 1100px) {
    .tools-grid-modern {
        grid-template-columns: repeat(2, 1fr);
    }
}
```

(mobilní breakpoint na ř. ~1482 už přepíná na `1fr` — zůstává). Dále v `.tool-card-modern` změň `padding: var(--spacing-xl)` → `var(--spacing-lg)`; `.tool-card-icon` 3.5rem → 2.5rem a jeho svg 2rem → 1.5rem; `.tool-card-header` margin-bottom `var(--spacing-lg)` → `var(--spacing-md)`; `.tool-card-title` font-size 1.5rem → 1.125rem, margin-bottom `var(--spacing-sm)`; `.tool-card-description` doplň `font-size: 0.875rem;`, `flex: 1;` a `margin-bottom: var(--spacing-md)` (flex:1 nahrazuje roli smazaných features — tlačí patičku dolů); smaž bloky `.tool-card-features`, `.feature-tag` a `.tool-card-modern:hover .feature-tag`; `.tool-card-footer` padding-top `var(--spacing-md)`.

- [ ] **Step 2: sw.js** — `const CACHE_VERSION = 'bim-checker-v148';` (z v147).

- [ ] **Step 3: dist + testy** — Run: `node scripts/build-dist.cjs && node tests/run-tests.js 2>&1 | tail -3` → Expected: All tests passed.

- [ ] **Step 4: Vizuální kontrola (Chrome MCP)** — otevři `index.html` přes lokální server, `resize_page` na 1400/900/400 px šířky, screenshoty: 1×4 v řadě se zarovnanými patičkami / 2×2 / 1 sloupec; konzole bez chyb. Zkontroluj i EN přepnutí (badge + popisy lokalizované).

- [ ] **Step 5: Commit**

```bash
git add assets/css/index.css sw.js dist/
git commit -m "feat(index): mřížka nástrojů 1×4 (2×2 tablet), menší karty, SW v148 (plán index-tools-1x4)"
```

---

## Self-Review

- Spec coverage: layout 4/2/1 ✓ (T2), menší karty ✓ (T2), feature štítky HTML+i18n ✓ (T1), nové popisy cs+en+HTML default ✓ (T1), badge/pořadí beze změny ✓ (žádný task na ně nesahá), SW bump + dist + vizuální kontrola ✓ (T2).
- Placeholders: žádné.
- Konzistence: třídy `.tool-card-features`/`.feature-tag` mazány v T1 (HTML) i T2 (CSS); `flex: 1` přesunut z features na description, aby patičky zůstaly zarovnané.
