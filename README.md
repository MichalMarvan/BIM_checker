# BIM Checker

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![buildingSMART](https://img.shields.io/badge/buildingSMART-IDS%201.0-blue)](https://www.buildingsmart.org/)
[![IFC](https://img.shields.io/badge/IFC-4.x-green)](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/)
[![bSDD](https://img.shields.io/badge/bSDD-integrated-orange)](https://www.buildingsmart.org/users/services/buildingsmart-data-dictionary/)

Professional tools for BIM data validation and analysis according to buildingSMART standards.

**Browser-based | No installation | Privacy-first | Open source**

## Features

### IFC Multi-File Viewer
Advanced viewer for analyzing and comparing multiple IFC files simultaneously.

- Load multiple IFC files at once
- Combined table of all entities from multiple files
- Advanced search (text and regex)
- PropertySet management with drag & drop
- Export to CSV
- Bilingual interface (Czech/English)
- Pagination and filters
- Sticky columns for better clarity

### IDS Parser, Visualizer and Editor
**Unique!** Full-featured IDS editor - the only browser-based IDS editor available.

- Parse and visualize IDS files
- Tree structure and raw XML view
- Regex pattern explanation
- **Complete IDS editor**
  - Create new IDS from scratch
  - Add/edit/delete specifications
  - All facets supported (Entity, Property, Attribute, Classification, Material, PartOf)
  - All restriction types (simpleValue, pattern, enumeration, bounds)
  - Cardinality support (Required/Optional/Prohibited)
  - Download as XML
- **bSDD integration** - Search buildingSMART Data Dictionary for classifications, properties and materials with autocomplete
  - Searchable dictionary filter (350+ dictionaries)
  - Auto-attach bSDD URI to facets
  - Auto-transfer applicability selections to requirements
- **Excel import/export** - Edit IDS specifications in spreadsheets
  - Full roundtrip: IDS XML <-> Excel <-> IDS XML
  - All facet types including classification, material, and bSDD URIs
  - Downloadable template with Top 20 IFC4 property sets
- Collapsible sections
- Interactive wizard tour

### IDS-IFC Validator
Validate IFC models against IDS specifications for data quality control.

- Full IDS 1.0 validation
- Applicability & Requirements support
- Detailed validation results per entity
- Success statistics and filtering
- Export results to CSV and XLSX
- Parallel validation with Web Workers
- Versioned validator/rules metadata and main-thread/Worker parity tests

### IFC 3D Viewer

- Multi-model IFC scene with selection, isolation, measurement and section planes
- Perspective and orthographic cameras, saved viewpoints and federation
- Georeferencing, CRS support, IFC alignments, LandXML and terrain workflows
- Cross-page links from the IFC table and IDS validation results by exact `fileId` + GUID
- Per-model geometry diagnostics for rendered, unsupported and fallback geometry
- Local, LRU-bounded model cache and offline loading of stored IFC files

## Quick Start

### Option 1: Use Online (Recommended)
Visit: **[https://checkthebim.com](https://checkthebim.com)**

### Option 2: Run Locally

```bash
# Clone the repository
git clone https://github.com/MichalMarvan/BIM_checker.git
cd BIM_checker

# Start local server (Python)
python3 -m http.server 8000

# Or use Node.js
npx http-server -p 8000
```

Open http://localhost:8000 in your browser.

## Documentation

- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Architecture and development tips
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute
- **[Requirements](docs/REQUIREMENTS.md)** - Technical requirements and roadmap
- **[Future Improvements](FUTURE_IMPROVEMENTS.md)** - Planned features and ideas
- **[Privacy and Network Access](PRIVACY.md)** - Local processing and optional online services
- **[Third-Party Notices](THIRD_PARTY_NOTICES.md)** - Bundled dependencies and licenses
- **[Security Threat Model](docs/SECURITY_THREAT_MODEL.md)** - Trust boundaries and required controls
- **[Architecture](docs/ARCHITECTURE.md)** - Modules, domain flows and service boundaries
- **[IDS/IFC Support](docs/IDS_IFC_SUPPORT.md)** - Implemented facets, schemas and conformance scope
- **[3D Geometry Support](docs/3D_GEOMETRY_SUPPORT.md)** - Exact, approximate and unsupported geometry
- **[Excel Format](docs/EXCEL_FORMAT.md)** - Versioning, sheets, migrations and roundtrip guarantees
- **[Storage and Backup](docs/STORAGE_AND_BACKUP.md)** - Data classes, quota, cache and recovery
- **[Browser Support](docs/BROWSER_SUPPORT.md)** - Capability matrix and fallbacks
- **[Known Limitations](docs/KNOWN_LIMITATIONS.md)** - Explicit product boundaries
- **[Release Checklist](docs/RELEASE_CHECKLIST.md)** - Automated and manual release gates

## Testing

```bash
# Run headless tests
npm test

# Full browser/release checks
npm run test:smoke
npm run test:e2e
npm run test:offline
npm run test:visual
npm run test:performance
npm run test:a11y

# Or open in browser
python3 -m http.server 8000
# Navigate to http://localhost:8000/tests/test-runner.html
```

## Project Structure

```
BIM_checker/
├── index.html                      # Main page
├── pages/                          # Tool pages
│   ├── ifc-viewer-multi-file.html
│   ├── ids-parser-visualizer.html
│   ├── ids-ifc-validator.html
│   └── 3d-viewer.html
├── assets/                         # Resources
│   ├── css/                       # Stylesheets
│   └── js/                        # JavaScript modules
│       ├── common/                # Shared domain/services, storage and validation
│       ├── 3d/                    # IFC 3D engine, geometry and panels
│       ├── ifc/                   # IFC tabular parsing and editing
│       ├── ids/                   # IDS editor, bSDD API, Excel import/export
│       └── workers/               # Web Workers
├── functions/                      # Cloudflare Pages Functions
│   └── api/                       # bSDD API CORS proxy
├── scripts/                        # CI, browser, conformance and build checks
├── tests/                          # Automated unit/integration suite
├── docs/                           # Documentation
├── LICENSE                         # GNU AGPL v3
├── CONTRIBUTING.md                 # Contribution guide
└── package.json                    # Project metadata
```

## Supported Standards

- **IFC2X3, IFC4 and IFC4X3** - data parsing and IDS validation; documented subset for 3D geometry
- **IDS 1.0** - Information Delivery Specification
- **bSDD** - optional buildingSMART Data Dictionary integration (direct API or limited proxy)
- **buildingSMART** - Official standards for openBIM

## Technologies

- Pure **Vanilla JavaScript** (ES6+)
- No frontend UI framework; runtime libraries are pinned and shipped locally
- Web Workers for parallel validation
- IndexedDB for local storage
- Streaming parser for large files
- Cloudflare Pages Functions for API proxy
- PWA support (installable, offline-capable)

## Security & Privacy

- Core IFC/IDS parsing, editing, validation, and export run in the browser
- Files are not automatically uploaded by normal processing workflows
- Remote AI requires per-session consent; data tools are disabled by default for remote agents
- AI API keys are held only for the current browser session
- Optional features such as AI, bSDD, maps, update checks, bug reports, and advanced 3D modules use the network
- No first-party analytics or advertising trackers

See [Privacy and Network Access](PRIVACY.md) for the exact boundaries and external services.

## Browser Support

Chrome/Edge is the fully automated CI target. Firefox and Safari support the
core parser/editor/validator paths, with capability-dependent fallbacks for
local folders, PWA installation and WebGL. See the detailed
[browser capability matrix](docs/BROWSER_SUPPORT.md).

## Current focus

- Expand the licensed real-world IFC corpus across authoring tools
- Differentially compare selected IDS validation cases with an independent engine
- Continue reducing legacy global bindings through the explicit service registry
- Tighten CSP after remaining inline handlers have been migrated

See [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) for more ideas.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

### Ways to Contribute

- Report bugs
- Suggest features
- Improve documentation
- Submit pull requests
- Star the project

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)** — see the [LICENSE](LICENSE) file for the full text.

The AGPL extends the GPL with a "network use" clause: if you run a modified version on a server that users interact with over a network, you must make the source code of your modified version available to those users. The canonical source is at https://github.com/MichalMarvan/BIM_checker.

Vendor dependencies retain their own licenses (xlsx.full.min.js — Apache 2.0, xmllint-wasm — MIT/LGPL).

### Third-Party Acknowledgments

- IFC Standard - buildingSMART International
- IDS Standard - buildingSMART International
- bSDD API - buildingSMART International

## Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/MichalMarvan/BIM_checker/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/MichalMarvan/BIM_checker/discussions)

---

**BIM Checker** - Professional tools for BIM data validation | [checkthebim.com](https://checkthebim.com) | 2025-2026
