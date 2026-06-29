/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* 3D viewer -> IFC multi-file viewer handoff. */
(function() {
    'use strict';

    const PARAM = 'handoff';

    function handoffKey(item) {
        if (typeof window.handoffRowKey === 'function') return window.handoffRowKey(item);
        return `${item.fileName || ''}|||${item.guid || ''}|||${item.ifcId || ''}`;
    }

    function readPayload() {
        const key = new URLSearchParams(window.location.search).get(PARAM);
        if (!key) return null;
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            sessionStorage.removeItem(key);
            const payload = JSON.parse(raw);
            return payload && payload.version === 1 ? payload : null;
        } catch (error) {
            console.warn('[viewer-handoff] invalid payload:', error);
            return null;
        }
    }

    function decodeIfcContent(raw) {
        if (raw instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(raw);
        if (raw && raw.buffer instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(raw.buffer);
        return String(raw || '');
    }

    async function findStorageFile(file) {
        if (!window.BIMStorage) throw new Error('BIMStorage is not available');
        const files = await window.BIMStorage.getFiles('ifc');
        return files.find(f => f.id === file.fileId)
            || files.find(f => f.id === file.id)
            || files.find(f => f.name === file.name)
            || null;
    }

    function buildFilter(payload) {
        const fileNames = new Set((payload.files || []).map(f => f.name).filter(Boolean));
        const entities = payload.entities || [];
        const ifcIdsByFile = new Map();
        const guids = new Set();
        const rowKeys = new Set();

        for (const entity of entities) {
            const fileName = entity.fileName || (payload.files || []).find(f => f.modelId === entity.modelId)?.name || '';
            if (fileName) {
                if (!ifcIdsByFile.has(fileName)) ifcIdsByFile.set(fileName, new Set());
                if (entity.ifcId || entity.expressId) ifcIdsByFile.get(fileName).add(String(entity.ifcId || entity.expressId));
            }
            if (entity.guid) guids.add(String(entity.guid).toLowerCase());
            rowKeys.add(`${fileName}|||${entity.guid || ''}|||${entity.ifcId || entity.expressId || ''}`);
        }

        return {
            fileNames,
            hasEntities: entities.length > 0,
            ifcIdsByFile,
            guids,
            rowKeys,
        };
    }

    function applyHandoff(payload) {
        const state = window.ViewerState;
        const filter = buildFilter(payload);
        state.handoffFilter = filter;
        state.handoffRowKeys = new Set();
        state.selectedEntities.clear();
        state.searchTerm = '';
        state.entityFilterValue = '';
        state.fileFilterValue = '';

        if (filter.hasEntities) {
            for (const item of state.allData) {
                const fileOk = !filter.fileNames.size || filter.fileNames.has(item.fileName);
                const idOk = filter.rowKeys.has(handoffKey(item))
                    || (item.guid && filter.guids.has(String(item.guid).toLowerCase()))
                    || (filter.ifcIdsByFile.get(item.fileName)?.has(String(item.ifcId)));
                if (fileOk && idOk) {
                    state.handoffRowKeys.add(handoffKey(item));
                    if (item.guid) state.selectedEntities.add(item.guid);
                }
            }
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        const entityFilter = document.getElementById('entityFilter');
        if (entityFilter) entityFilter.value = '';
        const fileFilter = document.getElementById('fileFilter');
        if (fileFilter) fileFilter.value = '';

        window.buildTable();
        window.updateSelectedCount();

        const fileCount = filter.fileNames.size || (payload.files || []).length;
        const entityCount = state.handoffRowKeys.size;
        const msg = filter.hasEntities
            ? `Načteno z 3D vieweru: ${entityCount} prvků v ${fileCount} IFC.`
            : `Načteno z 3D vieweru: ${fileCount} IFC modelů.`;
        window.ErrorHandler?.success?.(msg);
    }

    async function loadPayloadFiles(payload) {
        await window.BIMStorageBackendRestore?.ready;
        await window.BIMStorage?.init?.();

        const loading = document.getElementById('loading');
        loading?.classList.add('show');
        const files = payload.files || [];
        for (let i = 0; i < files.length; i++) {
            const storageFile = await findStorageFile(files[i]);
            if (!storageFile) {
                console.warn('[viewer-handoff] file not found in storage:', files[i]);
                continue;
            }
            if (window.ViewerState.loadedFiles.some(f => f.fileName === storageFile.name)) continue;
            window.updateProgress(0, `Načítám z 3D vieweru (${i + 1}/${files.length}): ${storageFile.name}`);
            const raw = await window.BIMStorage.getFileContent('ifc', storageFile.id);
            await window.parseIFCAsync(decodeIfcContent(raw), storageFile.name, i + 1, files.length);
        }
        window.combineData();
        window.updateUI();
        loading?.classList.remove('show');
    }

    async function boot() {
        const payload = readPayload();
        if (!payload) return;
        try {
            await loadPayloadFiles(payload);
            applyHandoff(payload);
        } catch (error) {
            document.getElementById('loading')?.classList.remove('show');
            console.error('[viewer-handoff] failed:', error);
            window.ErrorHandler?.error?.(`Nepodařilo se otevřít data z 3D vieweru: ${error.message || error}`);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
    } else {
        setTimeout(boot, 0);
    }
})();
