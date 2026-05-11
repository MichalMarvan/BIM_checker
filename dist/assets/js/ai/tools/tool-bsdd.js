/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
import * as helpers from './_helpers.js';
function t(key, params) { return (typeof window.t === 'function') ? window.t(key, params) : key; }

const _DISABLED = { error: 'integration_disabled', message: t('ai.tool.bsdd.disabled') };

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
