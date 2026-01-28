// =======================
// IDS EXCEL PARSER TESTS
// =======================

describe('IDS Excel Parser', () => {

    describe('Sheet Reading', () => {

        it('should be defined', () => {
            expect(IDSExcelParser).toBeDefined();
        });

        it('should have parse method', () => {
            expect(typeof IDSExcelParser.parse).toBe('function');
        });

        it('should have required sheet names constant', () => {
            expect(IDSExcelParser.REQUIRED_SHEETS).toContain('info');
            expect(IDSExcelParser.REQUIRED_SHEETS).toContain('specifications');
        });

        it('should have all sheet names constant', () => {
            expect(IDSExcelParser.ALL_SHEETS).toContain('info');
            expect(IDSExcelParser.ALL_SHEETS).toContain('specifications');
            expect(IDSExcelParser.ALL_SHEETS).toContain('applicability');
            expect(IDSExcelParser.ALL_SHEETS).toContain('psets_lookup');
            expect(IDSExcelParser.ALL_SHEETS).toContain('element_psets');
        });

    });

    describe('Info Sheet Parsing', () => {

        it('should parse info sheet to metadata', () => {
            const mockInfoData = [
                { Field: 'title', Value: 'Test IDS' },
                { Field: 'author', Value: 'John Doe' },
                { Field: 'version', Value: '1.0' },
                { Field: 'date', Value: '2026-01-26' },
                { Field: 'description', Value: 'Test description' }
            ];

            const result = IDSExcelParser._parseInfoSheet(mockInfoData);

            expect(result.title).toBe('Test IDS');
            expect(result.author).toBe('John Doe');
            expect(result.version).toBe('1.0');
        });

        it('should handle missing optional fields', () => {
            const mockInfoData = [
                { Field: 'title', Value: 'Test IDS' }
            ];

            const result = IDSExcelParser._parseInfoSheet(mockInfoData);

            expect(result.title).toBe('Test IDS');
            expect(result.author).toBe('');
            expect(result.version).toBe('');
        });

    });

    describe('Specifications Sheet Parsing', () => {

        it('should parse specifications to array', () => {
            const mockSpecData = [
                { spec_id: 'SPEC_01', name: 'Wall Check', description: 'Check walls', ifcVersion: 'IFC4' },
                { spec_id: 'SPEC_02', name: 'Door Check', description: 'Check doors', ifcVersion: 'IFC4' }
            ];

            const result = IDSExcelParser._parseSpecificationsSheet(mockSpecData);

            expect(result.length).toBe(2);
            expect(result[0].spec_id).toBe('SPEC_01');
            expect(result[0].name).toBe('Wall Check');
        });

        it('should skip rows without spec_id', () => {
            const mockSpecData = [
                { spec_id: 'SPEC_01', name: 'Wall Check' },
                { spec_id: '', name: 'Empty' },
                { name: 'No ID' }
            ];

            const result = IDSExcelParser._parseSpecificationsSheet(mockSpecData);

            expect(result.length).toBe(1);
        });

    });

});
