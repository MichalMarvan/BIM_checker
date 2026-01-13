/**
 * IDS Editor Core
 * Main editor logic for IDS files
 */

class IDSEditorCore {
    constructor() {
        this.idsData = null;
        this.editMode = false;
        this.xmlGenerator = new IDSXMLGenerator();
        this.hasUnsavedChanges = false;
    }

    /**
     * Initialize editor
     */
    initialize() {
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Create New IDS button
        const createNewBtn = document.getElementById('createNewIdsBtn');
        if (createNewBtn) {
            createNewBtn.addEventListener('click', () => this.createNewIDS());
        }

        // Toggle Edit Mode button
        const toggleEditBtn = document.getElementById('toggleEditBtn');
        if (toggleEditBtn) {
            toggleEditBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Download IDS button
        const downloadBtn = document.getElementById('downloadIdsBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadIDS());
        }

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /**
     * Create new IDS file
     */
    createNewIDS() {
        console.log('createNewIDS called');
        if (this.hasUnsavedChanges) {
            if (!confirm(t('editor.unsavedChanges'))) {
                return;
            }
        }

        // Create empty IDS structure
        this.idsData = {
            title: 'New IDS Specification',
            copyright: '',
            version: '1.0',
            description: '',
            author: '',
            date: new Date().toISOString().split('T')[0],
            purpose: '',
            milestone: '',
            specifications: []
        };

        console.log('New IDS data created:', this.idsData);
        this.hasUnsavedChanges = true;
        this.renderIDS();
        this.enableEditMode();

        // Show success message
        this.showMessage(t('editor.newIdsCreated'), 'success');
    }

    /**
     * Load IDS from parsed data
     */
    loadIDS(parsedData) {
        this.idsData = this.convertParsedDataToIDSData(parsedData);
        this.hasUnsavedChanges = false;
        this.renderIDS();
    }

    /**
     * Convert parsed XML data to IDS data structure
     */
    convertParsedDataToIDSData(parsed) {
        const idsData = {
            title: parsed.title || 'Untitled',
            copyright: parsed.copyright || '',
            version: parsed.version || '',
            description: parsed.description || '',
            author: parsed.author || '',
            date: parsed.date || '',
            purpose: parsed.purpose || '',
            milestone: parsed.milestone || '',
            specifications: []
        };

        if (parsed.specifications) {
            idsData.specifications = parsed.specifications.map(spec => {
                // Determine cardinality from minOccurs/maxOccurs
                let cardinality = 'required'; // default
                if (spec.minOccurs === '0' && spec.maxOccurs === '0') {
                    cardinality = 'prohibited';
                } else if (spec.minOccurs === '0') {
                    cardinality = 'optional';
                }

                return {
                    name: spec.name,
                    ifcVersion: spec.ifcVersion || '',
                    identifier: spec.identifier || '',
                    description: spec.description || '',
                    instructions: spec.instructions || '',
                    minOccurs: spec.minOccurs,
                    maxOccurs: spec.maxOccurs,
                    cardinality: cardinality,
                    applicability: this.convertFacets(spec.applicability),
                    requirements: this.convertFacets(spec.requirements)
                };
            });
        }

        return idsData;
    }

    /**
     * Convert facets to editor format
     */
    convertFacets(facets) {
        if (!facets || !Array.isArray(facets)) {
            return [];
        }

        return facets.map(facet => {
            // Convert parser format to editor format
            const converted = {
                type: facet.type || this.detectFacetType(facet)
            };

            // Convert all properties that might be value objects
            Object.keys(facet).forEach(key => {
                if (key === 'type') {
                    return;
                }

                const value = facet[key];

                if (value && typeof value === 'object') {
                    // Handle different parser formats
                    if (value.type === 'simple') {
                        // Convert {type: 'simple', value: 'x'} to {type: 'simpleValue', value: 'x'}
                        converted[key] = { type: 'simpleValue', value: value.value };
                    } else if (value.type === 'restriction' && value.pattern) {
                        // Convert {type: 'restriction', pattern: 'x', isRegex: true} to {type: 'pattern', value: 'x'}
                        converted[key] = { type: 'pattern', value: value.pattern };
                    } else if (value.type === 'restriction' && value.enumeration) {
                        // Convert enumeration format
                        converted[key] = { type: 'enumeration', values: value.enumeration };
                    } else if (value.type === 'restriction' && (value.minInclusive !== undefined || value.maxInclusive !== undefined)) {
                        // Convert bounds format
                        converted[key] = {
                            type: 'bounds',
                            minInclusive: value.minInclusive,
                            maxInclusive: value.maxInclusive,
                            base: value.base || 'xs:decimal'
                        };
                    } else if (value.type) {
                        // Keep other restriction types as is
                        converted[key] = value;
                    } else {
                        // Object without type field
                        converted[key] = value;
                    }
                } else {
                    // Simple string or other value
                    converted[key] = value;
                }
            });

            return converted;
        });
    }

    /**
     * Detect facet type from facet data
     */
    detectFacetType(facet) {
        if (facet.name && facet.predefinedType !== undefined) {
            return 'entity';
        }
        if (facet.propertySet) {
            return 'property';
        }
        if (facet.name && !facet.propertySet) {
            return 'attribute';
        }
        if (facet.system) {
            return 'classification';
        }
        if (facet.value && Object.keys(facet).length <= 2) {
            return 'material';
        }
        if (facet.entity) {
            return 'partOf';
        }
        return 'entity';
    }

    /**
     * Render IDS structure
     */
    renderIDS() {
        console.log('renderIDS called', this.idsData);
        if (!this.idsData) {
            console.error('No IDS data to render');
            return;
        }

        const container = document.getElementById('idsContent');
        if (!container) {
            console.error('idsContent container not found!');
            return;
        }

        // Save collapsed state before re-rendering
        const collapsedState = this.saveCollapsedState();

        console.log('Rendering into container:', container);

        let html = '<div class="ids-structure">';

        // Render info section
        html += this.renderInfoSection();

        // Render specifications
        html += '<div class="specifications-container">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
        html += '<h3 style="margin: 0;">Specifications</h3>';
        if (this.idsData.specifications.length > 0) {
            html += '<div class="collapse-controls">';
            html += `<button class="btn btn-sm btn-secondary" onclick="idsEditorCore.collapseAll()">${t('editor.collapseAll')}</button>`;
            html += `<button class="btn btn-sm btn-secondary" onclick="idsEditorCore.expandAll()">${t('editor.expandAll')}</button>`;
            html += '</div>';
        }
        html += '</div>';

        if (this.idsData.specifications.length === 0) {
            html += `<p class="empty-message">${t('editor.noSpecs')}</p>`;
        } else {
            this.idsData.specifications.forEach((spec, index) => {
                html += this.renderSpecification(spec, index);
            });
        }

        if (this.editMode) {
            html += `<button class="add-facet-btn" onclick="idsEditorCore.addSpecification()">${t('editor.addSpecification')}</button>`;
        }

        html += '</div>';
        html += '</div>';

        container.innerHTML = html;

        // Restore collapsed state after re-rendering
        this.restoreCollapsedState(collapsedState);
    }

    /**
     * Save collapsed state of all collapsible sections
     */
    saveCollapsedState() {
        const state = {
            specifications: {},
            applicability: {},
            requirements: {}
        };

        // Save specification collapsed states
        document.querySelectorAll('.specification-item').forEach(spec => {
            const index = spec.dataset.index;
            if (index !== undefined) {
                state.specifications[index] = spec.classList.contains('collapsed');
            }
        });

        // Save applicability section states
        document.querySelectorAll('.applicability-section').forEach((section, i) => {
            state.applicability[i] = section.classList.contains('collapsed');
        });

        // Save requirements section states
        document.querySelectorAll('.requirements-section').forEach((section, i) => {
            state.requirements[i] = section.classList.contains('collapsed');
        });

        return state;
    }

    /**
     * Restore collapsed state of all collapsible sections
     */
    restoreCollapsedState(state) {
        if (!state) {
            return;
        }

        // Restore specification collapsed states
        document.querySelectorAll('.specification-item').forEach(spec => {
            const index = spec.dataset.index;
            if (index !== undefined && state.specifications[index] !== undefined) {
                if (state.specifications[index]) {
                    spec.classList.add('collapsed');
                } else {
                    spec.classList.remove('collapsed');
                }
            }
        });

        // Restore applicability section states
        document.querySelectorAll('.applicability-section').forEach((section, i) => {
            if (state.applicability[i] !== undefined) {
                if (state.applicability[i]) {
                    section.classList.add('collapsed');
                } else {
                    section.classList.remove('collapsed');
                }
            }
        });

        // Restore requirements section states
        document.querySelectorAll('.requirements-section').forEach((section, i) => {
            if (state.requirements[i] !== undefined) {
                if (state.requirements[i]) {
                    section.classList.add('collapsed');
                } else {
                    section.classList.remove('collapsed');
                }
            }
        });
    }

    /**
     * Render info section
     */
    renderInfoSection() {
        const info = this.idsData;
        let html = '<div class="info-section">';
        html += '<h3>IDS Information</h3>';
        html += '<div class="info-grid">';

        // Title je povinné, vždy zobrazit
        html += `<div><strong>Title:</strong> ${this.escapeHtml(info.title)}</div>`;

        // Ostatní pole zobrazit jen pokud mají hodnotu
        if (info.version) {
            html += `<div><strong>Version:</strong> ${this.escapeHtml(info.version)}</div>`;
        }
        if (info.author) {
            html += `<div><strong>Author:</strong> ${this.escapeHtml(info.author)}</div>`;
        }
        if (info.date) {
            html += `<div><strong>Date:</strong> ${this.escapeHtml(info.date)}</div>`;
        }
        if (info.copyright) {
            html += `<div><strong>Copyright:</strong> ${this.escapeHtml(info.copyright)}</div>`;
        }
        if (info.description) {
            html += `<div><strong>Description:</strong> ${this.escapeHtml(info.description)}</div>`;
        }
        if (info.purpose) {
            html += `<div><strong>Purpose:</strong> ${this.escapeHtml(info.purpose)}</div>`;
        }
        if (info.milestone) {
            html += `<div><strong>Milestone:</strong> ${this.escapeHtml(info.milestone)}</div>`;
        }

        html += '</div>';

        if (this.editMode) {
            html += `<button class="btn btn-secondary" onclick="idsEditorCore.editInfo()">${t('editor.editInfo')}</button>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render specification
     */
    renderSpecification(spec, index) {
        const totalFacets = (spec.applicability ? spec.applicability.length : 0) + (spec.requirements ? spec.requirements.length : 0);
        const ifcVersion = spec.ifcVersion || 'IFC4';
        const cardinality = spec.cardinality || 'required';
        const cardinalityBadge = this.getCardinalityBadge(cardinality);
        let html = `
            <div class="specification-item collapsible-section" data-index="${index}">
                <div class="spec-header collapsible-header" onclick="idsEditorCore.toggleSection(this)">
                    <span class="collapse-icon">▼</span>
                    <h4 style="margin: 0; flex: 1;">${this.escapeHtml(spec.name)}</h4>
                    ${cardinalityBadge}
                    <span class="ifc-version-badge" style="background: #667eea; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; margin-right: 10px;">${ifcVersion}</span>
                    <span class="facet-count">${totalFacets} facets</span>
                    ${this.editMode ? `
                        <button class="edit-btn" onclick="event.stopPropagation(); idsEditorCore.editSpecification(${index})">✏️</button>
                        <button class="delete-btn" onclick="event.stopPropagation(); idsEditorCore.deleteSpecification(${index})">🗑️</button>
                    ` : ''}
                </div>
                <div class="collapsible-content">
                    ${spec.description ? `<p class="spec-description">${this.escapeHtml(spec.description)}</p>` : ''}
        `;

        // Applicability
        const applicabilityCount = spec.applicability ? spec.applicability.length : 0;
        html += '<div class="applicability-section collapsible-section">';
        html += `<h5 class="collapsible-header" onclick="idsEditorCore.toggleSection(this)">
            <span class="collapse-icon">▼</span>
            Applicability <span class="facet-count">(${applicabilityCount})</span>
        </h5>`;
        html += '<div class="collapsible-content">';
        if (spec.applicability && spec.applicability.length > 0) {
            spec.applicability.forEach((facet, facetIndex) => {
                html += this.renderFacet(facet, index, 'applicability', facetIndex);
            });
        } else {
            html += `<p class="empty-message">${t('editor.noApplicability')}</p>`;
        }
        if (this.editMode) {
            html += `<button class="add-facet-btn" onclick="idsEditorCore.addFacet(${index}, 'applicability')">${t('editor.addApplicability')}</button>`;
        }
        html += '</div>';
        html += '</div>';

        // Requirements
        const requirementsCount = spec.requirements ? spec.requirements.length : 0;
        html += '<div class="requirements-section collapsible-section">';
        html += `<h5 class="collapsible-header" onclick="idsEditorCore.toggleSection(this)">
            <span class="collapse-icon">▼</span>
            Requirements <span class="facet-count">(${requirementsCount})</span>
        </h5>`;
        html += '<div class="collapsible-content">';
        if (spec.requirements && spec.requirements.length > 0) {
            spec.requirements.forEach((facet, facetIndex) => {
                html += this.renderFacet(facet, index, 'requirements', facetIndex);
            });
        } else {
            html += `<p class="empty-message">${t('editor.noRequirements')}</p>`;
        }
        if (this.editMode) {
            html += `<button class="add-facet-btn" onclick="idsEditorCore.addFacet(${index}, 'requirements')">${t('editor.addRequirement')}</button>`;
        }
        html += '</div>';
        html += '</div>';

        html += '</div>'; // close collapsible-content
        html += '</div>'; // close specification-item
        return html;
    }

    /**
     * Render facet
     */
    renderFacet(facet, specIndex, section, facetIndex) {
        const icon = this.getFacetIcon(facet.type);
        // Show cardinality badge for requirements section (except entity which is always required)
        const showCardinality = section === 'requirements' && facet.type !== 'entity' && facet.cardinality;
        const cardinalityBadge = showCardinality ? this.getFacetCardinalityBadge(facet.cardinality) : '';
        const html = `
            <div class="facet-item ${facet.type}-facet" data-spec="${specIndex}" data-section="${section}" data-facet="${facetIndex}">
                <div class="facet-header">
                    <span class="facet-icon">${icon}</span>
                    <span class="facet-type">${facet.type.toUpperCase()}</span>
                    ${cardinalityBadge}
                    ${this.editMode ? `
                        <div class="edit-controls">
                            <button class="edit-btn" onclick="idsEditorCore.editFacet(${specIndex}, '${section}', ${facetIndex})">✏️</button>
                            <button class="delete-btn" onclick="idsEditorCore.deleteFacet(${specIndex}, '${section}', ${facetIndex})">🗑️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="facet-details">
                    ${this.renderFacetDetails(facet)}
                </div>
            </div>
        `;
        return html;
    }

    /**
     * Render facet details
     */
    renderFacetDetails(facet) {
        let html = '';

        Object.keys(facet).forEach(key => {
            // Skip type and cardinality (shown in header badge)
            if (key === 'type' || key === 'cardinality') {
                return;
            }

            const value = facet[key];
            if (typeof value === 'object') {
                html += `<div><strong>${key}:</strong> ${this.renderRestriction(value)}</div>`;
            } else {
                html += `<div><strong>${key}:</strong> ${this.escapeHtml(String(value))}</div>`;
            }
        });

        return html;
    }

    /**
     * Render restriction value
     */
    renderRestriction(restriction) {
        if (typeof restriction === 'string') {
            return this.escapeHtml(restriction);
        }

        if (!restriction) {
            return '';
        }

        // Handle both 'simpleValue' (editor) and 'simple' (parser) types
        if (restriction.type === 'simpleValue' || restriction.type === 'simple') {
            return this.escapeHtml(restriction.value || '');
        } else if (restriction.type === 'pattern' || (restriction.type === 'restriction' && restriction.pattern)) {
            const patternValue = restriction.value || restriction.pattern || '';
            return `<code>Pattern: ${this.escapeHtml(patternValue)}</code>`;
        } else if (restriction.type === 'enumeration' || (restriction.type === 'restriction' && restriction.enumeration)) {
            const values = restriction.values || restriction.enumeration || [];
            return `Enum: [${values.map(v => this.escapeHtml(v)).join(', ')}]`;
        } else if (restriction.type === 'bounds' || (restriction.type === 'restriction' && (restriction.minInclusive || restriction.maxInclusive))) {
            return `Bounds: ${restriction.minInclusive || '∞'} - ${restriction.maxInclusive || '∞'}`;
        }

        // Fallback - try to extract value
        if (restriction.value !== undefined) {
            return this.escapeHtml(String(restriction.value));
        }

        return JSON.stringify(restriction);
    }

    /**
     * Get facet icon
     */
    getFacetIcon(type) {
        const icons = {
            'entity': '🏢',
            'property': '📋',
            'attribute': '🏷️',
            'classification': '📚',
            'material': '🧱',
            'partOf': '🔗'
        };
        return icons[type] || '📄';
    }

    /**
     * Get cardinality badge HTML (for specifications)
     */
    getCardinalityBadge(cardinality) {
        const styles = {
            'required': 'background: #48bb78; color: white;',
            'optional': 'background: #ed8936; color: white;',
            'prohibited': 'background: #f56565; color: white;'
        };
        const labels = {
            'required': t('cardinality.required'),
            'optional': t('cardinality.optional'),
            'prohibited': t('cardinality.prohibited')
        };
        const style = styles[cardinality] || styles['required'];
        const label = labels[cardinality] || labels['required'];
        return `<span class="cardinality-badge" style="${style} padding: 4px 10px; border-radius: 12px; font-size: 0.8em; font-weight: 600; margin-right: 10px;">${label}</span>`;
    }

    /**
     * Get facet cardinality badge HTML (smaller, for facets)
     */
    getFacetCardinalityBadge(cardinality) {
        const styles = {
            'required': 'background: #48bb78; color: white;',
            'optional': 'background: #ed8936; color: white;',
            'prohibited': 'background: #f56565; color: white;'
        };
        const labels = {
            'required': 'REQ',
            'optional': 'OPT',
            'prohibited': 'PROH'
        };
        const titles = {
            'required': t('cardinality.facetRequiredDesc'),
            'optional': t('cardinality.facetOptionalDesc'),
            'prohibited': t('cardinality.facetProhibitedDesc')
        };
        const style = styles[cardinality] || styles['required'];
        const label = labels[cardinality] || labels['required'];
        const title = titles[cardinality] || '';
        return `<span class="facet-cardinality-badge" style="${style} padding: 2px 6px; border-radius: 8px; font-size: 0.7em; font-weight: 600; margin-left: 8px;" title="${title}">${label}</span>`;
    }

    /**
     * Toggle edit mode
     */
    toggleEditMode() {
        if (!this.idsData) {
            alert(t('editor.loadFirst'));
            return;
        }

        this.editMode = !this.editMode;

        if (this.editMode) {
            this.enableEditMode();
        } else {
            this.disableEditMode();
        }

        this.renderIDS();
    }

    /**
     * Enable edit mode
     */
    enableEditMode() {
        this.editMode = true;
        const btn = document.getElementById('toggleEditBtn');
        if (btn) {
            btn.textContent = t('editor.viewModeBtn');
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }
        document.body.classList.add('edit-mode');
    }

    /**
     * Disable edit mode
     */
    disableEditMode() {
        this.editMode = false;
        const btn = document.getElementById('toggleEditBtn');
        if (btn) {
            btn.textContent = t('editor.editModeBtn');
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
        document.body.classList.remove('edit-mode');
    }

    /**
     * Add specification
     */
    addSpecification() {
        idsEditorModals.showSpecificationModal({}, (specData) => {
            const newSpec = {
                name: specData.name,
                ifcVersion: specData.ifcVersion,
                description: specData.description,
                applicability: [],
                requirements: []
            };

            this.idsData.specifications.push(newSpec);
            this.hasUnsavedChanges = true;
            this.renderIDS();
        });
    }

    /**
     * Edit specification
     */
    editSpecification(index) {
        const spec = this.idsData.specifications[index];

        idsEditorModals.showSpecificationModal(spec, (specData) => {
            spec.name = specData.name;
            spec.ifcVersion = specData.ifcVersion;
            spec.description = specData.description;
            spec.minOccurs = specData.minOccurs;
            spec.maxOccurs = specData.maxOccurs;
            spec.cardinality = specData.cardinality;
            this.hasUnsavedChanges = true;
            this.renderIDS();
        });
    }

    /**
     * Delete specification
     */
    deleteSpecification(index) {
        if (!confirm(t('editor.confirmDeleteSpec'))) {
            return;
        }

        this.idsData.specifications.splice(index, 1);
        this.hasUnsavedChanges = true;
        this.renderIDS();
    }

    /**
     * Add facet to specification
     */
    addFacet(specIndex, section) {
        const spec = this.idsData.specifications[specIndex];
        const ifcVersion = spec.ifcVersion || 'IFC4';

        idsEditorModals.showFacetTypeSelector((facetData) => {
            this.idsData.specifications[specIndex][section].push(facetData);
            this.hasUnsavedChanges = true;
            this.renderIDS();
        }, ifcVersion, section);
    }

    /**
     * Edit facet
     */
    editFacet(specIndex, section, facetIndex) {
        const spec = this.idsData.specifications[specIndex];
        const facet = spec[section][facetIndex];
        const ifcVersion = spec.ifcVersion || 'IFC4';

        // Show appropriate form based on facet type
        idsEditorModals.currentFacetType = facet.type;
        idsEditorModals.currentIfcVersion = ifcVersion; // Set IFC version for modal
        idsEditorModals.currentSection = section; // Store section for cardinality
        idsEditorModals.currentCallback = (updatedFacet) => {
            this.idsData.specifications[specIndex][section][facetIndex] = updatedFacet;
            this.hasUnsavedChanges = true;
            this.renderIDS();
        };

        switch (facet.type) {
            case 'entity':
                idsEditorModals.showEntityForm(facet);
                break;
            case 'property':
                idsEditorModals.showPropertyForm(facet);
                break;
            case 'attribute':
                idsEditorModals.showAttributeForm(facet);
                break;
            case 'classification':
                idsEditorModals.showClassificationForm(facet);
                break;
            case 'material':
                idsEditorModals.showMaterialForm(facet);
                break;
            case 'partOf':
                idsEditorModals.showPartOfForm(facet);
                break;
        }

        idsEditorModals.openModal();
    }

    /**
     * Delete facet
     */
    deleteFacet(specIndex, section, facetIndex) {
        if (!confirm(t('editor.confirmDeleteFacet'))) {
            return;
        }

        this.idsData.specifications[specIndex][section].splice(facetIndex, 1);
        this.hasUnsavedChanges = true;
        this.renderIDS();
    }

    /**
     * Edit IDS info
     */
    editInfo() {
        // Create a simple form for editing info
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h2>Upravit IDS Information</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Title: <span style="color: red;">*</span></label>
                        <input type="text" id="editInfoTitle" value="${this.escapeHtml(this.idsData.title)}" required>
                        <small>${t('editor.requiredField')}</small>
                    </div>
                    <div class="form-group">
                        <label>Version:</label>
                        <input type="text" id="editInfoVersion" value="${this.escapeHtml(this.idsData.version || '')}" placeholder="${t('editor.example')} 1.0">
                    </div>
                    <div class="form-group">
                        <label>Author:</label>
                        <input type="text" id="editInfoAuthor" value="${this.escapeHtml(this.idsData.author || '')}" placeholder="${t('editor.authorName')}">
                    </div>
                    <div class="form-group">
                        <label>Date:</label>
                        <input type="date" id="editInfoDate" value="${this.idsData.date || ''}">
                    </div>
                    <div class="form-group">
                        <label>Copyright:</label>
                        <input type="text" id="editInfoCopyright" value="${this.escapeHtml(this.idsData.copyright || '')}" placeholder="Copyright">
                    </div>
                    <div class="form-group">
                        <label>Description:</label>
                        <textarea id="editInfoDescription" rows="3">${this.escapeHtml(this.idsData.description || '')}</textarea>
                        <small>${t('editor.purposeDesc')}</small>
                    </div>
                    <div class="form-group">
                        <label>Purpose:</label>
                        <textarea id="editInfoPurpose" rows="2">${this.escapeHtml(this.idsData.purpose || '')}</textarea>
                        <small>${t('editor.purposeUse')}</small>
                    </div>
                    <div class="form-group">
                        <label>Milestone:</label>
                        <input type="text" id="editInfoMilestone" value="${this.escapeHtml(this.idsData.milestone || '')}" placeholder="${t('editor.example')} Design, Construction, As-Built">
                        <small>${t('editor.projectPhase')}</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('editor.cancel')}</button>
                    <button class="btn btn-primary" onclick="idsEditorCore.saveInfo()">${t('editor.save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Save info changes
     */
    saveInfo() {
        const title = document.getElementById('editInfoTitle').value.trim();

        // Title is required
        if (!title) {
            alert(t('editor.titleRequired'));
            return;
        }

        this.idsData.title = title;
        this.idsData.version = document.getElementById('editInfoVersion').value.trim();
        this.idsData.author = document.getElementById('editInfoAuthor').value.trim();
        this.idsData.date = document.getElementById('editInfoDate').value;
        this.idsData.copyright = document.getElementById('editInfoCopyright').value.trim();
        this.idsData.description = document.getElementById('editInfoDescription').value.trim();
        this.idsData.purpose = document.getElementById('editInfoPurpose').value.trim();
        this.idsData.milestone = document.getElementById('editInfoMilestone').value.trim();

        this.hasUnsavedChanges = true;
        this.renderIDS();

        document.querySelector('.modal-overlay').remove();
    }

    /**
     * Download IDS
     */
    downloadIDS() {
        if (!this.idsData) {
            alert(t('editor.noDataToSave'));
            return;
        }

        const filename = (this.idsData.title || 'specification').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ids';
        this.xmlGenerator.downloadIDS(this.idsData, filename);
        this.hasUnsavedChanges = false;
        this.showMessage(t('editor.idsDownloaded'), 'success');
    }

    /**
     * Show message
     */
    showMessage(text, type = 'success') {
        const message = document.createElement('div');
        message.className = `message-box ${type}`;
        message.textContent = text;
        message.style.position = 'fixed';
        message.style.top = '20px';
        message.style.right = '20px';
        message.style.zIndex = '10000';
        message.style.minWidth = '200px';

        document.body.appendChild(message);

        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    /**
     * Toggle collapsible section
     */
    toggleSection(headerElement) {
        const section = headerElement.closest('.collapsible-section');
        const content = section.querySelector('.collapsible-content');
        const icon = headerElement.querySelector('.collapse-icon');

        if (section.classList.contains('collapsed')) {
            section.classList.remove('collapsed');
            icon.textContent = '▼';
        } else {
            section.classList.add('collapsed');
            icon.textContent = '▶';
        }
    }

    /**
     * Collapse all sections
     */
    collapseAll() {
        const sections = document.querySelectorAll('.collapsible-section');
        sections.forEach(section => {
            const icon = section.querySelector('.collapse-icon');
            section.classList.add('collapsed');
            if (icon) {
                icon.textContent = '▶';
            }
        });
    }

    /**
     * Expand all sections
     */
    expandAll() {
        const sections = document.querySelectorAll('.collapsible-section');
        sections.forEach(section => {
            const icon = section.querySelector('.collapse-icon');
            section.classList.remove('collapsed');
            if (icon) {
                icon.textContent = '▼';
            }
        });
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
window.idsEditorCore = new IDSEditorCore();
