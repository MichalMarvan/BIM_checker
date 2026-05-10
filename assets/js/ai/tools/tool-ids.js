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

export async function generate_ids_skeleton(args) {
    helpers.validateArgs(args, { title: { required: true } });
    if (typeof window.IDSXMLGenerator === 'undefined') {
        return { error: 'generator_not_available', message: 'IDS XML generator není načtený na této stránce.' };
    }
    const idsData = {
        title: String(args.title),
        copyright: args.copyright || '',
        version: args.version || '1.0',
        description: args.description || '',
        author: args.author || '',
        date: new Date().toISOString().slice(0, 10),
        purpose: args.purpose || '',
        milestone: args.milestone || '',
        specifications: [{
            name: 'Empty Specification',
            ifcVersion: args.ifcVersion || 'IFC4X3_ADD2',
            identifier: '',
            description: '',
            instructions: '',
            applicability: [{ type: 'entity', name: { simpleValue: 'IFCWALL' } }],
            requirements: []
        }]
    };
    const xml = new window.IDSXMLGenerator().generateIDS(idsData);
    return { xml, length: xml.length };
}

export async function add_specification_to_ids(args) {
    helpers.validateArgs(args, {
        idsFileName: { required: true },
        name: { required: true },
        applicabilityFacets: { required: true },
        requirementFacets: { required: true }
    });
    if (!Array.isArray(args.applicabilityFacets) || !Array.isArray(args.requirementFacets)) {
        throw new Error('applicabilityFacets and requirementFacets must be arrays');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    if (typeof window.IDSParser === 'undefined') throw new Error('IDSParser not available');
    if (typeof window.IDSXMLGenerator === 'undefined') {
        return { error: 'generator_not_available' };
    }
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const parsed = window.IDSParser.parse(content);
    if (parsed.error) return { error: 'parse_error', message: parsed.error.message };
    const idsData = {
        title: parsed.info?.title || '',
        copyright: parsed.info?.copyright || '',
        version: parsed.info?.version || '',
        description: parsed.info?.description || '',
        author: parsed.info?.author || '',
        date: parsed.info?.date || '',
        purpose: parsed.info?.purpose || '',
        milestone: parsed.info?.milestone || '',
        specifications: [...(parsed.specifications || [])]
    };
    idsData.specifications.push({
        name: args.name,
        ifcVersion: args.ifcVersion || idsData.specifications[0]?.ifcVersion || 'IFC4X3_ADD2',
        identifier: '',
        description: args.description || '',
        instructions: '',
        applicability: args.applicabilityFacets,
        requirements: args.requirementFacets
    });
    const xml = new window.IDSXMLGenerator().generateIDS(idsData);
    if (!confirm(`Přidat specifikaci '${args.name}' do '${args.idsFileName}'?`)) {
        return { cancelled: true };
    }
    await window.BIMStorage.saveFile('ids', { name: args.idsFileName, size: xml.length, content: xml }, file.folder);
    return { added: true, totalSpecs: idsData.specifications.length };
}

export async function validate_ids_xml(args) {
    helpers.validateArgs(args, { idsFileName: { required: true } });
    if (typeof window.IDSXSDValidator === 'undefined') {
        return { error: 'validator_not_available', message: 'XSD validátor není k dispozici (jen na podstránkách).' };
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile('ids', args.idsFileName);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent('ids', file.id);
    const result = await window.IDSXSDValidator.validate(content);
    return { valid: result.valid, errorCount: (result.errors || []).length, errors: (result.errors || []).slice(0, 20) };
}

export function register(registerFn) {
    registerFn('list_ids_specifications', list_ids_specifications);
    registerFn('get_specification_detail', get_specification_detail);
    registerFn('get_facet_detail', get_facet_detail);
    registerFn('generate_ids_skeleton', generate_ids_skeleton);
    registerFn('add_specification_to_ids', add_specification_to_ids);
    registerFn('validate_ids_xml', validate_ids_xml);
}
