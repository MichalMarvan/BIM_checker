import * as helpers from './_helpers.js';

export async function search_ifc_entities(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        entityType: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const target = args.entityType.toUpperCase();
    const matches = entities.filter(e => (e.entity || '').toUpperCase() === target);
    const limited = matches.slice(0, 50).map(e => ({
        expressId: e.id,
        name: e.name || null,
        guid: e.guid || null
    }));
    return {
        results: limited,
        truncated: matches.length > 50,
        totalCount: matches.length
    };
}

export async function count_entities_by_type(args) {
    helpers.validateArgs(args, { filename: { required: true } });
    const entities = await helpers.getParsedIfc(args.filename);
    const counts = {};
    for (const e of entities) {
        const type = (e.entity || 'UNKNOWN').toUpperCase();
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

export async function find_ifc_files_with_entity(args) {
    helpers.validateArgs(args, { entityType: { required: true } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const files = await window.BIMStorage.getFiles('ifc');
    const target = args.entityType.toUpperCase();
    const results = [];
    for (const f of files) {
        try {
            const entities = await helpers.getParsedIfc(f.name);
            const count = entities.filter(e => (e.entity || '').toUpperCase() === target).length;
            if (count > 0) results.push({ filename: f.name, count });
        } catch (e) {
            console.warn('[find_ifc_files] parse failed for', f.name, e);
        }
    }
    return results;
}

export function register(registerFn) {
    registerFn('search_ifc_entities', search_ifc_entities);
    registerFn('count_entities_by_type', count_entities_by_type);
    registerFn('find_ifc_files_with_entity', find_ifc_files_with_entity);
}
