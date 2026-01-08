/* ===========================================
   BIM CHECKER - IFC VIEWER INITIALIZATION
   Event listeners, edit mode, storage, spatial tree
   =========================================== */

// =======================
// UPLOAD AREA SETUP
// =======================

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#764ba2';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#667eea';
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    if (e.dataTransfer.files.length > 0) {
        window.handleFiles(Array.from(e.dataTransfer.files));
    }
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        window.handleFiles(Array.from(e.target.files));
    }
});

// =======================
// COLUMN MANAGER
// =======================

document.getElementById('columnManagerBtn').addEventListener('click', () => {
    const manager = document.getElementById('columnManager');
    const currentDisplay = window.getComputedStyle(manager).display;
    manager.style.display = currentDisplay === 'none' ? 'block' : 'none';
});

document.getElementById('applyColumnsBtn').addEventListener('click', () => {
    window.buildTable();
    document.getElementById('columnManager').style.display = 'none';
});

document.getElementById('selectAllBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    for (let psetName of state.psetOrder) {
        if (state.propertySetGroups[psetName]) {
            for (let propName of state.propertySetGroups[psetName]) {
                state.visiblePsets[psetName][propName] = true;
            }
        }
    }
    window.buildPsetManager();
});

document.getElementById('deselectAllColumnsBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    for (let psetName of state.psetOrder) {
        if (state.propertySetGroups[psetName]) {
            for (let propName of state.propertySetGroups[psetName]) {
                state.visiblePsets[psetName][propName] = false;
            }
        }
    }
    window.buildPsetManager();
});

// =======================
// FILTER LISTENERS
// =======================

document.getElementById('searchInput').addEventListener('input', (e) => {
    const state = window.ViewerState;
    state.searchTerm = e.target.value;

    if (!state.searchTerm.startsWith('🌳')) {
        if (window.selectedSpatialIds) {
            window.selectedSpatialIds = null;
            window.selectedSpatialFileName = null;
            e.target.classList.remove('spatial-filter-active');
            document.querySelectorAll('.tree-node-header').forEach(header => {
                header.classList.remove('active');
            });
        }
    }

    window.applyFiltersAndRender();
});

document.getElementById('entityFilter').addEventListener('change', (e) => {
    window.ViewerState.entityFilterValue = e.target.value;
    window.applyFiltersAndRender();
});

document.getElementById('fileFilter').addEventListener('change', (e) => {
    window.ViewerState.fileFilterValue = e.target.value;
    window.applyFiltersAndRender();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    state.searchTerm = '';
    state.entityFilterValue = '';
    state.fileFilterValue = '';
    state.sortColumn = null;
    window.selectedSpatialIds = null;
    window.selectedSpatialFileName = null;

    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    searchInput.classList.remove('spatial-filter-active');

    document.getElementById('entityFilter').value = '';
    document.getElementById('fileFilter').value = '';

    document.querySelectorAll('.tree-node-header').forEach(header => {
        header.classList.remove('active');
    });

    window.applyFiltersAndRender();
});

// =======================
// EXPORT CSV
// =======================

document.getElementById('exportBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    const columns = window.currentColumns || [];
    let csv = `${i18n.t('viewer.csv.file')},${i18n.t('viewer.csv.guid')},${i18n.t('viewer.csv.entity')},${i18n.t('viewer.csv.name')},${i18n.t('viewer.csv.layer')}`;
    for (let col of columns) {
        csv += ',"' + col.psetName + ' ' + col.propName + '"';
    }
    csv += '\n';

    for (let item of state.filteredData) {
        const row = ['"' + item.fileName + '"', item.guid, item.entity, '"' + item.name + '"', '"' + (item.layer || '-') + '"'];
        for (let col of columns) {
            const val = item.propertySets[col.psetName]?.[col.propName] || '';
            row.push('"' + val + '"');
        }
        csv += row.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ifc-multi-export.csv';
    link.click();
});

// =======================
// PAGINATION
// =======================

document.getElementById('firstPageBtn').addEventListener('click', () => {
    window.ViewerState.currentPage = 1;
    window.renderTable();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    if (state.currentPage > 1) {
        state.currentPage--;
        window.renderTable();
    }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    if (state.currentPage < state.totalPages) {
        state.currentPage++;
        window.renderTable();
    }
});

document.getElementById('lastPageBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    state.currentPage = state.totalPages;
    window.renderTable();
});

document.getElementById('goToPageBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    const pageInput = document.getElementById('pageInput');
    const page = parseInt(pageInput.value);
    if (page >= 1 && page <= state.totalPages) {
        state.currentPage = page;
        window.renderTable();
    } else {
        ErrorHandler.warning(`${i18n.t('viewer.pageRange')} ${state.totalPages}`);
        pageInput.value = state.currentPage;
    }
});

document.getElementById('pageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('goToPageBtn').click();
    }
});

document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
    const state = window.ViewerState;
    state.pageSize = parseInt(e.target.value);
    document.getElementById('pageSizeSelectTop').value = e.target.value;
    state.currentPage = 1;
    window.renderTable();
});

document.getElementById('pageSizeSelectTop').addEventListener('change', (e) => {
    const state = window.ViewerState;
    state.pageSize = parseInt(e.target.value);
    document.getElementById('pageSizeSelect').value = e.target.value;
    state.currentPage = 1;
    window.renderTable();
});

// =======================
// EDIT MODE
// =======================

document.getElementById('toggleEditModeBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    state.editMode = !state.editMode;
    const btn = document.getElementById('toggleEditModeBtn');
    const editPanel = document.getElementById('editPanel');

    if (state.editMode) {
        btn.textContent = `👁️ ${i18n.t('viewer.viewMode')}`;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-warning');
        editPanel.classList.add('active');
        document.body.classList.add('edit-mode');
    } else {
        btn.textContent = `✏️ ${i18n.t('viewer.editMode')}`;
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-primary');
        editPanel.classList.remove('active');
        document.body.classList.remove('edit-mode');
        state.selectedEntities.clear();
    }

    window.buildTable();
});

document.getElementById('selectAllVisibleBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    if (!state.editMode) {
        ErrorHandler.warning(i18n.t('viewer.enableEditFirst'));
        return;
    }
    const startIndex = state.pageSize === -1 ? 0 : (state.currentPage - 1) * state.pageSize;
    const endIndex = state.pageSize === -1 ? state.filteredData.length : Math.min(startIndex + state.pageSize, state.filteredData.length);
    const pageData = state.filteredData.slice(startIndex, endIndex);
    pageData.forEach(item => state.selectedEntities.add(item.guid));
    window.updateSelectedCount();
    window.renderTable();
});

document.getElementById('selectAllPagesBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    if (!state.editMode) {
        ErrorHandler.warning(i18n.t('viewer.enableEditFirst'));
        return;
    }

    const totalCount = state.filteredData.length;

    if (totalCount === 0) {
        ErrorHandler.warning(i18n.t('viewer.noEntities'));
        return;
    }

    if (totalCount > 1000) {
        const confirmed = confirm(
            `${i18n.t('viewer.confirmSelectAll')} ${totalCount} ${i18n.t('viewer.entities')}?\n\n` +
            `${i18n.t('viewer.mayTakeLonger')}`
        );
        if (!confirmed) return;
    }

    state.filteredData.forEach(item => {
        if (item && item.guid) {
            state.selectedEntities.add(item.guid);
        }
    });

    window.updateSelectedCount();
    window.renderTable();

    const message = document.createElement('div');
    message.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-weight: 600;';
    message.textContent = `✓ ${i18n.t('viewer.selectedAll')} ${totalCount} ${i18n.t('viewer.entities')}`;
    document.body.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 3000);
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
    window.ViewerState.selectedEntities.clear();
    window.updateSelectedCount();
    window.renderTable();
});

// =======================
// CELL EDITING
// =======================

function makeEditable(cell, guid, psetName, propName) {
    const state = window.ViewerState;
    if (!state.editMode || state.editingCell === cell) return;

    state.editingCell = cell;
    const currentValue = cell.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-editor';
    input.value = currentValue === '-' ? '' : currentValue;

    input.addEventListener('blur', () => {
        saveCell(input, cell, guid, psetName, propName);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveCell(input, cell, guid, psetName, propName);
        } else if (e.key === 'Escape') {
            cell.textContent = currentValue;
            state.editingCell = null;
        }
    });

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
}

function saveCell(input, cell, guid, psetName, propName) {
    const state = window.ViewerState;
    const newValue = input.value.trim();
    const entity = state.allData.find(e => e.guid === guid);

    if (!entity) {
        state.editingCell = null;
        return;
    }

    if (!state.modifications[guid]) {
        state.modifications[guid] = {};
    }
    if (!state.modifications[guid][psetName]) {
        state.modifications[guid][psetName] = {};
    }

    state.modifications[guid][psetName][propName] = newValue;

    if (!entity.propertySets[psetName]) {
        entity.propertySets[psetName] = {};
    }
    entity.propertySets[psetName][propName] = newValue;

    cell.textContent = newValue || '-';
    cell.style.color = newValue ? '#212529' : '#ccc';
    cell.classList.add('modified-cell');

    state.editingCell = null;
    window.updateSelectedCount();
}

window.makeEditable = makeEditable;
window.saveCell = saveCell;

// =======================
// BULK EDIT MODAL
// =======================

document.getElementById('bulkEditBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    const modal = document.getElementById('bulkEditModal');
    const psetSelect = document.getElementById('bulkPsetName');

    psetSelect.innerHTML = `<option value="">${i18n.t('viewer.selectPset')}</option>`;
    for (let psetName of state.psetOrder) {
        if (state.propertySetGroups[psetName]) {
            psetSelect.innerHTML += `<option value="${window.escapeHtml(psetName)}">${window.escapeHtml(psetName)}</option>`;
        }
    }

    document.getElementById('bulkEditCount').textContent = state.selectedEntities.size;
    modal.classList.add('active');
});

document.getElementById('bulkPsetName').addEventListener('change', (e) => {
    const state = window.ViewerState;
    const psetName = e.target.value;
    const propSelect = document.getElementById('bulkPropName');
    const currentValuesSection = document.getElementById('currentValuesSection');

    currentValuesSection.style.display = 'none';

    if (!psetName) {
        propSelect.disabled = true;
        propSelect.innerHTML = `<option value="">${i18n.t('viewer.selectPsetFirst')}</option>`;
        return;
    }

    propSelect.disabled = false;
    propSelect.innerHTML = `<option value="">${i18n.t('viewer.selectProp')}</option>`;

    if (state.propertySetGroups[psetName]) {
        for (let propName of state.propertySetGroups[psetName]) {
            propSelect.innerHTML += `<option value="${window.escapeHtml(propName)}">${window.escapeHtml(propName)}</option>`;
        }
    }
});

document.getElementById('bulkPropName').addEventListener('change', (e) => {
    const state = window.ViewerState;
    const psetName = document.getElementById('bulkPsetName').value;
    const propName = e.target.value;
    const currentValuesSection = document.getElementById('currentValuesSection');
    const currentValuesList = document.getElementById('currentValuesList');

    if (!psetName || !propName) {
        currentValuesSection.style.display = 'none';
        return;
    }

    const valueCount = {};
    let emptyCount = 0;

    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (!entity) continue;

        const value = entity.propertySets[psetName]?.[propName];
        if (value) {
            valueCount[value] = (valueCount[value] || 0) + 1;
        } else {
            emptyCount++;
        }
    }

    let html = '';
    const uniqueValues = Object.keys(valueCount);

    if (uniqueValues.length > 0) {
        html += '<div style="display: grid; gap: 8px;">';
        uniqueValues.sort().forEach(value => {
            const count = valueCount[value];
            const percentage = Math.round((count / state.selectedEntities.size) * 100);
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border-radius: 6px; border: 1px solid #dee2e6;">
                    <span style="font-weight: 600; color: #667eea; flex: 1;">${window.escapeHtml(value)}</span>
                    <span style="color: #6c757d; font-size: 0.9em; margin-left: 10px;">${count}× (${percentage}%)</span>
                    <button onclick="document.getElementById('bulkValue').value = '${window.escapeHtml(value).replace(/'/g, "\\'")}';"
                            style="margin-left: 10px; padding: 4px 10px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        ${i18n.t('viewer.apply')}
                    </button>
                </div>
            `;
        });
        html += '</div>';
    }

    if (emptyCount > 0) {
        const percentage = Math.round((emptyCount / state.selectedEntities.size) * 100);
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffc107; margin-top: 8px;">
                <span style="font-style: italic; color: #856404;">${i18n.t('viewer.emptyNotExists')}</span>
                <span style="color: #856404; font-size: 0.9em;">${emptyCount}× (${percentage}%)</span>
            </div>
        `;
    }

    if (uniqueValues.length === 0 && emptyCount === 0) {
        html = `<p style="color: #6c757d; font-style: italic;">${i18n.t('viewer.noValuesFound')}</p>`;
    }

    currentValuesList.innerHTML = html;
    currentValuesSection.style.display = 'block';
});

function closeBulkEditModal() {
    document.getElementById('bulkEditModal').classList.remove('active');
    document.getElementById('currentValuesSection').style.display = 'none';
    document.getElementById('bulkValue').value = '';
    document.getElementById('bulkPsetName').value = '';
    document.getElementById('bulkPropName').value = '';
    document.getElementById('bulkPropName').disabled = true;
}

function applyBulkEdit() {
    const state = window.ViewerState;
    const psetName = document.getElementById('bulkPsetName').value;
    const propName = document.getElementById('bulkPropName').value;
    const value = document.getElementById('bulkValue').value.trim();

    if (!psetName || !propName) {
        ErrorHandler.warning(i18n.t('viewer.selectPsetAndProperty'));
        return;
    }

    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (!entity) continue;

        if (!state.modifications[guid]) {
            state.modifications[guid] = {};
        }
        if (!state.modifications[guid][psetName]) {
            state.modifications[guid][psetName] = {};
        }

        state.modifications[guid][psetName][propName] = value;

        if (!entity.propertySets[psetName]) {
            entity.propertySets[psetName] = {};
        }
        entity.propertySets[psetName][propName] = value;
    }

    closeBulkEditModal();
    window.renderTable();
    window.updateSelectedCount();

    ErrorHandler.success(`${i18n.t('viewer.valueSet')} "${value}" ${i18n.t('viewer.forEntities')} ${state.selectedEntities.size} ${i18n.t('viewer.inPsetProp')} ${psetName}.${propName}`);
}

window.closeBulkEditModal = closeBulkEditModal;
window.applyBulkEdit = applyBulkEdit;

// =======================
// ADD PSET MODAL
// =======================

document.getElementById('addPsetBtn').addEventListener('click', () => {
    const modal = document.getElementById('addPsetModal');
    document.getElementById('addPsetCount').textContent = window.ViewerState.selectedEntities.size;
    modal.classList.add('active');
});

function closeAddPsetModal() {
    document.getElementById('addPsetModal').classList.remove('active');
    document.getElementById('newPsetName').value = '';
    document.getElementById('newPropName').value = '';
    document.getElementById('newPropValue').value = '';
}

function applyAddPset() {
    const state = window.ViewerState;
    const psetName = document.getElementById('newPsetName').value.trim();
    const propName = document.getElementById('newPropName').value.trim();
    const value = document.getElementById('newPropValue').value.trim();

    if (!psetName || !propName) {
        ErrorHandler.warning(i18n.t('viewer.fillPsetAndProperty'));
        return;
    }

    if (!state.propertySetGroups[psetName]) {
        state.propertySetGroups[psetName] = [];
        state.psetOrder.push(psetName);
        state.visiblePsets[psetName] = {};
    }

    if (!state.propertySetGroups[psetName].includes(propName)) {
        state.propertySetGroups[psetName].push(propName);
        state.visiblePsets[psetName][propName] = true;
    }

    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (!entity) continue;

        if (!state.modifications[guid]) {
            state.modifications[guid] = {};
        }
        if (!state.modifications[guid][psetName]) {
            state.modifications[guid][psetName] = {};
        }

        state.modifications[guid][psetName][propName] = value;

        if (!entity.propertySets[psetName]) {
            entity.propertySets[psetName] = {};
        }
        entity.propertySets[psetName][propName] = value;
    }

    closeAddPsetModal();
    window.buildTable();
    window.updateSelectedCount();

    ErrorHandler.success(`PropertySet "${psetName}" (${propName}) ${i18n.t('viewer.psetAdded')} ${state.selectedEntities.size} ${i18n.t('viewer.entities')}`);
}

window.closeAddPsetModal = closeAddPsetModal;
window.applyAddPset = applyAddPset;

// =======================
// RENAME PSET MODAL
// =======================

document.getElementById('renamePsetBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    const modal = document.getElementById('renamePsetModal');
    const dropdown = document.getElementById('oldPsetName');

    const allPsets = new Set();
    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (entity && entity.propertySets) {
            Object.keys(entity.propertySets).forEach(pset => allPsets.add(pset));
        }
    }

    dropdown.innerHTML = `<option value="">${i18n.t('viewer.selectPset')}</option>`;
    Array.from(allPsets).sort().forEach(pset => {
        const option = document.createElement('option');
        option.value = pset;
        option.textContent = pset;
        dropdown.appendChild(option);
    });

    document.getElementById('renamePsetCount').textContent = state.selectedEntities.size;
    modal.classList.add('active');
});

function closeRenamePsetModal() {
    document.getElementById('renamePsetModal').classList.remove('active');
    document.getElementById('oldPsetName').value = '';
    document.getElementById('newPsetNameRename').value = '';
}

function applyPsetRename() {
    const state = window.ViewerState;
    const oldName = document.getElementById('oldPsetName').value.trim();
    const newName = document.getElementById('newPsetNameRename').value.trim();

    if (!oldName) {
        ErrorHandler.error(i18n.t('viewer.selectPsetRename'));
        return;
    }

    if (!newName) {
        ErrorHandler.error(i18n.t('viewer.enterNewPsetName'));
        return;
    }

    if (oldName === newName) {
        ErrorHandler.warning(i18n.t('viewer.sameNameWarning'));
        return;
    }

    let count = 0;
    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (!entity || !entity.propertySets[oldName]) continue;

        if (!state.modifications[guid]) {
            state.modifications[guid] = {};
        }
        if (!state.modifications[guid].renamedPsets) {
            state.modifications[guid].renamedPsets = {};
        }

        state.modifications[guid].renamedPsets[oldName] = newName;
        count++;
    }

    closeRenamePsetModal();
    window.updateSelectedCount();
    ErrorHandler.success(`PropertySet "${oldName}" ${i18n.t('viewer.psetWillBeRenamed')} "${newName}" (${count} ${i18n.t('viewer.entities')}) ${i18n.t('viewer.atExport')}`);
}

window.closeRenamePsetModal = closeRenamePsetModal;
window.applyPsetRename = applyPsetRename;

// =======================
// RENAME PROPERTY MODAL
// =======================

document.getElementById('renamePropertyBtn').addEventListener('click', () => {
    const state = window.ViewerState;
    const modal = document.getElementById('renamePropertyModal');
    const psetDropdown = document.getElementById('renamePropPsetName');

    const allPsets = new Set();
    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (entity && entity.propertySets) {
            Object.keys(entity.propertySets).forEach(pset => allPsets.add(pset));
        }
    }

    psetDropdown.innerHTML = `<option value="">${i18n.t('viewer.selectPset')}</option>`;
    Array.from(allPsets).sort().forEach(pset => {
        const option = document.createElement('option');
        option.value = pset;
        option.textContent = pset;
        psetDropdown.appendChild(option);
    });

    document.getElementById('oldPropertyName').disabled = true;
    document.getElementById('oldPropertyName').innerHTML = `<option value="">${i18n.t('viewer.selectPsetFirst')}</option>`;
    document.getElementById('newPropertyName').value = '';

    document.getElementById('renamePropertyCount').textContent = state.selectedEntities.size;
    modal.classList.add('active');
});

function closeRenamePropertyModal() {
    document.getElementById('renamePropertyModal').classList.remove('active');
    document.getElementById('renamePropPsetName').value = '';
    document.getElementById('oldPropertyName').value = '';
    document.getElementById('oldPropertyName').disabled = true;
    document.getElementById('newPropertyName').value = '';
}

function updatePropertyDropdown() {
    const state = window.ViewerState;
    const psetName = document.getElementById('renamePropPsetName').value;
    const propDropdown = document.getElementById('oldPropertyName');

    if (!psetName) {
        propDropdown.disabled = true;
        propDropdown.innerHTML = `<option value="">${i18n.t('viewer.selectPsetFirst')}</option>`;
        return;
    }

    const allProperties = new Set();
    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (entity && entity.propertySets && entity.propertySets[psetName]) {
            Object.keys(entity.propertySets[psetName]).forEach(prop => allProperties.add(prop));
        }
    }

    propDropdown.innerHTML = `<option value="">${i18n.t('viewer.selectProp')}</option>`;
    Array.from(allProperties).sort().forEach(prop => {
        const option = document.createElement('option');
        option.value = prop;
        option.textContent = prop;
        propDropdown.appendChild(option);
    });

    propDropdown.disabled = false;
}

function applyPropertyRename() {
    const state = window.ViewerState;
    const psetName = document.getElementById('renamePropPsetName').value.trim();
    const oldPropName = document.getElementById('oldPropertyName').value.trim();
    const newPropName = document.getElementById('newPropertyName').value.trim();

    if (!psetName) {
        ErrorHandler.error(i18n.t('viewer.errorSelectPset'));
        return;
    }

    if (!oldPropName) {
        ErrorHandler.error(i18n.t('viewer.selectPropertyRename'));
        return;
    }

    if (!newPropName) {
        ErrorHandler.error(i18n.t('viewer.enterNewPropertyName'));
        return;
    }

    if (oldPropName === newPropName) {
        ErrorHandler.warning(i18n.t('viewer.sameNameWarning'));
        return;
    }

    let count = 0;
    for (let guid of state.selectedEntities) {
        const entity = state.allData.find(e => e.guid === guid);
        if (!entity || !entity.propertySets[psetName] || !entity.propertySets[psetName][oldPropName]) continue;

        if (!state.modifications[guid]) {
            state.modifications[guid] = {};
        }
        if (!state.modifications[guid].renamedProperties) {
            state.modifications[guid].renamedProperties = {};
        }
        if (!state.modifications[guid].renamedProperties[psetName]) {
            state.modifications[guid].renamedProperties[psetName] = {};
        }

        state.modifications[guid].renamedProperties[psetName][oldPropName] = newPropName;
        count++;
    }

    closeRenamePropertyModal();
    window.updateSelectedCount();
    ErrorHandler.success(`Property "${oldPropName}" ${i18n.t('viewer.inPset')} "${psetName}" ${i18n.t('viewer.propertyWillBeRenamed')} "${newPropName}" (${count} ${i18n.t('viewer.entities')}) ${i18n.t('viewer.atExport')}`);
}

window.closeRenamePropertyModal = closeRenamePropertyModal;
window.updatePropertyDropdown = updatePropertyDropdown;
window.applyPropertyRename = applyPropertyRename;

// =======================
// EXPORT IFC
// =======================

document.getElementById('exportIfcBtn').addEventListener('click', () => {
    const state = window.ViewerState;

    if (Object.keys(state.modifications).length === 0) {
        ErrorHandler.warning(i18n.t('viewer.noChangesToSave'));
        return;
    }

    if (state.loadedFiles.length === 0) {
        ErrorHandler.error(i18n.t('viewer.noIfcLoaded'));
        return;
    }

    let fileToExport;
    if (state.loadedFiles.length === 1) {
        fileToExport = state.loadedFiles[0];
    } else {
        const fileNames = state.loadedFiles.map((f, i) => `${i + 1}. ${f.fileName}`).join('\n');
        const choice = prompt(
            `${i18n.t('viewer.selectFileExport')}${state.loadedFiles.length}):\n\n${fileNames}`
        );
        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= state.loadedFiles.length) {
            ErrorHandler.error(i18n.t('viewer.invalidSelection'));
            return;
        }
        fileToExport = state.loadedFiles[index];
    }

    exportModifiedIFC(fileToExport);
});

async function exportModifiedIFC(fileInfo) {
    const state = window.ViewerState;
    try {
        const ifcContent = await window.getIFCContent(fileInfo.fileName);

        if (!ifcContent) {
            ErrorHandler.error(i18n.t('viewer.originalNotAvailable'));
            return;
        }

        const modifiedIfc = applyModificationsToIFC(ifcContent, state.modifications, fileInfo.fileName);

        if (!modifiedIfc) {
            return;
        }

        downloadModifiedIFC(modifiedIfc, fileInfo.fileName);
    } catch (error) {
        ErrorHandler.error(`${i18n.t('viewer.exportError')} ${error.message}`);
    }
}

function applyModificationsToIFC(ifcContent, modifications, fileName) {
    const state = window.ViewerState;
    const lines = ifcContent.split('\n');
    let modifiedLines = [...lines];

    const entityMap = new Map();
    const propertySetMap = new Map();
    const propertySingleValueMap = new Map();
    const relDefinesMap = new Map();
    let maxEntityId = 0;

    lines.forEach((originalLine, lineIndex) => {
        const line = originalLine.trim();
        if (!line || !line.startsWith('#')) return;

        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
        if (!match) return;

        const [, id, entityType, params] = match;
        const numId = parseInt(id);
        if (numId > maxEntityId) maxEntityId = numId;

        entityMap.set(id, { lineIndex, type: entityType, params, line: originalLine });

        if (entityType === 'IFCPROPERTYSET' || entityType === 'IFCELEMENTQUANTITY') {
            propertySetMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCPROPERTYSINGLEVALUE' || entityType.startsWith('IFCQUANTITY')) {
            propertySingleValueMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCRELDEFINESBYPROPERTIES') {
            relDefinesMap.set(id, { lineIndex, params, line: originalLine });
        }
    });

    const guidToEntityId = new Map();
    entityMap.forEach((entity, id) => {
        if (entity.type.startsWith('IFC') && !entity.type.includes('REL') && !entity.type.includes('PROPERTY')) {
            const guidMatch = entity.params.match(/'([^']+)'/);
            if (guidMatch) {
                guidToEntityId.set(guidMatch[1], id);
            }
        }
    });

    let modificationCount = 0;
    let createdCount = 0;
    const newEntities = [];

    for (const [guid, psetModifications] of Object.entries(modifications)) {
        const entity = state.allData.find(e => e.guid === guid && e.fileName === fileName);
        if (!entity) continue;

        const entityId = guidToEntityId.get(guid);
        if (!entityId) continue;

        for (const [psetName, propModifications] of Object.entries(psetModifications)) {
            if (psetName === 'renamedPsets' || psetName === 'renamedProperties') continue;

            const newProperties = {};

            for (const [propName, newValue] of Object.entries(propModifications)) {
                const updated = updatePropertyInIFC(
                    modifiedLines,
                    entityMap,
                    propertySetMap,
                    propertySingleValueMap,
                    psetName,
                    propName,
                    newValue
                );

                if (updated) {
                    modificationCount++;
                } else {
                    newProperties[propName] = newValue;
                }
            }

            if (Object.keys(newProperties).length > 0) {
                const propertyIds = [];
                for (const [propName, value] of Object.entries(newProperties)) {
                    maxEntityId++;
                    const propLine = createPropertySingleValue(maxEntityId, propName, value);
                    newEntities.push(propLine);
                    propertyIds.push(maxEntityId);
                }

                maxEntityId++;
                const psetId = maxEntityId;
                const psetGuid = generateGUID();
                const psetLine = createPropertySet(psetId, psetGuid, psetName, propertyIds);
                newEntities.push(psetLine);

                maxEntityId++;
                const relGuid = generateGUID();
                const relLine = createRelDefinesByProperties(maxEntityId, relGuid, [entityId], psetId);
                newEntities.push(relLine);

                createdCount += Object.keys(newProperties).length;
            }
        }
    }

    if (newEntities.length > 0) {
        let endsecIndex = -1;
        for (let i = modifiedLines.length - 1; i >= 0; i--) {
            if (modifiedLines[i].trim() === 'ENDSEC;') {
                endsecIndex = i;
                break;
            }
        }

        if (endsecIndex !== -1) {
            modifiedLines.splice(endsecIndex, 0, ...newEntities);
        } else {
            ErrorHandler.error(i18n.t('viewer.endSecNotFound'));
            return null;
        }
    }

    return modifiedLines.join('\n');
}

function updatePropertyInIFC(lines, entityMap, propertySetMap, propertySingleValueMap, psetName, propName, newValue) {
    let updatedCount = 0;

    for (const [psetId, psetInfo] of propertySetMap) {
        if (!psetInfo.params) continue;

        const quotedStrings = [];
        const regex = /'([^']*(?:\\'[^']*)*)'/g;
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(psetInfo.params)) !== null) {
            quotedStrings.push(match[1]);
        }

        let foundPsetName = quotedStrings.length > 1 ? quotedStrings[1] : null;
        if (foundPsetName !== psetName) continue;

        const propIdsMatch = psetInfo.params.match(/\(([#\d,\s]+)\)[^)]*$/);
        if (!propIdsMatch) continue;

        const propIds = propIdsMatch[1].match(/#\d+/g);
        if (!propIds) continue;

        for (const propIdRef of propIds) {
            const propId = propIdRef.substring(1);
            const propInfo = propertySingleValueMap.get(propId);
            if (!propInfo) continue;

            const propNameMatch = propInfo.params.match(/'([^']*)'/);
            if (!propNameMatch) continue;

            const currentPropName = propNameMatch[1];
            if (currentPropName !== propName) continue;

            const oldLine = propInfo.line;
            const newLine = updatePropertyValue(oldLine, newValue);

            if (newLine !== oldLine) {
                lines[propInfo.lineIndex] = newLine;
                updatedCount++;
            }
        }
    }

    return updatedCount > 0;
}

function updatePropertyValue(line, newValue) {
    const stringValuePattern = /(IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE))\s*\(\s*'([^']*)'\s*\)/;
    let match = line.match(stringValuePattern);

    if (match) {
        const [fullMatch, ifcType] = match;
        const encodedValue = encodeIFCString(newValue);
        const newMatch = `${ifcType}('${encodedValue}')`;
        return line.replace(fullMatch, newMatch);
    }

    const numericValuePattern = /(IFC(?:REAL|INTEGER|NUMERIC|POSITIVE(?:LENGTH|PLANE)?MEASURE|LENGTH|AREA|VOLUME|COUNT|TIME)MEASURE?)\s*\(\s*([^)]+)\s*\)/;
    match = line.match(numericValuePattern);

    if (match) {
        const [fullMatch, ifcType] = match;
        const numValue = parseFloat(newValue);
        const finalValue = isNaN(numValue) ? newValue : numValue;
        const newMatch = `${ifcType}(${finalValue})`;
        return line.replace(fullMatch, newMatch);
    }

    const booleanValuePattern = /(IFCBOOLEAN|IFCLOGICAL)\s*\(\s*\.(T|F|UNKNOWN)\.\s*\)/;
    match = line.match(booleanValuePattern);

    if (match) {
        const [fullMatch, ifcType] = match;
        const boolValue = newValue.toUpperCase() === 'TRUE' || newValue === '1' || newValue.toUpperCase() === 'T' ? 'T' :
                         newValue.toUpperCase() === 'FALSE' || newValue === '0' || newValue.toUpperCase() === 'F' ? 'F' : 'UNKNOWN';
        const newMatch = `${ifcType}(.${boolValue}.)`;
        return line.replace(fullMatch, newMatch);
    }

    return line;
}

function encodeIFCString(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'");
}

function downloadModifiedIFC(ifcContent, originalFileName) {
    const blob = new Blob([ifcContent], { type: 'application/ifc' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const nameParts = originalFileName.split('.');
    nameParts[nameParts.length - 1] = 'ifc';
    const baseName = nameParts.slice(0, -1).join('.');
    a.download = `${baseName}_modified.ifc`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    ErrorHandler.success(`${i18n.t('viewer.fileSavedAs')} ${a.download}`);
}

function generateGUID() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let guid = '';
    for (let i = 0; i < 22; i++) {
        guid += chars[Math.floor(Math.random() * chars.length)];
    }
    return guid;
}

function createPropertySingleValue(id, propName, value) {
    const encodedName = encodeIFCString(propName);
    const encodedValue = encodeIFCString(value);

    let ifcType = 'IFCLABEL';
    let formattedValue;

    if (!isNaN(parseFloat(value)) && value.trim() !== '') {
        ifcType = 'IFCREAL';
        formattedValue = parseFloat(value);
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
        ifcType = 'IFCBOOLEAN';
        formattedValue = `.${value.toUpperCase() === 'TRUE' ? 'T' : 'F'}.`;
    } else {
        formattedValue = `'${encodedValue}'`;
    }

    return `#${id}=IFCPROPERTYSINGLEVALUE('${encodedName}','Simple property set',${ifcType}(${formattedValue}),$);`;
}

function createPropertySet(id, guid, psetName, propertyIds) {
    const encodedName = encodeIFCString(psetName);
    const propRefs = propertyIds.map(pid => `#${pid}`).join(',');
    return `#${id}=IFCPROPERTYSET('${guid}',#2,'${encodedName}','Property Set',(${propRefs}));`;
}

function createRelDefinesByProperties(id, guid, relatedObjects, relatingPset) {
    const objRefs = relatedObjects.map(oid => `#${oid}`).join(',');
    return `#${id}=IFCRELDEFINESBYPROPERTIES('${guid}',#2,$,$,(${objRefs}),#${relatingPset});`;
}

// =======================
// STORAGE INTEGRATION
// =======================

let storageDB = null;
let selectedStorageFiles = new Set();
let expandedStorageFolders = new Set(['root']);
let storageMetadata = null;
let storageInitPromise = null;

storageInitPromise = (async function() {
    try {
        storageDB = await initStorageDB();
        await loadStorageMetadata();
        return true;
    } catch (e) {
        return false;
    }
})();

async function loadStorageMetadata() {
    try {
        const transaction = storageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('ifc_files');

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const fullData = request.result?.value;

                if (!fullData) {
                    storageMetadata = null;
                    resolve();
                    return;
                }

                storageMetadata = {
                    folders: fullData.folders,
                    files: {}
                };

                for (let fileId in fullData.files) {
                    const file = fullData.files[fileId];
                    storageMetadata.files[fileId] = {
                        id: file.id,
                        name: file.name,
                        size: file.size,
                        folder: file.folder,
                        uploadDate: file.uploadDate
                    };
                }
                resolve();
            };

            request.onerror = () => {
                storageMetadata = null;
                reject(request.error);
            };
        });
    } catch (e) {
        storageMetadata = null;
    }
}

document.getElementById('loadFromStorageBtn').addEventListener('click', async () => {
    const btn = document.getElementById('loadFromStorageBtn');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = '⏳ ' + i18n.t('viewer.loading');

    try {
        if (storageInitPromise) {
            await storageInitPromise;
        }

        if (!storageDB) {
            ErrorHandler.error(i18n.t('viewer.storageNotInit'));
            return;
        }

        if (!storageMetadata) {
            await loadStorageMetadata();
        }

        selectedStorageFiles.clear();
        expandedStorageFolders = new Set(['root']);
        renderStorageTree();
        document.getElementById('storagePickerModal').classList.add('active');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

function closeStoragePickerModal() {
    document.getElementById('storagePickerModal').classList.remove('active');
}

function toggleStorageFolder(folderId) {
    if (expandedStorageFolders.has(folderId)) {
        expandedStorageFolders.delete(folderId);
    } else {
        expandedStorageFolders.add(folderId);
    }
    renderStorageTree();
}

function selectAllFilesInFolder(folderId) {
    if (!storageMetadata) return;

    const folder = storageMetadata.folders[folderId];
    if (!folder) return;

    const allFiles = getAllFilesInFolder(folderId);
    const allSelected = allFiles.every(fileId => selectedStorageFiles.has(fileId));

    if (allSelected) {
        allFiles.forEach(fileId => selectedStorageFiles.delete(fileId));
    } else {
        allFiles.forEach(fileId => selectedStorageFiles.add(fileId));
    }

    renderStorageTree();
}

function getAllFilesInFolder(folderId) {
    if (!storageMetadata) return [];

    const folder = storageMetadata.folders[folderId];
    if (!folder) return [];

    let files = [...folder.files];

    if (folder.children) {
        folder.children.forEach(childId => {
            files = files.concat(getAllFilesInFolder(childId));
        });
    }

    return files;
}

function renderStorageTree() {
    try {
        if (!storageMetadata || !storageMetadata.files || Object.keys(storageMetadata.files).length === 0) {
            document.getElementById('storageFileTree').innerHTML = `<p class="storage-empty-message">${i18n.t('viewer.noIfcInStorage')}</p>`;
            return;
        }

        const html = renderStorageFolderRecursive('root', 0);
        document.getElementById('storageFileTree').innerHTML = html;
        updateSelectedFilesCount();
    } catch (e) {
        document.getElementById('storageFileTree').innerHTML = `<p class="storage-error-message">${i18n.t('viewer.storageDisplayError')}</p>`;
    }
}

function renderStorageFolderRecursive(folderId, level) {
    const folder = storageMetadata.folders[folderId];
    if (!folder) return '';

    const isExpanded = expandedStorageFolders.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

    let html = '';

    if (folderId !== 'root') {
        const allFolderFiles = getAllFilesInFolder(folderId);
        const allFolderSelected = allFolderFiles.length > 0 && allFolderFiles.every(fileId => selectedStorageFiles.has(fileId));

        html += `
            <div class="storage-folder-wrapper">
                <div class="storage-folder-header" style="margin-left: ${level * 20}px;">
                    <span onclick="toggleStorageFolder('${folderId}')" class="storage-folder-arrow">${arrow}</span>
                    <input type="checkbox" ${allFolderSelected ? 'checked' : ''} onclick="event.stopPropagation(); event.preventDefault(); selectAllFilesInFolder('${folderId}')" class="storage-folder-checkbox" title="${i18n.t('viewer.selectAllInFolder')}">
                    <span onclick="toggleStorageFolder('${folderId}')" class="storage-folder-name">
                        📁 ${window.escapeHtml(folder.name)}
                        ${allFolderFiles.length > 0 ? `<span class="storage-folder-count">(${allFolderFiles.length} ${i18n.t('viewer.files')})</span>` : ''}
                    </span>
                </div>
        `;
    }

    if (isExpanded) {
        if (folder.children && folder.children.length > 0) {
            const sortedChildren = folder.children
                .map(id => storageMetadata.folders[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            sortedChildren.forEach(childFolder => {
                html += renderStorageFolderRecursive(childFolder.id, level + 1);
            });
        }

        if (folder.files && folder.files.length > 0) {
            const files = folder.files
                .map(id => storageMetadata.files[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            files.forEach(file => {
                const isSelected = selectedStorageFiles.has(file.id);
                const sizeKB = (file.size / 1024).toFixed(1);
                html += `
                    <div class="storage-file-item ${isSelected ? 'selected' : ''}"
                         onclick="toggleStorageFileSelection('${file.id}')"
                         style="margin-left: ${(level + 1) * 20}px;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); event.preventDefault(); toggleStorageFileSelection('${file.id}');" class="storage-file-checkbox">
                        <span class="storage-file-name">📄 ${window.escapeHtml(file.name)}</span>
                        <span class="storage-file-size">${sizeKB} KB</span>
                    </div>
                `;
            });
        }
    }

    if (folderId !== 'root') {
        html += '</div>';
    }

    return html;
}

function toggleStorageFileSelection(fileId) {
    if (selectedStorageFiles.has(fileId)) {
        selectedStorageFiles.delete(fileId);
    } else {
        selectedStorageFiles.add(fileId);
    }
    renderStorageTree();
}

function updateSelectedFilesCount() {
    document.getElementById('selectedFilesCount').textContent = selectedStorageFiles.size;
}

async function loadSelectedFilesFromStorage() {
    if (selectedStorageFiles.size === 0) {
        ErrorHandler.warning(i18n.t('viewer.selectAtLeastOne'));
        return;
    }

    try {
        const metadataTransaction = storageDB.transaction(['storage'], 'readonly');
        const metadataStore = metadataTransaction.objectStore('storage');
        const metadataRequest = metadataStore.get('ifc_files');

        metadataRequest.onsuccess = async () => {
            const storageData = metadataRequest.result?.value;
            if (!storageData) {
                ErrorHandler.error(i18n.t('viewer.storageLoadError'));
                return;
            }

            document.getElementById('loading').classList.add('show');
            window.updateProgress(0, `${i18n.t('viewer.loadingFromStorage')} (0/${selectedStorageFiles.size})`);
            closeStoragePickerModal();

            const fileArray = Array.from(selectedStorageFiles);
            for (let i = 0; i < fileArray.length; i++) {
                const fileId = fileArray[i];
                const fileMetadata = storageData.files[fileId];

                if (fileMetadata) {
                    const contentTransaction = storageDB.transaction(['storage'], 'readonly');
                    const contentStore = contentTransaction.objectStore('storage');
                    const contentRequest = contentStore.get(`ifc_files_file_${fileId}`);

                    const fileContent = await new Promise((resolve, reject) => {
                        contentRequest.onsuccess = () => resolve(contentRequest.result?.value);
                        contentRequest.onerror = () => reject(contentRequest.error);
                    });

                    if (fileContent) {
                        await window.parseIFCAsync(fileContent, fileMetadata.name, i + 1, fileArray.length);
                    }
                }
            }

            document.getElementById('loading').classList.remove('show');
            window.combineData();
            window.updateUI();

            selectedStorageFiles.clear();
        };

        metadataRequest.onerror = () => {
            ErrorHandler.error(i18n.t('viewer.storageLoadError'));
            document.getElementById('loading').classList.remove('show');
        };
    } catch (e) {
        ErrorHandler.error(i18n.t('viewer.storageLoadError'));
        document.getElementById('loading').classList.remove('show');
    }
}

window.closeStoragePickerModal = closeStoragePickerModal;
window.toggleStorageFolder = toggleStorageFolder;
window.selectAllFilesInFolder = selectAllFilesInFolder;
window.toggleStorageFileSelection = toggleStorageFileSelection;
window.loadSelectedFilesFromStorage = loadSelectedFilesFromStorage;

// =======================
// SPATIAL TREE
// =======================

let currentTreeFileIndex = 0;
let spatialTreeOpen = false;

function toggleSpatialTree() {
    spatialTreeOpen = !spatialTreeOpen;
    const panel = document.getElementById('spatialTreePanel');
    const overlay = document.getElementById('spatialTreeOverlay');

    if (spatialTreeOpen) {
        panel.classList.add('open');
        overlay.classList.add('visible');
        renderSpatialTree();
    } else {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
    }
}

function closeSpatialTree() {
    if (spatialTreeOpen) {
        toggleSpatialTree();
    }
}

function getEntityIcon(type) {
    const icons = {
        'IFCPROJECT': '🏗️',
        'IFCSITE': '🌍',
        'IFCBUILDING': '🏢',
        'IFCBUILDINGSTOREY': '📐',
        'IFCSPACE': '📦',
        'IFCWALL': '🧱',
        'IFCDOOR': '🚪',
        'IFCWINDOW': '🪟',
        'IFCSLAB': '⬜',
        'IFCBEAM': '━',
        'IFCCOLUMN': '⊥',
        'IFCROOF': '⌂',
        'IFCSTAIR': '🪜',
        'IFCRAILING': '🛤️',
        'IFCFURNISHINGELEMENT': '🪑',
        'IFCMEMBER': '═',
        'IFCPLATE': '▭',
        'IFCCOVERING': '▦',
        'IFCFLOWSEGMENT': '🔧',
        'IFCFLOWTERMINAL': '💧',
        'IFCFLOWFITTING': '🔩',
        'IFCROAD': '🛣️',
        'IFCRAILWAY': '🚂',
        'IFCBRIDGE': '🌉',
        'IFCALIGNMENT': '↗️'
    };
    return icons[type] || '📦';
}

function countChildren(node) {
    if (!node.children || node.children.length === 0) return 0;
    let count = node.children.length;
    for (let child of node.children) {
        count += countChildren(child);
    }
    return count;
}

function renderTreeNode(node, depth = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const childCount = hasChildren ? countChildren(node) : 0;

    const typeName = node.type.replace('IFC', '');
    let displayLabel = typeName;
    if (node.name && node.name !== '-') {
        displayLabel = `${typeName} (${node.name})`;
    }

    let html = `
        <div class="tree-node" data-node-id="${node.id}" data-type="${node.type}">
            <div class="tree-node-header" onclick="handleTreeNodeClick('${node.id}', '${node.type}', event)">
                <span class="tree-node-toggle ${hasChildren ? 'collapsed' : 'leaf'}" onclick="event.stopPropagation(); toggleTreeNode('${node.id}')"></span>
                <span class="tree-node-icon">${getEntityIcon(node.type)}</span>
                <span class="tree-node-label">${window.escapeHtml(displayLabel)}</span>
                ${childCount > 0 ? `<span class="tree-node-count">${childCount}</span>` : ''}
            </div>
    `;

    if (hasChildren) {
        html += `<div class="tree-node-children" id="children-${node.id}">`;
        for (let child of node.children) {
            html += renderTreeNode(child, depth + 1);
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function handleTreeNodeClick(nodeId, nodeType, event) {
    const state = window.ViewerState;

    document.querySelectorAll('.tree-node-header').forEach(header => {
        header.classList.remove('active');
    });

    const nodeDiv = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeDiv) {
        const header = nodeDiv.querySelector('.tree-node-header');
        if (header) {
            header.classList.add('active');
        }
    }

    function getAllChildIds(node) {
        let ids = [node.id];
        if (node.children) {
            node.children.forEach(child => {
                ids = ids.concat(getAllChildIds(child));
            });
        }
        return ids;
    }

    function findNodeById(nodes, targetId) {
        for (let node of nodes) {
            if (node.id === targetId) return node;
            if (node.children) {
                const found = findNodeById(node.children, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    const currentFile = state.loadedFiles[currentTreeFileIndex];
    if (!currentFile || !currentFile.spatialTree) return;

    const clickedNode = findNodeById(currentFile.spatialTree, nodeId);
    if (!clickedNode) return;

    const allIds = getAllChildIds(clickedNode);

    window.selectedSpatialIds = new Set(allIds);
    window.selectedSpatialFileName = currentFile.fileName;

    const typeName = clickedNode.type.replace('IFC', '');
    let displayName = typeName;
    if (clickedNode.name && clickedNode.name !== '-') {
        displayName = `${typeName} (${clickedNode.name})`;
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = `🌳 ${displayName}`;
        searchInput.classList.add('spatial-filter-active');
    }

    window.applyFiltersAndRender();
}

function toggleTreeNode(nodeId) {
    const childrenDiv = document.getElementById(`children-${nodeId}`);
    const nodeDiv = document.querySelector(`[data-node-id="${nodeId}"]`);

    if (!childrenDiv || !nodeDiv) return;

    const toggle = nodeDiv.querySelector('.tree-node-toggle');
    const isExpanded = childrenDiv.classList.contains('expanded');

    if (isExpanded) {
        childrenDiv.classList.remove('expanded');
        toggle.classList.remove('expanded');
        toggle.classList.add('collapsed');
    } else {
        childrenDiv.classList.add('expanded');
        toggle.classList.remove('collapsed');
        toggle.classList.add('expanded');
    }
}

function renderSpatialTree() {
    const state = window.ViewerState;
    const content = document.getElementById('spatialTreeContent');

    if (state.loadedFiles.length === 0) {
        content.innerHTML = `<div class="spatial-tree-info">${i18n.t('viewer.loadIfcForStructure')}</div>`;
        return;
    }

    const currentFile = state.loadedFiles[currentTreeFileIndex];

    if (!currentFile || !currentFile.spatialTree || currentFile.spatialTree.length === 0) {
        content.innerHTML = `<div class="spatial-tree-info">${i18n.t('viewer.noSpatialStructure')}</div>`;
        return;
    }

    let html = '';
    if (state.loadedFiles.length > 1) {
        html += `
            <div class="tree-file-selector">
                <label>${i18n.t('viewer.fileLabel')} (${state.loadedFiles.length}):</label>
                <select id="treeSpatialFileSelect" onchange="changeSpatialTreeFile(this.value)">
        `;
        state.loadedFiles.forEach((file, index) => {
            const treeSize = file.spatialTree?.length ? countChildren(file.spatialTree[0]) : 0;
            html += `<option value="${index}" ${index === currentTreeFileIndex ? 'selected' : ''}>${window.escapeHtml(file.fileName)} (${treeSize} ${i18n.t('viewer.entities2')})</option>`;
        });
        html += `
                </select>
            </div>
        `;
    } else {
        const treeSize = currentFile.spatialTree?.length ? countChildren(currentFile.spatialTree[0]) : 0;
        html += `
            <div class="tree-file-selector" style="border-bottom: 2px solid #e9ecef; padding-bottom: 10px; margin-bottom: 10px;">
                <label style="font-size: 0.9em; color: #6c757d;">📄 ${window.escapeHtml(currentFile.fileName)}</label>
                <div style="font-size: 0.85em; color: #6c757d; margin-top: 5px;">${treeSize} ${i18n.t('viewer.entitiesInStructure')}</div>
            </div>
        `;
    }

    html += `
        <div style="display: flex; gap: 5px; margin-bottom: 10px;">
            <button class="btn btn-secondary" style="flex: 1; padding: 6px 10px; font-size: 0.85em;" onclick="expandAllTreeNodes()">▼ ${i18n.t('viewer.expandAll')}</button>
            <button class="btn btn-secondary" style="flex: 1; padding: 6px 10px; font-size: 0.85em;" onclick="collapseAllTreeNodes()">▶ ${i18n.t('viewer.collapseAll')}</button>
        </div>
    `;

    for (let rootNode of currentFile.spatialTree) {
        html += renderTreeNode(rootNode);
    }

    content.innerHTML = html;
}

function changeSpatialTreeFile(fileIndex) {
    currentTreeFileIndex = parseInt(fileIndex);
    renderSpatialTree();
}

function expandAllTreeNodes() {
    document.querySelectorAll('.tree-node-children').forEach(div => {
        div.classList.add('expanded');
    });
    document.querySelectorAll('.tree-node-toggle:not(.leaf)').forEach(toggle => {
        toggle.classList.remove('collapsed');
        toggle.classList.add('expanded');
    });
}

function collapseAllTreeNodes() {
    document.querySelectorAll('.tree-node-children').forEach(div => {
        div.classList.remove('expanded');
    });
    document.querySelectorAll('.tree-node-toggle:not(.leaf)').forEach(toggle => {
        toggle.classList.remove('expanded');
        toggle.classList.add('collapsed');
    });
}

window.toggleSpatialTree = toggleSpatialTree;
window.closeSpatialTree = closeSpatialTree;
window.handleTreeNodeClick = handleTreeNodeClick;
window.toggleTreeNode = toggleTreeNode;
window.changeSpatialTreeFile = changeSpatialTreeFile;
window.expandAllTreeNodes = expandAllTreeNodes;
window.collapseAllTreeNodes = collapseAllTreeNodes;

// =======================
// INITIALIZATION
// =======================

function initSpatialTreeListeners() {
    const toggleBtn = document.getElementById('toggleSpatialTreeBtn');
    const closeBtn = document.getElementById('closeSpatialTreeBtn');
    const overlay = document.getElementById('spatialTreeOverlay');
    const panel = document.getElementById('spatialTreePanel');

    if (panel) {
        panel.classList.remove('open');
    }
    if (overlay) {
        overlay.classList.remove('visible');
    }

    spatialTreeOpen = false;

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSpatialTree);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSpatialTree);
    }
    if (overlay) {
        overlay.addEventListener('click', closeSpatialTree);
    }
}

function initScrollSpeedLimiter() {
    const tableContainer = document.getElementById('tableContainer');
    if (!tableContainer) return;

    const MAX_SCROLL_SPEED = 100;

    tableContainer.addEventListener('wheel', (e) => {
        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;

        if (isHorizontal) {
            e.preventDefault();
            let delta = e.shiftKey ? e.deltaY : e.deltaX;

            if (Math.abs(delta) > MAX_SCROLL_SPEED) {
                delta = Math.sign(delta) * MAX_SCROLL_SPEED;
            }

            tableContainer.scrollLeft += delta;
        }
    }, { passive: false });
}

// Initialize IFC cache
window.initIFCCache().catch(() => {});

// Initialize listeners
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSpatialTreeListeners();
        initScrollSpeedLimiter();
    });
} else {
    initSpatialTreeListeners();
    initScrollSpeedLimiter();
}

// Language change handler
window.addEventListener('languageChanged', () => {
    const state = window.ViewerState;
    if (state.allData.length > 0) {
        window.updateUI();
        window.showStatistics();
        window.applyFiltersAndRender();
    }
});
