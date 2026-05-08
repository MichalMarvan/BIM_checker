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
        const matches = params.match(/'([^']*)'/g);
        const rawName = matches && matches.length > 1 ? matches[1].replace(/'/g, '') : null;
        return rawName ? decodeIFCString(rawName) : null;
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
                    if (propEntity && propEntity.type === 'IFCPROPERTYSINGLEVALUE') {
                        const prop = parseProperty(propEntity.params);
                        if (prop) {
                            properties[prop.name] = prop.value;
                        }
                    }
                }
            }
        }

        return { name, properties };
    }

    function parseProperty(params) {
        const parts = splitParams(params);
        if (parts.length < 3) {
            return null;
        }
        const rawName = parts[0].replace(/'/g, '');
        const name = decodeIFCString(rawName);
        let value = parts[2] || '';

        // Handle $ (undefined/null) value
        if (value === '$' || value.trim() === '') {
            return { name, value: '' };
        }

        // String types: IFCLABEL, IFCTEXT, IFCIDENTIFIER, IFCDESCRIPTIVEMEASURE
        const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
        if (stringMatch) {
            return { name, value: decodeIFCString(stringMatch[1]) };
        }

        // Boolean type: IFCBOOLEAN(.T.) or IFCBOOLEAN(.F.)
        const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
        if (booleanMatch) {
            return { name, value: booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE' };
        }

        // Logical type: IFCLOGICAL(.T.), (.F.), (.U.)
        const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
        if (logicalMatch) {
            const v = logicalMatch[1].toUpperCase();
            return { name, value: v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN' };
        }

        // Numeric types
        const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (numericMatch) {
            return { name, value: numericMatch[1] };
        }

        // Plane angle measure
        const angleMatch = value.match(/IFCPLANEANGLEMEASURE\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
        if (angleMatch) {
            return { name, value: angleMatch[1] };
        }

        return { name, value };
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

    function parseIFCContent(_content, _fileName) {
        // Stub — implemented in Task 3
        return [];
    }

    global.IFCParserCore = {
        parseIFCContent,
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
