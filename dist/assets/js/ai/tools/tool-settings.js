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

export function register(registerFn) {
    registerFn('get_theme', get_theme);
    registerFn('set_theme', set_theme);
    registerFn('get_language', get_language);
    registerFn('set_language', set_language);
}
