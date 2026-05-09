# Phase 6 — Validation Presets Design

**Date:** 2026-05-09
**Status:** Approved (pending implementation plan)
**Branch target:** `phase-6-validation-presets`

## Goal

Make validation group configuration persist across sessions. Two persistence layers:

1. **Auto-restore last session** — current state survives a refresh or tab close without explicit user action.
2. **Named presets** — user explicitly saves a configuration as "Projekt A" and can switch between projects.

Storage is local-only (browser localStorage). Presets reference files **by filename**, not by storage ID, so newer versions of the same-named file are picked up automatically.

## Non-goals

- Cross-device sync (out of scope; could be added later via export/import or a server)
- Preset export/import as JSON files
- Per-group user-facing names (groups stay anonymous, identified by index)
- Preset migration / schema versioning (v1 only)
- Visual regression testing of the new UI

## 1. Architecture and data model

### 1.1 New module

`assets/js/common/validation-presets.js` — singleton `window.ValidationPresets`.
Owns CRUD of presets and the auto-restore "last session" slot. Pure JS, no
dependencies beyond `BIMStorage` (for hydration).

### 1.2 Storage backend

**localStorage**, two keys:

- `bim_validation_presets` — JSON-encoded array of named presets
- `bim_validation_last_session` — JSON-encoded single object (last in-memory state)

Rationale: data is tiny (~1 KB per preset), synchronous API simplifies code and
avoids an extra IndexedDB store, and the project already uses localStorage for
similar small-state needs (theme, language).

### 1.3 Preset shape

```js
{
    id: '1715190000-abc',          // stable unique id (string)
    name: 'Projekt A',             // user-supplied, unique within array
    createdAt: 1715190000000,      // epoch ms
    updatedAt: 1715190500000,      // epoch ms
    groups: [
        {
            ifcFileNames: ['building.ifc', 'site.ifc'],
            idsFileName: 'fire-safety.ids'
        },
        {
            ifcFileNames: ['hvac.ifc'],
            idsFileName: 'mep.ids'
        }
    ]
}
```

### 1.4 Last-session shape

```js
{
    groups: [/* same group shape as above */],
    savedAt: 1715190000000
}
```

### 1.5 In-memory group shape (validator.js)

Existing shape extended with two missing-tracking fields:

```js
{
    id: <Date.now() + Math.random()>,
    ifcFiles: [<File-like from BIMStorage>],
    idsFile: <File-like from BIMStorage> | null,
    missingIfcNames: ['site.ifc'],   // NEW: filenames referenced but not in storage
    missingIdsName: null              // NEW: filename or null
}
```

Groups created via `addValidationGroup()` initialise both new fields to empty
(`[]` and `null`). No regression for non-preset workflows.

### 1.6 Public API

```js
ValidationPresets.list()                       // → [{id, name, createdAt, updatedAt, groups}]
ValidationPresets.get(id)                      // → preset | null
ValidationPresets.save(name, presetGroups)     // upsert by name, returns id
ValidationPresets.delete(id)                   // returns boolean
ValidationPresets.saveLastSession(groups)      // debounced 500 ms internally
ValidationPresets.loadLastSession()            // → groups | null (sync)
ValidationPresets.flushLastSession()           // sync flush of pending debounce
ValidationPresets.toPresetGroups(groups)       // in-memory groups → preset groups (extracts filenames)
ValidationPresets.fromPresetGroups(presetGroups) // async; preset groups → in-memory groups (hits BIMStorage)
```

`save()` upsert semantics: if a preset with the same `name` exists, its `id` is
preserved; only `updatedAt` and `groups` change.

`delete()` returns `false` if the id is unknown (no-op).

## 2. UI components

### 2.1 Presets panel

Static markup in `pages/ids-ifc-validator.html`, inserted into `.upload-section`
between the "Validační skupiny" heading row and `#validationGroups`. Static
keeps initial paint stable (CLS 0).

```html
<div class="presets-panel" id="presetsPanel">
    <div class="presets-panel__header">
        <span class="presets-panel__title" data-i18n="presets.title">📁 Presety</span>
    </div>
    <div class="presets-panel__controls">
        <select id="presetSelect" class="presets-panel__select">
            <option value="" data-i18n="presets.placeholder">— Vyberte preset —</option>
        </select>
        <button id="loadPresetBtn" class="btn btn-secondary" disabled data-i18n="presets.load">📂 Načíst</button>
        <button id="savePresetBtn" class="btn btn-primary" data-i18n="presets.saveAs">💾 Uložit jako</button>
        <button id="deletePresetBtn" class="btn btn-danger" disabled data-i18n="presets.delete">🗑️ Smazat</button>
    </div>
</div>
```

Behaviour:

- Dropdown starts with placeholder option selected → `Load` and `Delete` disabled.
- On selection of a real preset → both buttons become enabled.
- `Save as` is enabled only when `validationGroups.length > 0` (otherwise toast
  "Není co uložit").

### 2.2 Save modal

Custom modal injected into `<body>` lazily (same pattern as `bug-report.js`).
Reuses existing `.modal-overlay` styles. Single text input + Cancel/Save
buttons. Pre-fills with the currently selected preset name (if any).

```
┌─ Uložit preset ─────────────────────┐
│                                     │
│  Jméno presetu:                     │
│  [____________________________]     │
│                                     │
│  [Zrušit]              [Uložit]     │
│                                     │
└─────────────────────────────────────┘
```

Validation:

- Trim whitespace; reject empty after trim (inline error).
- `<input maxlength="80">` caps length at typing time.
- If trimmed name matches an existing preset → `confirm()` "Přepsat?".

### 2.3 Missing file rendering

When a group has `missingIfcNames` or `missingIdsName`, the existing
`selected-files-list` renderer adds extra "missing" pills alongside present
ones. New CSS class `.file-pill--missing` in `assets/css/ids-validator.css`:

- Border colour: `var(--warning, #f59e0b)`
- Background: light warning tint
- Italic font, opacity 0.75
- Leading icon: ⚠️
- Trailing text: `(chybí v úložišti)` (translated)

No per-slot "Re-upload" button. Re-upload happens through the existing
drop-zone or "Vybrat z úložiště" picker; on file add, missing slots
auto-resolve when filenames match (see §3.6).

### 2.4 Toast feedback

Reuses `ErrorHandler.showSuccess()`, `.showWarning()`, `.showError()` for:

- "Preset 'X' uložen"
- "Preset 'X' načten" (with optional " — některé soubory chybí v úložišti")
- "Preset 'X' smazán"
- "Není co uložit"
- "Paměť prohlížeče je plná. Smažte staré presety."

### 2.5 Translation keys

15 new keys × 2 languages in `assets/js/common/translations.js`:

| Key | CZ | EN |
|-----|----|----|
| `presets.title` | 📁 Presety | 📁 Presets |
| `presets.placeholder` | — Vyberte preset — | — Select preset — |
| `presets.load` | 📂 Načíst | 📂 Load |
| `presets.saveAs` | 💾 Uložit jako | 💾 Save as |
| `presets.delete` | 🗑️ Smazat | 🗑️ Delete |
| `presets.empty` | Není co uložit | Nothing to save |
| `presets.saveModal.title` | Uložit preset | Save preset |
| `presets.saveModal.namePlaceholder` | Jméno presetu | Preset name |
| `presets.saveModal.cancel` | Zrušit | Cancel |
| `presets.saveModal.save` | Uložit | Save |
| `presets.saveModal.overwriteConfirm` | Preset '{name}' už existuje. Přepsat? | Preset '{name}' already exists. Overwrite? |
| `presets.deleteConfirm` | Smazat preset '{name}'? | Delete preset '{name}'? |
| `presets.loadConfirm` | Načíst preset '{name}'? Aktuální skupiny budou nahrazeny. | Load preset '{name}'? Current groups will be replaced. |
| `presets.fileMissing` | (chybí v úložišti) | (missing from storage) |
| `presets.loaded` | Preset '{name}' načten | Preset '{name}' loaded |
| `presets.loadedWithMissing` | Preset '{name}' načten — některé soubory chybí v úložišti | Preset '{name}' loaded — some files missing from storage |
| `presets.saved` | Preset '{name}' uložen | Preset '{name}' saved |
| `presets.deleted` | Preset '{name}' smazán | Preset '{name}' deleted |
| `presets.quotaExceeded` | Paměť prohlížeče je plná. Smažte staré presety. | Browser storage is full. Delete old presets. |
| `presets.disabled` | Presety nelze ukládat (privátní režim prohlížeče) | Presets cannot be saved (browser private mode) |

## 3. Data flow

### 3.1 App load (DOMContentLoaded)

```
1. existing: BIMStorage.init() (no change)
2. existing: renderValidationGroups()  (renders static empty state)
3. NEW: populate <select id="presetSelect"> from ValidationPresets.list()
4. NEW: const last = ValidationPresets.loadLastSession()
        if (last && last.groups.length > 0) {
            validationGroups = await ValidationPresets.fromPresetGroups(last.groups)
            renderValidationGroups()
        }
```

Race note: step 4 is async. Step 2's render shows the static empty state (zero
CLS); step 4 then replaces it with hydrated groups, which IS a layout shift.
Hydration takes typically 50–200 ms for a few files, well within Lighthouse's
CLS measurement window, and the shift will likely be attributed to CLS (no
preceding user input).

Mitigation: when `loadLastSession()` returns a non-null result (i.e., we know
groups will be hydrated), reserve approximate vertical space on `#validationGroups`
via an inline `style.minHeight` set BEFORE step 2's render, sized to a
conservative estimate (`160px × number-of-groups`, capped at `viewport-height ×
0.6`). After hydration completes, clear the `minHeight`. This trades a small
amount of empty space during 50–200 ms for a near-zero shift score.

CLS impact will be verified via `tests/cls-debug.js` post-implementation; if
the score exceeds 0.05 on the validator page after this change, the
implementation plan must add a follow-up adjustment.

### 3.2 Mutation of `validationGroups`

`renderValidationGroups()` gains one extra line at the end:

```js
function renderValidationGroups() {
    // ... existing render ...
    ValidationPresets.saveLastSession(validationGroups);  // debounced 500 ms
}
```

Plus a single `beforeunload` handler in validator.js initialisation:

```js
window.addEventListener('beforeunload', () => {
    ValidationPresets.flushLastSession();
});
```

Debounce is internal to `ValidationPresets.saveLastSession()`. Implementation:
500 ms `setTimeout`, cleared and re-set on each call. `flushLastSession()`
clears the pending timeout and writes immediately.

### 3.3 Click "Uložit jako"

```
guard: validationGroups.length > 0     (else: toast presets.empty)
  ↓
open save modal, prefill <currently-selected-preset-name OR "">
  ↓
user types name, clicks "Uložit"
  ↓
trim + non-empty check (else: inline error)
  ↓
if list().some(p => p.name === trimmed):
    if (!confirm(t('presets.saveModal.overwriteConfirm', {name})))
        keep modal open, return
  ↓
ValidationPresets.save(trimmed, toPresetGroups(validationGroups))
  ↓
re-populate dropdown, select the just-saved preset
  ↓
close modal, toast presets.saved
```

### 3.4 Click "Načíst"

```
selectedId = #presetSelect.value
preset = ValidationPresets.get(selectedId)
if (!preset) return  (defensive)
  ↓
if validationGroups.length > 0:
    if (!confirm(t('presets.loadConfirm', {name: preset.name})))
        return
  ↓
hydrated = await ValidationPresets.fromPresetGroups(preset.groups)
validationGroups.length = 0
validationGroups.push(...hydrated)
  ↓
renderValidationGroups()              (saveLastSession fires inside)
  ↓
hasMissing = hydrated.some(g => g.missingIfcNames.length || g.missingIdsName)
toast hasMissing ? presets.loadedWithMissing : presets.loaded
```

### 3.5 Click "Smazat"

```
selectedId = #presetSelect.value
preset = ValidationPresets.get(selectedId)
if (!preset) return
  ↓
if (!confirm(t('presets.deleteConfirm', {name: preset.name})))
    return
  ↓
ValidationPresets.delete(selectedId)
  ↓
re-populate dropdown, reset to placeholder, disable Load + Delete
  ↓
toast presets.deleted
```

### 3.6 Auto-resolve missing slots on file add

In existing IFC/IDS file-add handlers (drop-zone and storage-picker paths),
after persisting to BIMStorage:

```js
const idx = currentGroup.missingIfcNames.indexOf(file.name);
if (idx >= 0) {
    currentGroup.missingIfcNames.splice(idx, 1);
    // existing code already pushes file into currentGroup.ifcFiles
}
// analogous for idsFile / missingIdsName
```

`renderValidationGroups()` re-renders without the missing pill.

### 3.7 Hydration internals

```js
async fromPresetGroups(presetGroups) {
    await BIMStorage.init();
    const result = [];
    for (const pg of presetGroups) {
        const ifcFiles = [];
        const missingIfcNames = [];
        for (const name of (pg.ifcFileNames || [])) {
            try {
                const f = await BIMStorage.getFile('ifc', name);
                if (f) ifcFiles.push(f); else missingIfcNames.push(name);
            } catch {
                missingIfcNames.push(name);
            }
        }
        let idsFile = null, missingIdsName = null;
        if (pg.idsFileName) {
            try {
                idsFile = await BIMStorage.getFile('ids', pg.idsFileName);
                if (!idsFile) missingIdsName = pg.idsFileName;
            } catch {
                missingIdsName = pg.idsFileName;
            }
        }
        result.push({
            id: Date.now() + Math.random(),
            ifcFiles, idsFile,
            missingIfcNames, missingIdsName
        });
    }
    return result;
}
```

`toPresetGroups()` is the inverse and trivially synchronous:

```js
toPresetGroups(validationGroups) {
    return validationGroups.map(g => ({
        ifcFileNames: [
            ...g.ifcFiles.map(f => f.name),
            ...(g.missingIfcNames || [])
        ],
        idsFileName: g.idsFile ? g.idsFile.name : (g.missingIdsName || null)
    }));
}
```

The merge of `ifcFiles` + `missingIfcNames` preserves missing references on
save — so re-saving a preset that has unresolved missing files keeps those
references for next load.

## 4. Error handling

| Case | Behaviour |
|------|-----------|
| Missing file in preset | Visual marker (§2.3); filename retained in `missingIfcNames` / `missingIdsName` |
| `QuotaExceededError` on localStorage write | Catch in `save()` and `saveLastSession()` → toast `presets.quotaExceeded` |
| Corrupted JSON in localStorage | `JSON.parse` in try/catch → log warning to `console.warn` → return `[]` for `list()` and `null` for `loadLastSession()` |
| Whitespace-only name | Trim + inline error in modal |
| Name exceeds 80 chars | `<input maxlength="80">` caps at typing time |
| localStorage disabled (private mode) | First write attempt throws → set internal `_disabled = true` flag → all subsequent writes no-op silently → one-time toast `presets.disabled` on first user save attempt |
| `BIMStorage.getFile()` throws | Caught in `fromPresetGroups()` per-file → file marked missing, hydration continues |

## 5. Testing

Custom Jasmine-like framework, Puppeteer headless. ~16 new tests.

### 5.1 Unit tests

`tests/test-suites/validation-presets.test.js`:

- `save(name, groups)` creates new preset; `list()` returns it
- `save()` with same name upserts (preserves id, updates `updatedAt`); `list().length` unchanged
- `delete(id)` removes; `list()` no longer contains it
- `delete(unknownId)` returns `false`, no throw
- `get(id)` returns matching preset; `get(unknownId)` returns `null`
- `saveLastSession(groups)` + `loadLastSession()` roundtrip preserves group structure
- `toPresetGroups()` extracts only filenames (no content, no id)
- `toPresetGroups()` merges resolved files with missing names so unresolved references survive a save
- Corrupted JSON in `bim_validation_presets` → `list()` returns `[]`, no throw
- Corrupted JSON in `bim_validation_last_session` → `loadLastSession()` returns `null`, no throw
- `flushLastSession()` writes synchronously (after `saveLastSession()` no immediate write happens, after `flush` the value is in localStorage)

Mocking: `localStorage.clear()` in `beforeEach`. `QuotaExceededError` simulated
by stubbing `localStorage.setItem` to throw.

### 5.2 Integration tests

`tests/test-suites/validation-presets-integration.test.js`:

- Save preset from in-memory groups → preset appears in `<select>` after re-populating
- Auto-restore last session: seed last-session in localStorage → simulate page reload (re-run init logic) → `validationGroups` matches
- Load preset with missing file (filename not in BIMStorage) → resulting group has the filename in `missingIfcNames` and the right pill class in DOM
- After load with missing file, seed BIMStorage with that file and add it via the IFC picker → group's `missingIfcNames` empties, no missing pill in DOM
- `fromPresetGroups()` against a real BIMStorage with a saved IFC: roundtrip — file content matches what was saved

Cleanup per test: `localStorage.clear()` and clear both BIMStorage object stores
(`ifc_files`, `ids_files`).

### 5.3 What we don't test

- Concurrent two-tab edits (browser provides last-write-wins semantics for
  `localStorage`; sufficient for v1)
- Schema migration (v1 only)
- Visual regression (no infrastructure)
- Cross-browser quota behaviour (Chrome's quota is sufficient signal)

## 6. File touch list

### Created

- `assets/js/common/validation-presets.js` (and `dist/` mirror)
- `tests/test-suites/validation-presets.test.js`
- `tests/test-suites/validation-presets-integration.test.js`

### Modified

- `pages/ids-ifc-validator.html` (and `dist/`) — presets panel HTML
- `assets/js/validator.js` (and `dist/`) — wire up panel events, group missing
  fields, render missing pills, last-session save hook, beforeunload flush
- `assets/css/ids-validator.css` (and `dist/`) — `.presets-panel`,
  `.file-pill--missing` styles
- `assets/js/common/translations.js` (and `dist/`) — 15+ new keys × 2 languages
- `tests/test-runner.html` — register two new test suite scripts
- `eslint.config.js` — `ValidationPresets: 'readonly'` global
- `sw.js` (and `dist/`) — add `validation-presets.js` to `ASSETS_TO_CACHE`,
  bump `CACHE_VERSION` v12 → v13
- `PLAN.md`, `CHANGELOG.md` — milestone entries

## 7. Out of scope (deliberate)

- Preset export/import as JSON files (would let users back up presets or share
  with teammates; nice but not asked for)
- Per-group user-facing names (groups stay anonymous; if added later, becomes a
  field in both in-memory shape and preset shape)
- Cross-device sync via server (would require auth + backend; major scope
  expansion)
- Attaching a preset to validation results (so re-running gives the same
  output) — orthogonal feature
- "Recently used" preset history beyond the single last-session slot
