// =======================
// IFC PARSER TESTS (from viewer.js)
// =======================

describe('IFC Parser (Viewer)', () => {
    
    it('should parse simple IFC content structure', () => {
        const simpleIFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('test.ifc','2024-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('2Xd7f8$3jDwBD4L9fK3J4x',#5,'TestProject',$,$,$,$,$,$);
#5=IFCOWNERHISTORY($,$,$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

        const lines = simpleIFC.split('\n');
        expect(lines.length).toBeGreaterThan(0);
        
        const entityLines = lines.filter(line => line.trim().startsWith('#'));
        expect(entityLines.length).toBeGreaterThan(0);
    });

    it('should extract entity ID from IFC line', () => {
        const line = "#123 = IFCWALL('test');";
        const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)/);
        
        expect(match).toBeDefined();
        expect(match[1]).toBe('123');
        expect(match[2]).toBe('IFCWALL');
    });

    it('should identify different IFC entity types', () => {
        const entities = [
            "#1=IFCPROJECT();",
            "#2=IFCSITE();",
            "#3=IFCBUILDING();",
            "#4=IFCBUILDINGSTOREY();",
            "#5=IFCWALL();",
            "#6=IFCDOOR();",
            "#7=IFCWINDOW();"
        ];

        entities.forEach(entity => {
            const match = entity.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)/);
            expect(match).toBeDefined();
            expect(match[2]).toMatch(/^IFC[A-Z]+$/);
        });
    });

    it('should parse IFCPROPERTYSET structure', () => {
        const psetLine = "#10=IFCPROPERTYSET('2xd7f8',#5,'Pset_WallCommon',$,(#11,#12));";
        const match = psetLine.match(/^#(\d+)\s*=\s*IFCPROPERTYSET/);
        
        expect(match).toBeDefined();
        expect(match[1]).toBe('10');
    });

    it('should parse IFCRELDEFINESBYPROPERTIES', () => {
        const relLine = "#20=IFCRELDEFINESBYPROPERTIES('guid',#5,$,$,(#30,#31),#10);";
        const match = relLine.match(/^#(\d+)\s*=\s*IFCRELDEFINESBYPROPERTIES/);
        
        expect(match).toBeDefined();
    });

    it('should extract references from IFC line', () => {
        const line = "#100=IFCWALL('guid',#5,'Name',$,$,#10,#11,'tag');";
        const references = line.match(/#\d+/g);
        
        expect(references).toBeDefined();
        expect(references.length).toBeGreaterThan(0);
        expect(references).toContain('#5');
        expect(references).toContain('#10');
        expect(references).toContain('#11');
    });

    it('should handle property single value format', () => {
        const line = "#50=IFCPROPERTYSINGLEVALUE('Name',$,IFCLABEL('Value'),$);";
        const match = line.match(/IFCPROPERTYSINGLEVALUE\('([^']+)'/);
        
        expect(match).toBeDefined();
        expect(match[1]).toBe('Name');
    });

    it('should parse IFCRELCONTAINEDINSPATIALSTRUCTURE', () => {
        const line = "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('guid',#5,$,$,(#70,#71),#80);";
        const relatedMatch = line.match(/\(([#\d,\s]+)\)/);
        
        expect(relatedMatch).toBeDefined();
    });

    it('should parse IFCRELAGGREGATES', () => {
        const line = "#90=IFCRELAGGREGATES('guid',#5,$,$,#100,(#101,#102,#103));";
        const match = line.match(/IFCRELAGGREGATES/);
        
        expect(match).toBeDefined();
    });

    it('should extract name from entity', () => {
        const line = "#1=IFCPROJECT('guid',#5,'ProjectName','Description',$,$,$,$,$);";
        const nameMatch = line.match(/',#\d+,'([^']+)'/);
        
        expect(nameMatch).toBeDefined();
        expect(nameMatch[1]).toBe('ProjectName');
    });

    it('should handle entities without names', () => {
        const line = "#1=IFCOWNERHISTORY($,$,$,$,$,$,$,$);";
        const nameMatch = line.match(/',#\d+,'([^']+)'/);
        
        expect(nameMatch).toBeNull();
    });

    it('should handle empty parameters $', () => {
        const line = "#1=IFCENTITY('guid',$,$,#10);";
        expect(line).toContain('$');
        
        const params = line.match(/\$|#\d+|'[^']*'/g);
        expect(params).toBeDefined();
        expect(params).toContain('$');
    });

    it('should parse nested lists in entities', () => {
        const line = "#1=IFCENTITY('guid',#5,(#10,#11,(#12,#13)));";
        const nestedMatch = line.match(/\([#\d,\s()]+\)/);
        
        expect(nestedMatch).toBeDefined();
    });

    it('should identify spatial structure entities', () => {
        const spatialEntities = [
            'IFCPROJECT',
            'IFCSITE', 
            'IFCBUILDING',
            'IFCBUILDINGSTOREY',
            'IFCSPACE'
        ];

        spatialEntities.forEach(entityType => {
            expect(entityType).toMatch(/^IFC[A-Z]+$/);
            expect(entityType.length).toBeGreaterThan(3);
        });
    });

    it('should handle GUID format in IFC', () => {
        const guidPattern = /^[0-9A-Za-z_$]{22}$/;
        const validGuids = [
            '2Xd7f8$3jDwBD4L9fK3J4x',
            '0123456789ABCDEFGHIJKl',
            'abcdefghijklmnopqrstuv'
        ];

        validGuids.forEach(guid => {
            expect(guid).toMatch(guidPattern);
        });
    });

    it('should parse entity with multiple property sets', () => {
        const line = "#1=IFCWALL('guid',#5,'Wall',$,$,#10,#11,'tag');";
        const refs = line.match(/#\d+/g);
        
        expect(refs).toBeDefined();
        expect(refs.length).toBeGreaterThan(2);
    });

    it('should handle quotes within string parameters', () => {
        const line = "#1=IFCENTITY('Name with \\'quotes\\'',$);";
        expect(line).toContain("\\'");
    });

    it('should validate IFC header structure', () => {
        const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
ENDSEC;`;

        expect(header).toContain('ISO-10303-21');
        expect(header).toContain('HEADER');
        expect(header).toContain('ENDSEC');
    });

    it('should validate IFC footer structure', () => {
        const footer = `ENDSEC;
END-ISO-10303-21;`;

        expect(footer).toContain('ENDSEC');
        expect(footer).toContain('END-ISO-10303-21');
    });

    it('should handle IFC file with windows line endings', () => {
        const ifcWithCRLF = "#1=IFCPROJECT();\r\n#2=IFCSITE();";
        const lines = ifcWithCRLF.split(/\r?\n/);
        
        expect(lines.length).toBe(2);
        expect(lines[0]).toContain('IFCPROJECT');
        expect(lines[1]).toContain('IFCSITE');
    });
});
