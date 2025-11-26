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
- Add a **LICENSE** file (MIT or Apache 2.0 recommended)
- Complete the **README** with:
  - Feature descriptions
  - Instructions for running the project
  - Limitations
  - Screenshots
  - Roadmap
- Add **CONTRIBUTING.md**
- Add **CODE_OF_CONDUCT.md**
- Implement **versioning** using Git tags (e.g., `v0.1.0`, `v0.2.0`)
- Prepare a **CHANGELOG.md**
- Add an `examples/` directory with IFC/IDS samples

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
- Move SheetJS from CDN to a local asset

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
    /common
    /ifc
    /ids
    /workers
  /css
/docs
/examples
  /ifc
  /ids
/pages
/tests
LICENSE
README.md
CHANGELOG.md
```

---

# 5. Roadmap

## Version 0.2
- Add LICENSE
- Complete README
- Create `examples/` repository
- Use offline SheetJS

## Version 0.3
- IDS validation using XSD
- Warning on destructive IFC edits
- Official Pset highlighting

## Version 0.4
- Diff-mode in the IFC editor
- Wizard for IDS
- Test suite + basic automated tests

## Version 1.0
- Full IDS 1.0 compatibility
- Integration with IDS-Audit
- Highly stable IFC editor
- Professional-level OSS documentation

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