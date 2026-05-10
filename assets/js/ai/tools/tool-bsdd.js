import * as helpers from './_helpers.js';

const _DISABLED = { error: 'integration_disabled', message: 'bSDD integrace zatím není zapojena. Implementace přijde v další fázi.' };

export async function bsdd_search(args) {
    helpers.validateArgs(args, { query: { required: true } });
    return _DISABLED;
}

export async function bsdd_get_property(args) {
    helpers.validateArgs(args, { uri: { required: true } });
    return _DISABLED;
}

export function register(registerFn) {
    registerFn('bsdd_search', bsdd_search);
    registerFn('bsdd_get_property', bsdd_get_property);
}
