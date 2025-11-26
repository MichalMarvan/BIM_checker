# 🚀 BIM Checker - Test Quick Start

## 📦 What's Included?

A complete testing framework with 5 test suites:

```
tests/
├── test-runner.html          ← Open this in your browser!
├── test-framework.js         ← Custom test framework (like Jest/Mocha)
├── test-runner-ui.js         ← UI logic
├── README.md                 ← Detailed documentation
├── test-data/                ← Sample data
│   ├── sample.ifc           ← Test IFC file
│   └── sample.ids           ← Test IDS file
└── test-suites/              ← The tests themselves
    ├── ifc-stream-parser.test.js  (27 tests)
    ├── storage.test.js            (15 tests)
    ├── i18n.test.js               (15 tests)
    ├── ifc-parser.test.js         (25 tests)
    └── ids-parser.test.js         (23 tests)
```

**Total: 105 tests!** ✨

## ⚡ How to Run (3 Steps)

### 1. Move the `tests/` folder into your project

```bash
# Copy the entire tests folder into BIM_checker-master
BIM_checker-master/
├── assets/
├── pages/
├── tests/          ← New folder with tests
├── index.html
└── ...
```

### 2. Start a local server

```bash
cd BIM_checker-master
python3 -m http.server 8000
```

### 3. Open in your browser

```
http://localhost:8000/tests/test-runner.html
```

Click **"▶️ Run all tests"** and watch the results!

## 🎯 What the Tests Cover

### ✅ IFC Stream Parser (27 tests)
- Parsing IFC entities
- Extracting GUID, ID, type
- Processing arguments
- Values: string, number, boolean, null, undefined, reference
- Header/Footer processing

### ✅ Storage - IndexedDB (15 tests)
- Saving/loading IFC files
- Saving/loading IDS files
- Folder and path management
- Deleting files
- Special characters in names

### ✅ Internationalization (15 tests)
- CZ/EN translations
- Nested keys (storage.title, app.version)
- Language switching
- Fallback mechanism
- Missing keys handling

### ✅ IFC Parser (25 tests)
- Parsing IFC structure
- Entity types (WALL, DOOR, WINDOW...)
- PropertySets and Relations
- Spatial structure
- GUID format

### ✅ IDS Parser (23 tests)
- XML parsing with DOMParser
- Info section
- Specifications and Facets
- Entity, Property, Attribute, Classification, Material, PartOf
- Restrictions: simpleValue, pattern, enumeration, bounds

## 📊 Expected Results

If everything works correctly:
```
✅ Total tests: 105
✅ Passed: 105
❌ Failed: 0
⏱️ Total time: ~500-1000ms
```

## 🐛 When Something Fails

1.  **Open Developer Tools (F12)**
2.  **Look at the Console** - you will see error messages
3.  **Click on the ✗ Failed test** - a stack trace will be displayed
4.  **Fix the code** and run the tests again

## 📝 Adding Your Own Test

```javascript
// In test-suites/my-test.js
describe('My Module', () => {
    it('should work', () => {
        expect(1 + 1).toBe(2);
    });
});
```

```html
<!-- In test-runner.html, add: -->
<script src="test-suites/my-test.js"></script>
```

## 🎨 Features

✨ **Beautiful UI** - Modern gradient design
✨ **Filters** - Show only passed/failed tests
✨ **JSON Export** - Download the results
✨ **Real-time progress** - Watch the progress bar
✨ **Stats** - Overall statistics
✨ **Stack traces** - Detailed error info
✨ **Collapsible suites** - Click on a suite to expand/collapse

## 🔧 Test Framework API

```javascript
// Basic structure
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

1.  **Run tests often** - On every code change
2.  **Read stack traces** - They help you find bugs
3.  **Add new tests** - When you add a feature
4.  **Test edge cases** - Null, undefined, empty values
5.  **Use beforeEach/afterEach** - For cleanup

## 🎓 Further Information

Read **`tests/README.md`** for:
- Detailed documentation of each test suite
- Best practices for writing tests
- Debugging tips
- CI/CD integration
- Contributing guidelines

## ✅ Integration Checklist

- [ ] Copy the `tests/` folder into the project
- [ ] Start a local server
- [ ] Open test-runner.html
- [ ] Run all tests
- [ ] Verify that they pass (105/105)
- [ ] Add to .gitignore (if necessary)
- [ ] Commit to Git

## 🚀 Done!

You now have a professional testing framework for your BIM Checker project!

**Happy testing! 🎉**

---

For help or questions: GitHub Issues