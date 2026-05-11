/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* ===========================================
   BIM CHECKER - VALIDATION PRESETS
   Persistent named presets + last-session auto-restore
   for the IDS-IFC validator.

   Storage: localStorage (sync, small payloads).
   Hydration: hits BIMStorage to resolve filenames -> file content.
   =========================================== */

(function () {
    'use strict';

    const PRESETS_KEY = 'bim_validation_presets';
    const LAST_SESSION_KEY = 'bim_validation_last_session';
    const DEBOUNCE_MS = 500;

    let _lastSessionTimer = null;
    let _lastSessionPending = null;
    // eslint-disable-next-line no-unused-vars
    let _disabled = false;

    function _safeParse(raw, fallback) {
        if (raw === null || raw === undefined) return fallback;
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[ValidationPresets] corrupted JSON, ignoring:', e);
            return fallback;
        }
    }

    function _readPresets() {
        return _safeParse(localStorage.getItem(PRESETS_KEY), []);
    }

    function _writePresets(arr) {
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(arr));
            return true;
        } catch (e) {
            if (e && e.name === 'QuotaExceededError') {
                if (typeof ErrorHandler !== 'undefined') {
                    ErrorHandler.error(typeof t === 'function' ? t('presets.quotaExceeded') : 'Storage quota exceeded');
                }
                return false;
            }
            _disabled = true;
            return false;
        }
    }

    window.ValidationPresets = {
        // Public API surface — implemented in subsequent tasks
        list() {
            const arr = _readPresets();
            return Array.isArray(arr) ? arr : [];
        },
        get(id) {
            return this.list().find(p => p.id === id) || null;
        },
        save(name, presetGroups) {
            const trimmed = String(name || '').trim();
            if (trimmed.length === 0) {
                throw new Error('Preset name is required');
            }
            const presets = this.list();
            const existing = presets.find(p => p.name === trimmed);
            const now = Date.now();
            if (existing) {
                existing.groups = presetGroups || [];
                existing.updatedAt = now;
                _writePresets(presets);
                return existing.id;
            }
            const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
            presets.push({
                id,
                name: trimmed,
                createdAt: now,
                updatedAt: now,
                groups: presetGroups || []
            });
            _writePresets(presets);
            return id;
        },
        delete(id) {
            const presets = this.list();
            const idx = presets.findIndex(p => p.id === id);
            if (idx === -1) return false;
            presets.splice(idx, 1);
            return _writePresets(presets);
        },
        saveLastSession(groups) {
            _lastSessionPending = {
                groups: Array.isArray(groups) ? groups : [],
                savedAt: Date.now()
            };
            if (_lastSessionTimer) clearTimeout(_lastSessionTimer);
            _lastSessionTimer = setTimeout(() => {
                try {
                    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(_lastSessionPending));
                } catch (e) {
                    if (e && e.name !== 'QuotaExceededError') _disabled = true;
                }
                _lastSessionTimer = null;
                _lastSessionPending = null;
            }, DEBOUNCE_MS);
        },

        loadLastSession() {
            return _safeParse(localStorage.getItem(LAST_SESSION_KEY), null);
        },

        flushLastSession() {
            if (_lastSessionTimer) {
                clearTimeout(_lastSessionTimer);
                _lastSessionTimer = null;
            }
            if (_lastSessionPending) {
                try {
                    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(_lastSessionPending));
                } catch (e) {
                    if (e && e.name !== 'QuotaExceededError') _disabled = true;
                }
                _lastSessionPending = null;
            }
        },
        toPresetGroups(validationGroups) {
            return (validationGroups || []).map(g => ({
                ifcFileNames: [
                    ...(g.ifcFiles || []).map(f => f.name),
                    ...(g.missingIfcNames || [])
                ],
                idsFileName: g.idsFile ? g.idsFile.name : (g.missingIdsName || null)
            }));
        },
        _internals: {
            _delete(key) {
                localStorage.removeItem(key);
            }
        },

        async fromPresetGroups(presetGroups) {
            if (typeof BIMStorage === 'undefined') return [];
            await BIMStorage.init();
            const result = [];
            for (const pg of (presetGroups || [])) {
                const ifcFiles = [];
                const missingIfcNames = [];
                for (const name of (pg.ifcFileNames || [])) {
                    try {
                        const meta = await BIMStorage.getFile('ifc', name);
                        if (meta) {
                            const content = await BIMStorage.getFileContent('ifc', meta.id);
                            ifcFiles.push({ id: meta.id, name: meta.name, size: meta.size, content });
                        } else {
                            missingIfcNames.push(name);
                        }
                    } catch (e) {
                        console.warn('[ValidationPresets] hydration failed for', name, e);
                        missingIfcNames.push(name);
                    }
                }
                let idsFile = null, missingIdsName = null;
                if (pg.idsFileName) {
                    try {
                        const meta = await BIMStorage.getFile('ids', pg.idsFileName);
                        if (meta) {
                            const content = await BIMStorage.getFileContent('ids', meta.id);
                            idsFile = { id: meta.id, name: meta.name, size: meta.size, content };
                        } else {
                            missingIdsName = pg.idsFileName;
                        }
                    } catch (e) {
                        console.warn('[ValidationPresets] hydration failed for', pg.idsFileName, e);
                        missingIdsName = pg.idsFileName;
                    }
                }
                result.push({
                    id: Date.now() + Math.floor(Math.random() * 1000000),
                    ifcFiles, idsFile,
                    missingIfcNames, missingIdsName
                });
            }
            return result;
        }
    };
})();
