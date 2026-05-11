# Contributing to BIM Checker

First off, thank you for considering contributing to BIM Checker! It's people like you that make BIM Checker such a great tool for the AEC/BIM community.

## 🌟 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (sample IFC/IDS files if possible)
- **Describe the behavior you observed and what you expected**
- **Include screenshots** if relevant
- **Note your browser and version**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful** to most BIM Checker users
- **List some examples** of where this enhancement could be used

### Pull Requests

1. **Fork the repository** and create your branch from `master`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Write a clear commit message** following our commit conventions
6. **Submit a pull request**

## 📝 Development Process

### Setup Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/BIM_checker.git
cd BIM_checker

# Install dependencies
npm install

# Start development server
python3 -m http.server 8000
# or
npx http-server -p 8000
```

### Coding Standards

#### JavaScript Style Guide

We follow standard JavaScript conventions:

```javascript
// ✅ Good
function parseIFCEntity(line) {
    const match = line.match(ENTITY_REGEX);
    if (!match) return null;
    
    return {
        id: parseInt(match[1]),
        type: match[2],
        attributes: parseAttributes(match[3])
    };
}

// ❌ Bad
function parseIFCEntity(line){
  var match=line.match(ENTITY_REGEX)
  if(!match)return null
  return {id:parseInt(match[1]),type:match[2],attributes:parseAttributes(match[3])}
}
```

**Key principles:**
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_SNAKE_CASE for constants
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Handle errors gracefully

#### File Organization

```
assets/
├── js/
│   ├── common/          # Shared utilities (i18n, storage, theme, etc.)
│   ├── ids/             # IDS-specific logic (editor, XML generator)
│   ├── ifc/             # IFC viewer modules (core, init, parser, ui)
│   ├── vendor/          # Third-party libraries (xlsx)
│   ├── workers/         # Web Workers
│   ├── parser.js        # IDS parser page logic
│   └── validator.js     # IFC-IDS validator page logic
├── css/
│   ├── common.css       # Shared styles
│   └── [tool].css       # Tool-specific styles
```

### Commit Message Guidelines

We use conventional commits:

```
feat: add support for IFC 4.3 Advanced format
fix: correct PropertySet parsing for special characters
docs: update API documentation for validator
test: add unit tests for IDS parser
refactor: optimize streaming parser performance
style: format code according to style guide
chore: update dependencies
```

Format: `<type>(<scope>): <subject>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `style`: Code formatting
- `chore`: Maintenance

### Testing

Before submitting a PR:

```bash
# Run tests
npm test

# Check code style (ESLint)
npm run lint

# Test with various browsers
# - Chrome/Edge
# - Firefox
# - Safari (if available)
```

**Manual testing checklist:**
- [ ] Test with small IFC file (< 1MB)
- [ ] Test with large IFC file (> 50MB)
- [ ] Test with multiple IFC files
- [ ] Test IDS validation with sample IDS files
- [ ] Test all UI interactions (drag-drop, buttons, filters)
- [ ] Test on mobile browser (if UI changes)
- [ ] Check browser console for errors
- [ ] Verify performance (no UI freezing)

## 🏗️ Project Architecture

### Key Components

#### 1. IFC Stream Parser (`ifc-stream-parser.js`)
Handles parsing of large IFC files using streaming:
```javascript
class IFCStreamParser {
    constructor(options);      // Initialize with callbacks
    async parseFile(file);     // Parse IFC file in chunks
    processBuffer();           // Process complete lines
    processLine(line);         // Parse individual entity
    parseEntity(line);         // Extract entity data
}
```

#### 2. IDS Parser (`parser.js`)
Parses IDS XML files:
```javascript
function parseIDS(xmlContent, fileName);
function parseSpecification(specNode);
function parseFacet(facetNode);
function parseRestriction(restrictionNode);
```

#### 3. IDS-IFC Validator (`validator.js`)
Validates IFC models against IDS specifications:
```javascript
function validateAgainstIDS(entities, specifications);
function checkApplicability(entity, facets);
function checkRequirements(entity, facets);
function validateFacet(entity, facet);
```

### Data Flow

```
IFC File → Stream Parser → Entities Array
                                ↓
IDS File → XML Parser → Specifications Array
                                ↓
                    Validator Engine
                                ↓
                        Results Object
                                ↓
                    UI Rendering
```

## 🧪 Test Data

Sample IFC and IDS files for testing:
- buildingSMART sample models: https://github.com/buildingSMART/Sample-Test-Files
- IDS examples: https://github.com/buildingSMART/IDS/tree/master/Documentation/testcases

## 📚 Resources

### BIM Standards
- [buildingSMART International](https://www.buildingsmart.org/)
- [IFC Documentation](https://ifc43-docs.standards.buildingsmart.org/)
- [IDS Specification](https://github.com/buildingSMART/IDS)
- [IFC Wiki](https://www.ifcwiki.org/)

### Development
- [Web Workers MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [IndexedDB MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [File API MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_API)

## 💬 Communication

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussions
- **Pull Requests**: Code contributions

## 📄 License & DCO sign-off

BIM Checker is licensed under the **GNU Affero General Public License v3.0 or later** ([AGPL-3.0-or-later](LICENSE)).

By submitting a pull request, you agree to:

1. **License your contribution under AGPL-3.0-or-later** — same terms as the rest of the project. You retain copyright to your work; you grant the project the right to distribute it under AGPL.
2. **Add SPDX + Copyright headers** to any new source file you create:
   ```
   /* SPDX-License-Identifier: AGPL-3.0-or-later */
   /* Copyright (C) <year> <Your Name> */
   ```
   Use `<!-- ... -->` style for HTML.
3. **Sign off your commits** using the Developer Certificate of Origin (DCO):
   ```bash
   git commit -s -m "your message"
   ```
   This appends a `Signed-off-by: Your Name <your@email>` line and certifies you wrote the code (or have the right to submit it). See [developercertificate.org](https://developercertificate.org/) for the full DCO text.

### What AGPL means for users of your fork

If you fork BIM Checker and run it as a network service (e.g. host a modified version on your server), AGPL requires you to make the source code of your modified version available to users interacting with it. The canonical source for the upstream project lives at https://github.com/MichalMarvan/BIM_checker.

If you fork only for personal/local use, no obligations beyond standard GPL apply.

### Vendor dependencies

Some bundled dependencies remain under their own licenses (e.g. `xlsx.full.min.js` — Apache 2.0, `xmllint-wasm` — MIT/LGPL). Do not relicense them; reuse them as-is per their original terms.

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to make BIM data validation better for everyone! 🎉
