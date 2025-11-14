// =======================
// VIRTUAL ARRAY (memory optimization)
// =======================
class VirtualArray {
    constructor() {
        this.arrays = []; // Array of references to file.data arrays
    }

    setArrays(arrays) {
        this.arrays = arrays;
    }

    get length() {
        return this.arrays.reduce((sum, arr) => sum + arr.length, 0);
    }

    // Get item at index (across all arrays)
    at(index) {
        let currentIndex = 0;
        for (let arr of this.arrays) {
            if (index < currentIndex + arr.length) {
                return arr[index - currentIndex];
            }
            currentIndex += arr.length;
        }
        return undefined;
    }

    // Array methods
    find(callback) {
        for (let arr of this.arrays) {
            const result = arr.find(callback);
            if (result !== undefined) return result;
        }
        return undefined;
    }

    filter(callback) {
        const result = [];
        for (let arr of this.arrays) {
            result.push(...arr.filter(callback));
        }
        return result;
    }

    map(callback) {
        const result = [];
        for (let arr of this.arrays) {
            result.push(...arr.map(callback));
        }
        return result;
    }

    forEach(callback) {
        for (let arr of this.arrays) {
            arr.forEach(callback);
        }
    }

    slice(start, end) {
        const combined = [];
        for (let arr of this.arrays) {
            combined.push(...arr);
        }
        return combined.slice(start, end);
    }

    [Symbol.iterator]() {
        let arrayIndex = 0;
        let itemIndex = 0;
        const arrays = this.arrays;

        return {
            next() {
                while (arrayIndex < arrays.length) {
                    if (itemIndex < arrays[arrayIndex].length) {
                        const value = arrays[arrayIndex][itemIndex];
                        itemIndex++;
                        return { value, done: false };
                    }
                    arrayIndex++;
                    itemIndex = 0;
                }
                return { done: true };
            }
        };
    }

    // Convert to real array if needed
    toArray() {
        const result = [];
        for (let arr of this.arrays) {
            result.push(...arr);
        }
        return result;
    }
}

// =======================
// GLOBAL VARIABLES
// =======================
let loadedFiles = []; // Array of {fileName, data, color, entityCount} - originalContent is in IndexedDB
let allData = new VirtualArray(); // Virtual view over all file data (no duplication)
let filteredData = [];
let propertySetGroups = {};
let psetOrder = [];
let visiblePsets = {};
let sortColumn = null;
let sortDirection = 'asc';
let searchTerm = '';
let entityFilterValue = '';
let fileFilterValue = '';
let autoScrollInterval = null;
let lockedColumns = []; // Array of {psetName, propName} for locked columns

// Pagination variables
let currentPage = 1;
let pageSize = 500;
let totalPages = 1;

// Edit mode variables
let editMode = false;
let selectedEntities = new Set(); // Set of GUIDs
let modifications = {}; // {guid: {psetName: {propName: value}}}
let editingCell = null;

const fileColors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#feca57'];

// =======================
// IFC FILE CACHE (IndexedDB)
// =======================
let ifcCacheDB = null;

async function initIFCCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_ifc_cache', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            ifcCacheDB = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('ifc_files')) {
                db.createObjectStore('ifc_files', { keyPath: 'fileName' });
            }
        };
    });
}

async function storeIFCContent(fileName, content) {
    if (!ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ifcCacheDB.transaction(['ifc_files'], 'readwrite');
        const store = transaction.objectStore('ifc_files');
        const request = store.put({ fileName, content });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getIFCContent(fileName) {
    if (!ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ifcCacheDB.transaction(['ifc_files'], 'readonly');
        const store = transaction.objectStore('ifc_files');
        const request = store.get(fileName);

        request.onsuccess = () => resolve(request.result?.content);
        request.onerror = () => reject(request.error);
    });
}

async function deleteIFCContent(fileName) {
    if (!ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ifcCacheDB.transaction(['ifc_files'], 'readwrite');
        const store = transaction.objectStore('ifc_files');
        const request = store.delete(fileName);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#764ba2';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#667eea';
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    if (e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
    }
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
});

async function handleFiles(files) {
    const ifcFiles = files.filter(f => f.name.endsWith('.ifc'));
    if (ifcFiles.length === 0) {
        alert('Pouze .ifc soubory');
        return;
    }

    document.getElementById('loading').style.display = 'block';
    updateProgress(0, `Načítám soubory... (0/${ifcFiles.length})`);

    try {
        for (let i = 0; i < ifcFiles.length; i++) {
            const file = ifcFiles[i];
            const content = await readFileAsync(file);
            await parseIFCAsync(content, file.name, i + 1, ifcFiles.length);
        }

        document.getElementById('loading').style.display = 'none';
        combineData();
        updateUI();
    } catch (error) {
        console.error('Error handling files:', error);
        alert('Chyba při načítání souborů: ' + error.message);
        document.getElementById('loading').style.display = 'none';
    }
}

function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Chyba při čtení souboru'));
        reader.readAsText(file);
    });
}

function updateProgress(percent, status) {
    const progressBar = document.getElementById('progressBar');
    const loadingStatus = document.getElementById('loadingStatus');

    progressBar.style.width = percent + '%';
    progressBar.textContent = Math.round(percent) + '%';
    if (status) {
        loadingStatus.textContent = status;
    }
}

async function parseIFCAsync(content, fileName, fileIndex, totalFiles) {
    try {
        const fileData = [];
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();
        const layerMap = new Map(); // Map shape representation ID -> layer name
        const productShapeMap = new Map(); // Map IFCPRODUCTDEFINITIONSHAPE ID -> [shape rep IDs]

        const CHUNK_SIZE = 2000; // Process 2000 lines at a time
        const totalLines = lines.length;

        // Phase 1: Collect entities (chunked)
        updateProgress(0, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 1/4 (načítání entit)`);
        for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
            const chunk = lines.slice(i, i + CHUNK_SIZE);

            for (let line of chunk) {
                line = line.trim();
                if (!line.startsWith('#')) continue;
                const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
                if (!match) continue;
                const [, id, entityType, params] = match;
                entityMap.set(id, { id, type: entityType, params });
            }

            const progress = ((i + CHUNK_SIZE) / totalLines) * 25;
            updateProgress(progress, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 1/4 (${i + CHUNK_SIZE}/${totalLines} řádků)`);

            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Phase 2: Parse property sets and relationships (chunked)
        updateProgress(25, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 2/4 (property sety a vztahy)`);
        const entities = Array.from(entityMap.entries());
        const spatialStructureMap = new Map(); // Map entity ID -> { children: [], parent: null }
        const containedInSpatialMap = new Map(); // IFCRELCONTAINEDINSPATIALSTRUCTURE relations
        const aggregatesMap = new Map(); // IFCRELAGGREGATES relations

        for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
            const chunk = entities.slice(i, i + CHUNK_SIZE);

            for (let [id, entity] of chunk) {
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
                    // Parse shape representations from IFCPRODUCTDEFINITIONSHAPE
                    // Format: IFCPRODUCTDEFINITIONSHAPE(Name, Description, (#123,#124,#125))
                    const shapeReps = entity.params.match(/#\d+/g);
                    if (shapeReps) {
                        productShapeMap.set(id, shapeReps.map(r => r.substring(1)));
                    }
                } else if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
                    // Parse spatial containment
                    // Format: IFCRELCONTAINEDINSPATIALSTRUCTURE(..., (#1,#2,#3), #100)
                    const relatedElements = entity.params.match(/\(([#\d,\s]+)\)/);
                    const relatingStructure = entity.params.match(/,\s*#(\d+)\s*\)/);
                    if (relatedElements && relatingStructure) {
                        const children = relatedElements[1].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                        const parent = relatingStructure[1];
                        containedInSpatialMap.set(id, { parent, children });
                        if (containedInSpatialMap.size <= 3) {
                            console.log(`IFCRELCONTAINEDINSPATIALSTRUCTURE #${id}: parent=${parent}, children=[${children.join(',')}]`);
                        }
                    }
                } else if (entity.type === 'IFCRELAGGREGATES') {
                    // Parse aggregation
                    // Format: IFCRELAGGREGATES(..., #parent, (#children))
                    const match = entity.params.match(/#(\d+)\s*,\s*\(([#\d,\s]+)\)/);
                    if (match) {
                        const parent = match[1];
                        const children = match[2].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                        aggregatesMap.set(id, { parent, children });
                    }
                }
            }

            const progress = 25 + ((i + CHUNK_SIZE) / entities.length) * 25;
            updateProgress(progress, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 2/4 (${i + CHUNK_SIZE}/${entities.length} entit)`);

            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Phase 3: Build spatial structure tree
        updateProgress(50, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 3/4 (prostorová struktura)`);

        console.log('=== SPATIAL TREE DEBUG ===');
        console.log('aggregatesMap size:', aggregatesMap.size);
        console.log('containedInSpatialMap size:', containedInSpatialMap.size);
        console.log('Sample aggregatesMap entries:', Array.from(aggregatesMap.entries()).slice(0, 3));
        console.log('Sample containedInSpatialMap entries:', Array.from(containedInSpatialMap.entries()).slice(0, 3));

        // Check what entity 338925 is
        for (let [relId, rel] of containedInSpatialMap) {
            const parentEntity = entityMap.get(rel.parent);
            console.log(`Containment parent: #${rel.parent} = ${parentEntity?.type} (${extractName(parentEntity?.params) || '-'}), children: ${rel.children.length}`);
        }

        // Build parent-child relationships
        const childToParentMap = new Map();

        // Process IFCRELAGGREGATES (hierarchical decomposition)
        for (let [relId, rel] of aggregatesMap) {
            rel.children.forEach(childId => {
                if (!childToParentMap.has(childId)) {
                    childToParentMap.set(childId, []);
                }
                childToParentMap.get(childId).push({ parentId: rel.parent, type: 'aggregate' });
            });
        }

        // Process IFCRELCONTAINEDINSPATIALSTRUCTURE (spatial containment)
        for (let [relId, rel] of containedInSpatialMap) {
            rel.children.forEach(childId => {
                if (!childToParentMap.has(childId)) {
                    childToParentMap.set(childId, []);
                }
                childToParentMap.get(childId).push({ parentId: rel.parent, type: 'contained' });
            });
        }

        // Build tree structure starting from IFCPROJECT
        const spatialTree = [];
        const processedNodes = new Set();

        function buildNode(entityId) {
            if (processedNodes.has(entityId)) return null;
            processedNodes.add(entityId);

            const entity = entityMap.get(entityId);
            if (!entity) return null;

            const node = {
                id: entityId,
                type: entity.type,
                name: extractName(entity.params) || '-',
                children: []
            };

            let childrenCount = 0;

            // Find children from aggregatesMap
            for (let [relId, rel] of aggregatesMap) {
                if (rel.parent === entityId) {
                    rel.children.forEach(childId => {
                        const childNode = buildNode(childId);
                        if (childNode) {
                            node.children.push(childNode);
                            childrenCount++;
                        }
                    });
                }
            }

            // Find children from containedInSpatialMap
            for (let [relId, rel] of containedInSpatialMap) {
                if (rel.parent === entityId) {
                    rel.children.forEach(childId => {
                        const childNode = buildNode(childId);
                        if (childNode) {
                            node.children.push(childNode);
                            childrenCount++;
                        }
                    });
                }
            }


            return node;
        }

        // Find root (IFCPROJECT)
        let projectId = null;
        for (let [id, entity] of entityMap) {
            if (entity.type === 'IFCPROJECT') {
                projectId = id;
                console.log('Found IFCPROJECT:', id);
                const rootNode = buildNode(id);
                if (rootNode) {
                    spatialTree.push(rootNode);
                    console.log('Root node created, children:', rootNode.children.length);
                }
                break;
            }
        }

        if (!projectId) {
            console.warn('No IFCPROJECT found in file!');
        }

        // Add orphaned nodes that have children in containedInSpatialMap but aren't in the tree
        console.log('Checking for orphaned spatial containers...');
        const orphanedContainers = [];

        for (let [relId, rel] of containedInSpatialMap) {
            if (!processedNodes.has(rel.parent)) {
                const parentEntity = entityMap.get(rel.parent);
                console.log(`Found orphaned container: #${rel.parent} = ${parentEntity?.type} with ${rel.children.length} children`);

                orphanedContainers.push({
                    id: rel.parent,
                    entity: parentEntity,
                    children: rel.children
                });
            }
        }

        // Attach orphaned containers to the tree
        if (orphanedContainers.length > 0) {
            console.log(`Attempting to attach ${orphanedContainers.length} orphaned containers to tree...`);

            // Helper to find a node in the tree by ID
            function findNodeInTree(tree, targetId) {
                for (let node of tree) {
                    if (node.id === targetId) return node;
                    if (node.children && node.children.length > 0) {
                        const found = findNodeInTree(node.children, targetId);
                        if (found) return found;
                    }
                }
                return null;
            }

            // Helper to find appropriate parent based on entity type hierarchy
            function findAppropriateParent(tree, orphanType) {
                // Define strict hierarchy - most specific first
                const typeHierarchy = {
                    // Spatial containers
                    'IFCBUILDINGSTOREY': ['IFCBUILDING'],
                    'IFCBUILDING': ['IFCSITE'],
                    'IFCSITE': ['IFCPROJECT'],
                    'IFCSPACE': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],

                    // Building elements - should be in BUILDING or BUILDINGSTOREY
                    'IFCWALL': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCSLAB': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCROOF': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCBEAM': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCCOLUMN': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCDOOR': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCWINDOW': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCSTAIR': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCRAILING': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCCOVERING': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCFURNISHINGELEMENT': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCFURNITURE': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCBUILDINGELEMENTPROXY': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCMEMBER': ['IFCBUILDINGSTOREY', 'IFCBUILDING'],
                    'IFCPLATE': ['IFCBUILDINGSTOREY', 'IFCBUILDING']
                };

                const preferredParents = typeHierarchy[orphanType] || ['IFCBUILDINGSTOREY', 'IFCBUILDING'];

                // Recursively search for ALL matching parent types and pick the DEEPEST one
                let candidates = [];

                function searchTree(nodes, depth = 0) {
                    for (let node of nodes) {
                        if (preferredParents.includes(node.type)) {
                            candidates.push({ node, depth });
                        }
                        if (node.children && node.children.length > 0) {
                            searchTree(node.children, depth + 1);
                        }
                    }
                }

                searchTree(tree);

                // Pick the deepest candidate (most specific location in hierarchy)
                if (candidates.length > 0) {
                    candidates.sort((a, b) => b.depth - a.depth);  // Sort by depth descending
                    return candidates[0].node;
                }

                return null;
            }

            // Helper to create or find BUILDINGSTOREY under a BUILDING
            const buildingStoreyCache = new Map();  // Cache created storeys

            function getOrCreateStorey(buildingNode) {
                if (buildingStoreyCache.has(buildingNode.id)) {
                    return buildingStoreyCache.get(buildingNode.id);
                }

                // Check if BUILDING already has a BUILDINGSTOREY child
                const existingStorey = buildingNode.children.find(child => child.type === 'IFCBUILDINGSTOREY');
                if (existingStorey) {
                    buildingStoreyCache.set(buildingNode.id, existingStorey);
                    return existingStorey;
                }

                // Create a virtual BUILDINGSTOREY
                const storeyNode = {
                    id: `virtual_storey_${buildingNode.id}`,
                    type: 'IFCBUILDINGSTOREY',
                    name: 'Unknown Floor',
                    children: []
                };

                buildingNode.children.push(storeyNode);
                buildingStoreyCache.set(buildingNode.id, storeyNode);
                console.log(`  Created virtual BUILDINGSTOREY under ${buildingNode.type} #${buildingNode.id}`);

                return storeyNode;
            }

            // Physical building elements that should go into BUILDINGSTOREY
            const physicalElements = new Set([
                'IFCWALL', 'IFCSLAB', 'IFCROOF', 'IFCBEAM', 'IFCCOLUMN', 'IFCDOOR', 'IFCWINDOW',
                'IFCSTAIR', 'IFCRAILING', 'IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
                'IFCBUILDINGELEMENTPROXY', 'IFCMEMBER', 'IFCPLATE', 'IFCFLOWSEGMENT',
                'IFCFLOWTERMINAL', 'IFCFLOWFITTING'
            ]);

            // Attach each orphan
            for (let orphan of orphanedContainers) {
                const orphanNode = {
                    id: orphan.id,
                    type: orphan.entity.type,
                    name: extractName(orphan.entity.params) || '-',
                    children: []
                };

                // Add the contained children to this orphan node
                for (let childId of orphan.children) {
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

                // Find appropriate parent in the tree
                let parentNode = findAppropriateParent(spatialTree, orphan.entity.type);

                // If parent is BUILDING and orphan is a physical element, use/create BUILDINGSTOREY
                if (parentNode && parentNode.type === 'IFCBUILDING' && physicalElements.has(orphan.entity.type)) {
                    parentNode = getOrCreateStorey(parentNode);
                }

                if (parentNode) {
                    parentNode.children.push(orphanNode);
                    processedNodes.add(orphan.id);
                    console.log(`  ✓ Attached ${orphan.entity.type} #${orphan.id} to ${parentNode.type} #${parentNode.id} (${orphanNode.children.length} children)`);
                } else {
                    console.warn(`  ✗ Could not find appropriate parent for ${orphan.entity.type} #${orphan.id}`);
                }
            }
        }

        // Phase 4: Build final data (chunked)
        updateProgress(60, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 4/4 (stavba dat)`);
        let processedEntities = 0;
        for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
            const chunk = entities.slice(i, i + CHUNK_SIZE);

            for (let [id, entity] of chunk) {
                if (entity.type.startsWith('IFC') &&
                    !entity.type.includes('REL') &&
                    !entity.type.includes('PROPERTY') &&
                    entity.params.includes("'")) {

                    const guid = extractGUID(entity.params);
                    const name = extractName(entity.params);

                    if (guid) {
                        const propertySets = {};

                        for (let [relId, rel] of relDefinesMap) {
                            if (rel.relatedObjects && rel.relatedObjects.includes(id)) {
                                const psetId = rel.relatingPropertyDefinition;
                                if (propertySetMap.has(psetId)) {
                                    const pset = propertySetMap.get(psetId);
                                    propertySets[pset.name] = pset.properties;
                                }
                            }
                        }

                        // Find layer by traversing Representation -> IFCPRODUCTDEFINITIONSHAPE -> IFCSHAPEREPRESENTATION
                        let entityLayer = '-';
                        const representationMatch = entity.params.match(/#(\d+)/g);
                        if (representationMatch) {
                            for (let refId of representationMatch) {
                                const cleanRefId = refId.substring(1);
                                const refEntity = entityMap.get(cleanRefId);

                                // Check if this is IFCPRODUCTDEFINITIONSHAPE
                                if (refEntity && refEntity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
                                    const shapeReps = productShapeMap.get(cleanRefId);
                                    if (shapeReps) {
                                        for (let shapeRepId of shapeReps) {
                                            if (layerMap.has(shapeRepId)) {
                                                entityLayer = layerMap.get(shapeRepId);
                                                break;
                                            }
                                        }
                                    }
                                    if (entityLayer !== '-') break;
                                }
                            }
                        }

                        fileData.push({
                            guid,
                            ifcId: id,  // Add IFC numeric ID for spatial tree filtering
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
            updateProgress(progress, `Zpracovávám soubor ${fileIndex}/${totalFiles}: ${fileName} - fáze 4/4 (${processedEntities}/${entities.length} entit)`);

            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const color = fileColors[loadedFiles.length % fileColors.length];

        // Store original content in IndexedDB to save RAM
        await storeIFCContent(fileName, content);

        loadedFiles.push({
            fileName,
            data: fileData,
            color,
            entityCount: fileData.length,
            spatialTree: spatialTree // Spatial structure tree
            // originalContent removed - stored in IndexedDB instead
        });

        updateFileList();
        updateProgress(100, `Soubor ${fileIndex}/${totalFiles} dokončen: ${fileName}`);

    } catch (error) {
        console.error('Parse error:', error);
        alert('Chyba v souboru ' + fileName + ': ' + error.message);
        throw error;
    }
}

async function parseIFC(content, fileName) {
    try {
        const fileData = [];
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();

        // Collect entities
        for (let line of lines) {
            line = line.trim();
            if (!line.startsWith('#')) continue;
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
            if (!match) continue;
            const [, id, entityType, params] = match;
            entityMap.set(id, { id, type: entityType, params });
        }

        // Parse property sets and spatial relationships
        const containedInSpatialMap = new Map();
        const aggregatesMap = new Map();

        for (let [id, entity] of entityMap) {
            if (entity.type === 'IFCPROPERTYSET') {
                const props = parsePropertySet(entity.params, entityMap);
                propertySetMap.set(id, props);
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                const rel = parseRelDefines(entity.params);
                relDefinesMap.set(id, rel);
            } else if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
                const relatedElements = entity.params.match(/\(([#\d,\s]+)\)/);
                const relatingStructure = entity.params.match(/,\s*#(\d+)\s*\)/);
                if (relatedElements && relatingStructure) {
                    const children = relatedElements[1].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                    const parent = relatingStructure[1];
                    containedInSpatialMap.set(id, { parent, children });
                }
            } else if (entity.type === 'IFCRELAGGREGATES') {
                // Format: IFCRELAGGREGATES(..., #parent, (#children))
                const match = entity.params.match(/#(\d+)\s*,\s*\(([#\d,\s]+)\)/);
                if (match) {
                    const parent = match[1];
                    const children = match[2].match(/#\d+/g)?.map(r => r.substring(1)) || [];
                    aggregatesMap.set(id, { parent, children });
                }
            }
        }

        // Build spatial structure tree
        console.log('=== SPATIAL TREE DEBUG (parseIFC) ===');
        console.log('aggregatesMap size:', aggregatesMap.size);
        console.log('containedInSpatialMap size:', containedInSpatialMap.size);

        const spatialTree = [];
        const processedNodes = new Set();

        function buildNode(entityId) {
            if (processedNodes.has(entityId)) return null;
            processedNodes.add(entityId);

            const entity = entityMap.get(entityId);
            if (!entity) return null;

            const node = {
                id: entityId,
                type: entity.type,
                name: extractName(entity.params) || '-',
                children: []
            };

            let childrenCount = 0;

            // Find children from aggregatesMap
            for (let [relId, rel] of aggregatesMap) {
                if (rel.parent === entityId) {
                    rel.children.forEach(childId => {
                        const childNode = buildNode(childId);
                        if (childNode) {
                            node.children.push(childNode);
                            childrenCount++;
                        }
                    });
                }
            }

            // Find children from containedInSpatialMap
            for (let [relId, rel] of containedInSpatialMap) {
                if (rel.parent === entityId) {
                    rel.children.forEach(childId => {
                        const childNode = buildNode(childId);
                        if (childNode) {
                            node.children.push(childNode);
                            childrenCount++;
                        }
                    });
                }
            }


            return node;
        }

        // Find root (IFCPROJECT)
        let projectId = null;
        for (let [id, entity] of entityMap) {
            if (entity.type === 'IFCPROJECT') {
                projectId = id;
                console.log('Found IFCPROJECT:', id);
                const rootNode = buildNode(id);
                if (rootNode) {
                    spatialTree.push(rootNode);
                    console.log('Root node created, children:', rootNode.children.length);
                }
                break;
            }
        }

        if (!projectId) {
            console.warn('No IFCPROJECT found in file!');
        }

        // Build data
        for (let [id, entity] of entityMap) {
            if (entity.type.startsWith('IFC') &&
                !entity.type.includes('REL') &&
                !entity.type.includes('PROPERTY') &&
                entity.params.includes("'")) {

                const guid = extractGUID(entity.params);
                const name = extractName(entity.params);

                if (guid) {
                    const propertySets = {};

                    for (let [relId, rel] of relDefinesMap) {
                        if (rel.relatedObjects && rel.relatedObjects.includes(id)) {
                            const psetId = rel.relatingPropertyDefinition;
                            if (propertySetMap.has(psetId)) {
                                const pset = propertySetMap.get(psetId);
                                propertySets[pset.name] = pset.properties;
                            }
                        }
                    }

                    fileData.push({
                        guid,
                        entity: entity.type,
                        name: name || '-',
                        propertySets,
                        fileName: fileName
                    });
                }
            }
        }

        const color = fileColors[loadedFiles.length % fileColors.length];

        // Store original content in IndexedDB to save RAM
        await storeIFCContent(fileName, content);

        loadedFiles.push({
            fileName,
            data: fileData,
            color,
            entityCount: fileData.length,
            spatialTree: spatialTree // Spatial structure tree
            // originalContent removed - stored in IndexedDB instead
        });

        updateFileList();

    } catch (error) {
        console.error('Parse error:', error);
        alert('Chyba v souboru ' + fileName + ': ' + error.message);
    }
}

function extractGUID(params) {
    const match = params.match(/'([^']+)'/);
    return match ? match[1] : null;
}

function extractName(params) {
    const matches = params.match(/'([^']*)'/g);
    const rawName = matches && matches.length > 1 ? matches[1].replace(/'/g, '') : null;
    return rawName ? decodeIFCString(rawName) : null; // Decode entity name
}

function parsePropertySet(params, entityMap) {
    const parts = splitParams(params);
    const rawName = parts[2] ? parts[2].replace(/'/g, '') : 'Unknown';
    const name = decodeIFCString(rawName); // Decode PropertySet name
    const properties = {};

    if (parts.length > 4) {
        const propIds = parts[4].match(/#\d+/g);
        if (propIds) {
            for (let propId of propIds) {
                const id = propId.substring(1);
                const propEntity = entityMap.get(id);
                if (propEntity && propEntity.type === 'IFCPROPERTYSINGLEVALUE') {
                    const prop = parseProperty(propEntity.params);
                    if (prop) properties[prop.name] = prop.value;
                }
            }
        }
    }

    return { name, properties };
}

function parseProperty(params) {
    const parts = splitParams(params);
    if (parts.length < 3) return null;
    const rawName = parts[0].replace(/'/g, '');
    const name = decodeIFCString(rawName); // Decode property name
    let value = parts[2] || '';
    const valueMatch = value.match(/IFC[A-Z]+\s*\(\s*'([^']*)'\s*\)/i);
    if (valueMatch) {
        value = decodeIFCString(valueMatch[1]);
    }
    return { name, value };
}

function decodeIFCString(str) {
    if (!str) return str;
    // Decode \X\XX format (ISO 8859-1)
    str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Decode \X2\XXXX\X0\ format (UCS-2/UTF-16) - variable length hex
    str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    return str;
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
    // IFCPRESENTATIONLAYERASSIGNMENT(Name, Description, AssignedItems, LayerStyles)
    const rawName = parts[0] ? parts[0].replace(/'/g, '') : 'Unknown';
    const name = decodeIFCString(rawName);
    const assignedItems = parts[2] ? parts[2].match(/#\d+/g)?.map(r => r.substring(1)) : [];

    return {
        name,
        assignedItems
    };
}

function splitParams(params) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;

    for (let char of params) {
        if (char === "'" && (current.length === 0 || current[current.length - 1] !== '\\')) {
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

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    loadedFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-info">
                <div class="file-name">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${file.color}; margin-right: 8px;"></span>
                    ${file.fileName}
                    <span style="color: #6c757d; font-weight: normal; margin-left: 8px;">(${file.entityCount} entit)</span>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile(${index})">×</button>
        `;
        fileList.appendChild(card);
    });
}

async function removeFile(index) {
    const file = loadedFiles[index];

    // Delete from IndexedDB cache
    await deleteIFCContent(file.fileName);

    loadedFiles.splice(index, 1);
    updateFileList();
    if (loadedFiles.length > 0) {
        combineData();
        updateUI();
    } else {
        // Reset to initial state when all files are removed
        document.getElementById('controls').style.display = 'none';
        document.getElementById('tableContainer').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('paginationContainer').style.display = 'none';
        document.getElementById('editPanel').classList.remove('active');

        // Reset data and state
        allData.setArrays([]);
        filteredData = [];
        selectedEntities.clear();
        modifications = {};
        propertySetGroups = {};
        psetOrder = [];
        visiblePsets = {};
        currentPage = 1;
        editMode = false;

        // Reset edit mode button
        const editModeBtn = document.getElementById('toggleEditModeBtn');
        if (editModeBtn) {
            editModeBtn.textContent = '✏️ Editační režim';
        }
        document.body.classList.remove('edit-mode');
    }
}

function combineData() {
    // Use VirtualArray to avoid data duplication
    allData.setArrays(loadedFiles.map(f => f.data));

    const newPropertySetGroups = {};

    // Track all property sets
    for (let file of loadedFiles) {
        for (let item of file.data) {
            for (let [psetName, props] of Object.entries(item.propertySets)) {
                if (!newPropertySetGroups[psetName]) {
                    newPropertySetGroups[psetName] = new Set();
                }
                for (let propName of Object.keys(props)) {
                    newPropertySetGroups[psetName].add(propName);
                }
            }
        }
    }

    // Convert sets to arrays
    for (let psetName of Object.keys(newPropertySetGroups)) {
        newPropertySetGroups[psetName] = Array.from(newPropertySetGroups[psetName]).sort();
    }

    // CRITICAL: Preserve existing order and visibility settings
    if (psetOrder.length === 0) {
        // First time - initialize everything
        propertySetGroups = newPropertySetGroups;
        psetOrder = Object.keys(propertySetGroups).sort();
        visiblePsets = {};
        for (let psetName of psetOrder) {
            visiblePsets[psetName] = {};
            for (let propName of propertySetGroups[psetName]) {
                visiblePsets[psetName][propName] = true;
            }
        }
    } else {
        // Already have data - preserve order and add new items at the end
        
        // Step 1: Keep existing PropertySets in their current order
        const newPsetOrder = [...psetOrder.filter(name => newPropertySetGroups[name])];
        
        // Step 2: Add any new PropertySets that weren't in the old order
        for (let psetName of Object.keys(newPropertySetGroups)) {
            if (!newPsetOrder.includes(psetName)) {
                newPsetOrder.push(psetName);
            }
        }
        
        // Step 3: Update propertySetGroups while preserving property order
        const updatedPropertySetGroups = {};
        const updatedVisiblePsets = {};
        
        for (let psetName of newPsetOrder) {
            const newProps = newPropertySetGroups[psetName];
            
            if (propertySetGroups[psetName]) {
                // PropertySet existed before - preserve property order
                const oldProps = propertySetGroups[psetName];
                
                // Keep existing properties in their order
                const orderedProps = oldProps.filter(p => newProps.includes(p));
                
                // Add new properties at the end
                for (let prop of newProps) {
                    if (!orderedProps.includes(prop)) {
                        orderedProps.push(prop);
                    }
                }
                
                updatedPropertySetGroups[psetName] = orderedProps;
                
                // Preserve visibility settings
                updatedVisiblePsets[psetName] = {};
                for (let propName of orderedProps) {
                    if (visiblePsets[psetName] && propName in visiblePsets[psetName]) {
                        updatedVisiblePsets[psetName][propName] = visiblePsets[psetName][propName];
                    } else {
                        updatedVisiblePsets[psetName][propName] = true; // New property - visible by default
                    }
                }
            } else {
                // New PropertySet - add with default settings
                updatedPropertySetGroups[psetName] = newProps;
                updatedVisiblePsets[psetName] = {};
                for (let propName of newProps) {
                    updatedVisiblePsets[psetName][propName] = true;
                }
            }
        }
        
        // Apply updates
        psetOrder = newPsetOrder;
        propertySetGroups = updatedPropertySetGroups;
        visiblePsets = updatedVisiblePsets;
    }
}

function updateUI() {
    // Update entity filter
    const entityFilter = document.getElementById('entityFilter');
    const entities = [...new Set(allData.map(item => item.entity))].sort();
    entityFilter.innerHTML = '<option value="">Všechny entity</option>';
    for (let entity of entities) {
        entityFilter.innerHTML += `<option value="${entity}">${entity}</option>`;
    }

    // Update file filter
    const fileFilter = document.getElementById('fileFilter');
    fileFilter.innerHTML = '<option value="">Všechny soubory</option>';
    loadedFiles.forEach(file => {
        fileFilter.innerHTML += `<option value="${file.fileName}">${file.fileName}</option>`;
    });

    document.getElementById('controls').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
    
    buildPsetManager();
    buildTable();
    showStatistics();
}

// PropertySet Manager (same as before with drag & drop)
function buildPsetManager() {
    const psetList = document.getElementById('psetList');
    psetList.innerHTML = '';

    for (let i = 0; i < psetOrder.length; i++) {
        const psetName = psetOrder[i];
        if (!propertySetGroups[psetName]) continue;
        
        const group = document.createElement('div');
        group.className = 'pset-group';
        group.dataset.psetIndex = i;
        group.dataset.psetName = psetName;

        const header = document.createElement('div');
        header.className = 'pset-group-header';
        header.draggable = true;
        
        const allVisible = propertySetGroups[psetName].every(p => visiblePsets[psetName][p]);
        header.innerHTML = `
            <span class="drag-handle">☰</span>
            <input type="checkbox" id="pset-${i}" ${allVisible ? 'checked' : ''}>
            <label for="pset-${i}" style="flex: 1; cursor: pointer; font-weight: 700; color: #764ba2;">
                ${psetName} (${propertySetGroups[psetName].length})
            </label>
        `;

        const checkbox = header.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            for (let propName of propertySetGroups[psetName]) {
                visiblePsets[psetName][propName] = e.target.checked;
            }
            buildPsetManager();
        });

        header.addEventListener('dragstart', (e) => handlePsetDragStart(e, group));
        header.addEventListener('dragend', handleDragEnd);

        group.appendChild(header);

        for (let j = 0; j < propertySetGroups[psetName].length; j++) {
            const propName = propertySetGroups[psetName][j];
            const propItem = document.createElement('div');
            propItem.className = 'prop-item';
            propItem.draggable = true;
            propItem.dataset.propIndex = j;
            propItem.dataset.psetName = psetName;
            
            propItem.innerHTML = `
                <span class="drag-handle">⋮</span>
                <input type="checkbox" id="prop-${psetName}-${propName}" ${visiblePsets[psetName][propName] ? 'checked' : ''}>
                <label for="prop-${psetName}-${propName}" style="flex: 1; cursor: pointer;">${propName}</label>
            `;
            
            const propCheckbox = propItem.querySelector('input');
            propCheckbox.addEventListener('change', (e) => {
                e.stopPropagation();
                visiblePsets[psetName][propName] = e.target.checked;
            });
            
            propItem.addEventListener('dragstart', (e) => handlePropDragStart(e, propItem));
            propItem.addEventListener('dragend', handleDragEnd);
            
            group.appendChild(propItem);
        }

        group.addEventListener('dragover', handleDragOver);
        group.addEventListener('drop', (e) => handleDrop(e, group));

        psetList.appendChild(group);
    }

    setupAutoScroll();
}

let draggedItem = null;
let dragType = null;

function handlePsetDragStart(e, group) {
    draggedItem = group;
    dragType = 'pset';
    group.classList.add('dragging');
    e.stopPropagation();
}

function handlePropDragStart(e, propItem) {
    draggedItem = propItem;
    dragType = 'prop';
    propItem.classList.add('dragging');
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e, targetGroup) {
    e.stopPropagation();
    e.preventDefault();
    
    if (!draggedItem) return;

    if (dragType === 'pset') {
        if (draggedItem !== targetGroup) {
            const fromIndex = parseInt(draggedItem.dataset.psetIndex);
            const toIndex = parseInt(targetGroup.dataset.psetIndex);
            const item = psetOrder[fromIndex];
            psetOrder.splice(fromIndex, 1);
            psetOrder.splice(toIndex, 0, item);
            buildPsetManager();
        }
    } else if (dragType === 'prop') {
        const fromPsetName = draggedItem.dataset.psetName;
        const toPsetName = targetGroup.dataset.psetName;
        
        if (fromPsetName === toPsetName) {
            const fromIndex = parseInt(draggedItem.dataset.propIndex);
            const propItems = targetGroup.querySelectorAll('.prop-item');
            let toIndex = -1;
            
            propItems.forEach((item, idx) => {
                const rect = item.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                if (e.clientY < midpoint && toIndex === -1) {
                    toIndex = idx;
                }
            });
            
            if (toIndex === -1) toIndex = propItems.length - 1;
            
            if (fromIndex !== toIndex) {
                const propArray = propertySetGroups[fromPsetName];
                const prop = propArray[fromIndex];
                propArray.splice(fromIndex, 1);
                propArray.splice(toIndex, 0, prop);
                buildPsetManager();
            }
        }
    }
}

function handleDragEnd() {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    draggedItem = null;
    dragType = null;
    stopAutoScroll();
}

function setupAutoScroll() {
    const psetList = document.getElementById('psetList');
    
    psetList.addEventListener('dragover', (e) => {
        const rect = psetList.getBoundingClientRect();
        const scrollMargin = 50;
        const scrollSpeed = 10;
        
        if (e.clientY - rect.top < scrollMargin) {
            startAutoScroll(psetList, -scrollSpeed);
        } else if (rect.bottom - e.clientY < scrollMargin) {
            startAutoScroll(psetList, scrollSpeed);
        } else {
            stopAutoScroll();
        }
    });
    
    psetList.addEventListener('dragleave', () => {
        stopAutoScroll();
    });
}

function startAutoScroll(element, speed) {
    if (autoScrollInterval) return;
    autoScrollInterval = setInterval(() => {
        element.scrollTop += speed;
    }, 50);
}

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

document.getElementById('columnManagerBtn').addEventListener('click', () => {
    const manager = document.getElementById('columnManager');
    manager.style.display = manager.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('applyColumnsBtn').addEventListener('click', () => {
    buildTable();
    document.getElementById('columnManager').style.display = 'none';
});

document.getElementById('selectAllBtn').addEventListener('click', () => {
    for (let psetName of psetOrder) {
        if (propertySetGroups[psetName]) {
            for (let propName of propertySetGroups[psetName]) {
                visiblePsets[psetName][propName] = true;
            }
        }
    }
    buildPsetManager();
});

document.getElementById('deselectAllColumnsBtn').addEventListener('click', () => {
    for (let psetName of psetOrder) {
        if (propertySetGroups[psetName]) {
            for (let propName of propertySetGroups[psetName]) {
                visiblePsets[psetName][propName] = false;
            }
        }
    }
    buildPsetManager();
});

function buildTable() {
    const headerPset = document.getElementById('headerRowPset');
    const headerProp = document.getElementById('headerRowProp');
    
    headerPset.innerHTML = '';
    headerProp.innerHTML = '';

    // Calculate widths
    const fileColWidth = 150;
    const fixedColWidth = 120; // GUID, Entita, Name
    
    // Checkbox column in edit mode
    if (editMode) {
        const checkHeader = document.createElement('th');
        checkHeader.innerHTML = '<input type="checkbox" id="selectAllCheckbox">';
        checkHeader.rowSpan = 2;
        checkHeader.classList.add('sticky-col', 'checkbox-cell');
        checkHeader.style.left = '0px';
        headerPset.appendChild(checkHeader);

        document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
            const startIndex = pageSize === -1 ? 0 : (currentPage - 1) * pageSize;
            const endIndex = pageSize === -1 ? filteredData.length : Math.min(startIndex + pageSize, filteredData.length);
            const pageData = filteredData.slice(startIndex, endIndex);
            if (e.target.checked) {
                pageData.forEach(item => selectedEntities.add(item.guid));
            } else {
                pageData.forEach(item => selectedEntities.delete(item.guid));
            }
            updateSelectedCount();
            renderTable();
        });
    }

    // File column - always sticky
    const fileHeader = document.createElement('th');
    fileHeader.textContent = 'Soubor';
    fileHeader.rowSpan = 2;
    fileHeader.style.cursor = 'pointer';
    fileHeader.classList.add('sticky-col');
    fileHeader.style.left = editMode ? '40px' : '0px';
    fileHeader.addEventListener('click', () => sortByColumn('Soubor'));
    headerPset.appendChild(fileHeader);

    let currentLeft = (editMode ? 40 : 0) + fileColWidth;

    // Build locked columns first
    const lockedCols = [];
    const unlockedCols = [];
    
    for (let psetName of psetOrder) {
        if (!propertySetGroups[psetName]) continue;
        const visibleProps = propertySetGroups[psetName].filter(p => visiblePsets[psetName][p]);
        
        for (let propName of visibleProps) {
            const col = { psetName, propName };
            const isLocked = lockedColumns.some(lc => lc.psetName === psetName && lc.propName === propName);
            
            if (isLocked) {
                lockedCols.push(col);
            } else {
                unlockedCols.push(col);
            }
        }
    }

    // Add PropertySet headers for locked columns (one header per property for alignment)
    if (lockedCols.length > 0) {
        for (let col of lockedCols) {
            const psetTh = document.createElement('th');
            psetTh.className = 'pset-header sticky-col';
            psetTh.textContent = col.psetName;
            psetTh.style.left = currentLeft + 'px';
            psetTh.style.width = '120px';
            
            headerPset.appendChild(psetTh);
            currentLeft += 120;
        }
    }

    // Fixed columns (GUID, Entita, Name, Layer) - NOT sticky, will scroll away
    ['GUID', 'Entita', 'Name', 'Layer'].forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        th.rowSpan = 2;
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => sortByColumn(label));
        headerPset.appendChild(th);
    });

    // PropertySet headers for unlocked columns
    const unlockedGrouped = {};
    for (let col of unlockedCols) {
        if (!unlockedGrouped[col.psetName]) unlockedGrouped[col.psetName] = [];
        unlockedGrouped[col.psetName].push(col);
    }

    for (let psetName of Object.keys(unlockedGrouped)) {
        const psetTh = document.createElement('th');
        psetTh.className = 'pset-header';
        psetTh.textContent = psetName;
        psetTh.colSpan = unlockedGrouped[psetName].length;
        headerPset.appendChild(psetTh);
    }

    // Property headers - locked columns first
    currentLeft = fileColWidth;
    
    for (let col of lockedCols) {
        const propTh = document.createElement('th');
        propTh.className = 'prop-header sticky-col';
        propTh.style.cursor = 'pointer';
        propTh.style.left = currentLeft + 'px';
        
        const wrapper = document.createElement('span');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.gap = '5px';
        
        const label = document.createElement('span');
        label.textContent = col.propName;
        label.style.flex = '1';
        label.addEventListener('click', () => sortByProperty(col.psetName, col.propName));
        
        const lockIcon = document.createElement('span');
        lockIcon.className = 'lock-icon locked';
        lockIcon.textContent = '🔒';
        lockIcon.title = 'Odemknout sloupec';
        lockIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLockColumn(col.psetName, col.propName);
        });
        
        wrapper.appendChild(label);
        wrapper.appendChild(lockIcon);
        propTh.appendChild(wrapper);
        headerProp.appendChild(propTh);
        
        currentLeft += 120;
    }

    // Property headers - unlocked columns
    for (let col of unlockedCols) {
        const propTh = document.createElement('th');
        propTh.className = 'prop-header';
        propTh.style.cursor = 'pointer';
        
        const wrapper = document.createElement('span');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.gap = '5px';
        
        const label = document.createElement('span');
        label.textContent = col.propName;
        label.style.flex = '1';
        label.addEventListener('click', () => sortByProperty(col.psetName, col.propName));
        
        const lockIcon = document.createElement('span');
        lockIcon.className = 'lock-icon';
        lockIcon.textContent = '🔓';
        lockIcon.title = 'Zamknout sloupec';
        lockIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLockColumn(col.psetName, col.propName);
        });
        
        wrapper.appendChild(label);
        wrapper.appendChild(lockIcon);
        propTh.appendChild(wrapper);
        headerProp.appendChild(propTh);
    }

    // Store column order for rendering
    window.currentColumns = [...lockedCols, ...unlockedCols];

    applyFiltersAndRender();
}

function toggleLockColumn(psetName, propName) {
    const index = lockedColumns.findIndex(lc => lc.psetName === psetName && lc.propName === propName);
    
    if (index !== -1) {
        // Unlock
        lockedColumns.splice(index, 1);
    } else {
        // Lock
        lockedColumns.push({ psetName, propName });
    }
    
    buildTable();
}

function sortByColumn(colName) {
    if (sortColumn === colName) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = colName;
        sortDirection = 'asc';
    }
    applyFiltersAndRender();
}

function sortByProperty(psetName, propName) {
    const key = `${psetName}|||${propName}`;
    if (sortColumn === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = key;
        sortDirection = 'asc';
    }
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    filteredData = [...allData];

    // Apply spatial tree filter first (if active)
    if (window.selectedSpatialIds && window.selectedSpatialIds.size > 0) {
        filteredData = filteredData.filter(item => {
            return item.ifcId && window.selectedSpatialIds.has(item.ifcId);
        });
        console.log(`Spatial filter active: ${filteredData.length} entities match`);
    }

    // Only apply text search if it's not a spatial filter indicator
    if (searchTerm && !searchTerm.startsWith('🌳')) {
        const trimmedSearch = searchTerm.trim();
        
        // Check for column-specific search: "ColumnName /regex/" or "ColumnName text"
        const columnSpecificMatch = trimmedSearch.match(/^(\S+)\s+(.+)$/);
        
        if (columnSpecificMatch) {
            const columnName = columnSpecificMatch[1];
            const searchPattern = columnSpecificMatch[2];
            
            // Check if the search pattern is a regex
            const regexMatch = searchPattern.match(/^\/(.+?)\/([gimuy]*)$/);
            
            if (regexMatch) {
                // Column-specific REGEX search
                try {
                    const pattern = regexMatch[1];
                    const flags = regexMatch[2];
                    const regex = new RegExp(pattern, flags);
                    
                    filteredData = filteredData.filter(item => {
                        // Search in specific column/property
                        // Check if it's a basic field
                        if (columnName === 'GUID' && regex.test(item.guid)) return true;
                        if (columnName === 'Entita' && regex.test(item.entity)) return true;
                        if (columnName === 'Name' && regex.test(item.name)) return true;
                        if (columnName === 'Soubor' && regex.test(item.fileName)) return true;
                        
                        // Check in property sets - support both "PropertyName" and "PsetName.PropertyName"
                        for (let [psetName, pset] of Object.entries(item.propertySets)) {
                            for (let [propName, value] of Object.entries(pset)) {
                                // Match either "PropertyName" or "PsetName.PropertyName"
                                if (propName === columnName || `${psetName}.${propName}` === columnName) {
                                    if (regex.test(String(value))) return true;
                                }
                            }
                        }
                        return false;
                    });
                } catch (e) {
                    console.error('Invalid regex:', e.message);
                    alert('Neplatný regex pattern: ' + e.message);
                }
            } else {
                // Column-specific TEXT search
                const searchLower = searchPattern.toLowerCase();
                
                filteredData = filteredData.filter(item => {
                    // Search in specific column/property
                    if (columnName === 'GUID' && item.guid.toLowerCase().includes(searchLower)) return true;
                    if (columnName === 'Entita' && item.entity.toLowerCase().includes(searchLower)) return true;
                    if (columnName === 'Name' && item.name.toLowerCase().includes(searchLower)) return true;
                    if (columnName === 'Soubor' && item.fileName.toLowerCase().includes(searchLower)) return true;
                    
                    // Check in property sets
                    for (let [psetName, pset] of Object.entries(item.propertySets)) {
                        for (let [propName, value] of Object.entries(pset)) {
                            if (propName === columnName || `${psetName}.${propName}` === columnName) {
                                if (String(value).toLowerCase().includes(searchLower)) return true;
                            }
                        }
                    }
                    return false;
                });
            }
        } else {
            // Global search (all columns)
            // Check if search is a regex pattern (between forward slashes)
            const regexMatch = trimmedSearch.match(/^\/(.+?)\/([gimuy]*)$/);
            
            if (regexMatch) {
                // Global regex search mode
                try {
                    const pattern = regexMatch[1];
                    const flags = regexMatch[2];
                    const regex = new RegExp(pattern, flags);
                    
                    filteredData = filteredData.filter(item => {
                        // Test regex against all fields
                        if (regex.test(item.guid)) return true;
                        if (regex.test(item.entity)) return true;
                        if (regex.test(item.name)) return true;
                        if (regex.test(item.fileName)) return true;
                        
                        // Test in all property sets
                        for (let pset of Object.values(item.propertySets)) {
                            for (let [key, value] of Object.entries(pset)) {
                                if (regex.test(key) || regex.test(String(value))) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                } catch (e) {
                    console.error('Invalid regex:', e.message);
                    alert('Neplatný regex pattern: ' + e.message);
                }
            } else {
                // Normal multi-word search (AND logic)
                const searchWords = trimmedSearch.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                
                filteredData = filteredData.filter(item => {
                    // For each word, check if it's found anywhere in the row
                    return searchWords.every(word => {
                        // Check in basic fields
                        if (item.guid.toLowerCase().includes(word)) return true;
                        if (item.entity.toLowerCase().includes(word)) return true;
                        if (item.name.toLowerCase().includes(word)) return true;
                        if (item.fileName.toLowerCase().includes(word)) return true;
                        
                        // Check in all property sets
                        for (let pset of Object.values(item.propertySets)) {
                            for (let [key, value] of Object.entries(pset)) {
                                if (key.toLowerCase().includes(word) || 
                                    String(value).toLowerCase().includes(word)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                });
            }
        }
    }
    
    if (entityFilterValue) {
        filteredData = filteredData.filter(item => item.entity === entityFilterValue);
    }

    if (fileFilterValue) {
        filteredData = filteredData.filter(item => item.fileName === fileFilterValue);
    }
    
    if (sortColumn) {
        filteredData.sort((a, b) => {
            let valA, valB;
            
            if (sortColumn === 'Soubor') {
                valA = a.fileName;
                valB = b.fileName;
            } else if (sortColumn === 'GUID') {
                valA = a.guid;
                valB = b.guid;
            } else if (sortColumn === 'Entita') {
                valA = a.entity;
                valB = b.entity;
            } else if (sortColumn === 'Name') {
                valA = a.name;
                valB = b.name;
            } else if (sortColumn === 'Layer') {
                valA = a.layer || '';
                valB = b.layer || '';
            } else {
                const [psetName, propName] = sortColumn.split('|||');
                valA = a.propertySets[psetName]?.[propName] || '';
                valB = b.propertySets[psetName]?.[propName] || '';
            }
            
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    // Reset to first page when filters change
    currentPage = 1;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100" style="text-align:center; padding:40px;">Žádná data</td></tr>';
        updatePaginationInfo();
        return;
    }

    // Calculate pagination
    totalPages = pageSize === -1 ? 1 : Math.ceil(filteredData.length / pageSize);
    currentPage = Math.min(currentPage, totalPages); // Ensure current page is valid
    currentPage = Math.max(1, currentPage);
    
    const startIndex = pageSize === -1 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = pageSize === -1 ? filteredData.length : Math.min(startIndex + pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);

    const fileColWidth = 150;

    for (let item of pageData) {
        const row = document.createElement('tr');

        // Checkbox column in edit mode
        if (editMode) {
            const checkCell = document.createElement('td');
            checkCell.classList.add('sticky-col', 'checkbox-cell');
            checkCell.style.left = '0px';
            checkCell.innerHTML = `<input type="checkbox" ${selectedEntities.has(item.guid) ? 'checked' : ''}>`;
            checkCell.querySelector('input').addEventListener('change', () => {
                toggleEntitySelection(item.guid);
                renderTable();
            });
            row.appendChild(checkCell);
        }

        // File badge - always sticky
        const fileInfo = loadedFiles.find(f => f.fileName === item.fileName);
        const fileCell = document.createElement('td');
        fileCell.innerHTML = `<span class="file-badge" style="background: ${fileInfo.color};" title="${item.fileName}">${item.fileName}</span>`;
        fileCell.classList.add('sticky-col');
        fileCell.style.left = editMode ? '40px' : '0px';
        row.appendChild(fileCell);

        let currentLeft = (editMode ? 40 : 0) + fileColWidth;

        // Separate locked and unlocked columns
        const lockedCols = [];
        const unlockedCols = [];
        
        for (let col of window.currentColumns) {
            const isLocked = lockedColumns.some(lc => lc.psetName === col.psetName && lc.propName === col.propName);
            if (isLocked) {
                lockedCols.push(col);
            } else {
                unlockedCols.push(col);
            }
        }

        // Render locked columns first (sticky)
        for (let col of lockedCols) {
            const cell = document.createElement('td');
            const value = item.propertySets[col.psetName]?.[col.propName];
            cell.textContent = value || '-';
            cell.style.color = value ? '#212529' : '#ccc';
            cell.classList.add('sticky-col');
            cell.style.left = currentLeft + 'px';

            // Make editable in edit mode
            if (editMode) {
                cell.classList.add('editable');
                cell.addEventListener('click', () => makeEditable(cell, item.guid, col.psetName, col.propName));
            }

            // Mark as modified if changed
            if (modifications[item.guid]?.[col.psetName]?.[col.propName] !== undefined) {
                cell.classList.add('modified-cell');
            }

            row.appendChild(cell);
            currentLeft += 120;
        }

        // Fixed columns (GUID, Entita, Name, Layer) - not sticky
        const guidCell = document.createElement('td');
        guidCell.className = 'guid-cell';
        guidCell.textContent = item.guid;
        row.appendChild(guidCell);

        const entityCell = document.createElement('td');
        entityCell.innerHTML = `<span class="entity-badge">${item.entity}</span>`;
        row.appendChild(entityCell);

        const nameCell = document.createElement('td');
        nameCell.textContent = item.name;
        row.appendChild(nameCell);

        const layerCell = document.createElement('td');
        layerCell.textContent = item.layer || '-';
        layerCell.style.color = item.layer && item.layer !== '-' ? '#212529' : '#ccc';
        row.appendChild(layerCell);

        // Render unlocked columns (normal)
        for (let col of unlockedCols) {
            const cell = document.createElement('td');
            const value = item.propertySets[col.psetName]?.[col.propName];
            cell.textContent = value || '-';
            cell.style.color = value ? '#212529' : '#ccc';

            // Make editable in edit mode
            if (editMode) {
                cell.classList.add('editable');
                cell.addEventListener('click', () => makeEditable(cell, item.guid, col.psetName, col.propName));
            }

            // Mark as modified if changed
            if (modifications[item.guid]?.[col.psetName]?.[col.propName] !== undefined) {
                cell.classList.add('modified-cell');
            }

            row.appendChild(cell);
        }

        tbody.appendChild(row);
    }
    
    updatePaginationInfo();
}

function updatePaginationInfo() {
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const totalPagesSpan = document.getElementById('totalPages');
    const pageInput = document.getElementById('pageInput');
    
    if (filteredData.length === 0) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    const startIndex = pageSize === -1 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = pageSize === -1 ? filteredData.length : Math.min(startIndex + pageSize, filteredData.length);
    
    paginationInfo.textContent = `Zobrazeno ${startIndex + 1}-${endIndex} z ${filteredData.length} entit`;
    totalPagesSpan.textContent = totalPages;
    pageInput.value = currentPage;
    pageInput.max = totalPages;
    
    // Update button states
    document.getElementById('firstPageBtn').disabled = currentPage === 1;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    document.getElementById('lastPageBtn').disabled = currentPage === totalPages;
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;

    // If user modifies the spatial filter text, clear the spatial filter
    if (!searchTerm.startsWith('🌳')) {
        if (window.selectedSpatialIds) {
            window.selectedSpatialIds = null;
            console.log('Spatial filter cleared by user input');

            // Remove visual indicator
            e.target.classList.remove('spatial-filter-active');

            // Clear tree node highlights
            document.querySelectorAll('.tree-node-header').forEach(header => {
                header.classList.remove('active');
            });
        }
    }

    applyFiltersAndRender();
});

document.getElementById('entityFilter').addEventListener('change', (e) => {
    entityFilterValue = e.target.value;
    applyFiltersAndRender();
});

document.getElementById('fileFilter').addEventListener('change', (e) => {
    fileFilterValue = e.target.value;
    applyFiltersAndRender();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    searchTerm = '';
    entityFilterValue = '';
    fileFilterValue = '';
    sortColumn = null;
    window.selectedSpatialIds = null;  // Clear spatial tree filter

    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    searchInput.classList.remove('spatial-filter-active');  // Remove spatial filter indicator

    document.getElementById('entityFilter').value = '';
    document.getElementById('fileFilter').value = '';

    // Clear active highlight from tree nodes
    document.querySelectorAll('.tree-node-header').forEach(header => {
        header.classList.remove('active');
    });

    applyFiltersAndRender();
});

function showStatistics() {
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = '';

    // Total entities
    const totalCard = document.createElement('div');
    totalCard.style.cssText = 'background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #667eea;';
    totalCard.innerHTML = `
        <div style="font-size: 2em; font-weight: 700; color: #667eea;">${allData.length}</div>
        <div style="font-size: 0.85em; color: #6c757d;">Celkem entit</div>
    `;
    statsGrid.appendChild(totalCard);

    // Per file stats
    loadedFiles.forEach(file => {
        const card = document.createElement('div');
        card.style.cssText = `background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid ${file.color};`;
        card.innerHTML = `
            <div style="font-size: 2em; font-weight: 700; color: ${file.color};">${file.entityCount}</div>
            <div style="font-size: 0.85em; color: #6c757d;">${file.fileName}</div>
        `;
        statsGrid.appendChild(card);
    });

    // Entity type stats
    const entityCounts = {};
    for (let item of allData) {
        entityCounts[item.entity] = (entityCounts[item.entity] || 0) + 1;
    }
    const sorted = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    
    for (let [entity, count] of sorted) {
        const card = document.createElement('div');
        card.style.cssText = 'background: white; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #e9ecef;';
        card.innerHTML = `
            <div style="font-size: 2em; font-weight: 700; color: #667eea;">${count}</div>
            <div style="font-size: 0.85em; color: #6c757d;">${entity}</div>
        `;
        statsGrid.appendChild(card);
    }
}

document.getElementById('exportBtn').addEventListener('click', () => {
    let csv = 'Soubor,GUID,Entita,Name,Layer';
    for (let col of window.currentColumns) {
        csv += ',"' + col.psetName + ' ' + col.propName + '"';
    }
    csv += '\n';

    for (let item of filteredData) {
        const row = ['"' + item.fileName + '"', item.guid, item.entity, '"' + item.name + '"', '"' + (item.layer || '-') + '"'];
        for (let col of window.currentColumns) {
            const val = item.propertySets[col.psetName]?.[col.propName] || '';
            row.push('"' + val + '"');
        }
        csv += row.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ifc-multi-export.csv';
    link.click();
});

// Pagination event listeners
document.getElementById('firstPageBtn').addEventListener('click', () => {
    currentPage = 1;
    renderTable();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

document.getElementById('lastPageBtn').addEventListener('click', () => {
    currentPage = totalPages;
    renderTable();
});

document.getElementById('goToPageBtn').addEventListener('click', () => {
    const pageInput = document.getElementById('pageInput');
    const page = parseInt(pageInput.value);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTable();
    } else {
        alert(`Zadejte stránku mezi 1 a ${totalPages}`);
        pageInput.value = currentPage;
    }
});

document.getElementById('pageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('goToPageBtn').click();
    }
});

// Synchronize both page size selectors (top and bottom)
document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value);
    document.getElementById('pageSizeSelectTop').value = e.target.value; // Sync top selector
    currentPage = 1; // Reset to first page when changing page size
    renderTable();
});

document.getElementById('pageSizeSelectTop').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value);
    document.getElementById('pageSizeSelect').value = e.target.value; // Sync bottom selector
    currentPage = 1; // Reset to first page when changing page size
    renderTable();
});

// ============================================
// EDIT MODE FUNCTIONS
// ============================================

document.getElementById('toggleEditModeBtn').addEventListener('click', () => {
    editMode = !editMode;
    const btn = document.getElementById('toggleEditModeBtn');
    const editPanel = document.getElementById('editPanel');

    if (editMode) {
        btn.textContent = '👁️ Režim zobrazení';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-warning');
        editPanel.classList.add('active');
        document.body.classList.add('edit-mode');
    } else {
        btn.textContent = '✏️ Editační režim';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-primary');
        editPanel.classList.remove('active');
        document.body.classList.remove('edit-mode');
        selectedEntities.clear();
    }

    buildTable();
});

function updateSelectedCount() {
    const count = selectedEntities.size;
    const totalFiltered = filteredData.length;

    console.log('Selected entities count:', count);
    document.getElementById('selectedCount').textContent = count;

    // Show total filtered count
    const totalFilteredSpan = document.getElementById('totalFilteredCount');
    if (totalFilteredSpan) {
        if (totalFiltered > 0) {
            totalFilteredSpan.textContent = `(z ${totalFiltered} celkem)`;
        } else {
            totalFilteredSpan.textContent = '';
        }
    }

    const bulkBtn = document.getElementById('bulkEditBtn');
    const addBtn = document.getElementById('addPsetBtn');
    const renameBtn = document.getElementById('renamePsetBtn');
    const renamePropBtn = document.getElementById('renamePropertyBtn');
    const exportBtn = document.getElementById('exportIfcBtn');

    if (bulkBtn) bulkBtn.disabled = count === 0;
    if (addBtn) addBtn.disabled = count === 0;
    if (renameBtn) renameBtn.disabled = count === 0;
    if (renamePropBtn) renamePropBtn.disabled = count === 0;
    if (exportBtn) exportBtn.disabled = Object.keys(modifications).length === 0;

    console.log('Bulk Edit Button disabled:', bulkBtn ? bulkBtn.disabled : 'not found');
}

document.getElementById('selectAllVisibleBtn').addEventListener('click', () => {
    if (!editMode) {
        alert('Nejprve zapněte Editační režim!');
        return;
    }
    const startIndex = pageSize === -1 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = pageSize === -1 ? filteredData.length : Math.min(startIndex + pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    pageData.forEach(item => selectedEntities.add(item.guid));
    updateSelectedCount();
    renderTable();
});

document.getElementById('selectAllPagesBtn').addEventListener('click', () => {
    console.log('=== SELECT ALL PAGES CLICKED ===');
    console.log('Edit mode:', editMode);
    console.log('Filtered data length:', filteredData.length);
    console.log('Selected entities before:', selectedEntities.size);

    if (!editMode) {
        alert('Nejprve zapněte Editační režim!');
        return;
    }

    const totalCount = filteredData.length;

    if (totalCount === 0) {
        alert('Žádné entity k výběru. Zkontrolujte filtry.');
        return;
    }

    // Warning if selecting a lot of entities
    if (totalCount > 1000) {
        const confirmed = confirm(
            `Opravdu chcete vybrat všech ${totalCount} entit?\n\n` +
            `To může trvat déle a může zpomalit prohlížeč.`
        );
        if (!confirmed) return;
    }

    // Select all filtered entities
    console.log(`Selecting all ${totalCount} entities across all pages`);
    let addedCount = 0;
    filteredData.forEach(item => {
        if (item && item.guid) {
            selectedEntities.add(item.guid);
            addedCount++;
        } else {
            console.warn('Invalid item:', item);
        }
    });

    console.log('Selected entities after:', selectedEntities.size);
    console.log('Added:', addedCount);

    updateSelectedCount();
    renderTable();

    // Show success message
    const message = document.createElement('div');
    message.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-weight: 600;';
    message.textContent = `✓ Vybráno všech ${totalCount} entit`;
    document.body.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 3000);
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
    selectedEntities.clear();
    updateSelectedCount();
    renderTable();
});

function toggleEntitySelection(guid) {
    if (selectedEntities.has(guid)) {
        selectedEntities.delete(guid);
    } else {
        selectedEntities.add(guid);
    }
    updateSelectedCount();
}

function makeEditable(cell, guid, psetName, propName) {
    if (!editMode || editingCell === cell) return;

    editingCell = cell;
    const currentValue = cell.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-editor';
    input.value = currentValue === '-' ? '' : currentValue;

    input.addEventListener('blur', () => {
        saveCell(input, cell, guid, psetName, propName);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveCell(input, cell, guid, psetName, propName);
        } else if (e.key === 'Escape') {
            cell.textContent = currentValue;
            editingCell = null;
        }
    });

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
}

function saveCell(input, cell, guid, psetName, propName) {
    const newValue = input.value.trim();
    const entity = allData.find(e => e.guid === guid);

    if (!entity) {
        editingCell = null;
        return;
    }

    // Initialize modification structure
    if (!modifications[guid]) {
        modifications[guid] = {};
    }
    if (!modifications[guid][psetName]) {
        modifications[guid][psetName] = {};
    }

    // Save modification
    modifications[guid][psetName][propName] = newValue;

    // Update entity data
    if (!entity.propertySets[psetName]) {
        entity.propertySets[psetName] = {};
    }
    entity.propertySets[psetName][propName] = newValue;

    // Update cell display
    cell.textContent = newValue || '-';
    cell.style.color = newValue ? '#212529' : '#ccc';
    cell.classList.add('modified-cell');

    editingCell = null;
    updateSelectedCount();
}

// Bulk Edit Modal
document.getElementById('bulkEditBtn').addEventListener('click', () => {
    console.log('Bulk Edit Button clicked!');
    console.log('Selected entities:', Array.from(selectedEntities));
    console.log('PropertySet order:', psetOrder);

    const modal = document.getElementById('bulkEditModal');
    const psetSelect = document.getElementById('bulkPsetName');
    const propSelect = document.getElementById('bulkPropName');

    // Populate PropertySet dropdown
    psetSelect.innerHTML = '<option value="">-- Vyberte PropertySet --</option>';
    for (let psetName of psetOrder) {
        if (propertySetGroups[psetName]) {
            psetSelect.innerHTML += `<option value="${psetName}">${psetName}</option>`;
        }
    }

    console.log('PropertySets in dropdown:', psetOrder.length);

    document.getElementById('bulkEditCount').textContent = selectedEntities.size;
    modal.classList.add('active');
    console.log('Modal should be visible now');
});

document.getElementById('bulkPsetName').addEventListener('change', (e) => {
    const psetName = e.target.value;
    const propSelect = document.getElementById('bulkPropName');
    const currentValuesSection = document.getElementById('currentValuesSection');

    // Hide current values when changing PropertySet
    currentValuesSection.style.display = 'none';

    if (!psetName) {
        propSelect.disabled = true;
        propSelect.innerHTML = '<option value="">-- Nejprve vyberte PropertySet --</option>';
        return;
    }

    propSelect.disabled = false;
    propSelect.innerHTML = '<option value="">-- Vyberte Property --</option>';

    if (propertySetGroups[psetName]) {
        for (let propName of propertySetGroups[psetName]) {
            propSelect.innerHTML += `<option value="${propName}">${propName}</option>`;
        }
    }
});

document.getElementById('bulkPropName').addEventListener('change', (e) => {
    const psetName = document.getElementById('bulkPsetName').value;
    const propName = e.target.value;
    const currentValuesSection = document.getElementById('currentValuesSection');
    const currentValuesList = document.getElementById('currentValuesList');

    if (!psetName || !propName) {
        currentValuesSection.style.display = 'none';
        return;
    }

    // Collect current values from selected entities
    const valueCount = {};
    let emptyCount = 0;

    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (!entity) continue;

        const value = entity.propertySets[psetName]?.[propName];
        if (value) {
            valueCount[value] = (valueCount[value] || 0) + 1;
        } else {
            emptyCount++;
        }
    }

    // Display values
    let html = '';
    const uniqueValues = Object.keys(valueCount);

    if (uniqueValues.length > 0) {
        html += '<div style="display: grid; gap: 8px;">';
        uniqueValues.sort().forEach(value => {
            const count = valueCount[value];
            const percentage = Math.round((count / selectedEntities.size) * 100);
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border-radius: 6px; border: 1px solid #dee2e6;">
                    <span style="font-weight: 600; color: #667eea; flex: 1;">${escapeHtml(value)}</span>
                    <span style="color: #6c757d; font-size: 0.9em; margin-left: 10px;">${count}× (${percentage}%)</span>
                    <button onclick="document.getElementById('bulkValue').value = '${escapeHtml(value).replace(/'/g, "\\'")}';"
                            style="margin-left: 10px; padding: 4px 10px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        Použít
                    </button>
                </div>
            `;
        });
        html += '</div>';
    }

    if (emptyCount > 0) {
        const percentage = Math.round((emptyCount / selectedEntities.size) * 100);
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffc107; margin-top: 8px;">
                <span style="font-style: italic; color: #856404;">Prázdné / neexistuje</span>
                <span style="color: #856404; font-size: 0.9em;">${emptyCount}× (${percentage}%)</span>
            </div>
        `;
    }

    if (uniqueValues.length === 0 && emptyCount === 0) {
        html = '<p style="color: #6c757d; font-style: italic;">Žádné hodnoty nenalezeny</p>';
    }

    currentValuesList.innerHTML = html;
    currentValuesSection.style.display = 'block';
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeBulkEditModal() {
    document.getElementById('bulkEditModal').classList.remove('active');
    document.getElementById('currentValuesSection').style.display = 'none';
    document.getElementById('bulkValue').value = '';
    document.getElementById('bulkPsetName').value = '';
    document.getElementById('bulkPropName').value = '';
    document.getElementById('bulkPropName').disabled = true;
}

function applyBulkEdit() {
    const psetName = document.getElementById('bulkPsetName').value;
    const propName = document.getElementById('bulkPropName').value;
    const value = document.getElementById('bulkValue').value.trim();

    if (!psetName || !propName) {
        alert('Vyberte PropertySet a Property');
        return;
    }

    // Apply to all selected entities
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (!entity) continue;

        // Initialize modification structure
        if (!modifications[guid]) {
            modifications[guid] = {};
        }
        if (!modifications[guid][psetName]) {
            modifications[guid][psetName] = {};
        }

        // Save modification
        modifications[guid][psetName][propName] = value;

        // Update entity data
        if (!entity.propertySets[psetName]) {
            entity.propertySets[psetName] = {};
        }
        entity.propertySets[psetName][propName] = value;
    }

    closeBulkEditModal();
    renderTable();
    updateSelectedCount();

    alert(`Hodnota "${value}" byla nastavena pro ${selectedEntities.size} entit v ${psetName}.${propName}`);
}

// Add PSet Modal
document.getElementById('addPsetBtn').addEventListener('click', () => {
    const modal = document.getElementById('addPsetModal');
    document.getElementById('addPsetCount').textContent = selectedEntities.size;
    modal.classList.add('active');
});

function closeAddPsetModal() {
    document.getElementById('addPsetModal').classList.remove('active');
    document.getElementById('newPsetName').value = '';
    document.getElementById('newPropName').value = '';
    document.getElementById('newPropValue').value = '';
}

// Rename PropertySet Modal
document.getElementById('renamePsetBtn').addEventListener('click', () => {
    const modal = document.getElementById('renamePsetModal');
    const dropdown = document.getElementById('oldPsetName');

    // Collect all unique PropertySets from selected entities
    const allPsets = new Set();
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (entity && entity.propertySets) {
            Object.keys(entity.propertySets).forEach(pset => allPsets.add(pset));
        }
    }

    // Populate dropdown
    dropdown.innerHTML = '<option value="">-- Vyberte PropertySet --</option>';
    Array.from(allPsets).sort().forEach(pset => {
        const option = document.createElement('option');
        option.value = pset;
        option.textContent = pset;
        dropdown.appendChild(option);
    });

    document.getElementById('renamePsetCount').textContent = selectedEntities.size;
    modal.classList.add('active');
});

function closeRenamePsetModal() {
    document.getElementById('renamePsetModal').classList.remove('active');
    document.getElementById('oldPsetName').value = '';
    document.getElementById('newPsetNameRename').value = '';
}

function applyPsetRename() {
    const oldName = document.getElementById('oldPsetName').value.trim();
    const newName = document.getElementById('newPsetNameRename').value.trim();

    if (!oldName) {
        ErrorHandler.error('Vyberte PropertySet k přejmenování');
        return;
    }

    if (!newName) {
        ErrorHandler.error('Zadejte nový název PropertySetu');
        return;
    }

    if (oldName === newName) {
        ErrorHandler.warning('Nový název je stejný jako starý');
        return;
    }

    // Apply rename to all selected entities
    let count = 0;
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (!entity || !entity.propertySets[oldName]) continue;

        // Initialize modification structure
        if (!modifications[guid]) {
            modifications[guid] = {};
        }
        if (!modifications[guid].renamedPsets) {
            modifications[guid].renamedPsets = {};
        }

        modifications[guid].renamedPsets[oldName] = newName;
        count++;
    }

    closeRenamePsetModal();
    updateSelectedCount();
    ErrorHandler.success(`PropertySet "${oldName}" bude přejmenován na "${newName}" u ${count} entit při exportu`);
}

// Rename Property Modal
document.getElementById('renamePropertyBtn').addEventListener('click', () => {
    const modal = document.getElementById('renamePropertyModal');
    const psetDropdown = document.getElementById('renamePropPsetName');

    // Collect all unique PropertySets from selected entities
    const allPsets = new Set();
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (entity && entity.propertySets) {
            Object.keys(entity.propertySets).forEach(pset => allPsets.add(pset));
        }
    }

    // Populate PropertySet dropdown
    psetDropdown.innerHTML = '<option value="">-- Vyberte PropertySet --</option>';
    Array.from(allPsets).sort().forEach(pset => {
        const option = document.createElement('option');
        option.value = pset;
        option.textContent = pset;
        psetDropdown.appendChild(option);
    });

    // Reset property dropdown
    document.getElementById('oldPropertyName').disabled = true;
    document.getElementById('oldPropertyName').innerHTML = '<option value="">-- Nejprve vyberte PropertySet --</option>';
    document.getElementById('newPropertyName').value = '';

    document.getElementById('renamePropertyCount').textContent = selectedEntities.size;
    modal.classList.add('active');
});

function closeRenamePropertyModal() {
    document.getElementById('renamePropertyModal').classList.remove('active');
    document.getElementById('renamePropPsetName').value = '';
    document.getElementById('oldPropertyName').value = '';
    document.getElementById('oldPropertyName').disabled = true;
    document.getElementById('newPropertyName').value = '';
}

function updatePropertyDropdown() {
    const psetName = document.getElementById('renamePropPsetName').value;
    const propDropdown = document.getElementById('oldPropertyName');

    if (!psetName) {
        propDropdown.disabled = true;
        propDropdown.innerHTML = '<option value="">-- Nejprve vyberte PropertySet --</option>';
        return;
    }

    // Collect all unique properties from selected entities for this PropertySet
    const allProperties = new Set();
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (entity && entity.propertySets && entity.propertySets[psetName]) {
            Object.keys(entity.propertySets[psetName]).forEach(prop => allProperties.add(prop));
        }
    }

    // Populate property dropdown
    propDropdown.innerHTML = '<option value="">-- Vyberte Property --</option>';
    Array.from(allProperties).sort().forEach(prop => {
        const option = document.createElement('option');
        option.value = prop;
        option.textContent = prop;
        propDropdown.appendChild(option);
    });

    propDropdown.disabled = false;
}

function applyPropertyRename() {
    const psetName = document.getElementById('renamePropPsetName').value.trim();
    const oldPropName = document.getElementById('oldPropertyName').value.trim();
    const newPropName = document.getElementById('newPropertyName').value.trim();

    if (!psetName) {
        ErrorHandler.error('Vyberte PropertySet');
        return;
    }

    if (!oldPropName) {
        ErrorHandler.error('Vyberte Property k přejmenování');
        return;
    }

    if (!newPropName) {
        ErrorHandler.error('Zadejte nový název Property');
        return;
    }

    if (oldPropName === newPropName) {
        ErrorHandler.warning('Nový název je stejný jako starý');
        return;
    }

    // Apply rename to all selected entities
    let count = 0;
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (!entity || !entity.propertySets[psetName] || !entity.propertySets[psetName][oldPropName]) continue;

        // Initialize modification structure
        if (!modifications[guid]) {
            modifications[guid] = {};
        }
        if (!modifications[guid].renamedProperties) {
            modifications[guid].renamedProperties = {};
        }
        if (!modifications[guid].renamedProperties[psetName]) {
            modifications[guid].renamedProperties[psetName] = {};
        }

        modifications[guid].renamedProperties[psetName][oldPropName] = newPropName;
        count++;
    }

    closeRenamePropertyModal();
    updateSelectedCount();
    ErrorHandler.success(`Property "${oldPropName}" v PropertySetu "${psetName}" bude přejmenována na "${newPropName}" u ${count} entit při exportu`);
}

function applyAddPset() {
    const psetName = document.getElementById('newPsetName').value.trim();
    const propName = document.getElementById('newPropName').value.trim();
    const value = document.getElementById('newPropValue').value.trim();

    if (!psetName || !propName) {
        alert('Vyplňte název PropertySetu a Property');
        return;
    }

    // Add new PropertySet/Property to structure if it doesn't exist
    if (!propertySetGroups[psetName]) {
        propertySetGroups[psetName] = [];
        psetOrder.push(psetName);
        visiblePsets[psetName] = {};
    }

    if (!propertySetGroups[psetName].includes(propName)) {
        propertySetGroups[psetName].push(propName);
        visiblePsets[psetName][propName] = true;
    }

    // Apply to all selected entities
    for (let guid of selectedEntities) {
        const entity = allData.find(e => e.guid === guid);
        if (!entity) continue;

        // Initialize modification structure
        if (!modifications[guid]) {
            modifications[guid] = {};
        }
        if (!modifications[guid][psetName]) {
            modifications[guid][psetName] = {};
        }

        // Save modification
        modifications[guid][psetName][propName] = value;

        // Update entity data
        if (!entity.propertySets[psetName]) {
            entity.propertySets[psetName] = {};
        }
        entity.propertySets[psetName][propName] = value;
    }

    closeAddPsetModal();
    buildTable(); // Rebuild table to include new columns
    updateSelectedCount();

    alert(`PropertySet "${psetName}" s property "${propName}" byl přidán k ${selectedEntities.size} entitám`);
}

// Export modified IFC
document.getElementById('exportIfcBtn').addEventListener('click', () => {
    if (Object.keys(modifications).length === 0) {
        alert('Žádné změny k uložení');
        return;
    }

    console.log('Starting IFC export with modifications...');
    console.log('Modified entities:', Object.keys(modifications).length);
    console.log('Modifications:', modifications);

    if (loadedFiles.length === 0) {
        alert('Nejsou načtené žádné IFC soubory');
        return;
    }

    // Ask which file to export (if multiple files loaded)
    let fileToExport;
    if (loadedFiles.length === 1) {
        fileToExport = loadedFiles[0];
    } else {
        // Show dialog to select file
        const fileNames = loadedFiles.map((f, i) => `${i + 1}. ${f.fileName}`).join('\n');
        const choice = prompt(
            `Vyberte soubor pro export (zadejte číslo 1-${loadedFiles.length}):\n\n${fileNames}`
        );
        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= loadedFiles.length) {
            alert('Neplatný výběr');
            return;
        }
        fileToExport = loadedFiles[index];
    }

    console.log('Exporting file:', fileToExport.fileName);

    // Load original content from IndexedDB and start export
    exportModifiedIFC(fileToExport);
});

async function exportModifiedIFC(fileInfo) {
    try {
        // Retrieve original content from IndexedDB
        const ifcContent = await getIFCContent(fileInfo.fileName);

        if (!ifcContent) {
            ErrorHandler.error('Původní obsah IFC souboru není dostupný v cache. Nahrajte soubor znovu.');
            return;
        }

        const modifiedIfc = applyModificationsToIFC(ifcContent, modifications, fileInfo.fileName);

        if (!modifiedIfc) {
            console.error('Export cancelled due to data integrity check failure');
            return;
        }

        downloadModifiedIFC(modifiedIfc, fileInfo.fileName);
    } catch (error) {
        console.error('Export error:', error);
        alert('Chyba při exportu: ' + error.message);
    }
}

function applyModificationsToIFC(ifcContent, modifications, fileName) {
    console.log('=== APPLYING MODIFICATIONS TO IFC ===');
    console.log('Original IFC content length:', ifcContent.length, 'characters');

    const lines = ifcContent.split('\n');
    console.log('Total lines in IFC:', lines.length);
    let modifiedLines = [...lines];
    console.log('Copied lines for modification:', modifiedLines.length);

    // Build a map of entity IDs to line numbers
    const entityMap = new Map();
    const propertySetMap = new Map();
    const propertySingleValueMap = new Map();
    const elementQuantityMap = new Map();
    const relDefinesMap = new Map();
    let maxEntityId = 0;

    lines.forEach((originalLine, lineIndex) => {
        // Trim line for parsing but keep original in modifiedLines
        const line = originalLine.trim();
        if (!line || !line.startsWith('#')) return;

        // More flexible regex that handles multiline and various formats
        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
        if (!match) {
            // Debug: log lines that don't match
            if (lineIndex < 100 && line.includes('IFCPROPERTY')) {
                console.log(`Line ${lineIndex} doesn't match regex:`, line.substring(0, 80));
            }
            return;
        }

        const [, id, entityType, params] = match;
        const numId = parseInt(id);
        if (numId > maxEntityId) maxEntityId = numId;

        entityMap.set(id, { lineIndex, type: entityType, params, line: originalLine });

        // Property sets and quantities
        if (entityType === 'IFCPROPERTYSET' || entityType === 'IFCELEMENTQUANTITY') {
            propertySetMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCPROPERTYSINGLEVALUE' ||
                   entityType.startsWith('IFCQUANTITY')) {
            propertySingleValueMap.set(id, { lineIndex, params, line: originalLine, type: entityType });
        } else if (entityType === 'IFCRELDEFINESBYPROPERTIES') {
            relDefinesMap.set(id, { lineIndex, params, line: originalLine });
        }
    });

    console.log('Max entity ID found:', maxEntityId);

    console.log('Found entities:', entityMap.size);
    console.log('Found property sets:', propertySetMap.size);
    console.log('Found property single values:', propertySingleValueMap.size);

    // Debug: List all PropertySet names found
    console.log('PropertySets found in IFC:');
    for (const [psetId, psetInfo] of propertySetMap) {
        const quotedStrings = [];
        const regex = /'([^']*(?:\\'[^']*)*)'/g;
        let match;
        while ((match = regex.exec(psetInfo.params)) !== null) {
            quotedStrings.push(match[1]);
        }
        // PropertySet name is at index 1
        let foundPsetName = quotedStrings.length > 1 ? quotedStrings[1] : 'UNKNOWN';
        console.log(`  #${psetId}: "${foundPsetName}" - Type: ${psetInfo.type} - Line: ${psetInfo.line.substring(0, 100)}...`);
    }

    // Find GUID to entity ID mapping
    const guidToEntityId = new Map();
    entityMap.forEach((entity, id) => {
        if (entity.type.startsWith('IFC') && !entity.type.includes('REL') && !entity.type.includes('PROPERTY')) {
            const guidMatch = entity.params.match(/'([^']+)'/);
            if (guidMatch) {
                guidToEntityId.set(guidMatch[1], id);
            }
        }
    });

    console.log('GUID to Entity ID mappings:', guidToEntityId.size);

    // Apply modifications
    let modificationCount = 0;
    let createdCount = 0;
    const newEntities = []; // New lines to add before ENDSEC

    for (const [guid, psetModifications] of Object.entries(modifications)) {
        // Filter modifications only for this file
        const entity = allData.find(e => e.guid === guid && e.fileName === fileName);
        if (!entity) continue;

        const entityId = guidToEntityId.get(guid);
        if (!entityId) {
            console.log(`Entity GUID ${guid} not found in IFC`);
            continue;
        }

        console.log(`Processing entity GUID: ${guid} (ID: #${entityId})`);

        // Handle PropertySet renames first
        if (psetModifications.renamedPsets) {
            console.log('  Processing PropertySet renames...');

            for (const [oldPsetName, newPsetName] of Object.entries(psetModifications.renamedPsets)) {
                console.log(`    Renaming PropertySet: "${oldPsetName}" -> "${newPsetName}"`);

                // Find all PropertySets with this name for this entity
                for (const [psetId, psetInfo] of propertySetMap) {
                    // Extract all quoted strings from the params
                    const quotedStrings = [];
                    const regex = /'([^']*(?:\\'[^']*)*)'/g;
                    let match;
                    while ((match = regex.exec(psetInfo.params)) !== null) {
                        quotedStrings.push(match[1]);
                    }

                    // PropertySet name is the second quoted string (index 1)
                    // Format: IFCPROPERTYSET('GUID',#owner,'Name','Description',(props))
                    let foundPsetName = quotedStrings.length > 1 ? quotedStrings[1] : null;

                    if (foundPsetName !== oldPsetName) continue;

                    // Check if this PropertySet belongs to our entity
                    // We need to check IFCRELDEFINESBYPROPERTIES to verify relationship
                    let belongsToEntity = false;
                    for (const [relId, relInfo] of relDefinesMap) {
                        // Check if relationship references this PropertySet
                        if (relInfo.params.includes(`#${psetId}`)) {
                            // Check if relationship references our entity
                            if (relInfo.params.includes(`#${entityId}`)) {
                                belongsToEntity = true;
                                break;
                            }
                        }
                    }

                    if (!belongsToEntity) continue;

                    console.log(`      ✓ Found PropertySet #${psetId} for entity #${entityId}`);

                    // Replace the PropertySet name in the line
                    const oldLine = modifiedLines[psetInfo.lineIndex];

                    // Build regex to match the second quoted string (the name)
                    // This is safer than string replacement since names might appear multiple times
                    const nameRegex = /(IFCPROPERTYSET\s*\(\s*'[^']*'\s*,\s*[^,]+\s*,\s*)'([^']*)'/i;
                    const newLine = oldLine.replace(nameRegex, `$1'${newPsetName}'`);

                    if (newLine !== oldLine) {
                        modifiedLines[psetInfo.lineIndex] = newLine;
                        modificationCount++;
                        console.log(`      ✓ Renamed PropertySet in line ${psetInfo.lineIndex}`);
                    } else {
                        console.log(`      ⚠ Failed to rename PropertySet in line ${psetInfo.lineIndex}`);
                    }
                }
            }
        }

        // Handle Property renames
        if (psetModifications.renamedProperties) {
            console.log('  Processing Property renames...');

            for (const [psetName, propertyRenames] of Object.entries(psetModifications.renamedProperties)) {
                console.log(`    In PropertySet: "${psetName}"`);

                // Find the PropertySet for this entity
                for (const [psetId, psetInfo] of propertySetMap) {
                    // Extract all quoted strings from the params
                    const quotedStrings = [];
                    const regex = /'([^']*(?:\\'[^']*)*)'/g;
                    let match;
                    while ((match = regex.exec(psetInfo.params)) !== null) {
                        quotedStrings.push(match[1]);
                    }

                    // PropertySet name is the second quoted string (index 1)
                    let foundPsetName = quotedStrings.length > 1 ? quotedStrings[1] : null;
                    if (foundPsetName !== psetName) continue;

                    // Check if this PropertySet belongs to our entity
                    let belongsToEntity = false;
                    for (const [relId, relInfo] of relDefinesMap) {
                        if (relInfo.params.includes(`#${psetId}`) && relInfo.params.includes(`#${entityId}`)) {
                            belongsToEntity = true;
                            break;
                        }
                    }

                    if (!belongsToEntity) continue;

                    console.log(`      ✓ Found PropertySet #${psetId} for entity #${entityId}`);

                    // Get property references from PropertySet
                    // Format: IFCPROPERTYSET(...,(#123,#124,#125))
                    const propertyRefs = psetInfo.params.match(/#\d+/g);
                    if (!propertyRefs) continue;

                    // Process each property rename
                    for (const [oldPropName, newPropName] of Object.entries(propertyRenames)) {
                        console.log(`        Renaming Property: "${oldPropName}" -> "${newPropName}"`);

                        // Find the IFCPROPERTYSINGLEVALUE with this name
                        for (const propRef of propertyRefs) {
                            const propId = propRef.substring(1);
                            const propInfo = propertySingleValueMap.get(propId);

                            if (!propInfo) continue;

                            // Extract property name (first quoted string)
                            // Format: IFCPROPERTYSINGLEVALUE('Name','Description',value,unit)
                            const propQuotedStrings = [];
                            const propRegex = /'([^']*(?:\\'[^']*)*)'/g;
                            let propMatch;
                            while ((propMatch = propRegex.exec(propInfo.params)) !== null) {
                                propQuotedStrings.push(propMatch[1]);
                            }

                            const foundPropName = propQuotedStrings.length > 0 ? propQuotedStrings[0] : null;
                            if (foundPropName !== oldPropName) continue;

                            console.log(`          ✓ Found Property #${propId}`);

                            // Replace the property name in the line
                            const oldLine = modifiedLines[propInfo.lineIndex];

                            // Build regex to match the first quoted string (the name)
                            const propNameRegex = /(IFCPROPERTYSINGLEVALUE\s*\(\s*)'([^']*)'/i;
                            const newLine = oldLine.replace(propNameRegex, `$1'${newPropName}'`);

                            if (newLine !== oldLine) {
                                modifiedLines[propInfo.lineIndex] = newLine;
                                modificationCount++;
                                console.log(`          ✓ Renamed Property in line ${propInfo.lineIndex}`);
                            } else {
                                console.log(`          ⚠ Failed to rename Property in line ${propInfo.lineIndex}`);
                            }
                        }
                    }
                }
            }
        }

        for (const [psetName, propModifications] of Object.entries(psetModifications)) {
            // Skip the renamedPsets and renamedProperties objects
            if (psetName === 'renamedPsets' || psetName === 'renamedProperties') continue;

            console.log(`  PropertySet: ${psetName}`);

            // Try to update existing properties
            const existingUpdates = {};
            const newProperties = {};

            for (const [propName, newValue] of Object.entries(propModifications)) {
                console.log(`    Property: ${propName} = ${newValue}`);

                // Find the property in IFC and update it
                const updated = updatePropertyInIFC(
                    modifiedLines,
                    entityMap,
                    propertySetMap,
                    propertySingleValueMap,
                    psetName,
                    propName,
                    newValue
                );

                if (updated) {
                    modificationCount++;
                    existingUpdates[propName] = newValue;
                    console.log(`      ✓ Updated existing property`);
                } else {
                    newProperties[propName] = newValue;
                    console.log(`      ⚠ Property not found - will create new`);
                }
            }

            // If there are new properties, create PropertySet with all properties
            if (Object.keys(newProperties).length > 0) {
                console.log(`    Creating new PropertySet "${psetName}" with ${Object.keys(newProperties).length} properties`);

                // Create property single values
                const propertyIds = [];
                for (const [propName, value] of Object.entries(newProperties)) {
                    maxEntityId++;
                    const propLine = createPropertySingleValue(maxEntityId, propName, value);
                    newEntities.push(propLine);
                    propertyIds.push(maxEntityId);
                    console.log(`      Created property #${maxEntityId}: ${propName}`);
                }

                // Create PropertySet
                maxEntityId++;
                const psetId = maxEntityId;
                const psetGuid = generateGUID();
                const psetLine = createPropertySet(psetId, psetGuid, psetName, propertyIds);
                newEntities.push(psetLine);
                console.log(`      Created PropertySet #${psetId}: ${psetName}`);

                // Create or update IFCRELDEFINESBYPROPERTIES
                maxEntityId++;
                const relGuid = generateGUID();
                const relLine = createRelDefinesByProperties(maxEntityId, relGuid, [entityId], psetId);
                newEntities.push(relLine);
                console.log(`      Created relationship #${maxEntityId}: entity #${entityId} -> PSet #${psetId}`);

                createdCount += Object.keys(newProperties).length;
            }
        }
    }

    console.log(`Total modifications applied: ${modificationCount}`);
    console.log(`Total new properties created: ${createdCount}`);
    console.log(`New entities to insert: ${newEntities.length}`);

    // Insert new entities before ENDSEC (end of DATA section)
    if (newEntities.length > 0) {
        // Find the last ENDSEC (which closes the DATA section)
        let endsecIndex = -1;
        for (let i = modifiedLines.length - 1; i >= 0; i--) {
            if (modifiedLines[i].trim() === 'ENDSEC;') {
                endsecIndex = i;
                break;
            }
        }

        if (endsecIndex !== -1) {
            console.log(`Found ENDSEC at line ${endsecIndex}, inserting ${newEntities.length} new entities`);
            // Insert new entities before ENDSEC
            modifiedLines.splice(endsecIndex, 0, ...newEntities);
            console.log(`New entities inserted. Total lines now: ${modifiedLines.length}`);
        } else {
            console.error('ERROR: ENDSEC not found in IFC file!');
            alert('Chyba: Nelze najít ENDSEC v IFC souboru. Export byl zrušen.');
            return null;
        }
    }

    // Verify line count before joining
    console.log('Lines before join:', modifiedLines.length);
    const result = modifiedLines.join('\n');
    console.log('Result length after join:', result.length, 'characters');

    // Verify by counting newlines
    const resultLineCount = (result.match(/\n/g) || []).length + 1;
    console.log('Result line count:', resultLineCount);

    // Adjust validation to account for new entities
    const expectedMinLines = lines.length * 0.9;
    if (resultLineCount < expectedMinLines && newEntities.length === 0) {
        console.error('WARNING: Significant line loss detected!');
        console.error(`Original lines: ${lines.length}, Result lines: ${resultLineCount}`);
        alert(`VAROVÁNÍ: Při exportu došlo ke ztrátě dat!\nPůvodní řádky: ${lines.length}\nVýsledné řádky: ${resultLineCount}\n\nExport byl zrušen pro bezpečnost.`);
        return null;
    }

    console.log(`✓ Export successful: ${modificationCount} modifications, ${createdCount} new properties`);
    return result;
}

function updatePropertyInIFC(lines, entityMap, propertySetMap, propertySingleValueMap, psetName, propName, newValue) {
    console.log(`    Searching for ALL PSets: "${psetName}", Property: "${propName}"`);

    let updatedCount = 0;

    // Find ALL PropertySets with this name (there can be multiple!)
    for (const [psetId, psetInfo] of propertySetMap) {
        // Extract all quoted strings from the params
        const quotedStrings = [];
        const regex = /'([^']*(?:\\'[^']*)*)'/g;
        let match;
        while ((match = regex.exec(psetInfo.params)) !== null) {
            quotedStrings.push(match[1]);
        }

        // PropertySet name is the second quoted string (index 1)
        // Format: IFCPROPERTYSET('GUID',#owner,'Name','Description',(props))
        let foundPsetName = null;
        if (quotedStrings.length > 1) {
            foundPsetName = quotedStrings[1];
        } else if (quotedStrings.length > 0) {
            // Fallback: try to find first non-GUID string
            for (let i = 0; i < quotedStrings.length; i++) {
                const str = quotedStrings[i];
                // Skip if looks like GUID (contains $ or is very long with weird chars)
                if (str && str.length > 0 && !str.includes('$') && str.length < 50) {
                    foundPsetName = str;
                    break;
                }
            }
        }

        if (foundPsetName !== psetName) continue;

        console.log(`      ✓ Found matching PropertySet #${psetId}!`);

        // Found the PropertySet, now find properties in it
        // Extract all references to property IDs (the list in parentheses at the end)
        const propIdsMatch = psetInfo.params.match(/\(([#\d,\s]+)\)[^)]*$/);
        if (!propIdsMatch) {
            console.log(`      ✗ No property IDs found in this PSet`);
            continue;
        }

        const propIds = propIdsMatch[1].match(/#\d+/g);
        if (!propIds) {
            console.log(`      ✗ Could not parse property IDs`);
            continue;
        }

        console.log(`      Found ${propIds.length} properties in this PSet`);

        // Check each property
        for (const propIdRef of propIds) {
            const propId = propIdRef.substring(1);
            const propInfo = propertySingleValueMap.get(propId);
            if (!propInfo) {
                console.log(`        Property #${propId} not found in map`);
                continue;
            }

            // Extract property name (first quoted string)
            const propNameMatch = propInfo.params.match(/'([^']*)'/);
            if (!propNameMatch) {
                console.log(`        Property #${propId} has no name`);
                continue;
            }

            const currentPropName = propNameMatch[1];
            console.log(`        Checking property #${propId}: "${currentPropName}"`);

            if (currentPropName !== propName) continue;

            console.log(`        ✓ Found matching property! Updating value...`);

            // Found the property! Update its value
            const oldLine = propInfo.line;
            console.log(`        Old line: ${oldLine}`);

            const newLine = updatePropertyValue(oldLine, newValue);
            console.log(`        New line: ${newLine}`);

            if (newLine !== oldLine) {
                lines[propInfo.lineIndex] = newLine;
                console.log(`        ✓ Line updated at index ${propInfo.lineIndex}`);
                updatedCount++;
            } else {
                console.log(`        ✗ No change in line`);
            }
        }
    }

    if (updatedCount > 0) {
        console.log(`    ✓ Updated ${updatedCount} property instance(s)`);
        return true;
    } else {
        console.log(`    ✗ PropertySet or Property not found`);
        return false;
    }
}

function updatePropertyValue(line, newValue) {
    // Update the value in IFCPROPERTYSINGLEVALUE
    // Format examples:
    // #123=IFCPROPERTYSINGLEVALUE('PropertyName',$,IFCLABEL('OldValue'),$);
    // #123=IFCPROPERTYSINGLEVALUE('PropertyName',$,IFCTEXT('OldValue'),$);
    // #123=IFCPROPERTYSINGLEVALUE('PropertyName',$,IFCREAL(123.45),$);

    // Try to match IFC type with value in parentheses (string values)
    const stringValuePattern = /(IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE))\s*\(\s*'([^']*)'\s*\)/;
    let match = line.match(stringValuePattern);

    if (match) {
        const [fullMatch, ifcType, oldValue] = match;
        const encodedValue = encodeIFCString(newValue);
        const newMatch = `${ifcType}('${encodedValue}')`;
        console.log(`          Replacing "${fullMatch}" with "${newMatch}"`);
        return line.replace(fullMatch, newMatch);
    }

    // Try to match numeric values
    const numericValuePattern = /(IFC(?:REAL|INTEGER|NUMERIC|POSITIVE(?:LENGTH|PLANE)?MEASURE|LENGTH|AREA|VOLUME|COUNT|TIME)MEASURE?)\s*\(\s*([^)]+)\s*\)/;
    match = line.match(numericValuePattern);

    if (match) {
        const [fullMatch, ifcType, oldValue] = match;
        // For numeric types, try to parse as number, otherwise keep as is
        const numValue = parseFloat(newValue);
        const finalValue = isNaN(numValue) ? newValue : numValue;
        const newMatch = `${ifcType}(${finalValue})`;
        console.log(`          Replacing "${fullMatch}" with "${newMatch}"`);
        return line.replace(fullMatch, newMatch);
    }

    // Try to match boolean values
    const booleanValuePattern = /(IFCBOOLEAN|IFCLOGICAL)\s*\(\s*\.(T|F|UNKNOWN)\.\s*\)/;
    match = line.match(booleanValuePattern);

    if (match) {
        const [fullMatch, ifcType] = match;
        const boolValue = newValue.toUpperCase() === 'TRUE' || newValue === '1' || newValue.toUpperCase() === 'T' ? 'T' :
                         newValue.toUpperCase() === 'FALSE' || newValue === '0' || newValue.toUpperCase() === 'F' ? 'F' : 'UNKNOWN';
        const newMatch = `${ifcType}(.${boolValue}.)`;
        console.log(`          Replacing "${fullMatch}" with "${newMatch}"`);
        return line.replace(fullMatch, newMatch);
    }

    // Fallback: try to find the third parameter (value is typically 3rd param after property name and description)
    // Format: IFCPROPERTYSINGLEVALUE('Name', $, <VALUE>, $)
    const parts = line.split(',');
    if (parts.length >= 4) {
        // The value is typically at index 2 (0-based: name, description, value, unit)
        const valuePart = parts[2].trim();

        // If it's an IFC type, replace just the content
        if (valuePart.includes('IFC')) {
            const simpleMatch = valuePart.match(/(IFC\w+)\s*\(([^)]*)\)/);
            if (simpleMatch) {
                const [, ifcType, oldValue] = simpleMatch;
                let newValueFormatted;

                // If old value has quotes, use quotes for new value
                if (oldValue.includes("'")) {
                    newValueFormatted = `${ifcType}('${encodeIFCString(newValue)}')`;
                } else {
                    // Numeric or boolean value
                    const numValue = parseFloat(newValue);
                    newValueFormatted = `${ifcType}(${isNaN(numValue) ? newValue : numValue})`;
                }

                parts[2] = parts[2].replace(simpleMatch[0], newValueFormatted);
                console.log(`          Fallback replacement successful`);
                return parts.join(',');
            }
        }
    }

    console.log(`          ✗ Could not find value pattern to replace`);
    return line;
}

function encodeIFCString(str) {
    if (!str) return '';
    // Basic IFC string encoding
    // TODO: Add proper encoding for special characters if needed
    return String(str).replace(/'/g, "\\'");
}

function downloadModifiedIFC(ifcContent, originalFileName) {
    const blob = new Blob([ifcContent], { type: 'application/ifc' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Create new filename
    const nameParts = originalFileName.split('.');
    nameParts[nameParts.length - 1] = 'ifc';
    const baseName = nameParts.slice(0, -1).join('.');
    a.download = `${baseName}_modified.ifc`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`✓ IFC soubor byl úspěšně uložen jako:\n${a.download}`);
}

// ============================================
// CREATE NEW IFC ENTITIES
// ============================================

function generateGUID() {
    // Generate IFC GUID (base64 encoded 128-bit)
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let guid = '';
    for (let i = 0; i < 22; i++) {
        guid += chars[Math.floor(Math.random() * chars.length)];
    }
    return guid;
}

function createPropertySingleValue(id, propName, value, ownerHistory = '#2') {
    // Format: #ID=IFCPROPERTYSINGLEVALUE('PropertyName','Description',IFCLABEL('Value'),$);
    const encodedName = encodeIFCString(propName);
    const encodedValue = encodeIFCString(value);

    // Determine IFC type based on value
    let ifcType = 'IFCLABEL';
    let formattedValue;

    if (!isNaN(parseFloat(value)) && value.trim() !== '') {
        // Numeric value
        ifcType = 'IFCREAL';
        formattedValue = parseFloat(value);
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
        // Boolean value
        ifcType = 'IFCBOOLEAN';
        formattedValue = `.${value.toUpperCase() === 'TRUE' ? 'T' : 'F'}.`;
    } else {
        // String value
        formattedValue = `'${encodedValue}'`;
    }

    return `#${id}=IFCPROPERTYSINGLEVALUE('${encodedName}','Simple property set',${ifcType}(${formattedValue}),$);`;
}

function createPropertySet(id, guid, psetName, propertyIds, ownerHistory = '#2') {
    // Format: #ID=IFCPROPERTYSET('GUID',#OwnerHistory,'Name','Description',(#prop1,#prop2,...));
    const encodedName = encodeIFCString(psetName);
    const propRefs = propertyIds.map(pid => `#${pid}`).join(',');

    return `#${id}=IFCPROPERTYSET('${guid}',${ownerHistory},'${encodedName}','Property Set',(${propRefs}));`;
}

function createRelDefinesByProperties(id, guid, relatedObjects, relatingPset, ownerHistory = '#2') {
    // Format: #ID=IFCRELDEFINESBYPROPERTIES('GUID',#OwnerHistory,$,$,(#obj1,#obj2,...),#PSet);
    const objRefs = relatedObjects.map(oid => `#${oid}`).join(',');

    return `#${id}=IFCRELDEFINESBYPROPERTIES('${guid}',${ownerHistory},$,$,(${objRefs}),#${relatingPset});`;
}

// ============================================
// STORAGE INTEGRATION
// ============================================
// (IndexedDBStorage class is loaded from common/storage.js)

let storageDB = null;
let selectedStorageFiles = new Set();
let expandedStorageFolders = new Set(['root']); // Default: root is expanded
let storageMetadata = null; // Lightweight cache: folders + file metadata (NO content)

// Initialize storage on page load and pre-load metadata
(async function() {
    try {
        // Use initStorageDB() from storage.js (returns native IndexedDB)
        storageDB = await initStorageDB();

        // Pre-load metadata (without file contents) for instant modal opening
        await loadStorageMetadata();

        console.log('✓ Storage initialized and metadata cached');
    } catch (e) {
        console.error('Failed to initialize storage:', e);
    }
})();

// Load metadata (folders + file info WITHOUT content) into memory
async function loadStorageMetadata() {
    try {
        // Read from IndexedDB directly
        const transaction = storageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('bim_checker_ifc_storage');

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const fullData = request.result?.value;

                if (!fullData) {
                    storageMetadata = null;
                    resolve();
                    return;
                }

                // Create lightweight copy: keep folders and file metadata, remove content
                storageMetadata = {
                    folders: fullData.folders,
                    files: {}
                };

                // Copy file metadata without content
                for (let fileId in fullData.files) {
                    const file = fullData.files[fileId];
                    storageMetadata.files[fileId] = {
                        id: file.id,
                        name: file.name,
                        size: file.size,
                        folder: file.folder,
                        uploadDate: file.uploadDate
                        // content is NOT copied - saves memory!
                    };
                }
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to load storage metadata:', request.error);
                storageMetadata = null;
                reject(request.error);
            };
        });
    } catch (e) {
        console.error('Failed to load storage metadata:', e);
        storageMetadata = null;
    }
}

// Open storage picker modal (instant - no loading!)
document.getElementById('loadFromStorageBtn').addEventListener('click', () => {
    if (!storageDB) {
        alert('Úložiště není inicializováno!');
        return;
    }

    selectedStorageFiles.clear();
    expandedStorageFolders = new Set(['root']);
    renderStorageTree(); // Synchronous - uses cached metadata
    document.getElementById('storagePickerModal').classList.add('active');
});

function closeStoragePickerModal() {
    document.getElementById('storagePickerModal').classList.remove('active');
}

function toggleStorageFolder(folderId) {
    if (expandedStorageFolders.has(folderId)) {
        expandedStorageFolders.delete(folderId);
    } else {
        expandedStorageFolders.add(folderId);
    }
    renderStorageTree();
}

function selectAllFilesInFolder(folderId) {
    if (!storageMetadata) return;

    const folder = storageMetadata.folders[folderId];
    if (!folder) return;

    // Get all files in this folder and subfolders
    const allFiles = getAllFilesInFolder(folderId);

    // Check if all are already selected
    const allSelected = allFiles.every(fileId => selectedStorageFiles.has(fileId));

    if (allSelected) {
        // Deselect all
        allFiles.forEach(fileId => selectedStorageFiles.delete(fileId));
    } else {
        // Select all
        allFiles.forEach(fileId => selectedStorageFiles.add(fileId));
    }

    renderStorageTree();
}

function getAllFilesInFolder(folderId) {
    if (!storageMetadata) return [];

    const folder = storageMetadata.folders[folderId];
    if (!folder) return [];

    let files = [...folder.files];

    // Recursively get files from child folders
    if (folder.children) {
        folder.children.forEach(childId => {
            files = files.concat(getAllFilesInFolder(childId));
        });
    }

    return files;
}

function renderStorageTree() {
    // Synchronous - uses pre-loaded metadata (instant!)
    try {
        if (!storageMetadata || !storageMetadata.files || Object.keys(storageMetadata.files).length === 0) {
            document.getElementById('storageFileTree').innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 40px;">Žádné IFC soubory v úložišti</p>';
            return;
        }

        const html = renderStorageFolderRecursive('root', 0);
        document.getElementById('storageFileTree').innerHTML = html;
        updateSelectedFilesCount();
    } catch (e) {
        console.error('Error rendering storage tree:', e);
        document.getElementById('storageFileTree').innerHTML = '<p style="color: red;">Chyba při zobrazení úložiště</p>';
    }
}

function renderStorageFolderRecursive(folderId, level) {
    const folder = storageMetadata.folders[folderId];
    if (!folder) return '';

    const isExpanded = expandedStorageFolders.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

    let html = '';

    // Folder header (only if not root)
    if (folderId !== 'root') {
        const allFolderFiles = getAllFilesInFolder(folderId);
        const allFolderSelected = allFolderFiles.length > 0 && allFolderFiles.every(fileId => selectedStorageFiles.has(fileId));

        html += `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; align-items: center; padding: 8px; background: #f0f0f0; border-radius: 6px; cursor: pointer; margin-left: ${level * 20}px;">
                    <span onclick="toggleStorageFolder('${folderId}')" style="margin-right: 8px; color: #667eea; font-weight: bold; width: 16px; display: inline-block;">${arrow}</span>
                    <input type="checkbox" ${allFolderSelected ? 'checked' : ''} onclick="event.stopPropagation(); event.preventDefault(); selectAllFilesInFolder('${folderId}')" style="margin-right: 10px;" title="Vybrat všechny soubory ve složce">
                    <span onclick="toggleStorageFolder('${folderId}')" style="flex: 1; font-weight: 600; color: #2d3748;">
                        📁 ${folder.name}
                        ${allFolderFiles.length > 0 ? `<span style="color: #a0aec0; font-size: 0.9em; margin-left: 8px;">(${allFolderFiles.length} souborů)</span>` : ''}
                    </span>
                </div>
        `;
    }

    // Content (only if expanded)
    if (isExpanded) {
        // Render child folders first
        if (folder.children && folder.children.length > 0) {
            const sortedChildren = folder.children
                .map(id => storageMetadata.folders[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            sortedChildren.forEach(childFolder => {
                html += renderStorageFolderRecursive(childFolder.id, level + 1);
            });
        }

        // Render files
        if (folder.files && folder.files.length > 0) {
            const files = folder.files
                .map(id => storageMetadata.files[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            files.forEach(file => {
                const isSelected = selectedStorageFiles.has(file.id);
                const sizeKB = (file.size / 1024).toFixed(1);
                html += `
                    <div class="storage-file-item ${isSelected ? 'selected' : ''}"
                         onclick="toggleStorageFileSelection('${file.id}')"
                         style="padding: 8px; margin: 4px 0; cursor: pointer; border-radius: 6px; background: white; border: 2px solid ${isSelected ? '#667eea' : '#e9ecef'}; display: flex; align-items: center; margin-left: ${(level + 1) * 20}px; transition: all 0.2s;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); event.preventDefault(); toggleStorageFileSelection('${file.id}');" style="margin-right: 10px;">
                        <span style="flex: 1;">📄 ${file.name}</span>
                        <span style="color: #a0aec0; font-size: 0.9em;">${sizeKB} KB</span>
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

function toggleStorageFileSelection(fileId) {
    if (selectedStorageFiles.has(fileId)) {
        selectedStorageFiles.delete(fileId);
    } else {
        selectedStorageFiles.add(fileId);
    }
    renderStorageTree();
}

function updateSelectedFilesCount() {
    document.getElementById('selectedFilesCount').textContent = selectedStorageFiles.size;
}

async function loadSelectedFilesFromStorage() {
    if (selectedStorageFiles.size === 0) {
        alert('Vyberte alespoň jeden soubor!');
        return;
    }

    try {
        // Load full data from IndexedDB (including file contents)
        const transaction = storageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('bim_checker_ifc_storage');

        request.onsuccess = async () => {
            const data = request.result?.value;
            if (!data) {
                alert('Chyba při načítání dat z úložiště!');
                return;
            }

            document.getElementById('loading').style.display = 'block';
            updateProgress(0, `Načítám soubory z úložiště... (0/${selectedStorageFiles.size})`);
            closeStoragePickerModal();

            const fileArray = Array.from(selectedStorageFiles);
            for (let i = 0; i < fileArray.length; i++) {
                const fileId = fileArray[i];
                const file = data.files[fileId];
                if (file) {
                    await parseIFCAsync(file.content, file.name, i + 1, fileArray.length);
                }
            }

            document.getElementById('loading').style.display = 'none';
            combineData();
            updateUI();

            selectedStorageFiles.clear();
        };

        request.onerror = () => {
            console.error('Error loading files from storage:', request.error);
            alert('Chyba při načítání souborů z úložiště!');
            document.getElementById('loading').style.display = 'none';
        };
    } catch (e) {
        console.error('Error loading files from storage:', e);
        alert('Chyba při načítání souborů z úložiště!');
        document.getElementById('loading').style.display = 'none';
    }
}

// Initialize IFC cache on page load
initIFCCache().catch(err => console.error('Failed to initialize IFC cache:', err));

// =======================
// SPATIAL TREE VISUALIZATION
// =======================

let currentTreeFileIndex = 0;
let spatialTreeOpen = false;

// Toggle spatial tree panel
function toggleSpatialTree() {
    console.log('toggleSpatialTree called, current state:', spatialTreeOpen);
    spatialTreeOpen = !spatialTreeOpen;
    const panel = document.getElementById('spatialTreePanel');
    const overlay = document.getElementById('spatialTreeOverlay');

    console.log('Panel element:', panel);
    console.log('Overlay element:', overlay);
    console.log('New state:', spatialTreeOpen);

    if (spatialTreeOpen) {
        panel.classList.add('open');
        overlay.classList.add('visible');
        renderSpatialTree();
    } else {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
    }
}

// Close spatial tree panel
function closeSpatialTree() {
    if (spatialTreeOpen) {
        toggleSpatialTree();
    }
}

// Get icon for IFC entity type
function getEntityIcon(type) {
    const icons = {
        'IFCPROJECT': '🏗️',
        'IFCSITE': '🌍',
        'IFCBUILDING': '🏢',
        'IFCBUILDINGSTOREY': '📐',
        'IFCSPACE': '📦',
        'IFCWALL': '🧱',
        'IFCDOOR': '🚪',
        'IFCWINDOW': '🪟',
        'IFCSLAB': '⬜',
        'IFCBEAM': '━',
        'IFCCOLUMN': '⊥',
        'IFCROOF': '⌂',
        'IFCSTAIR': '🪜',
        'IFCRAILING': '🛤️',
        'IFCFURNISHINGELEMENT': '🪑',
        'IFCMEMBER': '═',
        'IFCPLATE': '▭',
        'IFCCOVERING': '▦',
        'IFCFLOWSEGMENT': '🔧',
        'IFCFLOWTERMINAL': '💧',
        'IFCFLOWFITTING': '🔩',
        'IFCROAD': '🛣️',
        'IFCRAILWAY': '🚂',
        'IFCBRIDGE': '🌉',
        'IFCALIGNMENT': '↗️'
    };
    return icons[type] || '📦';
}

// Count children recursively
function countChildren(node) {
    if (!node.children || node.children.length === 0) return 0;
    let count = node.children.length;
    for (let child of node.children) {
        count += countChildren(child);
    }
    return count;
}

// Render tree node
function renderTreeNode(node, depth = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const childCount = hasChildren ? countChildren(node) : 0;
    const nodeId = `tree-node-${node.id}`;

    // Format label: "TYPE" or "TYPE (name)" if name exists and is not "-"
    const typeName = node.type.replace('IFC', '');
    let displayLabel = typeName;
    if (node.name && node.name !== '-') {
        displayLabel = `${typeName} (${node.name})`;
    }

    let html = `
        <div class="tree-node" data-node-id="${node.id}" data-type="${node.type}">
            <div class="tree-node-header" onclick="handleTreeNodeClick('${node.id}', '${node.type}', event)">
                <span class="tree-node-toggle ${hasChildren ? 'collapsed' : 'leaf'}" onclick="event.stopPropagation(); toggleTreeNode('${node.id}')"></span>
                <span class="tree-node-icon">${getEntityIcon(node.type)}</span>
                <span class="tree-node-label">${displayLabel}</span>
                ${childCount > 0 ? `<span class="tree-node-count">${childCount}</span>` : ''}
            </div>
    `;

    if (hasChildren) {
        html += `<div class="tree-node-children" id="children-${node.id}">`;
        for (let child of node.children) {
            html += renderTreeNode(child, depth + 1);
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

// Handle tree node click (filter table)
function handleTreeNodeClick(nodeId, nodeType, event) {
    console.log('Tree node clicked:', nodeId, nodeType);

    // Remove active class from all nodes
    document.querySelectorAll('.tree-node-header').forEach(header => {
        header.classList.remove('active');
    });

    // Add active class to clicked node
    const nodeDiv = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeDiv) {
        const header = nodeDiv.querySelector('.tree-node-header');
        if (header) {
            header.classList.add('active');
        }
    }

    // Get all child IDs recursively
    const currentFile = loadedFiles[currentTreeFileIndex];
    if (!currentFile || !currentFile.spatialTree) return;

    function getAllChildIds(node) {
        let ids = [node.id];
        if (node.children) {
            node.children.forEach(child => {
                ids = ids.concat(getAllChildIds(child));
            });
        }
        return ids;
    }

    // Find the clicked node in the tree
    function findNodeById(nodes, targetId) {
        for (let node of nodes) {
            if (node.id === targetId) return node;
            if (node.children) {
                const found = findNodeById(node.children, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    const clickedNode = findNodeById(currentFile.spatialTree, nodeId);
    if (!clickedNode) {
        console.warn('Node not found in tree:', nodeId);
        return;
    }

    const allIds = getAllChildIds(clickedNode);
    console.log(`Filtering by node ${nodeId} and ${allIds.length - 1} descendants`);

    // Store the selected spatial node IDs for filtering
    window.selectedSpatialIds = new Set(allIds);

    // Format display name for the filter indicator
    const typeName = clickedNode.type.replace('IFC', '');
    let displayName = typeName;
    if (clickedNode.name && clickedNode.name !== '-') {
        displayName = `${typeName} (${clickedNode.name})`;
    }

    // Show spatial filter in search input
    const searchInput = document.getElementById('searchInput');
    const entityFilter = document.getElementById('entityFilter');
    const fileFilter = document.getElementById('fileFilter');

    if (searchInput) {
        searchInput.value = `🌳 ${displayName}`;
        searchInput.classList.add('spatial-filter-active');
    }
    if (entityFilter) entityFilter.value = '';
    // Keep file filter as-is to allow single-file filtering

    // Apply filters
    applyFiltersAndRender();

    console.log(`✓ Table filtered to show ${allIds.length} entities from ${displayName}`);
}

// Toggle tree node expand/collapse
function toggleTreeNode(nodeId) {
    const childrenDiv = document.getElementById(`children-${nodeId}`);
    const nodeDiv = document.querySelector(`[data-node-id="${nodeId}"]`);

    if (!childrenDiv || !nodeDiv) return;

    const toggle = nodeDiv.querySelector('.tree-node-toggle');
    const isExpanded = childrenDiv.classList.contains('expanded');

    if (isExpanded) {
        childrenDiv.classList.remove('expanded');
        toggle.classList.remove('expanded');
        toggle.classList.add('collapsed');
    } else {
        childrenDiv.classList.add('expanded');
        toggle.classList.remove('collapsed');
        toggle.classList.add('expanded');
    }
}

// Render spatial tree
function renderSpatialTree() {
    const content = document.getElementById('spatialTreeContent');

    console.log('renderSpatialTree called, loadedFiles:', loadedFiles.length);

    if (loadedFiles.length === 0) {
        content.innerHTML = '<div class="spatial-tree-info">Načtěte IFC soubor pro zobrazení struktury</div>';
        return;
    }

    // Check if current file has spatial tree
    const currentFile = loadedFiles[currentTreeFileIndex];
    console.log('Current file:', currentFile?.fileName);
    console.log('Spatial tree:', currentFile?.spatialTree);

    if (!currentFile || !currentFile.spatialTree || currentFile.spatialTree.length === 0) {
        content.innerHTML = '<div class="spatial-tree-info">Tento soubor nemá dostupnou prostorovou strukturu</div>';
        return;
    }

    // Build file selector if multiple files
    let html = '';
    if (loadedFiles.length > 1) {
        html += `
            <div class="tree-file-selector">
                <label>Soubor (${loadedFiles.length}):</label>
                <select id="treeSpatialFileSelect" onchange="changeSpatialTreeFile(this.value)">
        `;
        loadedFiles.forEach((file, index) => {
            const treeSize = file.spatialTree?.length ? countChildren(file.spatialTree[0]) : 0;
            html += `<option value="${index}" ${index === currentTreeFileIndex ? 'selected' : ''}>${file.fileName} (${treeSize} entit)</option>`;
        });
        html += `
                </select>
            </div>
        `;
    } else {
        // Single file - show file name
        const treeSize = currentFile.spatialTree?.length ? countChildren(currentFile.spatialTree[0]) : 0;
        html += `
            <div class="tree-file-selector" style="border-bottom: 2px solid #e9ecef; padding-bottom: 10px; margin-bottom: 10px;">
                <label style="font-size: 0.9em; color: #6c757d;">📄 ${currentFile.fileName}</label>
                <div style="font-size: 0.85em; color: #6c757d; margin-top: 5px;">${treeSize} entit ve struktuře</div>
            </div>
        `;
    }

    // Add expand/collapse all buttons
    html += `
        <div style="display: flex; gap: 5px; margin-bottom: 10px;">
            <button class="btn btn-secondary" style="flex: 1; padding: 6px 10px; font-size: 0.85em;" onclick="expandAllTreeNodes()">▼ Rozbalit vše</button>
            <button class="btn btn-secondary" style="flex: 1; padding: 6px 10px; font-size: 0.85em;" onclick="collapseAllTreeNodes()">▶ Zabalit vše</button>
        </div>
    `;

    // Render tree
    for (let rootNode of currentFile.spatialTree) {
        html += renderTreeNode(rootNode);
    }

    content.innerHTML = html;
    console.log('Tree rendered');
}

// Change spatial tree file
function changeSpatialTreeFile(fileIndex) {
    currentTreeFileIndex = parseInt(fileIndex);
    renderSpatialTree();
}

// Expand all tree nodes
function expandAllTreeNodes() {
    const allChildrenDivs = document.querySelectorAll('.tree-node-children');
    const allToggles = document.querySelectorAll('.tree-node-toggle:not(.leaf)');

    allChildrenDivs.forEach(div => {
        div.classList.add('expanded');
    });

    allToggles.forEach(toggle => {
        toggle.classList.remove('collapsed');
        toggle.classList.add('expanded');
    });

    console.log('Expanded all nodes');
}

// Collapse all tree nodes
function collapseAllTreeNodes() {
    const allChildrenDivs = document.querySelectorAll('.tree-node-children');
    const allToggles = document.querySelectorAll('.tree-node-toggle:not(.leaf)');

    allChildrenDivs.forEach(div => {
        div.classList.remove('expanded');
    });

    allToggles.forEach(toggle => {
        toggle.classList.remove('expanded');
        toggle.classList.add('collapsed');
    });

    console.log('Collapsed all nodes');
}

// Event listeners - inicializace až po načtení DOM
function initSpatialTreeListeners() {
    console.log('Initializing spatial tree listeners...');
    const toggleBtn = document.getElementById('toggleSpatialTreeBtn');
    const closeBtn = document.getElementById('closeSpatialTreeBtn');
    const overlay = document.getElementById('spatialTreeOverlay');
    const panel = document.getElementById('spatialTreePanel');

    // DŮLEŽITÉ: Zajistit, že panel začne ve skrytém stavu
    if (panel) {
        panel.classList.remove('open');
        console.log('Panel initial state: closed');
    }
    if (overlay) {
        overlay.classList.remove('visible');
        console.log('Overlay initial state: hidden');
    }

    // Reset stavu
    spatialTreeOpen = false;

    console.log('Toggle button:', toggleBtn);
    console.log('Close button:', closeBtn);
    console.log('Overlay:', overlay);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSpatialTree);
        console.log('Toggle button listener attached');
    } else {
        console.error('Toggle button not found!');
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSpatialTree);
        console.log('Close button listener attached');
    } else {
        console.error('Close button not found!');
    }
    if (overlay) {
        overlay.addEventListener('click', closeSpatialTree);
        console.log('Overlay listener attached');
    } else {
        console.error('Overlay not found!');
    }
}

// Inicializace po načtení DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSpatialTreeListeners);
} else {
    initSpatialTreeListeners();
}
