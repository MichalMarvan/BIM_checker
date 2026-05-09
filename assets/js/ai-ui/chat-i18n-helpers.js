/**
 * i18n helpers — re-export `t()` for module use, register
 * languageChanged listeners that re-render AI UI elements.
 */

export function t(key, params) {
    if (typeof window.t !== 'function') return key;
    let result = window.t(key);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, v);
        }
    }
    return result;
}

const _reRenderCallbacks = [];
let _wired = false;

export function onLanguageChange(callback) {
    _reRenderCallbacks.push(callback);
    if (!_wired) {
        window.addEventListener('languageChanged', () => {
            for (const cb of _reRenderCallbacks) {
                try { cb(); } catch (e) { console.warn('[ai-i18n] re-render error:', e); }
            }
        });
        _wired = true;
    }
}
