/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IFCParserCore — synchronous IFC STEP parser for IDS validation.
 *
 * Besides the legacy fields consumed by the UI, each returned entity carries
 * the raw STEP parameters and normalized IDS data (properties, relations,
 * classifications and materials). This keeps semantic validation identical in
 * the main thread and workers and avoids reparsing the IFC for every IDS facet.
 */
(function(global) {
    'use strict';

    const RELATION_TYPES = new Set([
        'IFCRELAGGREGATES',
        'IFCRELASSIGNSTOGROUP',
        'IFCRELCONTAINEDINSPATIALSTRUCTURE',
        'IFCRELNESTS',
        'IFCRELVOIDSELEMENT',
        'IFCRELFILLSELEMENT'
    ]);

    const PREFIX_FACTORS = {
        EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3,
        HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3,
        MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18
    };

    const QUANTITY_TYPES = {
        IFCQUANTITYLENGTH: 'IFCLENGTHMEASURE',
        IFCQUANTITYAREA: 'IFCAREAMEASURE',
        IFCQUANTITYVOLUME: 'IFCVOLUMEMEASURE',
        IFCQUANTITYCOUNT: 'IFCCOUNTMEASURE',
        IFCQUANTITYWEIGHT: 'IFCMASSMEASURE',
        IFCQUANTITYTIME: 'IFCTIMEMEASURE',
        IFCQUANTITYNUMBER: 'IFCNUMBERMEASURE'
    };

    function extractGUID(params) {
        const match = params.match(/'([^']+)'/);
        return match ? decodeIFCString(match[1]) : null;
    }

    function extractName(params) {
        const parts = splitParams(params);
        return unquoteParam(parts[2]);
    }

    function decodeIFCString(str) {
        if (!str) return str;
        str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));
        str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 4) result += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
            return result;
        });
        str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 8) result += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
            return result;
        });
        return str;
    }

    function splitParams(params) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inString = false;
        for (let i = 0; i < (params || '').length; i++) {
            const char = params[i];
            if (char === "'") {
                if (inString && params[i + 1] === "'") {
                    current += "''";
                    i++;
                    continue;
                }
                inString = !inString;
            }
            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                else if (char === ',' && depth === 0) {
                    parts.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        if (current || params === '') parts.push(current.trim());
        return parts;
    }

    function unquoteParam(raw) {
        if (!raw || raw === '$' || raw === '*') return null;
        const match = String(raw).trim().match(/^'(.*)'$/s);
        return match ? decodeIFCString(match[1].replace(/''/g, "'")) : null;
    }

    function unwrapEnum(raw) {
        const match = String(raw || '').trim().match(/^\.(.+)\.$/);
        return match ? match[1] : null;
    }

    function referenceId(raw) {
        const match = String(raw || '').trim().match(/^#(\d+)$/);
        return match ? match[1] : null;
    }

    function referenceIds(raw) {
        return (String(raw || '').match(/#(\d+)/g) || []).map(ref => ref.substring(1));
    }

    function parsePrimitive(raw) {
        const value = String(raw || '').trim();
        if (!value || value === '$' || value === '*') return null;
        const stringValue = unquoteParam(value);
        if (stringValue !== null) return stringValue;
        if (value === '.T.') return true;
        if (value === '.F.') return false;
        if (value === '.U.') return null;
        const enumValue = unwrapEnum(value);
        if (enumValue !== null) return enumValue;
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return Number(value);
        return value;
    }

    function parseTypedValue(raw, units, explicitUnitId) {
        const text = String(raw || '').trim();
        if (!text || text === '$' || text === '*') {
            return { value: null, rawValue: null, dataType: null, kind: text === '*' ? 'derived' : 'null' };
        }
        const wrapped = text.match(/^([A-Z][A-Z0-9_]*)\s*\(([\s\S]*)\)$/i);
        const dataType = wrapped ? wrapped[1].toUpperCase() : null;
        const inner = wrapped ? wrapped[2].trim() : text;
        const rawValue = parsePrimitive(inner);
        let value = rawValue;
        if (typeof rawValue === 'number' && units) {
            const unit = explicitUnitId
                ? units.byId.get(explicitUnitId)
                : units.byType.get(unitTypeForDataType(dataType));
            if (unit) value = rawValue * unit.scale + unit.offset;
        }
        return {
            value,
            rawValue,
            dataType,
            kind: referenceId(inner) ? 'reference' : (Array.isArray(value) ? 'list' : typeof value)
        };
    }

    function parseTypedList(raw, units, explicitUnitId) {
        const trimmed = String(raw || '').trim();
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
        return splitParams(trimmed.slice(1, -1)).map(value => parseTypedValue(value, units, explicitUnitId));
    }

    function unitTypeForDataType(dataType) {
        const type = String(dataType || '').toUpperCase();
        if (!type) return null;
        if (type.includes('AREA') && type.endsWith('MEASURE')) return 'AREAUNIT';
        if (type.includes('VOLUME') && type.endsWith('MEASURE')) return 'VOLUMEUNIT';
        if ((type.includes('LENGTH') || type === 'IFCDISTANCEMEASURE') && type.endsWith('MEASURE')) return 'LENGTHUNIT';
        if (type.includes('MASS') && type.endsWith('MEASURE')) return 'MASSUNIT';
        if ((type.includes('TIME') || type.includes('DURATION')) && type.endsWith('MEASURE')) return 'TIMEUNIT';
        if (type.includes('PLANEANGLE') && type.endsWith('MEASURE')) return 'PLANEANGLEUNIT';
        if (type.includes('TEMPERATURE') && type.endsWith('MEASURE')) return 'THERMODYNAMICTEMPERATUREUNIT';
        if (type.includes('PRESSURE') && type.endsWith('MEASURE')) return 'PRESSUREUNIT';
        return null;
    }

    function collectStatements(content) {
        const dataMatch = /\bDATA\s*;/i.exec(content || '');
        if (!dataMatch) return [];
        const text = content.slice(dataMatch.index + dataMatch[0].length);
        const statements = [];
        let current = '';
        let inString = false;
        let collecting = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (!collecting) {
                if (char === '#') {
                    collecting = true;
                    current = '#';
                } else if (text.slice(i, i + 7).toUpperCase() === 'ENDSEC;') {
                    break;
                }
                continue;
            }
            current += char;
            if (char === "'") {
                if (inString && text[i + 1] === "'") {
                    current += text[++i];
                    continue;
                }
                inString = !inString;
            }
            if (char === ';' && !inString) {
                statements.push(current.trim());
                current = '';
                collecting = false;
            }
        }
        return statements;
    }

    function buildEntityMap(content) {
        const map = new Map();
        for (const statement of collectStatements(content)) {
            const match = statement.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)\s*;$/i);
            if (!match) continue;
            map.set(match[1], { id: match[1], type: match[2].toUpperCase(), params: match[3].trim() });
        }
        return map;
    }

    function buildUnits(entityMap) {
        const byId = new Map();
        const resolving = new Set();

        function resolve(id) {
            if (!id) return null;
            if (byId.has(id)) return byId.get(id);
            if (resolving.has(id)) return null;
            resolving.add(id);
            const entity = entityMap.get(id);
            let unit = null;
            if (entity?.type === 'IFCSIUNIT') {
                const parts = splitParams(entity.params);
                const unitType = unwrapEnum(parts[1]);
                const prefix = unwrapEnum(parts[2]);
                const base = PREFIX_FACTORS[prefix] || 1;
                const exponent = unitType === 'AREAUNIT' ? 2 : (unitType === 'VOLUMEUNIT' ? 3 : 1);
                unit = { unitType, scale: Math.pow(base, exponent), offset: 0 };
            } else if (entity?.type === 'IFCCONVERSIONBASEDUNIT' || entity?.type === 'IFCCONVERSIONBASEDUNITWITHOFFSET') {
                const parts = splitParams(entity.params);
                const unitType = unwrapEnum(parts[1]);
                const factorEntity = entityMap.get(referenceId(parts[3]));
                const factorParts = factorEntity ? splitParams(factorEntity.params) : [];
                const factorValue = parseTypedValue(factorParts[0]);
                const baseUnit = resolve(referenceId(factorParts[1]));
                const scale = Number(factorValue.value) * (baseUnit?.scale || 1);
                const rawOffset = entity.type === 'IFCCONVERSIONBASEDUNITWITHOFFSET' ? Number(parts[4]) : 0;
                unit = { unitType, scale, offset: Number.isFinite(rawOffset) ? rawOffset * scale : 0 };
            } else if (entity?.type === 'IFCDERIVEDUNIT') {
                const parts = splitParams(entity.params);
                let scale = 1;
                for (const elementId of referenceIds(parts[0])) {
                    const element = entityMap.get(elementId);
                    const elementParts = element ? splitParams(element.params) : [];
                    const baseUnit = resolve(referenceId(elementParts[0]));
                    const exponent = Number(elementParts[1]);
                    if (baseUnit && Number.isFinite(exponent)) scale *= Math.pow(baseUnit.scale, exponent);
                }
                unit = { unitType: unwrapEnum(parts[1]), scale, offset: 0 };
            }
            resolving.delete(id);
            if (unit) byId.set(id, unit);
            return unit;
        }

        for (const [id, entity] of entityMap) {
            if (entity.type.includes('UNIT')) resolve(id);
        }
        const byType = new Map();
        for (const entity of entityMap.values()) {
            if (entity.type !== 'IFCUNITASSIGNMENT') continue;
            for (const id of referenceIds(splitParams(entity.params)[0])) {
                const unit = resolve(id);
                if (unit?.unitType) byType.set(unit.unitType, unit);
            }
        }
        return { byId, byType };
    }

    function formatReferenceValue(entityMap, raw) {
        const id = referenceId(raw);
        if (!id) return '';
        const entity = entityMap.get(id);
        if (!entity) return `#${id}`;
        const label = splitParams(entity.params).map(unquoteParam).find(Boolean);
        return label ? `${label} (#${id})` : `${entity.type} #${id}`;
    }

    function parsePropertyDetail(propEntity, entityMap, units) {
        if (!propEntity) return null;
        const parts = splitParams(propEntity.params);
        const name = unquoteParam(parts[0]);
        if (!name) return null;
        let values = [];
        let supported = true;
        let explicitUnitId = null;

        switch (propEntity.type) {
            case 'IFCPROPERTYSINGLEVALUE':
                explicitUnitId = referenceId(parts[3]);
                values = [parseTypedValue(parts[2], units, explicitUnitId)];
                break;
            case 'IFCPROPERTYENUMERATEDVALUE':
                values = parseTypedList(parts[2], units, null);
                break;
            case 'IFCPROPERTYLISTVALUE':
                values = parseTypedList(parts[2], units, referenceId(parts[3]));
                break;
            case 'IFCPROPERTYBOUNDEDVALUE':
                explicitUnitId = referenceId(parts[4]);
                values = [parts[2], parts[3], parts[5]]
                    .filter(value => value && value !== '$')
                    .map(value => parseTypedValue(value, units, explicitUnitId));
                break;
            case 'IFCPROPERTYTABLEVALUE':
                values = parseTypedList(parts[2], units, referenceId(parts[5]))
                    .concat(parseTypedList(parts[3], units, referenceId(parts[6])));
                break;
            case 'IFCPROPERTYREFERENCEVALUE':
            case 'IFCCOMPLEXPROPERTY':
                supported = false;
                values = [];
                break;
            default:
                return null;
        }
        return {
            name,
            values,
            dataType: values.find(value => value?.dataType)?.dataType || null,
            propertyType: propEntity.type,
            supported
        };
    }

    function legacyPropertyValue(detail, entityMap, propEntity) {
        if (!detail) return '';
        if (detail.propertyType === 'IFCPROPERTYREFERENCEVALUE') {
            const parts = splitParams(propEntity.params);
            return [unquoteParam(parts[2]), formatReferenceValue(entityMap, parts[3])].filter(Boolean).join(': ');
        }
        if (detail.propertyType === 'IFCCOMPLEXPROPERTY') {
            const parts = splitParams(propEntity.params);
            return referenceIds(parts[3]).map(id => {
                const child = entityMap.get(id);
                const parsed = child ? parseProperty(child, entityMap) : null;
                return parsed ? `${parsed.name}: ${parsed.value}` : null;
            }).filter(Boolean).join('; ');
        }
        if (detail.propertyType === 'IFCPROPERTYBOUNDEDVALUE') {
            const parts = splitParams(propEntity.params);
            const displayRaw = raw => {
                const wrapped = String(raw || '').match(/^[A-Z][A-Z0-9_]*\((.*)\)$/i);
                return wrapped ? wrapped[1] : String(raw || '');
            };
            return [
                parts[3] && parts[3] !== '$' ? `min ${displayRaw(parts[3])}` : null,
                parts[2] && parts[2] !== '$' ? `max ${displayRaw(parts[2])}` : null,
                parts[5] && parts[5] !== '$' ? `set ${displayRaw(parts[5])}` : null
            ].filter(Boolean).join(', ');
        }
        const display = detail.values.map(item => {
            if (item.value === true) return 'TRUE';
            if (item.value === false) return 'FALSE';
            return item.value === null || item.value === undefined ? '' : String(item.value);
        });
        return display.length <= 1 ? (display[0] || '') : display.join(', ');
    }

    function parseProperty(propEntity, entityMap) {
        if (typeof propEntity === 'string') {
            propEntity = { type: 'IFCPROPERTYSINGLEVALUE', params: propEntity };
        }
        const detail = parsePropertyDetail(propEntity, entityMap || new Map(), null);
        if (!detail) return null;
        if (detail.propertyType === 'IFCCOMPLEXPROPERTY') {
            const parts = splitParams(propEntity.params);
            const children = referenceIds(parts[3]).map(id => {
                const child = entityMap?.get(id);
                const parsed = child ? parseProperty(child, entityMap) : null;
                return parsed ? `${parsed.name}: ${parsed.value}` : null;
            }).filter(Boolean);
            return { name: detail.name, value: children.join('; ') };
        }
        return { name: detail.name, value: legacyPropertyValue(detail, entityMap || new Map(), propEntity) };
    }

    function parsePropertySetDefinition(entity, entityMap, units) {
        const parts = splitParams(entity.params);
        if (entity.type === 'IFCPROPERTYSET') {
            const name = unquoteParam(parts[2]) || 'Unknown';
            const details = referenceIds(parts[4]).map(id => {
                const propEntity = entityMap.get(id);
                const detail = parsePropertyDetail(propEntity, entityMap, units);
                return detail ? { ...detail, legacyValue: legacyPropertyValue(detail, entityMap, propEntity) } : null;
            }).filter(Boolean);
            return { id: entity.id, type: entity.type, name, details, params: entity.params };
        }
        if (entity.type === 'IFCELEMENTQUANTITY') {
            const name = unquoteParam(parts[2]) || 'Unknown';
            const details = referenceIds(parts[5]).map(id => {
                const quantity = entityMap.get(id);
                if (!quantity || !QUANTITY_TYPES[quantity.type]) return null;
                const quantityParts = splitParams(quantity.params);
                const dataType = QUANTITY_TYPES[quantity.type];
                const raw = quantityParts[3];
                const explicitUnitId = referenceId(quantityParts[2]);
                const value = parseTypedValue(`${dataType}(${raw})`, units, explicitUnitId);
                return {
                    name: unquoteParam(quantityParts[0]),
                    values: [value],
                    dataType,
                    propertyType: quantity.type,
                    supported: true
                };
            }).filter(detail => detail?.name);
            return { id: entity.id, type: entity.type, name, details, params: entity.params };
        }
        // Predefined property sets are resolved against EXPRESS attribute
        // metadata by ValidationEngine, where the IFC schema is available.
        return { id: entity.id, type: entity.type, name: unquoteParam(parts[2]) || entity.type, details: [], params: entity.params, predefined: true };
    }

    function parsePropertySet(params, entityMap) {
        const entity = { id: '', type: 'IFCPROPERTYSET', params };
        const definition = parsePropertySetDefinition(entity, entityMap, null);
        const properties = {};
        for (const detail of definition.details) {
            const propEntity = Array.from(entityMap.values()).find(candidate => parsePropertyDetail(candidate, entityMap, null)?.name === detail.name);
            properties[detail.name] = propEntity ? legacyPropertyValue(detail, entityMap, propEntity) : (detail.values[0]?.value ?? '');
        }
        return { name: definition.name, properties };
    }

    function parseRelDefines(params) {
        const parts = splitParams(params);
        return {
            relatedObjects: referenceIds(parts[4]),
            relatingPropertyDefinition: referenceId(parts[5])
        };
    }

    function buildRelations(entityMap) {
        const direct = new Map();
        function add(partId, type, wholeId) {
            if (!partId || !wholeId) return;
            if (!direct.has(partId)) direct.set(partId, []);
            direct.get(partId).push({ type, targetId: wholeId });
        }
        for (const relation of entityMap.values()) {
            if (!RELATION_TYPES.has(relation.type)) continue;
            const parts = splitParams(relation.params);
            if (relation.type === 'IFCRELASSIGNSTOGROUP') {
                for (const id of referenceIds(parts[4])) add(id, relation.type, referenceId(parts[6]));
            } else if (relation.type === 'IFCRELVOIDSELEMENT' || relation.type === 'IFCRELFILLSELEMENT') {
                add(referenceId(parts[5]), relation.type, referenceId(parts[4]));
            } else if (relation.type === 'IFCRELAGGREGATES' || relation.type === 'IFCRELNESTS') {
                for (const id of referenceIds(parts[5])) add(id, relation.type, referenceId(parts[4]));
            } else {
                for (const id of referenceIds(parts[4])) add(id, relation.type, referenceId(parts[5]));
            }
        }
        return direct;
    }

    function relationAncestors(id, direct, entityMap) {
        const results = [];
        const modes = Array.from(RELATION_TYPES).concat(['*']);
        for (const mode of modes) {
            const queue = [id];
            const visited = new Set([id]);
            while (queue.length) {
                const current = queue.shift();
                for (const relation of direct.get(current) || []) {
                    if (mode !== '*' && relation.type !== mode) continue;
                    if (visited.has(relation.targetId)) continue;
                    visited.add(relation.targetId);
                    queue.push(relation.targetId);
                    const target = entityMap.get(relation.targetId);
                    if (!target) continue;
                    results.push({
                        mode,
                        type: relation.type,
                        target: entitySnapshot(target)
                    });
                }
            }
        }
        return results;
    }

    function entitySnapshot(entity) {
        const parts = splitParams(entity.params);
        return {
            id: entity.id,
            guid: extractGUID(entity.params) || `#${entity.id}`,
            entity: entity.type,
            name: entityName(entity),
            params: entity.params,
            attributes: {
                GlobalId: unquoteParam(parts[0]),
                Name: unquoteParam(parts[2]),
                Description: unquoteParam(parts[3]),
                ObjectType: unquoteParam(parts[4]),
                Tag: unquoteParam(parts[7])
            }
        };
    }

    function entityName(entity) {
        const parts = splitParams(entity.params);
        if (entity.type === 'IFCMATERIAL') return unquoteParam(parts[0]) || '-';
        return unquoteParam(parts[2]) || unquoteParam(parts[0]) || '-';
    }

    function resolveClassification(id, entityMap, seen) {
        if (!id || seen.has(id)) return null;
        seen.add(id);
        const entity = entityMap.get(id);
        if (!entity) return null;
        const parts = splitParams(entity.params);
        if (entity.type === 'IFCCLASSIFICATION') {
            return { system: unquoteParam(parts[3]), values: [], sourceId: id };
        }
        if (entity.type !== 'IFCCLASSIFICATIONREFERENCE') return null;
        const parent = resolveClassification(referenceId(parts[3]), entityMap, seen) || { system: null, values: [] };
        const value = unquoteParam(parts[1]);
        return { system: parent.system, values: value ? [value].concat(parent.values) : parent.values, sourceId: id };
    }

    function buildClassificationIndex(entityMap) {
        const direct = new Map();
        function add(objectId, classificationId) {
            const resolved = resolveClassification(classificationId, entityMap, new Set());
            if (!resolved) return;
            if (!direct.has(objectId)) direct.set(objectId, []);
            direct.get(objectId).push(resolved);
        }
        for (const relation of entityMap.values()) {
            const parts = splitParams(relation.params);
            if (relation.type === 'IFCRELASSOCIATESCLASSIFICATION') {
                const classificationId = referenceId(parts[5]);
                for (const objectId of referenceIds(parts[4])) add(objectId, classificationId);
            } else if (relation.type === 'IFCEXTERNALREFERENCERELATIONSHIP') {
                const classificationId = referenceId(parts[2]);
                for (const objectId of referenceIds(parts[3])) add(objectId, classificationId);
            }
        }
        return direct;
    }

    function materialValues(id, entityMap, seen) {
        if (!id || seen.has(id)) return [];
        seen.add(id);
        const entity = entityMap.get(id);
        if (!entity) return [];
        const parts = splitParams(entity.params);
        let values = [];
        const add = value => { if (value !== null && value !== undefined && value !== '') values.push(value); };
        switch (entity.type) {
            case 'IFCMATERIAL':
                add(unquoteParam(parts[0])); add(unquoteParam(parts[2])); break;
            case 'IFCMATERIALLIST':
                for (const ref of referenceIds(parts[0])) values.push(...materialValues(ref, entityMap, seen));
                break;
            case 'IFCMATERIALLAYER':
                add(unquoteParam(parts[3])); add(unquoteParam(parts[5]));
                values.push(...materialValues(referenceId(parts[0]), entityMap, seen));
                break;
            case 'IFCMATERIALLAYERSET':
                add(unquoteParam(parts[1]));
                for (const ref of referenceIds(parts[0])) values.push(...materialValues(ref, entityMap, seen));
                break;
            case 'IFCMATERIALLAYERSETUSAGE':
            case 'IFCMATERIALPROFILESETUSAGE':
            case 'IFCMATERIALPROFILESETUSAGETAPERING':
                values.push(...materialValues(referenceId(parts[0]), entityMap, seen));
                break;
            case 'IFCMATERIALCONSTITUENT':
                add(unquoteParam(parts[0])); add(unquoteParam(parts[4]));
                values.push(...materialValues(referenceId(parts[2]), entityMap, seen));
                break;
            case 'IFCMATERIALCONSTITUENTSET':
                add(unquoteParam(parts[0]));
                for (const ref of referenceIds(parts[2])) values.push(...materialValues(ref, entityMap, seen));
                break;
            case 'IFCMATERIALPROFILE':
                add(unquoteParam(parts[0])); add(unquoteParam(parts[5]));
                values.push(...materialValues(referenceId(parts[2]), entityMap, seen));
                break;
            case 'IFCMATERIALPROFILESET':
                add(unquoteParam(parts[0]));
                for (const ref of referenceIds(parts[2])) values.push(...materialValues(ref, entityMap, seen));
                break;
            default:
                add(entityName(entity));
        }
        return Array.from(new Set(values));
    }

    function buildMaterialIndex(entityMap) {
        const direct = new Map();
        for (const relation of entityMap.values()) {
            if (relation.type !== 'IFCRELASSOCIATESMATERIAL') continue;
            const parts = splitParams(relation.params);
            const materialId = referenceId(parts[5]);
            const values = materialValues(materialId, entityMap, new Set());
            for (const objectId of referenceIds(parts[4])) {
                direct.set(objectId, { present: Boolean(materialId), values });
            }
        }
        return direct;
    }

    function mergeClassifications(own, inherited) {
        if (!inherited.length) return own.slice();
        const ownSystems = new Set(own.map(item => item.system).filter(Boolean));
        return own.concat(inherited.filter(item => !item.system || !ownSystems.has(item.system)));
    }

    function mergeDefinitions(typeDefinitions, ownDefinitions) {
        const all = typeDefinitions.concat(ownDefinitions);
        const byKey = new Map();
        for (const definition of all) {
            if (definition.predefined) {
                byKey.set(`predefined:${definition.type}`, definition);
                continue;
            }
            for (const detail of definition.details) {
                byKey.set(`${definition.name}\u0000${detail.name}`, { ...detail, setName: definition.name });
            }
        }
        const details = Array.from(byKey.values()).filter(item => item.setName);
        const predefined = Array.from(byKey.values()).filter(item => item.predefined);
        return { details, predefined };
    }

    const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/i;
    function detectSchema(content) {
        if (!content || typeof content !== 'string') return 'UNKNOWN';
        const match = content.match(SCHEMA_RE);
        return match ? match[1].toUpperCase() : 'UNKNOWN';
    }

    function parseIFCContent(content, fileName) {
        if (typeof content !== 'string') throw new TypeError('IFC content must be a string');
        const entityMap = buildEntityMap(content);
        const units = buildUnits(entityMap);
        const propertyDefinitions = new Map();
        const relDefinesMap = new Map();
        const typeByObject = new Map();

        for (const [id, entity] of entityMap) {
            if (entity.type === 'IFCPROPERTYSET' || entity.type === 'IFCELEMENTQUANTITY') {
                propertyDefinitions.set(id, parsePropertySetDefinition(entity, entityMap, units));
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                relDefinesMap.set(id, parseRelDefines(entity.params));
                const definitionId = referenceId(splitParams(entity.params)[5]);
                if (definitionId && !propertyDefinitions.has(definitionId)) {
                    const definition = entityMap.get(definitionId);
                    if (definition) propertyDefinitions.set(definitionId, parsePropertySetDefinition(definition, entityMap, units));
                }
            } else if (entity.type === 'IFCRELDEFINESBYTYPE') {
                const parts = splitParams(entity.params);
                const typeId = referenceId(parts[5]);
                for (const objectId of referenceIds(parts[4])) typeByObject.set(objectId, typeId);
            }
        }

        const propertySetIndex = global.PropertySetIndex.build(relDefinesMap);
        const relationIndex = buildRelations(entityMap);
        const classificationIndex = buildClassificationIndex(entityMap);
        const materialIndex = buildMaterialIndex(entityMap);

        function definitionsForObject(id) {
            return global.PropertySetIndex.getPropertySetIds(propertySetIndex, id)
                .map(definitionId => propertyDefinitions.get(definitionId))
                .filter(Boolean);
        }

        function definitionsForType(typeId) {
            if (!typeId) return [];
            const typeEntity = entityMap.get(typeId);
            const direct = definitionsForObject(typeId);
            const embeddedIds = typeEntity ? referenceIds(splitParams(typeEntity.params)[5]) : [];
            for (const definitionId of embeddedIds) {
                if (!propertyDefinitions.has(definitionId)) {
                    const definition = entityMap.get(definitionId);
                    if (definition) propertyDefinitions.set(definitionId, parsePropertySetDefinition(definition, entityMap, units));
                }
            }
            return direct.concat(embeddedIds.map(id => propertyDefinitions.get(id)).filter(Boolean));
        }

        function embeddedDefinitionsForObject(id) {
            const object = entityMap.get(id);
            if (!object) return [];
            return referenceIds(splitParams(object.params)[5]).map(definitionId => {
                if (!propertyDefinitions.has(definitionId)) {
                    const definition = entityMap.get(definitionId);
                    if (definition && (
                        definition.type === 'IFCPROPERTYSET'
                        || definition.type === 'IFCELEMENTQUANTITY'
                        || definition.type.startsWith('PSET_')
                    )) {
                        propertyDefinitions.set(definitionId, parsePropertySetDefinition(definition, entityMap, units));
                    }
                }
                return propertyDefinitions.get(definitionId);
            }).filter(Boolean);
        }

        const entities = [];
        for (const [id, entity] of entityMap) {
            if (!entity.type.startsWith('IFC')) continue;

            const typeId = typeByObject.get(id) || null;
            const ownDefinitions = definitionsForObject(id).concat(embeddedDefinitionsForObject(id));
            const merged = mergeDefinitions(definitionsForType(typeId), ownDefinitions);
            const propertySets = {};
            for (const detail of merged.details) {
                if (!propertySets[detail.setName]) propertySets[detail.setName] = {};
                if (detail.legacyValue !== undefined) {
                    propertySets[detail.setName][detail.name] = detail.legacyValue;
                } else {
                    const display = detail.values.map(item => item.value === true ? 'TRUE' : (item.value === false ? 'FALSE' : item.value));
                    propertySets[detail.setName][detail.name] = display.length <= 1 ? (display[0] ?? '') : display.join(', ');
                }
            }

            const typeClassifications = typeId ? (classificationIndex.get(typeId) || []) : [];
            const ownClassifications = classificationIndex.get(id) || [];
            const ownMaterial = materialIndex.get(id);
            const typeMaterial = typeId ? materialIndex.get(typeId) : null;
            const material = ownMaterial || typeMaterial || { present: false, values: [] };
            const snapshot = entitySnapshot(entity);

            entities.push({
                ...snapshot,
                fileName,
                params: entity.params,
                propertySets,
                properties: merged.details,
                predefinedPropertySets: merged.predefined,
                relations: relationAncestors(id, relationIndex, entityMap),
                classifications: mergeClassifications(ownClassifications, typeClassifications),
                materials: material.values,
                hasMaterial: material.present,
                typeId,
                typeEntity: typeId && entityMap.get(typeId) ? entitySnapshot(entityMap.get(typeId)) : null
            });
        }
        return entities;
    }

    global.IFCParserCore = {
        parseIFCContent,
        detectSchema,
        _extractGUID: extractGUID,
        _extractName: extractName,
        _decodeIFCString: decodeIFCString,
        _splitParams: splitParams,
        _parsePropertySet: parsePropertySet,
        _parseProperty: parseProperty,
        _parseRelDefines: parseRelDefines,
        _parseTypedValue: parseTypedValue,
        _collectStatements: collectStatements,
        _buildEntityMap: buildEntityMap
    };
})(typeof self !== 'undefined' ? self : window);
