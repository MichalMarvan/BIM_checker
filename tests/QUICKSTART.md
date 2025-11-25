# 🚀 BIM Checker - Rychlý start s testy

## 📦 Co jsem dostal?

Kompletní testovací framework s 5 test suites:

```
tests/
├── test-runner.html          ← Otevři toto v prohlížeči!
├── test-framework.js         ← Vlastní test framework (jako Jest/Mocha)
├── test-runner-ui.js         ← UI logika
├── README.md                 ← Detailní dokumentace
├── test-data/                ← Ukázková data
│   ├── sample.ifc           ← Testovací IFC soubor
│   └── sample.ids           ← Testovací IDS soubor
└── test-suites/              ← Samotné testy
    ├── ifc-stream-parser.test.js  (27 testů)
    ├── storage.test.js            (15 testů)
    ├── i18n.test.js               (15 testů)
    ├── ifc-parser.test.js         (25 testů)
    └── ids-parser.test.js         (23 testů)
```

**Celkem: 105 testů!** ✨

## ⚡ Jak to spustit (3 kroky)

### 1. Přesuň složku `tests/` do projektu

```bash
# Zkopíruj celou složku tests do BIM_checker-master
BIM_checker-master/
├── assets/
├── pages/
├── tests/          ← Nová složka s testy
├── index.html
└── ...
```

### 2. Spusť lokální server

```bash
cd BIM_checker-master
python3 -m http.server 8000
```

### 3. Otevři v prohlížeči

```
http://localhost:8000/tests/test-runner.html
```

Klikni **"▶️ Spustit všechny testy"** a sleduj výsledky!

## 🎯 Co testy pokrývají?

### ✅ IFC Stream Parser (27 testů)
- Parsování IFC entit
- Extrakce GUID, ID, typu
- Zpracování argumentů
- Hodnoty: string, number, boolean, null, undefined, reference
- Header/Footer processing

### ✅ Storage - IndexedDB (15 testů)
- Ukládání/načítání IFC souborů
- Ukládání/načítání IDS souborů
- Správa složek a cest
- Mazání souborů
- Speciální znaky v názvech

### ✅ Internacionalizace (15 testů)
- CZ/EN překlady
- Nested keys (storage.title, app.version)
- Přepínání jazyků
- Fallback mechanismus
- Missing keys handling

### ✅ IFC Parser (25 testů)
- Parsování IFC struktury
- Entity types (WALL, DOOR, WINDOW...)
- PropertySets a Relations
- Spatial structure
- GUID formát

### ✅ IDS Parser (23 testů)
- XML parsing s DOMParser
- Info section
- Specifications a Facets
- Entity, Property, Attribute, Classification, Material, PartOf
- Restrictions: simpleValue, pattern, enumeration, bounds

## 📊 Očekávané výsledky

Pokud vše funguje správně:
```
✅ Celkem testů: 105
✅ Úspěšných: 105
❌ Neúspěšných: 0
⏱️ Celkový čas: ~500-1000ms
```

## 🐛 Když něco selže

1. **Otevři Developer Tools (F12)**
2. **Podívej se do Console** - uvidíš chybové zprávy
3. **Klikni na ✗ Failed test** - zobrazí se stack trace
4. **Oprav kód** a znovu spusť testy

## 📝 Přidání vlastního testu

```javascript
// V test-suites/my-test.js
describe('My Module', () => {
    it('should work', () => {
        expect(1 + 1).toBe(2);
    });
});
```

```html
<!-- V test-runner.html přidej: -->
<script src="test-suites/my-test.js"></script>
```

## 🎨 Features

✨ **Krásné UI** - Moderní gradient design
✨ **Filtry** - Zobraz jen passed/failed testy
✨ **Export JSON** - Stáhni výsledky
✨ **Real-time progress** - Vidíš progress bar
✨ **Stats** - Celková statistika
✨ **Stack traces** - Detailní error info
✨ **Collapsible suites** - Klikni na suite pro expand/collapse

## 🔧 Test Framework API

```javascript
// Základní struktura
describe('Suite Name', () => {
    beforeEach(() => { /* setup */ });
    afterEach(() => { /* cleanup */ });
    
    it('test description', () => {
        expect(value).toBe(expected);
    });
});

// Assertions
expect(x).toBe(y)              // ===
expect(x).toEqual(y)           // Deep equal
expect(x).toBeTruthy()         // Truthy
expect(x).toBeFalsy()          // Falsy
expect(arr).toContain(item)    // Includes
expect(x).toHaveLength(n)      // Length
expect(x).toBeGreaterThan(n)   // >
expect(x).toBeLessThan(n)      // <
expect(fn).toThrow(msg)        // Throws error
expect(str).toMatch(/regex/)   // Regex
expect(obj).toHaveProperty(k)  // Has property
```

## 💡 Tips

1. **Spusť testy často** - Při každé změně kódu
2. **Čti stack traces** - Pomáhají najít chyby
3. **Přidávej nové testy** - Když přidáš feature
4. **Testuj edge cases** - Null, undefined, prázdné hodnoty
5. **Používej beforeEach/afterEach** - Pro cleanup

## 🎓 Další informace

Přečti si **`tests/README.md`** pro:
- Detailní dokumentaci každé test suite
- Best practices pro psaní testů
- Debugging tips
- CI/CD integration
- Contributing guidelines

## ✅ Checklist pro integraci

- [ ] Zkopírovat složku `tests/` do projektu
- [ ] Spustit lokální server
- [ ] Otevřít test-runner.html
- [ ] Spustit všechny testy
- [ ] Ověřit, že projdou (105/105)
- [ ] Přidat do .gitignore (pokud třeba)
- [ ] Commitnout do Git

## 🚀 Hotovo!

Máš nyní profesionální testovací framework pro tvůj BIM Checker projekt!

**Happy testing! 🎉**

---

Pro pomoc nebo dotazy: GitHub Issues
