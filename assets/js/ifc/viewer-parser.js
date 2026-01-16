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

/**
 * Fast entity parsing using indexOf/substring instead of regex
 * Much faster for long lines (1MB+ geometry data)
 */
function parseEntityFast(line) {
    // Find #ID=
    if (!line.startsWith('#')) {
        return null;
    }

    const eqPos = line.indexOf('=');
    if (eqPos === -1) {
        return null;
    }

    const id = line.substring(1, eqPos).trim();

    // Find entity type
    const parenPos = line.indexOf('(', eqPos);
    if (parenPos === -1) {
        return null;
    }

    const entityType = line.substring(eqPos + 1, parenPos).trim();

    // Check if we should skip this entity type
    if (SKIP_ENTITY_TYPES.has(entityType)) {
        return { id, type: entityType, params: null, skipped: true };
    }

    // Extract params (everything between first ( and last ))
    const lastParen = line.lastIndexOf(')');
    if (lastParen === -1) {
        return null;
    }

    const params = line.substring(parenPos + 1, lastParen);

    return { id, type: entityType, params, skipped: false };
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
            message: 'Soubor je zašifrovaný (Microsoft Intune). Dešifrujte ho před nahráním.'
        };
    }

    // Check for valid IFC header
    if (!content.includes('ISO-10303-21;') && !content.includes('ISO-10303-21 ;')) {
        return {
            valid: false,
            error: 'invalid',
            message: 'Neplatný IFC formát - soubor neobsahuje standardní IFC hlavičku.'
        };
    }

    if (!content.includes('DATA;')) {
        return {
            valid: false,
            error: 'invalid',
            message: 'Neplatný IFC formát - soubor neobsahuje datovou sekci.'
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

function splitParams(params) {
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

// =======================
// ENTITY EXTRACTION
// =======================

function extractGUID(params) {
    const match = params.match(/'([^']+)'/);
    return match ? match[1] : null;
}

function extractName(params) {
    const matches = params.match(/'([^']*)'/g);
    const rawName = matches && matches.length > 1 ? matches[1].replace(/'/g, '') : null;
    return rawName ? decodeIFCString(rawName) : null;
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

    // String types
    const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
    if (stringMatch) {
        value = decodeIFCString(stringMatch[1]);
        return { name, value };
    }

    // Boolean type
    const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
    if (booleanMatch) {
        value = booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE';
        return { name, value };
    }

    // Logical type
    const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
    if (logicalMatch) {
        const v = logicalMatch[1].toUpperCase();
        value = v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN';
        return { name, value };
    }

    // Numeric types
    const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
    if (numericMatch) {
        value = numericMatch[1];
        return { name, value };
    }

    // Plane angle measure
    const angleMatch = value.match(/IFCPLANEANGLEMEASURE\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
    if (angleMatch) {
        value = angleMatch[1];
        return { name, value };
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

async function parseIFCAsync(content, fileName, fileIndex, totalFiles) {
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
                `⚠️ Velmi velký soubor (${sizeMB} MB)!\n\n` +
                `Soubor "${fileName}" je velmi velký a může způsobit zpomalení prohlížeče.\n\n` +
                'Pro optimalizaci budou přeskočeny geometrické entity (viewer je nepotřebuje pro zobrazení properties).\n\n' +
                'Chcete pokračovat?'
            );
            if (!confirmed) {
                throw new Error('Načítání zrušeno uživatelem.');
            }
        } else if (fileSize > LARGE_FILE_THRESHOLD) {
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(0);
            console.info(`[IFC Parser] Velký soubor (${sizeMB} MB) - používám optimalizovaný parser.`);
        }

        const fileData = [];
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();
        const layerMap = new Map();
        const productShapeMap = new Map();

        const CHUNK_SIZE = 2000;
        const totalLines = lines.length;

        // Phase 1: Collect entities with multi-line support (OPTIMIZED)
        window.updateProgress(0, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase1')}`);

        let entityBuffer = '';
        let inDataSection = false;

        for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
            const chunk = lines.slice(i, i + CHUNK_SIZE);

            for (let line of chunk) {
                line = line.trim();

                if (line === 'DATA;') {
                    inDataSection = true;
                    continue;
                }
                if (line === 'ENDSEC;') {
                    if (entityBuffer) {
                        // Use fast parsing for buffered entities
                        const parsed = parseEntityFast(entityBuffer);
                        if (parsed && !parsed.skipped) {
                            entityMap.set(parsed.id, { id: parsed.id, type: parsed.type, params: parsed.params });
                        } else if (parsed && parsed.skipped) {
                            skippedEntities++;
                        }
                        entityBuffer = '';
                    }
                    inDataSection = false;
                    continue;
                }

                if (!inDataSection) {
                    continue;
                }
                if (!line) {
                    continue;
                }

                if (entityBuffer) {
                    entityBuffer += ' ' + line;
                    if (window.isIfcEntityComplete(entityBuffer)) {
                        // Use fast parsing for long lines
                        const parsed = parseEntityFast(entityBuffer);
                        if (parsed && !parsed.skipped) {
                            entityMap.set(parsed.id, { id: parsed.id, type: parsed.type, params: parsed.params });
                        } else if (parsed && parsed.skipped) {
                            skippedEntities++;
                        }
                        entityBuffer = '';
                    }
                } else if (line.startsWith('#')) {
                    if (window.isIfcEntityComplete(line)) {
                        // Use fast parsing - much faster for long lines
                        const parsed = parseEntityFast(line);
                        if (parsed && !parsed.skipped) {
                            entityMap.set(parsed.id, { id: parsed.id, type: parsed.type, params: parsed.params });
                        } else if (parsed && parsed.skipped) {
                            skippedEntities++;
                        }
                    } else {
                        entityBuffer = line;
                    }
                }
            }

            const progress = ((i + CHUNK_SIZE) / totalLines) * 25;
            window.updateProgress(progress, `${i18n.t('validator.loading.parsingIfcNum')} ${fileIndex}/${totalFiles}: ${fileName} - ${i18n.t('viewer.phase1')} (${i + CHUNK_SIZE}/${totalLines} ${i18n.t('viewer.rows')})`);

            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Log optimization stats
        if (skippedEntities > 0) {
            console.info(`[IFC Parser] Přeskočeno ${skippedEntities.toLocaleString()} geometrických entit pro optimalizaci.`);
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
                            fileName: fileName
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

        await window.storeIFCContent(fileName, content);

        state.loadedFiles.push({
            fileName,
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
window.validateIFCContent = validateIFCContent;
window.SKIP_ENTITY_TYPES = SKIP_ENTITY_TYPES;
window.REQUIRED_ENTITY_TYPES = REQUIRED_ENTITY_TYPES;
window.LARGE_FILE_THRESHOLD = LARGE_FILE_THRESHOLD;
window.VERY_LARGE_FILE_THRESHOLD = VERY_LARGE_FILE_THRESHOLD;
