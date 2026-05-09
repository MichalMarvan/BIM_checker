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
        if (raw == null) return fallback;
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
        get() { return null; },
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
        delete() { return false; },
        saveLastSession() {},
        loadLastSession() { return null; },
        flushLastSession() {},
        toPresetGroups() { return []; },
        async fromPresetGroups() { return []; }
    };
})();
