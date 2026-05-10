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

export async function get_entity_properties(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        expressId: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const entity = entities.find(e => String(e.id) === String(args.expressId));
    if (!entity) return { error: 'not_found', expressId: args.expressId };
    const psets = entity.propertySets || {};
    const propertySets = Object.entries(psets).map(([psetName, props]) => ({
        name: psetName,
        properties: Object.entries(props).map(([propName, propValue]) => ({
            name: propName,
            value: propValue
        }))
    }));
    return {
        entityType: entity.entity,
        name: entity.name || null,
        guid: entity.guid || null,
        propertySets
    };
}

export async function get_property_value(args) {
    helpers.validateArgs(args, {
        filename: { required: true },
        expressId: { required: true },
        psetName: { required: true },
        propertyName: { required: true }
    });
    const entities = await helpers.getParsedIfc(args.filename);
    const entity = entities.find(e => String(e.id) === String(args.expressId));
    if (!entity) return { error: 'not_found', expressId: args.expressId };
    const psets = entity.propertySets || {};
    if (!(args.psetName in psets)) {
        return { notFound: true, reason: 'pset_not_found', psetName: args.psetName };
    }
    const props = psets[args.psetName];
    if (!(args.propertyName in props)) {
        return { notFound: true, reason: 'property_not_found', propertyName: args.propertyName };
    }
    return { value: props[args.propertyName], unit: null };
}

export async function compare_ifc_files(args) {
    helpers.validateArgs(args, {
        fileNamesA: { required: true },
        fileNamesB: { required: true }
    });
    if (!Array.isArray(args.fileNamesA) || !Array.isArray(args.fileNamesB)) {
        throw new Error('fileNamesA and fileNamesB must be arrays of strings');
    }
    async function _aggregate(names) {
        const counts = {};
        for (const name of names) {
            const entities = await helpers.getParsedIfc(name);
            if (!entities) continue;
            for (const e of entities) {
                const t = (e.entity || '').toUpperCase();
                if (!t) continue;
                counts[t] = (counts[t] || 0) + 1;
            }
        }
        return counts;
    }
    const a = await _aggregate(args.fileNamesA);
    const b = await _aggregate(args.fileNamesB);
    const allTypes = new Set([...Object.keys(a), ...Object.keys(b)]);
    const delta = {};
    for (const t of allTypes) delta[t] = (b[t] || 0) - (a[t] || 0);
    return { a, b, delta };
}

export async function find_property_in_ifc(args) {
    helpers.validateArgs(args, {
        fileName: { required: true },
        propertyName: { required: true }
    });
    let entities;
    try {
        entities = await helpers.getParsedIfc(args.fileName);
    } catch (_) {
        entities = null;
    }
    if (!entities) return { error: 'not_found', message: `IFC soubor "${args.fileName}" neexistuje nebo se nepodařil parsovat.` };
    const matches = [];
    let truncated = false;
    const targetValue = (args.value !== undefined && args.value !== null) ? String(args.value) : null;
    for (const e of entities) {
        const psets = e.psets || e.propertySets || {};
        for (const psetName of Object.keys(psets)) {
            const props = psets[psetName] || {};
            if (Object.prototype.hasOwnProperty.call(props, args.propertyName)) {
                const v = props[args.propertyName];
                if (targetValue === null || String(v) === targetValue) {
                    matches.push({
                        expressId: e.id,
                        entity: e.entity,
                        guid: e.guid,
                        psetName,
                        value: v
                    });
                    if (matches.length >= 50) { truncated = true; break; }
                }
            }
        }
        if (truncated) break;
    }
    return { fileName: args.fileName, matches, truncated };
}

export function register(registerFn) {
    registerFn('search_ifc_entities', search_ifc_entities);
    registerFn('count_entities_by_type', count_entities_by_type);
    registerFn('find_ifc_files_with_entity', find_ifc_files_with_entity);
    registerFn('get_entity_properties', get_entity_properties);
    registerFn('get_property_value', get_property_value);
    registerFn('compare_ifc_files', compare_ifc_files);
    registerFn('find_property_in_ifc', find_property_in_ifc);
}
