// Tests classifyModification + applyModificationsToIFC behavior using synthetic IFC strings.
// classifyModification is exposed on window for testing.

const SYNTHETIC_IFC_BASE = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Test'), '2;1');
FILE_NAME('test.ifc', '2026-01-01T00:00:00', ('User'), ('Org'), 'Test', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`;

const SYNTHETIC_IFC_WITH_PSET = SYNTHETIC_IFC_BASE + `
#1=IFCPROJECT('proj-guid',$,'Project',$,$,$,$,(#2),#3);
#2=IFCREPRESENTATIONCONTEXT($,$,3,1.E-5,$,$);
#3=IFCUNITASSIGNMENT((#4));
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCWALL('guid-A',$,'Wall_001',$,$,$,$,$,$);
#11=IFCWALL('guid-B',$,'Wall_002',$,$,$,$,$,$);
#100=IFCPROPERTYSET('pset-guid-A',$,'Pset_WallCommon',$,(#200,#201));
#200=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#201=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#300=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#10),#100);
ENDSEC;
END-ISO-10303-21;`;

// =============================================================================
// CLASSIFICATION TESTS (Task 7)
// =============================================================================
describe('classifyModification', () => {
    function parseHelper(ifc) {
        return window.parseIFCStructure(ifc);
    }

    it('should return case "edit" when element has pset and property', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-A', 'Pset_WallCommon', 'FireRating', parsed);
        expect(result.case).toBe('edit');
        expect(result.propEntity).toBeDefined();
    });

    it('should return case "add-prop" when element has pset but missing property', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-A', 'Pset_WallCommon', 'IsExternal', parsed);
        expect(result.case).toBe('add-prop');
        expect(result.psetEntity).toBeDefined();
        expect(result.entityType).toBe('IFCPROPERTYSET');
    });

    it('should return case "create-pset" when element has no pset by that name', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-B', 'Pset_WallCommon', 'FireRating', parsed);
        expect(result.case).toBe('create-pset');
    });

    it('should return case "create-pset" when element does not exist', () => {
        const parsed = parseHelper(SYNTHETIC_IFC_WITH_PSET);
        const result = window.classifyModification('guid-NONEXISTENT', 'Pset_X', 'PropX', parsed);
        expect(result.case).toBe('create-pset');
    });
});

// =============================================================================
// CASE B: add-prop handler (Task 8)
// =============================================================================
describe('applyModificationsToIFC case B (add-prop)', () => {
    function setupViewerState() {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'Pset_WallCommon': { FireRating: 'EI60', LoadBearing: 'TRUE' } } },
                { guid: 'guid-B', fileName: 'test.ifc', propertySets: {} }
            ]
        };
    }

    it('case B: adds new property entity AND extends existing pset HasProperties', () => {
        setupViewerState();
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'IsExternal': 'TRUE'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');

        // New property entity created
        expect(result.includes("IFCPROPERTYSINGLEVALUE('IsExternal'")).toBe(true);
        // Only ONE pset with this guid (not duplicated)
        const psetMatches = result.match(/IFCPROPERTYSET\('pset-guid-A'/g);
        expect(psetMatches.length).toBe(1);
        // The original pset now has THREE prop refs (#200, #201, #newId)
        const psetLine = result.split('\n').find(l => l.includes("IFCPROPERTYSET('pset-guid-A'"));
        const tupleMatch = psetLine.match(/\(([^()]+)\)\s*\)\s*;/);
        expect(tupleMatch).toBeTruthy();
        const ids = tupleMatch[1].split(',').map(s => s.trim());
        expect(ids.length).toBe(3);
        expect(ids).toContain('#200');
        expect(ids).toContain('#201');
    });

    it('case B multi-prop: 2 new properties end up in same pset HasProperties', () => {
        setupViewerState();
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'IsExternal': 'TRUE',
                    'AcousticRating': '50dB'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');

        const psetLine = result.split('\n').find(l => l.includes("IFCPROPERTYSET('pset-guid-A'"));
        const tupleMatch = psetLine.match(/\(([^()]+)\)\s*\)\s*;/);
        const ids = tupleMatch[1].split(',').map(s => s.trim());
        expect(ids.length).toBe(4);  // #200, #201 + 2 new
    });
});

// =============================================================================
// CASE A: in-place edit regression (Task 9)
// =============================================================================
describe('applyModificationsToIFC case A (edit)', () => {
    it('case A: in-place value update, no new pset entities', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: { 'Pset_WallCommon': { FireRating: 'EI60', LoadBearing: 'TRUE' } } }
            ]
        };
        const modifications = {
            'guid-A': {
                'Pset_WallCommon': {
                    'FireRating': 'EI120'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');
        // Updated value present
        expect(result.includes("IFCLABEL('EI120')")).toBe(true);
        // Old value gone
        expect(result.includes("IFCLABEL('EI60')")).toBe(false);
        // No duplicate pset entities
        const psetCount = (result.match(/IFCPROPERTYSET\(/g) || []).length;
        expect(psetCount).toBe(1);
    });
});

// =============================================================================
// CASE C: create-pset regression (Task 9)
// =============================================================================
describe('applyModificationsToIFC case C (create-pset)', () => {
    it('case C: creates new isolated pset + property + rel for element with no pset', () => {
        window.ViewerState = {
            allData: [
                { guid: 'guid-A', fileName: 'test.ifc', propertySets: {} },
                { guid: 'guid-B', fileName: 'test.ifc', propertySets: {} }
            ]
        };
        const modifications = {
            'guid-B': {
                'Pset_WallCommon': {
                    'FireRating': 'EI60'
                }
            }
        };
        const result = window.applyModificationsToIFC(SYNTHETIC_IFC_WITH_PSET, modifications, 'test.ifc');
        // Two IFCPROPERTYSET entities: original (#100) + new isolated one for guid-B
        const psetCount = (result.match(/IFCPROPERTYSET\(/g) || []).length;
        expect(psetCount).toBe(2);
        // New rel references #11 (guid-B's entity ID)
        expect(/IFCRELDEFINESBYPROPERTIES\([^)]+,\(#11\)/.test(result)).toBe(true);
    });
});
