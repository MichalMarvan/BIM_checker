/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* 3D viewer -> IFC multi-file viewer handoff. */
(function() {
    'use strict';

    const PARAM = 'handoff';

    function handoffKey(item) {
        if (typeof window.viewerEntityKey === 'function') {
            return window.viewerEntityKey(item);
        }
        const fileKey = item.fileId ? `id:${item.fileId}` : `name:${item.fileName || ''}`;
        const entityKey = item.guid
            ? `guid:${String(item.guid).toLowerCase()}`
            : `express:${item.ifcId || item.expressId || ''}`;
        return `${fileKey}|||${entityKey}`;
    }

    function fileKey(item) {
        if (typeof window.viewerFileKey === 'function') {
            return window.viewerFileKey(item.name || item.fileName, item.fileId || item.id);
        }
        return item.fileId || item.id
            ? `id:${item.fileId || item.id}`
            : `name:${item.name || item.fileName || ''}`;
    }

    function readPayload() {
        const key = new URLSearchParams(window.location.search).get(PARAM);
        if (!key) {
            return null;
        }
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) {
                return null;
            }
            sessionStorage.removeItem(key);
            const payload = JSON.parse(raw);
            return payload && payload.version === 1 ? payload : null;
        } catch (error) {
            console.warn('[viewer-handoff] invalid payload:', error);
            return null;
        }
    }

    function decodeIfcContent(raw) {
        if (raw instanceof ArrayBuffer) {
            return new TextDecoder('utf-8').decode(raw);
        }
        if (raw && raw.buffer instanceof ArrayBuffer) {
            return new TextDecoder('utf-8').decode(raw.buffer);
        }
        return String(raw || '');
    }

    async function findStorageFile(file) {
        if (!window.BIMStorage) {
            throw new Error('BIMStorage is not available');
        }
        const files = await window.BIMStorage.getFiles('ifc');
        const requestedId = file.fileId || file.id;
        if (requestedId) {
            return files.find(f => String(f.id) === String(requestedId)) || null;
        }
        return files.find(f => f.name === file.name) || null;
    }

    function buildFilter(payload) {
        const files = payload.files || [];
        const fileNames = new Set(files.map(f => f.name).filter(Boolean));
        const fileIds = new Set(files.map(f => f.fileId || f.id).filter(Boolean).map(String));
        const fileKeys = new Set(files.map(fileKey));
        const entities = payload.entities || [];
        const ifcIdsByFileKey = new Map();
        const guidsByFileKey = new Map();
        const rowKeys = new Set();

        for (const entity of entities) {
            const payloadFile = files.find(f => f.modelId === entity.modelId)
                || files.find(f => f.fileId && f.fileId === entity.fileId)
                || files.find(f => f.name === entity.fileName);
            const normalized = {
                fileName: entity.fileName || payloadFile?.name || '',
                fileId: entity.fileId || payloadFile?.fileId || payloadFile?.id || null,
                guid: entity.guid,
                ifcId: entity.ifcId || entity.expressId
            };
            const entityFileKey = fileKey(normalized);
            fileKeys.add(entityFileKey);
            if (normalized.fileId) {
                fileIds.add(String(normalized.fileId));
            }
            if (normalized.fileName) {
                fileNames.add(normalized.fileName);
            }

            if (!ifcIdsByFileKey.has(entityFileKey)) {
                ifcIdsByFileKey.set(entityFileKey, new Set());
            }
            if (normalized.ifcId) {
                ifcIdsByFileKey.get(entityFileKey).add(String(normalized.ifcId));
            }
            if (!guidsByFileKey.has(entityFileKey)) {
                guidsByFileKey.set(entityFileKey, new Set());
            }
            if (normalized.guid) {
                guidsByFileKey.get(entityFileKey).add(String(normalized.guid).toLowerCase());
            }
            rowKeys.add(handoffKey(normalized));
        }

        return {
            fileNames,
            fileIds,
            fileKeys,
            hasEntities: entities.length > 0,
            ifcIdsByFileKey,
            guidsByFileKey,
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
                const itemFileKey = fileKey(item);
                const fileOk = !filter.fileKeys.size || filter.fileKeys.has(itemFileKey);
                const idOk = filter.rowKeys.has(handoffKey(item))
                    || (item.guid && filter.guidsByFileKey.get(itemFileKey)?.has(String(item.guid).toLowerCase()))
                    || (filter.ifcIdsByFileKey.get(itemFileKey)?.has(String(item.ifcId)));
                if (fileOk && idOk) {
                    state.handoffRowKeys.add(handoffKey(item));
                    state.selectedEntities.add(handoffKey(item));
                }
            }
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        const entityFilter = document.getElementById('entityFilter');
        if (entityFilter) {
            entityFilter.value = '';
        }
        const fileFilter = document.getElementById('fileFilter');
        if (fileFilter) {
            fileFilter.value = '';
        }

        window.buildTable();
        window.updateSelectedCount();

        const fileCount = filter.fileKeys.size || (payload.files || []).length;
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
            if (window.ViewerState.loadedFiles.some(f => String(f.fileId) === String(storageFile.id))) {
                continue;
            }
            window.updateProgress(0, `Načítám z 3D vieweru (${i + 1}/${files.length}): ${storageFile.name}`);
            const raw = await window.BIMStorage.getFileContent('ifc', storageFile.id);
            await window.parseIFCAsync(decodeIfcContent(raw), storageFile.name, i + 1, files.length, storageFile.id);
        }
        window.combineData();
        window.updateUI();
        loading?.classList.remove('show');
    }

    async function boot() {
        const payload = readPayload();
        if (!payload) {
            return;
        }
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

    window.ViewerHandoff = { handoffKey, fileKey, buildFilter, applyHandoff };
})();
