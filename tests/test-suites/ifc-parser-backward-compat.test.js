/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IFCParserCore vs legacy parseIFCFileAsync (snapshot)', () => {
    function deepEqual(a, b) {
        return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    }
    function normalize(obj) {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
            const sorted = {};
            for (const k of Object.keys(obj).sort()) sorted[k] = normalize(obj[k]);
            return sorted;
        }
        return obj;
    }

    // Inline copy of validator.js parseIFCFileAsync logic (as of Task 4 baseline)
    // Used for snapshot comparison — proves IFCParserCore output is identical
    async function legacyParseIFCFileAsync(content, fileName) {
        const entities = [];
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();

        // Phase 1: Collect entities
        for (let line of lines) {
            line = line.trim();
            if (!line.startsWith('#')) continue;
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
            if (!match) continue;
            const [, id, entityType, params] = match;
            entityMap.set(id, { id, type: entityType, params });
        }

        // Phase 2: Parse property sets
        for (const [id, entity] of entityMap) {
            if (entity.type === 'IFCPROPERTYSET') {
                propertySetMap.set(id, legacyParsePropertySet(entity.params, entityMap));
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                relDefinesMap.set(id, legacyParseRelDefines(entity.params));
            }
        }

        // Phase 3: Build inverted index
        const propertySetIndex = PropertySetIndex.build(relDefinesMap);

        // Phase 4: Build entities list
        for (const [id, entity] of entityMap) {
            if (entity.type.startsWith('IFC') &&
                !entity.type.includes('REL') &&
                !entity.type.includes('PROPERTY') &&
                entity.params.includes("'")) {

                const guid = legacyExtractGUID(entity.params);
                const name = legacyExtractName(entity.params);

                if (guid) {
                    const propertySets = {};
                    const psetIds = PropertySetIndex.getPropertySetIds(propertySetIndex, id);
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
            }
        }
        return entities;
    }

    function legacyExtractGUID(params) {
        const match = params.match(/'([^']+)'/);
        return match ? match[1] : null;
    }

    function legacyExtractName(params) {
        const matches = params.match(/'([^']*)'/g);
        const rawName = matches && matches.length > 1 ? matches[1].replace(/'/g, '') : null;
        return rawName ? legacyDecodeIFCString(rawName) : null;
    }

    function legacyDecodeIFCString(str) {
        if (!str) return str;
        str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));
        str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 4) {
                result += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
            }
            return result;
        });
        str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
            let result = '';
            for (let i = 0; i < hex.length; i += 8) {
                result += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
            }
            return result;
        });
        return str;
    }

    function legacySplitParams(params) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inString = false;
        for (let i = 0; i < params.length; i++) {
            const char = params[i];
            if (char === "'") {
                if (inString && params[i + 1] === "'") {
                    current += char;
                    current += params[i + 1];
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
        if (current) parts.push(current.trim());
        return parts;
    }

    function legacyParseProperty(params) {
        const parts = legacySplitParams(params);
        if (parts.length < 3) return null;
        const rawName = parts[0].replace(/'/g, '');
        const name = legacyDecodeIFCString(rawName);
        let value = parts[2] || '';
        if (value === '$' || value.trim() === '') return { name, value: '' };
        const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
        if (stringMatch) return { name, value: legacyDecodeIFCString(stringMatch[1]) };
        const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
        if (booleanMatch) return { name, value: booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE' };
        const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
        if (logicalMatch) {
            const v = logicalMatch[1].toUpperCase();
            return { name, value: v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN' };
        }
        const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (numericMatch) return { name, value: numericMatch[1] };
        const angleMatch = value.match(/IFCPLANEANGLEMEASURE\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (angleMatch) return { name, value: angleMatch[1] };
        return { name, value };
    }

    function legacyParsePropertySet(params, entityMap) {
        const parts = legacySplitParams(params);
        const rawName = parts[2] ? parts[2].replace(/'/g, '') : 'Unknown';
        const name = legacyDecodeIFCString(rawName);
        const properties = {};
        if (parts.length > 4) {
            const propIds = parts[4].match(/#\d+/g);
            if (propIds) {
                for (const propId of propIds) {
                    const id = propId.substring(1);
                    const propEntity = entityMap.get(id);
                    if (propEntity && propEntity.type === 'IFCPROPERTYSINGLEVALUE') {
                        const prop = legacyParseProperty(propEntity.params);
                        if (prop) properties[prop.name] = prop.value;
                    }
                }
            }
        }
        return { name, properties };
    }

    function legacyParseRelDefines(params) {
        const parts = legacySplitParams(params);
        const relatedObjects = parts[4] ? parts[4].match(/#\d+/g)?.map(r => r.substring(1)) : [];
        const relatingMatch = parts[5] ? parts[5].match(/#(\d+)/) : null;
        return {
            relatedObjects,
            relatingPropertyDefinition: relatingMatch ? relatingMatch[1] : null
        };
    }

    const samples = [
        {
            label: 'minimal IFC with one IFCWALL',
            content: `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`
        },
        {
            label: 'IFC with pset',
            content: `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#3=IFCPROPERTYSET('pset-guid',$,'Pset_WallCommon',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`
        },
        {
            label: 'IFCBUILDINGELEMENTPROXY (real-world case)',
            content: `ISO-10303-21;
DATA;
#1=IFCBUILDINGELEMENTPROXY('proxy-guid',$,'Proxy_001','desc','tag',$,$,'876',$);
#2=IFCPROPERTYSINGLEVALUE('Custom',$,IFCLABEL('value'),$);
#3=IFCPROPERTYSET('pset-guid',$,'CustomPset',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`
        }
    ];

    samples.forEach((sample) => {
        it(`output JSON-identical between IFCParserCore and legacy parseIFCFileAsync — ${sample.label}`, async () => {
            // Legacy path — inline copy of validator.js parseIFCFileAsync logic
            const legacy = await legacyParseIFCFileAsync(sample.content, 'snapshot.ifc');
            const fresh = window.IFCParserCore.parseIFCContent(sample.content, 'snapshot.ifc');
            const same = deepEqual(legacy, fresh);
            if (!same) {
                console.log('LEGACY:', JSON.stringify(normalize(legacy), null, 2));
                console.log('FRESH:', JSON.stringify(normalize(fresh), null, 2));
            }
            expect(same).toBe(true);
        });
    });
});
