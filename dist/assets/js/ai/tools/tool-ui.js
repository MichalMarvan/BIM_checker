/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
import * as helpers from './_helpers.js';
function t(key, params) { return (typeof window.t === 'function') ? window.t(key, params) : key; }

const PATH_MAP = {
    home: '/index.html',
    validator: '/pages/ids-ifc-validator.html',
    parser: '/pages/ids-parser-visualizer.html',
    viewer: '/pages/ifc-viewer-multi-file.html'
};

export async function get_current_page() {
    return { page: helpers.getCurrentPageId() };
}

export async function navigate_to_page(args) {
    helpers.validateArgs(args, {
        page: { required: true, enum: Object.keys(PATH_MAP) }
    });
    const timer = setTimeout(() => { window.location.href = PATH_MAP[args.page]; }, 100);
    return {
        navigating: true,
        target: args.page,
        warning: t('ai.tool.ui.pageRedirect'),
        _timer: timer
    };
}

export async function request_user_attention(args) {
    helpers.validateArgs(args, { message: { required: true } });
    const kind = (args && args.kind) || 'info';
    if (typeof window.ErrorHandler === 'undefined') {
        return { error: 'error_handler_not_available' };
    }
    const fn = window.ErrorHandler[kind];
    if (typeof fn !== 'function') return { error: 'invalid_kind', message: t('ai.tool.ui.invalidKind', { kind }) };
    fn.call(window.ErrorHandler, String(args.message));
    return { shown: true, kind };
}

export function register(registerFn) {
    registerFn('get_current_page', get_current_page);
    registerFn('navigate_to_page', navigate_to_page);
    registerFn('request_user_attention', request_user_attention);
}
