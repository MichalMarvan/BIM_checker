# BIM Checker - Developer Quick Start Guide

## 🚀 5-Minute Quick Start

### 1. Clone and Run

```bash
# Clone the repository
git clone https://github.com/MichalMarvan/BIM_checker.git
cd BIM_checker

# Simple execution (Python)
python3 -m http.server 8000

# Or with Node.js
npx http-server -p 8000
```

Open: http://localhost:8000

### 2. Basic Usage

#### Uploading an IFC file
```javascript
// In the IFC Multi-File Viewer
// 1. Drag and drop an .ifc file into the upload box
// 2. Or click to select a file
// 3. The parser will process the file automatically
```

#### Working with IDS Validation
```javascript
// In the IDS-IFC Validator
// 1. Upload an IFC file
// 2. Upload an IDS specification (.ids or .xml)
// 3. Click "Validate"
// 4. Review the results
```

## 📂 Project Structure

```
BIM_checker/
├── index.html              # Main page with tool overview
├── pages/                  # Individual tools
│   ├── ifc-viewer-multi-file.html
│   ├── ids-parser-visualizer.html
│   └── ids-ifc-validator.html
├── assets/
│   ├── js/
│   │   ├── common/         # Shared modules
│   │   │   ├── storage.js              # IndexedDB storage
│   │   │   ├── i18n.js                 # Internationalization
│   │   │   ├── translations.js         # Translation strings (CS/EN)
│   │   │   ├── theme.js                # Dark/light mode toggle
│   │   │   ├── components.js           # Reusable HTML components
│   │   │   ├── drag-drop.js            # File drag & drop handler
│   │   │   ├── error-handler.js        # Global error handling
│   │   │   └── performance-monitor.js  # Performance tracking
│   │   ├── ifc/            # IFC-specific modules
│   │   │   └── ifc-stream-parser.js    # ⭐ Streaming IFC parser
│   │   ├── ids/            # IDS-specific modules
│   │   │   ├── ids-editor-core.js      # ⭐ IDS editor
│   │   │   ├── ids-editor-modals.js    # Editor modals
│   │   │   ├── ids-xml-generator.js    # XML generator
│   │   │   └── ifc-data.js             # IFC schema data
│   │   ├── ifc/            # ⭐ IFC viewer modules
│   │   │   ├── viewer-core.js          # Core viewer logic
│   │   │   ├── viewer-init.js          # Initialization
│   │   │   ├── viewer-parser.js        # IFC parsing integration
│   │   │   └── viewer-ui.js            # UI interactions
│   │   ├── vendor/         # Third-party libraries
│   │   │   └── xlsx.full.min.js        # SheetJS for Excel export
│   │   ├── workers/
│   │   │   └── ifc-parser.worker.js    # Web Worker
│   │   ├── parser.js       # ⭐ IDS parser page logic
│   │   ├── index.js        # Main page logic
│   │   └── validator.js    # ⭐ IDS-IFC validator page logic
│   └── css/                # Stylesheets
└── tests/                  # Test suite (Puppeteer)
```

**⭐ = Key files to understand**

## 🔍 How the IFC Parser Works

### Stream Parsing Large Files

```javascript
// assets/js/common/ifc-stream-parser.js

class IFCStreamParser {
    constructor(options) {
        this.chunkSize = 1024 * 1024;  // 1MB chunks
        this.buffer = '';
        this.entityCount = 0;
    }

    async parseFile(file) {
        const stream = file.stream();
        const reader = stream.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode and process
            const decoder = new TextDecoder('utf-8');
            const chunk = decoder.decode(value);
            this.buffer += chunk;
            this.processBuffer();
        }
    }

    processLine(line) {
        // Parse an entity
        // #123=IFCWALL('guid',#5,'Wall-001',$,$,#10,#15,$,.STANDARD.);
        const match = line.match(/#(\d+)\s*=\s*(\w+)\((.*)\);/);
        
        if (match) {
            return {
                id: parseInt(match[1]),
                type: match[2],
                attributes: this.parseAttributes(match[3])
            };
        }
    }
}
```

### Why Streaming?
- ✅ Files can be 100MB+
- ✅ Does not block the UI
- ✅ Lower memory footprint
- ✅ Progress reporting

## 🎯 How IDS Validation Works

### 1. Parsing IDS XML

```javascript
// assets/js/parser.js

function parseIDS(xmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    const specifications = doc.querySelectorAll('specification');
    
    return Array.from(specifications).map(spec => ({
        name: spec.getAttribute('name'),
        applicability: parseFacets(spec.querySelector('applicability')),
        requirements: parseFacets(spec.querySelector('requirements'))
    }));
}
```

### 2. Validating an Entity

```javascript
// assets/js/validator.js

function validateEntity(entity, specification) {
    // 1. Check applicability
    const isApplicable = checkApplicability(entity, specification.applicability);
    
    if (!isApplicable) {
        return { applicable: false };
    }
    
    // 2. Check requirements
    const requirementResults = specification.requirements.map(req => 
        checkRequirement(entity, req)
    );
    
    return {
        applicable: true,
        passed: requirementResults.every(r => r.passed),
        results: requirementResults
    };
}
```

### Facet Types

1.  **Entity** - IFC entity type
2.  **Property** - Values in PropertySets
3.  **Attribute** - Entity attributes (Name, GlobalId, etc.)
4.  **Material** - Materials
5.  **Classification** - Classification systems
6.  **PartOf** - Structural relationships

## 🛠️ Adding a New Feature

### Example: Adding a New Filter

```javascript
// 1. Add the UI element
// pages/ifc-viewer-multi-file.html
<input type="text" id="myNewFilter" placeholder="New Filter">

// 2. Add an event listener
// assets/js/ifc/viewer-ui.js
document.getElementById('myNewFilter').addEventListener('input', (e) => {
    const filterValue = e.target.value;
    applyMyNewFilter(filterValue);
});

// 3. Implement the filtering logic
function applyMyNewFilter(value) {
    const filteredEntities = allEntities.filter(entity => {
        // Your filtering logic here
        return entity.someProperty.includes(value);
    });
    
    updateTable(filteredEntities);
}

// 4. Add tests
// tests/unit/filters.test.js
describe('My New Filter', () => {
    it('should filter entities correctly', () => {
        const entities = [/* test data */];
        const result = applyMyNewFilter('test');
        expect(result).toHaveLength(expectedLength);
    });
});
```

## 📊 Debugging Tips

### 1. Browser DevTools

```javascript
// In the Console:
// Inspect global variables
console.log(allEntities);      // All parsed entities
console.log(validationResults); // Validation results
console.log(idsFiles);          // Uploaded IDS files

// Performance monitoring
console.log(window.performanceData);
```

### 2. Performance Profiling

```javascript
// In assets/js/common/performance-monitor.js
const monitor = new PerformanceMonitor();

monitor.start('parsing');
// ... your code
monitor.end('parsing');

console.log(monitor.getStats());
// { parsing: { time: 1234, memory: 45678 } }
```

### 3. IndexedDB Inspection

```javascript
// In the Console:
// Inspect stored data
indexedDB.databases().then(dbs => console.log(dbs));

// Clear storage for testing
localStorage.clear();
indexedDB.deleteDatabase('BIMCheckerDB');
```

## 🧪 Testing

### Test IFC Files

1.  **Simple** (< 1MB):
    *   https://github.com/buildingSMART/Sample-Test-Files
    *   For quick feature testing

2.  **Large** (> 50MB):
    *   For performance testing
    *   Stream parsing
    *   Memory management

3.  **Special Cases**:
    *   Files with Unicode characters (e.g., Czech)
    *   Files with errors
    *   Incomplete files

### Test IDS Specifications

```xml
<!-- test.ids -->
<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <info>
    <title>Test Specification</title>
  </info>
  <specifications>
    <specification name="Walls must have FireRating">
      <applicability>
        <entity>
          <name>
            <simpleValue>IFCWALL</simpleValue>
          </name>
        </entity>
      </applicability>
      <requirements>
        <property propertySet="Pset_WallCommon" name="FireRating">
          <value>
            <xs:restriction base="xs:string">
              <xs:enumeration value="REI30"/>
              <xs:enumeration value="REI60"/>
              <xs:enumeration value="REI90"/>
            </xs:restriction>
          </value>
        </property>
      </requirements>
    </specification>
  </specifications>
</ids>
```

## 🐛 Common Problems

### "File too large" error
```javascript
// Solution: Increase chunk size or use a Web Worker
const parser = new IFCStreamParser({
    chunkSize: 2 * 1024 * 1024  // 2MB
});
```

### "Out of memory"
```javascript
// Solution: Implement pagination
const ITEMS_PER_PAGE = 1000;
const displayedEntities = allEntities.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
);
```

### Unicode issues with special characters
```javascript
// Solution: Use correct encoding
const decoder = new TextDecoder('utf-8');
const text = decoder.decode(buffer);
```

## 📚 Further Resources

### Documentation
- [IFC Specification](https://ifc43-docs.standards.buildingsmart.org/)
- [IDS GitHub](https://github.com/buildingSMART/IDS)
- [buildingSMART Standards](https://www.buildingsmart.org/standards/)

### Community
- [buildingSMART Forums](https://forums.buildingsmart.org/)
- [OSArch Forum](https://community.osarch.org/)
- [IFC.js Discord](https://discord.gg/ifcjs)

### Tools
- [IFC.js](https://ifcjs.github.io/info/) - JavaScript IFC toolkit
- [IfcOpenShell](https://ifcopenshell.org/) - Python IFC toolkit
- [xeokit](https://xeokit.io/) - WebGL BIM viewer

## 💡 Best Practices

1.  **Always test with large files** (> 50MB)
2.  **Use Web Workers** for heavy operations
3.  **Implement proper error handling**
4.  **Add progress indicators** for long operations
5.  **Document public APIs** using JSDoc
6.  **Write tests** for critical functions
7.  **Optimize memory usage** (release references)
8.  **Use async/await** for async operations

## 🎓 Tutorials

### 1. Adding a New Facet Type to the IDS Validator

[Detailed step-by-step guide...]

### 2. Creating a Custom Export

[How to export data to a custom format...]

### 3. Integrating with an External API

[How to connect to the buildingSMART validation service...]

---

**Need help?** Open an Issue on GitHub or ask in the forums!