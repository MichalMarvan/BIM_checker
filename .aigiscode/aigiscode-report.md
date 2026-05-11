# AigisCode Report

**Project**: `/home/michal/work/BIM_checker`
**Generated**: 2026-03-09 09:15:32
**aigiscode v0.1.0**

## Overview

| Metric | Value |
|--------|-------|
| Files indexed | 60 |
| Symbols extracted | 662 |
| Dependencies found | 7 |
| Semantic envelopes | 0 |
| Unsupported source files skipped | 2 |

### Language Breakdown

| Language | Files |
|----------|-------|
| javascript | 60 |

### Unsupported Source Languages

| Language | Files |
|----------|-------|
| rust | 2 |

## Executive Summary

The codebase contains 60 source files with 662 symbols and 7 dependencies. Analysis found: 8 god classes, 49 hardwiring issues. See the detailed sections below for specifics. Partial coverage warning: 2 unsupported source files were skipped.

## Architecture Health

**Graph**: 60 nodes, 0 edges, density=0.0

### Strong Circular Dependencies (0)

No strong circular dependencies detected.

### Layer Violations (0)

No layer violations detected.

### Module Coupling (top 15 most unstable)

| Module | Afferent (Ca) | Efferent (Ce) | Instability (I) |
|--------|---------------|---------------|-----------------|
| `assets` | 0 | 0 | 0.0 |
| `eslint.config.js` | 0 | 0 | 0.0 |
| `sw.js` | 0 | 0 | 0.0 |
| `tests` | 0 | 0 | 0.0 |
| `tests/test-suites` | 0 | 0 | 0.0 |

## Code Quality

### God Classes (8)

| Class | File | Methods | Dependencies | Lines |
|-------|------|---------|-------------|-------|
| `IDSEditorCore` | `assets/js/ids/ids-editor-core.js` | 42 | 0 | 1100 |
| `IDSEditorModals` | `assets/js/ids/ids-editor-modals.js` | 35 | 0 | 968 |
| `WizardManager` | `assets/js/common/wizard.js` | 29 | 0 | 758 |
| `FilePanel` | `assets/js/index.js` | 26 | 0 | 680 |
| `PerformanceMonitor` | `assets/js/common/performance-monitor.js` | 20 | 0 | 427 |
| `StorageManager` | `assets/js/common/storage.js` | 17 | 0 | 365 |
| `VirtualTreeView` | `assets/js/common/virtual-tree.js` | 16 | 0 | 265 |
| `ValidationOrchestrator` | `assets/js/common/validation-orchestrator.js` | 15 | 0 | 333 |

### Bottleneck Files (top 10)

No bottlenecks detected.

### Likely Orphan Files (0 files)

No orphan files detected.

### Runtime Entry Candidates (0 files)

No runtime entry candidates detected.

## Dead Code Analysis (0 findings)

No dead code detected.

## Hardwiring Analysis (49 findings)

### Magic Strings (17)

| File | Value | Severity | Confidence | Suggestion |
|------|-------|----------|------------|------------|
| `assets/js/common/ifc-stream-parser.js:117` | `DATA;` | high | medium | Extract 'DATA;' into a class constant or enum. |
| `assets/js/common/ifc-stream-parser.js:124` | `ENDSEC;` | high | medium | Extract 'ENDSEC;' into a class constant or enum. |
| `assets/js/common/performance-monitor.js:213` | `render-update` | high | high | Extract case label 'render-update' into a class co... |
| `assets/js/common/performance-monitor.js:216` | `file-load` | high | high | Extract case label 'file-load' into a class consta... |
| `assets/js/ids/ids-editor-modals.js:409` | `IFCRELVOIDSELEMENT IFCRELFILLSELEMENT` | high | medium | Extract 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT' in... |
| `assets/js/ifc/viewer-init.js:1003` | `ENDSEC;` | high | medium | Extract 'ENDSEC;' into a class constant or enum. |
| `assets/js/ifc/viewer-parser.js:546` | `DATA;` | high | medium | Extract 'DATA;' into a class constant or enum. |
| `assets/js/ifc/viewer-parser.js:550` | `ENDSEC;` | high | medium | Extract 'ENDSEC;' into a class constant or enum. |
| `assets/js/parser.js:1283` | `expand-all-specs` | high | high | Extract case label 'expand-all-specs' into a class... |
| `assets/js/parser.js:1287` | `collapse-all-specs` | high | high | Extract case label 'collapse-all-specs' into a cla... |
| `assets/js/parser.js:1291` | `toggle-specification` | high | high | Extract case label 'toggle-specification' into a c... |
| `assets/js/parser.js:1299` | `toggle-tree-node` | high | high | Extract case label 'toggle-tree-node' into a class... |
| `assets/js/parser.js:1307` | `toggle-ids-storage-folder` | high | high | Extract case label 'toggle-ids-storage-folder' int... |
| `assets/js/parser.js:1315` | `select-ids-file` | high | high | Extract case label 'select-ids-file' into a class ... |
| `assets/js/parser.js:1323` | `select-ids-file-radio` | high | high | Extract case label 'select-ids-file-radio' into a ... |
| `assets/js/workers/ifc-parser.worker.js:39` | `GET_STATS` | high | high | Extract case label 'GET_STATS' into a class consta... |
| `assets/js/workers/validation.worker.js:22` | `VALIDATE_SPEC` | high | high | Extract case label 'VALIDATE_SPEC' into a class co... |

### Repeated Literals (31)

| File | Value | Severity | Confidence | Suggestion |
|------|-------|----------|------------|------------|
| `assets/js/common/storage.js:74` | `bim_checker_storage` | medium | low | Extract repeated literal 'bim_checker_storage' int... |
| `assets/js/ids/ids-editor-core.js:402` | `btn btn-secondary` | medium | low | Extract repeated literal 'btn btn-secondary' into ... |
| `assets/js/common/translations.js:294` | `cardinality.facetOptionalDesc` | medium | low | Extract repeated literal 'cardinality.facetOptiona... |
| `assets/js/common/translations.js:295` | `cardinality.facetProhibitedDesc` | medium | low | Extract repeated literal 'cardinality.facetProhibi... |
| `assets/js/common/translations.js:293` | `cardinality.facetRequiredDesc` | medium | low | Extract repeated literal 'cardinality.facetRequire... |
| `assets/js/common/translations.js:288` | `cardinality.optional` | medium | low | Extract repeated literal 'cardinality.optional' in... |
| `assets/js/common/translations.js:289` | `cardinality.prohibited` | medium | low | Extract repeated literal 'cardinality.prohibited' ... |
| `assets/js/common/translations.js:287` | `cardinality.required` | medium | low | Extract repeated literal 'cardinality.required' in... |
| `assets/js/common/drag-drop.js:39` | `drag-over` | medium | low | Extract repeated literal 'drag-over' into a shared... |
| `assets/js/common/wizard-steps.js:231` | `edit-mode` | medium | medium | Extract repeated literal 'edit-mode' into a shared... |
| `assets/js/common/translations.js:307` | `editor.cancel` | medium | low | Extract repeated literal 'editor.cancel' into a sh... |
| `assets/js/common/translations.js:309` | `editor.example` | medium | low | Extract repeated literal 'editor.example' into a s... |
| `assets/js/common/translations.js:308` | `editor.save` | medium | low | Extract repeated literal 'editor.save' into a shar... |
| `assets/js/ifc/viewer-ui.js:86` | `file-name` | medium | low | Extract repeated literal 'file-name' into a shared... |
| `assets/js/ids/ids-xml-generator.js:9` | `http://www.w3.org/2001/XMLSchema` | medium | low | Extract repeated literal 'http://www.w3.org/2001/X... |
| `assets/js/common/components.js:140` | `loading.files` | medium | low | Extract repeated literal 'loading.files' into a sh... |
| `assets/js/common/translations.js:194` | `parser.error.parsingError` | medium | low | Extract repeated literal 'parser.error.parsingErro... |
| `assets/js/common/translations.js:217` | `parser.facet.value` | medium | low | Extract repeated literal 'parser.facet.value' into... |
| `assets/js/common/translations.js:233` | `parser.facetType.attribute` | medium | low | Extract repeated literal 'parser.facetType.attribu... |
| `assets/js/common/translations.js:238` | `parser.storage.fileCount` | medium | low | Extract repeated literal 'parser.storage.fileCount... |
| `assets/js/ifc/viewer-init.js:1337` | `storage-empty-message` | medium | low | Extract repeated literal 'storage-empty-message' i... |
| `assets/js/common/translations.js:486` | `validator.error.fileNotFound` | medium | low | Extract repeated literal 'validator.error.fileNotF... |
| `assets/js/common/translations.js:483` | `validator.error.onlyIdsAllowed` | medium | low | Extract repeated literal 'validator.error.onlyIdsA... |
| `assets/js/common/translations.js:477` | `validator.error.onlyIfc` | medium | low | Extract repeated literal 'validator.error.onlyIfc'... |
| `assets/js/common/translations.js:482` | `validator.error.onlyIfcAllowed` | medium | low | Extract repeated literal 'validator.error.onlyIfcA... |
| `assets/js/common/translations.js:485` | `validator.error.selectIds` | medium | low | Extract repeated literal 'validator.error.selectId... |
| `assets/js/common/translations.js:435` | `viewer.csv.entity` | medium | low | Extract repeated literal 'viewer.csv.entity' into ... |
| `assets/js/common/translations.js:121` | `viewer.editMode` | medium | low | Extract repeated literal 'viewer.editMode' into a ... |
| `assets/js/common/translations.js:103` | `viewer.entities` | medium | low | Extract repeated literal 'viewer.entities' into a ... |
| `assets/js/common/translations.js:411` | `viewer.files` | medium | low | Extract repeated literal 'viewer.files' into a sha... |

*... and 1 more*

### Hardcoded Network (1)

| File | Value | Severity | Confidence | Suggestion |
|------|-------|----------|------------|------------|
| `assets/js/ids/ids-xml-generator.js:8` | `http://standards.buildingsmart.org/IDS` | medium | medium | Move URL to configuration or environment variable. |

## AI Finding Review

| Metric | Count |
|--------|-------|
| Reviewed by AI | 38 |
| True positives | 0 |
| False positives | 0 |
| Needs context | 38 |

### Needs Manual Review (38)

| File | Category | Name/Value | Reason |
|------|----------|------------|--------|
| `assets/js/common/ifc-stream-parser.js:117` | magic_string | `DATA;` | AI review unavailable |
| `assets/js/common/ifc-stream-parser.js:124` | magic_string | `ENDSEC;` | AI review unavailable |
| `assets/js/common/performance-monitor.js:213` | magic_string | `render-update` | AI review unavailable |
| `assets/js/common/performance-monitor.js:216` | magic_string | `file-load` | AI review unavailable |
| `assets/js/ids/ids-editor-modals.js:409` | magic_string | `IFCRELVOIDSELEMENT IFCRELFILLSELEMENT` | AI review unavailable |
| `assets/js/ifc/viewer-init.js:1003` | magic_string | `ENDSEC;` | AI review unavailable |
| `assets/js/ifc/viewer-parser.js:546` | magic_string | `DATA;` | AI review unavailable |
| `assets/js/ifc/viewer-parser.js:550` | magic_string | `ENDSEC;` | AI review unavailable |
| `assets/js/parser.js:1283` | magic_string | `expand-all-specs` | AI review unavailable |
| `assets/js/parser.js:1287` | magic_string | `collapse-all-specs` | AI review unavailable |
| `assets/js/parser.js:1291` | magic_string | `toggle-specification` | AI review unavailable |
| `assets/js/parser.js:1299` | magic_string | `toggle-tree-node` | AI review unavailable |
| `assets/js/parser.js:1307` | magic_string | `toggle-ids-storage-folder` | AI review unavailable |
| `assets/js/parser.js:1315` | magic_string | `select-ids-file` | AI review unavailable |
| `assets/js/parser.js:1323` | magic_string | `select-ids-file-radio` | AI review unavailable |
| `assets/js/workers/ifc-parser.worker.js:39` | magic_string | `GET_STATS` | AI review unavailable |
| `assets/js/workers/validation.worker.js:22` | magic_string | `VALIDATE_SPEC` | AI review unavailable |
| `assets/js/ids/ids-editor-core.js:402` | repeated_literal | `btn btn-secondary` | AI review unavailable |
| `assets/js/ifc/viewer-ui.js:86` | repeated_literal | `file-name` | AI review unavailable |
| `assets/js/common/storage.js:74` | repeated_literal | `bim_checker_storage` | AI review unavailable |
| `assets/js/ids/ids-xml-generator.js:9` | repeated_literal | `http://www.w3.org/2001/XMLSchema` | AI review unavailable |
| `assets/js/ifc/viewer-init.js:1337` | repeated_literal | `storage-empty-message` | AI review unavailable |
| `assets/js/common/translations.js:294` | repeated_literal | `cardinality.facetOptionalDesc` | AI review unavailable |
| `assets/js/common/translations.js:295` | repeated_literal | `cardinality.facetProhibitedDesc` | AI review unavailable |
| `assets/js/common/translations.js:293` | repeated_literal | `cardinality.facetRequiredDesc` | AI review unavailable |
| `assets/js/common/translations.js:288` | repeated_literal | `cardinality.optional` | AI review unavailable |
| `assets/js/common/translations.js:289` | repeated_literal | `cardinality.prohibited` | AI review unavailable |
| `assets/js/common/translations.js:287` | repeated_literal | `cardinality.required` | AI review unavailable |
| `assets/js/common/drag-drop.js:39` | repeated_literal | `drag-over` | AI review unavailable |
| `assets/js/common/wizard-steps.js:231` | repeated_literal | `edit-mode` | AI review unavailable |

*... and 8 more*

## Extensions

### contract_inventory

```json
{
  "summary": {
    "symbolic_literals": 12
  },
  "symbolic_literals": [
    {
      "value": "ifc:fileSelected",
      "count": 2,
      "locations": [
        {
          "file": "assets/js/ifc/viewer-init.js",
          "line": 1480
        },
        {
          "file": "assets/js/ifc/viewer-ui.js",
          "line": 33
        }
      ]
    },
    {
      "value": "validator:idsLoaded",
      "count": 2,
      "locations": [
        {
          "file": "assets/js/validator.js",
          "line": 1989
        },
        {
          "file": "assets/js/validator.js",
          "line": 2618
        }
      ]
    },
    {
      "value": "validator:ifcLoaded",
      "count": 2,
      "locations": [
        {
          "file": "assets/js/validator.js",
          "line": 1954
        },
        {
          "file": "assets/js/validator.js",
          "line": 2334
        }
      ]
    },
    {
      "value": "ids:loaded",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/parser.js",
          "line": 1023
        }
      ]
    },
    {
      "value": "languageChanged",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/common/i18n.js",
          "line": 133
        }
      ]
    },
    {
      "value": "storage:fileAdded",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/index.js",
          "line": 188
        }
      ]
    },
    {
      "value": "themeChanged",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/common/theme.js",
          "line": 83
        }
      ]
    },
    {
      "value": "validator:complete",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/validator.js",
          "line": 2851
        }
      ]
    },
    {
      "value": "validator:groupAdded",
      "count": 1,
      "locations": [
        {
          "file": "assets/js/validator.js",
          "line": 1686
        }
      ]
    }
  ]
}
```

## Recommendations

1. **Refactor God Classes**: Found 8 oversized classes. The worst offender is `IDSEditorCore` in `assets/js/ids/ids-editor-core.js` with 42 methods. Consider extracting responsibilities into dedicated service classes.
2. **Reduce Hardwiring**: Found 49 hardwiring issues: 17 magic strings, 31 repeated literals, 0 hardcoded entity references. Extract to constants, enums, or configuration.

---
*Generated by aigiscode v0.1.0*