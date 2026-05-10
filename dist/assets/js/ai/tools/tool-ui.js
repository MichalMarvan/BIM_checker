import * as helpers from './_helpers.js';

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
        warning: 'Stránka se nyní přesměruje. Chat panel se zavře, otevřete jej znovu po načtení.',
        _timer: timer
    };
}

export function register(registerFn) {
    registerFn('get_current_page', get_current_page);
    registerFn('navigate_to_page', navigate_to_page);
}
