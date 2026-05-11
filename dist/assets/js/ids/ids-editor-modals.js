/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * IDS Editor Modals
 * Handles modal windows for adding/editing facets
 */

class IDSEditorModals {
    constructor() {
        this.currentCallback = null;
        this.currentFacetType = null;
        this.currentIfcVersion = 'IFC4'; // Default IFC version
        this.applicabilityFacets = []; // For auto-transfer to requirements
        this._dictionaryCache = null; // Cached dictionary list
        this.initializeModals();
    }

    /**
     * Initialize modal structure
     */
    initializeModals() {
        // Create facet modal overlay if it doesn't exist
        let overlay = document.getElementById('facetModalOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'facetModalOverlay';
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <h2 id="modalTitle">${t('editor.addFacet')}</h2>
                        <button class="modal-close" onclick="idsEditorModals.closeModal()">&times;</button>
                    </div>
                    <div class="modal-body" id="modalBody">
                        <!-- Dynamic content -->
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="idsEditorModals.closeModal()">${t('editor.cancel')}</button>
                        <button class="btn btn-primary" onclick="idsEditorModals.saveFacet()">${t('editor.save')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }

        // Create specification modal overlay
        let specOverlay = document.getElementById('specificationModalOverlay');
        if (!specOverlay) {
            specOverlay = document.createElement('div');
            specOverlay.id = 'specificationModalOverlay';
            specOverlay.className = 'modal-overlay';
            specOverlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <h2 id="specModalTitle">${t('editor.specification')}</h2>
                        <button class="modal-close" onclick="idsEditorModals.closeSpecificationModal()">&times;</button>
                    </div>
                    <div class="modal-body" id="specModalBody">
                        <!-- Dynamic content -->
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="idsEditorModals.closeSpecificationModal()">${t('editor.cancel')}</button>
                        <button class="btn btn-primary" onclick="idsEditorModals.saveSpecification()">${t('editor.save')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(specOverlay);

            // Close on overlay click
            specOverlay.addEventListener('click', (e) => {
                if (e.target === specOverlay) {
                    this.closeSpecificationModal();
                }
            });
        }
    }

    /**
     * Show modal for selecting facet type
     */
    showFacetTypeSelector(callback, ifcVersion = 'IFC4', section = 'applicability') {
        this.currentCallback = callback;
        this.currentIfcVersion = ifcVersion; // Store IFC version for facet modals
        this.currentSection = section; // Store section for cardinality (requirements vs applicability)
        document.getElementById('modalTitle').textContent = t('editor.selectFacetType');
        document.getElementById('modalBody').innerHTML = `
            <div class="facet-type-selector">
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('entity')">
                    <div class="facet-type-icon">🏢</div>
                    <div class="facet-type-name">Entity</div>
                </div>
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('property')">
                    <div class="facet-type-icon">📋</div>
                    <div class="facet-type-name">Property</div>
                </div>
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('attribute')">
                    <div class="facet-type-icon">🏷️</div>
                    <div class="facet-type-name">Attribute</div>
                </div>
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('classification')">
                    <div class="facet-type-icon">📚</div>
                    <div class="facet-type-name">Classification</div>
                </div>
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('material')">
                    <div class="facet-type-icon">🧱</div>
                    <div class="facet-type-name">Material</div>
                </div>
                <div class="facet-type-card" onclick="idsEditorModals.selectFacetType('partOf')">
                    <div class="facet-type-icon">🔗</div>
                    <div class="facet-type-name">PartOf</div>

                </div>
            </div>
        `;
        this.openModal();
    }

    /**
     * Extract simple value from various formats
     */
    extractSimpleValue(value) {
        if (!value) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (value.type === 'simple' || value.type === 'simpleValue') {
            return value.value || '';
        }
        if (value.value) {
            return value.value;
        }
        return '';
    }

    /**
     * Select facet type and show appropriate form.
     * When adding to requirements, auto-transfers matching applicability data.
     */
    selectFacetType(type) {
        this.currentFacetType = type;

        // Auto-transfer: find matching facet from applicability when in requirements
        let prefill = {};
        if (this.currentSection === 'requirements' && this.applicabilityFacets.length > 0) {
            const match = this.applicabilityFacets.find(f => f.type === type);
            if (match) {
                prefill = JSON.parse(JSON.stringify(match)); // deep clone
            }
        }

        switch (type) {
            case 'entity':
                this.showEntityForm(prefill);
                break;
            case 'property':
                this.showPropertyForm(prefill);
                break;
            case 'attribute':
                this.showAttributeForm(prefill);
                break;
            case 'classification':
                this.showClassificationForm(prefill);
                break;
            case 'material':
                this.showMaterialForm(prefill);
                break;
            case 'partOf':
                this.showPartOfForm(prefill);
                break;
        }
    }

    /**
     * Show Entity form
     */
    showEntityForm(data = {}) {
        document.getElementById('modalTitle').textContent = t('editor.entityFacet');

        // Extract name value - data.name can be string or object {type: 'simpleValue', value: '...'}
        const nameValue = this.extractSimpleValue(data.name);
        const predefinedTypeValue = this.extractSimpleValue(data.predefinedType);

        // Generate datalist options from IFC_ENTITY_TYPES
        const datalistOptions = window.IFC_ENTITY_TYPES
            ? window.IFC_ENTITY_TYPES.map(type => `<option value="${type}">`).join('')
            : '';

        document.getElementById('modalBody').innerHTML = `
            <div class="form-group">
                <label>${t('editor.entityNameLabel')}</label>
                <input type="text" id="entityName" list="ifcEntityTypes" value="${nameValue}" placeholder="${t('editor.example')} IFCWALL" autocomplete="off">
                <datalist id="ifcEntityTypes">
                    ${datalistOptions}
                </datalist>
                <small>${t('editor.entityTypeDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.predefinedType')}</label>
                <input type="text" id="entityPredefinedType" value="${predefinedTypeValue}" placeholder="${t('editor.example')} SOLIDWALL">
                <small>${t('editor.predefinedTypeDesc')}</small>
            </div>
        `;
    }

    /**
     * Show Property form
     */
    showPropertyForm(data = {}) {
        console.log('showPropertyForm called with data:', data);

        // Extrahuj hodnoty z objektů pokud jsou
        const propertySetValue = this.extractSimpleValue(data.propertySet);
        const baseNameValue = this.extractSimpleValue(data.baseName);

        // Store bSDD URI for editing
        this._currentBsddPropertyUri = data.uri || null;
        this._bsddPropertyResults = [];

        // Get PropertySets for current IFC version (used as fallback)
        const propertySets = window.getPropertySetsForVersion
            ? window.getPropertySetsForVersion(this.currentIfcVersion)
            : (window.IFC_PROPERTY_SETS || []);

        // Generate datalist options from IFC_PROPERTY_SETS
        const psetDatalistOptions = propertySets
            ? propertySets.map(pset => `<option value="${pset}">`).join('')
            : '';

        document.getElementById('modalTitle').textContent = `${t('editor.propertyFacet')} (${this.currentIfcVersion})`;
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>${t('bsdd.dictFilter')}:</label>
                <div id="bsddDictFilterPropContainer"></div>
                <input type="hidden" id="bsddDictFilterProp" value="">
                <small>${t('bsdd.filterDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.propertySetNameLabel')}</label>
                <div id="propertySetContainer"></div>
                <datalist id="ifcPropertySets">
                    ${psetDatalistOptions}
                </datalist>
                <small>${t('editor.propertySetName')} (${propertySets.length} ${t('editor.availableFor')} ${this.currentIfcVersion})</small>
            </div>

            <div class="form-group">
                <label>${t('editor.propertyNameLabel')}</label>
                <div id="propertyBaseNameContainer"></div>
                <small>${t('editor.propertyName')}</small>
            </div>

            <div class="bsdd-uri-display" id="bsddPropertyUriDisplay" style="${this._currentBsddPropertyUri ? '' : 'display:none;'}">
                ${t('bsdd.uri')}: <span>${this.escapeHtml(this._currentBsddPropertyUri || '')}</span>
            </div>

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
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'simpleValue')}" data-type="simpleValue" onclick="idsEditorModals.selectRestrictionType('simpleValue')">${t('editor.simpleValue')}</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'pattern')}" data-type="pattern" onclick="idsEditorModals.selectRestrictionType('pattern')">${t('editor.patternRegex')}</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'enumeration')}" data-type="enumeration" onclick="idsEditorModals.selectRestrictionType('enumeration')">${t('editor.enumeration')}</button>
                    <button class="restriction-type-btn ${this.getActiveRestrictionType(data.value, 'bounds')}" data-type="bounds" onclick="idsEditorModals.selectRestrictionType('bounds')">${t('editor.bounds')}</button>
                </div>
                <small>${t('editor.anyValueAllowed')}</small>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.value || { type: 'simpleValue', value: '' })}
            </div>
        `;

        // Initialize bSDD autocomplete for PropertySet
        new BsddAutocomplete({
            container: document.getElementById('propertySetContainer'),
            inputId: 'propertySet',
            placeholder: `${t('editor.example')} Pset_WallCommon`,
            initialValue: propertySetValue,
            dictionaryFilterId: 'bsddDictFilterProp',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: (item) => {
                // When a bSDD class is selected as PropertySet, load its properties
                if (item.uri) {
                    BsddApi.getClassProperties(item.uri).then(props => {
                        this._bsddPropertyResults = props;
                    }).catch(e => console.warn('Failed to load class properties:', e));
                }
            }
        });

        // Initialize bSDD autocomplete for baseName
        new BsddAutocomplete({
            container: document.getElementById('propertyBaseNameContainer'),
            inputId: 'propertyBaseName',
            placeholder: `${t('editor.example')} FireRating`,
            initialValue: baseNameValue,
            dictionaryFilterId: 'bsddDictFilterProp',
            onSearch: (query, dictUri) => {
                // Search locally in cached bSDD property results first
                if (this._bsddPropertyResults && this._bsddPropertyResults.length > 0) {
                    const lowerQuery = query.toLowerCase();
                    const localResults = this._bsddPropertyResults
                        .filter(p => p.name.toLowerCase().includes(lowerQuery))
                        .map(p => ({
                            name: p.name,
                            code: p.propertySet || '',
                            uri: p.uri,
                            dictionaryName: p.propertySet || ''
                        }));
                    if (localResults.length > 0) {
                        return Promise.resolve(localResults);
                    }
                }
                // Fall back to API search
                return BsddApi.debouncedSearch(query, dictUri);
            },
            onSelect: (item) => {
                this._currentBsddPropertyUri = item.uri || null;
                // Auto-set dataType if mappable
                if (item.dataType) {
                    const dataTypeMap = {
                        'Boolean': 'IFCBOOLEAN',
                        'Integer': 'IFCINTEGER',
                        'Real': 'IFCREAL',
                        'String': 'IFCLABEL',
                        'Text': 'IFCTEXT'
                    };
                    const mapped = dataTypeMap[item.dataType];
                    if (mapped) {
                        const dtSelect = document.getElementById('propertyDataType');
                        if (dtSelect) dtSelect.value = mapped;
                    }
                }
                // Show URI display
                const uriDisplay = document.getElementById('bsddPropertyUriDisplay');
                if (uriDisplay && item.uri) {
                    uriDisplay.style.display = '';
                    uriDisplay.querySelector('span').textContent = item.uri;
                }
            }
        });

        // Initialize dictionary filter autocomplete
        this._initDictionaryFilter('bsddDictFilterPropContainer', 'bsddDictFilterProp');

        this.openModal();
    }

    /**
     * Get active class for restriction type button
     */
    getActiveRestrictionType(value, checkType) {
        if (!value) {
            return checkType === 'simpleValue' ? 'active' : '';
        }

        // Normalize type from parser format
        let type = value.type || 'simpleValue';
        if (type === 'simple') {
            type = 'simpleValue';
        }
        if (type === 'restriction' && value.pattern) {
            type = 'pattern';
        }
        if (type === 'restriction' && value.enumeration) {
            type = 'enumeration';
        }
        if (type === 'restriction' && (value.minInclusive || value.maxInclusive)) {
            type = 'bounds';
        }

        return type === checkType ? 'active' : '';
    }

    /**
     * Show Attribute form
     */
    showAttributeForm(data = {}) {
        document.getElementById('modalTitle').textContent = t('editor.attributeFacet');
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>${t('editor.attributeNameLabel')}</label>
                <input type="text" id="attributeName" value="${data.name || ''}" placeholder="${t('editor.example')} Name, GlobalId, Description">
                <small>${t('editor.attributeName')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.valueRestriction')}</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.value || data.value.type === 'simpleValue' ? 'active' : ''}" data-type="simpleValue" onclick="idsEditorModals.selectRestrictionType('simpleValue')">${t('editor.simpleValue')}</button>
                    <button class="restriction-type-btn ${data.value?.type === 'pattern' ? 'active' : ''}" data-type="pattern" onclick="idsEditorModals.selectRestrictionType('pattern')">${t('editor.patternRegex')}</button>
                    <button class="restriction-type-btn ${data.value?.type === 'enumeration' ? 'active' : ''}" data-type="enumeration" onclick="idsEditorModals.selectRestrictionType('enumeration')">${t('editor.enumeration')}</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.value || { type: 'simpleValue', value: '' })}
            </div>
        `;
    }

    /**
     * Show Classification form
     */
    showClassificationForm(data = {}) {
        // Store bSDD URI for editing
        this._currentBsddUri = data.uri || null;

        const systemValue = this.extractSimpleValue(data.system);
        const valueValue = this.extractSimpleValue(data.value);

        document.getElementById('modalTitle').textContent = t('editor.classificationFacet');
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>${t('bsdd.dictFilter')}:</label>
                <div id="bsddDictFilterContainer"></div>
                <input type="hidden" id="bsddDictFilter" value="">
                <small>${t('bsdd.filterDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.classSystemLabel')}</label>
                <div id="classificationSystemContainer"></div>
                <small>${t('editor.classSystem')}</small>
            </div>

            <div class="bsdd-uri-display" id="bsddUriDisplay" style="${this._currentBsddUri ? '' : 'display:none;'}">
                ${t('bsdd.uri')}: <span>${this.escapeHtml(this._currentBsddUri || '')}</span>
            </div>

            <div class="form-group">
                <label>${t('editor.classValueLabel')}</label>
                <input type="text" id="classificationValue" value="${this.escapeHtml(valueValue)}" placeholder="${t('editor.example')} Ss_25_10_20">
                <small>${t('editor.classValue')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.valueRestrictionType')}</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.valueRestriction || data.valueRestriction.type === 'simpleValue' ? 'active' : ''}" data-type="simpleValue" onclick="idsEditorModals.selectRestrictionType('simpleValue')">${t('editor.simpleValue')}</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'pattern' ? 'active' : ''}" data-type="pattern" onclick="idsEditorModals.selectRestrictionType('pattern')">${t('editor.patternRegex')}</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.valueRestriction || { type: 'simpleValue', value: valueValue })}
            </div>
        `;

        // Initialize bSDD autocomplete for Classification System
        new BsddAutocomplete({
            container: document.getElementById('classificationSystemContainer'),
            inputId: 'classificationSystem',
            placeholder: `${t('editor.example')} Uniclass, OmniClass`,
            initialValue: systemValue,
            dictionaryFilterId: 'bsddDictFilter',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: (item) => {
                this._currentBsddUri = item.uri || null;
                // Auto-fill classification value with item code
                if (item.code) {
                    const valueInput = document.getElementById('classificationValue');
                    if (valueInput) valueInput.value = item.code;
                }
                // Show URI display
                const uriDisplay = document.getElementById('bsddUriDisplay');
                if (uriDisplay && item.uri) {
                    uriDisplay.style.display = '';
                    uriDisplay.querySelector('span').textContent = item.uri;
                }
            }
        });

        // Initialize dictionary filter autocomplete
        this._initDictionaryFilter('bsddDictFilterContainer', 'bsddDictFilter');
    }

    /**
     * Show Material form
     */
    showMaterialForm(data = {}) {
        // Store bSDD URI for editing
        this._currentBsddMaterialUri = data.uri || null;

        const valueValue = this.extractSimpleValue(data.value);

        document.getElementById('modalTitle').textContent = t('editor.materialFacet');
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>${t('bsdd.dictFilter')}:</label>
                <div id="bsddDictFilterMatContainer"></div>
                <input type="hidden" id="bsddDictFilterMat" value="">
                <small>${t('bsdd.filterDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.materialValueLabel')}</label>
                <div id="materialValueContainer"></div>
                <small>${t('editor.materialName')}</small>
            </div>

            <div class="bsdd-uri-display" id="bsddMaterialUriDisplay" style="${this._currentBsddMaterialUri ? '' : 'display:none;'}">
                ${t('bsdd.uri')}: <span>${this.escapeHtml(this._currentBsddMaterialUri || '')}</span>
            </div>

            <div class="form-group">
                <label>${t('editor.valueRestrictionType')}</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.valueRestriction || data.valueRestriction.type === 'simpleValue' ? 'active' : ''}" data-type="simpleValue" onclick="idsEditorModals.selectRestrictionType('simpleValue')">${t('editor.simpleValue')}</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'pattern' ? 'active' : ''}" data-type="pattern" onclick="idsEditorModals.selectRestrictionType('pattern')">${t('editor.patternRegex')}</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'enumeration' ? 'active' : ''}" data-type="enumeration" onclick="idsEditorModals.selectRestrictionType('enumeration')">${t('editor.enumeration')}</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.valueRestriction || { type: 'simpleValue', value: valueValue })}
            </div>
        `;

        // Initialize bSDD autocomplete for Material Value
        new BsddAutocomplete({
            container: document.getElementById('materialValueContainer'),
            inputId: 'materialValue',
            placeholder: `${t('editor.example')} Concrete, Steel`,
            initialValue: valueValue,
            dictionaryFilterId: 'bsddDictFilterMat',
            onSearch: (query, dictUri) => BsddApi.debouncedSearch(query, dictUri),
            onSelect: (item) => {
                this._currentBsddMaterialUri = item.uri || null;
                // Show URI display
                const uriDisplay = document.getElementById('bsddMaterialUriDisplay');
                if (uriDisplay && item.uri) {
                    uriDisplay.style.display = '';
                    uriDisplay.querySelector('span').textContent = item.uri;
                }
            }
        });

        // Initialize dictionary filter autocomplete
        this._initDictionaryFilter('bsddDictFilterMatContainer', 'bsddDictFilterMat');
    }

    /**
     * Show PartOf form
     */
    showPartOfForm(data = {}) {
        document.getElementById('modalTitle').textContent = t('editor.partOfFacet');
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>${t('editor.parentEntityLabel')}</label>
                <input type="text" id="partOfEntity" value="${data.entity || ''}" placeholder="${t('editor.example')} IFCBUILDING">
                <small>${t('editor.parentEntity')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.relationTypeLabel')}</label>
                <select id="partOfRelation">
                    <option value="">${t('editor.allRelations')}</option>
                    <option value="IFCRELAGGREGATES" ${data.relation === 'IFCRELAGGREGATES' ? 'selected' : ''}>IFCRELAGGREGATES</option>
                    <option value="IFCRELASSIGNSTOGROUP" ${data.relation === 'IFCRELASSIGNSTOGROUP' ? 'selected' : ''}>IFCRELASSIGNSTOGROUP</option>
                    <option value="IFCRELCONTAINEDINSPATIALSTRUCTURE" ${data.relation === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' ? 'selected' : ''}>IFCRELCONTAINEDINSPATIALSTRUCTURE</option>
                    <option value="IFCRELNESTS" ${data.relation === 'IFCRELNESTS' ? 'selected' : ''}>IFCRELNESTS</option>
                    <option value="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT" ${data.relation === 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT' ? 'selected' : ''}>IFCRELVOIDSELEMENT IFCRELFILLSELEMENT</option>
                </select>
                <small>${t('editor.relationTypeDesc')}</small>
            </div>
        `;
    }

    /**
     * Get restriction fields HTML based on type
     */
    getRestrictionFields(restriction) {
        console.log('getRestrictionFields called with:', restriction);

        // Handle case when restriction is undefined or null
        if (!restriction) {
            restriction = { type: 'simpleValue', value: '' };
        }

        // Normalize type (parser uses 'simple', editor uses 'simpleValue')
        let type = restriction.type || 'simpleValue';
        if (type === 'simple') {
            type = 'simpleValue';
        }
        if (type === 'restriction' && restriction.pattern) {
            type = 'pattern';
        }
        if (type === 'restriction' && restriction.enumeration) {
            type = 'enumeration';
        }
        if (type === 'restriction' && (restriction.minInclusive || restriction.maxInclusive)) {
            type = 'bounds';
        }

        // Extract value from various formats
        let value = '';
        if (restriction.value !== undefined) {
            value = restriction.value;
            // If value is nested object, extract it
            if (typeof value === 'object' && value.value) {
                value = value.value;
            }
        } else if (restriction.pattern) {
            // Parser format for pattern
            value = restriction.pattern;
        }

        switch (type) {
            case 'simpleValue':
                return `
                    <div class="form-group">
                        <label>${t('editor.valueLabel')}</label>
                        <input type="text" id="restrictionValue" value="${this.escapeHtml(value)}" placeholder="${t('editor.enterValue')}">
                    </div>
                `;

            case 'pattern':
                return `
                    <div class="form-group">
                        <label>${t('editor.regexPatternLabel')}</label>
                        <input type="text" id="restrictionPattern" value="${this.escapeHtml(value)}" placeholder="${t('editor.example')} ^WALL.*">
                        <small>${t('editor.regexPattern')}</small>
                    </div>
                `;

            case 'enumeration':
                const values = restriction.values || [];
                let enumHtml = `
                    <div class="form-group">
                        <label>${t('editor.enumerationValues')}</label>
                        <div class="enumeration-list" id="enumerationList">
                `;

                if (values.length === 0) {
                    enumHtml += `
                        <div class="enumeration-item">
                            <input type="text" placeholder="${t('editor.enterValue')}" class="enum-value">
                            <button type="button" onclick="idsEditorModals.removeEnumValue(this)">✕</button>
                        </div>
                    `;
                } else {
                    values.forEach(val => {
                        enumHtml += `
                            <div class="enumeration-item">
                                <input type="text" value="${val}" class="enum-value">
                                <button type="button" onclick="idsEditorModals.removeEnumValue(this)">✕</button>
                            </div>
                        `;
                    });
                }

                enumHtml += `
                        </div>
                        <button type="button" class="add-enum-btn" onclick="idsEditorModals.addEnumValue()">${t('editor.addValue')}</button>
                    </div>
                `;
                return enumHtml;

            case 'bounds':
                return `
                    <div class="bounds-inputs">
                        <div class="form-group">
                            <label>${t('editor.minInclusive')}</label>
                            <input type="number" id="boundsMinInclusive" value="${restriction.minInclusive || ''}" step="any">
                        </div>
                        <div class="form-group">
                            <label>${t('editor.maxInclusive')}</label>
                            <input type="number" id="boundsMaxInclusive" value="${restriction.maxInclusive || ''}" step="any">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('editor.baseType')}</label>
                        <select id="boundsBase">
                            <option value="xs:decimal" ${restriction.base === 'xs:decimal' ? 'selected' : ''}>${t('editor.decimalType')}</option>
                            <option value="xs:integer" ${restriction.base === 'xs:integer' ? 'selected' : ''}>${t('editor.integerType')}</option>
                        </select>
                    </div>
                `;
        }
    }

    /**
     * Select restriction type
     */
    selectRestrictionType(type) {
        // Update button states
        document.querySelectorAll('.restriction-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');

        // Update fields
        document.getElementById('restrictionFields').innerHTML = this.getRestrictionFields({ type });
    }

    /**
     * Add enumeration value
     */
    addEnumValue() {
        const list = document.getElementById('enumerationList');
        const item = document.createElement('div');
        item.className = 'enumeration-item';
        item.innerHTML = `
            <input type="text" placeholder="${t('editor.enterValue')}" class="enum-value">
            <button type="button" onclick="idsEditorModals.removeEnumValue(this)">✕</button>
        `;
        list.appendChild(item);
    }

    /**
     * Remove enumeration value
     */
    removeEnumValue(button) {
        button.parentElement.remove();
    }

    /**
     * Save facet data
     */
    saveFacet() {
        let facetData = { type: this.currentFacetType };

        try {
            switch (this.currentFacetType) {
                case 'entity':
                    facetData = this.getEntityData();
                    break;
                case 'property':
                    facetData = this.getPropertyData();
                    break;
                case 'attribute':
                    facetData = this.getAttributeData();
                    break;
                case 'classification':
                    facetData = this.getClassificationData();
                    break;
                case 'material':
                    facetData = this.getMaterialData();
                    break;
                case 'partOf':
                    facetData = this.getPartOfData();
                    break;
            }

            if (this.currentCallback) {
                this.currentCallback(facetData);
            }

            this.closeModal();
        } catch (error) {
            alert(t('editor.saveError') + ' ' + error.message);
        }
    }

    /**
     * Get entity data from form
     */
    getEntityData() {
        const name = document.getElementById('entityName').value.trim();
        if (!name) {
            throw new Error(t('editor.entityNameRequired'));
        }

        const facet = {
            type: 'entity',
            name: { type: 'simpleValue', value: name }
        };

        const predefinedType = document.getElementById('entityPredefinedType').value.trim();
        if (predefinedType) {
            facet.predefinedType = predefinedType;
        }

        return facet;
    }

    /**
     * Get property data from form
     */
    getPropertyData() {
        const propertySet = document.getElementById('propertySet').value.trim();
        const baseName = document.getElementById('propertyBaseName').value.trim();

        if (!propertySet || !baseName) {
            throw new Error(t('editor.psetBaseNameRequired'));
        }

        const restrictionType = document.querySelector('.restriction-type-btn.active')?.dataset.type || 'simpleValue';
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

    /**
     * Get attribute data from form
     */
    getAttributeData() {
        const name = document.getElementById('attributeName').value.trim();
        if (!name) {
            throw new Error(t('editor.attributeNameRequired'));
        }

        const restrictionType = document.querySelector('.restriction-type-btn.active')?.dataset.type || 'simpleValue';
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'attribute',
            name,
            value
        };

        // Add cardinality if in requirements section
        const cardinality = this.getCurrentFacetCardinality();
        if (cardinality) {
            facet.cardinality = cardinality;
        }

        return facet;
    }

    /**
     * Get classification data from form
     */
    getClassificationData() {
        const system = document.getElementById('classificationSystem').value.trim();
        const restrictionType = document.querySelector('.restriction-type-btn.active')?.dataset.type || 'simpleValue';
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'classification',
            system,
            value
        };

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

    /**
     * Get material data from form
     */
    getMaterialData() {
        const restrictionType = document.querySelector('.restriction-type-btn.active')?.dataset.type || 'simpleValue';
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'material',
            value
        };

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

    /**
     * Get partOf data from form
     */
    getPartOfData() {
        const entity = document.getElementById('partOfEntity').value.trim();
        if (!entity) {
            throw new Error(t('editor.parentEntityRequired'));
        }

        const facet = {
            type: 'partOf',
            entity
        };

        const relation = document.getElementById('partOfRelation').value;
        if (relation) {
            facet.relation = relation;
        }

        // Add cardinality if in requirements section
        const cardinality = this.getCurrentFacetCardinality();
        if (cardinality) {
            facet.cardinality = cardinality;
        }

        return facet;
    }

    /**
     * Get current facet cardinality from form (if in requirements section)
     */
    getCurrentFacetCardinality() {
        const cardinalitySelect = document.getElementById('facetCardinality');
        if (cardinalitySelect) {
            return cardinalitySelect.value;
        }
        return null; // No cardinality (applicability section or entity facet)
    }

    /**
     * Get restriction data based on type
     */
    getRestrictionData(typeKey) {
        if (typeKey === 'simpleValue') {
            const value = document.getElementById('restrictionValue')?.value.trim() || '';
            return { type: 'simpleValue', value };
        } else if (typeKey === 'pattern') {
            const value = document.getElementById('restrictionPattern')?.value.trim() || '';
            return { type: 'pattern', value };
        } else if (typeKey === 'enumeration') {
            const values = Array.from(document.querySelectorAll('.enum-value'))
                .map(input => input.value.trim())
                .filter(v => v);
            return { type: 'enumeration', values };
        } else if (typeKey === 'bounds') {
            const minInclusive = document.getElementById('boundsMinInclusive')?.value;
            const maxInclusive = document.getElementById('boundsMaxInclusive')?.value;
            const base = document.getElementById('boundsBase')?.value || 'xs:decimal';

            const bounds = { type: 'bounds', base };
            if (minInclusive) {
                bounds.minInclusive = minInclusive;
            }
            if (maxInclusive) {
                bounds.maxInclusive = maxInclusive;
            }
            return bounds;
        }

        return { type: 'simpleValue', value: '' };
    }

    /**
     * Open modal
     */
    openModal() {
        document.getElementById('facetModalOverlay').classList.add('active');
    }

    /**
     * Close modal
     */
    closeModal() {
        document.getElementById('facetModalOverlay').classList.remove('active');
        this.currentCallback = null;
        this.currentFacetType = null;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Show specification modal for add/edit
     */
    showSpecificationModal(specData = {}, callback) {
        this.currentSpecCallback = callback;

        const isEdit = !!specData.name;
        document.getElementById('specModalTitle').textContent = isEdit ? t('editor.editSpec') : t('editor.addSpec');

        // Determine current cardinality based on minOccurs/maxOccurs
        let currentCardinality = 'required'; // default
        if (specData.minOccurs === '0' && specData.maxOccurs === '0') {
            currentCardinality = 'prohibited';
        } else if (specData.minOccurs === '0') {
            currentCardinality = 'optional';
        }

        document.getElementById('specModalBody').innerHTML = `
            <div class="form-group">
                <label>${t('editor.specName')}</label>
                <input type="text" id="specName" value="${this.escapeHtml(specData.name || '')}" placeholder="${t('editor.example')} Walls Fire Rating Check">
                <small>${t('editor.specDescLabel')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.ifcVersion')}</label>
                <select id="specIfcVersion">
                    <option value="IFC2X3" ${specData.ifcVersion === 'IFC2X3' ? 'selected' : ''}>IFC2X3</option>
                    <option value="IFC4" ${!specData.ifcVersion || specData.ifcVersion === 'IFC4' ? 'selected' : ''}>IFC4</option>
                    <option value="IFC4X3_ADD2" ${specData.ifcVersion === 'IFC4X3_ADD2' ? 'selected' : ''}>IFC4X3_ADD2</option>
                </select>
                <small>${t('editor.ifcVersionDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.specCardinality')}</label>
                <select id="specCardinality">
                    <option value="required" ${currentCardinality === 'required' ? 'selected' : ''}>${t('cardinality.required')}</option>
                    <option value="optional" ${currentCardinality === 'optional' ? 'selected' : ''}>${t('cardinality.optional')}</option>
                    <option value="prohibited" ${currentCardinality === 'prohibited' ? 'selected' : ''}>${t('cardinality.prohibited')}</option>
                </select>
                <small>${t('editor.specCardinalityDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('editor.descriptionOptional')}</label>
                <textarea id="specDescription" rows="3" placeholder="${t('editor.detailedDesc')}">${this.escapeHtml(specData.description || '')}</textarea>
            </div>
        `;

        this.openSpecificationModal();
    }

    /**
     * Get cardinality description text
     */


    /**
     * Get facet cardinality description text
     */
    getFacetCardinalityDescription(cardinality) {
        switch (cardinality) {
            case 'required':
                return t('cardinality.facetRequiredDesc');
            case 'optional':
                return t('cardinality.facetOptionalDesc');
            case 'prohibited':
                return t('cardinality.facetProhibitedDesc');
            default:
                return '';
        }
    }

    /**
     * Get facet cardinality field HTML (only for requirements section)
     */
    getFacetCardinalityField(currentCardinality = 'required') {
        // Only show cardinality for requirements section, not applicability
        if (this.currentSection !== 'requirements') {
            return '';
        }

        return `
            <div class="form-group facet-cardinality-group">
                <label>${t('cardinality.facetLabel')}</label>
                <select id="facetCardinality" onchange="idsEditorModals.updateFacetCardinalityDescription()">
                    <option value="required" ${currentCardinality === 'required' ? 'selected' : ''}>${t('cardinality.required')}</option>
                    <option value="optional" ${currentCardinality === 'optional' ? 'selected' : ''}>${t('cardinality.optional')}</option>
                    <option value="prohibited" ${currentCardinality === 'prohibited' ? 'selected' : ''}>${t('cardinality.prohibited')}</option>
                </select>
                <small id="facetCardinalityDesc">${this.getFacetCardinalityDescription(currentCardinality)}</small>
            </div>
        `;
    }

    /**
     * Update facet cardinality description when selection changes
     */
    updateFacetCardinalityDescription() {
        const cardinality = document.getElementById('facetCardinality').value;
        document.getElementById('facetCardinalityDesc').textContent = this.getFacetCardinalityDescription(cardinality);
    }

    /**
     * Update cardinality description when selection changes
     */


    /**
     * Save specification data
     */
    saveSpecification() {
        const name = document.getElementById('specName').value.trim();
        if (!name) {
            alert(t('editor.specNameRequired'));
            return;
        }

        const ifcVersion = document.getElementById('specIfcVersion').value;
        if (!ifcVersion) {
            alert(t('editor.ifcVersionRequired'));
            return;
        }

        const cardinality = document.getElementById('specCardinality')?.value || 'required';
        const occurs = {
            required:   { minOccurs: '1', maxOccurs: 'unbounded' },
            optional:   { minOccurs: '0', maxOccurs: 'unbounded' },
            prohibited: { minOccurs: '0', maxOccurs: '0' }
        }[cardinality];

        const specData = {
            name: name,
            ifcVersion: ifcVersion,
            description: document.getElementById('specDescription').value.trim(),
            minOccurs: occurs.minOccurs,
            maxOccurs: occurs.maxOccurs
        };

        if (this.currentSpecCallback) {
            this.currentSpecCallback(specData);
        }

        this.closeSpecificationModal();
    }

    /**
     * Open specification modal
     */
    openSpecificationModal() {
        document.getElementById('specificationModalOverlay').classList.add('active');
    }

    /**
     * Close specification modal
     */
    closeSpecificationModal() {
        document.getElementById('specificationModalOverlay').classList.remove('active');
        this.currentSpecCallback = null;
    }

    /**
     * Initialize searchable dictionary filter autocomplete.
     * Loads dictionaries once, then filters client-side.
     */
    async _initDictionaryFilter(containerId, hiddenInputId) {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(hiddenInputId);
        if (!container || !hiddenInput) return;

        // Load dictionaries (cached after first call)
        if (!this._dictionaryCache) {
            try {
                this._dictionaryCache = await BsddApi.getDictionaries();
            } catch (e) {
                console.warn('Failed to load bSDD dictionaries:', e);
                this._dictionaryCache = [];
            }
        }

        const dictionaries = this._dictionaryCache;

        new BsddAutocomplete({
            container: container,
            inputId: hiddenInputId + '_search',
            placeholder: t('bsdd.allDictionaries'),
            initialValue: '',
            onSearch: (query) => {
                const lowerQuery = query.toLowerCase();
                return Promise.resolve(
                    dictionaries
                        .filter(d => d.name.toLowerCase().includes(lowerQuery) ||
                                     (d.version || '').toLowerCase().includes(lowerQuery))
                        .map(d => ({
                            name: `${d.name} (${d.version})`,
                            code: '',
                            uri: d.uri,
                            dictionaryName: d.name
                        }))
                );
            },
            onSelect: (item) => {
                hiddenInput.value = item.uri;
            }
        });

        // Allow clearing the filter by emptying the input
        const searchInput = document.getElementById(hiddenInputId + '_search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (!searchInput.value.trim()) {
                    hiddenInput.value = '';
                }
            });
        }
    }
}

// Create global instance
window.idsEditorModals = new IDSEditorModals();
