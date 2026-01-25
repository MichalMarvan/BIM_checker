/**
 * BIM Checker - Wizard Steps Definition
 * Defines steps and help content for each page
 */

/* global switchTab */

const WIZARD_STEPS = {
    // ========================================
    // INDEX PAGE
    // ========================================
    index: {
        id: 'index',
        title: 'wizard.index.title',
        steps: [
            {
                id: 'ifc-storage',
                target: '.storage-card:first-child',
                title: 'wizard.index.ifcStorage.title',
                content: 'wizard.index.ifcStorage.content',
                icon: '📁',
                position: 'right',
                required: false,
                blockInteraction: true
            },
            {
                id: 'ids-storage',
                target: '.storage-card:last-child',
                title: 'wizard.index.idsStorage.title',
                content: 'wizard.index.idsStorage.content',
                icon: '📋',
                position: 'left',
                required: false,
                blockInteraction: true
            },
            {
                id: 'upload-file',
                target: '#ifcUploadBtn',
                title: 'wizard.index.upload.title',
                content: 'wizard.index.upload.content',
                icon: '⬆️',
                position: 'bottom',
                required: true,
                blockInteraction: 'outside',
                waitFor: {
                    event: 'storage:fileAdded',
                    timeout: null
                },
                waitingLabel: 'wizard.index.upload.waiting'
            },
            {
                id: 'new-folder',
                target: '#ifcNewFolderBtn',
                title: 'wizard.index.folder.title',
                content: 'wizard.index.folder.content',
                icon: '📂',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'tool-viewer',
                target: '.tool-card-modern:nth-child(1)',
                title: 'wizard.index.viewer.title',
                content: 'wizard.index.viewer.content',
                icon: '👁️',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'tool-parser',
                target: '.tool-card-modern:nth-child(2)',
                title: 'wizard.index.parser.title',
                content: 'wizard.index.parser.content',
                icon: '📝',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'tool-validator',
                target: '.tool-card-modern:nth-child(3)',
                title: 'wizard.index.validator.title',
                content: 'wizard.index.validator.content',
                icon: '✅',
                position: 'bottom',
                required: false,
                blockInteraction: true
            }
        ]
    },

    // ========================================
    // IFC VIEWER PAGE
    // ========================================
    viewer: {
        id: 'viewer',
        title: 'wizard.viewer.title',
        steps: [
            {
                id: 'drag-drop',
                target: '#uploadArea',
                title: 'wizard.viewer.dragDrop.title',
                content: 'wizard.viewer.dragDrop.content',
                icon: '📥',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'storage-btn',
                target: '#loadFromStorageBtn',
                title: 'wizard.viewer.storageBtn.title',
                content: 'wizard.viewer.storageBtn.content',
                icon: '📁',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'load-files',
                target: '.upload-section',
                title: 'wizard.viewer.load.title',
                content: 'wizard.viewer.load.content',
                icon: '📂',
                position: 'right',
                required: true,
                hideButtons: true, // Hide Next/Prev - auto-continues when file loads
                waitFor: {
                    event: 'ifc:fileSelected',
                    timeout: null
                },
                // Special: when storage modal opens, show sub-steps
                modalTrigger: {
                    modalSelector: '#storagePickerModal',
                    subSteps: [
                        {
                            id: 'storage-tree',
                            target: '#storageFileTree',
                            title: 'wizard.viewer.storageTree.title',
                            content: 'wizard.viewer.storageTree.content',
                            icon: '🌳',
                            position: 'left',
                            blockInteraction: 'outside',
                            // Check if IFC files exist in tree
                            validate: {
                                selector: '#storageFileTree .storage-file-item',
                                errorKey: 'wizard.viewer.storageTree.noFiles'
                            }
                        },
                        {
                            id: 'storage-selection',
                            target: '.selected-files-info',
                            title: 'wizard.viewer.storageSelection.title',
                            content: 'wizard.viewer.storageSelection.content',
                            icon: '☑️',
                            position: 'top',
                            blockInteraction: 'outside',
                            // Require at least one file selected
                            validate: {
                                type: 'selectedCount',
                                selector: '#selectedFilesCount',
                                minValue: 1,
                                errorKey: 'wizard.viewer.storageSelection.noSelection'
                            }
                        },
                        {
                            id: 'storage-confirm',
                            target: '#storagePickerModal .modal-footer .btn-primary',
                            title: 'wizard.viewer.storageConfirm.title',
                            content: 'wizard.viewer.storageConfirm.content',
                            icon: '✅',
                            position: 'top',
                            clickOnNext: true // Click target when Next is pressed
                        }
                    ]
                }
            },
            {
                id: 'search',
                target: '#searchInput',
                title: 'wizard.viewer.search.title',
                content: 'wizard.viewer.search.content',
                icon: '🔍',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'filters',
                target: '#entityFilter',
                title: 'wizard.viewer.filters.title',
                content: 'wizard.viewer.filters.content',
                icon: '🎯',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'pagination',
                target: '.pagination-controls',
                title: 'wizard.viewer.pagination.title',
                content: 'wizard.viewer.pagination.content',
                icon: '📄',
                position: 'top',
                required: false,
                blockInteraction: true
            },
            {
                id: 'spatial-tree',
                target: '#toggleSpatialTreeBtn',
                title: 'wizard.viewer.spatialTree.title',
                content: 'wizard.viewer.spatialTree.content',
                icon: '🌳',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'pset-columns',
                target: '#columnManagerBtn',
                title: 'wizard.viewer.psets.title',
                content: 'wizard.viewer.psets.content',
                icon: '📑',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'edit-mode',
                target: '#toggleEditModeBtn',
                title: 'wizard.viewer.editMode.title',
                content: 'wizard.viewer.editMode.content',
                icon: '✏️',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'export-csv',
                target: '#exportBtn',
                title: 'wizard.viewer.export.title',
                content: 'wizard.viewer.export.content',
                icon: '💾',
                position: 'bottom',
                required: false,
                blockInteraction: true
            }
        ]
    },

    // ========================================
    // IDS PARSER PAGE
    // ========================================
    parser: {
        id: 'parser',
        title: 'wizard.parser.title',
        steps: [
            {
                id: 'drag-drop',
                target: '#fileUploadArea',
                title: 'wizard.parser.dragDrop.title',
                content: 'wizard.parser.dragDrop.content',
                icon: '📥',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'sample-btn',
                target: '.btn-primary[data-i18n="parser.loadSample"]',
                title: 'wizard.parser.sample.title',
                content: 'wizard.parser.sample.content',
                icon: '📋',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'storage-btn',
                target: '.btn-success[data-i18n="parser.loadFromStorage"]',
                title: 'wizard.parser.storageBtn.title',
                content: 'wizard.parser.storageBtn.content',
                icon: '📁',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'load-file',
                target: '#loadOptionsContainer',
                title: 'wizard.parser.load.title',
                content: 'wizard.parser.load.content',
                icon: '📂',
                position: 'right',
                required: true,
                hideButtons: true,
                waitFor: {
                    event: 'ids:loaded',
                    timeout: null
                },
                modalTrigger: {
                    modalSelector: '#idsStorageModal',
                    subSteps: [
                        {
                            id: 'storage-tree',
                            target: '#idsStorageFileTree',
                            title: 'wizard.parser.storageTree.title',
                            content: 'wizard.parser.storageTree.content',
                            icon: '🌳',
                            position: 'left',
                            blockInteraction: 'outside',
                            validate: {
                                selector: '#idsStorageFileTree .tree-file-item',
                                errorKey: 'wizard.parser.storageTree.noFiles'
                            }
                        },
                        {
                            id: 'storage-selection',
                            target: '#idsStorageModal .selected-files-info',
                            title: 'wizard.parser.storageSelection.title',
                            content: 'wizard.parser.storageSelection.content',
                            icon: '☑️',
                            position: 'top',
                            blockInteraction: 'outside',
                            validate: {
                                selector: '#selectedIdsFileName.file-selected',
                                errorKey: 'wizard.parser.storageSelection.noSelection'
                            }
                        },
                        {
                            id: 'storage-confirm',
                            target: '#idsStorageModal .modal-footer .btn-primary',
                            title: 'wizard.parser.storageConfirm.title',
                            content: 'wizard.parser.storageConfirm.content',
                            icon: '✅',
                            position: 'top',
                            clickOnNext: true
                        }
                    ]
                }
            },
            {
                id: 'ids-info',
                target: '#idsInfo',
                title: 'wizard.parser.idsInfo.title',
                content: 'wizard.parser.idsInfo.content',
                icon: 'ℹ️',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'specifications',
                target: '#specificationsContainer',
                title: 'wizard.parser.specifications.title',
                content: 'wizard.parser.specifications.content',
                icon: '📋',
                position: 'top',
                required: false,
                blockInteraction: true,
                beforeShow: () => {
                    // Ensure visual tab is active
                    if (typeof switchTab === 'function') {
                        switchTab('visual');
                    }
                    // First restore any previously hidden elements
                    document.querySelectorAll('[data-wizard-hidden]').forEach(el => {
                        el.style.display = '';
                        delete el.dataset.wizardHidden;
                    });
                    // Collapse all cards and hide those beyond first 2 for smaller container
                    const cards = document.querySelectorAll('.specification-card');
                    cards.forEach((card, index) => {
                        // Collapse all
                        if (!card.classList.contains('collapsed')) {
                            card.classList.add('collapsed');
                        }
                        // Hide cards beyond first 2 to make container smaller
                        if (index >= 2) {
                            card.dataset.wizardHidden = 'true';
                            card.style.display = 'none';
                        }
                    });
                    // Scroll container into view with room for tooltip above
                    const container = document.querySelector('#specificationsContainer');
                    if (container) {
                        container.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }
                }
            },
            {
                id: 'spec-content',
                target: '.specification-card:not(.collapsed)',
                title: 'wizard.parser.specContent.title',
                content: 'wizard.parser.specContent.content',
                icon: '📝',
                position: 'top',
                required: false,
                blockInteraction: true,
                beforeShow: () => {
                    // Ensure visual tab is active
                    if (typeof switchTab === 'function') {
                        switchTab('visual');
                    }
                    // Hide all specs except first, expand first, limit facets
                    const cards = document.querySelectorAll('.specification-card');
                    cards.forEach((card, index) => {
                        if (index === 0) {
                            // Expand first card
                            card.classList.remove('collapsed');
                            // Hide extra facets (keep only first in each section)
                            card.querySelectorAll('.facet-section').forEach(section => {
                                const facets = section.querySelectorAll('.facet-item');
                                facets.forEach((facet, fIndex) => {
                                    if (fIndex > 0) {
                                        facet.dataset.wizardHidden = 'true';
                                        facet.style.display = 'none';
                                    }
                                });
                            });
                            // Scroll card into view with room for tooltip above
                            card.scrollIntoView({ behavior: 'instant', block: 'center' });
                        } else {
                            // Hide other cards
                            card.dataset.wizardHidden = 'true';
                            card.style.display = 'none';
                        }
                    });
                },
            },
            {
                id: 'ifc-version',
                target: '.specification-card:not(.collapsed) .spec-badge',
                title: 'wizard.parser.ifcVersion.title',
                content: 'wizard.parser.ifcVersion.content',
                icon: '🏷️',
                position: 'left',
                required: false,
                blockInteraction: true
            },
            {
                id: 'applicability-section',
                target: '.specification-card:not(.collapsed) .facet-section:first-of-type',
                title: 'wizard.parser.applicability.title',
                content: 'wizard.parser.applicability.content',
                icon: '✓',
                position: 'right',
                required: false,
                blockInteraction: true
            },
            {
                id: 'requirements-section',
                target: '.specification-card:not(.collapsed) .facet-section:last-of-type',
                title: 'wizard.parser.requirements.title',
                content: 'wizard.parser.requirements.content',
                icon: '❗',
                position: 'right',
                required: false,
                blockInteraction: true,
                afterHide: () => {
                    // Restore all hidden elements when leaving visual tab steps
                    document.querySelectorAll('[data-wizard-hidden]').forEach(el => {
                        el.style.display = '';
                        delete el.dataset.wizardHidden;
                    });
                }
            },
            // Tree tab skipped - focus on editor instead
            {
                id: 'tab-editor',
                target: '.tab[onclick*="editor"]',
                title: 'wizard.parser.tabEditor.title',
                content: 'wizard.parser.tabEditor.content',
                icon: '✏️',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'create-new',
                target: '#createNewIdsBtn',
                title: 'wizard.parser.createNew.title',
                content: 'wizard.parser.createNew.content',
                icon: '✨',
                position: 'bottom',
                required: false,
                blockInteraction: true,
                beforeShow: () => {
                    // Ensure editor tab is active
                    if (typeof switchTab === 'function') {
                        switchTab('editor');
                    }
                }
            },
            {
                id: 'edit-mode',
                target: '#toggleEditBtn',
                title: 'wizard.parser.editMode.title',
                content: 'wizard.parser.editMode.content',
                icon: '✏️',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'download-ids',
                target: '#downloadIdsBtn',
                title: 'wizard.parser.download.title',
                content: 'wizard.parser.download.content',
                icon: '💾',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'editor-specs-list',
                target: '#editorTab .specifications-container',
                title: 'wizard.parser.editorSpecsList.title',
                content: 'wizard.parser.editorSpecsList.content',
                icon: '📋',
                position: 'left',
                required: false,
                blockInteraction: true,
                beforeShow: () => {
                    // Ensure editor tab is active
                    if (typeof switchTab === 'function') {
                        switchTab('editor');
                    }
                    // Restore any previously hidden elements
                    document.querySelectorAll('[data-wizard-hidden]').forEach(el => {
                        el.style.display = '';
                        delete el.dataset.wizardHidden;
                    });
                    // Collapse all specs and show only first 2
                    const specs = document.querySelectorAll('#editorTab .specification-item');
                    specs.forEach((spec, index) => {
                        // Collapse all
                        spec.classList.add('collapsed');
                        const content = spec.querySelector(':scope > .collapsible-content');
                        if (content) content.style.display = 'none';
                        const icon = spec.querySelector('.collapse-icon');
                        if (icon) icon.textContent = '▶';
                        // Hide specs beyond first 2
                        if (index >= 2) {
                            spec.dataset.wizardHidden = 'true';
                            spec.style.display = 'none';
                        }
                    });
                }
            },
            {
                id: 'editor-spec-detail',
                target: '#editorTab .specification-item:not(.collapsed)',
                title: 'wizard.parser.editorSpecDetail.title',
                content: 'wizard.parser.editorSpecDetail.content',
                icon: '🔍',
                position: 'left',
                required: false,
                blockInteraction: true,
                beforeShow: () => {
                    // Show 2 specs: first expanded with limited facets, second collapsed
                    const specs = document.querySelectorAll('#editorTab .specification-item');
                    specs.forEach((spec, index) => {
                        if (index === 0) {
                            // Expand first spec
                            spec.classList.remove('collapsed');
                            const content = spec.querySelector(':scope > .collapsible-content');
                            if (content) content.style.display = 'block';
                            const icon = spec.querySelector('.collapse-icon');
                            if (icon) icon.textContent = '▼';

                            // Expand and limit Applicability section
                            const applicability = spec.querySelector('.applicability-section');
                            if (applicability) {
                                applicability.classList.remove('collapsed');
                                const appContent = applicability.querySelector('.collapsible-content');
                                if (appContent) appContent.style.display = 'block';
                                // Hide all but first facet
                                const facets = applicability.querySelectorAll('.facet-item');
                                facets.forEach((f, i) => {
                                    if (i > 0) {
                                        f.dataset.wizardHidden = 'true';
                                        f.style.display = 'none';
                                    }
                                });
                            }

                            // Expand and limit Requirements section
                            const requirements = spec.querySelector('.requirements-section');
                            if (requirements) {
                                requirements.classList.remove('collapsed');
                                const reqContent = requirements.querySelector('.collapsible-content');
                                if (reqContent) reqContent.style.display = 'block';
                                // Hide all but first facet
                                const facets = requirements.querySelectorAll('.facet-item');
                                facets.forEach((f, i) => {
                                    if (i > 0) {
                                        f.dataset.wizardHidden = 'true';
                                        f.style.display = 'none';
                                    }
                                });
                            }
                            // Scroll into view
                            spec.scrollIntoView({ behavior: 'instant', block: 'center' });
                        } else if (index === 1) {
                            // Keep second spec visible but collapsed
                            spec.classList.add('collapsed');
                            const content = spec.querySelector(':scope > .collapsible-content');
                            if (content) content.style.display = 'none';
                            const icon = spec.querySelector('.collapse-icon');
                            if (icon) icon.textContent = '▶';
                            spec.style.display = '';
                            delete spec.dataset.wizardHidden;
                        } else {
                            // Hide other specs
                            spec.dataset.wizardHidden = 'true';
                            spec.style.display = 'none';
                        }
                    });
                },
                afterHide: () => {
                    // Restore all hidden elements
                    document.querySelectorAll('[data-wizard-hidden]').forEach(el => {
                        el.style.display = '';
                        delete el.dataset.wizardHidden;
                    });
                    // Restore collapsible content
                    document.querySelectorAll('#editorTab .specification-item').forEach(spec => {
                        spec.classList.remove('collapsed');
                        const content = spec.querySelector(':scope > .collapsible-content');
                        if (content) content.style.display = '';
                    });
                }
            }
        ]
    },

    // ========================================
    // VALIDATOR PAGE
    // ========================================
    validator: {
        id: 'validator',
        title: 'wizard.validator.title',
        steps: [
            {
                id: 'add-group',
                target: '.upload-section .btn-success',
                title: 'wizard.validator.addGroup.title',
                content: 'wizard.validator.addGroup.content',
                icon: '➕',
                position: 'bottom',
                required: true,
                hideButtons: true,
                blockInteraction: 'outside',
                waitFor: {
                    event: 'validator:groupAdded',
                    timeout: null
                }
            },
            {
                id: 'ifc-section',
                target: '.validation-group .group-section:first-child',
                title: 'wizard.validator.ifcSection.title',
                content: 'wizard.validator.ifcSection.content',
                icon: '📦',
                position: 'right',
                required: false,
                blockInteraction: true
            },
            {
                id: 'load-ifc',
                target: '.validation-group .group-section:first-child',
                title: 'wizard.validator.loadIfc.title',
                content: 'wizard.validator.loadIfc.content',
                icon: '📁',
                position: 'right',
                required: true,
                hideButtons: true,
                waitFor: {
                    event: 'validator:ifcLoaded',
                    timeout: null
                },
                modalTrigger: {
                    modalSelector: '#ifcStorageModal',
                    subSteps: [
                        {
                            id: 'ifc-storage-tree',
                            target: '#ifcStorageTree',
                            title: 'wizard.validator.ifcStorageTree.title',
                            content: 'wizard.validator.ifcStorageTree.content',
                            icon: '🌳',
                            position: 'left',
                            blockInteraction: 'outside',
                            validate: {
                                selector: '#ifcStorageTree .tree-file-item',
                                errorKey: 'wizard.validator.ifcStorageTree.noFiles'
                            }
                        },
                        {
                            id: 'ifc-storage-selection',
                            target: '#ifcStorageModal .selected-files-info',
                            title: 'wizard.validator.ifcStorageSelection.title',
                            content: 'wizard.validator.ifcStorageSelection.content',
                            icon: '☑️',
                            position: 'top',
                            blockInteraction: 'outside',
                            validate: {
                                type: 'selectedCount',
                                selector: '#ifcSelectedCount',
                                minValue: 1,
                                errorKey: 'wizard.validator.ifcStorageSelection.noSelection'
                            }
                        },
                        {
                            id: 'ifc-storage-confirm',
                            target: '#ifcStorageModal .modal-footer .btn-primary',
                            title: 'wizard.validator.ifcStorageConfirm.title',
                            content: 'wizard.validator.ifcStorageConfirm.content',
                            icon: '✅',
                            position: 'top',
                            clickOnNext: true
                        }
                    ]
                }
            },
            {
                id: 'ids-section',
                target: '.validation-group .group-section:last-child',
                title: 'wizard.validator.idsSection.title',
                content: 'wizard.validator.idsSection.content',
                icon: '📋',
                position: 'left',
                required: false,
                blockInteraction: true
            },
            {
                id: 'load-ids',
                target: '.validation-group .group-section:last-child',
                title: 'wizard.validator.loadIds.title',
                content: 'wizard.validator.loadIds.content',
                icon: '📋',
                position: 'left',
                required: true,
                hideButtons: true,
                waitFor: {
                    event: 'validator:idsLoaded',
                    timeout: null
                },
                modalTrigger: {
                    modalSelector: '#idsStorageModal',
                    subSteps: [
                        {
                            id: 'ids-storage-tree',
                            target: '#idsStorageTree',
                            title: 'wizard.validator.idsStorageTree.title',
                            content: 'wizard.validator.idsStorageTree.content',
                            icon: '🌳',
                            position: 'left',
                            blockInteraction: 'outside',
                            validate: {
                                selector: '#idsStorageTree .tree-file-item',
                                errorKey: 'wizard.validator.idsStorageTree.noFiles'
                            }
                        },
                        {
                            id: 'ids-storage-selection',
                            target: '#idsStorageModal .selected-files-info',
                            title: 'wizard.validator.idsStorageSelection.title',
                            content: 'wizard.validator.idsStorageSelection.content',
                            icon: '☑️',
                            position: 'top',
                            blockInteraction: 'outside',
                            validate: {
                                selector: '#idsSelectedName.file-selected',
                                errorKey: 'wizard.validator.idsStorageSelection.noSelection'
                            }
                        },
                        {
                            id: 'ids-storage-confirm',
                            target: '#idsStorageModal .modal-footer .btn-primary',
                            title: 'wizard.validator.idsStorageConfirm.title',
                            content: 'wizard.validator.idsStorageConfirm.content',
                            icon: '✅',
                            position: 'top',
                            clickOnNext: true
                        }
                    ]
                }
            },
            {
                id: 'validate-btn',
                target: '#validateBtn',
                title: 'wizard.validator.validate.title',
                content: 'wizard.validator.validate.content',
                icon: '▶️',
                position: 'top',
                required: true,
                blockInteraction: 'outside',
                clickOnNext: true,
                hideButtons: true,
                waitFor: {
                    event: 'validator:complete',
                    timeout: null
                },
                waitingLabel: 'wizard.validator.validate.waiting',
                beforeShow: () => {
                    const btn = document.querySelector('#validateBtn');
                    if (btn) {
                        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }
                }
            },
            {
                id: 'results',
                target: '#resultsSection',
                title: 'wizard.validator.results.title',
                content: 'wizard.validator.results.content',
                icon: '📊',
                position: 'top',
                required: false,
                blockInteraction: true
            },
            {
                id: 'results-stats',
                target: '.results-stats',
                title: 'wizard.validator.resultsStats.title',
                content: 'wizard.validator.resultsStats.content',
                icon: '📈',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'filters',
                target: '.filters-section',
                title: 'wizard.validator.filter.title',
                content: 'wizard.validator.filter.content',
                icon: '🔍',
                position: 'bottom',
                required: false,
                blockInteraction: true
            },
            {
                id: 'export-xlsx',
                target: '#exportBtn',
                title: 'wizard.validator.export.title',
                content: 'wizard.validator.export.content',
                icon: '📥',
                position: 'bottom',
                required: false,
                blockInteraction: true
            }
        ]
    }
};

// ========================================
// HELP CONTENT FOR SIDEBAR
// ========================================
const WIZARD_HELP = {
    index: {
        about: 'wizard.help.index.about',
        faq: [
            {
                question: 'wizard.help.index.faq1.q',
                answer: 'wizard.help.index.faq1.a'
            },
            {
                question: 'wizard.help.index.faq2.q',
                answer: 'wizard.help.index.faq2.a'
            },
            {
                question: 'wizard.help.index.faq3.q',
                answer: 'wizard.help.index.faq3.a'
            }
        ],
        shortcuts: []
    },

    viewer: {
        about: 'wizard.help.viewer.about',
        faq: [
            {
                question: 'wizard.help.viewer.faq1.q',
                answer: 'wizard.help.viewer.faq1.a'
            },
            {
                question: 'wizard.help.viewer.faq2.q',
                answer: 'wizard.help.viewer.faq2.a'
            },
            {
                question: 'wizard.help.viewer.faq3.q',
                answer: 'wizard.help.viewer.faq3.a'
            },
            {
                question: 'wizard.help.viewer.faq4.q',
                answer: 'wizard.help.viewer.faq4.a'
            }
        ],
        shortcuts: [
            { key: 'Ctrl+F', action: 'wizard.help.viewer.shortcut.search' },
            { key: 'Escape', action: 'wizard.help.viewer.shortcut.close' }
        ]
    },

    parser: {
        about: 'wizard.help.parser.about',
        faq: [
            {
                question: 'wizard.help.parser.faq1.q',
                answer: 'wizard.help.parser.faq1.a'
            },
            {
                question: 'wizard.help.parser.faq2.q',
                answer: 'wizard.help.parser.faq2.a'
            },
            {
                question: 'wizard.help.parser.faq3.q',
                answer: 'wizard.help.parser.faq3.a'
            }
        ],
        shortcuts: []
    },

    validator: {
        about: 'wizard.help.validator.about',
        faq: [
            {
                question: 'wizard.help.validator.faq1.q',
                answer: 'wizard.help.validator.faq1.a'
            },
            {
                question: 'wizard.help.validator.faq2.q',
                answer: 'wizard.help.validator.faq2.a'
            },
            {
                question: 'wizard.help.validator.faq3.q',
                answer: 'wizard.help.validator.faq3.a'
            },
            {
                question: 'wizard.help.validator.faq4.q',
                answer: 'wizard.help.validator.faq4.a'
            }
        ],
        shortcuts: []
    }
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.WIZARD_STEPS = WIZARD_STEPS;
    window.WIZARD_HELP = WIZARD_HELP;
}
