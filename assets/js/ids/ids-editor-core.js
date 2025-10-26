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
            if (!confirm('Máte neuložené změny. Opravdu chcete vytvořit nový IDS?')) {
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
        this.showMessage('Nový IDS byl vytvořen', 'success');
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
            idsData.specifications = parsed.specifications.map(spec => ({
                name: spec.name,
                ifcVersion: spec.ifcVersion || '',
                identifier: spec.identifier || '',
                description: spec.description || '',
                instructions: spec.instructions || '',
                minOccurs: spec.minOccurs,
                maxOccurs: spec.maxOccurs,
                applicability: this.convertFacets(spec.applicability),
                requirements: this.convertFacets(spec.requirements)
            }));
        }

        return idsData;
    }

    /**
     * Convert facets to editor format
     */
    convertFacets(facets) {
        if (!facets || !Array.isArray(facets)) return [];

        return facets.map(facet => {
            // Convert parser format to editor format
            const converted = {
                type: facet.type || this.detectFacetType(facet)
            };

            // Convert all properties that might be value objects
            Object.keys(facet).forEach(key => {
                if (key === 'type') return;

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
        if (facet.name && facet.predefinedType !== undefined) return 'entity';
        if (facet.propertySet) return 'property';
        if (facet.name && !facet.propertySet) return 'attribute';
        if (facet.system) return 'classification';
        if (facet.value && Object.keys(facet).length <= 2) return 'material';
        if (facet.entity) return 'partOf';
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

        console.log('Rendering into container:', container);

        let html = '<div class="ids-structure">';

        // Render info section
        html += this.renderInfoSection();

        // Render specifications
        html += '<div class="specifications-container">';
        html += '<h3>Specifications</h3>';

        if (this.idsData.specifications.length === 0) {
            html += '<p class="empty-message">Žádné specifikace. Klikněte na "Editační režim" a přidejte novou.</p>';
        } else {
            this.idsData.specifications.forEach((spec, index) => {
                html += this.renderSpecification(spec, index);
            });
        }

        if (this.editMode) {
            html += '<button class="add-facet-btn" onclick="idsEditorCore.addSpecification()">+ Přidat specifikaci</button>';
        }

        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
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
        if (info.version) html += `<div><strong>Version:</strong> ${this.escapeHtml(info.version)}</div>`;
        if (info.author) html += `<div><strong>Author:</strong> ${this.escapeHtml(info.author)}</div>`;
        if (info.date) html += `<div><strong>Date:</strong> ${this.escapeHtml(info.date)}</div>`;
        if (info.copyright) html += `<div><strong>Copyright:</strong> ${this.escapeHtml(info.copyright)}</div>`;
        if (info.description) html += `<div><strong>Description:</strong> ${this.escapeHtml(info.description)}</div>`;
        if (info.purpose) html += `<div><strong>Purpose:</strong> ${this.escapeHtml(info.purpose)}</div>`;
        if (info.milestone) html += `<div><strong>Milestone:</strong> ${this.escapeHtml(info.milestone)}</div>`;

        html += '</div>';

        if (this.editMode) {
            html += '<button class="btn btn-secondary" onclick="idsEditorCore.editInfo()">✏️ Upravit info</button>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Render specification
     */
    renderSpecification(spec, index) {
        let html = `
            <div class="specification-item" data-index="${index}">
                <div class="spec-header">
                    <h4>${this.escapeHtml(spec.name)}</h4>
                    ${this.editMode ? `
                        <div class="edit-controls">
                            <button class="edit-btn" onclick="idsEditorCore.editSpecification(${index})">✏️ Upravit</button>
                            <button class="delete-btn" onclick="idsEditorCore.deleteSpecification(${index})">🗑️ Smazat</button>
                        </div>
                    ` : ''}
                </div>
                ${spec.description ? `<p class="spec-description">${this.escapeHtml(spec.description)}</p>` : ''}
        `;

        // Applicability
        html += '<div class="applicability-section">';
        html += '<h5>Applicability</h5>';
        if (spec.applicability && spec.applicability.length > 0) {
            spec.applicability.forEach((facet, facetIndex) => {
                html += this.renderFacet(facet, index, 'applicability', facetIndex);
            });
        } else {
            html += '<p class="empty-message">Žádné applicability facety</p>';
        }
        if (this.editMode) {
            html += `<button class="add-facet-btn" onclick="idsEditorCore.addFacet(${index}, 'applicability')">+ Přidat applicability</button>`;
        }
        html += '</div>';

        // Requirements
        html += '<div class="requirements-section">';
        html += '<h5>Requirements</h5>';
        if (spec.requirements && spec.requirements.length > 0) {
            spec.requirements.forEach((facet, facetIndex) => {
                html += this.renderFacet(facet, index, 'requirements', facetIndex);
            });
        } else {
            html += '<p class="empty-message">Žádné requirements facety</p>';
        }
        if (this.editMode) {
            html += `<button class="add-facet-btn" onclick="idsEditorCore.addFacet(${index}, 'requirements')">+ Přidat requirement</button>`;
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    /**
     * Render facet
     */
    renderFacet(facet, specIndex, section, facetIndex) {
        const icon = this.getFacetIcon(facet.type);
        let html = `
            <div class="facet-item ${facet.type}-facet" data-spec="${specIndex}" data-section="${section}" data-facet="${facetIndex}">
                <div class="facet-header">
                    <span class="facet-icon">${icon}</span>
                    <span class="facet-type">${facet.type.toUpperCase()}</span>
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
            if (key === 'type') return;

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

        if (restriction.type === 'simpleValue') {
            return this.escapeHtml(restriction.value);
        } else if (restriction.type === 'pattern') {
            return `<code>Pattern: ${this.escapeHtml(restriction.value)}</code>`;
        } else if (restriction.type === 'enumeration') {
            return `Enum: [${restriction.values.map(v => this.escapeHtml(v)).join(', ')}]`;
        } else if (restriction.type === 'bounds') {
            return `Bounds: ${restriction.minInclusive || '∞'} - ${restriction.maxInclusive || '∞'}`;
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
     * Toggle edit mode
     */
    toggleEditMode() {
        if (!this.idsData) {
            alert('Nejprve nahrajte IDS soubor nebo vytvořte nový.');
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
            btn.textContent = '👁️ Režim zobrazení';
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
            btn.textContent = '✏️ Editační režim';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
        document.body.classList.remove('edit-mode');
    }

    /**
     * Add specification
     */
    addSpecification() {
        const name = prompt('Název specifikace:');
        if (!name) return;

        const newSpec = {
            name: name,
            ifcVersion: 'IFC4',
            description: '',
            applicability: [],
            requirements: []
        };

        this.idsData.specifications.push(newSpec);
        this.hasUnsavedChanges = true;
        this.renderIDS();
    }

    /**
     * Edit specification
     */
    editSpecification(index) {
        const spec = this.idsData.specifications[index];
        const name = prompt('Název specifikace:', spec.name);
        if (name === null) return;

        spec.name = name;
        this.hasUnsavedChanges = true;
        this.renderIDS();
    }

    /**
     * Delete specification
     */
    deleteSpecification(index) {
        if (!confirm('Opravdu chcete smazat tuto specifikaci?')) return;

        this.idsData.specifications.splice(index, 1);
        this.hasUnsavedChanges = true;
        this.renderIDS();
    }

    /**
     * Add facet to specification
     */
    addFacet(specIndex, section) {
        idsEditorModals.showFacetTypeSelector((facetData) => {
            this.idsData.specifications[specIndex][section].push(facetData);
            this.hasUnsavedChanges = true;
            this.renderIDS();
        });
    }

    /**
     * Edit facet
     */
    editFacet(specIndex, section, facetIndex) {
        const facet = this.idsData.specifications[specIndex][section][facetIndex];

        // Show appropriate form based on facet type
        idsEditorModals.currentFacetType = facet.type;
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
        if (!confirm('Opravdu chcete smazat tento facet?')) return;

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
                        <small>Povinné pole</small>
                    </div>
                    <div class="form-group">
                        <label>Version:</label>
                        <input type="text" id="editInfoVersion" value="${this.escapeHtml(this.idsData.version || '')}" placeholder="např. 1.0">
                    </div>
                    <div class="form-group">
                        <label>Author:</label>
                        <input type="text" id="editInfoAuthor" value="${this.escapeHtml(this.idsData.author || '')}" placeholder="Jméno autora">
                    </div>
                    <div class="form-group">
                        <label>Date:</label>
                        <input type="date" id="editInfoDate" value="${this.idsData.date || ''}">
                    </div>
                    <div class="form-group">
                        <label>Copyright:</label>
                        <input type="text" id="editInfoCopyright" value="${this.escapeHtml(this.idsData.copyright || '')}" placeholder="Copyright informace">
                    </div>
                    <div class="form-group">
                        <label>Description:</label>
                        <textarea id="editInfoDescription" rows="3">${this.escapeHtml(this.idsData.description || '')}</textarea>
                        <small>Popis účelu IDS specifikace</small>
                    </div>
                    <div class="form-group">
                        <label>Purpose:</label>
                        <textarea id="editInfoPurpose" rows="2">${this.escapeHtml(this.idsData.purpose || '')}</textarea>
                        <small>Účel použití této specifikace</small>
                    </div>
                    <div class="form-group">
                        <label>Milestone:</label>
                        <input type="text" id="editInfoMilestone" value="${this.escapeHtml(this.idsData.milestone || '')}" placeholder="např. Design, Construction, As-Built">
                        <small>Fáze projektu</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušit</button>
                    <button class="btn btn-primary" onclick="idsEditorCore.saveInfo()">Uložit</button>
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

        // Title je povinné
        if (!title) {
            alert('Title je povinné pole!');
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
            alert('Žádná data k uložení.');
            return;
        }

        const filename = (this.idsData.title || 'specification').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ids';
        this.xmlGenerator.downloadIDS(this.idsData, filename);
        this.hasUnsavedChanges = false;
        this.showMessage('IDS byl stažen', 'success');
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
