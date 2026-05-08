# Changelog

All notable changes to this project will be documented in this file.

## [0.2.5] — 2026-05-08

### Fixed
- Cumulative Layout Shift on validator page reduced from 0.226 (Poor) to 0.000 (Good). Empty-state markup now rendered statically in HTML instead of injected from JS at DOMContentLoaded.
- PWA install button reserves its navbar slot via `visibility: hidden` instead of `display: none`, so the navbar no longer reflows by ~43 px when `beforeinstallprompt` fires.

### Added
- `tests/cls-debug.js` — Puppeteer-based CLS diagnostic that captures `layout-shift` PerformanceObserver entries with source elements and DOM mutations near each shift. Useful for catching CLS regressions.

## [0.2.4] — 2026-05-08

### Added
- IFC parser Web Worker pool — IFC content parsing now runs across up to 4 worker threads in parallel. UI thread stays at 60 FPS during parsing of multi-MB IFC files.
- `IFCParserCore` shared module — single source of truth for IFC parsing, called identically from worker and main-thread fallback.

### Changed
- `assets/js/validator.js parseIFCFileAsync` dispatches to WorkerPool when available; gracefully falls back to main-thread sync parsing when Worker API unavailable or worker init fails.
- `assets/js/workers/ifc-parser.worker.js` rewritten from 213 lines to ~30 — single PARSE message type, delegates to IFCParserCore.

### Internal
- Migrated 7 parsing helpers (extractGUID, extractName, decodeIFCString, splitParams, parsePropertySet, parseProperty, parseRelDefines) from validator.js to ifc-parser-core.js.
- 19 new tests (10 unit + 3 backward-compat snapshot + 6 worker integration).

## [0.2.3] — 2026-05-08

### Added
- `Compression` module — gzip-encode IFC/IDS file content in IndexedDB via native CompressionStream API. Typical 60–80% storage savings for text-based IFC files.
- Transparent compression in storage layer — `BIMStorage.saveFile` and `getFileContent` API unchanged for consumers.
- Backward compatibility via gzip magic-byte detection — legacy uncompressed files remain readable; lazy migration on next save.
- 21 new tests covering compression roundtrip, magic-byte detection, and storage integration.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] — 2026-05-08

### Added
- In-app bug report — bug button in navbar of all 4 pages opens a modal that creates a GitHub issue via Cloudflare Pages Function.
- Auto-attached metadata: app version, user agent, page path, language, timestamp, last 5 console errors.
- `ErrorHandler` ring buffer (5 entries) fed by `window.error` and `unhandledrejection` listeners.
- Anonymous reporting (no email/name field), no screenshot in v1, fallback link to manual GitHub issue when worker fails.

## [0.2.1] — 2026-05-08

### Fixed
- IFC Viewer: adding a property to an element that didn't have it (but the pset existed) now correctly extends the existing pset entity instead of creating a parallel pset, producing valid IFC output.
- IFC Viewer: editing quantity (`IFCELEMENTQUANTITY`) now preserves quantity entity types instead of overwriting with property entities.

### Added
- `IfcPsetUtils` shared utility module for IFC pset/qto parsing and manipulation (`assets/js/ifc/ifc-pset-utils.js`).
- Explicit case classification in `applyModificationsToIFC` (edit / add-prop / create-pset).
- 30 new tests covering all three modification cases plus roundtrip verification.

## [0.2.0] — 2026-05-08

### Added
- Unified IDS parser (`common/ids-parser.js`) — single source of truth shared by Parser/Visualizer and Validator pages.
- Full IFC class hierarchy support: applicability with `IFCWALL` now correctly matches subtypes (`IFCWALLSTANDARDCASE` etc.).
- `PredefinedType` matching in entity facets, including `USERDEFINED` → `ObjectType` fallback.
- XSD validation against official IDS 1.0 schema using xmllint-wasm. Banner on import, modal on export, fully offline (PWA-cached).
- Generated IFC class hierarchy data for IFC2X3 / IFC4 / IFC4X3 (`assets/data/ifc-hierarchy-*.json`).
- Generator script `scripts/generate-ifc-hierarchy.cjs` for refreshing hierarchy data when buildingSMART releases new IFC versions.

### Fixed
- Validator no longer silently treats unrecognized entity facet shapes as "match all" (now defaults to "no match").
- Spec cardinality (REQ/OPT/PROH badge) now correctly reflects `<applicability minOccurs/maxOccurs>` in source IDS.

### Internal
- ~50 new test cases (305 → 350).
- `validator.js` shed ~276 lines of duplicate parser code.
- Worker pool, validation orchestrator, and inline validation paths all updated to async signature for hierarchy preload.

## [Unreleased]

### Changed
- Documentation translated to English

### Fixed
- Dark mode heading visibility improvements

## [0.1.2] - 2025-01-XX

### Added
- Separate file storage for improved performance with large files
- Horizontal scroll speed limiter for tables

### Changed
- Major security and code quality refactoring

### Fixed
- Tekla IFC encoding support and splitParams parsing
- Loading overlay display using classList instead of style.display
- Loading overlay position in validator - centered on screen
- Storage key inconsistency causing 'Error loading data from storage'
- Critical bug in IFCRELCONTAINEDINSPATIALSTRUCTURE parsing
- IFC viewer spatial hierarchy for IFCELEMENTASSEMBLY
- Test for special character encoding (š not in ISO-8859-1)

## [0.1.1] - 2025-01-XX

### Added
- Internationalization (i18n) support - Czech/English bilingual UI
- Spatial tree structure for IFC Viewer
- IDS cardinality support (specification and facet level)
- Test sample files

### Changed
- Deployment migrated from Vercel to Cloudflare Pages
- Project prepared for open source publication
- Entity facet form simplified
- Editor buttons moved to Editor tab only

### Fixed
- Storage Module: File overwrite on duplicate names
- Storage Module: Added getFile() and support for name-based deletion
- Remaining test failures - achieved 100% test pass rate
- BIMStorage API and improved i18n
- Missing quotes in i18n.t() calls causing IFC storage crash
- Unified icons for IDS Parser and Validator

## [0.1.0] - 2025-01-XX

### Added
- Initial release
- IFC Viewer with multi-file support
- IDS Parser and Editor
- IDS-IFC Validator
- Local file storage using IndexedDB
- Dark mode support
- Export to Excel functionality

[Unreleased]: https://github.com/MichalMarvan/BIM_checker/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/MichalMarvan/BIM_checker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MichalMarvan/BIM_checker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MichalMarvan/BIM_checker/releases/tag/v0.1.0
