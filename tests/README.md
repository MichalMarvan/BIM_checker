# 🧪 BIM Checker - Test Suite

A complete testing suite for the BIM Checker project.

## 📋 Table of Contents

### Test Suites

1.  **IFC Stream Parser Tests** (`ifc-stream-parser.test.js`)
    - Testing stream parsing of IFC files
    - Entity parsing
    - Argument parsing
    - Value type detection
    - Header/Footer processing

2.  **Storage Tests** (`storage.test.js`)
    - IndexedDB operations
    - Saving/loading IFC files
    - Saving/loading IDS files
    - Folder management
    - File deletion

3.  **I18N Tests** (`i18n.test.js`)
    - CZ/EN translations
    - Language switching
    - Nested keys
    - Fallback mechanism

4.  **IFC Parser Tests** (`ifc-parser.test.js`)
    - Parsing of IFC entities
    - GUID extraction
    - PropertySets
    - Spatial structure
    - Relations

5.  **IDS Parser Tests** (`ids-parser.test.js`)
    - XML parsing
    - Info section
    - Specifications
    - Facets (Entity, Property, Attribute, Classification, Material, PartOf)
    - Restrictions (simpleValue, pattern, enumeration, bounds)

## 🚀 How to Run Tests

### 1. Open the Test Runner

```bash
# Start a local server
python3 -m http.server 8000

# Or with Node.js
npx http-server -p 8000
```

Open in your browser:
```
http://localhost:8000/tests/test-runner.html
```

### 2. Run the Tests

1.  Click the **"▶️ Run all tests"** button.
2.  Wait for all tests to complete.
3.  Review the results.

### 3. Filtering Results

-   **All** - displays all tests
-   **✓ Passed** - displays only passed tests
-   **✗ Failed** - displays only failed tests

## 📊 Statistics

The test runner displays:
-   **Total tests** - total number of tests run
-   **Passed** - number of passed tests
-   **Failed** - number of failed tests
-   **Total time** - duration of all tests

## 🔧 Test Framework

The project uses a simple, custom-built test framework with no dependencies.

### Basic API

```javascript
describe('Test Suite Name', () => {
    beforeEach(() => {
        // Setup before each test
    });

    afterEach(() => {
        // Cleanup after each test
    });

    it('should do something', () => {
        expect(actual).toBe(expected);
    });
});
```

### Assertions

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

## 📁 File Structure

```
tests/
├── test-runner.html              # Main HTML page with the UI
├── test-framework.js             # The testing framework
├── test-runner-ui.js             # UI logic
└── test-suites/                  # The test suites
    ├── ifc-stream-parser.test.js
    ├── storage.test.js
    ├── i18n.test.js
    ├── ifc-parser.test.js
    └── ids-parser.test.js
```

## ✅ Adding New Tests

### 1. Create a new test file

```javascript
// test-suites/my-module.test.js

describe('My Module', () => {
    it('should work correctly', () => {
        const result = myFunction();
        expect(result).toBe(expectedValue);
    });
});
```

### 2. Add it to test-runner.html

```html
<script src="test-suites/my-module.test.js"></script>
```

### 3. Run the tests

Reload the page and click "Run all tests".

## 🎯 Best Practices

1.  **Clear test names** - use the "should" format
    ```javascript
    it('should return true when value is valid', () => {})
    ```

2.  **One concept per test** - each test should test one thing
    ```javascript
    // ✅ Good
    it('should parse entity ID', () => {})
    it('should parse entity type', () => {})
   
    // ❌ Bad
    it('should parse an entity', () => {
        // tests ID, type, name, etc.
    })
    ```

3.  **Arrange-Act-Assert pattern**
    ```javascript
    it('should calculate the sum', () => {
        // Arrange
        const a = 5;
        const b = 3;
       
        // Act
        const result = sum(a, b);
       
        // Assert
        expect(result).toBe(8);
    });
    ```

4.  **Cleanup after tests**
    ```javascript
    describe('Tests with cleanup', () => {
        afterEach(() => {
            // Cleanup IndexedDB, localStorage, etc.
        });
    });
    ```

## 🐛 Debugging

### Console Output

Tests can log to the browser console:
```javascript
console.log('Debug info:', variable);
```

### Error Stack Traces

Each failed test displays:
- Error message
- Stack trace
- Duration

### Browser DevTools

Use the DevTools for:
- Breakpoints in tests
- Network monitoring
- IndexedDB inspection

## 📤 Exporting Results

Click **"📥 Export JSON"** to download the results in the following format:

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

The tests can be integrated into a CI/CD pipeline using a headless browser:

```bash
# Example with Puppeteer
npm install puppeteer
node run-tests-headless.js
```

## 📝 TODO

- [ ] Add tests for the IDS validator
- [ ] Add tests for the IDS editor
- [ ] Add performance tests
- [ ] Add integration tests
- [ ] Add tests for error handling
- [ ] Add coverage reporting

## 🤝 Contributing

When adding new features to BIM Checker:

1.  Write tests BEFORE implementation (TDD)
2.  Ensure that all tests pass
3.  Add new test cases for edge cases
4.  Update this README

## 📧 Support

For questions and bug reports, please use GitHub Issues.

---

**BIM Checker Test Suite** | 2025