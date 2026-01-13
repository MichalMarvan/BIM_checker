// XSS prevention utility
function escapeHtml(text) {
    if (text === null || text === undefined) {
        return '';
    }
    const str = String(text);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let ifcFiles = [];
let idsFiles = [];
let validationResults = null;
const allEntities = [];

// Upload handlers (with null checks)
const ifcUploadBox = document.getElementById('ifcUploadBox');
const idsUploadBox = document.getElementById('idsUploadBox');
const ifcInput = document.getElementById('ifcInput');
const idsInput = document.getElementById('idsInput');

if (ifcUploadBox && ifcInput) {
    ifcUploadBox.addEventListener('click', () => {
        ifcInput.click();
    });
}

if (idsUploadBox && idsInput) {
    idsUploadBox.addEventListener('click', () => {
        idsInput.click();
    });
}

if (ifcInput) {
    ifcInput.addEventListener('change', (e) => {
        handleIFCFiles(Array.from(e.target.files));
    });
}

if (idsInput) {
    idsInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleIDSFiles(Array.from(e.target.files));
        }
    });
}

// Drag and drop for IFC
function setupDragDrop(boxId, inputId, handler) {
    const box = document.getElementById(boxId);
    if (!box) {
        return;
    } // Skip if element doesn't exist

    box.addEventListener('dragover', (e) => {
        e.preventDefault();
        box.style.borderColor = '#764ba2';
    });

    box.addEventListener('dragleave', () => {
        box.style.borderColor = '#667eea';
    });

    box.addEventListener('drop', (e) => {
        e.preventDefault();
        box.style.borderColor = '#667eea';
        const files = Array.from(e.dataTransfer.files);
        handler(files);
    });
}

setupDragDrop('ifcUploadBox', 'ifcInput', handleIFCFiles);
setupDragDrop('idsUploadBox', 'idsInput', handleIDSFiles);

function handleIFCFiles(files) {
    const ifcFiles_filtered = files.filter(f => f.name.endsWith('.ifc'));

    if (ifcFiles_filtered.length === 0) {
        showError(t('validator.error.onlyIfc'));
        return;
    }

    ifcFiles = ifcFiles_filtered;
    updateIFCFileList();
    updateValidateButton();
}

function handleIDSFiles(files) {
    const idsFiles_filtered = files.filter(f => f.name.match(/\.(ids|xml)$/i));

    if (idsFiles_filtered.length === 0) {
        showError(t('validator.error.onlyIds'));
        return;
    }

    let processed = 0;
    const newIdsFiles = [];

    idsFiles_filtered.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const idsData = parseIDS(e.target.result, file.name);
                newIdsFiles.push({
                    fileName: file.name,
                    data: idsData
                });
                processed++;

                if (processed === idsFiles_filtered.length) {
                    idsFiles.push(...newIdsFiles);
                    updateIDSFileList();
                    updateValidateButton();
                }
            } catch (error) {
                showError(t('validator.error.idsLoadError') + ' ' + file.name + ': ' + error.message);
            }
        };
        reader.onerror = () => {
            showError(t('validator.error.idsLoadError') + ' ' + file.name + ': ' + (reader.error?.message || 'Unknown error'));
        };
        reader.readAsText(file);
    });
}

function updateIFCFileList() {
    const list = document.getElementById('ifcFileList');
    const box = document.getElementById('ifcUploadBox');

    // These elements don't exist on this page (old version), so skip
    if (!list || !box) {
        return;
    }

    if (ifcFiles.length > 0) {
        box.classList.add('has-files');
        list.innerHTML = '';
        ifcFiles.forEach((file, idx) => {
            const div = document.createElement('div');
            div.className = 'file-item';

            const span = document.createElement('span');
            span.className = 'file-item-name';
            span.textContent = file.name;

            const btn = document.createElement('button');
            btn.className = 'file-remove';
            btn.textContent = '×';
            btn.addEventListener('click', () => removeIFCFile(idx));

            div.appendChild(span);
            div.appendChild(btn);
            list.appendChild(div);
        });
    } else {
        box.classList.remove('has-files');
        list.innerHTML = '';
    }
}

function updateIDSFileList() {
    const list = document.getElementById('idsFileList');
    const box = document.getElementById('idsUploadBox');

    // These elements don't exist on this page (old version), so skip
    if (!list || !box) {
        return;
    }

    if (idsFiles.length > 0) {
        box.classList.add('has-files');
        list.innerHTML = '';
        idsFiles.forEach((file, idx) => {
            const div = document.createElement('div');
            div.className = 'file-item';

            const span = document.createElement('span');
            span.className = 'file-item-name';
            span.textContent = file.fileName;

            const btn = document.createElement('button');
            btn.className = 'file-remove';
            btn.textContent = '×';
            btn.addEventListener('click', () => removeIDSFile(idx));

            div.appendChild(span);
            div.appendChild(btn);
            list.appendChild(div);
        });
    } else {
        box.classList.remove('has-files');
        list.innerHTML = '';
    }
}

function removeIFCFile(index) {
    ifcFiles.splice(index, 1);
    updateIFCFileList();
    updateValidateButton();
}

function removeIDSFile(index) {
    idsFiles.splice(index, 1);
    updateIDSFileList();
    updateValidateButton();
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 5000);
}

// IDS Parsing
function parseIDS(xmlString, fileName) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error(t('validator.error.invalidXml'));
    }

    return {
        info: extractIDSInfo(xmlDoc),
        specifications: extractSpecifications(xmlDoc)
    };
}

function extractIDSInfo(xmlDoc) {
    const info = {};
    const infoElement = xmlDoc.querySelector('info');

    if (infoElement) {
        info.title = infoElement.querySelector('title')?.textContent || t('validator.info.noTitle');
        info.version = infoElement.querySelector('version')?.textContent || '';
    }

    return info;
}

function extractSpecifications(xmlDoc) {
    const specifications = [];
    const specElements = xmlDoc.querySelectorAll('specification');

    specElements.forEach((spec, index) => {
        const specification = {
            name: spec.getAttribute('name') || `${t('validator.info.noSpec')} ${index + 1}`,
            ifcVersion: spec.getAttribute('ifcVersion') || 'IFC4',
            applicability: extractFacets(spec.querySelector('applicability')),
            requirements: extractFacets(spec.querySelector('requirements'))
        };
        specifications.push(specification);
    });

    return specifications;
}

function extractFacets(facetsElement) {
    if (!facetsElement) {
        return [];
    }

    const facets = [];
    const facetTypes = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];

    facetTypes.forEach(type => {
        const elements = facetsElement.querySelectorAll(type);
        elements.forEach(elem => {
            facets.push(extractFacet(elem, type));
        });
    });

    return facets;
}

function extractFacet(element, type) {
    const facet = { type };

    const nameElem = element.querySelector('name, baseName');
    if (nameElem) {
        facet.name = extractValue(nameElem);
    }

    const valueElem = element.querySelector('value');
    if (valueElem) {
        facet.value = extractValue(valueElem);
    }

    if (type === 'property') {
        const propSetElem = element.querySelector('propertySet, propertyset');
        if (propSetElem) {
            facet.propertySet = extractValue(propSetElem);
        }
    }

    if (type === 'partOf') {
        const relationElem = element.querySelector('relation');
        if (relationElem) {
            facet.relation = extractValue(relationElem);
        }
    }

    if (type === 'classification') {
        const systemElem = element.querySelector('system');
        if (systemElem) {
            facet.system = extractValue(systemElem);
        }
    }

    const predefinedElem = element.querySelector('predefinedType');
    if (predefinedElem) {
        facet.predefinedType = extractValue(predefinedElem);
    }

    facet.cardinality = element.getAttribute('cardinality') || 'required';

    return facet;
}

function extractValue(element) {
    const simpleValue = element.querySelector('simpleValue');
    if (simpleValue) {
        return { type: 'simple', value: simpleValue.textContent };
    }

    const restriction = element.querySelector('restriction');
    if (restriction) {
        return extractRestriction(restriction);
    }

    return { type: 'simple', value: element.textContent };
}

function extractRestriction(restriction) {
    const result = { type: 'restriction' };

    let pattern = restriction.querySelector('pattern');
    if (!pattern) {
        pattern = restriction.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'pattern')[0];
    }
    if (pattern) {
        result.pattern = pattern.getAttribute('value') || pattern.textContent;
        result.isRegex = true;
    }

    const options = restriction.querySelectorAll('option');
    if (options.length > 0) {
        result.options = Array.from(options).map(opt => opt.textContent);
    }

    return result;
}

// Validation
// Note: validateBtn uses onclick="validateAll()" in HTML, so no addEventListener needed here

async function performValidation() {
    document.getElementById('loading').classList.add('show');
    document.querySelector('.upload-section').style.display = 'none';

    const progressText = document.getElementById('progressText');
    const currentFile = document.getElementById('currentFile');
    const loadingText = document.getElementById('loadingText');

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        validationResults = [];

        // Parse all IFC files first
        loadingText.textContent = i18n.t('validator.loading.ifc');
        const parsedIfcFiles = [];
        const totalIfc = ifcFiles.length;

        for (let i = 0; i < ifcFiles.length; i++) {
            const file = ifcFiles[i];
            progressText.textContent = `${i18n.t('validator.loading.parsingIfc')} ${i + 1} / ${totalIfc}`;
            currentFile.textContent = `📦 ${file.name}`;
            await new Promise(resolve => setTimeout(resolve, 50));

            const content = await readFileAsText(file);
            const entities = parseIFCFile(content, file.name);
            parsedIfcFiles.push({
                fileName: file.name,
                entities: entities
            });
        }

        // For each IDS file, validate against all IFC files
        loadingText.textContent = i18n.t('validator.loading.validating');
        const totalIds = idsFiles.length;
        let idsCount = 0;

        for (const idsFile of idsFiles) {
            idsCount++;
            const idsResult = {
                idsFileName: idsFile.fileName,
                idsTitle: idsFile.data.info.title || idsFile.fileName,
                ifcResults: []
            };

            // Validate each IFC file against this IDS
            for (let i = 0; i < parsedIfcFiles.length; i++) {
                const ifcFile = parsedIfcFiles[i];
                progressText.textContent = `IDS ${idsCount}/${totalIds} → IFC ${i + 1}/${totalIfc}`;
                currentFile.textContent = `📋 ${idsFile.fileName} ✓ 📦 ${ifcFile.fileName}`;
                await new Promise(resolve => setTimeout(resolve, 50));

                const ifcResult = {
                    ifcFileName: ifcFile.fileName,
                    specificationResults: validateEntitiesAgainstIDS(ifcFile.entities, idsFile.data.specifications)
                };
                idsResult.ifcResults.push(ifcResult);
            }

            validationResults.push(idsResult);
        }

        // Display results
        loadingText.textContent = i18n.t('validator.generatingResults');
        progressText.textContent = '';
        currentFile.textContent = '';
        displayResults();

        document.getElementById('loading').classList.remove('show');
        document.getElementById('resultsSection').style.display = 'block';
    } catch (error) {
        document.getElementById('loading').classList.remove('show');
        showError(t('validator.error.validationError') + ' ' + error.message);
        document.querySelector('.upload-section').style.display = 'block';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// IFC Parsing (simplified version)
// Async version with chunking for large files
async function parseIFCFileAsync(content, fileName) {
    const entities = [];
    const lines = content.split('\n');
    const entityMap = new Map();
    const propertySetMap = new Map();
    const relDefinesMap = new Map();

    const CHUNK_SIZE = 1000;
    const totalLines = lines.length;

    // Phase 1: Collect entities (chunked)
    for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
        const chunk = lines.slice(i, i + CHUNK_SIZE);
        for (let line of chunk) {
            line = line.trim();
            if (!line.startsWith('#')) {
                continue;
            }
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
            if (!match) {
                continue;
            }
            const [, id, entityType, params] = match;
            entityMap.set(id, { id, type: entityType, params });
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Phase 2: Parse property sets (chunked)
    const entities_array = Array.from(entityMap.entries());
    for (let i = 0; i < entities_array.length; i += CHUNK_SIZE) {
        const chunk = entities_array.slice(i, i + CHUNK_SIZE);
        for (const [id, entity] of chunk) {
            if (entity.type === 'IFCPROPERTYSET') {
                const props = parsePropertySet(entity.params, entityMap);
                propertySetMap.set(id, props);
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                const rel = parseRelDefines(entity.params);
                relDefinesMap.set(id, rel);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Phase 3: Build entities list (chunked)
    for (let i = 0; i < entities_array.length; i += CHUNK_SIZE) {
        const chunk = entities_array.slice(i, i + CHUNK_SIZE);
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
                            if (psetId && propertySetMap.has(psetId)) {
                                const pset = propertySetMap.get(psetId);
                                if (pset && pset.name) {
                                    propertySets[pset.name] = pset.properties;
                                }
                            }
                        }
                    }

                    entities.push({
                        guid,
                        entity: entity.type,
                        name: name || '-',
                        propertySets,
                        fileName,
                        attributes: {
                            Name: name || '-',
                            GlobalId: guid
                        }
                    });
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return entities;
}

// Sync version for compatibility
function parseIFCFile(content, fileName) {
    const entities = [];
    const lines = content.split('\n');
    const entityMap = new Map();
    const propertySetMap = new Map();
    const relDefinesMap = new Map();

    // Collect entities
    for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('#')) {
            continue;
        }
        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
        if (!match) {
            continue;
        }
        const [, id, entityType, params] = match;
        entityMap.set(id, { id, type: entityType, params });
    }

    // Parse property sets
    for (const [id, entity] of entityMap) {
        if (entity.type === 'IFCPROPERTYSET') {
            const props = parsePropertySet(entity.params, entityMap);
            propertySetMap.set(id, props);
        } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
            const rel = parseRelDefines(entity.params);
            relDefinesMap.set(id, rel);
        }
    }

    // Build entities list
    for (const [id, entity] of entityMap) {
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
                        if (psetId && propertySetMap.has(psetId)) {
                            const pset = propertySetMap.get(psetId);
                            if (pset && pset.name) {
                                propertySets[pset.name] = pset.properties;
                            }
                        }
                    }
                }

                entities.push({
                    guid,
                    entity: entity.type,
                    name: name || '-',
                    propertySets,
                    fileName,
                    attributes: {
                        Name: name || '-',
                        GlobalId: guid
                    }
                });
            }
        }
    }

    return entities;
}

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
    // \S\X means: ASCII value of X + 128 (for characters 128-255)
    // e.g., \S\a = 'a'(97) + 128 = 225 = 'á' in ISO 8859-2
    str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));

    // Decode \X\XX format (ISO 8859-1 single byte)
    str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Decode \X2\XXXX...XXXX\X0\ format (UTF-16 - multiple 4-char hex blocks)
    // e.g., \X2\004E0065007600790070006C006E011B006E006F\X0\ = "Nevyplněno"
    str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
        let result = '';
        for (let i = 0; i < hex.length; i += 4) {
            const codePoint = parseInt(hex.substr(i, 4), 16);
            result += String.fromCharCode(codePoint);
        }
        return result;
    });

    // Decode \X4\XXXXXXXX\X0\ format (UTF-32 - 8-char hex blocks for extended Unicode)
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
    const name = decodeIFCString(rawName); // Decode property name
    let value = parts[2] || '';

    // Handle $ (undefined/null) value
    if (value === '$' || value.trim() === '') {
        return { name, value: '' };
    }

    // String types: IFCLABEL, IFCTEXT, IFCIDENTIFIER, IFCDESCRIPTIVEMEASURE
    const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
    if (stringMatch) {
        value = decodeIFCString(stringMatch[1]);
        return { name, value };
    }

    // Boolean type: IFCBOOLEAN(.T.) or IFCBOOLEAN(.F.)
    const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
    if (booleanMatch) {
        value = booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE';
        return { name, value };
    }

    // Logical type: IFCLOGICAL(.T.), (.F.), (.U.)
    const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
    if (logicalMatch) {
        const v = logicalMatch[1].toUpperCase();
        value = v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN';
        return { name, value };
    }

    // Numeric types: IFCREAL, IFCINTEGER, IFCVOLUMEMEASURE, IFCAREAMEASURE, IFCLENGTHMEASURE, etc.
    const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
    if (numericMatch) {
        value = numericMatch[1];
        return { name, value };
    }

    // Plane angle measure: IFCPLANEANGLEMEASURE
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

function splitParams(params) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;

    for (let i = 0; i < params.length; i++) {
        const char = params[i];
        // IFC uses '' (double single quote) for escaped quotes, not \'
        // So we only toggle string mode on single quotes that are not part of ''
        if (char === "'") {
            if (inString && params[i + 1] === "'") {
                // This is an escaped quote (''), add both and skip next
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

// Validation Logic
function validateEntitiesAgainstIDS(entities, specifications) {
    const results = [];

    for (const spec of specifications) {
        const specResult = {
            specification: spec.name,
            status: 'pass',
            passCount: 0,
            failCount: 0,
            entityResults: []
        };

        // Find applicable entities
        const applicableEntities = filterEntitiesByApplicability(entities, spec.applicability);

        // Validate each applicable entity against requirements
        for (const entity of applicableEntities) {
            const entityResult = validateEntityAgainstRequirements(entity, spec.requirements, spec.name);
            specResult.entityResults.push(entityResult);

            if (entityResult.status === 'pass') {
                specResult.passCount++;
            } else {
                specResult.failCount++;
                specResult.status = 'fail';
            }
        }

        // Only add specification if it has entities
        if (specResult.entityResults.length > 0) {
            results.push(specResult);
        }
    }

    return results;
}

// Async version with chunking to prevent browser freezing
async function validateEntitiesAgainstIDSAsync(entities, specifications) {
    const results = [];
    const CHUNK_SIZE = 50; // Process 50 entities at a time

    for (const spec of specifications) {
        const specResult = {
            specification: spec.name,
            status: 'pass',
            passCount: 0,
            failCount: 0,
            entityResults: []
        };

        // Find applicable entities
        const applicableEntities = filterEntitiesByApplicability(entities, spec.applicability);

        // Validate entities in chunks
        for (let i = 0; i < applicableEntities.length; i += CHUNK_SIZE) {
            const chunk = applicableEntities.slice(i, i + CHUNK_SIZE);

            for (const entity of chunk) {
                const entityResult = validateEntityAgainstRequirements(entity, spec.requirements, spec.name);
                specResult.entityResults.push(entityResult);

                if (entityResult.status === 'pass') {
                    specResult.passCount++;
                } else {
                    specResult.failCount++;
                    specResult.status = 'fail';
                }
            }

            // Yield to browser after each chunk
            if (i + CHUNK_SIZE < applicableEntities.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Only add specification if it has entities
        if (specResult.entityResults.length > 0) {
            results.push(specResult);
        }
    }

    return results;
}

function filterEntitiesByApplicability(entities, applicability) {
    if (!applicability || applicability.length === 0) {
        return entities;
    }

    return entities.filter(entity => {
        for (const facet of applicability) {
            if (!checkFacetMatch(entity, facet)) {
                return false;
            }
        }
        return true;
    });
}

function validateEntityAgainstRequirements(entity, requirements, specName) {
    const result = {
        entity: entity.entity,
        name: entity.name,
        guid: entity.guid,
        fileName: entity.fileName,
        specification: specName,
        status: 'pass',
        validations: []
    };

    for (const facet of requirements) {
        const validation = checkRequirementFacet(entity, facet);
        result.validations.push(validation);

        if (validation.status === 'fail') {
            result.status = 'fail';
        }
    }

    return result;
}

function checkFacetMatch(entity, facet) {
    if (facet.type === 'entity') {
        return checkEntityFacet(entity, facet);
    } else if (facet.type === 'property') {
        return checkPropertyFacet(entity, facet, true);
    } else if (facet.type === 'attribute') {
        return checkAttributeFacet(entity, facet, true);
    }
    return true;
}

function checkRequirementFacet(entity, facet) {
    const validation = {
        type: facet.type,
        status: 'fail',
        message: '',
        details: ''
    };

    if (facet.type === 'property') {
        return checkPropertyFacet(entity, facet, false);
    } else if (facet.type === 'attribute') {
        return checkAttributeFacet(entity, facet, false);
    } else if (facet.type === 'material') {
        validation.message = 'Material facet';
        validation.details = 'Material validation not fully implemented';
        validation.status = 'pass'; // Simplified
    } else if (facet.type === 'classification') {
        validation.message = 'Classification facet';
        validation.details = 'Classification validation not fully implemented';
        validation.status = 'pass'; // Simplified
    }

    return validation;
}

function checkEntityFacet(entity, facet) {
    if (!facet.name) {
        return true;
    }

    if (facet.name.type === 'simple') {
        return entity.entity === facet.name.value;
    } else if (facet.name.type === 'restriction' && facet.name.isRegex) {
        const regex = new RegExp(facet.name.pattern);
        return regex.test(entity.entity);
    }

    return true;
}

function checkPropertyFacet(entity, facet, isApplicability) {
    const validation = {
        type: 'property',
        status: 'fail',
        message: '',
        details: ''
    };

    const psetName = facet.propertySet?.value || facet.propertySet?.type === 'simple' && facet.propertySet.value;
    const propName = facet.name?.value || facet.name?.type === 'simple' && facet.name.value;

    if (!psetName || !propName) {
        validation.message = i18n.t('validator.specIncomplete');
        return isApplicability ? false : validation;
    }

    validation.message = `${psetName}.${propName}`;

    const pset = entity.propertySets[psetName];
    if (!pset) {
        validation.details = i18n.t('validator.psetNotFound', { psetName });
        return isApplicability ? false : validation;
    }

    const propValue = pset[propName];
    if (propValue === undefined) {
        validation.details = i18n.t('validator.propNotFound', { propName, psetName });
        return isApplicability ? false : validation;
    }

    // Check value if specified
    if (facet.value) {
        if (facet.value.type === 'simple') {
            if (String(propValue) !== String(facet.value.value)) {
                validation.details = i18n.t('validator.expectedValue', { expected: facet.value.value, actual: propValue });
                return isApplicability ? false : validation;
            }
        } else if (facet.value.type === 'restriction') {
            if (facet.value.options) {
                if (!facet.value.options.includes(String(propValue))) {
                    validation.details = i18n.t('validator.valueNotInOptions', { value: propValue, options: facet.value.options.join(', ') });
                    return isApplicability ? false : validation;
                }
            } else if (facet.value.isRegex) {
                const regex = new RegExp(facet.value.pattern);
                if (!regex.test(String(propValue))) {
                    validation.details = i18n.t('validator.valueNoMatch', { value: propValue, pattern: facet.value.pattern });
                    return isApplicability ? false : validation;
                }
            }
        }
    }

    validation.status = 'pass';
    validation.details = `${i18n.t('parser.facet.value')} "${propValue}"`;
    return isApplicability ? true : validation;
}

function checkAttributeFacet(entity, facet, isApplicability) {
    const validation = {
        type: 'attribute',
        status: 'fail',
        message: '',
        details: ''
    };

    const attrName = facet.name?.value || facet.name?.type === 'simple' && facet.name.value;
    if (!attrName) {
        validation.message = i18n.t('validator.specIncomplete');
        return isApplicability ? false : validation;
    }

    validation.message = `${i18n.t('parser.facetType.attribute')}: ${attrName}`;

    const attrValue = entity.attributes[attrName];
    if (attrValue === undefined) {
        validation.details = i18n.t('validator.attrNotFound', { attrName });
        return isApplicability ? false : validation;
    }

    // Check value if specified
    if (facet.value) {
        if (facet.value.type === 'simple') {
            if (String(attrValue) !== String(facet.value.value)) {
                validation.details = i18n.t('validator.expectedValue', { expected: facet.value.value, actual: attrValue });
                return isApplicability ? false : validation;
            }
        } else if (facet.value.type === 'restriction' && facet.value.isRegex) {
            const regex = new RegExp(facet.value.pattern);
            if (!regex.test(String(attrValue))) {
                validation.details = i18n.t('validator.valueNoMatch', { value: attrValue, pattern: facet.value.pattern });
                return isApplicability ? false : validation;
            }
        }
    }

    validation.status = 'pass';
    validation.details = `${i18n.t('parser.facet.value')} "${attrValue}"`;
    return isApplicability ? true : validation;
}

// Display Results
function displayResults() {
    displayStats();
    populateSpecFilter();
    displaySpecificationResults();
}

function displayStats() {
    const statsContainer = document.getElementById('resultsStats');

    let totalPass = 0;
    let totalFail = 0;
    let totalValidations = 0;

    // Count across all IDS and IFC combinations
    for (const idsResult of validationResults) {
        for (const ifcResult of idsResult.ifcResults) {
            for (const specResult of ifcResult.specificationResults) {
                totalPass += specResult.passCount;
                totalFail += specResult.failCount;
            }
        }
        totalValidations++;
    }

    const totalEntities = totalPass + totalFail;

    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${escapeHtml(totalValidations)}</div>
            <div class="stat-label">${escapeHtml(t('validator.stats.idsFiles'))}</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${escapeHtml(totalEntities)}</div>
            <div class="stat-label">${escapeHtml(t('validator.stats.totalValidations'))}</div>
        </div>
        <div class="stat-card pass">
            <div class="stat-number">${escapeHtml(totalPass)}</div>
            <div class="stat-label">✅ ${escapeHtml(t('validator.stats.passed'))}</div>
        </div>
        <div class="stat-card fail">
            <div class="stat-number">${escapeHtml(totalFail)}</div>
            <div class="stat-label">❌ ${escapeHtml(t('validator.stats.failed'))}</div>
        </div>
    `;
}

function populateSpecFilter() {
    const select = document.getElementById('specFilter');
    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('validator.stats.allIds');
    select.appendChild(defaultOption);

    for (const idsResult of validationResults) {
        const option = document.createElement('option');
        option.value = idsResult.idsFileName;
        option.textContent = idsResult.idsTitle;
        select.appendChild(option);
    }
}

function displaySpecificationResults() {
    const container = document.getElementById('resultsList');
    container.innerHTML = '';

    for (const idsResult of validationResults) {
        const idsDiv = createIDSResultElement(idsResult);
        if (idsDiv) {
            container.appendChild(idsDiv);
        }
    }

    // Add event listeners for filtering
    document.getElementById('searchFilter').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('specFilter').addEventListener('change', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
}

function createIDSResultElement(idsResult) {
    // Calculate stats for this IDS and collect non-empty IFC results
    let totalPass = 0;
    let totalFail = 0;
    const nonEmptyIfcResults = [];

    for (const ifcResult of idsResult.ifcResults) {
        // Check if this IFC has any specifications with results
        if (ifcResult.specificationResults && ifcResult.specificationResults.length > 0) {
            nonEmptyIfcResults.push(ifcResult);
            for (const specResult of ifcResult.specificationResults) {
                totalPass += specResult.passCount;
                totalFail += specResult.failCount;
            }
        }
    }

    // Skip this IDS if no IFC files have results
    if (nonEmptyIfcResults.length === 0) {
        return null;
    }

    const status = totalFail === 0 ? 'pass' : 'fail';

    const div = document.createElement('div');
    div.className = `specification-result ${status} collapsed`;
    div.dataset.idsfile = idsResult.idsFileName;
    div.dataset.status = status;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'spec-header';
    headerDiv.addEventListener('click', () => toggleSpecification(div));

    headerDiv.innerHTML = `
        <div class="spec-title">
            <span class="expand-icon">▼</span>
            <span class="spec-name">📋 ${escapeHtml(idsResult.idsTitle)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 20px;">
            <div class="spec-stats">
                <span>✅ ${escapeHtml(totalPass)}</span>
                <span>❌ ${escapeHtml(totalFail)}</span>
            </div>
            <span class="spec-status-badge ${escapeHtml(status)}">
                ${status === 'pass' ? '✅ ' + escapeHtml(t('validator.status.passed')) : '❌ ' + escapeHtml(t('validator.status.failed'))}
            </span>
        </div>
    `;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'spec-details';

    // For each non-empty IFC file result
    for (const ifcResult of nonEmptyIfcResults) {
        const ifcDiv = createIFCResultElement(ifcResult);
        if (ifcDiv) {
            detailsDiv.appendChild(ifcDiv);
        }
    }

    div.appendChild(headerDiv);
    div.appendChild(detailsDiv);

    return div;
}

function createIFCResultElement(ifcResult) {
    // Skip if no specifications with results
    if (!ifcResult.specificationResults || ifcResult.specificationResults.length === 0) {
        return null;
    }

    // Calculate stats for this IFC
    let totalPass = 0;
    let totalFail = 0;
    for (const specResult of ifcResult.specificationResults) {
        totalPass += specResult.passCount;
        totalFail += specResult.failCount;
    }
    const status = totalFail === 0 ? 'pass' : 'fail';

    const div = document.createElement('div');
    div.style.marginBottom = '15px';

    const header = document.createElement('div');
    header.style.cssText = 'background: #e9ecef; padding: 12px 15px; border-radius: 6px; font-weight: 600; color: #495057; margin-bottom: 10px; cursor: pointer;';
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.toggle-icon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    });
    header.innerHTML = `
        <span class="toggle-icon">▼</span>
        📦 ${escapeHtml(ifcResult.ifcFileName)}
        <span style="margin-left: 15px; font-size: 0.9em; color: #6c757d;">
            ✅ ${escapeHtml(totalPass)} | ❌ ${escapeHtml(totalFail)}
        </span>
    `;

    const content = document.createElement('div');
    content.style.paddingLeft = '20px';

    // For each specification in this IFC
    for (const specResult of ifcResult.specificationResults) {
        const specDiv = createSpecificationResultElement(specResult);
        content.appendChild(specDiv);
    }

    div.appendChild(header);
    div.appendChild(content);

    return div;
}

function createSpecificationResultElement(specResult) {
    const div = document.createElement('div');
    div.className = `specification-result ${specResult.status} collapsed`;
    div.dataset.specification = specResult.specification;
    div.dataset.status = specResult.status;
    div.style.marginBottom = '10px';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'spec-header';
    headerDiv.addEventListener('click', () => toggleSpecification(div));

    headerDiv.innerHTML = `
        <div class="spec-title">
            <span class="expand-icon">▼</span>
            <span class="spec-name">${escapeHtml(specResult.specification)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 20px;">
            <div class="spec-stats">
                <span>✅ ${escapeHtml(specResult.passCount)}</span>
                <span>❌ ${escapeHtml(specResult.failCount)}</span>
            </div>
            <span class="spec-status-badge ${escapeHtml(specResult.status)}">
                ${specResult.status === 'pass' ? '✅ ' + escapeHtml(t('validator.status.ok')) : '❌ ' + escapeHtml(t('validator.status.fail'))}
            </span>
        </div>
    `;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'spec-details';

    for (const entityResult of specResult.entityResults) {
        const entityDiv = createEntityResultElement(entityResult);
        detailsDiv.appendChild(entityDiv);
    }

    div.appendChild(headerDiv);
    div.appendChild(detailsDiv);

    return div;
}

function createEntityResultElement(entityResult) {
    const div = document.createElement('div');
    div.className = `entity-result ${escapeHtml(entityResult.status)}`;
    div.dataset.entity = entityResult.entity;
    div.dataset.name = entityResult.name;
    div.dataset.guid = entityResult.guid;
    div.dataset.status = entityResult.status;

    let validationsHTML = '';
    if (entityResult.validations && entityResult.validations.length > 0) {
        validationsHTML = '<div class="validation-details">';
        for (const validation of entityResult.validations) {
            const icon = validation.status === 'pass' ? '✅' : '❌';
            validationsHTML += `
                <div class="validation-item ${escapeHtml(validation.status)}">
                    <span class="validation-icon">${icon}</span>
                    <div class="validation-message">
                        <div class="validation-label">${escapeHtml(validation.message)}</div>
                        <div class="validation-value">${escapeHtml(validation.details)}</div>
                    </div>
                </div>
            `;
        }
        validationsHTML += '</div>';
    }

    div.innerHTML = `
        <div class="entity-header">
            <div class="entity-info">
                <div class="entity-type">${escapeHtml(entityResult.entity)}</div>
                <div class="entity-name">Name: ${escapeHtml(entityResult.name)}</div>
                <div class="entity-guid">GUID: ${escapeHtml(entityResult.guid)}</div>
                <div class="entity-name" style="font-size: 0.85em; color: #6c757d;">File: ${escapeHtml(entityResult.fileName)}</div>
            </div>
            <span class="entity-status ${escapeHtml(entityResult.status)}">
                ${entityResult.status === 'pass' ? '✅ ' + escapeHtml(t('validator.status.ok')) : '❌ ' + escapeHtml(t('validator.status.fail'))}
            </span>
        </div>
        ${validationsHTML}
    `;

    return div;
}

function toggleSpecification(div) {
    div.classList.toggle('collapsed');
}

// Expand/Collapse All
function expandAll() {
    // Expand all IDS sections
    document.querySelectorAll('.specification-result').forEach(div => {
        div.classList.remove('collapsed');
    });

    // Expand all IFC sections (inline toggle divs)
    document.querySelectorAll('.toggle-icon').forEach(icon => {
        const content = icon.parentElement.nextElementSibling;
        if (content && content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        }
    });
}

function collapseAll() {
    // Collapse all IDS sections
    document.querySelectorAll('.specification-result').forEach(div => {
        div.classList.add('collapsed');
    });

    // Collapse all IFC sections (inline toggle divs)
    document.querySelectorAll('.toggle-icon').forEach(icon => {
        const content = icon.parentElement.nextElementSibling;
        if (content && content.style.display !== 'none') {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    });
}

// Filtering
function applyFilters() {
    const searchText = document.getElementById('searchFilter').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const idsFileFilter = document.getElementById('specFilter').value;

    // Get all IDS result divs (top level)
    const idsResults = document.querySelectorAll('.specification-result[data-idsfile]');

    for (const idsDiv of idsResults) {
        const idsFileName = idsDiv.dataset.idsfile;

        // IDS file filter
        if (idsFileFilter && idsFileName !== idsFileFilter) {
            idsDiv.style.display = 'none';
            continue;
        }

        // Check all entities within this IDS
        const entityResults = idsDiv.querySelectorAll('.entity-result');
        let visibleCount = 0;

        for (const entityDiv of entityResults) {
            let visible = true;

            // Status filter
            if (statusFilter && entityDiv.dataset.status !== statusFilter) {
                visible = false;
            }

            // Search filter
            if (searchText && visible) {
                const entity = entityDiv.dataset.entity.toLowerCase();
                const name = entityDiv.dataset.name.toLowerCase();
                const guid = entityDiv.dataset.guid.toLowerCase();

                if (!entity.includes(searchText) &&
                    !name.includes(searchText) &&
                    !guid.includes(searchText)) {
                    visible = false;
                }
            }

            entityDiv.style.display = visible ? 'block' : 'none';
            if (visible) {
                visibleCount++;
            }
        }

        // Hide IDS if no entities visible
        idsDiv.style.display = visibleCount > 0 ? 'block' : 'none';
    }
}

function clearFilters() {
    document.getElementById('searchFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('specFilter').value = '';
    applyFilters();
}

// Export to XLSX
function exportToXLSX() {
    const wb = XLSX.utils.book_new();

    // Create a sheet for each IFC+IDS combination
    for (const idsResult of validationResults) {
        for (const ifcResult of idsResult.ifcResults) {
            // Skip if no specifications with results
            if (!ifcResult.specificationResults || ifcResult.specificationResults.length === 0) {
                continue;
            }

            const sheetData = [];

            // Header row
            sheetData.push([
                'Specification',
                'Entity Type',
                'Entity Name',
                'GUID',
                'Status',
                'Validation Type',
                'Validation Message',
                'Details'
            ]);

            // Data rows
            for (const specResult of ifcResult.specificationResults) {
                for (const entityResult of specResult.entityResults) {
                    for (const validation of entityResult.validations) {
                        sheetData.push([
                            specResult.specification,
                            entityResult.entity,
                            entityResult.name,
                            entityResult.guid,
                            entityResult.status,
                            validation.type,
                            validation.message,
                            validation.details
                        ]);
                    }
                }
            }

            // Skip if no data rows (only header)
            if (sheetData.length <= 1) {
                continue;
            }

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(sheetData);

            // Set column widths
            ws['!cols'] = [
                { wch: 30 }, // Specification
                { wch: 20 }, // Entity Type
                { wch: 30 }, // Entity Name
                { wch: 25 }, // GUID
                { wch: 10 }, // Status
                { wch: 15 }, // Validation Type
                { wch: 35 }, // Validation Message
                { wch: 50 }  // Details
            ];

            // Create sheet name: ifcname_idsname
            // Remove file extensions
            let ifcName = ifcResult.ifcFileName.replace(/\.ifc$/i, '');
            let idsName = idsResult.idsFileName.replace(/\.(ids|xml)$/i, '');

            // Sanitize (Excel doesn't allow: \ / : * ? " < > |)
            ifcName = ifcName.replace(/[:\\\/\?\*\"\<\>\|]/g, '_');
            idsName = idsName.replace(/[:\\\/\?\*\"\<\>\|]/g, '_');

            // Create combined name and limit to 31 chars
            let sheetName = `${ifcName}_${idsName}`;
            if (sheetName.length > 31) {
                // Try to shorten intelligently
                const maxLen = 31 - 1; // -1 for underscore
                const halfLen = Math.floor(maxLen / 2);
                ifcName = ifcName.substring(0, halfLen);
                idsName = idsName.substring(0, maxLen - halfLen);
                sheetName = `${ifcName}_${idsName}`;
            }

            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
    }

    // Create summary sheet
    const summaryData = [];
    summaryData.push(['IDS Validation Summary']);
    summaryData.push([]);
    summaryData.push(['IFC File', 'IDS File', 'Total Validations', 'Passed', 'Failed', 'Pass Rate']);

    for (const idsResult of validationResults) {
        for (const ifcResult of idsResult.ifcResults) {
            // Only process IFC files that have specifications with results
            if (!ifcResult.specificationResults || ifcResult.specificationResults.length === 0) {
                continue;
            }

            let totalPass = 0;
            let totalFail = 0;

            for (const specResult of ifcResult.specificationResults) {
                totalPass += specResult.passCount;
                totalFail += specResult.failCount;
            }

            const totalValidations = totalPass + totalFail;
            const passRate = totalValidations > 0 ? ((totalPass / totalValidations) * 100).toFixed(1) + '%' : '0%';

            summaryData.push([
                ifcResult.ifcFileName,
                idsResult.idsFileName,
                totalValidations,
                totalPass,
                totalFail,
                passRate
            ]);
        }
    }

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [
        { wch: 30 }, // IFC File
        { wch: 30 }, // IDS File
        { wch: 18 }, // Total Validations
        { wch: 12 }, // Passed
        { wch: 12 }, // Failed
        { wch: 12 }  // Pass Rate
    ];

    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary', true);

    // Generate and download
    XLSX.writeFile(wb, 'ids-validation-results.xlsx');
}

// New validation button
function newValidation() {
    document.getElementById('resultsSection').style.display = 'none';

    const uploadSection = document.querySelector('.upload-section');
    if (uploadSection) {
        uploadSection.style.display = 'block';
    }

    // Reset validation results
    validationResults = null;

    // Reset old variables (for compatibility, but these aren't used anymore)
    ifcFiles = [];
    idsFiles = [];

    // Note: We keep validation groups - user can modify them for new validation
    // If you want to clear groups too, uncomment:
    // validationGroups = [];
    // renderValidationGroups();

    updateValidateButton();
}

// Add event listeners
const expandAllBtn = document.getElementById('expandAllBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const exportBtn = document.getElementById('exportBtn');
const newValidationBtn = document.getElementById('newValidationBtn');

if (expandAllBtn) {
    expandAllBtn.addEventListener('click', expandAll);
}

if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', collapseAll);
}

if (exportBtn) {
    exportBtn.addEventListener('click', exportToXLSX);
}

if (newValidationBtn) {
    newValidationBtn.addEventListener('click', newValidation);
}
// Validační skupiny
const validationGroups = [];
let currentGroupIndex = null;

// Storage variables
let storageDB = null;
let ifcStorageData = null;
let idsStorageData = null;
let ifcMetadata = null; // Lightweight cache without file contents
let idsMetadata = null; // Lightweight cache without file contents
const selectedIfcFiles = new Set();
let selectedIdsFile = null;
const expandedIfcFolders = new Set(['root']);
const expandedIdsFolders = new Set(['root']);

// Initialize IndexedDB
async function initStorageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_storage', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('storage')) {
                db.createObjectStore('storage', { keyPath: 'key' });
            }
        };
    });
}

// Add validation group
function addValidationGroup() {
    validationGroups.push({
        id: Date.now(),
        ifcFiles: [],
        idsFile: null
    });
    renderValidationGroups();
    updateValidateButton();
}

// Delete validation group
function deleteValidationGroup(index) {
    if (confirm(t('validator.group.deleteConfirm'))) {
        validationGroups.splice(index, 1);
        renderValidationGroups();
        updateValidateButton();
    }
}

// Render validation groups
function renderValidationGroups() {
    const container = document.getElementById('validationGroups');

    if (validationGroups.length === 0) {
        container.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'text-align: center; padding: 60px; color: #a0aec0;';

        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = 'font-size: 4em; margin-bottom: 20px;';
        iconDiv.textContent = '📋';

        const h3 = document.createElement('h3');
        h3.style.color = '#6c757d';
        h3.textContent = t('validator.group.noGroups');

        const p = document.createElement('p');
        p.textContent = t('validator.group.clickToAdd');

        emptyDiv.appendChild(iconDiv);
        emptyDiv.appendChild(h3);
        emptyDiv.appendChild(p);
        container.appendChild(emptyDiv);
        return;
    }

    container.innerHTML = '';
    validationGroups.forEach((group, index) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'validation-group';
        groupDiv.id = `group-${index}`;

        // Group header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'group-header';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'group-title';
        titleDiv.textContent = `📊 ${t('validator.group.title')} ${index + 1}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'group-delete-btn';
        deleteBtn.textContent = `🗑️ ${t('validator.group.delete')}`;
        deleteBtn.addEventListener('click', () => deleteValidationGroup(index));

        headerDiv.appendChild(titleDiv);
        headerDiv.appendChild(deleteBtn);

        // Group content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'group-content';

        // IFC Section
        const ifcSection = document.createElement('div');
        ifcSection.className = 'group-section';

        const ifcH4 = document.createElement('h4');
        ifcH4.textContent = `📦 ${t('validator.group.ifcFiles')} (${group.ifcFiles.length})`;

        const ifcStorageBtn = document.createElement('button');
        ifcStorageBtn.className = 'storage-btn';
        ifcStorageBtn.textContent = `📂 ${t('validator.group.selectStorage')}`;
        ifcStorageBtn.addEventListener('click', () => openIfcStoragePicker(index));

        const ifcDropZone = document.createElement('div');
        ifcDropZone.className = 'drop-zone';
        ifcDropZone.dataset.groupIndex = index;
        ifcDropZone.dataset.type = 'ifc';

        const ifcDropContent = document.createElement('div');
        ifcDropContent.className = 'drop-zone-content';
        ifcDropContent.innerHTML = `
            <span class="drop-zone-icon">📁</span>
            <span class="drop-zone-text">${escapeHtml(t('validator.group.dropIfc'))}</span>
            <span class="drop-zone-hint">${escapeHtml(t('validator.group.orSelect'))}</span>
        `;
        ifcDropZone.appendChild(ifcDropContent);

        const ifcFilesList = document.createElement('div');
        ifcFilesList.className = 'selected-files-list';
        ifcFilesList.id = `ifc-files-${index}`;

        if (group.ifcFiles.length === 0) {
            const noFilesP = document.createElement('p');
            noFilesP.style.cssText = 'color: #a0aec0; text-align: center; padding: 20px;';
            noFilesP.textContent = t('validator.group.noFiles');
            ifcFilesList.appendChild(noFilesP);
        } else {
            group.ifcFiles.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'selected-file-item';

                const fileIcon = document.createElement('span');
                fileIcon.className = 'file-icon';
                fileIcon.textContent = '📄';

                const fileName = document.createElement('span');
                fileName.className = 'file-name';
                fileName.textContent = file.name;

                fileItem.appendChild(fileIcon);
                fileItem.appendChild(fileName);
                ifcFilesList.appendChild(fileItem);
            });
        }

        ifcSection.appendChild(ifcH4);
        ifcSection.appendChild(ifcStorageBtn);
        ifcSection.appendChild(ifcDropZone);
        ifcSection.appendChild(ifcFilesList);

        // IDS Section
        const idsSection = document.createElement('div');
        idsSection.className = 'group-section';

        const idsH4 = document.createElement('h4');
        idsH4.textContent = `📋 ${t('validator.group.idsSpec')}`;

        const idsStorageBtn = document.createElement('button');
        idsStorageBtn.className = 'storage-btn';
        idsStorageBtn.textContent = `📂 ${t('validator.group.selectStorage')}`;
        idsStorageBtn.addEventListener('click', () => openIdsStoragePicker(index));

        const idsDropZone = document.createElement('div');
        idsDropZone.className = 'drop-zone';
        idsDropZone.dataset.groupIndex = index;
        idsDropZone.dataset.type = 'ids';

        const idsDropContent = document.createElement('div');
        idsDropContent.className = 'drop-zone-content';
        idsDropContent.innerHTML = `
            <span class="drop-zone-icon">📋</span>
            <span class="drop-zone-text">${escapeHtml(t('validator.group.dropIds'))}</span>
            <span class="drop-zone-hint">${escapeHtml(t('validator.group.orSelect'))}</span>
        `;
        idsDropZone.appendChild(idsDropContent);

        const idsFilesList = document.createElement('div');
        idsFilesList.className = 'selected-files-list';

        if (group.idsFile) {
            const fileItem = document.createElement('div');
            fileItem.className = 'selected-file-item';

            const fileIcon = document.createElement('span');
            fileIcon.className = 'file-icon';
            fileIcon.textContent = '📋';

            const fileName = document.createElement('span');
            fileName.className = 'file-name';
            fileName.textContent = group.idsFile.name;

            fileItem.appendChild(fileIcon);
            fileItem.appendChild(fileName);
            idsFilesList.appendChild(fileItem);
        } else {
            const noFileP = document.createElement('p');
            noFileP.style.cssText = 'color: #a0aec0; text-align: center; padding: 20px;';
            noFileP.textContent = t('validator.group.noFile');
            idsFilesList.appendChild(noFileP);
        }

        idsSection.appendChild(idsH4);
        idsSection.appendChild(idsStorageBtn);
        idsSection.appendChild(idsDropZone);
        idsSection.appendChild(idsFilesList);

        contentDiv.appendChild(ifcSection);
        contentDiv.appendChild(idsSection);

        groupDiv.appendChild(headerDiv);
        groupDiv.appendChild(contentDiv);
        container.appendChild(groupDiv);
    });

    // Add drop zone event listeners
    setupDropZones();
}

// Setup drop zone event listeners
function setupDropZones() {
    const dropZones = document.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        const groupIndex = parseInt(zone.getAttribute('data-group-index'));
        const type = zone.getAttribute('data-type');

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            if (type === 'ifc') {
                handleIfcDrop(files, groupIndex);
            } else if (type === 'ids') {
                handleIdsDrop(files, groupIndex);
            }
        });

        // Make drop zone clickable to open file picker
        zone.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = (type === 'ifc');
            input.accept = (type === 'ifc') ? '.ifc' : '.ids,.xml';
            input.onchange = (e) => {
                const files = Array.from(e.target.files);
                if (type === 'ifc') {
                    handleIfcDrop(files, groupIndex);
                } else {
                    handleIdsDrop(files, groupIndex);
                }
            };
            input.click();
        });
    });
}

// Handle IFC file drop
async function handleIfcDrop(files, groupIndex) {
    const ifcFiles = files.filter(f => f.name.toLowerCase().endsWith('.ifc'));

    if (ifcFiles.length === 0) {
        ErrorHandler.error(t('validator.error.onlyIfcAllowed'));
        return;
    }

    const group = validationGroups[groupIndex];

    for (const file of ifcFiles) {
        const content = await readFileAsText(file);
        group.ifcFiles.push({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            content: content
        });
    }

    renderValidationGroups();
    updateValidateButton();
}

// Handle IDS file drop
async function handleIdsDrop(files, groupIndex) {
    const idsFiles = files.filter(f => {
        const name = f.name.toLowerCase();
        return name.endsWith('.ids') || name.endsWith('.xml');
    });

    if (idsFiles.length === 0) {
        ErrorHandler.error(t('validator.error.onlyIdsAllowed'));
        return;
    }

    if (idsFiles.length > 1) {
        ErrorHandler.error(t('validator.error.onlyOneIds'));
        return;
    }

    const file = idsFiles[0];
    const content = await readFileAsText(file);

    const group = validationGroups[groupIndex];
    group.idsFile = {
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        content: content
    };

    renderValidationGroups();
    updateValidateButton();
}

// Update validate button
function updateValidateButton() {
    const btn = document.getElementById('validateBtn');
    const hasValidGroups = validationGroups.some(g => g.ifcFiles.length > 0 && g.idsFile);
    btn.disabled = !hasValidGroups;
}

// Open IFC storage picker
async function openIfcStoragePicker(groupIndex) {
    currentGroupIndex = groupIndex;

    // Pre-fill selection with existing files in this group
    selectedIfcFiles.clear();
    const group = validationGroups[groupIndex];
    if (group && group.ifcFiles && group.ifcFiles.length > 0) {
        group.ifcFiles.forEach(file => {
            selectedIfcFiles.add(file.id);
        });
    }

    if (!storageDB) {
        storageDB = await initStorageDB();
    }

    await renderIfcStorageTree();
    const modal = document.getElementById('ifcStorageModal');
    modal.classList.add('active');
}

// Close IFC storage modal
function closeIfcStorageModal() {
    document.getElementById('ifcStorageModal').classList.remove('active');
}

// Setup IFC tree event listeners (delegated)
let ifcTreeListenerAttached = false;
function setupIfcTreeEventListeners() {
    const tree = document.getElementById('ifcStorageTree');
    if (!tree || ifcTreeListenerAttached) {
        return;
    }
    ifcTreeListenerAttached = true;

    // Use event delegation - single listener on parent
    tree.addEventListener('click', (e) => {
        const target = e.target;

        // Folder toggle (arrow or name)
        if (target.classList.contains('ifc-folder-toggle')) {
            e.stopPropagation();
            const folderId = target.dataset.folderId;
            if (folderId) {
                toggleIfcFolder(folderId);
            }
            return;
        }

        // Folder checkbox
        if (target.classList.contains('ifc-folder-checkbox')) {
            e.stopPropagation();
            e.preventDefault();
            const folderId = target.dataset.folderId;
            if (folderId) {
                selectAllIfcFilesInFolder(folderId);
            }
            return;
        }

        // File item (div or checkbox)
        if (target.classList.contains('ifc-file-item') || target.closest('.ifc-file-item')) {
            const fileItem = target.classList.contains('ifc-file-item') ? target : target.closest('.ifc-file-item');
            const fileId = fileItem.dataset.fileId;
            if (fileId) {
                e.stopPropagation();
                toggleIfcFileSelection(fileId);
            }
            return;
        }

        // File checkbox
        if (target.classList.contains('ifc-file-checkbox')) {
            e.stopPropagation();
            const fileId = target.dataset.fileId;
            if (fileId) {
                toggleIfcFileSelection(fileId);
            }
            return;
        }
    });
}

// Render IFC storage tree
async function renderIfcStorageTree() {
    // Use pre-loaded metadata if available (instant!)
    if (ifcMetadata) {
        ifcStorageData = ifcMetadata;
        const html = renderIfcFolderRecursive('root', 0);
        document.getElementById('ifcStorageTree').innerHTML = html;
        document.getElementById('ifcSelectedCount').textContent = selectedIfcFiles.size;
        setupIfcTreeEventListeners();
        return;
    }

    // Fallback: load from IndexedDB if metadata not pre-loaded
    return new Promise((resolve, reject) => {
        const transaction = storageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('ifc_files');

        request.onsuccess = () => {
            const fullData = request.result?.value;

            if (!fullData || !fullData.files || Object.keys(fullData.files).length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'storage-empty-message';
                emptyMsg.textContent = t('validator.storage.noIfcFiles');
                document.getElementById('ifcStorageTree').innerHTML = '';
                document.getElementById('ifcStorageTree').appendChild(emptyMsg);
                resolve();
                return;
            }

            // OPTIMIZATION: Remove file contents to prevent UI lag
            ifcStorageData = {
                folders: fullData.folders,
                files: {}
            };

            // Copy only metadata (no content!)
            for (const fileId in fullData.files) {
                const file = fullData.files[fileId];
                ifcStorageData.files[fileId] = {
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    folder: file.folder,
                    uploadDate: file.uploadDate
                    // content NOT copied - saves memory and speeds up rendering!
                };
            }

            const html = renderIfcFolderRecursive('root', 0);
            document.getElementById('ifcStorageTree').innerHTML = html;
            document.getElementById('ifcSelectedCount').textContent = selectedIfcFiles.size;
            setupIfcTreeEventListeners();
            resolve();
        };

        request.onerror = () => {
            console.error('Error loading IFC storage:', request.error);
            reject(request.error);
        };
    });
}

// Get all files in folder recursively
function getAllIfcFilesInFolder(folderId) {
    if (!ifcStorageData) {
        return [];
    }

    const folder = ifcStorageData.folders[folderId];
    if (!folder) {
        return [];
    }

    let files = [...folder.files];

    // Recursively get files from child folders
    if (folder.children) {
        folder.children.forEach(childId => {
            files = files.concat(getAllIfcFilesInFolder(childId));
        });
    }

    return files;
}

// Select all files in folder (toggle)
function selectAllIfcFilesInFolder(folderId) {
    if (!ifcStorageData) {
        return;
    }

    const folder = ifcStorageData.folders[folderId];
    if (!folder) {
        return;
    }

    // Get all files in this folder and subfolders
    const allFiles = getAllIfcFilesInFolder(folderId);

    // Check if all are already selected
    const allSelected = allFiles.every(fileId => selectedIfcFiles.has(fileId));

    if (allSelected) {
        // Deselect all
        allFiles.forEach(fileId => selectedIfcFiles.delete(fileId));
    } else {
        // Select all
        allFiles.forEach(fileId => selectedIfcFiles.add(fileId));
    }

    renderIfcStorageTree();
}

// Render IFC folder recursively
function renderIfcFolderRecursive(folderId, level) {
    const folder = ifcStorageData.folders[folderId];
    if (!folder) {
        return '';
    }

    const isExpanded = expandedIfcFolders.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

    // Sanitize folderId to prevent XSS (only allow alphanumeric, underscore, hyphen)
    const safeFolderId = String(folderId).replace(/[^a-zA-Z0-9_-]/g, '');

    let html = '';

    if (folderId !== 'root') {
        // Check if all files in this folder are selected
        const allFolderFiles = getAllIfcFilesInFolder(folderId);
        const allFolderSelected = allFolderFiles.length > 0 && allFolderFiles.every(fileId => selectedIfcFiles.has(fileId));

        html += `
            <div style="margin-bottom: 8px;">
                <div class="tree-folder-header" style="margin-left: ${level * 20}px;">
                    <span data-folder-id="${safeFolderId}" class="tree-folder-arrow ifc-folder-toggle">${arrow}</span>
                    <input type="checkbox" ${allFolderSelected ? 'checked' : ''} data-folder-id="${safeFolderId}" class="ifc-folder-checkbox" style="margin-right: 10px;" title="${escapeHtml(t('viewer.selectAllInFolder'))}">
                    <span data-folder-id="${safeFolderId}" class="tree-folder-name ifc-folder-toggle">
                        📁 ${escapeHtml(folder.name)}
                        ${allFolderFiles.length > 0 ? `<span class="tree-folder-count">(${allFolderFiles.length} ${escapeHtml(t('viewer.files'))})</span>` : ''}
                    </span>
                </div>
        `;
    }

    if (isExpanded) {
        if (folder.children && folder.children.length > 0) {
            folder.children.forEach(childId => {
                html += renderIfcFolderRecursive(childId, level + 1);
            });
        }

        if (folder.files && folder.files.length > 0) {
            folder.files.forEach(fileId => {
                const file = ifcStorageData.files[fileId];
                if (!file) {
                    return;
                }

                // Sanitize fileId
                const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
                const isSelected = selectedIfcFiles.has(fileId);
                const sizeKB = (file.size / 1024).toFixed(1);
                html += `
                    <div data-file-id="${safeFileId}"
                         class="tree-file-item ifc-file-item ${isSelected ? 'selected' : ''}" style="margin-left: ${(level + 1) * 20}px;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} data-file-id="${safeFileId}" class="ifc-file-checkbox" style="margin-right: 10px;">
                        <span class="tree-file-name">📄 ${escapeHtml(file.name)}</span>
                        <span class="tree-file-size">${escapeHtml(sizeKB)} KB</span>
                    </div>
                `;
            });
        }
    }

    if (folderId !== 'root') {
        html += '</div>';
    }

    return html;
}

// Toggle IFC folder
function toggleIfcFolder(folderId) {
    if (expandedIfcFolders.has(folderId)) {
        expandedIfcFolders.delete(folderId);
    } else {
        expandedIfcFolders.add(folderId);
    }
    renderIfcStorageTree();
}

// Toggle IFC file selection
function toggleIfcFileSelection(fileId) {
    if (selectedIfcFiles.has(fileId)) {
        selectedIfcFiles.delete(fileId);
    } else {
        selectedIfcFiles.add(fileId);
    }
    renderIfcStorageTree();
}

// Confirm IFC selection
async function confirmIfcSelection() {
    try {
        // Load metadata structure
        const metadataTransaction = storageDB.transaction(['storage'], 'readonly');
        const metadataStore = metadataTransaction.objectStore('storage');
        const metadataRequest = metadataStore.get('ifc_files');

        metadataRequest.onsuccess = async () => {
            const storageData = metadataRequest.result?.value;
            if (!storageData) {
                ErrorHandler.error(t('validator.error.storageLoad'));
                return;
            }

            // Load content separately for each selected file
            const files = [];
            for (const fileId of selectedIfcFiles) {
                const fileMetadata = storageData.files[fileId];
                if (fileMetadata) {
                    // Load file content separately
                    const contentTransaction = storageDB.transaction(['storage'], 'readonly');
                    const contentStore = contentTransaction.objectStore('storage');
                    const contentRequest = contentStore.get(`ifc_files_file_${fileId}`);

                    const fileContent = await new Promise((resolve, reject) => {
                        contentRequest.onsuccess = () => resolve(contentRequest.result?.value);
                        contentRequest.onerror = () => reject(contentRequest.error);
                    });

                    if (fileContent) {
                        files.push({
                            ...fileMetadata,
                            content: fileContent
                        });
                    }
                }
            }

            validationGroups[currentGroupIndex].ifcFiles = files;
            closeIfcStorageModal();
            renderValidationGroups();
            updateValidateButton();
        };

        metadataRequest.onerror = () => {
            ErrorHandler.error(t('validator.error.storageLoad'));
        };
    } catch (e) {
        console.error('Error loading IFC files:', e);
        ErrorHandler.error(t('validator.error.storageLoad'));
    }
}

// Open IDS storage picker
async function openIdsStoragePicker(groupIndex) {
    currentGroupIndex = groupIndex;
    selectedIdsFile = null;

    if (!storageDB) {
        storageDB = await initStorageDB();
    }

    await renderIdsStorageTree();
    document.getElementById('idsStorageModal').classList.add('active');
}

// Close IDS storage modal
function closeIdsStorageModal() {
    document.getElementById('idsStorageModal').classList.remove('active');
}

// Setup IDS tree event listeners (delegated)
let idsTreeListenerAttached = false;
function setupIdsTreeEventListeners() {
    const tree = document.getElementById('idsStorageTree');
    if (!tree || idsTreeListenerAttached) {
        return;
    }
    idsTreeListenerAttached = true;

    // Use event delegation - single listener on parent
    tree.addEventListener('click', (e) => {
        const target = e.target;

        // Folder toggle (arrow or name)
        if (target.classList.contains('ids-folder-toggle')) {
            e.stopPropagation();
            const folderId = target.dataset.folderId;
            if (folderId) {
                toggleIdsFolder(folderId);
            }
            return;
        }

        // File item (div or radio)
        if (target.classList.contains('ids-file-item') || target.closest('.ids-file-item')) {
            const fileItem = target.classList.contains('ids-file-item') ? target : target.closest('.ids-file-item');
            const fileId = fileItem.dataset.fileId;
            if (fileId) {
                e.stopPropagation();
                selectIdsFile(fileId);
            }
            return;
        }

        // File radio
        if (target.classList.contains('ids-file-radio')) {
            e.stopPropagation();
            const fileId = target.dataset.fileId;
            if (fileId) {
                selectIdsFile(fileId);
            }
            return;
        }
    });
}

// Render IDS storage tree (similar to IFC, but single-select)
async function renderIdsStorageTree() {
    // Use pre-loaded metadata if available (instant!)
    if (idsMetadata) {
        idsStorageData = idsMetadata;
        const html = renderIdsFolderRecursive('root', 0);
        document.getElementById('idsStorageTree').innerHTML = html;
        updateIdsSelectedName();
        setupIdsTreeEventListeners();
        return;
    }

    // Fallback: load from IndexedDB if metadata not pre-loaded
    return new Promise((resolve, reject) => {
        const transaction = storageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('ids_files');

        request.onsuccess = () => {
            const fullData = request.result?.value;

            if (!fullData || !fullData.files || Object.keys(fullData.files).length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'storage-empty-message';
                emptyMsg.textContent = t('validator.storage.noIdsFiles');
                document.getElementById('idsStorageTree').innerHTML = '';
                document.getElementById('idsStorageTree').appendChild(emptyMsg);
                resolve();
                return;
            }

            // OPTIMIZATION: Remove file contents to prevent UI lag
            idsStorageData = {
                folders: fullData.folders,
                files: {}
            };

            // Copy only metadata (no content!)
            for (const fileId in fullData.files) {
                const file = fullData.files[fileId];
                idsStorageData.files[fileId] = {
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    folder: file.folder,
                    uploadDate: file.uploadDate
                    // content NOT copied - saves memory and speeds up rendering!
                };
            }

            const html = renderIdsFolderRecursive('root', 0);
            document.getElementById('idsStorageTree').innerHTML = html;
            updateIdsSelectedName();
            setupIdsTreeEventListeners();
            resolve();
        };

        request.onerror = () => {
            console.error('Error loading IDS storage:', request.error);
            reject(request.error);
        };
    });
}

// Render IDS folder recursively
function renderIdsFolderRecursive(folderId, level) {
    const folder = idsStorageData.folders[folderId];
    if (!folder) {
        return '';
    }

    const isExpanded = expandedIdsFolders.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

    // Sanitize folderId to prevent XSS (only allow alphanumeric, underscore, hyphen)
    const safeFolderId = String(folderId).replace(/[^a-zA-Z0-9_-]/g, '');

    let html = '';

    if (folderId !== 'root') {
        html += `
            <div style="margin-bottom: 8px;">
                <div class="tree-folder-header" style="margin-left: ${level * 20}px;">
                    <span data-folder-id="${safeFolderId}" class="tree-folder-arrow ids-folder-toggle">${arrow}</span>
                    <span data-folder-id="${safeFolderId}" class="tree-folder-name ids-folder-toggle">
                        📁 ${escapeHtml(folder.name)}
                    </span>
                </div>
        `;
    }

    if (isExpanded) {
        if (folder.children && folder.children.length > 0) {
            folder.children.forEach(childId => {
                html += renderIdsFolderRecursive(childId, level + 1);
            });
        }

        if (folder.files && folder.files.length > 0) {
            folder.files.forEach(fileId => {
                const file = idsStorageData.files[fileId];
                if (!file) {
                    return;
                }

                // Sanitize fileId
                const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
                const isSelected = selectedIdsFile === fileId;
                const sizeKB = (file.size / 1024).toFixed(1);
                html += `
                    <div data-file-id="${safeFileId}"
                         class="tree-file-item ids-file-item ${isSelected ? 'selected' : ''}" style="margin-left: ${(level + 1) * 20}px;">
                        <input type="radio" name="idsFileSelection" ${isSelected ? 'checked' : ''} data-file-id="${safeFileId}" class="ids-file-radio" style="margin-right: 10px;">
                        <span class="tree-file-name">📋 ${escapeHtml(file.name)}</span>
                        <span class="tree-file-size">${escapeHtml(sizeKB)} KB</span>
                    </div>
                `;
            });
        }
    }

    if (folderId !== 'root') {
        html += '</div>';
    }

    return html;
}

// Toggle IDS folder
function toggleIdsFolder(folderId) {
    if (expandedIdsFolders.has(folderId)) {
        expandedIdsFolders.delete(folderId);
    } else {
        expandedIdsFolders.add(folderId);
    }
    renderIdsStorageTree();
}

// Select IDS file
function selectIdsFile(fileId) {
    selectedIdsFile = fileId;
    renderIdsStorageTree();
}

// Update IDS selected name
function updateIdsSelectedName() {
    const display = document.getElementById('idsSelectedName');
    if (selectedIdsFile && idsStorageData.files[selectedIdsFile]) {
        display.textContent = idsStorageData.files[selectedIdsFile].name;
        display.classList.add('file-selected');
    } else {
        display.textContent = t('validator.storage.none');
        display.classList.remove('file-selected');
    }
}

// Confirm IDS selection
async function confirmIdsSelection() {
    if (!selectedIdsFile) {
        ErrorHandler.error(t('validator.error.selectIds'));
        return;
    }

    try {
        // Load metadata structure
        const metadataTransaction = storageDB.transaction(['storage'], 'readonly');
        const metadataStore = metadataTransaction.objectStore('storage');
        const metadataRequest = metadataStore.get('ids_files');

        metadataRequest.onsuccess = async () => {
            const storageData = metadataRequest.result?.value;
            if (!storageData) {
                ErrorHandler.error(t('validator.error.storageLoad'));
                return;
            }

            // Get file metadata
            const fileMetadata = storageData.files[selectedIdsFile];
            if (!fileMetadata) {
                ErrorHandler.error(t('validator.error.fileNotFound'));
                return;
            }

            // Load file content separately
            const contentTransaction = storageDB.transaction(['storage'], 'readonly');
            const contentStore = contentTransaction.objectStore('storage');
            const contentRequest = contentStore.get(`ids_files_file_${selectedIdsFile}`);

            const fileContent = await new Promise((resolve, reject) => {
                contentRequest.onsuccess = () => resolve(contentRequest.result?.value);
                contentRequest.onerror = () => reject(contentRequest.error);
            });

            if (!fileContent) {
                ErrorHandler.error(t('validator.error.fileNotFound'));
                return;
            }

            validationGroups[currentGroupIndex].idsFile = {
                ...fileMetadata,
                content: fileContent
            };
            closeIdsStorageModal();
            renderValidationGroups();
            updateValidateButton();
        };

        metadataRequest.onerror = () => {
            ErrorHandler.error(t('validator.error.storageLoad'));
        };
    } catch (e) {
        console.error('Error loading IDS file:', e);
        ErrorHandler.error(t('validator.error.storageLoad'));
    }
}

// Validate all groups
async function validateAll() {
    // Filter out groups that don't have both IFC and IDS files
    const validGroups = validationGroups.filter(g => g.ifcFiles.length > 0 && g.idsFile);

    if (validGroups.length === 0) {
        ErrorHandler.error(t('validator.error.noGroups'));
        return;
    }

    // Show loading
    document.getElementById('loading').classList.add('show');
    document.getElementById('loadingText').textContent = t('validator.loading.validating');
    document.getElementById('progressText').textContent = '';
    document.getElementById('currentFile').textContent = '';

    // Reset results
    validationResults = [];

    try {
        // Process each group
        for (let groupIndex = 0; groupIndex < validGroups.length; groupIndex++) {
            const group = validGroups[groupIndex];

            document.getElementById('progressText').textContent = `${t('validator.loading.group')} ${groupIndex + 1} ${t('validator.loading.of')} ${validGroups.length}`;

            // Parse IDS file
            document.getElementById('currentFile').textContent = `${t('validator.loading.parsing')} ${group.idsFile.name}`;
            await new Promise(resolve => setTimeout(resolve, 100)); // Yield

            const idsData = parseIDS(group.idsFile.content, group.idsFile.name);
            if (!idsData) {
                console.error('Error parsing IDS:', group.idsFile.name);
                continue;
            }

            const idsResult = {
                idsFileName: group.idsFile.name,
                idsTitle: idsData.title || group.idsFile.name,
                ifcResults: []
            };

            // Process each IFC file in the group
            for (let ifcIndex = 0; ifcIndex < group.ifcFiles.length; ifcIndex++) {
                const ifcFile = group.ifcFiles[ifcIndex];

                document.getElementById('currentFile').textContent = `${t('validator.loading.parsingIfcNum')} ${ifcIndex + 1}/${group.ifcFiles.length}: ${ifcFile.name}`;
                await new Promise(resolve => setTimeout(resolve, 100)); // Yield

                // Parse IFC file with chunking
                document.getElementById('currentFile').textContent = `${t('validator.loading.parsingIfc')} ${ifcFile.name}`;
                const entities = await parseIFCFileAsync(ifcFile.content, ifcFile.name);
                if (!entities || entities.length === 0) {
                    console.warn('No entities in IFC file:', ifcFile.name);
                    continue;
                }

                // Validate with chunking
                document.getElementById('currentFile').textContent = `${t('validator.loading.validationProgress')} ${ifcFile.name} ${t('validator.loading.against')} ${group.idsFile.name}`;
                await new Promise(resolve => setTimeout(resolve, 100)); // Yield

                const specificationResults = await validateEntitiesAgainstIDSAsync(entities, idsData.specifications);

                idsResult.ifcResults.push({
                    ifcFileName: ifcFile.name,
                    specificationResults: specificationResults
                });
            }

            validationResults.push(idsResult);
        }

        // Hide loading
        document.getElementById('loading').classList.remove('show');

        // Show results
        if (validationResults.length > 0) {
            document.getElementById('resultsSection').style.display = 'block';
            displayResults();

            // Scroll to results
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        } else {
            ErrorHandler.warning(t('validator.result.noResults'));
        }

    } catch (error) {
        console.error('Validation error:', error);
        ErrorHandler.error(t('validator.error.validationError') + ' ' + error.message);
        document.getElementById('loading').classList.remove('show');
    }
}

// Make functions globally accessible for onclick handlers
window.addValidationGroup = addValidationGroup;
window.deleteValidationGroup = deleteValidationGroup;
window.openIfcStoragePicker = openIfcStoragePicker;
window.openIdsStoragePicker = openIdsStoragePicker;
window.closeIfcStorageModal = closeIfcStorageModal;
window.closeIdsStorageModal = closeIdsStorageModal;
window.confirmIfcSelection = confirmIfcSelection;
window.confirmIdsSelection = confirmIdsSelection;
window.validateAll = validateAll;
window.toggleIfcFolder = toggleIfcFolder;
window.toggleIdsFolder = toggleIdsFolder;
window.selectAllIfcFilesInFolder = selectAllIfcFilesInFolder;
window.toggleIfcFileSelection = toggleIfcFileSelection;
window.selectIdsFile = selectIdsFile;

// Pre-load storage metadata on page load for instant modal opening
(async function preloadStorageMetadata() {
    try {
        if (!storageDB) {
            storageDB = await initStorageDB();
        }

        // Pre-load IFC metadata (without file contents)
        const ifcTransaction = storageDB.transaction(['storage'], 'readonly');
        const ifcStore = ifcTransaction.objectStore('storage');
        const ifcRequest = ifcStore.get('ifc_files');

        ifcRequest.onsuccess = () => {
            const fullData = ifcRequest.result?.value;
            if (fullData && fullData.files) {
                ifcMetadata = {
                    folders: fullData.folders,
                    files: {}
                };
                for (const fileId in fullData.files) {
                    const file = fullData.files[fileId];
                    ifcMetadata.files[fileId] = {
                        id: file.id,
                        name: file.name,
                        size: file.size,
                        folder: file.folder,
                        uploadDate: file.uploadDate
                    };
                }
                console.log('✓ IFC storage metadata pre-loaded');
            }
        };

        // Pre-load IDS metadata (without file contents)
        const idsTransaction = storageDB.transaction(['storage'], 'readonly');
        const idsStore = idsTransaction.objectStore('storage');
        const idsRequest = idsStore.get('ids_files');

        idsRequest.onsuccess = () => {
            const fullData = idsRequest.result?.value;
            if (fullData && fullData.files) {
                idsMetadata = {
                    folders: fullData.folders,
                    files: {}
                };
                for (const fileId in fullData.files) {
                    const file = fullData.files[fileId];
                    idsMetadata.files[fileId] = {
                        id: file.id,
                        name: file.name,
                        size: file.size,
                        folder: file.folder,
                        uploadDate: file.uploadDate
                    };
                }
                console.log('✓ IDS storage metadata pre-loaded');
            }
        };

    } catch (e) {
        console.error('Failed to pre-load storage metadata:', e);
    }
})();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderValidationGroups();
    updateValidateButton();
});

// Re-render content when language changes
window.addEventListener('languageChanged', () => {
    renderValidationGroups();
    if (validationResults && validationResults.length > 0) {
        displayResults();
    }
});
