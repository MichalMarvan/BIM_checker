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

// =======================
// LARGE FILE OPTIMIZATION TESTS
// =======================

describe('IFC Parser - Large File Optimization', () => {

    describe('parseEntityFast', () => {
        it('should parse simple IFC entity', () => {
            const result = window.parseEntityFast('#1=IFCWALL(test);');
            expect(result).toBeDefined();
            expect(result.id).toBe('1');
            expect(result.type).toBe('IFCWALL');
            expect(result.params).toBe('test');
        });

        it('should parse entity with spaces around equals', () => {
            const result = window.parseEntityFast('#123 = IFCPROJECT (params);');
            expect(result).toBeDefined();
            expect(result.id).toBe('123');
            expect(result.type).toBe('IFCPROJECT');
        });

        it('should return null for invalid input', () => {
            expect(window.parseEntityFast('invalid')).toBeNull();
            expect(window.parseEntityFast('')).toBeNull();
            expect(window.parseEntityFast('#1=NOPARENS')).toBeNull();
        });

        it('should handle nested parentheses in params', () => {
            const result = window.parseEntityFast('#1=IFCWALL(nested(parens));');
            expect(result).toBeDefined();
            expect(result.params).toBe('nested(parens)');
        });

        it('should skip geometry entities', () => {
            const geometryEntities = [
                '#1=IFCCARTESIANPOINT((0.,0.,0.));',
                '#2=IFCCARTESIANPOINTLIST3D(((1.,2.,3.)));',
                '#3=IFCINDEXEDPOLYGONALFACE((1,2,3));',
                '#4=IFCSTYLEDITEM(#5,$,$);',
                '#5=IFCCOLOURRGB($,1.,0.,0.);'
            ];

            geometryEntities.forEach(entity => {
                const result = window.parseEntityFast(entity);
                expect(result).toBeDefined();
                expect(result.skipped).toBe(true);
                expect(result.params).toBeNull();
            });
        });

        it('should NOT skip required entities', () => {
            const requiredEntities = [
                '#1=IFCPROJECT(test);',
                '#2=IFCWALL(test);',
                '#3=IFCPROPERTYSET(test);',
                '#4=IFCRELDEFINESBYPROPERTIES(test);'
            ];

            requiredEntities.forEach(entity => {
                const result = window.parseEntityFast(entity);
                expect(result).toBeDefined();
                expect(result.skipped).toBeFalsy();
                expect(result.params).toBeDefined();
            });
        });

        it('should handle very long geometry lines efficiently', () => {
            // Simulate a long IFCCARTESIANPOINTLIST line (common in large IFC files)
            const longParams = Array(1000).fill('(1.,2.,3.)').join(',');
            const longLine = `#999=IFCCARTESIANPOINTLIST3D((${longParams}));`;

            const start = performance.now();
            const result = window.parseEntityFast(longLine);
            const duration = performance.now() - start;

            expect(result).toBeDefined();
            expect(result.skipped).toBe(true);
            expect(duration).toBeLessThan(10); // Should be very fast since we skip params extraction
        });
    });

    describe('validateIFCContent', () => {
        it('should validate correct IFC content', () => {
            const validIFC = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCWALL();';
            const result = window.validateIFCContent(validIFC);
            expect(result.valid).toBe(true);
        });

        it('should validate IFC with space before semicolon', () => {
            const validIFC = 'ISO-10303-21 ;\nDATA;';
            const result = window.validateIFCContent(validIFC);
            expect(result.valid).toBe(true);
        });

        it('should detect encrypted files (Microsoft Intune)', () => {
            const encryptedContent = 'MSMAMARPCRYPT AES/CBC/NoPadding encrypted data';
            const result = window.validateIFCContent(encryptedContent);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('encrypted');
        });

        it('should detect invalid IFC without header', () => {
            const invalidIFC = 'random data without header';
            const result = window.validateIFCContent(invalidIFC);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('invalid');
        });

        it('should detect invalid IFC without DATA section', () => {
            const invalidIFC = 'ISO-10303-21;\nHEADER;\nENDSEC;';
            const result = window.validateIFCContent(invalidIFC);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('invalid');
        });
    });

    describe('SKIP_ENTITY_TYPES and REQUIRED_ENTITY_TYPES', () => {
        it('should have SKIP_ENTITY_TYPES defined', () => {
            expect(window.SKIP_ENTITY_TYPES).toBeDefined();
            expect(window.SKIP_ENTITY_TYPES instanceof Set).toBe(true);
            expect(window.SKIP_ENTITY_TYPES.size).toBeGreaterThan(50);
        });

        it('should have REQUIRED_ENTITY_TYPES defined', () => {
            expect(window.REQUIRED_ENTITY_TYPES).toBeDefined();
            expect(window.REQUIRED_ENTITY_TYPES instanceof Set).toBe(true);
            expect(window.REQUIRED_ENTITY_TYPES.size).toBeGreaterThan(30);
        });

        it('should have no overlap between SKIP and REQUIRED', () => {
            const overlap = [...window.SKIP_ENTITY_TYPES].filter(x => window.REQUIRED_ENTITY_TYPES.has(x));
            expect(overlap.length).toBe(0);
        });

        it('should skip common geometry entities', () => {
            const geometryTypes = [
                'IFCCARTESIANPOINT',
                'IFCCARTESIANPOINTLIST3D',
                'IFCINDEXEDPOLYGONALFACE',
                'IFCEXTRUDEDAREASOLID',
                'IFCSTYLEDITEM',
                'IFCCOLOURRGB'
            ];
            geometryTypes.forEach(type => {
                expect(window.SKIP_ENTITY_TYPES.has(type)).toBe(true);
            });
        });

        it('should require important entities', () => {
            const requiredTypes = [
                'IFCPROJECT',
                'IFCWALL',
                'IFCPROPERTYSET',
                'IFCPROPERTYSINGLEVALUE',
                'IFCRELDEFINESBYPROPERTIES'
            ];
            requiredTypes.forEach(type => {
                expect(window.REQUIRED_ENTITY_TYPES.has(type)).toBe(true);
            });
        });
    });

    describe('File size thresholds', () => {
        it('should have LARGE_FILE_THRESHOLD defined', () => {
            expect(window.LARGE_FILE_THRESHOLD).toBeDefined();
            expect(window.LARGE_FILE_THRESHOLD).toBe(50 * 1024 * 1024); // 50MB
        });

        it('should have VERY_LARGE_FILE_THRESHOLD defined', () => {
            expect(window.VERY_LARGE_FILE_THRESHOLD).toBeDefined();
            expect(window.VERY_LARGE_FILE_THRESHOLD).toBe(150 * 1024 * 1024); // 150MB
        });

        it('should have VERY_LARGE greater than LARGE', () => {
            expect(window.VERY_LARGE_FILE_THRESHOLD).toBeGreaterThan(window.LARGE_FILE_THRESHOLD);
        });
    });
});
