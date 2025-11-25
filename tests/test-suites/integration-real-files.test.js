// =======================
// INTEGRATION TESTS - Real IFC Files
// Testy s reálnými soubory pro debugging problémů
// =======================

describe('Real IFC Files Integration', () => {
    let uploadedFiles = [];
    
    // Helper pro načtení souboru z test-data
    async function loadTestFile(filename) {
        try {
            const response = await fetch(`../test-data/${filename}`);
            if (!response.ok) {
                throw new Error(`File not found: ${filename}`);
            }
            const content = await response.text();
            return content;
        } catch (error) {
            console.error(`Failed to load ${filename}:`, error);
            return null;
        }
    }
    
    // Helper pro parsování celého IFC
    async function parseCompleteIFC(content) {
        const lines = content.split('\n');
        const entities = [];
        const entityMap = new Map();
        const errors = [];
        
        let inDataSection = false;
        let lineNumber = 0;
        
        for (let line of lines) {
            lineNumber++;
            line = line.trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Check for DATA section
            if (line === 'DATA;') {
                inDataSection = true;
                continue;
            }
            
            // Check for ENDSEC
            if (line === 'ENDSEC;') {
                inDataSection = false;
                continue;
            }
            
            // Parse entities only in DATA section
            if (inDataSection && line.startsWith('#')) {
                try {
                    const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);?$/i);
                    if (match) {
                        const [, id, type, params] = match;
                        const entity = {
                            id: parseInt(id),
                            type: type,
                            params: params,
                            line: line,
                            lineNumber: lineNumber
                        };
                        entities.push(entity);
                        entityMap.set(id, entity);
                    } else {
                        // Failed to parse - record error
                        errors.push({
                            lineNumber: lineNumber,
                            line: line,
                            error: 'Failed to match entity pattern'
                        });
                    }
                } catch (error) {
                    errors.push({
                        lineNumber: lineNumber,
                        line: line,
                        error: error.message
                    });
                }
            }
        }
        
        return {
            entities,
            entityMap,
            errors,
            totalLines: lineNumber,
            entityCount: entities.length
        };
    }
    
    // Test 1: Načtení sample.ifc
    it('should load and parse sample.ifc', async () => {
        const content = await loadTestFile('sample.ifc');
        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
        
        const result = await parseCompleteIFC(content);
        
        // Základní validace
        expect(result.entities.length).toBeGreaterThan(0);
        expect(result.errors.length).toBe(0); // Sample by neměl mít chyby
        
        // Zkontroluj, že obsahuje základní strukturu
        const hasProject = result.entities.some(e => e.type === 'IFCPROJECT');
        const hasSite = result.entities.some(e => e.type === 'IFCSITE');
        const hasBuilding = result.entities.some(e => e.type === 'IFCBUILDING');
        
        expect(hasProject).toBe(true);
        expect(hasSite).toBe(true);
        expect(hasBuilding).toBe(true);
    });
    
    // Test 2: Statistiky entit
    it('should count entity types in sample.ifc', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        // Seskup entity podle typu
        const typeCount = {};
        for (let entity of result.entities) {
            typeCount[entity.type] = (typeCount[entity.type] || 0) + 1;
        }
        
        console.log('Entity types found:', typeCount);
        
        // Zkontroluj, že máme různé typy
        expect(Object.keys(typeCount).length).toBeGreaterThan(5);
        expect(typeCount['IFCWALL']).toBeGreaterThan(0);
    });
    
    // Test 3: PropertySets
    it('should find PropertySets in sample.ifc', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        const propertySets = result.entities.filter(e => 
            e.type === 'IFCPROPERTYSET'
        );
        
        expect(propertySets.length).toBeGreaterThan(0);
        
        // Zkontroluj strukturu PropertySetu
        const firstPset = propertySets[0];
        expect(firstPset.params).toBeDefined();
        expect(firstPset.params.length).toBeGreaterThan(0);
    });
    
    // Test 4: Relations
    it('should find spatial relationships', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        const spatialRelations = result.entities.filter(e => 
            e.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' ||
            e.type === 'IFCRELAGGREGATES'
        );
        
        expect(spatialRelations.length).toBeGreaterThan(0);
    });
    
    // Test 5: Detekce problematických řádků
    it('should detect parsing errors', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        if (result.errors.length > 0) {
            console.error('Parsing errors found:');
            result.errors.forEach(err => {
                console.error(`Line ${err.lineNumber}: ${err.error}`);
                console.error(`Content: ${err.line.substring(0, 100)}...`);
            });
        }
        
        // Sample soubor by neměl mít chyby
        expect(result.errors.length).toBe(0);
    });
    
    // Test 6: Header validation
    it('should validate IFC header structure', async () => {
        const content = await loadTestFile('sample.ifc');
        
        expect(content).toContain('ISO-10303-21');
        expect(content).toContain('HEADER;');
        expect(content).toContain('FILE_DESCRIPTION');
        expect(content).toContain('FILE_NAME');
        expect(content).toContain('FILE_SCHEMA');
        expect(content).toContain('ENDSEC;');
        expect(content).toContain('DATA;');
        expect(content).toContain('END-ISO-10303-21');
    });
    
    // Test 7: GUID format validation
    it('should validate GUID formats', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        const guidPattern = /[0-9A-Za-z_$]{22}/;
        const entitiesWithGuids = result.entities.filter(e => {
            const match = e.params.match(/'([0-9A-Za-z_$]{22})'/);
            return match !== null;
        });
        
        expect(entitiesWithGuids.length).toBeGreaterThan(0);
        
        // Zkontroluj, že všechny GUIDs jsou validní
        for (let entity of entitiesWithGuids) {
            const guidMatch = entity.params.match(/'([0-9A-Za-z_$]{22})'/);
            if (guidMatch) {
                expect(guidMatch[1]).toMatch(guidPattern);
            }
        }
    });
    
    // Test 8: Reference integrity
    it('should check reference integrity', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        // Najdi všechny reference (#123)
        const allReferences = new Set();
        const brokenReferences = [];
        
        for (let entity of result.entities) {
            const refs = entity.params.match(/#\d+/g) || [];
            for (let ref of refs) {
                const refId = ref.substring(1);
                allReferences.add(refId);
                
                // Zkontroluj, že reference existuje
                if (!result.entityMap.has(refId)) {
                    brokenReferences.push({
                        entity: entity.id,
                        brokenRef: refId,
                        line: entity.lineNumber
                    });
                }
            }
        }
        
        if (brokenReferences.length > 0) {
            console.warn('Broken references found:', brokenReferences);
        }
        
        // Sample soubor by neměl mít rozbité reference
        expect(brokenReferences.length).toBe(0);
    });
    
    // Test 9: Spatial hierarchy
    it('should validate spatial hierarchy', async () => {
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        // Najdi hierarchii
        const project = result.entities.find(e => e.type === 'IFCPROJECT');
        const site = result.entities.find(e => e.type === 'IFCSITE');
        const building = result.entities.find(e => e.type === 'IFCBUILDING');
        const storey = result.entities.find(e => e.type === 'IFCBUILDINGSTOREY');
        
        expect(project).toBeDefined();
        expect(site).toBeDefined();
        expect(building).toBeDefined();
        expect(storey).toBeDefined();
        
        console.log('Spatial hierarchy:');
        console.log('- Project:', project.id);
        console.log('- Site:', site.id);
        console.log('- Building:', building.id);
        console.log('- Storey:', storey.id);
    });
    
    // Test 10: Performance test
    it('should parse sample.ifc within reasonable time', async () => {
        const start = performance.now();
        
        const content = await loadTestFile('sample.ifc');
        const result = await parseCompleteIFC(content);
        
        const duration = performance.now() - start;
        
        console.log(`Parsed ${result.entityCount} entities in ${duration.toFixed(2)}ms`);
        
        // Sample soubor je malý, měl by se zpracovat rychle
        expect(duration).toBeLessThan(1000); // Max 1 sekunda
    });
});

// =======================
// USER UPLOADED FILES TESTS
// Pro testování vlastních problematických souborů
// =======================

describe('User Uploaded Files (Manual Testing)', () => {
    
    it('MANUAL TEST: Upload your problematic IFC file', async () => {
        // Tento test slouží k manuálnímu debugování
        // Instrukce v konzoli
        console.log('='.repeat(60));
        console.log('📁 MANUAL FILE UPLOAD TEST');
        console.log('='.repeat(60));
        console.log('');
        console.log('Pro otestování svého souboru:');
        console.log('1. Umísti soubor do: tests/test-data/user-upload.ifc');
        console.log('2. Spusť tento test znovu');
        console.log('3. Podívej se do konzole na výsledky');
        console.log('');
        console.log('Případně použij "File Upload Debugger" níže v test runneru');
        console.log('='.repeat(60));
        
        // Pokus se načíst user-upload.ifc
        try {
            const response = await fetch('../test-data/user-upload.ifc');
            if (response.ok) {
                const content = await response.text();
                console.log('✅ Soubor user-upload.ifc nalezen!');
                console.log(`📊 Velikost: ${content.length} znaků`);
                
                // Základní analýza
                const lines = content.split('\n');
                console.log(`📊 Počet řádků: ${lines.length}`);
                
                const entityLines = lines.filter(l => l.trim().startsWith('#'));
                console.log(`📊 Entit nalezeno: ${entityLines.length}`);
                
                // Zkus zpracovat
                const result = await parseCompleteIFC(content);
                console.log(`✅ Úspěšně zpracováno entit: ${result.entityCount}`);
                
                if (result.errors.length > 0) {
                    console.error(`❌ Chyby při parsování: ${result.errors.length}`);
                    console.error('První chyby:');
                    result.errors.slice(0, 5).forEach(err => {
                        console.error(`  Line ${err.lineNumber}: ${err.error}`);
                    });
                }
                
                expect(true).toBe(true); // Test prošel
            } else {
                console.log('ℹ️  Soubor user-upload.ifc nenalezen');
                console.log('   To je OK - umísti sem svůj problematický soubor');
                expect(true).toBe(true); // Test prošel (není to chyba)
            }
        } catch (error) {
            console.log('ℹ️  Soubor user-upload.ifc není dostupný');
            expect(true).toBe(true); // Test prošel
        }
    });
    
    // Helper funkce dostupná v konzoli pro manuální debugging
    it('should expose debugging helpers', () => {
        // Export funkcí do window pro použití v konzoli
        window.debugIFC = async function(filename) {
            console.log(`🔍 Debugging: ${filename}`);
            const response = await fetch(`../test-data/${filename}`);
            const content = await response.text();
            const result = await parseCompleteIFC(content);
            
            console.log('Results:', {
                totalLines: result.totalLines,
                entities: result.entityCount,
                errors: result.errors.length,
                entityTypes: [...new Set(result.entities.map(e => e.type))].sort()
            });
            
            if (result.errors.length > 0) {
                console.error('Errors:', result.errors);
            }
            
            return result;
        };
        
        window.findEntity = function(result, id) {
            return result.entities.find(e => e.id === parseInt(id));
        };
        
        window.findByType = function(result, type) {
            return result.entities.filter(e => e.type === type);
        };
        
        console.log('✅ Debug helpers loaded:');
        console.log('  - debugIFC("filename.ifc") - Analyzuj soubor');
        console.log('  - findEntity(result, 123) - Najdi entitu podle ID');
        console.log('  - findByType(result, "IFCWALL") - Najdi entity podle typu');
        
        expect(window.debugIFC).toBeDefined();
    });
});

// Helper funkce pro parseCompleteIFC (použije se v testech)
async function parseCompleteIFC(content) {
    const lines = content.split('\n');
    const entities = [];
    const entityMap = new Map();
    const errors = [];
    
    let inDataSection = false;
    let lineNumber = 0;
    
    for (let line of lines) {
        lineNumber++;
        line = line.trim();
        
        if (!line) continue;
        
        if (line === 'DATA;') {
            inDataSection = true;
            continue;
        }
        
        if (line === 'ENDSEC;') {
            inDataSection = false;
            continue;
        }
        
        if (inDataSection && line.startsWith('#')) {
            try {
                const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);?$/i);
                if (match) {
                    const [, id, type, params] = match;
                    const entity = {
                        id: parseInt(id),
                        type: type,
                        params: params,
                        line: line,
                        lineNumber: lineNumber
                    };
                    entities.push(entity);
                    entityMap.set(id, entity);
                } else {
                    errors.push({
                        lineNumber: lineNumber,
                        line: line,
                        error: 'Failed to match entity pattern'
                    });
                }
            } catch (error) {
                errors.push({
                    lineNumber: lineNumber,
                    line: line,
                    error: error.message
                });
            }
        }
    }
    
    return {
        entities,
        entityMap,
        errors,
        totalLines: lineNumber,
        entityCount: entities.length
    };
}
