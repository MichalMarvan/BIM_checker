import * as helpers from './_helpers.js';

export async function list_ids_specifications(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available on this page');
    await window.BIMStorage.init();
    const meta = await window.BIMStorage.getFile('ids', args.filename);
    if (!meta) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', meta.id);
    const parsed = window.IDSParser.parse(content);
    const specs = (parsed && parsed.specifications) || [];
    return specs.map(s => ({
        name: s.name,
        identifier: s.identifier || null,
        applicability: ((s.applicability && s.applicability.facets) || []).map(f => f.type),
        requirementsCount: ((s.requirements && s.requirements.facets) || []).length
    }));
}

export function register(registerFn) {
    registerFn('list_ids_specifications', list_ids_specifications);
}
