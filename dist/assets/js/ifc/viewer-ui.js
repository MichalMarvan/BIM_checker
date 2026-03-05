/* ===========================================
   BIM CHECKER - IFC VIEWER UI
   Table rendering, filters, pagination, statistics
   =========================================== */

// =======================
// FILE HANDLING
// =======================

async function handleFiles(files) {
    const state = window.ViewerState;
    const ifcFiles = files.filter(f => f.name.endsWith('.ifc'));
    if (ifcFiles.length === 0) {
        ErrorHandler.error(i18n.t('validator.error.onlyIfc'));
        return;
    }

    document.getElementById('loading').classList.add('show');
    window.updateProgress(0, `${i18n.t('loading.files')} (0/${ifcFiles.length})`);

    try {
        for (let i = 0; i < ifcFiles.length; i++) {
            const file = ifcFiles[i];
            const content = await window.readFileAsync(file);
            await window.parseIFCAsync(content, file.name, i + 1, ifcFiles.length);
        }

        document.getElementById('loading').classList.remove('show');
        combineData();
        updateUI();

        // Dispatch event for wizard
        window.dispatchEvent(new CustomEvent('ifc:fileSelected'));
    } catch (error) {
        ErrorHandler.error(`${i18n.t('parser.error.parsingError')}: ${error.message}`);
        document.getElementById('loading').classList.remove('show');
    }
}

async function removeFile(index) {
    const state = window.ViewerState;
    const file = state.loadedFiles[index];

    await window.deleteIFCContent(file.fileName);

    state.loadedFiles.splice(index, 1);
    updateFileList();
    if (state.loadedFiles.length > 0) {
        combineData();
        updateUI();
    } else {
        document.getElementById('controls').style.display = 'none';
        document.getElementById('tableContainer').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('paginationContainer').style.display = 'none';
        document.getElementById('editPanel').classList.remove('active');

        state.allData.setArrays([]);
        state.filteredData = [];
        state.selectedEntities.clear();
        state.modifications = {};
        state.propertySetGroups = {};
        state.psetOrder = [];
        state.visiblePsets = {};
        state.currentPage = 1;
        state.editMode = false;

        const editModeBtn = document.getElementById('toggleEditModeBtn');
        if (editModeBtn) {
            editModeBtn.innerHTML = `✏️ ${i18n.t('viewer.editMode')}`;
        }
        document.body.classList.remove('edit-mode');
    }
}

function updateFileList() {
    const state = window.ViewerState;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    state.loadedFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-info">
                <div class="file-name">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${file.color}; margin-right: 8px;"></span>
                    ${window.escapeHtml(file.fileName)}
                    <span style="color: #6c757d; font-weight: normal; margin-left: 8px;">(${file.entityCount} ${i18n.t('viewer.entities')})</span>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile(${index})">×</button>
        `;
        fileList.appendChild(card);
    });
}

// =======================
// DATA COMBINATION
// =======================

function combineData() {
    const state = window.ViewerState;
    state.allData.setArrays(state.loadedFiles.map(f => f.data));

    const newPropertySetGroups = {};

    for (const file of state.loadedFiles) {
        for (const item of file.data) {
            for (const [psetName, props] of Object.entries(item.propertySets)) {
                if (!newPropertySetGroups[psetName]) {
                    newPropertySetGroups[psetName] = new Set();
                }
                for (const propName of Object.keys(props)) {
                    newPropertySetGroups[psetName].add(propName);
                }
            }
        }
    }

    for (const psetName of Object.keys(newPropertySetGroups)) {
        newPropertySetGroups[psetName] = Array.from(newPropertySetGroups[psetName]).sort();
    }

    if (state.psetOrder.length === 0) {
        state.propertySetGroups = newPropertySetGroups;
        state.psetOrder = Object.keys(state.propertySetGroups).sort();
        state.visiblePsets = {};
        for (const psetName of state.psetOrder) {
            state.visiblePsets[psetName] = {};
            for (const propName of state.propertySetGroups[psetName]) {
                state.visiblePsets[psetName][propName] = true;
            }
        }
    } else {
        const newPsetOrder = [...state.psetOrder.filter(name => newPropertySetGroups[name])];

        for (const psetName of Object.keys(newPropertySetGroups)) {
            if (!newPsetOrder.includes(psetName)) {
                newPsetOrder.push(psetName);
            }
        }

        const updatedPropertySetGroups = {};
        const updatedVisiblePsets = {};

        for (const psetName of newPsetOrder) {
            const newProps = newPropertySetGroups[psetName];

            if (state.propertySetGroups[psetName]) {
                const oldProps = state.propertySetGroups[psetName];
                const orderedProps = oldProps.filter(p => newProps.includes(p));

                for (const prop of newProps) {
                    if (!orderedProps.includes(prop)) {
                        orderedProps.push(prop);
                    }
                }

                updatedPropertySetGroups[psetName] = orderedProps;
                updatedVisiblePsets[psetName] = {};
                for (const propName of orderedProps) {
                    if (state.visiblePsets[psetName] && propName in state.visiblePsets[psetName]) {
                        updatedVisiblePsets[psetName][propName] = state.visiblePsets[psetName][propName];
                    } else {
                        updatedVisiblePsets[psetName][propName] = true;
                    }
                }
            } else {
                updatedPropertySetGroups[psetName] = newProps;
                updatedVisiblePsets[psetName] = {};
                for (const propName of newProps) {
                    updatedVisiblePsets[psetName][propName] = true;
                }
            }
        }

        state.psetOrder = newPsetOrder;
        state.propertySetGroups = updatedPropertySetGroups;
        state.visiblePsets = updatedVisiblePsets;
    }
}

// =======================
// UI UPDATE
// =======================

function updateUI() {
    const state = window.ViewerState;

    const entityFilter = document.getElementById('entityFilter');
    const entities = [...new Set(state.allData.map(item => item.entity))].sort();
    entityFilter.textContent = '';
    const defaultEntityOption = document.createElement('option');
    defaultEntityOption.value = '';
    defaultEntityOption.textContent = i18n.t('viewer.allEntities');
    entityFilter.appendChild(defaultEntityOption);
    for (const entity of entities) {
        const option = document.createElement('option');
        option.value = entity;
        option.textContent = entity;
        entityFilter.appendChild(option);
    }

    const fileFilter = document.getElementById('fileFilter');
    fileFilter.textContent = '';
    const defaultFileOption = document.createElement('option');
    defaultFileOption.value = '';
    defaultFileOption.textContent = i18n.t('viewer.allFiles');
    fileFilter.appendChild(defaultFileOption);
    state.loadedFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file.fileName;
        option.textContent = file.fileName;
        fileFilter.appendChild(option);
    });

    document.getElementById('controls').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';

    buildPsetManager();
    buildTable();
    showStatistics();
}

// =======================
// PROPERTY SET MANAGER
// =======================

let draggedItem = null;
let dragType = null;

function buildPsetManager() {
    const state = window.ViewerState;
    const psetList = document.getElementById('psetList');
    psetList.innerHTML = '';

    for (let i = 0; i < state.psetOrder.length; i++) {
        const psetName = state.psetOrder[i];
        if (!state.propertySetGroups[psetName]) {
            continue;
        }

        const group = document.createElement('div');
        group.className = 'pset-group';
        group.dataset.psetIndex = i;
        group.dataset.psetName = psetName;

        const header = document.createElement('div');
        header.className = 'pset-group-header';
        header.draggable = true;

        const allVisible = state.propertySetGroups[psetName].every(p => state.visiblePsets[psetName][p]);
        header.innerHTML = `
            <span class="drag-handle">☰</span>
            <input type="checkbox" id="pset-${i}" ${allVisible ? 'checked' : ''}>
            <label for="pset-${i}" style="flex: 1; cursor: pointer; font-weight: 700; color: #764ba2;">
                ${window.escapeHtml(psetName)} (${state.propertySetGroups[psetName].length})
            </label>
        `;

        const checkbox = header.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            for (const propName of state.propertySetGroups[psetName]) {
                state.visiblePsets[psetName][propName] = e.target.checked;
            }
            buildPsetManager();
        });

        header.addEventListener('dragstart', (e) => handlePsetDragStart(e, group));
        header.addEventListener('dragend', handleDragEnd);

        group.appendChild(header);

        for (let j = 0; j < state.propertySetGroups[psetName].length; j++) {
            const propName = state.propertySetGroups[psetName][j];
            const propItem = document.createElement('div');
            propItem.className = 'prop-item';
            propItem.draggable = true;
            propItem.dataset.propIndex = j;
            propItem.dataset.psetName = psetName;

            propItem.innerHTML = `
                <span class="drag-handle">⋮</span>
                <input type="checkbox" id="prop-${psetName}-${propName}" ${state.visiblePsets[psetName][propName] ? 'checked' : ''}>
                <label for="prop-${psetName}-${propName}" style="flex: 1; cursor: pointer;">${window.escapeHtml(propName)}</label>
            `;

            const propCheckbox = propItem.querySelector('input');
            propCheckbox.addEventListener('change', (e) => {
                e.stopPropagation();
                state.visiblePsets[psetName][propName] = e.target.checked;
            });

            propItem.addEventListener('dragstart', (e) => handlePropDragStart(e, propItem));
            propItem.addEventListener('dragend', handleDragEnd);

            group.appendChild(propItem);
        }

        group.addEventListener('dragover', handleDragOver);
        group.addEventListener('drop', (e) => handleDrop(e, group));

        psetList.appendChild(group);
    }

    setupAutoScroll();
}

function handlePsetDragStart(e, group) {
    draggedItem = group;
    dragType = 'pset';
    group.classList.add('dragging');
    e.stopPropagation();
}

function handlePropDragStart(e, propItem) {
    draggedItem = propItem;
    dragType = 'prop';
    propItem.classList.add('dragging');
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e, targetGroup) {
    const state = window.ViewerState;
    e.stopPropagation();
    e.preventDefault();

    if (!draggedItem) {
        return;
    }

    if (dragType === 'pset') {
        if (draggedItem !== targetGroup) {
            const fromIndex = parseInt(draggedItem.dataset.psetIndex);
            const toIndex = parseInt(targetGroup.dataset.psetIndex);
            const item = state.psetOrder[fromIndex];
            state.psetOrder.splice(fromIndex, 1);
            state.psetOrder.splice(toIndex, 0, item);
            buildPsetManager();
        }
    } else if (dragType === 'prop') {
        const fromPsetName = draggedItem.dataset.psetName;
        const toPsetName = targetGroup.dataset.psetName;

        if (fromPsetName === toPsetName) {
            const fromIndex = parseInt(draggedItem.dataset.propIndex);
            const propItems = targetGroup.querySelectorAll('.prop-item');
            let toIndex = -1;

            propItems.forEach((item, idx) => {
                const rect = item.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                if (e.clientY < midpoint && toIndex === -1) {
                    toIndex = idx;
                }
            });

            if (toIndex === -1) {
                toIndex = propItems.length - 1;
            }

            if (fromIndex !== toIndex) {
                const propArray = state.propertySetGroups[fromPsetName];
                const prop = propArray[fromIndex];
                propArray.splice(fromIndex, 1);
                propArray.splice(toIndex, 0, prop);
                buildPsetManager();
            }
        }
    }
}

function handleDragEnd() {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    draggedItem = null;
    dragType = null;
    stopAutoScroll();
}

function setupAutoScroll() {
    const state = window.ViewerState;
    const psetList = document.getElementById('psetList');

    psetList.addEventListener('dragover', (e) => {
        const rect = psetList.getBoundingClientRect();
        const scrollMargin = 50;
        const scrollSpeed = 10;

        if (e.clientY - rect.top < scrollMargin) {
            startAutoScroll(psetList, -scrollSpeed);
        } else if (rect.bottom - e.clientY < scrollMargin) {
            startAutoScroll(psetList, scrollSpeed);
        } else {
            stopAutoScroll();
        }
    });

    psetList.addEventListener('dragleave', () => {
        stopAutoScroll();
    });
}

function startAutoScroll(element, speed) {
    const state = window.ViewerState;
    if (state.autoScrollInterval) {
        return;
    }
    state.autoScrollInterval = setInterval(() => {
        element.scrollTop += speed;
    }, 50);
}

function stopAutoScroll() {
    const state = window.ViewerState;
    if (state.autoScrollInterval) {
        clearInterval(state.autoScrollInterval);
        state.autoScrollInterval = null;
    }
}

// =======================
// TABLE BUILDING
// =======================

function buildTable() {
    const state = window.ViewerState;
    const headerPset = document.getElementById('headerRowPset');
    const headerProp = document.getElementById('headerRowProp');

    headerPset.innerHTML = '';
    headerProp.innerHTML = '';

    const fileColWidth = 150;

    if (state.editMode) {
        const checkHeader = document.createElement('th');
        checkHeader.innerHTML = '<input type="checkbox" id="selectAllCheckbox">';
        checkHeader.rowSpan = 2;
        checkHeader.classList.add('sticky-col', 'checkbox-cell');
        checkHeader.style.left = '0px';
        headerPset.appendChild(checkHeader);

        document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
            const startIndex = state.pageSize === -1 ? 0 : (state.currentPage - 1) * state.pageSize;
            const endIndex = state.pageSize === -1 ? state.filteredData.length : Math.min(startIndex + state.pageSize, state.filteredData.length);
            const pageData = state.filteredData.slice(startIndex, endIndex);
            if (e.target.checked) {
                pageData.forEach(item => state.selectedEntities.add(item.guid));
            } else {
                pageData.forEach(item => state.selectedEntities.delete(item.guid));
            }
            updateSelectedCount();
            renderTable();
        });
    }

    const fileHeader = document.createElement('th');
    fileHeader.textContent = i18n.t('viewer.file');
    fileHeader.rowSpan = 2;
    fileHeader.style.cursor = 'pointer';
    fileHeader.classList.add('sticky-col');
    fileHeader.style.left = state.editMode ? '40px' : '0px';
    fileHeader.addEventListener('click', () => sortByColumn('__file__'));
    headerPset.appendChild(fileHeader);

    let currentLeft = (state.editMode ? 40 : 0) + fileColWidth;

    const lockedCols = [];
    const unlockedCols = [];

    for (const psetName of state.psetOrder) {
        if (!state.propertySetGroups[psetName]) {
            continue;
        }
        const visibleProps = state.propertySetGroups[psetName].filter(p => state.visiblePsets[psetName][p]);

        for (const propName of visibleProps) {
            const col = { psetName, propName };
            const isLocked = state.lockedColumns.some(lc => lc.psetName === psetName && lc.propName === propName);

            if (isLocked) {
                lockedCols.push(col);
            } else {
                unlockedCols.push(col);
            }
        }
    }

    if (lockedCols.length > 0) {
        for (const col of lockedCols) {
            const psetTh = document.createElement('th');
            psetTh.className = 'pset-header sticky-col';
            psetTh.textContent = col.psetName;
            psetTh.style.left = currentLeft + 'px';
            psetTh.style.width = '120px';

            headerPset.appendChild(psetTh);
            currentLeft += 120;
        }
    }

    const fixedColumns = [
        { id: 'GUID', label: 'GUID' },
        { id: '__entity__', label: i18n.t('viewer.csv.entity') },
        { id: 'Name', label: 'Name' },
        { id: 'Layer', label: 'Layer' }
    ];
    fixedColumns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.rowSpan = 2;
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => sortByColumn(col.id));
        headerPset.appendChild(th);
    });

    const unlockedGrouped = {};
    for (const col of unlockedCols) {
        if (!unlockedGrouped[col.psetName]) {
            unlockedGrouped[col.psetName] = [];
        }
        unlockedGrouped[col.psetName].push(col);
    }

    for (const psetName of Object.keys(unlockedGrouped)) {
        const psetTh = document.createElement('th');
        psetTh.className = 'pset-header';
        psetTh.textContent = psetName;
        psetTh.colSpan = unlockedGrouped[psetName].length;
        headerPset.appendChild(psetTh);
    }

    currentLeft = fileColWidth;

    for (const col of lockedCols) {
        const propTh = document.createElement('th');
        propTh.className = 'prop-header sticky-col';
        propTh.style.cursor = 'pointer';
        propTh.style.left = currentLeft + 'px';

        const wrapper = document.createElement('span');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.gap = '5px';

        const label = document.createElement('span');
        label.textContent = col.propName;
        label.style.flex = '1';
        label.addEventListener('click', () => sortByProperty(col.psetName, col.propName));

        const lockIcon = document.createElement('span');
        lockIcon.className = 'lock-icon locked';
        lockIcon.textContent = '🔒';
        lockIcon.title = i18n.t('viewer.unlockColumn');
        lockIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLockColumn(col.psetName, col.propName);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(lockIcon);
        propTh.appendChild(wrapper);
        headerProp.appendChild(propTh);

        currentLeft += 120;
    }

    for (const col of unlockedCols) {
        const propTh = document.createElement('th');
        propTh.className = 'prop-header';
        propTh.style.cursor = 'pointer';

        const wrapper = document.createElement('span');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.gap = '5px';

        const label = document.createElement('span');
        label.textContent = col.propName;
        label.style.flex = '1';
        label.addEventListener('click', () => sortByProperty(col.psetName, col.propName));

        const lockIcon = document.createElement('span');
        lockIcon.className = 'lock-icon';
        lockIcon.textContent = '🔓';
        lockIcon.title = i18n.t('viewer.lockColumn');
        lockIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLockColumn(col.psetName, col.propName);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(lockIcon);
        propTh.appendChild(wrapper);
        headerProp.appendChild(propTh);
    }

    window.currentColumns = [...lockedCols, ...unlockedCols];

    applyFiltersAndRender();
}

function toggleLockColumn(psetName, propName) {
    const state = window.ViewerState;
    const index = state.lockedColumns.findIndex(lc => lc.psetName === psetName && lc.propName === propName);

    if (index !== -1) {
        state.lockedColumns.splice(index, 1);
    } else {
        state.lockedColumns.push({ psetName, propName });
    }

    buildTable();
}

// =======================
// SORTING
// =======================

function sortByColumn(colName) {
    const state = window.ViewerState;
    if (state.sortColumn === colName) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = colName;
        state.sortDirection = 'asc';
    }
    applyFiltersAndRender();
}

function sortByProperty(psetName, propName) {
    const state = window.ViewerState;
    const key = `${psetName}|||${propName}`;
    if (state.sortColumn === key) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = key;
        state.sortDirection = 'asc';
    }
    applyFiltersAndRender();
}

// =======================
// FILTERING AND RENDERING
// =======================

function applyFiltersAndRender() {
    const state = window.ViewerState;
    state.filteredData = [...state.allData];

    if (window.selectedSpatialIds && window.selectedSpatialIds.size > 0) {
        state.filteredData = state.filteredData.filter(item => {
            return item.ifcId && window.selectedSpatialIds.has(item.ifcId) &&
                   item.fileName === window.selectedSpatialFileName;
        });
    }

    if (state.searchTerm && !state.searchTerm.startsWith('🌳')) {
        const trimmedSearch = state.searchTerm.trim();
        const columnSpecificMatch = trimmedSearch.match(/^(\S+)\s+(.+)$/);

        if (columnSpecificMatch) {
            const columnName = columnSpecificMatch[1];
            const searchPattern = columnSpecificMatch[2];
            const regexMatch = searchPattern.match(/^\/(.+?)\/([gimuy]*)$/);

            if (regexMatch) {
                try {
                    const pattern = regexMatch[1];
                    const flags = regexMatch[2];
                    const regex = new RegExp(pattern, flags);

                    state.filteredData = state.filteredData.filter(item => {
                        if (columnName === 'GUID' && regex.test(item.guid)) {
                            return true;
                        }
                        if ((columnName === 'Entita' || columnName === 'Entity') && regex.test(item.entity)) {
                            return true;
                        }
                        if (columnName === 'Name' && regex.test(item.name)) {
                            return true;
                        }
                        if ((columnName === 'Soubor' || columnName === 'File') && regex.test(item.fileName)) {
                            return true;
                        }

                        for (const [psetName, pset] of Object.entries(item.propertySets)) {
                            for (const [propName, value] of Object.entries(pset)) {
                                if (propName === columnName || `${psetName}.${propName}` === columnName) {
                                    if (regex.test(String(value))) {
                                        return true;
                                    }
                                }
                            }
                        }
                        return false;
                    });
                } catch (e) {
                    ErrorHandler.error(`${i18n.t('viewer.invalidRegex')}: ${e.message}`);
                }
            } else {
                const searchLower = searchPattern.toLowerCase();

                state.filteredData = state.filteredData.filter(item => {
                    if (columnName === 'GUID' && item.guid.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    if ((columnName === 'Entita' || columnName === 'Entity') && item.entity.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    if (columnName === 'Name' && item.name.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    if ((columnName === 'Soubor' || columnName === 'File') && item.fileName.toLowerCase().includes(searchLower)) {
                        return true;
                    }

                    for (const [psetName, pset] of Object.entries(item.propertySets)) {
                        for (const [propName, value] of Object.entries(pset)) {
                            if (propName === columnName || `${psetName}.${propName}` === columnName) {
                                if (String(value).toLowerCase().includes(searchLower)) {
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                });
            }
        } else {
            const regexMatch = trimmedSearch.match(/^\/(.+?)\/([gimuy]*)$/);

            if (regexMatch) {
                try {
                    const pattern = regexMatch[1];
                    const flags = regexMatch[2];
                    const regex = new RegExp(pattern, flags);

                    state.filteredData = state.filteredData.filter(item => {
                        if (regex.test(item.guid)) {
                            return true;
                        }
                        if (regex.test(item.entity)) {
                            return true;
                        }
                        if (regex.test(item.name)) {
                            return true;
                        }
                        if (regex.test(item.fileName)) {
                            return true;
                        }

                        for (const pset of Object.values(item.propertySets)) {
                            for (const [key, value] of Object.entries(pset)) {
                                if (regex.test(key) || regex.test(String(value))) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                } catch (e) {
                    ErrorHandler.error(`${i18n.t('viewer.invalidRegex')}: ${e.message}`);
                }
            } else {
                const searchWords = trimmedSearch.toLowerCase().split(/\s+/).filter(w => w.length > 0);

                state.filteredData = state.filteredData.filter(item => {
                    return searchWords.every(word => {
                        if (item.guid.toLowerCase().includes(word)) {
                            return true;
                        }
                        if (item.entity.toLowerCase().includes(word)) {
                            return true;
                        }
                        if (item.name.toLowerCase().includes(word)) {
                            return true;
                        }
                        if (item.fileName.toLowerCase().includes(word)) {
                            return true;
                        }

                        for (const pset of Object.values(item.propertySets)) {
                            for (const [key, value] of Object.entries(pset)) {
                                if (key.toLowerCase().includes(word) ||
                                    String(value).toLowerCase().includes(word)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                });
            }
        }
    }

    if (state.entityFilterValue) {
        state.filteredData = state.filteredData.filter(item => item.entity === state.entityFilterValue);
    }

    if (state.fileFilterValue) {
        state.filteredData = state.filteredData.filter(item => item.fileName === state.fileFilterValue);
    }

    if (state.sortColumn) {
        state.filteredData.sort((a, b) => {
            let valA, valB;

            if (state.sortColumn === '__file__') {
                valA = a.fileName;
                valB = b.fileName;
            } else if (state.sortColumn === 'GUID') {
                valA = a.guid;
                valB = b.guid;
            } else if (state.sortColumn === '__entity__') {
                valA = a.entity;
                valB = b.entity;
            } else if (state.sortColumn === 'Name') {
                valA = a.name;
                valB = b.name;
            } else if (state.sortColumn === 'Layer') {
                valA = a.layer || '';
                valB = b.layer || '';
            } else {
                const [psetName, propName] = state.sortColumn.split('|||');
                valA = a.propertySets[psetName]?.[propName] || '';
                valB = b.propertySets[psetName]?.[propName] || '';
            }

            if (valA < valB) {
                return state.sortDirection === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return state.sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    state.currentPage = 1;
    renderTable();
}

function renderTable() {
    const state = window.ViewerState;
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (state.filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="100" style="text-align:center; padding:40px;">${i18n.t('viewer.noData')}</td></tr>`;
        updatePaginationInfo();
        return;
    }

    state.totalPages = state.pageSize === -1 ? 1 : Math.ceil(state.filteredData.length / state.pageSize);
    state.currentPage = Math.min(state.currentPage, state.totalPages);
    state.currentPage = Math.max(1, state.currentPage);

    const startIndex = state.pageSize === -1 ? 0 : (state.currentPage - 1) * state.pageSize;
    const endIndex = state.pageSize === -1 ? state.filteredData.length : Math.min(startIndex + state.pageSize, state.filteredData.length);
    const pageData = state.filteredData.slice(startIndex, endIndex);

    const fileColWidth = 150;

    for (const item of pageData) {
        const row = document.createElement('tr');

        if (state.editMode) {
            const checkCell = document.createElement('td');
            checkCell.classList.add('sticky-col', 'checkbox-cell');
            checkCell.style.left = '0px';
            checkCell.innerHTML = `<input type="checkbox" ${state.selectedEntities.has(item.guid) ? 'checked' : ''}>`;
            checkCell.querySelector('input').addEventListener('change', () => {
                toggleEntitySelection(item.guid);
                renderTable();
            });
            row.appendChild(checkCell);
        }

        const fileInfo = state.loadedFiles.find(f => f.fileName === item.fileName);
        const fileCell = document.createElement('td');
        const fileBadge = document.createElement('span');
        fileBadge.className = 'file-badge';
        fileBadge.style.background = fileInfo.color;
        fileBadge.title = item.fileName;
        fileBadge.textContent = item.fileName;
        fileCell.appendChild(fileBadge);
        fileCell.classList.add('sticky-col');
        fileCell.style.left = state.editMode ? '40px' : '0px';
        row.appendChild(fileCell);

        let currentLeft = (state.editMode ? 40 : 0) + fileColWidth;

        const lockedCols = [];
        const unlockedCols = [];

        const columns = window.currentColumns || [];
        for (const col of columns) {
            const isLocked = state.lockedColumns.some(lc => lc.psetName === col.psetName && lc.propName === col.propName);
            if (isLocked) {
                lockedCols.push(col);
            } else {
                unlockedCols.push(col);
            }
        }

        for (const col of lockedCols) {
            const cell = document.createElement('td');
            const value = item.propertySets[col.psetName]?.[col.propName];
            cell.textContent = value || '-';
            cell.style.color = value ? '#212529' : '#ccc';
            cell.classList.add('sticky-col');
            cell.style.left = currentLeft + 'px';

            if (state.editMode) {
                cell.classList.add('editable');
                cell.addEventListener('click', () => window.makeEditable(cell, item.guid, col.psetName, col.propName));
            }

            if (state.modifications[item.guid]?.[col.psetName]?.[col.propName] !== undefined) {
                cell.classList.add('modified-cell');
            }

            row.appendChild(cell);
            currentLeft += 120;
        }

        const guidCell = document.createElement('td');
        guidCell.className = 'guid-cell';
        guidCell.textContent = item.guid;
        row.appendChild(guidCell);

        const entityCell = document.createElement('td');
        const entityBadge = document.createElement('span');
        entityBadge.className = 'entity-badge';
        entityBadge.textContent = item.entity;
        entityCell.appendChild(entityBadge);
        row.appendChild(entityCell);

        const nameCell = document.createElement('td');
        nameCell.textContent = item.name;
        row.appendChild(nameCell);

        const layerCell = document.createElement('td');
        layerCell.textContent = item.layer || '-';
        layerCell.style.color = item.layer && item.layer !== '-' ? '#212529' : '#ccc';
        row.appendChild(layerCell);

        for (const col of unlockedCols) {
            const cell = document.createElement('td');
            const value = item.propertySets[col.psetName]?.[col.propName];
            cell.textContent = value || '-';
            cell.style.color = value ? '#212529' : '#ccc';

            if (state.editMode) {
                cell.classList.add('editable');
                cell.addEventListener('click', () => window.makeEditable(cell, item.guid, col.psetName, col.propName));
            }

            if (state.modifications[item.guid]?.[col.psetName]?.[col.propName] !== undefined) {
                cell.classList.add('modified-cell');
            }

            row.appendChild(cell);
        }

        tbody.appendChild(row);
    }

    updatePaginationInfo();
}

function updatePaginationInfo() {
    const state = window.ViewerState;
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const totalPagesSpan = document.getElementById('totalPages');
    const pageInput = document.getElementById('pageInput');

    if (state.filteredData.length === 0) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    const startIndex = state.pageSize === -1 ? 0 : (state.currentPage - 1) * state.pageSize;
    const endIndex = state.pageSize === -1 ? state.filteredData.length : Math.min(startIndex + state.pageSize, state.filteredData.length);

    paginationInfo.textContent = `${i18n.t('viewer.paginationInfo')} ${startIndex + 1}-${endIndex} ${i18n.t('viewer.of')} ${state.filteredData.length} ${i18n.t('viewer.entities')}`;
    totalPagesSpan.textContent = state.totalPages;
    pageInput.value = state.currentPage;
    pageInput.max = state.totalPages;

    document.getElementById('firstPageBtn').disabled = state.currentPage === 1;
    document.getElementById('prevPageBtn').disabled = state.currentPage === 1;
    document.getElementById('nextPageBtn').disabled = state.currentPage === state.totalPages;
    document.getElementById('lastPageBtn').disabled = state.currentPage === state.totalPages;
}

// =======================
// STATISTICS
// =======================

function showStatistics() {
    const state = window.ViewerState;
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = '';

    const totalCard = document.createElement('div');
    totalCard.style.cssText = 'background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #667eea;';
    totalCard.innerHTML = `
        <div style="font-size: 2em; font-weight: 700; color: #667eea;">${state.allData.length}</div>
        <div style="font-size: 0.85em; color: #6c757d;">${i18n.t('viewer.totalEntities')}</div>
    `;
    statsGrid.appendChild(totalCard);

    state.loadedFiles.forEach(file => {
        const card = document.createElement('div');
        card.style.cssText = `background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid ${file.color};`;
        card.innerHTML = `
            <div style="font-size: 2em; font-weight: 700; color: ${file.color};">${file.entityCount}</div>
            <div style="font-size: 0.85em; color: #6c757d;">${window.escapeHtml(file.fileName)}</div>
        `;
        statsGrid.appendChild(card);
    });

    const entityCounts = {};
    for (const item of state.allData) {
        entityCounts[item.entity] = (entityCounts[item.entity] || 0) + 1;
    }
    const sorted = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

    for (const [entity, count] of sorted) {
        const card = document.createElement('div');
        card.style.cssText = 'background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #e9ecef;';
        card.innerHTML = `
            <div style="font-size: 2em; font-weight: 700; color: #667eea;">${count}</div>
            <div style="font-size: 0.85em; color: #6c757d;">${entity}</div>
        `;
        statsGrid.appendChild(card);
    }
}

// =======================
// ENTITY SELECTION
// =======================

function toggleEntitySelection(guid) {
    const state = window.ViewerState;
    if (state.selectedEntities.has(guid)) {
        state.selectedEntities.delete(guid);
    } else {
        state.selectedEntities.add(guid);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const state = window.ViewerState;
    const count = state.selectedEntities.size;
    const totalFiltered = state.filteredData.length;

    document.getElementById('selectedCount').textContent = count;

    const totalFilteredSpan = document.getElementById('totalFilteredCount');
    if (totalFilteredSpan) {
        if (totalFiltered > 0) {
            totalFilteredSpan.textContent = `(${i18n.t('viewer.ofTotal')} ${totalFiltered} ${i18n.t('viewer.total')})`;
        } else {
            totalFilteredSpan.textContent = '';
        }
    }

    const bulkBtn = document.getElementById('bulkEditBtn');
    const addBtn = document.getElementById('addPsetBtn');
    const renameBtn = document.getElementById('renamePsetBtn');
    const renamePropBtn = document.getElementById('renamePropertyBtn');
    const exportBtn = document.getElementById('exportIfcBtn');

    if (bulkBtn) {
        bulkBtn.disabled = count === 0;
    }
    if (addBtn) {
        addBtn.disabled = count === 0;
    }
    if (renameBtn) {
        renameBtn.disabled = count === 0;
    }
    if (renamePropBtn) {
        renamePropBtn.disabled = count === 0;
    }
    if (exportBtn) {
        exportBtn.disabled = Object.keys(state.modifications).length === 0;
    }
}

// Export to window
window.handleFiles = handleFiles;
window.removeFile = removeFile;
window.updateFileList = updateFileList;
window.combineData = combineData;
window.updateUI = updateUI;
window.buildPsetManager = buildPsetManager;
window.buildTable = buildTable;
window.toggleLockColumn = toggleLockColumn;
window.sortByColumn = sortByColumn;
window.sortByProperty = sortByProperty;
window.applyFiltersAndRender = applyFiltersAndRender;
window.renderTable = renderTable;
window.updatePaginationInfo = updatePaginationInfo;
window.showStatistics = showStatistics;
window.toggleEntitySelection = toggleEntitySelection;
window.updateSelectedCount = updateSelectedCount;
