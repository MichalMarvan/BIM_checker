/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/* ===========================================
   BIM CHECKER - IFC VIEWER PARSER
   IFC file parsing functions
   =========================================== */

// =======================
// LARGE FILE OPTIMIZATION
// =======================

// Entity types to SKIP (geometry, styling - not needed for property viewer)
const SKIP_ENTITY_TYPES = new Set([
    // Geometry primitives
    'IFCCARTESIANPOINT',
    'IFCCARTESIANPOINTLIST2D',
    'IFCCARTESIANPOINTLIST3D',
    'IFCDIRECTION',
    'IFCVECTOR',
    'IFCAXIS1PLACEMENT',
    'IFCAXIS2PLACEMENT2D',
    'IFCAXIS2PLACEMENT3D',
    // Mesh/solid geometry
    'IFCINDEXEDPOLYGONALFACE',
    'IFCINDEXEDPOLYGONALFACEWITHVOIDS',
    'IFCPOLYGONALFACESET',
    'IFCTRIANGULATEDFACESET',
    'IFCEXTRUDEDAREASOLID',
    'IFCREVOLVEDAREASOLID',
    'IFCSWEPTDISKSOLID',
    'IFCBOOLEANCLIPPINGRESULT',
    'IFCBOOLEANRESULT',
    'IFCHALFSPACESOLID',
    'IFCPOLYGONALBOUNDEDHALFSPACE',
    // Curves and profiles
    'IFCPOLYLINE',
    'IFCINDEXEDPOLYCURVE',
    'IFCCOMPOSITECURVE',
    'IFCCOMPOSITECURVESEGMENT',
    'IFCTRIMMEDCURVE',
    'IFCCIRCLE',
    'IFCELLIPSE',
    'IFCLINE',
    'IFCARBITRARYCLOSEDPROFILEDEF',
    'IFCARBITRARYOPENPROFILEDEF',
    'IFCARBITRARYPROFILEDEFWITHVOIDS',
    'IFCRECTANGLEPROFILEDEF',
    'IFCCIRCLEPROFILEDEF',
    'IFCISHAPEPROFILEDEF',
    'IFCLSHAPEPROFILEDEF',
    'IFCTSHAPEPROFILEDEF',
    'IFCUSHAPEPROFILEDEF',
    'IFCZSHAPEPROFILEDEF',
    'IFCCSHAPEPROFILEDEF',
    'IFCASYMMETRICISHAPEPROFILEDEF',
    // Representation items
    'IFCFACETEDBREP',
    'IFCFACEOUTERBOUND',
    'IFCFACEBOUND',
    'IFCFACE',
    'IFCCLOSEDSHELL',
    'IFCOPENSHELL',
    'IFCCONNECTEDFACESET',
    'IFCGEOMETRICSET',
    'IFCGEOMETRICCURVESET',
    // Styling (colors, materials appearance)
    'IFCSTYLEDITEM',
    'IFCSTYLEDREPRESENTATION',
    'IFCPRESENTATIONSTYLEASSIGNMENT',
    'IFCSURFACESTYLE',
    'IFCSURFACESTYLERENDERING',
    'IFCSURFACESTYLESHADING',
    'IFCCOLOURRGB',
    'IFCCOLOURRGBLIST',
    'IFCINDEXEDCOLOURMAP',
    'IFCDRAUGHTINGPREDEFINEDCOLOUR',
    'IFCCURVESTYLE',
    'IFCFILLAREASTYLE',
    'IFCTEXTSTYLE',
    // Mapped items (instances)
    'IFCMAPPEDITEM',
    'IFCREPRESENTATIONMAP',
    // Tessellation
    'IFCTESSELLATEDITEM',
    'IFCPOLYGONALTESSELLATEDFACESET',
    // Topology
    'IFCEDGECURVE',
    'IFCORIENTEDEDGE',
    'IFCEDGELOOP',
    'IFCPOLYLOOP',
    'IFCVERTEXPOINT',
    // Additional geometry
    'IFCBSPLINECURVE',
    'IFCBSPLINECURVEWITHKNOTS',
    'IFCBSPLINESURFACE',
    'IFCBSPLINESURFACEWITHKNOTS',
    'IFCRATIONALBSPLINECURVEWITHKNOTS',
    'IFCRATIONALBSPLINESURFACEWITHKNOTS',
    'IFCSURFACECURVE',
    'IFCPCURVE',
    'IFCOFFSETCURVE2D',
    'IFCOFFSETCURVE3D',
    // Context items we don't need
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
    // Shape representations (keep IFCPRODUCTDEFINITIONSHAPE for layer lookup)
    'IFCSHAPEREPRESENTATION',
    'IFCSHAPEASPECT',
    'IFCTOPOLOGYREPRESENTATION'
]);

// Entity types we NEED (will be parsed fully)
const REQUIRED_ENTITY_TYPES = new Set([
    // Spatial structure
    'IFCPROJECT',
    'IFCSITE',
    'IFCBUILDING',
    'IFCBUILDINGSTOREY',
    'IFCSPACE',
    'IFCZONE',
    // Products (building elements)
    'IFCWALL',
    'IFCWALLSTANDARDCASE',
    'IFCCURTAINWALL',
    'IFCDOOR',
    'IFCWINDOW',
    'IFCSLAB',
    'IFCROOF',
    'IFCBEAM',
    'IFCCOLUMN',
    'IFCMEMBER',
    'IFCPLATE',
    'IFCSTAIR',
    'IFCSTAIRFLIGHT',
    'IFCRAMP',
    'IFCRAMPFLIGHT',
    'IFCRAILING',
    'IFCCOVERING',
    'IFCFOOTING',
    'IFCPILE',
    'IFCBUILDINGELEMENTPROXY',
    // Furniture and equipment
    'IFCFURNITURE',
    'IFCFURNISHINGELEMENT',
    'IFCSYSTEMFURNITUREELEMENT',
    // MEP elements
    'IFCFLOWSEGMENT',
    'IFCFLOWTERMINAL',
    'IFCFLOWFITTING',
    'IFCFLOWCONTROLLER',
    'IFCFLOWMOVINGDEVICE',
    'IFCFLOWSTORAGEDEVICE',
    'IFCFLOWTREATMENTDEVICE',
    'IFCENERGYCONVERSIONDEVICE',
    'IFCDISTRIBUTIONELEMENT',
    'IFCDISTRIBUTIONCONTROLELEMENT',
    'IFCDISTRIBUTIONFLOWELEMENT',
    'IFCDISTRIBUTIONPORT',
    'IFCDUCTFITTING',
    'IFCDUCTSEGMENT',
    'IFCDUCTSILENCER',
    'IFCPIPEFITTING',
    'IFCPIPESEGMENT',
    'IFCCABLECARRIERFITTING',
    'IFCCABLECARRIERSEGMENT',
    'IFCCABLEFITTING',
    'IFCCABLESEGMENT',
    // Infrastructure
    'IFCBRIDGE',
    'IFCBRIDGEPART',
    'IFCROAD',
    'IFCROADPART',
    'IFCRAILWAY',
    'IFCRAILWAYPART',
    'IFCALIGNMENT',
    'IFCREFERENT',
    // Assemblies
    'IFCELEMENTASSEMBLY',
    // Opening elements
    'IFCOPENINGELEMENT',
    // Properties and relationships
    'IFCPROPERTYSET',
    'IFCPROPERTYSINGLEVALUE',
    'IFCRELDEFINESBYPROPERTIES',
    'IFCRELDEFINESBYTYPE',
    'IFCRELASSOCIATESMATERIAL',
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCRELAGGREGATES',
    // Types
    'IFCWALLTYPE',
    'IFCDOORTYPE',
    'IFCWINDOWTYPE',
    'IFCSLABTYPE',
    'IFCBEAMTYPE',
    'IFCCOLUMNTYPE',
    'IFCMEMBERTYPE',
    'IFCFURNITURETYPE',
    'IFCSPACETYPE',
    'IFCBUILDINGELEMENTPROXYTYPE',
    // Layers (needed for layer info)
    'IFCPRESENTATIONLAYERASSIGNMENT',
    // Product shape (needed for layer lookup)
    'IFCPRODUCTDEFINITIONSHAPE',
    // Owner history
    'IFCOWNERHISTORY',
    'IFCPERSON',
    'IFCORGANIZATION',
    'IFCPERSONANDORGANIZATION',
    'IFCAPPLICATION'
]);

// Large file threshold (50MB)
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
// Very large file threshold (150MB) - show stronger warning
const VERY_LARGE_FILE_THRESHOLD = 150 * 1024 * 1024;

// =======================
// STEP RECORD TOKENIZER
// =======================
// Stejná sémantika jako parseStepText v assets/js/3d/ifc-engine/parser/step-parser.js
// (ES modul, sem ho nelze importovat — tento soubor je klasický skript): záznam končí
// prvním `;` mimo řetězec ('' = escapovaný apostrof) a mimo /* komentář */, komentáře
// se z textu vyříznou, víceřádkový záznam se spojí bez mezer, záznam nezačínající `#`
// se ignoruje, ENDSEC ukončuje DATA sekci a záznam bez `);`, který spolkl následující
// entitu, se zahodí (zbytek se zpracuje). Paritu hlídá
// tests/test-suites/ifc-parser-parity.test.js a scripts/ifc-diag/parser-parity.mjs.

const IFC_DATA_SECTION_RE = /\bDATA\s*;/;
const IFC_ENTITY_HEAD_RE = /^#(\d+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/;
const IFC_INNER_ENTITY_START_RE = /'(?:[^']|'')*'|(#\d+\s*=)/g;

function skipIfcString(text, openAt) {
    let j = openAt + 1;
    for (;;) {
        j = text.indexOf("'", j);
        if (j === -1) {
            return text.length;
        }
        if (text.charCodeAt(j + 1) === 39) {
            j += 2;
            continue;
        }
        return j + 1;
    }
}

// Záznam, který spolkl následující entitu (chybí `);`): hlavu zahodit, zbytek zpracovat.
function emitIfcRecord(rec, onRecord) {
    if (rec.indexOf('=', 1) !== -1) {
        IFC_INNER_ENTITY_START_RE.lastIndex = 1;
        for (let s = IFC_INNER_ENTITY_START_RE.exec(rec); s !== null; s = IFC_INNER_ENTITY_START_RE.exec(rec)) {
            if (s[1] !== undefined) {
                emitIfcRecord(rec.slice(s.index), onRecord);
                return;
            }
        }
    }
    onRecord(rec);
}

/**
 * Přerušitelný skener DATA sekce: scan() zpracuje záznamy až po zadaný offset,
 * takže parseIFCAsync může mezi dávkami pustit UI (progress) bez rozdělení textu na řádky.
 */
class IfcRecordScanner {
    constructor(text) {
        this.text = text || '';
        this.scanRe = /['/;]/g;
        this.recordText = '';
        this.done = false;
        const dataMatch = IFC_DATA_SECTION_RE.exec(this.text);
        this.segStart = dataMatch ? dataMatch.index + dataMatch[0].length : this.text.length;
        this.done = !dataMatch;
        this.scanRe.lastIndex = this.segStart;
    }

    /** Offset, po který je text zpracovaný. */
    get position() {
        return this.done ? this.text.length : this.scanRe.lastIndex;
    }

    /**
     * Zpracuje záznamy (každý bez `;`, oříznutý, s vyříznutými komentáři), dokud skener
     * nepřekročí offset `limit` nebo nedojde na konec DATA sekce.
     * @param {(rec: string) => void} onRecord
     * @param {number} [limit]
     * @returns {boolean} true, pokud zbývá další práce
     */
    scan(onRecord, limit = Infinity) {
        const text = this.text;
        const scanRe = this.scanRe;
        while (!this.done) {
            const m = scanRe.exec(text);
            if (m === null) {
                this.done = true;
                break;
            }
            const at = m.index;
            if (at >= limit) {
                scanRe.lastIndex = at;
                return true;
            }
            const c = text.charCodeAt(at);
            if (c === 39 /* ' */) {
                scanRe.lastIndex = skipIfcString(text, at);
            } else if (c === 47 /* / */) {
                if (text.charCodeAt(at + 1) !== 42 /* * */) {
                    continue;
                }
                const end = text.indexOf('*/', at + 2);
                this.recordText += text.slice(this.segStart, at);
                this.segStart = end === -1 ? text.length : end + 2;
                scanRe.lastIndex = this.segStart;
            } else {
                let rec = (this.recordText + text.slice(this.segStart, at)).trim();
                this.recordText = '';
                this.segStart = at + 1;
                if (rec === '' || rec.charCodeAt(0) !== 35 /* # */) {
                    if (/^ENDSEC$/i.test(rec)) {
                        this.done = true;
                        break;
                    }
                    continue;
                }
                if (rec.indexOf('\n') !== -1) {
                    rec = rec.replace(/\s*\r?\n\s*/g, '');
                }
                emitIfcRecord(rec, onRecord);
            }
        }
        return false;
    }
}

/**
 * Rozebere jeden záznam `#id=TYPE(params)` (volitelně ukončený `;`) na id, typ a
 * syrové params mezi vnějšími závorkami. Typy ze SKIP_ENTITY_TYPES dostanou
 * `skipped: true` a params se u nich nevyřezávají (rychlé pro dlouhé geometrické řádky).
 * Shodné s ENTITY_RECORD_RE ve step-parseru: id číselné, typ identifikátor, velká písmena.
 */
function parseEntityFast(line) {
    if (!line || line.charCodeAt(0) !== 35 /* # */) {
        return null;
    }
    const head = IFC_ENTITY_HEAD_RE.exec(line);
    if (!head) {
        return null;
    }
    const id = head[1];
    const entityType = head[2].toUpperCase();

    if (SKIP_ENTITY_TYPES.has(entityType)) {
        return { id, type: entityType, params: null, skipped: true };
    }

    let end = line.length;
    while (end > 0 && line.charCodeAt(end - 1) <= 32) end--;
    if (line.charCodeAt(end - 1) === 59 /* ; */) {
        end--;
        while (end > 0 && line.charCodeAt(end - 1) <= 32) end--;
    }
    if (end <= head[0].length || line.charCodeAt(end - 1) !== 41 /* ) */) {
        return null;
    }

    return { id, type: entityType, params: line.slice(head[0].length, end - 1), skipped: false };
}

/**
 * Celá DATA sekce → Map<id, {id, type, params, skipped}> (synchronně; pro testy a paritu).
 */
function collectIfcEntities(content) {
    const map = new Map();
    new IfcRecordScanner(content).scan(rec => {
        const parsed = parseEntityFast(rec);
        if (parsed) {
            map.set(parsed.id, parsed);
        }
    });
    return map;
}

/**
 * Check if file is valid IFC and detect encryption
 */
function validateIFCContent(content) {
    // Check for encryption signatures
    if (content.includes('MSMAMARPCRYPT') || content.includes('AES/CBC')) {
        return {
            valid: false,
            error: 'encrypted',
            message: i18n.t('viewer.error.encryptedFile')
        };
    }

    // Check for valid IFC header
    if (!content.includes('ISO-10303-21;') && !content.includes('ISO-10303-21 ;')) {
        return {
            valid: false,
            error: 'invalid',
            message: i18n.t('viewer.error.invalidIfcHeader')
        };
    }

    if (!content.includes('DATA;')) {
        return {
            valid: false,
            error: 'invalid',
            message: i18n.t('viewer.error.noDataSection')
        };
    }

    return { valid: true };
}

// =======================
// STRING ENCODING/DECODING
// =======================

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

function encodeIFCString(str) {
    // For simplicity, just return the string - IFC encoding is complex
    // In production, this should properly encode non-ASCII characters
    return str;
}

// =======================
// PARAMETER SPLITTING
// =======================

// Shodné s splitParams ve step-parser.js a IFCParserCore._splitParams: prázdné
// položky se zachovávají ("a,,b" → ["a","","b"]), prázdný vstup dává [].
function splitParams(params) {
    const parts = [];
    if (!params || params.trim() === '') {
        return parts;
    }
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
    parts.push(current.trim());
    return parts;
}

// =======================
// ENTITY EXTRACTION
// =======================

function extractGUID(params) {
    const match = params.match(/'([^']+)'/);
    return match ? match[1] : null;
}

function extractName(params) {
    const parts = splitParams(params);
    return unquoteParam(parts[2]);
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

// =======================
// PROPERTY PARSING
// =======================

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

function parseLayerAssignment(params, entityMap) {
    const parts = splitParams(params);
    const rawName = parts[0] ? parts[0].replace(/'/g, '') : 'Unknown';
    const name = decodeIFCString(rawName);
    const assignedItems = parts[2] ? parts[2].match(/#\d+/g)?.map(r => r.substring(1)) : [];

    return { name, assignedItems };
}

// =======================
// MAIN PARSING FUNCTIONS
// =======================

async function parseIFCAsync(content, fileName, fileIndex, totalFiles, fileId = null) {
    const state = window.ViewerState;

    try {
        // === VALIDATION ===
        const validation = validateIFCContent(content);
        if (!validation.valid) {
            throw new Error(validation.message);
        }

        // === LARGE FILE WARNING ===
        const fileSize = content.length;
        let skippedEntities = 0;

        if (fileSize > VERY_LARGE_FILE_THRESHOLD) {
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(0);
            const confirmed = confirm(
                i18n.t('viewer.warn.largeFile', { sizeMB }) +
                i18n.t('viewer.warn.largeFileSize', { fileName }) +
                i18n.t('viewer.warn.largeFileExplain') +
                i18n.t('viewer.warn.largeFileContinue')
            );
            if (!confirmed) {
                throw new Error(i18n.t('viewer.warn.cancelled'));
            }
        } else if (fileSize > LARGE_FILE_THRESHOLD) {
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(0);
            console.info(i18n.t('viewer.log.largeFileOptimized', { sizeMB }));
        }

        const fileData = [];
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();
        const layerMap = new Map();
        const productShapeMap = new Map();

        const CHUNK_SIZE = 2000;

        // Phase 1: Collect entities — one tokenizer pass over the DATA section
        // (comments, multi-line records and ';' in strings handled like parseStepText),
        // interrupted every SCAN_STEP characters to update progress.
        window.updateProgress(0, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase1')}`);

        const SCAN_STEP = 2 * 1024 * 1024;
        const scanner = new IfcRecordScanner(content);
        const onRecord = rec => {
            const parsed = parseEntityFast(rec);
            if (!parsed) {
                return;
            }
            if (parsed.skipped) {
                skippedEntities++;
            } else {
                entityMap.set(parsed.id, { id: parsed.id, type: parsed.type, params: parsed.params });
            }
        };

        for (let limit = scanner.position + SCAN_STEP; scanner.scan(onRecord, limit); limit += SCAN_STEP) {
            const done = Math.min(scanner.position, fileSize);
            const progress = (done / Math.max(fileSize, 1)) * 25;
            window.updateProgress(progress, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase1')} (${Math.round(progress * 4)} %)`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Log optimization stats
        if (skippedEntities > 0) {
            console.info(i18n.t('viewer.log.skippedGeometry', { count: skippedEntities.toLocaleString() }));
        }

        // Phase 2: Parse property sets and relationships
        window.updateProgress(25, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase2')}`);
        const entities = Array.from(entityMap.entries());
        const containedInSpatialMap = new Map();
        const aggregatesMap = new Map();

        for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
            const chunk = entities.slice(i, i + CHUNK_SIZE);

            for (const [id, entity] of chunk) {
                if (entity.type === 'IFCPROPERTYSET') {
                    const props = parsePropertySet(entity.params, entityMap);
                    propertySetMap.set(id, props);
                } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                    const rel = parseRelDefines(entity.params);
                    relDefinesMap.set(id, rel);
                } else if (entity.type === 'IFCPRESENTATIONLAYERASSIGNMENT') {
                    const layer = parseLayerAssignment(entity.params, entityMap);
                    if (layer && layer.assignedItems) {
                        layer.assignedItems.forEach(itemId => {
                            layerMap.set(itemId, layer.name);
                        });
                    }
                } else if (entity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
                    const shapeReps = entity.params.match(/#\d+/g);
                    if (shapeReps) {
                        productShapeMap.set(id, shapeReps.map(r => r.substring(1)));
                    }
                } else if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
                    const relatedElements = entity.params.match(/\(([#\d,\s]+)\)/);
                    const relatingStructure = entity.params.match(/,\s*#(\d+)\s*$/);
                    if (relatedElements && relatingStructure) {
                        const children = relatedElements[1].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                        const parent = relatingStructure[1];
                        containedInSpatialMap.set(id, { parent, children });
                    }
                } else if (entity.type === 'IFCRELAGGREGATES') {
                    const match = entity.params.match(/#(\d+)\s*,\s*\(([#\d,\s]+)\)/);
                    if (match) {
                        const parent = match[1];
                        const children = match[2].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                        aggregatesMap.set(id, { parent, children });
                    }
                }
            }

            const progress = 25 + ((i + CHUNK_SIZE) / entities.length) * 25;
            window.updateProgress(progress, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase2')} (${i + CHUNK_SIZE}/${entities.length} ${i18n.t('viewer.entities')})`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Phase 3: Build spatial structure tree
        window.updateProgress(50, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase3')}`);

        const spatialTree = buildSpatialTree(entityMap, aggregatesMap, containedInSpatialMap);

        // Phase 4: Build final data
        window.updateProgress(60, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase4')}`);
        let processedEntities = 0;

        for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
            const chunk = entities.slice(i, i + CHUNK_SIZE);

            for (const [id, entity] of chunk) {
                if (entity.type.startsWith('IFC') &&
                    !entity.type.includes('REL') &&
                    !entity.type.includes('PROPERTY') &&
                    entity.params.includes("'")) {

                    const guid = extractGUID(entity.params);
                    const name = extractName(entity.params);

                    if (guid) {
                        const propertySets = {};

                        for (const [relId, rel] of relDefinesMap) {
                            if (rel.relatedObjects && rel.relatedObjects.includes(id)) {
                                const psetId = rel.relatingPropertyDefinition;
                                if (propertySetMap.has(psetId)) {
                                    const pset = propertySetMap.get(psetId);
                                    propertySets[pset.name] = pset.properties;
                                }
                            }
                        }

                        let entityLayer = '-';
                        const representationMatch = entity.params.match(/#(\d+)/g);
                        if (representationMatch) {
                            for (const refId of representationMatch) {
                                const cleanRefId = refId.substring(1);
                                const refEntity = entityMap.get(cleanRefId);

                                if (refEntity && refEntity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
                                    const shapeReps = productShapeMap.get(cleanRefId);
                                    if (shapeReps) {
                                        for (const shapeRepId of shapeReps) {
                                            if (layerMap.has(shapeRepId)) {
                                                entityLayer = layerMap.get(shapeRepId);
                                                break;
                                            }
                                        }
                                    }
                                    if (entityLayer !== '-') {
                                        break;
                                    }
                                }
                            }
                        }

                        fileData.push({
                            guid,
                            ifcId: id,
                            entity: entity.type,
                            name: name || '-',
                            layer: entityLayer,
                            propertySets,
                            fileName: fileName,
                            fileId
                        });
                    }
                }
                processedEntities++;
            }

            const progress = 60 + ((i + CHUNK_SIZE) / entities.length) * 40;
            window.updateProgress(progress, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase4')} (${processedEntities}/${entities.length} ${i18n.t('viewer.entities')})`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const color = state.fileColors[state.loadedFiles.length % state.fileColors.length];

        await window.storeIFCContent(fileName, content, fileId);

        state.loadedFiles.push({
            fileName,
            fileId,
            data: fileData,
            color,
            entityCount: fileData.length,
            spatialTree: spatialTree
        });

        window.updateFileList();
        window.updateProgress(100, `${i18n.t('viewer.fileProcessed')}: ${fileName}`);

    } catch (error) {
        ErrorHandler.error(`${i18n.t('viewer.fileError')} ${fileName}: ${error.message}`);
        throw error;
    }
}

function buildSpatialTree(entityMap, aggregatesMap, containedInSpatialMap) {
    const spatialTree = [];
    const processedNodes = new Set();

    function buildNode(entityId) {
        if (processedNodes.has(entityId)) {
            return null;
        }
        processedNodes.add(entityId);

        const entity = entityMap.get(entityId);
        if (!entity) {
            return null;
        }

        const node = {
            id: entityId,
            type: entity.type,
            name: extractName(entity.params) || '-',
            children: []
        };

        for (const [relId, rel] of aggregatesMap) {
            if (rel.parent === entityId) {
                rel.children.forEach(childId => {
                    const childNode = buildNode(childId);
                    if (childNode) {
                        node.children.push(childNode);
                    }
                });
            }
        }

        for (const [relId, rel] of containedInSpatialMap) {
            if (rel.parent === entityId) {
                rel.children.forEach(childId => {
                    const childNode = buildNode(childId);
                    if (childNode) {
                        node.children.push(childNode);
                    }
                });
            }
        }

        return node;
    }

    // Find root (IFCPROJECT)
    for (const [id, entity] of entityMap) {
        if (entity.type === 'IFCPROJECT') {
            const rootNode = buildNode(id);
            if (rootNode) {
                spatialTree.push(rootNode);
            }
            break;
        }
    }

    // Handle orphaned containers
    handleOrphanedContainers(spatialTree, entityMap, containedInSpatialMap, processedNodes);

    return spatialTree;
}

function handleOrphanedContainers(spatialTree, entityMap, containedInSpatialMap, processedNodes) {
    const orphanedContainers = [];

    for (const [relId, rel] of containedInSpatialMap) {
        if (!processedNodes.has(rel.parent)) {
            const parentEntity = entityMap.get(rel.parent);
            orphanedContainers.push({
                id: rel.parent,
                entity: parentEntity,
                children: rel.children
            });
        }
    }

    if (orphanedContainers.length === 0) {
        return;
    }

    function findAppropriateParent(tree, orphanType) {
        const typeHierarchy = {
            'IFCBUILDINGSTOREY': ['IFCBUILDING'],
            'IFCBUILDING': ['IFCSITE'],
            'IFCSITE': ['IFCPROJECT'],
            'IFCSPACE': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
            'IFCELEMENTASSEMBLY': ['IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE'],
            'IFCWALL': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
            'IFCSLAB': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
            'IFCBEAM': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
            'IFCCOLUMN': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
            'IFCMEMBER': ['IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCELEMENTASSEMBLY'],
            'IFCPLATE': ['IFCBUILDINGSTOREY', 'IFCBUILDING']
        };

        const preferredParents = typeHierarchy[orphanType] || ['IFCBUILDINGSTOREY', 'IFCBUILDING'];
        const candidates = [];

        function searchTree(nodes, depth = 0) {
            for (const node of nodes) {
                if (preferredParents.includes(node.type)) {
                    candidates.push({ node, depth });
                }
                if (node.children && node.children.length > 0) {
                    searchTree(node.children, depth + 1);
                }
            }
        }

        searchTree(tree);

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.depth - a.depth);
            return candidates[0].node;
        }

        return null;
    }

    for (const orphan of orphanedContainers) {
        if (!orphan.entity) {
            continue;
        }

        const orphanNode = {
            id: orphan.id,
            type: orphan.entity.type,
            name: extractName(orphan.entity.params) || '-',
            children: []
        };

        for (const childId of orphan.children) {
            const childEntity = entityMap.get(childId);
            if (childEntity) {
                orphanNode.children.push({
                    id: childId,
                    type: childEntity.type,
                    name: extractName(childEntity.params) || '-',
                    children: []
                });
            }
        }

        const parentNode = findAppropriateParent(spatialTree, orphan.entity.type);

        if (parentNode) {
            parentNode.children.push(orphanNode);
            processedNodes.add(orphan.id);
        }
    }
}

// Simpler sync version for smaller files
async function parseIFC(content, fileName) {
    // Reuse async version
    return parseIFCAsync(content, fileName, 1, 1);
}

// Export to window
window.decodeIFCString = decodeIFCString;
window.encodeIFCString = encodeIFCString;
window.splitParams = splitParams;
window.extractGUID = extractGUID;
window.extractName = extractName;
window.parsePropertySet = parsePropertySet;
window.parseProperty = parseProperty;
window.parseRelDefines = parseRelDefines;
window.parseLayerAssignment = parseLayerAssignment;
window.parseIFCAsync = parseIFCAsync;
window.parseIFC = parseIFC;
window.buildSpatialTree = buildSpatialTree;
// Large file optimization exports
window.parseEntityFast = parseEntityFast;
window.IfcRecordScanner = IfcRecordScanner;
window.collectIfcEntities = collectIfcEntities;
// Namespace export: window.splitParams přepisují klasické skripty se stejnojmennou
// funkcí (např. testy); parita a nástroje berou funkce odsud.
window.ViewerParser = Object.freeze({ splitParams, parseEntityFast, collectIfcEntities, IfcRecordScanner });
window.validateIFCContent = validateIFCContent;
window.SKIP_ENTITY_TYPES = SKIP_ENTITY_TYPES;
window.REQUIRED_ENTITY_TYPES = REQUIRED_ENTITY_TYPES;
window.LARGE_FILE_THRESHOLD = LARGE_FILE_THRESHOLD;
window.VERY_LARGE_FILE_THRESHOLD = VERY_LARGE_FILE_THRESHOLD;
