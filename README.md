# BIM Checker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![buildingSMART](https://img.shields.io/badge/buildingSMART-IDS%201.0-blue)](https://www.buildingsmart.org/)
[![IFC](https://img.shields.io/badge/IFC-4.x-green)](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/)
[![bSDD](https://img.shields.io/badge/bSDD-integrated-orange)](https://www.buildingsmart.org/users/services/buildingsmart-data-dictionary/)

Professional tools for BIM data validation and analysis according to buildingSMART standards.

**100% browser-based | No installation | Privacy-first | Open source**

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

## Testing

```bash
# Run headless tests
npm test

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
│   └── ids-ifc-validator.html
├── assets/                         # Resources
│   ├── css/                       # Stylesheets
│   └── js/                        # JavaScript modules
│       ├── common/                # Shared utilities (i18n, theme, storage)
│       ├── ifc/                   # IFC parsing
│       ├── ids/                   # IDS editor, bSDD API, Excel import/export
│       └── workers/               # Web Workers
├── functions/                      # Cloudflare Pages Functions
│   └── api/                       # bSDD API CORS proxy
├── tests/                          # Test suite (280+ tests)
├── docs/                           # Documentation
├── LICENSE                         # MIT License
├── CONTRIBUTING.md                 # Contribution guide
└── package.json                    # Project metadata
```

## Supported Standards

- **IFC 4.x** (ISO 16739-1:2024) - Industry Foundation Classes
- **IDS 1.0** - Information Delivery Specification
- **bSDD** - buildingSMART Data Dictionary (production API via CORS proxy)
- **buildingSMART** - Official standards for openBIM

## Technologies

- Pure **Vanilla JavaScript** (ES6+)
- No framework dependencies
- Web Workers for parallel validation
- IndexedDB for local storage
- Streaming parser for large files
- Cloudflare Pages Functions for API proxy
- PWA support (installable, offline-capable)

## Security & Privacy

- **100% client-side** - All processing in your browser
- **No data uploads** - Files never leave your device
- **Offline capable** - Works without internet (after initial load)
- **No tracking** - Privacy-first design

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

> **Note:** Modern browsers with ES6+ support required

## Planned Features

- [ ] **XSD validation** - Validate IDS files against official buildingSMART schema
- [ ] **IDS templates** - Pre-built specifications for common use cases
- [ ] **BCF export** - Export validation results to BIM Collaboration Format

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Acknowledgments

- IFC Standard - buildingSMART International
- IDS Standard - buildingSMART International
- bSDD API - buildingSMART International

## Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/MichalMarvan/BIM_checker/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/MichalMarvan/BIM_checker/discussions)

---

**BIM Checker** - Professional tools for BIM data validation | [checkthebim.com](https://checkthebim.com) | 2025-2026
