# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
