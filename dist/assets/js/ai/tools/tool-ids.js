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

function _resolveSpec(specs, args) {
    if (typeof args.specIndex === 'number') {
        if (args.specIndex < 0 || args.specIndex >= specs.length) return { error: 'index_out_of_range' };
        return { spec: specs[args.specIndex], index: args.specIndex };
    }
    if (args.specName) {
        const idx = specs.findIndex(s => (s.name || '').trim() === String(args.specName).trim());
        if (idx === -1) return { error: 'not_found', message: `Specifikace "${args.specName}" v souboru.` };
        return { spec: specs[idx], index: idx };
    }
    return { error: 'missing_identifier', message: 'Zadej specName nebo specIndex.' };
}

export async function get_specification_detail(args) {
    helpers.validateArgs(args, { idsFileName: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found', message: `IDS soubor "${args.idsFileName}" neexistuje.` };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const resolution = _resolveSpec(parsed.specifications || [], args);
    if (resolution.error) return resolution;
    const s = resolution.spec;
    return {
        index: resolution.index,
        name: s.name,
        ifcVersion: s.ifcVersion,
        identifier: s.identifier,
        description: s.description,
        instructions: s.instructions,
        minOccurs: s.minOccurs,
        maxOccurs: s.maxOccurs,
        applicabilityCount: (s.applicability || []).length,
        requirementsCount: (s.requirements || []).length,
        applicability: s.applicability || [],
        requirements: s.requirements || []
    };
}

export async function get_facet_detail(args) {
    helpers.validateArgs(args, {
        idsFileName: { required: true },
        facetType: { required: true, enum: ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'] },
        index: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const resolution = _resolveSpec(parsed.specifications || [], args);
    if (resolution.error) return resolution;
    const s = resolution.spec;
    const block = (args.in === 'requirements') ? (s.requirements || []) : (s.applicability || []);
    const filtered = block.filter(f => f.type === args.facetType);
    if (args.index < 0 || args.index >= filtered.length) return { error: 'index_out_of_range', count: filtered.length };
    return { facet: filtered[args.index], in: args.in === 'requirements' ? 'requirements' : 'applicability', total: filtered.length };
}

export function register(registerFn) {
    registerFn('list_ids_specifications', list_ids_specifications);
    registerFn('get_specification_detail', get_specification_detail);
    registerFn('get_facet_detail', get_facet_detail);
}
