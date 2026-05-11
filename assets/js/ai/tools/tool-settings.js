/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
import * as helpers from './_helpers.js';

export async function get_theme() {
    if (typeof window.ThemeManager === 'undefined') throw new Error('ThemeManager not available');
    return { theme: window.ThemeManager.getCurrentTheme() };
}

export async function set_theme(args) {
    helpers.validateArgs(args, { theme: { required: true, enum: ['light', 'dark'] } });
    if (typeof window.ThemeManager === 'undefined') throw new Error('ThemeManager not available');
    window.ThemeManager.setTheme(args.theme);
    return { applied: args.theme };
}

export async function get_language() {
    if (typeof window.i18n === 'undefined') throw new Error('i18n not available');
    return { lang: window.i18n.getCurrentLanguage() };
}

export async function set_language(args) {
    helpers.validateArgs(args, { lang: { required: true, enum: ['cs', 'en'] } });
    if (typeof window.i18n === 'undefined') throw new Error('i18n not available');
    window.i18n.setLanguage(args.lang);
    return { applied: args.lang };
}

export async function start_wizard(args) {
    if (typeof window.wizard === 'undefined' || typeof window.wizard.start !== 'function') {
        return { error: 'wrong_page', message: 'Průvodce je dostupný jen na podstránkách (validator/parser/viewer).' };
    }
    if (args && args.page && typeof window.wizard.setCurrentPage === 'function') {
        window.wizard.setCurrentPage(args.page);
    }
    window.wizard.start();
    return { started: true };
}

export async function dismiss_wizard() {
    if (typeof window.wizard === 'undefined' || typeof window.wizard.stop !== 'function') {
        return { error: 'wrong_page', message: 'Průvodce je dostupný jen na podstránkách (validator/parser/viewer).' };
    }
    window.wizard.stop();
    return { dismissed: true };
}

export async function install_pwa() {
    if (typeof window.PWA === 'undefined') throw new Error('PWA not available');
    if (!window.PWA.canInstall()) return { available: false, message: 'Browser instalační prompt zatím není připraven, zkuste později.' };
    return await window.PWA.prompt();
}

export async function open_bug_report(args) {
    if (typeof window.BugReport === 'undefined') throw new Error('BugReport not available');
    window.BugReport.open();
    if (args && args.description) {
        const ta = document.getElementById('bugReportDesc');
        if (ta) ta.value = args.description;
    }
    return { opened: true };
}

export function register(registerFn) {
    registerFn('get_theme', get_theme);
    registerFn('set_theme', set_theme);
    registerFn('get_language', get_language);
    registerFn('set_language', set_language);
    registerFn('start_wizard', start_wizard);
    registerFn('dismiss_wizard', dismiss_wizard);
    registerFn('install_pwa', install_pwa);
    registerFn('open_bug_report', open_bug_report);
}
