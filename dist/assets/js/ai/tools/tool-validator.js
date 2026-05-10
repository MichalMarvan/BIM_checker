import * as helpers from './_helpers.js';

export async function list_validation_groups() {
    if (typeof window.ValidationPresets === 'undefined') return [];
    const last = window.ValidationPresets.loadLastSession();
    if (!last || !Array.isArray(last.groups)) return [];
    return last.groups.map((g, i) => ({
        index: i,
        ifcFileNames: g.ifcFileNames || [],
        idsFileName: g.idsFileName || null,
        hasResults: false
    }));
}

export async function get_validation_results() {
    if (helpers.getCurrentPageId() !== 'validator') {
        return {
            error: 'wrong_page',
            message: 'Výsledky validace jsou viditelné jen na stránce Validator.'
        };
    }
    if (!Array.isArray(window.validationResults) || window.validationResults.length === 0) {
        return { empty: true, message: 'Validace nebyla spuštěna nebo výsledky chybí.' };
    }
    return {
        groups: window.validationResults.map((r, i) => ({
            index: i,
            ifcCount: r.ifcFiles?.length || 0,
            idsName: r.idsFile?.name || null,
            passed: r.summary?.passed || 0,
            failed: r.summary?.failed || 0,
            total: r.summary?.total || 0
        }))
    };
}

export async function add_validation_group(args) {
    helpers.validateArgs(args, {
        ifcFileNames: { required: true },
        idsFileName: { required: true }
    });
    if (!Array.isArray(args.ifcFileNames)) {
        throw new Error('ifcFileNames must be an array of strings');
    }
    if (typeof window.ValidationPresets === 'undefined') {
        throw new Error('ValidationPresets not available');
    }
    const last = window.ValidationPresets.loadLastSession() || { groups: [] };
    last.groups.push({
        ifcFileNames: args.ifcFileNames,
        idsFileName: args.idsFileName
    });
    window.ValidationPresets.saveLastSession(last.groups);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return {
        groupIndex: last.groups.length - 1,
        appliedTo: helpers.getCurrentPageId() === 'validator' ? 'live UI' : 'last-session preset'
    };
}

export async function delete_validation_group(args) {
    helpers.validateArgs(args, { index: { required: true } });
    if (typeof args.index !== 'number') {
        throw new Error('index must be a number');
    }
    if (!confirm(`Smazat validační skupinu #${args.index + 1}?`)) return { cancelled: true };
    const last = window.ValidationPresets.loadLastSession() || { groups: [] };
    if (args.index < 0 || args.index >= last.groups.length) return { error: 'index_out_of_range' };
    last.groups.splice(args.index, 1);
    window.ValidationPresets.saveLastSession(last.groups);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    return { deleted: true };
}

export async function run_validation() {
    if (helpers.getCurrentPageId() !== 'validator') {
        try { localStorage.setItem('bim_validator_autorun', '1'); } catch (e) {}
        const targetUrl = (location.pathname.includes('/pages/'))
            ? './ids-ifc-validator.html'
            : './pages/ids-ifc-validator.html';
        // Defer navigation so the tool result reaches the LLM/UI before reload.
        // Timer is exposed for tests to cancel before it fires.
        run_validation._timer = setTimeout(() => { window.location.href = targetUrl; }, 150);
        return {
            navigating: true,
            message: 'Přepínám na Validator a spouštím validaci. Chat panel se po obnovení stránky zavře, ale výsledky uvidíš v UI.'
        };
    }
    if (typeof window.validateAll !== 'function') return { error: 'validator_not_ready' };
    window.validateAll();
    return { started: true, message: 'Validace spuštěna. Výsledky uvidíš v panelu.' };
}

export function register(registerFn) {
    registerFn('list_validation_groups', list_validation_groups);
    registerFn('get_validation_results', get_validation_results);
    registerFn('add_validation_group', add_validation_group);
    registerFn('delete_validation_group', delete_validation_group);
    registerFn('run_validation', run_validation);
}
