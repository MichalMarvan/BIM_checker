/**
 * IDS Editor Modals
 * Handles modal windows for adding/editing facets
 */

class IDSEditorModals {
    constructor() {
        this.currentCallback = null;
        this.currentFacetType = null;
        this.currentIfcVersion = 'IFC4'; // Default IFC version
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
                        <h2 id="specModalTitle">Specifikace</h2>
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
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value.type === 'simple' || value.type === 'simpleValue') {
            return value.value || '';
        }
        if (value.value) return value.value;
        return '';
    }

    /**
     * Select facet type and show appropriate form
     */
    selectFacetType(type) {
        this.currentFacetType = type;

        switch (type) {
            case 'entity':
                this.showEntityForm();
                break;
            case 'property':
                this.showPropertyForm();
                break;
            case 'attribute':
                this.showAttributeForm();
                break;
            case 'classification':
                this.showClassificationForm();
                break;
            case 'material':
                this.showMaterialForm();
                break;
            case 'partOf':
                this.showPartOfForm();
                break;
        }
    }

    /**
     * Show Entity form
     */
    showEntityForm(data = {}) {
        document.getElementById('modalTitle').textContent = '🏢 Entity Facet';

        // Extract name value - data.name can be string or object {type: 'simpleValue', value: '...'}
        const nameValue = this.extractSimpleValue(data.name);
        const predefinedTypeValue = this.extractSimpleValue(data.predefinedType);

        // Generate datalist options from IFC_ENTITY_TYPES
        const datalistOptions = window.IFC_ENTITY_TYPES
            ? window.IFC_ENTITY_TYPES.map(type => `<option value="${type}">`).join('')
            : '';

        document.getElementById('modalBody').innerHTML = `
            <div class="form-group">
                <label>Entity Name:</label>
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

        // Get PropertySets for current IFC version
        const propertySets = window.getPropertySetsForVersion
            ? window.getPropertySetsForVersion(this.currentIfcVersion)
            : (window.IFC_PROPERTY_SETS || []);

        // Generate datalist options from IFC_PROPERTY_SETS
        const psetDatalistOptions = propertySets
            ? propertySets.map(pset => `<option value="${pset}">`).join('')
            : '';

        document.getElementById('modalTitle').textContent = `📋 Property Facet (${this.currentIfcVersion})`;
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>PropertySet Name:</label>
                <input type="text" id="propertySet" list="ifcPropertySets" value="${propertySetValue}" placeholder="${t('editor.example')} Pset_WallCommon" autocomplete="off">
                <datalist id="ifcPropertySets">
                    ${psetDatalistOptions}
                </datalist>
                <small>${t('editor.propertySetName')} (${propertySets.length} ${t('editor.availableFor')} ${this.currentIfcVersion})</small>
            </div>

            <div class="form-group">
                <label>Property Name (baseName):</label>
                <input type="text" id="propertyBaseName" value="${baseNameValue}" placeholder="${t('editor.example')} FireRating">
                <small>${t('editor.propertyName')}</small>
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
        if (type === 'simple') type = 'simpleValue';
        if (type === 'restriction' && value.pattern) type = 'pattern';
        if (type === 'restriction' && value.enumeration) type = 'enumeration';
        if (type === 'restriction' && (value.minInclusive || value.maxInclusive)) type = 'bounds';

        return type === checkType ? 'active' : '';
    }

    /**
     * Show Attribute form
     */
    showAttributeForm(data = {}) {
        document.getElementById('modalTitle').textContent = '🏷️ Attribute Facet';
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>Attribute Name:</label>
                <input type="text" id="attributeName" value="${data.name || ''}" placeholder="${t('editor.example')} Name, GlobalId, Description">
                <small>${t('editor.attributeName')}</small>
            </div>

            <div class="form-group">
                <label>Value Restriction:</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.value || data.value.type === 'simpleValue' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('simpleValue')">Simple Value</button>
                    <button class="restriction-type-btn ${data.value?.type === 'pattern' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('pattern')">Pattern (Regex)</button>
                    <button class="restriction-type-btn ${data.value?.type === 'enumeration' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('enumeration')">Enumeration</button>
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
        document.getElementById('modalTitle').textContent = '📚 Classification Facet';
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>Classification System:</label>
                <input type="text" id="classificationSystem" value="${data.system || ''}" placeholder="${t('editor.example')} Uniclass, OmniClass">
                <small>${t('editor.classSystem')}</small>
            </div>

            <div class="form-group">
                <label>Classification Value:</label>
                <input type="text" id="classificationValue" value="${data.value || ''}" placeholder="${t('editor.example')} Ss_25_10_20">
                <small>${t('editor.classValue')}</small>
            </div>

            <div class="form-group">
                <label>Value Restriction Type:</label>
                <div class="restriction-types">
                    <button class="restriction-type-btn ${!data.valueRestriction || data.valueRestriction.type === 'simpleValue' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('simpleValue')">Simple Value</button>
                    <button class="restriction-type-btn ${data.valueRestriction?.type === 'pattern' ? 'active' : ''}" onclick="idsEditorModals.selectRestrictionType('pattern')">Pattern (Regex)</button>
                </div>
            </div>

            <div id="restrictionFields">
                ${this.getRestrictionFields(data.valueRestriction || { type: 'simpleValue', value: data.value || '' })}
            </div>
        `;
    }

    /**
     * Show Material form
     */
    showMaterialForm(data = {}) {
        document.getElementById('modalTitle').textContent = '🧱 Material Facet';
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>Material Value:</label>
                <input type="text" id="materialValue" value="${data.value || ''}" placeholder="${t('editor.example')} Concrete, Steel">
                <small>${t('editor.materialName')}</small>
            </div>

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
    }

    /**
     * Show PartOf form
     */
    showPartOfForm(data = {}) {
        document.getElementById('modalTitle').textContent = '🔗 PartOf Facet';
        document.getElementById('modalBody').innerHTML = `
            ${this.getFacetCardinalityField(data.cardinality || 'required')}

            <div class="form-group">
                <label>Parent Entity:</label>
                <input type="text" id="partOfEntity" value="${data.entity || ''}" placeholder="${t('editor.example')} IFCBUILDING">
                <small>${t('editor.parentEntity')}</small>
            </div>

            <div class="form-group">
                <label>Relation Type:</label>
                <select id="partOfRelation">
                    <option value="">${t('editor.allRelations')}</option>
                    <option value="IFCRELAGGREGATES" ${data.relation === 'IFCRELAGGREGATES' ? 'selected' : ''}>IFCRELAGGREGATES</option>
                    <option value="IFCRELCONTAINEDINSPATIALSTRUCTURE" ${data.relation === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' ? 'selected' : ''}>IFCRELCONTAINEDINSPATIALSTRUCTURE</option>
                    <option value="IFCRELVOIDSELEMENT" ${data.relation === 'IFCRELVOIDSELEMENT' ? 'selected' : ''}>IFCRELVOIDSELEMENT</option>
                    <option value="IFCRELFILLSELEMENT" ${data.relation === 'IFCRELFILLSELEMENT' ? 'selected' : ''}>IFCRELFILLSELEMENT</option>
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
        if (type === 'simple') type = 'simpleValue';
        if (type === 'restriction' && restriction.pattern) type = 'pattern';
        if (type === 'restriction' && restriction.enumeration) type = 'enumeration';
        if (type === 'restriction' && (restriction.minInclusive || restriction.maxInclusive)) type = 'bounds';

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
                        <label>Value:</label>
                        <input type="text" id="restrictionValue" value="${this.escapeHtml(value)}" placeholder="Enter value">
                    </div>
                `;

            case 'pattern':
                return `
                    <div class="form-group">
                        <label>Regex Pattern:</label>
                        <input type="text" id="restrictionPattern" value="${this.escapeHtml(value)}" placeholder="${t('editor.example')} ^WALL.*">
                        <small>${t('editor.regexPattern')}</small>
                    </div>
                `;

            case 'enumeration':
                const values = restriction.values || [];
                let enumHtml = `
                    <div class="form-group">
                        <label>Enumeration Values:</label>
                        <div class="enumeration-list" id="enumerationList">
                `;

                if (values.length === 0) {
                    enumHtml += `
                        <div class="enumeration-item">
                            <input type="text" placeholder="Enter value" class="enum-value">
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
                            <label>Min Value (inclusive):</label>
                            <input type="number" id="boundsMinInclusive" value="${restriction.minInclusive || ''}" step="any">
                        </div>
                        <div class="form-group">
                            <label>Max Value (inclusive):</label>
                            <input type="number" id="boundsMaxInclusive" value="${restriction.maxInclusive || ''}" step="any">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Base Type:</label>
                        <select id="boundsBase">
                            <option value="xs:decimal" ${restriction.base === 'xs:decimal' ? 'selected' : ''}>Decimal</option>
                            <option value="xs:integer" ${restriction.base === 'xs:integer' ? 'selected' : ''}>Integer</option>
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
            <input type="text" placeholder="Enter value" class="enum-value">
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
        if (!name) throw new Error('Entity name is required');

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
        if (!name) throw new Error('Attribute name is required');

        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
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
        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'classification',
            system,
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
     * Get material data from form
     */
    getMaterialData() {
        const restrictionType = document.querySelector('.restriction-type-btn.active').textContent.trim();
        const value = this.getRestrictionData(restrictionType);

        const facet = {
            type: 'material',
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
     * Get partOf data from form
     */
    getPartOfData() {
        const entity = document.getElementById('partOfEntity').value.trim();
        if (!entity) throw new Error('Parent entity is required');

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
    getRestrictionData(typeLabel) {
        if (typeLabel.includes('Simple')) {
            const value = document.getElementById('restrictionValue')?.value.trim() || '';
            return { type: 'simpleValue', value };
        } else if (typeLabel.includes('Pattern')) {
            const value = document.getElementById('restrictionPattern')?.value.trim() || '';
            return { type: 'pattern', value };
        } else if (typeLabel.includes('Enumeration')) {
            const values = Array.from(document.querySelectorAll('.enum-value'))
                .map(input => input.value.trim())
                .filter(v => v);
            return { type: 'enumeration', values };
        } else if (typeLabel.includes('Bounds')) {
            const minInclusive = document.getElementById('boundsMinInclusive')?.value;
            const maxInclusive = document.getElementById('boundsMaxInclusive')?.value;
            const base = document.getElementById('boundsBase')?.value || 'xs:decimal';

            const bounds = { type: 'bounds', base };
            if (minInclusive) bounds.minInclusive = minInclusive;
            if (maxInclusive) bounds.maxInclusive = maxInclusive;
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
        if (!text) return '';
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
                    <option value="IFC4X3" ${specData.ifcVersion === 'IFC4X3' ? 'selected' : ''}>IFC4X3</option>
                    <option value="IFC4X3_ADD2" ${specData.ifcVersion === 'IFC4X3_ADD2' ? 'selected' : ''}>IFC4X3_ADD2</option>
                </select>
                <small>${t('editor.ifcVersionDesc')}</small>
            </div>

            <div class="form-group">
                <label>${t('cardinality.specLabel')}</label>
                <select id="specCardinality" onchange="idsEditorModals.updateCardinalityDescription()">
                    <option value="required" ${currentCardinality === 'required' ? 'selected' : ''}>${t('cardinality.required')}</option>
                    <option value="optional" ${currentCardinality === 'optional' ? 'selected' : ''}>${t('cardinality.optional')}</option>
                    <option value="prohibited" ${currentCardinality === 'prohibited' ? 'selected' : ''}>${t('cardinality.prohibited')}</option>
                </select>
                <small id="cardinalityDesc">${this.getCardinalityDescription(currentCardinality)}</small>
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
    getCardinalityDescription(cardinality) {
        switch (cardinality) {
            case 'required':
                return t('cardinality.requiredDesc');
            case 'optional':
                return t('cardinality.optionalDesc');
            case 'prohibited':
                return t('cardinality.prohibitedDesc');
            default:
                return '';
        }
    }

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
    updateCardinalityDescription() {
        const cardinality = document.getElementById('specCardinality').value;
        document.getElementById('cardinalityDesc').textContent = this.getCardinalityDescription(cardinality);
    }

    /**
     * Save specification data
     */
    saveSpecification() {
        const name = document.getElementById('specName').value.trim();
        if (!name) {
            alert(t('editor.specNameRequired'));
            return;
        }

        const cardinality = document.getElementById('specCardinality').value;

        // Convert cardinality to minOccurs/maxOccurs
        let minOccurs, maxOccurs;
        switch (cardinality) {
            case 'required':
                minOccurs = '1';
                maxOccurs = 'unbounded';
                break;
            case 'optional':
                minOccurs = '0';
                maxOccurs = 'unbounded';
                break;
            case 'prohibited':
                minOccurs = '0';
                maxOccurs = '0';
                break;
        }

        const specData = {
            name: name,
            ifcVersion: document.getElementById('specIfcVersion').value,
            description: document.getElementById('specDescription').value.trim(),
            minOccurs: minOccurs,
            maxOccurs: maxOccurs,
            cardinality: cardinality
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
}

// Create global instance
window.idsEditorModals = new IDSEditorModals();
