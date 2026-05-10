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

export function register(registerFn) {
    registerFn('list_validation_groups', list_validation_groups);
    registerFn('get_validation_results', get_validation_results);
}
