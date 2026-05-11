/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IFC parser worker integration', () => {
    let pool = null;
    let workerSupported = false;

    beforeEach(() => {
        try {
            if (typeof Worker !== 'undefined' && typeof WorkerPool !== 'undefined') {
                pool = new WorkerPool({
                    workerScript: '../assets/js/workers/ifc-parser.worker.js',
                    size: 1
                });
                workerSupported = true;
            }
        } catch (e) {
            console.warn('Worker pool init failed in test env:', e);
            workerSupported = false;
        }
    });

    afterEach(() => {
        if (pool && pool.terminate) pool.terminate();
        pool = null;
    });

    it('worker pool parses minimal IFC and returns expected shape', async () => {
        if (!workerSupported) {
            console.warn('Worker not supported in test env, skipping');
            return;
        }
        const minimalIFC = `ISO-10303-21;\nDATA;\n#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;`;
        const entities = await pool.submit('PARSE', { content: minimalIFC, fileName: 'worker-test.ifc' });
        expect(Array.isArray(entities)).toBe(true);
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
        expect(entities[0].guid).toBe('guid-1');
        expect(entities[0].fileName).toBe('worker-test.ifc');
    });

    it('worker reports error for malformed input', async () => {
        if (!workerSupported) return;
        let threw = false;
        try {
            await pool.submit('PARSE', { content: null, fileName: 'broken.ifc' });
        } catch (_e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
