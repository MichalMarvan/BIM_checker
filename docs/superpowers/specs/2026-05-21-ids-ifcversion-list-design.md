# IDS `ifcVersion` multi-version support — design

**Date:** 2026-05-21
**Status:** approved, ready for implementation plan
**Related:** GitHub issue #21, [project memory: validator-ifcversion-bug](../../../.claude/projects/-home-michal-work-BIM-checker/memory/project_validator_ifcversion_bug.md)

## Problem

The IDS 1.0 XSD defines `ifcVersion` on `<specification>` as `xs:list` of an enumeration (`IFC2X3` / `IFC4` / `IFC4X3_ADD2`). Per the buildingSMART implementer guide, a specification may target multiple IFC schema versions in a single attribute (e.g., `ifcVersion="IFC4 IFC4X3_ADD2"`). It is also a filter — the spec applies only to IFC files whose schema is in the list.

Current behavior:

- `ids-parser.js:46` stores `ifcVersion` as the raw string with no parsing.
- `validator.js:398, 448` and `validation-engine.js:293` treat it as a single value and pass it as a filename component to `IFCHierarchy.load`.
- When the value is a list (or a typo / unsupported version), the URL `assets/data/ifc-hierarchy-<value>.json` does not resolve, hosting returns HTML with HTTP 200, `r.json()` chokes on `<!DOCTYPE`, and the user sees `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` (issue #21).
- Even when the value is a single supported version, the validator loads the hierarchy of the **spec's declared version**, not the IFC file's actual schema. The spec is applied to every IFC file regardless of whether the file's schema is in the spec's list.

## Goals

1. Fix issue #21 — no more raw `<!DOCTYPE` parse errors from this code path.
2. Parse `ifcVersion` as a list per XSD.
3. Apply specifications only to IFC files whose schema is in the spec's version list (buildingSMART semantics).
4. Surface unsupported versions to the user instead of silent fallback (per implementer guide: *"the user should be made aware of the limitation"*).
5. Editor and parser view render multiple versions cleanly.
6. Round-trip via XML and Excel preserves the list.
7. AI tool defaults align with current real-world usage (both IFC4 and IFC4X3_ADD2).
8. As a related quality-of-life win, validator's Excel report gains AutoFilter and a frozen header row.

## Non-goals

- Adding support for IFC versions outside the IDS 1.0 enum (no `IFC4X3_TC1`, no `IFC4_ADD1`, etc.).
- Changing the IDS XML serialization format (still produces a space-separated string; only the array-coercion guard is added).
- Restructuring the 3D viewer pipeline; its `step-parser.js` schema detection is independent.
- New UI for cross-spec bulk editing of versions (single-spec editor only — see follow-ups).

## Data model — additive

The chosen approach is **A — additive**: keep `spec.ifcVersion` as the canonical string, add `spec.ifcVersions` as a derived array. Approach B (full conversion to array everywhere) was rejected for blast radius — ~16 callers across editor, generators, AI tools, and tests rely on the string form.

```
spec.ifcVersion  = "IFC4 IFC4X3_ADD2"   // canonical: space-separated, order from IDS XML
spec.ifcVersions = ["IFC4", "IFC4X3_ADD2"]  // derived in parser, never written independently
```

### Drift invariant (MUST hold)

> `spec.ifcVersions` is derived from `spec.ifcVersion`. The two are never written independently.

Practical rules:

- The parser is the only producer of `ifcVersions`. It re-derives on every parse.
- Editor writes only to `ifcVersion`. The next parse re-derives `ifcVersions`.
- AI tools, Excel parser, storage backend: write only to `ifcVersion`. A small helper `parseIfcVersionList(str)` exists in the parser module for consumers that need the array immediately after writing.
- A unit test enforces: after round-trip (object → XML → parse → object), `ifcVersion` and `ifcVersions` agree per the helper.

## Behavior — hybrid mismatch handling

When a spec's `ifcVersions` contains values outside the IDS 1.0 enum (`IFC2X3` / `IFC4` / `IFC4X3_ADD2`):

- If at least one declared version is supported, validation proceeds against IFC files whose schema matches a supported version; unsupported entries are reported as a warning in the spec header in UI.
- If no declared version is supported, the spec produces a hard error (with the offending values listed) and is skipped for all IFC files.

This matches the buildingSMART implementer guide and the user-confirmed "hybrid" choice.

## Validator — schema-aware matching

### IFC schema detection

`IFCParserCore.parseIFCContent(content, fileName)` currently returns an entity array with no schema metadata. Extend it to also detect `FILE_SCHEMA` from the IFC header.

- Reuse the regex from `assets/js/3d/ifc-engine/parser/step-parser.js:57`: `/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/`.
- Attach detected schema to the returned shape. Since the existing return is `Array<entity>`, attach as a non-enumerable side property or change the return to `{ entities, schema }`. **Decision: change return to `{ entities, schema }`** — explicit, type-safe, and we control all callers (3 known: `validator.js:385, 390, 2720`).
- All callers updated to destructure.
- The worker pool path (`ifc-parser.worker.js`) returns the same shape.

### Spec applicability

In `validator.js:334-345` and `:2720` (and the equivalent `validation-engine.js` path), before running validations for a `(spec, ifcFile)` pair:

```
const applies = spec.ifcVersions.includes(ifcFile.schema);
```

- `applies === true` → load hierarchy for `ifcFile.schema` (not for the first item of the list — for the file's actual schema) and run validations.
- `applies === false` → record a `skipped` entry in `specificationResults` with `status: 'skipped'` and `reason: 'ifc-version-mismatch'`. UI surfaces this distinctly from pass/fail.

### Defensive `r.json()` in `ifc-hierarchy.js`

Independently of the upstream fix, the `r.json()` failure mode at line 32-36 is hardened:

```js
.then(async r => {
    if (!r.ok) throw new Error(`Failed to load hierarchy for ${version}: HTTP ${r.status}`);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`Hierarchy fetch returned non-JSON for ${version} (${dataUrl(version)})`); }
})
```

This catches future regressions where the URL is correct but content is wrong (e.g., service-worker fallback, hosting misconfiguration).

## Editor UI

`ids-editor-modals.js:1052-1060` — replace `<select>` with three checkboxes:

```html
<div class="form-group">
    <label>{{t('editor.ifcVersion')}}</label>
    <div class="ifc-version-checkboxes">
        <label><input type="checkbox" value="IFC2X3"> IFC2X3</label>
        <label><input type="checkbox" value="IFC4"> IFC4</label>
        <label><input type="checkbox" value="IFC4X3_ADD2"> IFC4X3_ADD2</label>
    </div>
    <small>{{t('editor.ifcVersionDesc')}}</small>
</div>
```

- Checked state derived from `specData.ifcVersions`.
- On save: `ifcVersion = [...checkboxes].filter(c => c.checked).map(c => c.value).join(' ')`.
- Validation: at least one must be checked (XSD `minLength="1"` on the list). If none, show inline error and block save.
- CSS class `ifc-version-checkboxes` styles labels inline with `display: flex; gap: 12px;`.

## Parser view badge

`parser.js:280` — replace single badge with a loop:

```js
${spec.ifcVersions.map(v => `<span class="spec-badge">${escapeHtml(v)}</span>`).join('')}
```

- Existing `.spec-badges { display: flex; gap: 8px; }` container handles spacing.
- Single-version specs render visually identical to today.
- 2- or 3-version specs render multiple badges side by side.
- This is an initial design — user noted it may need iteration once seen with real data; treat as v1.

## Round-trip — XML and Excel

### XML generator

`ids-xml-generator.js:74` already does `${specData.ifcVersion || 'IFC4'}` and runs through `escapeXml`. Space passes through unchanged. The XSD permits space-separated lists.

Small defensive change: coerce arrays to space-separated strings before escaping, so accidental array inputs from AI tools or future callers don't serialize as `IFC4,IFC4X3_ADD2` (default Array.toString):

```js
const versionStr = Array.isArray(specData.ifcVersion)
    ? specData.ifcVersion.join(' ')
    : (specData.ifcVersion || 'IFC4');
xml += ` ifcVersion="${this.escapeXml(versionStr)}"`;
```

### Excel generator

`ids-excel-generator.js:75` — already serializes `spec.ifcVersion` as-is to the `ifcVersion` column. Space-separated string format chosen for parity with XML. **No change needed**.

### Excel parser

`ids-excel-parser.js:67, 133` — produces `ifcVersion` string from the column. The IDS parser layer above re-derives `ifcVersions` from it. **No change needed**.

## AI tool defaults

`tool-ids.js:105, 151` — change default for newly created specifications:

- Before: `args.ifcVersion || 'IFC4X3_ADD2'`
- After: `args.ifcVersion || 'IFC4 IFC4X3_ADD2'`

Schema for AI tool inputs accepts either string or array; normalize to space-separated string on intake. Documented in the tool's JSON schema description.

## Storage / AI tool surface

`tool-storage.js:325` currently reads `ids?.info?.ifcVersion`, but `info` has no `ifcVersion` field — the attribute lives on each `<specification>`. The current value is always `null`. This is a latent bug.

Fix to aggregate across all specifications in the IDS file:

```js
const allVersions = new Set();
for (const spec of ids?.specifications || []) {
    for (const v of (spec.ifcVersions || [])) allVersions.add(v);
}
out.ifcVersions = [...allVersions];                          // array, sorted insertion order
out.ifcVersion  = out.ifcVersions.join(' ') || null;         // canonical string form
```

This gives AI tools and storage cards a meaningful view of which IFC versions an IDS file targets across all its specs.

## Validator report Excel — AutoFilter and freeze pane

`validator.js:1185` (per-sheet IFC×IDS) and `:1249` (Summary sheet) — after `aoa_to_sheet`:

```js
ws['!autofilter'] = { ref: `A1:${lastColLetter}${sheetData.length}` };
ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
```

- AutoFilter dropdowns on header row of every sheet.
- Header row frozen during vertical scroll.
- No UI toggle — always on.
- Verify xlsx.js version in `assets/js/vendor/xlsx.full.min.js` supports `!views` freeze; fallback to `!freeze` if needed.

## Branch strategy

User's preferred path (option 2 from the conversation):

1. Stash any uncommitted state on `3d-viewer-integration` (currently clean per check; stash will be a no-op).
2. Create new branch from `master`: `ids-ifcversion-list`.
3. Implement per the plan that follows this spec.
4. PR to `master`.
5. After merge, return to `3d-viewer-integration` and rebase if needed.

The fixed files (`ids-parser.js`, `ifc-hierarchy.js`, `validator.js`, `validation-engine.js`, editor modals, parser.js, excel generator/parser, AI tools, storage, tests) do not overlap with the 3D viewer commits on `3d-viewer-integration`, so merge conflicts on return are unlikely.

## Tests

New and updated tests in `tests/test-suites/`:

- `ids-parser-unified.test.js`:
  - Single version: `ifcVersion="IFC4"` → `ifcVersions=["IFC4"]`.
  - Multiple versions: `ifcVersion="IFC4 IFC4X3_ADD2"` → `ifcVersions=["IFC4","IFC4X3_ADD2"]`.
  - Empty: `ifcVersion=""` → `ifcVersions=[]`.
  - Unknown values: `ifcVersion="IFC4X3"` → `ifcVersions=["IFC4X3"]` (parser does not filter; validator decides applicability).
  - Drift invariant: serialize → parse → check equivalence.

- `tools-validator.test.js`:
  - Spec with `ifcVersions=["IFC4"]` against IFC4 file: applies.
  - Spec with `ifcVersions=["IFC2X3"]` against IFC4 file: skipped with `reason: 'ifc-version-mismatch'`.
  - Spec with `ifcVersions=["IFC4","IFC4X3_ADD2"]` against IFC4 file: applies, hierarchy loaded for IFC4.
  - Spec with only unsupported versions: hard error in spec result.
  - Spec with mix of supported and unsupported: validation proceeds, warning attached.

- New `tests/test-suites/ifc-parser-schema.test.js`:
  - `IFCParserCore.parseIFCContent` returns `{ entities, schema }`.
  - Schema correctly extracted from `FILE_SCHEMA(('IFC4'));`, `FILE_SCHEMA(('IFC4X3_ADD2'));`, `FILE_SCHEMA(('IFC2X3'));`.
  - Unknown schema returned as-is (no normalization).

- `tools-validator.test.js` extended:
  - `ifc-hierarchy.js` defensive fetch: when URL returns HTML (mocked), error message names the URL, no raw `<!DOCTYPE`.

- Tests verify the documented `ifc-version-checkboxes` editor markup via `tools-ui.test.js` if practical (skipped if test framework can't reach into modal HTML).

## Out of scope (follow-ups, not in this PR)

- Editor: bulk version selector at info level (apply IFC version to all specs at once).
- Validator: detect IFC version of every uploaded file and warn user before running if no spec matches any file.
- Wizard: explain multi-version targeting on the parser page.

## Required cross-file updates checklist (for the plan to enumerate)

- `assets/js/common/ids-parser.js` + `dist/`
- `assets/js/common/ifc-hierarchy.js` + `dist/`
- `assets/js/common/ifc-parser-core.js` + `dist/`
- `assets/js/common/validation-engine.js` + `dist/`
- `assets/js/validator.js` + `dist/`
- `assets/js/parser.js` + `dist/`
- `assets/js/ids/ids-editor-modals.js` + `dist/`
- `assets/js/ids/ids-xml-generator.js` (defensive coerce) + `dist/`
- `assets/js/ai/tools/tool-ids.js` + `dist/`
- `assets/js/ai/tools/tool-storage.js` + `dist/`
- `assets/js/workers/ifc-parser.worker.js` (return shape) + `dist/`
- `assets/css/ids-editor-styles.css` (checkbox group styles) + `dist/`
- `sw.js` cache version bump + `dist/sw.js`
- `assets/js/common/translations.js` (any new keys for skipped status / version-mismatch warning) + `dist/`
- New test files under `tests/test-suites/`

Per project memory `[[feedback-sw-cache-bump]]`: SW cache version must be bumped when CSS/JS changes ship.
