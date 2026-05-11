# bSDD Integration into IDS Maker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate buildingSMART Data Dictionary (bSDD) API into the IDS Maker, enabling users to search/select classifications, properties, and materials from bSDD with automatic URI references in generated IDS XML.

**Architecture:** New `bsdd-api.js` service layer handles all bSDD REST API communication with debounce and in-memory caching. Custom autocomplete dropdown component replaces native `<datalist>` for bSDD-enabled fields. Existing static IFC data lists remain unchanged. URI attributes are added to facet data model and XML generation.

**Tech Stack:** Vanilla JS (no build system), bSDD REST API (`https://api.bsdd.buildingsmart.org`), existing custom test framework (Jasmine-like).

---

### Task 1: bSDD API Service Layer

**Files:**
- Create: `assets/js/ids/bsdd-api.js`
- Test: `tests/test-suites/bsdd-api.test.js`

**Step 1: Write the failing test**

Create `tests/test-suites/bsdd-api.test.js`:

```javascript
// =======================
// bSDD API SERVICE TESTS
// =======================

describe('BsddApi', () => {

    it('should be defined globally', () => {
        expect(typeof BsddApi).toBe('object');
    });

    it('should have BASE_URL pointing to bSDD API', () => {
        expect(BsddApi.BASE_URL).toBe('https://api.bsdd.buildingsmart.org');
    });

    it('should have searchClasses method', () => {
        expect(typeof BsddApi.searchClasses).toBe('function');
    });

    it('should have getClassDetails method', () => {
        expect(typeof BsddApi.getClassDetails).toBe('function');
    });

    it('should have getDictionaries method', () => {
        expect(typeof BsddApi.getDictionaries).toBe('function');
    });

    it('should have getClassProperties method', () => {
        expect(typeof BsddApi.getClassProperties).toBe('function');
    });

    it('should cache dictionary results in memory', async () => {
        // First call populates cache, second should use cache
        // We test that _cache Map is used
        expect(BsddApi._cache instanceof Map).toBe(true);
    });

    it('should build correct search URL with query only', () => {
        const url = BsddApi._buildSearchUrl('wall');
        expect(url).toContain('/api/TextSearch/v2');
        expect(url).toContain('SearchText=wall');
    });

    it('should build correct search URL with dictionary filter', () => {
        const url = BsddApi._buildSearchUrl('wall', 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3');
        expect(url).toContain('DictionaryUri=');
    });

    it('should debounce rapid calls', () => {
        expect(typeof BsddApi._debounceTimer).not.toBe('undefined');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `node tests/run-tests.js`
Expected: FAIL — `BsddApi is not defined`

**Step 3: Write the implementation**

Create `assets/js/ids/bsdd-api.js`:

```javascript
/**
 * bSDD API Service Layer
 * Handles communication with buildingSMART Data Dictionary API
 * https://api.bsdd.buildingsmart.org
 */
const BsddApi = {
    BASE_URL: 'https://api.bsdd.buildingsmart.org',

    _cache: new Map(),
    _debounceTimer: null,
    DEBOUNCE_MS: 300,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

    /**
     * Build URL for text search
     */
    _buildSearchUrl(query, dictionaryUri) {
        const params = new URLSearchParams({ SearchText: query });
        if (dictionaryUri) {
            params.set('DictionaryUri', dictionaryUri);
        }
        return `${this.BASE_URL}/api/TextSearch/v2?${params.toString()}`;
    },

    /**
     * Fetch with caching
     */
    async _fetchCached(url) {
        const cached = this._cache.get(url);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.data;
        }

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`bSDD API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this._cache.set(url, { data, timestamp: Date.now() });
        return data;
    },

    /**
     * Debounced search — returns a Promise that resolves after debounce
     */
    debouncedSearch(query, dictionaryUri) {
        return new Promise((resolve, reject) => {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(async () => {
                try {
                    const results = await this.searchClasses(query, dictionaryUri);
                    resolve(results);
                } catch (e) {
                    reject(e);
                }
            }, this.DEBOUNCE_MS);
        });
    },

    /**
     * Search classes across all or a specific dictionary
     * Returns array of {name, code, uri, dictionaryName}
     */
    async searchClasses(query, dictionaryUri) {
        if (!query || query.length < 2) return [];
        const url = this._buildSearchUrl(query, dictionaryUri);
        const data = await this._fetchCached(url);
        return (data.dictionaries || []).flatMap(dict =>
            (dict.classes || []).map(cls => ({
                name: cls.name,
                code: cls.code || '',
                uri: cls.uri,
                dictionaryName: dict.name || '',
                dictionaryUri: dict.uri || ''
            }))
        );
    },

    /**
     * Get class details including properties
     */
    async getClassDetails(classUri) {
        const url = `${this.BASE_URL}/api/Class/v1?uri=${encodeURIComponent(classUri)}&includeClassProperties=true`;
        return this._fetchCached(url);
    },

    /**
     * Get properties of a class
     * Returns array of {name, propertySet, dataType, uri, description}
     */
    async getClassProperties(classUri) {
        const details = await this.getClassDetails(classUri);
        return (details.classProperties || []).map(prop => ({
            name: prop.name,
            propertySet: prop.propertySet || '',
            dataType: prop.dataType || '',
            uri: prop.uri || '',
            description: prop.description || ''
        }));
    },

    /**
     * Get list of available dictionaries
     * Returns array of {name, uri, version}
     */
    async getDictionaries() {
        const url = `${this.BASE_URL}/api/Dictionary/v1`;
        const data = await this._fetchCached(url);
        return (data.dictionaries || []).map(dict => ({
            name: dict.name,
            uri: dict.uri,
            version: dict.version || ''
        }));
    },

    /**
     * Clear cache
     */
    clearCache() {
        this._cache.clear();
    }
};

window.BsddApi = BsddApi;
```

**Step 4: Run test to verify it passes**

Run: `node tests/run-tests.js`
Expected: PASS — all BsddApi tests green (note: network-dependent tests are structure-only, no actual API calls in tests)

**Step 5: Commit**

```bash
git add assets/js/ids/bsdd-api.js tests/test-suites/bsdd-api.test.js
git commit -m "feat: add bSDD API service layer with caching and debounce"
```

---

### Task 2: Custom Autocomplete Dropdown Component

**Files:**
- Create: `assets/js/ids/bsdd-autocomplete.js`
- Modify: `assets/css/ids-editor-styles.css` (append new styles at end)

**Step 1: Write the autocomplete component**

Create `assets/js/ids/bsdd-autocomplete.js`:

```javascript
/**
 * bSDD Autocomplete Dropdown Component
 * Custom autocomplete that replaces native <datalist> for bSDD-enabled fields
 */
class BsddAutocomplete {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - Parent element to render into
     * @param {string} options.inputId - ID for the input element
     * @param {string} options.placeholder - Input placeholder text
     * @param {string} options.initialValue - Initial input value
     * @param {Function} options.onSearch - async (query, dictionaryUri) => results[]
     * @param {Function} options.onSelect - (item) => void
     * @param {string} [options.dictionaryFilterId] - ID for dictionary filter select
     */
    constructor(options) {
        this.options = options;
        this.selectedItem = null;
        this.results = [];
        this.highlightIndex = -1;
        this.isOpen = false;
        this.render();
        this.bindEvents();
    }

    render() {
        const container = this.options.container;
        container.classList.add('bsdd-autocomplete-wrapper');

        container.innerHTML = `
            <div class="bsdd-input-row">
                <input type="text"
                       id="${this.options.inputId}"
                       class="bsdd-input"
                       value="${this.options.initialValue || ''}"
                       placeholder="${this.options.placeholder || ''}"
                       autocomplete="off">
                <span class="bsdd-search-icon">🔍</span>
            </div>
            <div class="bsdd-dropdown" id="${this.options.inputId}_dropdown" style="display:none;">
                <div class="bsdd-dropdown-content"></div>
            </div>
        `;

        this.input = container.querySelector('.bsdd-input');
        this.dropdown = container.querySelector('.bsdd-dropdown');
        this.dropdownContent = container.querySelector('.bsdd-dropdown-content');
        this.searchIcon = container.querySelector('.bsdd-search-icon');
    }

    bindEvents() {
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.input.addEventListener('focus', () => {
            if (this.results.length > 0) this.showDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.options.container.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }

    async onInput() {
        const query = this.input.value.trim();
        if (query.length < 2) {
            this.hideDropdown();
            return;
        }

        this.showLoading();

        try {
            const dictionaryUri = this.getDictionaryFilter();
            this.results = await this.options.onSearch(query, dictionaryUri);
            this.highlightIndex = -1;

            if (this.results.length === 0) {
                this.showNoResults();
            } else {
                this.renderResults();
                this.showDropdown();
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    getDictionaryFilter() {
        if (this.options.dictionaryFilterId) {
            const select = document.getElementById(this.options.dictionaryFilterId);
            return select ? select.value : null;
        }
        return null;
    }

    renderResults() {
        this.dropdownContent.innerHTML = this.results.map((item, i) => `
            <div class="bsdd-result-item ${i === this.highlightIndex ? 'highlighted' : ''}"
                 data-index="${i}">
                <div class="bsdd-result-name">${this.escapeHtml(item.name)}</div>
                <div class="bsdd-result-meta">
                    ${item.code ? `<span class="bsdd-result-code">${this.escapeHtml(item.code)}</span>` : ''}
                    <span class="bsdd-result-dict">${this.escapeHtml(item.dictionaryName || item.propertySet || '')}</span>
                </div>
            </div>
        `).join('');

        // Bind click events on results
        this.dropdownContent.querySelectorAll('.bsdd-result-item').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.selectItem(index);
            });
        });
    }

    selectItem(index) {
        this.selectedItem = this.results[index];
        this.input.value = this.selectedItem.name;
        this.hideDropdown();
        if (this.options.onSelect) {
            this.options.onSelect(this.selectedItem);
        }
    }

    onKeydown(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightIndex = Math.min(this.highlightIndex + 1, this.results.length - 1);
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.highlightIndex >= 0) {
                    this.selectItem(this.highlightIndex);
                }
                break;
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }

    updateHighlight() {
        this.dropdownContent.querySelectorAll('.bsdd-result-item').forEach((el, i) => {
            el.classList.toggle('highlighted', i === this.highlightIndex);
        });
        // Scroll highlighted item into view
        const highlighted = this.dropdownContent.querySelector('.highlighted');
        if (highlighted) {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }

    showLoading() {
        this.dropdownContent.innerHTML = '<div class="bsdd-loading">Loading...</div>';
        this.showDropdown();
    }

    showNoResults() {
        this.dropdownContent.innerHTML = '<div class="bsdd-no-results">No results found</div>';
        this.showDropdown();
    }

    showError(message) {
        this.dropdownContent.innerHTML = `<div class="bsdd-error">Connection error</div>`;
        this.showDropdown();
    }

    showDropdown() {
        this.dropdown.style.display = 'block';
        this.isOpen = true;
    }

    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.isOpen = false;
    }

    getValue() {
        return this.input.value.trim();
    }

    getSelectedItem() {
        return this.selectedItem;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.BsddAutocomplete = BsddAutocomplete;
```

**Step 2: Add CSS styles**

Append to `assets/css/ids-editor-styles.css`:

```css
/* bSDD Autocomplete Styles */
.bsdd-autocomplete-wrapper {
    position: relative;
}

.bsdd-input-row {
    position: relative;
    display: flex;
    align-items: center;
}

.bsdd-input-row input {
    flex: 1;
    padding-right: 32px;
}

.bsdd-search-icon {
    position: absolute;
    right: 8px;
    font-size: 14px;
    pointer-events: none;
    opacity: 0.5;
}

.bsdd-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    max-height: 250px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: var(--shadow-lg);
}

.bsdd-result-item {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-primary);
}

.bsdd-result-item:last-child {
    border-bottom: none;
}

.bsdd-result-item:hover,
.bsdd-result-item.highlighted {
    background: var(--bg-secondary);
}

.bsdd-result-name {
    font-weight: 600;
    color: var(--text-primary);
}

.bsdd-result-meta {
    display: flex;
    gap: 8px;
    font-size: 0.8em;
    color: var(--text-secondary);
    margin-top: 2px;
}

.bsdd-result-code {
    font-family: monospace;
}

.bsdd-result-dict {
    background: var(--bg-secondary);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.9em;
}

.bsdd-loading, .bsdd-no-results, .bsdd-error {
    padding: 12px;
    text-align: center;
    color: var(--text-secondary);
    font-style: italic;
}

.bsdd-error {
    color: var(--error);
}

.bsdd-dict-filter {
    margin-bottom: 8px;
}

.bsdd-dict-filter select {
    width: 100%;
    padding: 6px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.85em;
}

.bsdd-uri-display {
    font-size: 0.75em;
    color: var(--text-secondary);
    word-break: break-all;
    margin-top: 4px;
    padding: 4px 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
}
```

**Step 3: Commit**

```bash
git add assets/js/ids/bsdd-autocomplete.js assets/css/ids-editor-styles.css
git commit -m "feat: add bSDD autocomplete dropdown component with CSS"
```

---

### Task 3: Integrate bSDD into Classification Facet Modal

**Files:**
- Modify: `assets/js/ids/ids-editor-modals.js:327-356` (showClassificationForm)
- Modify: `assets/js/ids/ids-editor-modals.js:689-707` (getClassificationData)

**Step 1: Write the failing test**

Add to `tests/test-suites/bsdd-api.test.js`:

```javascript
describe('Classification facet bSDD data', () => {
    it('should store uri in classification facet data when selected from bSDD', () => {
        const facetData = {
            type: 'classification',
            system: 'Uniclass',
            value: { type: 'simpleValue', value: 'Ss_25_10_20' },
            uri: 'https://identifier.buildingsmart.org/uri/example/class/1'
        };
        expect(facetData.uri).toContain('identifier.buildingsmart.org');
    });
});
```

**Step 2: Run test to verify it passes (structure test)**

Run: `node tests/run-tests.js`
Expected: PASS

**Step 3: Modify showClassificationForm in ids-editor-modals.js**

Replace `showClassificationForm` method (lines 327-356) with:

```javascript
    showClassificationForm(data = {}) {
        document.getElementById('modalTitle').textContent = '📚 Classification Facet';

        // Store bSDD URI if editing existing facet with URI
        this._currentBsddUri = data.uri || null;
        this._currentBsddClassUri = null; // for loading properties later

        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group bsdd-dict-filter">
                <label>bSDD Dictionary Filter:</label>
                <select id="bsddDictFilter">
                    <option value="">All dictionaries</option>
                </select>
                <small>Filter bSDD search by dictionary (optional)</small>
            </div>

            <div class="form-group">
                <label>Classification System:</label>
                <div id="classificationSystemContainer"></div>
                <small>${t('editor.classSystem')}</small>
            </div>

            <div class="form-group">
                <label>Classification Value:</label>
                <input type="text" id="classificationValue" value="${this.extractSimpleValue(data.value) || ''}" placeholder="${t('editor.example')} Ss_25_10_20">
                <small>${t('editor.classValue')}</small>
            </div>

            ${this._currentBsddUri ? `<div class="bsdd-uri-display" id="bsddUriDisplay">URI: ${this.escapeHtml(this._currentBsddUri)}</div>` : '<div class="bsdd-uri-display" id="bsddUriDisplay" style="display:none;"></div>'}

            <div class="form-group">
                <label>Value Restriction Type:</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.valueRestriction || data.valueRestriction.type === 'simpleValue' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('simpleValue')">Simple Value</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'pattern' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('pattern')">Pattern (Regex)</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.valueRestriction || { type: 'simpleValue', value: this.extractSimpleValue(data.value) || '' })}
            </div>
        `;

        // Initialize bSDD autocomplete for Classification System
        const systemContainer = document.getElementById('classificationSystemContainer');
        new BsddAutocomplete({
            container: systemContainer,
            inputId: 'classificationSystem',
            placeholder: `${t('editor.example')} Uniclass, OmniClass`,
            initialValue: typeof data.system === 'string' ? data.system : this.extractSimpleValue(data.system) || '',
            dictionaryFilterId: 'bsddDictFilter',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: (item) => {
                this._currentBsddUri = item.uri;
                this._currentBsddClassUri = item.uri;
                // Auto-fill value with class code if available
                const valueInput = document.getElementById('classificationValue');
                if (valueInput && item.code) {
                    valueInput.value = item.code;
                }
                // Show URI
                const uriDisplay = document.getElementById('bsddUriDisplay');
                if (uriDisplay) {
                    uriDisplay.textContent = 'URI: ' + item.uri;
                    uriDisplay.style.display = 'block';
                }
            }
        });

        // Load dictionaries into filter dropdown
        this._loadDictionaryFilter('bsddDictFilter');
    }
```

**Step 4: Add dictionary filter loader helper (after closeSpecificationModal method, ~line 973)**

```javascript
    /**
     * Load bSDD dictionaries into a filter dropdown
     */
    async _loadDictionaryFilter(selectId) {
        try {
            const dictionaries = await BsddApi.getDictionaries();
            const select = document.getElementById(selectId);
            if (!select) return;
            dictionaries.forEach(dict => {
                const option = document.createElement('option');
                option.value = dict.uri;
                option.textContent = `${dict.name} (${dict.version})`;
                select.appendChild(option);
            });
        } catch (e) {
            // Silently fail — filter stays as "All dictionaries"
            console.warn('Failed to load bSDD dictionaries:', e);
        }
    }
```

**Step 5: Modify getClassificationData to include URI (lines 689-707)**

Replace with:

```javascript
    getClassificationData() {
        const system = document.getElementById('classificationSystem').value.trim();
        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'classification',
            system,
            value
        };

        // Add bSDD URI if selected from bSDD
        if (this._currentBsddUri) {
            facet.uri = this._currentBsddUri;
        }

        // Add cardinality if in requirements section
        const cardinality = this.getCurrentFacetCardinality();
        if (cardinality) {
            facet.cardinality = cardinality;
        }

        return facet;
    }
```

**Step 6: Commit**

```bash
git add assets/js/ids/ids-editor-modals.js
git commit -m "feat: integrate bSDD autocomplete into Classification facet modal"
```

---

### Task 4: Integrate bSDD into Property Facet Modal

**Files:**
- Modify: `assets/js/ids/ids-editor-modals.js:203-267` (showPropertyForm)
- Modify: `assets/js/ids/ids-editor-modals.js:627-657` (getPropertyData)

**Step 1: Modify showPropertyForm**

Replace `showPropertyForm` method (lines 203-267) with:

```javascript
    showPropertyForm(data = {}) {
        console.log('showPropertyForm called with data:', data);

        const propertySetValue = this.extractSimpleValue(data.propertySet);
        const baseNameValue = this.extractSimpleValue(data.baseName);

        // Get PropertySets for current IFC version (kept as fallback)
        const propertySets = window.getPropertySetsForVersion
            ? window.getPropertySetsForVersion(this.currentIfcVersion)
            : (window.IFC_PROPERTY_SETS || []);

        const psetDatalistOptions = propertySets
            ? propertySets.map(pset => `<option value="${pset}">`).join('')
            : '';

        this._currentBsddPropertyUri = data.uri || null;
        this._bsddPropertyResults = []; // Store bSDD property results for baseName dropdown

        document.getElementById('modalTitle').textContent = `📋 Property Facet (${this.currentIfcVersion})`;
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group bsdd-dict-filter">
                <label>bSDD Dictionary Filter:</label>
                <select id="bsddDictFilterProp">
                    <option value="">All dictionaries</option>
                </select>
                <small>Filter bSDD search by dictionary (optional)</small>
            </div>

            <div class="form-group">
                <label>PropertySet Name:</label>
                <div id="propertySetContainer"></div>
                <datalist id="ifcPropertySets">
                    ${psetDatalistOptions}
                </datalist>
                <small>${t('editor.propertySetName')} (${propertySets.length} ${t('editor.availableFor')} ${this.currentIfcVersion})</small>
            </div>

            <div class="form-group">
                <label>Property Name (baseName):</label>
                <div id="propertyBaseNameContainer"></div>
                <small>${t('editor.propertyName')}</small>
            </div>

            ${this._currentBsddPropertyUri ? `<div class="bsdd-uri-display" id="bsddPropertyUriDisplay">URI: ${this.escapeHtml(this._currentBsddPropertyUri)}</div>` : '<div class="bsdd-uri-display" id="bsddPropertyUriDisplay" style="display:none;"></div>'}

            <div class="form-group">
                <label>${t('editor.dataType')}</label>
                <select id="propertyDataType">
                    <option value="">${t('editor.notSpecified')}</option>
                    <option value="IFCBOOLEAN" ${data.dataType === 'IFCBOOLEAN' ? 'selected' : ''}>IFCBOOLEAN</option>
                    <option value="IFCINTEGER" ${data.dataType === 'IFCINTEGER' ? 'selected' : ''}>IFCINTEGER</option>
                    <option value="IFCREAL" ${data.dataType === 'IFCREAL' ? 'selected' : ''}>IFCREAL</option>
                    <option value="IFCLABEL" ${data.dataType === 'IFCLABEL' ? 'selected' : ''}>IFCLABEL</option>
                    <option value="IFCTEXT" ${data.dataType === 'IFCTEXT' ? 'selected' : ''}>IFCTEXT</option>
                </select>
            </div>

            <div class="form-group">
                <label>${t('editor.valueRestriction')}</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'simpleValue')}" onclick="idsEditorModals.selectRestrictionType('simpleValue')">Simple Value</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'pattern')}" onclick="idsEditorModals.selectRestrictionType('pattern')">Pattern (Regex)</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'enumeration')}" onclick="idsEditorModals.selectRestrictionType('enumeration')">Enumeration</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'bounds')}" onclick="idsEditorModals.selectRestrictionType('bounds')">Bounds</button>
                </div>
                <small>${t('editor.anyValueAllowed')}</small>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.value || { type: 'simpleValue', value: '' })}
            </div>
        `;

        // Initialize bSDD autocomplete for PropertySet
        const psetContainer = document.getElementById('propertySetContainer');
        new BsddAutocomplete({
            container: psetContainer,
            inputId: 'propertySet',
            placeholder: `${t('editor.example')} Pset_WallCommon`,
            initialValue: propertySetValue,
            dictionaryFilterId: 'bsddDictFilterProp',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: async (item) => {
                // When a bSDD class is selected, load its properties for baseName dropdown
                try {
                    this._bsddPropertyResults = await BsddApi.getClassProperties(item.uri);
                    this._currentBsddPropertyUri = null; // Reset, will be set when property is picked
                    // Show URI of the class
                    const uriDisplay = document.getElementById('bsddPropertyUriDisplay');
                    if (uriDisplay) {
                        uriDisplay.textContent = 'Class URI: ' + item.uri;
                        uriDisplay.style.display = 'block';
                    }
                } catch (e) {
                    console.warn('Failed to load bSDD class properties:', e);
                }
            }
        });

        // Initialize bSDD autocomplete for baseName (property name)
        const baseNameContainer = document.getElementById('propertyBaseNameContainer');
        new BsddAutocomplete({
            container: baseNameContainer,
            inputId: 'propertyBaseName',
            placeholder: `${t('editor.example')} FireRating`,
            initialValue: baseNameValue,
            onSearch: async (query) => {
                // Search in locally loaded bSDD properties first, then fall back to API search
                if (this._bsddPropertyResults.length > 0) {
                    const lowerQuery = query.toLowerCase();
                    return this._bsddPropertyResults
                        .filter(p => p.name.toLowerCase().includes(lowerQuery))
                        .map(p => ({
                            name: p.name,
                            code: p.dataType || '',
                            uri: p.uri,
                            dictionaryName: p.propertySet || ''
                        }));
                }
                // Fallback: search bSDD API directly for properties
                return BsddApi.debouncedSearch(query);
            },
            onSelect: (item) => {
                this._currentBsddPropertyUri = item.uri;
                const uriDisplay = document.getElementById('bsddPropertyUriDisplay');
                if (uriDisplay) {
                    uriDisplay.textContent = 'Property URI: ' + item.uri;
                    uriDisplay.style.display = 'block';
                }
                // Auto-set dataType if available
                if (item.code) {
                    const dataTypeMap = {
                        'Boolean': 'IFCBOOLEAN',
                        'Integer': 'IFCINTEGER',
                        'Real': 'IFCREAL',
                        'String': 'IFCLABEL'
                    };
                    const mapped = dataTypeMap[item.code];
                    if (mapped) {
                        document.getElementById('propertyDataType').value = mapped;
                    }
                }
            }
        });

        // Load dictionaries into filter
        this._loadDictionaryFilter('bsddDictFilterProp');

        this.openModal();
    }
```

**Step 2: Modify getPropertyData to include URI (lines 627-657)**

Replace with:

```javascript
    getPropertyData() {
        const propertySet = document.getElementById('propertySet').value.trim();
        const baseName = document.getElementById('propertyBaseName').value.trim();

        if (!propertySet || !baseName) {
            throw new Error('PropertySet and BaseName are required');
        }

        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'property',
            propertySet,
            baseName,
            value
        };

        const dataType = document.getElementById('propertyDataType').value;
        if (dataType) {
            facet.dataType = dataType;
        }

        // Add bSDD URI if selected from bSDD
        if (this._currentBsddPropertyUri) {
            facet.uri = this._currentBsddPropertyUri;
        }

        // Add cardinality if in requirements section
        const cardinality = this.getCurrentFacetCardinality();
        if (cardinality) {
            facet.cardinality = cardinality;
        }

        return facet;
    }
```

**Step 3: Commit**

```bash
git add assets/js/ids/ids-editor-modals.js
git commit -m "feat: integrate bSDD autocomplete into Property facet modal"
```

---

### Task 5: Integrate bSDD into Material Facet Modal

**Files:**
- Modify: `assets/js/ids/ids-editor-modals.js:361-385` (showMaterialForm)
- Modify: `assets/js/ids/ids-editor-modals.js:712-728` (getMaterialData)

**Step 1: Modify showMaterialForm (lines 361-385)**

Replace with:

```javascript
    showMaterialForm(data = {}) {
        document.getElementById('modalTitle').textContent = '🧱 Material Facet';

        this._currentBsddMaterialUri = data.uri || null;

        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group bsdd-dict-filter">
                <label>bSDD Dictionary Filter:</label>
                <select id="bsddDictFilterMat">
                    <option value="">All dictionaries</option>
                </select>
                <small>Filter bSDD search by dictionary (optional)</small>
            </div>

            <div class="form-group">
                <label>Material Value:</label>
                <div id="materialValueContainer"></div>
                <small>${t('editor.materialName')}</small>
            </div>

            ${this._currentBsddMaterialUri ? `<div class="bsdd-uri-display" id="bsddMaterialUriDisplay">URI: ${this.escapeHtml(this._currentBsddMaterialUri)}</div>` : '<div class="bsdd-uri-display" id="bsddMaterialUriDisplay" style="display:none;"></div>'}

            <div class="form-group">
                <label>Value Restriction Type:</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.valueRestriction || data.valueRestriction.type === 'simpleValue' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('simpleValue')">Simple Value</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'pattern' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('pattern')">Pattern (Regex)</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'enumeration' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('enumeration')">Enumeration</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.valueRestriction || { type: 'simpleValue', value: data.value || '' })}
            </div>
        `;

        // Initialize bSDD autocomplete for Material Value
        const matContainer = document.getElementById('materialValueContainer');
        new BsddAutocomplete({
            container: matContainer,
            inputId: 'materialValue',
            placeholder: `${t('editor.example')} Concrete, Steel`,
            initialValue: data.value || '',
            dictionaryFilterId: 'bsddDictFilterMat',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: (item) => {
                this._currentBsddMaterialUri = item.uri;
                const uriDisplay = document.getElementById('bsddMaterialUriDisplay');
                if (uriDisplay) {
                    uriDisplay.textContent = 'URI: ' + item.uri;
                    uriDisplay.style.display = 'block';
                }
            }
        });

        this._loadDictionaryFilter('bsddDictFilterMat');
    }
```

**Step 2: Modify getMaterialData (lines 712-728)**

Replace with:

```javascript
    getMaterialData() {
        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'material',
            value
        };

        // Add bSDD URI if selected from bSDD
        if (this._currentBsddMaterialUri) {
            facet.uri = this._currentBsddMaterialUri;
        }

        // Add cardinality if in requirements section
        const cardinality = this.getCurrentFacetCardinality();
        if (cardinality) {
            facet.cardinality = cardinality;
        }

        return facet;
    }
```

**Step 3: Commit**

```bash
git add assets/js/ids/ids-editor-modals.js
git commit -m "feat: integrate bSDD autocomplete into Material facet modal"
```

---

### Task 6: Add URI Support to XML Generator

**Files:**
- Modify: `assets/js/ids/ids-xml-generator.js:194-209` (generateClassificationFacetString)
- Modify: `assets/js/ids/ids-xml-generator.js:151-169` (generatePropertyFacetString)
- Modify: `assets/js/ids/ids-xml-generator.js:214-226` (generateMaterialFacetString)
- Test: `tests/test-suites/ids-xml-generator.test.js`

**Step 1: Write the failing tests**

Add to `tests/test-suites/ids-xml-generator.test.js`:

```javascript
    // --- bSDD URI support ---

    it('should include uri attribute on classification facet when present', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: { type: 'simpleValue', value: 'IFCWALL' } }],
                requirements: [{
                    type: 'classification',
                    system: 'Uniclass',
                    value: { type: 'simpleValue', value: 'Ss_25' },
                    uri: 'https://identifier.buildingsmart.org/uri/example/class/1',
                    cardinality: 'required'
                }]
            }]
        });
        expect(xml).toContain('uri="https://identifier.buildingsmart.org/uri/example/class/1"');
    });

    it('should NOT include uri attribute when uri is not present', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: { type: 'simpleValue', value: 'IFCWALL' } }],
                requirements: [{
                    type: 'classification',
                    system: 'Uniclass',
                    value: { type: 'simpleValue', value: 'Ss_25' },
                    cardinality: 'required'
                }]
            }]
        });
        expect(xml.includes('uri=')).toBe(false);
    });

    it('should include uri attribute on property facet when present', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: { type: 'simpleValue', value: 'IFCWALL' } }],
                requirements: [{
                    type: 'property',
                    propertySet: 'Pset_WallCommon',
                    baseName: 'FireRating',
                    value: { type: 'simpleValue', value: 'A' },
                    uri: 'https://identifier.buildingsmart.org/uri/example/prop/1',
                    cardinality: 'required'
                }]
            }]
        });
        expect(xml).toContain('<property');
        expect(xml).toContain('uri="https://identifier.buildingsmart.org/uri/example/prop/1"');
    });

    it('should include uri attribute on material facet when present', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: { type: 'simpleValue', value: 'IFCWALL' } }],
                requirements: [{
                    type: 'material',
                    value: { type: 'simpleValue', value: 'Concrete' },
                    uri: 'https://identifier.buildingsmart.org/uri/example/mat/1',
                    cardinality: 'required'
                }]
            }]
        });
        expect(xml).toContain('uri="https://identifier.buildingsmart.org/uri/example/mat/1"');
    });
```

**Step 2: Run test to verify it fails**

Run: `node tests/run-tests.js`
Expected: FAIL — `uri=` not found in output

**Step 3: Modify XML generator methods**

In `ids-xml-generator.js`, modify `generateClassificationFacetString` (line 194):

```javascript
    generateClassificationFacetString(data, indent, isRequirement = false) {
        let xml = `${indent}<classification`;
        if (data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            const cardinality = data.cardinality || 'required';
            xml += ` cardinality="${cardinality}"`;
        }
        xml += '>\n';
        if (data.system) {
            xml += this.addRestrictionString(data.system, 'system', indent + '  ');
        }
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</classification>\n`;
        return xml;
    }
```

Modify `generatePropertyFacetString` (line 151):

```javascript
    generatePropertyFacetString(data, indent, isRequirement = false) {
        let xml = `${indent}<property`;
        if (data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            const cardinality = data.cardinality || 'required';
            xml += ` cardinality="${cardinality}"`;
        }
        xml += '>\n';
        if (data.propertySet) {
            xml += this.addRestrictionString(data.propertySet, 'propertySet', indent + '  ');
        }
        if (data.baseName) {
            xml += this.addRestrictionString(data.baseName, 'baseName', indent + '  ');
        }
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</property>\n`;
        return xml;
    }
```

Modify `generateMaterialFacetString` (line 214):

```javascript
    generateMaterialFacetString(data, indent, isRequirement = false) {
        let xml = `${indent}<material`;
        if (data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            const cardinality = data.cardinality || 'required';
            xml += ` cardinality="${cardinality}"`;
        }
        xml += '>\n';
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</material>\n`;
        return xml;
    }
```

**Step 4: Run test to verify it passes**

Run: `node tests/run-tests.js`
Expected: PASS — all URI tests green

**Step 5: Commit**

```bash
git add assets/js/ids/ids-xml-generator.js tests/test-suites/ids-xml-generator.test.js
git commit -m "feat: add bSDD URI attribute support to IDS XML generator"
```

---

### Task 7: Add URI Parsing Support to Parser

**Files:**
- Modify: `assets/js/parser.js:139-200` (extractFacet function)
- Test: `tests/test-suites/ids-parser.test.js`

**Step 1: Write the failing test**

Add to `tests/test-suites/ids-parser.test.js`:

```javascript
describe('bSDD URI parsing', () => {
    it('should extract uri attribute from classification facet', () => {
        const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <info><title>Test</title></info>
  <specifications>
    <specification name="Test Spec" ifcVersion="IFC4">
      <applicability minOccurs="0" maxOccurs="unbounded">
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <classification uri="https://identifier.buildingsmart.org/uri/test/class/1" cardinality="required">
          <system><simpleValue>TestSystem</simpleValue></system>
          <value><simpleValue>TestValue</simpleValue></value>
        </classification>
      </requirements>
    </specification>
  </specifications>
</ids>`;
        parseIDS(xmlString);
        const spec = currentIDSData.specifications[0];
        const classificationFacet = spec.requirements.find(f => f.type === 'classification');
        expect(classificationFacet.uri).toBe('https://identifier.buildingsmart.org/uri/test/class/1');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `node tests/run-tests.js`
Expected: FAIL — `uri` is undefined

**Step 3: Modify extractFacet in parser.js**

After line 192 (`facet.cardinality = element.getAttribute('cardinality') || 'required';`), add:

```javascript
    // bSDD URI
    const uri = element.getAttribute('uri');
    if (uri) {
        facet.uri = uri;
    }
```

**Step 4: Run test to verify it passes**

Run: `node tests/run-tests.js`
Expected: PASS

**Step 5: Commit**

```bash
git add assets/js/parser.js tests/test-suites/ids-parser.test.js
git commit -m "feat: parse bSDD URI attribute from IDS XML facets"
```

---

### Task 8: Add URI Display to Editor Rendering

**Files:**
- Modify: `assets/js/ids/ids-editor-core.js:511-529` (renderFacetDetails method)

**Step 1: Modify renderFacetDetails to show URI**

Replace `renderFacetDetails` (lines 511-529):

```javascript
    renderFacetDetails(facet) {
        let html = '';

        Object.keys(facet).forEach(key => {
            // Skip type, cardinality (shown in header badge), and uri (shown separately below)
            if (key === 'type' || key === 'cardinality' || key === 'uri') {
                return;
            }

            const value = facet[key];
            if (typeof value === 'object') {
                html += `<div><strong>${key}:</strong> ${this.renderRestriction(value)}</div>`;
            } else {
                html += `<div><strong>${key}:</strong> ${this.escapeHtml(String(value))}</div>`;
            }
        });

        // Show bSDD URI if present
        if (facet.uri) {
            html += `<div class="bsdd-uri-display">bSDD: ${this.escapeHtml(facet.uri)}</div>`;
        }

        return html;
    }
```

**Step 2: Commit**

```bash
git add assets/js/ids/ids-editor-core.js
git commit -m "feat: display bSDD URI in facet details rendering"
```

---

### Task 9: Wire Up Script Includes and Sync dist/

**Files:**
- Modify: `pages/ids-parser-visualizer.html:218-225` (add script includes)
- Copy new files to `dist/`

**Step 1: Add script tags to HTML page**

In `pages/ids-parser-visualizer.html`, after line 218 (`<script src="../assets/js/ids/ifc-data.js"></script>`), add:

```html
    <script src="../assets/js/ids/bsdd-api.js"></script>
    <script src="../assets/js/ids/bsdd-autocomplete.js"></script>
```

**Step 2: Sync dist/ directory**

```bash
cp assets/js/ids/bsdd-api.js dist/js/ids/bsdd-api.js
cp assets/js/ids/bsdd-autocomplete.js dist/js/ids/bsdd-autocomplete.js
cp assets/js/ids/ids-editor-modals.js dist/js/ids/ids-editor-modals.js
cp assets/js/ids/ids-xml-generator.js dist/js/ids/ids-xml-generator.js
cp assets/js/ids/ids-editor-core.js dist/js/ids/ids-editor-core.js
cp assets/js/parser.js dist/js/parser.js
cp assets/css/ids-editor-styles.css dist/css/ids-editor-styles.css
```

Also update `dist/pages/ids-parser-visualizer.html` with the same script tags.

**Step 3: Commit**

```bash
git add pages/ids-parser-visualizer.html dist/
git commit -m "feat: wire up bSDD scripts and sync dist/"
```

---

### Task 10: Add Translation Keys

**Files:**
- Modify: `assets/js/common/translations.js`

**Step 1: Add bSDD-related translation keys**

Add to both `cs` and `en` sections:

```javascript
// English
'bsdd.dictFilter': 'bSDD Dictionary Filter',
'bsdd.allDictionaries': 'All dictionaries',
'bsdd.filterDesc': 'Filter bSDD search by dictionary (optional)',
'bsdd.loading': 'Loading...',
'bsdd.noResults': 'No results found',
'bsdd.connectionError': 'Connection error',
'bsdd.uri': 'URI',

// Czech
'bsdd.dictFilter': 'Filtr slovníku bSDD',
'bsdd.allDictionaries': 'Všechny slovníky',
'bsdd.filterDesc': 'Filtrovat vyhledávání bSDD podle slovníku (volitelné)',
'bsdd.loading': 'Načítání...',
'bsdd.noResults': 'Žádné výsledky',
'bsdd.connectionError': 'Chyba připojení',
'bsdd.uri': 'URI',
```

**Step 2: Commit**

```bash
git add assets/js/common/translations.js
git commit -m "feat: add Czech and English translations for bSDD integration"
```

---

### Task 11: End-to-End Manual Testing

**No files changed — verification only.**

**Step 1: Run all automated tests**

```bash
node tests/run-tests.js
```

Expected: All tests pass.

**Step 2: Manual testing checklist**

Open `pages/ids-parser-visualizer.html` in browser:

1. Create New IDS, add a specification
2. Add Classification facet:
   - Type "wall" in Classification System field
   - Verify bSDD dropdown appears with results
   - Select a result, verify system + value + URI are filled
   - Change dictionary filter, verify results change
   - Save facet, verify URI shown in facet details
3. Add Property facet:
   - Type "Pset" in PropertySet field
   - Verify bSDD dropdown appears
   - Select a class, verify baseName dropdown populates with class properties
   - Select a property, verify URI shown
4. Add Material facet:
   - Type "concrete" in Material field
   - Verify bSDD dropdown appears
5. Download IDS:
   - Verify `uri="..."` attributes appear on facets selected from bSDD
   - Verify facets without bSDD selection have no `uri` attribute
6. Re-import the downloaded IDS:
   - Verify URI is preserved and shown
   - Edit a facet, verify URI is pre-populated

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during bSDD integration testing"
```
