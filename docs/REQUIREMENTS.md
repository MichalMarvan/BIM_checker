# BIM Checker – Technical Requirements

This document summarizes all recommendations and requirements for the **BIM Checker** project to enable its development as a professional open-source tool for working with IFC, IDS, and data validation.

---

## 1. Project Overview

BIM Checker is a web application that runs entirely in the browser, providing:
- **Local file storage** (IndexedDB)
- **IFC spreadsheet viewer + editor**
- **IDS viewer + editor**
- **IDS-IFC validator** with outputs in HTML and XLSX

The application works offline, sends no data to any server, and uses no backend.

---

# 2. Open-Source Requirements

## 2.1 Mandatory Items
- ✅ **LICENSE** file (MIT)
- ✅ **README.md** with features, instructions, limitations
- ✅ **CONTRIBUTING.md**
- ⬜ **CODE_OF_CONDUCT.md** (optional)
- ⬜ Git tags versioning (e.g., `v0.1.0`, `v0.2.0`)
- ⬜ **CHANGELOG.md**
- ✅ Sample IDS files available via "Load Sample" button in parser

---

# 3. Functional Requirements

## 3.1 IFC Viewer & Editor
- Ability to load multiple IFC files and display their content in a table
- Filtering, searching (text + regex)
- Editing of Psets and properties
- Warnings for destructive edits (e.g., renaming standard Psets)
- Option to export data to CSV
- Option to save the modified IFC file
- Run in a Web Worker for performance

### Recommended Enhancements
- Highlight official Psets (buildingSMART)
- Integrity check after IFC export
- Diff mode – show changes before saving
- ✅ SheetJS moved to local asset (`assets/js/vendor/xlsx.full.min.js`)

---

## 3.2 IDS Viewer & Editor
- Load IDS (XML)
- Display a tree structure
- Edit IDS directly in the editor
- Generate new IDS from a structured form
- Export to XML

### Recommended Enhancements
- IDS creation wizard (step-by-step guide)
- IDS validation against the official `ids.xsd`
- IDS templates (for walls, spaces, infrastructure, Psets)

---

## 3.3 IDS-IFC Validator
- Validation based on two parts:
  - **Applicability**
  - **Requirements**
- Support for types: property, classification, entity, material, cardinality
- HTML results
- Export to XLSX

### Recommended Enhancements
- Integration with the IDS-Audit tool (at least indirectly)
- Support for QTO requirements (future)
- Validation of Pset/Property names against bSI standards
- Detailed results export:
  - Entity
  - GlobalId
  - Requirement type
  - Violation
  - Expected vs. found value

---

# 4. Technical Requirements

## 4.1 Project Structure
```
/assets
  /js
    /common      # Shared utilities (i18n, storage, theme, etc.)
    /ifc         # IFC stream parser
    /ids         # IDS editor and XML generator
    /vendor      # Third-party libraries (xlsx)
    /workers     # Web Workers
  /css
/docs
/pages           # Tool pages (viewer, parser, validator)
/tests           # Puppeteer test suite
LICENSE
README.md
```

---

# 5. Planned Features

## Completed ✅
- LICENSE (MIT)
- Complete README with features and instructions
- Offline SheetJS (local vendor copy)
- Basic automated tests (Puppeteer)
- ESLint configuration

## In Progress / Planned
- **XSD validation** - Validate IDS files against official buildingSMART schema
- **IDS templates** - Pre-built specifications for common use cases
- **IDS wizard** - Step-by-step guide for creating specifications
- **BCF export** - Export validation results to BIM Collaboration Format
- **bSDD integration** - Connect to buildingSMART Data Dictionary
- Warning on destructive IFC edits
- Official Pset highlighting
- Diff mode in IFC editor

See [FUTURE_IMPROVEMENTS.md](../FUTURE_IMPROVEMENTS.md) for storage optimizations and other ideas.

---

# 6. Project Limitations (to be mentioned in README)
- The data viewer does not handle IFC geometry
- No full STEP syntactic validation is performed
- Editing Pset names may break compatibility with other tools
- The IDS editor does not yet perform formal validation against XSD
- The validator only covers a subset of IDS requirements

---

# 7. Recommendations for Publishing on GitHub Pages
- Clearly state in the README:
  > "The application runs 100% locally in your browser; data never leaves your device."
- Add screenshots of each tool
- List the minimum supported browsers

---

# 8. Conclusion

The project has great potential as a simple, fast, and open tool for checking IFC and IDS data.
This document serves as a unified source of requirements for its future development.