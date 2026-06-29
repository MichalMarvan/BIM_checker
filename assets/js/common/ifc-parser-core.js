/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IFCParserCore — pure synchronous IFC content → entities[] parser.
 * Single source of truth, used by:
 *   - assets/js/workers/ifc-parser.worker.js (worker context, self.IFCParserCore)
 *   - assets/js/validator.js (main thread fallback when Worker unavailable)
 *
 * Output shape matches existing parseIFCFileAsync exactly:
 *   { guid, entity, name, propertySets, fileName, attributes: { Name, GlobalId } }
 */
(function(global) {
    'use strict';

    function extractGUID(params) {
        const match = params.match(/'([^']+)'/);
        return match ? match[1] : null;
    }

    function extractName(params) {
        const parts = splitParams(params);
        return unquoteParam(parts[2]);
    }

    function decodeIFCString(str) {
        if (!str) {
            return str;
        }

        // Decode \S\X format (ISO 8859-1 supplement)
        str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));

        // Decode \X\XX format (ISO 8859-1 single byte)
        str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

        // Decode \X2\XXXX...XXXX\X0\ format (UTF-16)
        str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 4) {
                const codePoint = parseInt(hex.substr(i, 4), 16);
                result += String.fromCharCode(codePoint);
            }
            return result;
        });

        // Decode \X4\XXXXXXXX\X0\ format (UTF-32)
        str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 8) {
                const codePoint = parseInt(hex.substr(i, 8), 16);
                result += String.fromCodePoint(codePoint);
            }
            return result;
        });

        return str;
    }

    function splitParams(params) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inString = false;

        for (let i = 0; i < params.length; i++) {
            const char = params[i];
            // IFC uses '' (double single quote) for escaped quotes, not \'
            if (char === "'") {
                if (inString && params[i + 1] === "'") {
                    // Escaped quote (''), add both and skip next
                    current += char;
                    current += params[i + 1];
                    i++;
                    continue;
                }
                inString = !inString;
            }
            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    parts.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        if (current) {
            parts.push(current.trim());
        }
        return parts;
    }

    function unquoteParam(raw) {
        if (!raw || raw === '$' || raw === '*') return null;
        const match = String(raw).match(/^'(.*)'$/s);
        return match ? decodeIFCString(match[1].replace(/''/g, "'")) : null;
    }

    function unwrapIfcValue(raw) {
        if (!raw || raw === '$' || String(raw).trim() === '') return '';
        const wrapMatch = String(raw).match(/^(IFC[A-Z0-9_]+)\s*\((.*)\)$/i);
        if (!wrapMatch) return String(raw);

        const type = wrapMatch[1].toUpperCase();
        const inner = wrapMatch[2].trim();
        if (inner.startsWith("'") && inner.endsWith("'")) {
            return decodeIFCString(inner.slice(1, -1).replace(/''/g, "'"));
        }
        if (inner === '.T.') return 'TRUE';
        if (inner === '.F.') return 'FALSE';
        if (inner === '.U.') return 'UNKNOWN';
        if (type.includes('BOOLEAN') || type.includes('LOGICAL')) return inner;

        const numericMatch = inner.match(/^[+-]?\d+\.?\d*(?:[eE][+-]?\d+)?$/);
        return numericMatch ? inner : String(inner);
    }

    function unwrapIfcList(raw) {
        if (!raw || raw === '$' || raw === '*') return [];
        const trimmed = String(raw).trim();
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
        return splitParams(trimmed.slice(1, -1)).map(unwrapIfcValue);
    }

    function formatReferenceValue(entityMap, raw) {
        const match = raw ? String(raw).match(/#(\d+)/) : null;
        if (!match) return '';
        const entity = entityMap?.get(match[1]);
        if (!entity) return `#${match[1]}`;
        const label = splitParams(entity.params).map(unquoteParam).find(Boolean);
        return label ? `${label} (#${match[1]})` : `${entity.type} #${match[1]}`;
    }

    function parsePropertySet(params, entityMap) {
        const parts = splitParams(params);
        const rawName = parts[2] ? parts[2].replace(/'/g, '') : 'Unknown';
        const name = decodeIFCString(rawName);
        const properties = {};

        if (parts.length > 4) {
            const propIds = parts[4].match(/#\d+/g);
            if (propIds) {
                for (const propId of propIds) {
                    const id = propId.substring(1);
                    const propEntity = entityMap.get(id);
                    if (propEntity) {
                        const prop = parseProperty(propEntity, entityMap);
                        if (prop) {
                            properties[prop.name] = prop.value;
                        }
                    }
                }
            }
        }

        return { name, properties };
    }

    function parseProperty(propEntity, entityMap) {
        const params = typeof propEntity === 'string' ? propEntity : propEntity.params;
        const propType = typeof propEntity === 'string' ? 'IFCPROPERTYSINGLEVALUE' : propEntity.type;
        const parts = splitParams(params);
        const name = unquoteParam(parts[0]);
        if (!name) return null;

        if (propType === 'IFCPROPERTYSINGLEVALUE') {
            return { name, value: unwrapIfcValue(parts[2]) };
        }

        if (propType === 'IFCPROPERTYENUMERATEDVALUE' || propType === 'IFCPROPERTYLISTVALUE') {
            return { name, value: unwrapIfcList(parts[2]).join(', ') };
        }

        if (propType === 'IFCPROPERTYBOUNDEDVALUE') {
            const upper = unwrapIfcValue(parts[2]);
            const lower = unwrapIfcValue(parts[3]);
            const setPoint = unwrapIfcValue(parts[5]);
            return { name, value: [`min ${lower}`, `max ${upper}`, setPoint ? `set ${setPoint}` : ''].filter(Boolean).join(', ') };
        }

        if (propType === 'IFCPROPERTYTABLEVALUE') {
            const defining = unwrapIfcList(parts[2]);
            const defined = unwrapIfcList(parts[3]);
            return { name, value: defining.map((key, index) => `${key}: ${defined[index] ?? ''}`).join('; ') };
        }

        if (propType === 'IFCPROPERTYREFERENCEVALUE') {
            const usageName = unquoteParam(parts[2]);
            const refValue = formatReferenceValue(entityMap, parts[3]);
            return { name, value: [usageName, refValue].filter(Boolean).join(': ') };
        }

        if (propType === 'IFCCOMPLEXPROPERTY') {
            const childIds = parts[3] ? parts[3].match(/#\d+/g) : null;
            const childProps = [];
            if (childIds) {
                for (const childId of childIds) {
                    const child = entityMap.get(childId.substring(1));
                    const prop = child ? parseProperty(child, entityMap) : null;
                    if (prop) childProps.push(`${prop.name}: ${prop.value}`);
                }
            }
            return { name, value: childProps.join('; ') };
        }

        return null;
    }

    function parseRelDefines(params) {
        const parts = splitParams(params);
        const relatedObjects = parts[4] ? parts[4].match(/#\d+/g)?.map(r => r.substring(1)) : [];
        const relatingMatch = parts[5] ? parts[5].match(/#(\d+)/) : null;
        return {
            relatedObjects,
            relatingPropertyDefinition: relatingMatch ? relatingMatch[1] : null
        };
    }

    const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/;

    function detectSchema(content) {
        if (!content || typeof content !== 'string') return 'UNKNOWN';
        const m = content.match(SCHEMA_RE);
        return m ? m[1] : 'UNKNOWN';
    }

    function parseIFCContent(content, fileName) {
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();

        // Phase 1: collect entities
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || !line.startsWith('#')) continue;
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
            if (!match) continue;
            const [, id, entityType, params] = match;
            entityMap.set(id, { id, type: entityType, params });
        }

        // Phase 2: parse property sets + rel defines
        for (const [id, entity] of entityMap.entries()) {
            if (entity.type === 'IFCPROPERTYSET') {
                propertySetMap.set(id, parsePropertySet(entity.params, entityMap));
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                relDefinesMap.set(id, parseRelDefines(entity.params));
            }
        }

        // Phase 3: inverted index for fast pset lookup
        const propertySetIndex = global.PropertySetIndex.build(relDefinesMap);

        // Phase 4: build entity list
        const entities = [];
        for (const [id, entity] of entityMap.entries()) {
            if (!entity.type.startsWith('IFC')) continue;
            if (entity.type.includes('REL') || entity.type.includes('PROPERTY')) continue;
            if (!entity.params.includes("'")) continue;

            const guid = extractGUID(entity.params);
            const name = extractName(entity.params);
            if (!guid) continue;

            const propertySets = {};
            const psetIds = global.PropertySetIndex.getPropertySetIds(propertySetIndex, id);
            for (const psetId of psetIds) {
                if (propertySetMap.has(psetId)) {
                    const pset = propertySetMap.get(psetId);
                    if (pset && pset.name) {
                        propertySets[pset.name] = pset.properties;
                    }
                }
            }

            entities.push({
                id,
                guid,
                entity: entity.type,
                name: name || '-',
                propertySets,
                fileName,
                attributes: { Name: name || '-', GlobalId: guid }
            });
        }

        return entities;
    }

    global.IFCParserCore = {
        parseIFCContent,
        detectSchema,
        // Test-only exports (prefixed with _ to mark internal)
        _extractGUID: extractGUID,
        _extractName: extractName,
        _decodeIFCString: decodeIFCString,
        _splitParams: splitParams,
        _parsePropertySet: parsePropertySet,
        _parseProperty: parseProperty,
        _parseRelDefines: parseRelDefines
    };
})(typeof self !== 'undefined' ? self : window);
