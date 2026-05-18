# IDS Auto-Fix on Load — Design

**Status:** Draft
**Date:** 2026-05-18
**Author:** Michal Marvan + Claude

## Problem

When a user uploads an IDS file that does not conform to the IDS 1.0 XSD schema, the current behaviour is passive: an XSD validation banner appears with a list of errors and line links. The user must then either edit the raw XML manually or accept the errors. There is no path to fix common schema violations from the UI.

A second, related issue: the bundled sample IDS (`loadSampleIDS()` in `assets/js/parser.js`) itself fails XSD validation — most visibly because `<author>` contains a human-readable name rather than an e-mail address — so demo users see errors on first contact with the tool.

## Goals

1. After loading an IDS that fails XSD validation, present the user with a list of detected errors and a one-click "fix" action for each error the tool knows how to resolve.
2. After the user accepts fixes, the IDS is re-validated; any remaining errors continue to surface through the existing XSD banner (no regression).
3. The shipped sample IDS passes IDS 1.0 XSD validation out of the box.

## Non-goals

- We are not implementing a general XSD-fixer for arbitrary schemas. The fix catalogue is hand-curated for the IDS 1.0 schema.
- We are not adding live inline validation to individual editor fields. The auto-fix runs at load time only (and is re-triggered if the user reloads).
- We are not auto-fixing semantic / business-logic problems (e.g., a `Pset` name that does not exist in IFC). XSD-level errors only.

## User experience

When the user loads an IDS file (via drag-and-drop, file picker, or Storage picker) and XSD validation reports errors, an `IDSAutoFixModal` opens after the parser has rendered the document. The modal shows one row per detected error with:

- a human-readable description of the error,
- a before → after preview where applicable,
- a checkbox that is enabled when the tool knows how to fix the error and disabled (with an explanatory tooltip) when it does not,
- a line-number link that jumps to the offending element in the Raw XML tab.

Footer controls:

- `[ Opravit vybrané ]` — applies only the ticked fixes.
- `[ Opravit vše ]` — ticks every fixable row and applies.
- `[ Ignorovat ]` — closes the modal; falls through to the existing XSD banner with the unmodified document.

After fixes are applied, the document is re-parsed and re-validated; the modal does not re-open during this second pass (one-shot re-entry guard). Any residual errors are shown by the pre-existing XSD banner exactly as today.

If the original document is XSD-valid, the modal does not open at all. Behaviour for valid input is unchanged.

## Architecture

Two new modules, both browser-side, no external dependencies.

### `assets/js/ids/ids-auto-fix.js`

Pure functions over an `XMLDocument`. Exposed as `window.IDSAutoFix`:

```text
analyze(xmlDoc, xmllintErrors) → FixDescriptor[]
applyFixes(xmlDoc, fixIds[]) → string   // serialised XML after fixes
```

`FixDescriptor` shape:

```text
{
  id:          string,               // stable, unique per descriptor
  category:    string,               // e.g., 'author-not-email', 'cardinality-on-entity'
  label:       string,               // translated short description
  before:      string | null,        // current value, when meaningful
  after:       string | null,        // proposed value
  lineNumber:  number | null,        // copied from xmllint error
  fixable:     boolean,              // false → checkbox disabled
  apply:       (xmlDoc) => void      // mutates the document in place
}
```

`analyze()` walks `xmllintErrors` once. For each error, a classifier tries to match the message against a known pattern. On match, the corresponding factory builds a `FixDescriptor` with `fixable: true` and a concrete `apply()` closure. On no match, a generic `{ fixable: false }` descriptor is emitted so the user still sees the error in the modal. The classifier is a list of `{ test: regex, build: (err, xmlDoc) => FixDescriptor }` entries — adding a new fix is one entry.

`applyFixes()` iterates the supplied ids in order, calls each `apply()`, then returns `new XMLSerializer().serializeToString(xmlDoc)`.

### `assets/js/ids/ids-auto-fix-modal.js`

Stateless UI component. Exposed as `window.IDSAutoFixModal`:

```text
show(descriptors) → Promise<{ action: 'fix'|'ignore', selectedIds: string[] }>
```

Builds the modal DOM from the descriptor list (or reuses an HTML template already present in `index.html` / `pages/ids-parser-visualizer.html` — see below). Wires checkboxes, the three footer buttons, line-number links, and Escape to close. Resolves the promise on any of the footer actions.

The modal HTML lives in the two pages that host the IDS parser/editor view. Styles go to `assets/css/ids-parser.css` (the visualizer page) and are reused on `index.html`.

### Integration in `assets/js/parser.js`

`runXSDValidation(xmlString)` is the existing single entry point that runs after `parseIDS()`. It is the only place we change. Pseudocode:

```text
async function runXSDValidation(xmlString) {
    if no banner element or no validator → return
    result = await IDSXSDValidator.validate(xmlString)
    if result.valid → hide banner, return

    if not _idsAutoFixSkip:
        descriptors = IDSAutoFix.analyze(currentIDSData.doc, result.errors)
        if any descriptor.fixable:
            choice = await IDSAutoFixModal.show(descriptors)
            if choice.action === 'fix':
                fixed = IDSAutoFix.applyFixes(currentIDSData.doc, choice.selectedIds)
                _idsAutoFixSkip = true
                try { parseIDS(fixed) }   // resets _idsAutoFixSkip on the way out
                finally { _idsAutoFixSkip = false }
                return

    showXSDBanner(result.errors)
}
```

`_idsAutoFixSkip` is a module-level flag that prevents the modal from re-opening on the second pass.

### Sample IDS

In `loadSampleIDS()` (`assets/js/parser.js`), replace the `<author>BIM Checker — IDS Visualizer</author>` line with a valid e-mail (`<author>info@bim-checker.example</author>`). After implementation, load the sample and confirm `IDSXSDValidator.validate()` returns `valid: true`.

If any other XSD violation is uncovered while testing the sample, fix it in the same task (the goal is "sample passes validation," not "sample matches a specific text"). Likely candidates: empty `<copyright>` or missing required attributes if any have crept in.

## Initial fix catalogue

| Category                      | Detect (xmllint message contains)                              | Fix                                                                  |
|-------------------------------|----------------------------------------------------------------|----------------------------------------------------------------------|
| `author-not-email`            | element `author` + facet `pattern` violation                   | replace text with `noreply@example.com`                              |
| `date-bad-format`             | element `date` + `xs:date` type violation                      | parse common formats (`D.M.YYYY`, `D/M/YYYY`, `YYYY/M/D`) → `YYYY-MM-DD`; if unparseable, `fixable: false` |
| `cardinality-on-entity`       | element `entity` + attribute `cardinality` not allowed         | remove the `cardinality` attribute                                   |
| `cardinality-on-applicability`| any applicability-child facet + attribute `cardinality` not allowed | remove the `cardinality` attribute on that element              |
| `missing-title`               | element `info` missing required child `title`                  | prepend `<title>Untitled IDS</title>`                                |
| `missing-ifc-version`         | element `specification` missing or invalid `ifcVersion`        | set `ifcVersion="IFC4"`                                              |
| `missing-spec-name`           | element `specification` missing `name`                         | set `name="Specification N"` where N is its 1-based position         |

Each entry in the catalogue is one classifier function and one apply function. The catalogue grows over time as we observe error messages that currently fall into the "unknown / not fixable" bucket.

## Internationalisation

Translation keys (added to both `cs` and `en` blocks of `assets/js/common/translations.js`):

```text
editor.autoFix.modalTitle
editor.autoFix.intro              // "Načtený IDS obsahuje N XSD chyb. Vyber které opravit:"
editor.autoFix.fixSelected
editor.autoFix.fixAll
editor.autoFix.ignore
editor.autoFix.unfixableHint      // tooltip on disabled checkbox
editor.autoFix.line               // "řádek {n}"
editor.autoFix.fix.authorNotEmail
editor.autoFix.fix.dateBadFormat
editor.autoFix.fix.cardinalityOnEntity
editor.autoFix.fix.cardinalityOnApplicability
editor.autoFix.fix.missingTitle
editor.autoFix.fix.missingIfcVersion
editor.autoFix.fix.missingSpecName
editor.autoFix.applied            // success toast: "Opraveno N chyb"
```

## File changes

New:
- `assets/js/ids/ids-auto-fix.js`
- `assets/js/ids/ids-auto-fix-modal.js`
- `tests/test-ids-auto-fix.js`

Modified:
- `assets/js/parser.js` — extend `runXSDValidation`, fix sample IDS author
- `assets/js/common/translations.js` — new keys (cs + en)
- `assets/css/ids-parser.css` — modal styling
- `index.html` — `<script>` tags for the two new modules, modal HTML template
- `pages/ids-parser-visualizer.html` — same script tags, same modal HTML template
- `sw.js` — `CACHE_VERSION` v58 → v59

Mirror copies in `dist/` for every modified `assets/` file (per project convention).

## Testing

The custom test framework (`tests/test-framework.js`) supports `describe` / `it` / `expect` with Puppeteer-based browser execution.

`tests/test-ids-auto-fix.js` covers `analyze()` and `applyFixes()` as pure functions against pre-built XML fixtures:

- author non-email → produces one fixable descriptor → applying the fix yields a passing XSD validation
- date `1.1.2024` → reformat to `2024-01-01`
- date `abc` → unparseable → `fixable: false`
- cardinality on entity → removed after apply
- cardinality on applicability child → removed after apply
- missing title → inserted at correct position (first child of `<info>`)
- missing `ifcVersion` → set to `IFC4`
- missing spec name → set to `Specification 1` / `Specification 2` based on order
- combined: a fixture with all of the above → one pass of `applyFixes` yields XSD-valid output

The modal component is not exercised in automated tests (DOM-heavy, low payoff). Manual UAT covers it.

## Error handling

- If `IDSXSDValidator` fails to load (network, wasm), the modal is silently skipped (`catch` already present in `runXSDValidation`). Behaviour matches today.
- If `applyFixes` throws while applying one fix, the loop continues with the remaining fixes and reports the failed ones in a warning toast. The half-fixed document is still re-parsed.
- If the second-pass parse fails (`parsererror`), we surface the existing "invalid XML" message and skip the banner.

## Open questions

None at the time of writing. The first iteration ships with the catalogue above; further fix categories are added as users report unrecognised XSD errors.

## Out of scope / future work

- Inline per-field validation in the IDS editor (e-mail, date pickers, etc.).
- Suggesting fixes based on bSDD / Pset libraries.
- Bulk import of multiple IDS files with a single combined fix report.
