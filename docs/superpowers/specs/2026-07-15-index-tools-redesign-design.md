# Spec: Sekce Nástroje na index.html — 1×4, menší karty, nové popisy

Datum: 2026-07-15 · Stav: schváleno uživatelem (brainstorming v session)

## Cíl

Čtyři karty nástrojů srovnat do jedné řady (1×4), zmenšit je a zbavit je šedých
feature štítků; jednořádkové popisy aktualizovat, aby odpovídaly dnešním
schopnostem nástrojů.

## Rozsah

### Layout (`assets/css/index.css`)
- `.tools-grid-modern`: desktop (≥1100 px) `repeat(4, 1fr)`; tablet (700–1100 px)
  `repeat(2, 1fr)` (2×2); mobil 1 sloupec (stávající breakpoint zůstává).
- Menší karty: padding `var(--spacing-lg)` místo `xl`, ikona 40 px, titulek
  o stupeň menší. Patička „Otevřít nástroj →" zarovnaná k dolní hraně (flex,
  `margin-top: auto` — už je `flex-direction: column`), aby byly patičky v lince.

### Obsah karet (`index.html` + `assets/js/common/translations.js`)
- Odstranit bloky `.tool-card-features` ze všech 4 karet (HTML) a i18n klíče
  `tools.viewer.feature1–6`, `tools.viewer3d.feature1–3`, `tools.parser.feature1–6`,
  `tools.validator.feature1–6` z obou jazyků (cs i en) — musí projít
  i18n-completeness test.
- Nové popisy (`tools.*.desc`, cs / en):
  1. IFC Multi-File Viewer — cs: „Tabulková analýza a porovnání více IFC souborů
     najednou — vyhledávání, filtry, export CSV." / en: "Tabular analysis and
     comparison of multiple IFC files at once — search, filters, CSV export."
  2. 3D Viewer — cs: „3D prohlížeč IFC modelů s podporou IFC 4.3 — federace,
     měření, řezy, osy tras a georeference." / en: "3D viewer for IFC models with
     IFC 4.3 support — federation, measurements, sections, alignments and
     georeferencing."
  3. IDS Parser a Vizualizér — cs: „Přehledné zobrazení IDS specifikací — strom
     požadavků, vysvětlení pravidel i surové XML." / en: "Clear view of IDS
     specifications — requirement tree, rule explanations and raw XML."
  4. IDS-IFC Validátor — cs: „Kontrola IFC modelů proti IDS specifikacím
     s detailními výsledky a exportem." / en: "Validation of IFC models against
     IDS specifications with detailed results and export."
- HTML defaultní texty v `index.html` aktualizovat na cs verze (stránka je
  CZ-first, i18n je přepisuje).
- Badge „Nové · Alpha" na 3D kartě zůstává; pořadí karet beze změny.

### Technické
- `sw.js`: CACHE_VERSION v147 → v148 (index.html i index.css jsou v ASSETS_TO_CACHE).
- `node scripts/build-dist.cjs` (dist mirror).
- Verifikace: `node tests/run-tests.js` (vč. i18n-completeness) + vizuální
  kontrola přes Chrome MCP na desktopové šířce (1×4), ~900 px (2×2) a mobilu
  (1 sloupec).

## Mimo rozsah

Per-file akce „Otevřít ve 3D" ve storage stromu; přeuspořádání karet; změny
jiných sekcí index.html.
