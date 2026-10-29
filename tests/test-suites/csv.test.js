/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('Shared RFC 4180 CSV codec', () => {
    it('roundtrips commas, quotes, CRLF and embedded newlines', () => {
        const rows = [
            ['name', 'note', 'value'],
            ['Wall, exterior', 'He said "yes"', 'line 1\nline 2']
        ];
        const csv = BIMCSV.encodeRows(rows, { neutralizeFormulas: false });
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv).toMatch(/\r\n/);
        expect(BIMCSV.parseRows(csv)).toEqual(rows);
    });

    it('neutralizes spreadsheet formulas but preserves numeric negatives', () => {
        const csv = BIMCSV.encodeRows([
            ['=HYPERLINK("https://evil.test")', '+cmd', '-text', '@SUM(A1)', -551234.5]
        ]);
        const parsed = BIMCSV.parseRows(csv)[0];
        expect(parsed[0].startsWith("'=")).toBe(true);
        expect(parsed[1].startsWith("'+")).toBe(true);
        expect(parsed[2].startsWith("'-")).toBe(true);
        expect(parsed[3].startsWith("'@")).toBe(true);
        expect(parsed[4]).toBe('-551234.5');
    });

    it('rejects an unterminated quoted field', () => {
        expect(() => BIMCSV.parseRows('a,"broken')).toThrow('unterminated');
    });

    it('feeds multiline RFC 4180 fields into the 4D schedule parser', async () => {
        const { parseScheduleCsv } = await import('../../assets/js/3d/ifc-engine/schedule/csv-parser.js');
        const csv = BIMCSV.encodeRows([
            ['id', 'name', 'start', 'end'],
            ['T1', 'Foundation,\nphase 1', '2026-07-01', '2026-07-02']
        ], { neutralizeFormulas: false });
        const schedule = parseScheduleCsv(csv, { name: 'RFC test' });
        expect(schedule.tasks.length).toBe(1);
        expect(schedule.tasks[0].name).toBe('Foundation,\nphase 1');
    });
});

