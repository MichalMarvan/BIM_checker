import * as helpers from './_helpers.js';

export async function get_theme() {
    if (typeof window.ThemeManager === 'undefined') {
        return { error: 'theme_manager_not_available' };
    }
    return { theme: window.ThemeManager.getTheme ? window.ThemeManager.getTheme() : (localStorage.getItem('theme') || 'light') };
}

export async function set_theme(args) {
    helpers.validateArgs(args, { theme: { required: true, enum: ['light', 'dark'] } });
    if (typeof window.ThemeManager === 'undefined') {
        return { error: 'theme_manager_not_available' };
    }
    window.ThemeManager.setTheme(args.theme);
    return { applied: args.theme };
}

export async function get_language() {
    if (typeof window.i18n === 'undefined') return { error: 'i18n_not_available' };
    return { lang: window.i18n.getCurrentLanguage ? window.i18n.getCurrentLanguage() : (localStorage.getItem('lang') || 'cs') };
}

export async function set_language(args) {
    helpers.validateArgs(args, { lang: { required: true, enum: ['cs', 'en'] } });
    if (typeof window.i18n === 'undefined') return { error: 'i18n_not_available' };
    window.i18n.setLanguage(args.lang);
    return { applied: args.lang };
}

export function register(registerFn) {
    registerFn('get_theme', get_theme);
    registerFn('set_theme', set_theme);
    registerFn('get_language', get_language);
    registerFn('set_language', set_language);
}
