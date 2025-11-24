/* ===========================================
   BIM CHECKER - IFC PARSER WORKER
   Background processing for IFC files
   =========================================== */

// Import stream parser if available
if (typeof importScripts === 'function') {
    importScripts('../common/ifc-stream-parser.js');
}

let currentParser = null;
let entities = [];
let propertySets = {};
let statistics = {
    totalEntities: 0,
    entityTypes: {},
    propertySets: 0,
    materials: 0,
    classifications: 0
};

// Message handler
self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'PARSE_FILE':
            await parseFile(data.file);
            break;
            
        case 'SEARCH':
            const results = searchEntities(data.query, data.regex);
            self.postMessage({ 
                type: 'SEARCH_RESULTS', 
                data: results 
            });
            break;
            
        case 'GET_STATS':
            self.postMessage({ 
                type: 'STATS', 
                data: statistics 
            });
            break;
            
        case 'CLEAR':
            clearData();
            break;
    }
};

async function parseFile(file) {
    entities = [];
    propertySets = {};
    statistics = {
        totalEntities: 0,
        entityTypes: {},
        propertySets: 0,
        materials: 0,
        classifications: 0
    };
    
    currentParser = new IFCStreamParser({
        chunkSize: 2 * 1024 * 1024, // 2MB chunks
        
        onEntity: (entity) => {
            // Store entity
            entities.push(entity);
            
            // Update statistics
            statistics.totalEntities++;
            statistics.entityTypes[entity.type] = 
                (statistics.entityTypes[entity.type] || 0) + 1;
            
            // Track property sets
            if (entity.type === 'IFCPROPERTYSET') {
                statistics.propertySets++;
                processPropertySet(entity);
            }
            
            // Track materials
            if (entity.type.includes('MATERIAL')) {
                statistics.materials++;
            }
            
            // Track classifications
            if (entity.type.includes('CLASSIFICATION')) {
                statistics.classifications++;
            }
            
            // Send batch updates every 1000 entities
            if (entities.length % 1000 === 0) {
                self.postMessage({
                    type: 'BATCH_UPDATE',
                    data: {
                        entities: entities.slice(-1000),
                        stats: statistics
                    }
                });
            }
        },
        
        onProgress: (progress) => {
            self.postMessage({
                type: 'PROGRESS',
                data: progress
            });
        },
        
        onComplete: (result) => {
            self.postMessage({
                type: 'PARSE_COMPLETE',
                data: {
                    entities: entities,
                    propertySets: propertySets,
                    statistics: statistics,
                    ...result
                }
            });
        }
    });
    
    try {
        await currentParser.parseFile(file);
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            data: {
                message: error.message,
                stack: error.stack
            }
        });
    }
}

function processPropertySet(entity) {
    // Extract property set name and properties
    if (entity.arguments && entity.arguments.length > 4) {
        const name = entity.arguments[2]; // Usually the name
        const properties = entity.arguments[4]; // Usually properties list
        
        if (name && typeof name === 'string') {
            propertySets[entity.id] = {
                id: entity.id,
                name: name,
                properties: properties
            };
        }
    }
}

function searchEntities(query, useRegex = false) {
    let searchFn;
    
    if (useRegex) {
        try {
            const regex = new RegExp(query, 'gi');
            searchFn = (text) => regex.test(text);
        } catch (e) {
            return { error: 'Invalid regex pattern' };
        }
    } else {
        const lowerQuery = query.toLowerCase();
        searchFn = (text) => text.toLowerCase().includes(lowerQuery);
    }
    
    const results = entities.filter(entity => {
        // Search in entity type
        if (searchFn(entity.type)) return true;
        
        // Search in line content
        if (searchFn(entity.line)) return true;
        
        // Search in string arguments
        for (let arg of entity.arguments) {
            if (typeof arg === 'string' && searchFn(arg)) {
                return true;
            }
        }
        
        return false;
    });
    
    return {
        results: results.slice(0, 1000), // Limit results
        totalFound: results.length,
        limited: results.length > 1000
    };
}

function clearData() {
    entities = [];
    propertySets = {};
    statistics = {
        totalEntities: 0,
        entityTypes: {},
        propertySets: 0,
        materials: 0,
        classifications: 0
    };
    
    self.postMessage({
        type: 'CLEARED',
        data: true
    });
}

// Notify that worker is ready
self.postMessage({ type: 'READY' });
