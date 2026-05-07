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
