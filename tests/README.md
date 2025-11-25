# 🧪 BIM Checker - Test Suite

Kompletní testovací sada pro projekt BIM Checker.

## 📋 Obsah

### Test Suites (Testovací sady)

1. **IFC Stream Parser Tests** (`ifc-stream-parser.test.js`)
   - Testování streamového parsování IFC souborů
   - Entity parsing
   - Argument parsing
   - Value type detection
   - Header/Footer processing

2. **Storage Tests** (`storage.test.js`)
   - IndexedDB operace
   - Ukládání/načítání IFC souborů
   - Ukládání/načítání IDS souborů
   - Správa složek
   - Mazání souborů

3. **I18N Tests** (`i18n.test.js`)
   - Překlady CZ/EN
   - Přepínání jazyků
   - Nested keys
   - Fallback mechanismus

4. **IFC Parser Tests** (`ifc-parser.test.js`)
   - Parsování IFC entity
   - Extrakce GUID
   - PropertySets
   - Spatial structure
   - Relations

5. **IDS Parser Tests** (`ids-parser.test.js`)
   - XML parsing
   - Info section
   - Specifications
   - Facets (Entity, Property, Attribute, Classification, Material, PartOf)
   - Restrictions (simpleValue, pattern, enumeration, bounds)

## 🚀 Jak spustit testy

### 1. Otevřít Test Runner

```bash
# Spustit lokální server
python3 -m http.server 8000

# Nebo Node.js
npx http-server -p 8000
```

Otevřít v prohlížeči:
```
http://localhost:8000/tests/test-runner.html
```

### 2. Spustit testy

1. Kliknout na tlačítko **"▶️ Spustit všechny testy"**
2. Počkat na dokončení všech testů
3. Prohlédnout výsledky

### 3. Filtrování výsledků

- **Všechny** - zobrazí všechny testy
- **✓ Úspěšné** - zobrazí pouze úspěšné testy
- **✗ Neúspěšné** - zobrazí pouze selhavší testy

## 📊 Statistiky

Test runner zobrazuje:
- **Celkem testů** - celkový počet spuštěných testů
- **Úspěšných** - počet úspěšných testů
- **Neúspěšných** - počet selhavších testů
- **Celkový čas** - doba trvání všech testů

## 🔧 Test Framework

Projekt používá vlastní jednoduchý test framework bez závislostí:

### Základní API

```javascript
describe('Test Suite Name', () => {
    beforeEach(() => {
        // Setup před každým testem
    });

    afterEach(() => {
        // Cleanup po každém testu
    });

    it('should do something', () => {
        expect(actual).toBe(expected);
    });
});
```

### Assertions (Tvrzení)

```javascript
expect(value).toBe(expected)              // Strict equality (===)
expect(value).toEqual(expected)           // Deep equality
expect(value).toBeTruthy()                // Truthy value
expect(value).toBeFalsy()                 // Falsy value
expect(value).toBeNull()                  // null
expect(value).toBeUndefined()             // undefined
expect(value).toBeDefined()               // not undefined
expect(array).toContain(item)             // Array/String contains
expect(value).toHaveLength(length)        // Length check
expect(value).toBeGreaterThan(num)        // Greater than
expect(value).toBeLessThan(num)           // Less than
expect(value).toBeInstanceOf(Class)       // Instance check
expect(fn).toThrow(errorMessage)          // Function throws
expect(asyncFn).toThrowAsync(message)     // Async throws
expect(string).toMatch(regex)             // Regex match
expect(obj).toHaveProperty(prop, value)   // Property check
```

## 📁 Struktura souborů

```
tests/
├── test-runner.html              # Hlavní HTML stránka s UI
├── test-framework.js             # Testovací framework
├── test-runner-ui.js             # UI logika
└── test-suites/                  # Testovací sady
    ├── ifc-stream-parser.test.js
    ├── storage.test.js
    ├── i18n.test.js
    ├── ifc-parser.test.js
    └── ids-parser.test.js
```

## ✅ Přidání nových testů

### 1. Vytvořit nový test file

```javascript
// test-suites/my-module.test.js

describe('My Module', () => {
    it('should work correctly', () => {
        const result = myFunction();
        expect(result).toBe(expectedValue);
    });
});
```

### 2. Přidat do test-runner.html

```html
<script src="test-suites/my-module.test.js"></script>
```

### 3. Spustit testy

Obnovit stránku a kliknout na "Spustit všechny testy"

## 🎯 Best Practices

1. **Jasné názvy testů** - použít "should" formát
   ```javascript
   it('should return true when value is valid', () => {})
   ```

2. **Jeden koncept per test** - každý test testuje jednu věc
   ```javascript
   // ✅ Good
   it('should parse entity ID', () => {})
   it('should parse entity type', () => {})
   
   // ❌ Bad
   it('should parse entity', () => {
       // tests ID, type, name, etc.
   })
   ```

3. **Arrange-Act-Assert pattern**
   ```javascript
   it('should calculate sum', () => {
       // Arrange
       const a = 5;
       const b = 3;
       
       // Act
       const result = sum(a, b);
       
       // Assert
       expect(result).toBe(8);
   });
   ```

4. **Cleanup po testech**
   ```javascript
   describe('Tests with cleanup', () => {
       afterEach(() => {
           // Cleanup IndexedDB, localStorage, atd.
       });
   });
   ```

## 🐛 Debugging

### Console Output

Testy vypisují do konzole prohlížeče:
```javascript
console.log('Debug info:', variable);
```

### Error Stack Traces

Každý selhavší test zobrazuje:
- Error message
- Stack trace
- Dobu trvání

### Browser DevTools

Použít DevTools pro:
- Breakpoints v testech
- Network monitoring
- IndexedDB inspection

## 📤 Export výsledků

Klikněte na **"📥 Export JSON"** pro stažení výsledků ve formátu:

```json
{
  "total": 100,
  "passed": 95,
  "failed": 5,
  "duration": 1234,
  "suites": [
    {
      "name": "IFC Stream Parser",
      "passed": 20,
      "failed": 0,
      "tests": [...]
    }
  ]
}
```

## 🔄 CI/CD Integration

Testy lze integrovat do CI/CD pomocí headless prohlížeče:

```bash
# Příklad s Puppeteer
npm install puppeteer
node run-tests-headless.js
```

## 📝 TODO

- [ ] Přidat testy pro IDS validátor
- [ ] Přidat testy pro IDS editor
- [ ] Přidat performance testy
- [ ] Přidat integration testy
- [ ] Přidat testy pro error handling
- [ ] Přidat coverage reporting

## 🤝 Contributing

Při přidávání nových funkcí do BIM Checker:

1. Napsat testy PŘED implementací (TDD)
2. Zajistit, že všechny testy procházejí
3. Přidat nové test cases pro edge cases
4. Aktualizovat tento README

## 📧 Support

Pro otázky a bug reporty použít GitHub Issues.

---

**BIM Checker Test Suite** | 2025
