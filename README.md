# BIM Checker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![buildingSMART](https://img.shields.io/badge/buildingSMART-IDS%201.0-blue)](https://www.buildingsmart.org/)
[![IFC](https://img.shields.io/badge/IFC-4.x-green)](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/)

Professional tools for BIM data validation and analysis according to buildingSMART standards.

**100% browser-based • No installation • Privacy-first • Open source**

## 🌟 Features

### 📊 IFC Multi-File Viewer
Advanced viewer for analyzing and comparing multiple IFC files simultaneously.

- ✅ Load multiple IFC files at once
- ✅ Combined table of all entities from multiple files
- ✅ Advanced search (text and regex)
- ✅ PropertySet management with drag & drop
- ✅ Export to CSV
- ✅ Bilingual interface (Czech/English)
- ✅ Pagination and filters
- ✅ Sticky columns for better clarity

### 🔍 IDS Parser, Visualizer and Editor
**Unique!** Full-featured IDS editor - the only browser-based IDS editor available.

- ✅ Parse and visualize IDS files
- ✅ Tree structure and raw XML view
- ✅ Regex pattern explanation
- ✅ **Complete IDS editor**
  - Create new IDS from scratch
  - Add/edit/delete specifications
  - All facets supported (Entity, Property, Attribute, Classification, Material, PartOf)
  - All restriction types (simpleValue, pattern, enumeration, bounds)
  - Cardinality support (Required/Optional/Prohibited)
  - Download as XML
- ✅ Collapsible sections

### ✅ IDS-IFC Validator
Validate IFC models against IDS specifications for data quality control.

- ✅ Full IDS 1.0 validation
- ✅ Applicability & Requirements support
- ✅ Detailed validation results per entity
- ✅ Success statistics and filtering
- ✅ Export results to CSV and XLSX

## 🚀 Quick Start

### Option 1: Use Online (Recommended)
Visit the live demo: [BIM Checker](https://github.com/MichalMarvan/BIM_checker)

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

### Option 3: Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

## 📚 Documentation

- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Architecture and development tips
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute
- **[Requirements](docs/REQUIREMENTS.md)** - Technical requirements and roadmap
- **[Test Guide](tests/README.md)** - Running and writing tests

## 🧪 Testing

Open the test runner in your browser:

```bash
python3 -m http.server 8000
# Navigate to http://localhost:8000/tests/test-runner.html
```

See [tests/README.md](tests/README.md) for more details.

## 📁 Project Structure

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
│       ├── common/                # Shared utilities
│       ├── ifc/                   # IFC parsing
│       ├── ids/                   # IDS editor & parser
│       └── workers/               # Web Workers
├── tests/                          # Test suite
├── docs/                           # Documentation
├── examples/                       # Sample files
│   ├── ifc/                       # Sample IFC files
│   └── ids/                       # Sample IDS files
├── LICENSE                         # MIT License
├── CONTRIBUTING.md                 # Contribution guide
└── package.json                    # Project metadata
```

## 🎯 Supported Standards

- **IFC 4.x** (ISO 16739-1:2024) - Industry Foundation Classes
- **IDS 1.0** - Information Delivery Specification
- **buildingSMART** - Official standards for openBIM

## 🔧 Technologies

- Pure **Vanilla JavaScript** (ES6+)
- No framework dependencies
- Web Workers for performance
- IndexedDB for local storage
- Streaming parser for large files

## 🔒 Security & Privacy

- ✅ **100% client-side** - All processing in your browser
- ✅ **No data uploads** - Files never leave your device
- ✅ **Offline capable** - Works without internet (after initial load)
- ✅ **No tracking** - Privacy-first design

## 🌍 Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

> **Note:** Modern browsers with ES6+ support required

## 🗺️ Roadmap

### Version 0.2
- [ ] XSD validation for IDS
- [ ] IDS templates library
- [ ] Enhanced error messages

### Version 0.3
- [ ] IDS wizard (step-by-step guide)
- [ ] Batch validation
- [ ] Performance optimizations

### Version 1.0
- [ ] Full IDS 1.0 compliance
- [ ] BCF format support
- [ ] bSDD integration

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for detailed roadmap.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

### Ways to Contribute

- 🐛 Report bugs
- 💡 Suggest features
- 📝 Improve documentation
- 🔧 Submit pull requests
- ⭐ Star the project

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Acknowledgments

- IFC Standard © buildingSMART International
- IDS Standard © buildingSMART International

## 📧 Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/MichalMarvan/BIM_checker/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/MichalMarvan/BIM_checker/discussions)

## 🌟 Show Your Support

If you find this project useful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 📢 Sharing with the BIM community

## 🙏 Acknowledgments

- buildingSMART International for IFC and IDS standards
- The open source BIM community
- All contributors

---

**BIM Checker** - Professional tools for BIM data validation | 2025

Made with ❤️ for the openBIM community
