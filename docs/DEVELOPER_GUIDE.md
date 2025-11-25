# BIM Checker - Quick Start Guide pro vývojáře

## 🚀 Rychlý start během 5 minut

### 1. Klonování a spuštění

```bash
# Klonování
git clone https://github.com/YOUR_USERNAME/BIM_checker.git
cd BIM_checker

# Jednoduché spuštění (Python)
python3 -m http.server 8000

# Nebo Node.js
npx http-server -p 8000
```

Otevřete: http://localhost:8000

### 2. Základní použití

#### Nahrání IFC souboru
```javascript
// V IFC Multi-File Viewer
// 1. Přetáhněte .ifc soubor do upload boxu
// 2. Nebo klikněte a vyberte soubor
// 3. Parser automaticky zpracuje soubor
```

#### Práce s IDS validací
```javascript
// V IDS-IFC Validator
// 1. Nahrajte IFC soubor
// 2. Nahrajte IDS specifikaci (.ids nebo .xml)
// 3. Klikněte "Validate"
// 4. Prohlédněte si výsledky
```

## 📂 Struktura projektu

```
BIM_checker/
├── index.html              # Hlavní stránka s přehledem nástrojů
├── pages/                  # Jednotlivé nástroje
│   ├── ifc-viewer-multi-file.html
│   ├── ids-parser-visualizer.html
│   └── ids-ifc-validator.html
├── assets/
│   ├── js/
│   │   ├── common/         # Sdílené moduly
│   │   │   ├── ifc-stream-parser.js    # ⭐ IFC parser
│   │   │   ├── storage.js              # IndexedDB storage
│   │   │   ├── virtual-tree.js         # Efektivní tree view
│   │   │   ├── i18n.js                 # Internacionalizace
│   │   │   └── utils.js                # Utility funkce
│   │   ├── ids/            # IDS specifické moduly
│   │   │   ├── ids-editor-core.js      # ⭐ IDS editor
│   │   │   ├── ids-xml-generator.js    # XML generátor
│   │   │   └── ifc-data.js             # IFC schema data
│   │   ├── workers/
│   │   │   └── ifc-parser.worker.js    # Web Worker
│   │   ├── viewer.js       # ⭐ IFC viewer logika
│   │   ├── parser.js       # ⭐ IDS parser
│   │   └── validator.js    # ⭐ IDS-IFC validator
│   └── css/                # Styly
└── tests/                  # Test suite
```

**⭐ = Klíčové soubory pro pochopení**

## 🔍 Jak funguje IFC Parser

### Stream parsing velkých souborů

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
            
            // Dekódování a zpracování
            const chunk = decoder.decode(value);
            this.buffer += chunk;
            this.processBuffer();
        }
    }

    processLine(line) {
        // Parsování entity
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

### Proč streaming?
- ✅ Soubory mohou být 100MB+
- ✅ Neblokuje UI
- ✅ Nižší memory footprint
- ✅ Progress reporting

## 🎯 Jak funguje IDS Validace

### 1. Parsování IDS XML

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

### 2. Validace entity

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

### Typy facetů

1. **Entity** - typ IFC entity
2. **Property** - hodnoty v PropertySets
3. **Attribute** - atributy entity (Name, GlobalId, etc.)
4. **Material** - materiály
5. **Classification** - klasifikační systémy
6. **PartOf** - strukturální vztahy

## 🛠️ Přidání nové funkce

### Příklad: Přidání nového filtru

```javascript
// 1. Přidejte UI element
// pages/ifc-viewer-multi-file.html
<input type="text" id="myNewFilter" placeholder="Nový filtr">

// 2. Přidejte event listener
// assets/js/viewer.js
document.getElementById('myNewFilter').addEventListener('input', (e) => {
    const filterValue = e.target.value;
    applyMyNewFilter(filterValue);
});

// 3. Implementujte filtrační logiku
function applyMyNewFilter(value) {
    const filteredEntities = allEntities.filter(entity => {
        // Vaše filtrační logika
        return entity.someProperty.includes(value);
    });
    
    updateTable(filteredEntities);
}

// 4. Přidejte testy
// tests/unit/filters.test.js
describe('My New Filter', () => {
    it('should filter entities correctly', () => {
        const entities = [/* test data */];
        const result = applyMyNewFilter('test');
        expect(result).toHaveLength(expectedLength);
    });
});
```

## 📊 Debugging tips

### 1. Browser DevTools

```javascript
// V Console:
// Prohlédněte si globální proměnné
console.log(allEntities);      // Všechny parsované entity
console.log(validationResults); // Výsledky validace
console.log(idsFiles);          // Nahrané IDS soubory

// Performance monitoring
console.log(window.performanceData);
```

### 2. Performance Profiling

```javascript
// V assets/js/common/performance-monitor.js
const monitor = new PerformanceMonitor();

monitor.start('parsing');
// ... váš kód
monitor.end('parsing');

console.log(monitor.getStats());
// { parsing: { time: 1234, memory: 45678 } }
```

### 3. IndexedDB inspection

```javascript
// V Console:
// Prohlédněte si uložená data
indexedDB.databases().then(dbs => console.log(dbs));

// Smazání storage pro testování
localStorage.clear();
indexedDB.deleteDatabase('BIMCheckerDB');
```

## 🧪 Testování

### Testovací IFC soubory

1. **Jednoduché** (< 1MB):
   - https://github.com/buildingSMART/Sample-Test-Files
   - Rychlé testování funkcí

2. **Velké** (> 50MB):
   - Testování performance
   - Stream parsing
   - Memory management

3. **Speciální případy**:
   - Soubory s unicode znaky (čeština)
   - Soubory s chybami
   - Neúplné soubory

### Testovací IDS specifikace

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

## 🐛 Časté problémy

### "File too large" error
```javascript
// Řešení: Zvyšte chunk size nebo použijte Web Worker
const parser = new IFCStreamParser({
    chunkSize: 2 * 1024 * 1024  // 2MB
});
```

### "Out of memory"
```javascript
// Řešení: Implementujte pagination
const ITEMS_PER_PAGE = 1000;
const displayedEntities = allEntities.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
);
```

### Unicode problémy s češtinou
```javascript
// Řešení: Správné encoding
const decoder = new TextDecoder('utf-8');
const text = decoder.decode(buffer);
```

## 📚 Další zdroje

### Dokumentace
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

## 💡 Best practices

1. **Vždy testujte s velkými soubory** (> 50MB)
2. **Používejte Web Workers** pro heavy operations
3. **Implementujte proper error handling**
4. **Přidávejte progress indicators** pro dlouhé operace
5. **Dokumentujte veřejné API** pomocí JSDoc
6. **Píšte testy** pro kritické funkce
7. **Optimalizujte memory usage** (uvolňujte reference)
8. **Používejte async/await** pro async operace

## 🎓 Tutoriály

### 1. Přidání nového typu facetu do IDS validátoru

[Podrobný návod krok za krokem...]

### 2. Vytvoření custom exportu

[Jak exportovat data do vlastního formátu...]

### 3. Integrace s externím API

[Jak napojit na buildingSMART validation service...]

---

**Potřebujete pomoct?** Otevřete Issue na GitHubu nebo se zeptejte na fóru!
