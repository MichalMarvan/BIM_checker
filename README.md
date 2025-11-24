# BIM Checker

Professional tools for BIM data validation and analysis according to buildingSMART standards.

## 🚀 Tools

### 📊 IFC Multi-File Viewer
Advanced viewer for analyzing and comparing multiple IFC files simultaneously.

**Features:**
- Load multiple IFC files at once
- Combined table of all entities from multiple files
- Advanced search (text and regex)
- PropertySet management with drag & drop
- Export to CSV
- Pagination and filters
- Sticky columns for better clarity

### 🔍 IDS Parser, Visualizer and Editor
Tool for displaying, analyzing, and editing IDS (Information Delivery Specification) files.

**Features:**
- Parsing IDS files
- Visual display of specifications
- Tree structure
- Raw XML view
- Regex pattern explanation
- **✨ Full-featured IDS editor**
  - Create a new IDS from scratch
  - Add/edit/delete specifications
  - Add/edit/delete facets (Entity, Property, Attribute, Classification, Material, PartOf)
  - Support for all restriction types (simpleValue, pattern, enumeration, bounds)
  - Download edited IDS as an XML file
- Collapsible sections for clarity

### ✅ IDS-IFC Validator
Validate IFC models against IDS specifications for data quality control.

**Features:**
- IFC validation according to IDS standard
- Support for Applicability & Requirements
- Detailed validation results for each entity
- Success statistics
- Result filtering
- Export results to CSV

## 🏃 Local Run

### Python HTTP Server
```bash
cd BIM_checker
python3 -m http.server 8000
```

The application will be available at: http://localhost:8000

### Node.js HTTP Server (alternative)
```bash
npx http-server -p 8000
```

## 🌐 Deploy to Vercel

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login
```bash
vercel login
```

### 3. Deploy
```bash
cd BIM_checker
vercel
```

Or simple deploy:
```bash
vercel --prod
```

### Automatic deploy from GitHub
1. Push project to GitHub
2. Link Vercel with GitHub repository
3. Vercel automatically deploys on each push

## 📁 Project Structure

```
BIM_checker/
├── index.html                           # Main page
├── pages/                                # Tool HTML pages
│   ├── ifc-viewer-multi-file.html       # IFC Multi-File Viewer
│   ├── ids-parser-visualizer.html       # IDS Parser & Editor
│   └── ids-ifc-validator.html           # IDS-IFC Validator
├── assets/                               # Shared resources
│   ├── css/                             # Style files
│   │   └── ids-editor-styles.css        # Styles for IDS editor
│   └── js/                              # JavaScript modules
│       └── ids/                         # IDS editor modules
│           ├── ids-xml-generator.js     # IDS XML generation
│           ├── ids-editor-modals.js     # Modal windows for facets
│           └── ids-editor-core.js       # Main editor logic
├── vercel.json                          # Vercel configuration
├── .gitignore                           # Git ignore rules
└── README.md                            # Documentation
```

## 🔧 Technologies

- **HTML5** - Application structure
- **CSS3** - Styling and responsive design
- **JavaScript (ES6+)** - Application logic
- **IFC Standard** - Industry Foundation Classes
- **IDS Standard** - Information Delivery Specification
- **buildingSMART** - Standards for interoperability

## 🎯 Supported Standards

- **IFC 4.x** - Industry Foundation Classes
- **IDS 1.0** - Information Delivery Specification
- **buildingSMART** - Official standards for BIM

## 📋 Supported Facets (IDS Validation)

- **Entity** - IFC entity validation
- **Property** - PropertySet and value checking
- **Attribute** - Attribute checking (Name, GlobalId, etc.)
- **Material** - Material validation
- **Classification** - Classification system checking
- **PartOf** - Structural relationship validation

## 🔒 Security and Privacy

- All processing happens **locally in the browser**
- No data is sent to servers
- No file storage in the cloud
- The application works offline (after initial load)

## 🌍 Browsers

The application works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## 📝 License

This project is open-source and available for free use.

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or pull request.

## 📧 Contact

For questions and feedback, contact the project author.

---

**BIM Checker** - Tools for working with BIM data | 2024