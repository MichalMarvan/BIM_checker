describe('tools/tool-validator (read)', () => {
    let validatorTools, helpers;

    beforeEach(async () => {
        validatorTools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        // Reset last-session preset
        if (window.ValidationPresets?._internals?._delete) {
            await window.ValidationPresets._internals._delete('bim_validation_last_session');
        }
        // Reset window.validationResults
        window.validationResults = undefined;
    });

    afterEach(() => {
        helpers._setCurrentPageForTest(null);
    });

    it('list_validation_groups returns [] when no last-session', async () => {
        const result = await validatorTools.list_validation_groups({});
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('list_validation_groups reads from last-session preset', async () => {
        window.ValidationPresets.saveLastSession([
            { ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' },
            { ifcFileNames: ['c.ifc', 'd.ifc'], idsFileName: 'e.ids' }
        ]);
        window.ValidationPresets.flushLastSession();
        const result = await validatorTools.list_validation_groups({});
        expect(result.length).toBe(2);
        expect(result[0].ifcFileNames[0]).toBe('a.ifc');
        expect(result[1].ifcFileNames.length).toBe(2);
    });

    it('get_validation_results returns wrong_page off validator', async () => {
        helpers._setCurrentPageForTest('parser');
        const result = await validatorTools.get_validation_results({});
        expect(result.error).toBe('wrong_page');
    });

    it('get_validation_results returns empty when no results on validator page', async () => {
        helpers._setCurrentPageForTest('validator');
        window.validationResults = [];
        const result = await validatorTools.get_validation_results({});
        expect(result.empty).toBe(true);
    });

    it('get_validation_results summarizes window.validationResults', async () => {
        helpers._setCurrentPageForTest('validator');
        window.validationResults = [{
            ifcFiles: [{ name: 'a.ifc' }],
            idsFile: { name: 'b.ids' },
            summary: { passed: 5, failed: 2, total: 7 }
        }];
        const result = await validatorTools.get_validation_results({});
        expect(result.groups.length).toBe(1);
        expect(result.groups[0].ifcCount).toBe(1);
        expect(result.groups[0].idsName).toBe('b.ids');
        expect(result.groups[0].passed).toBe(5);
    });
});

describe('tools/tool-validator (write)', () => {
    let validatorTools, helpers;

    beforeEach(async () => {
        validatorTools = await import('../../assets/js/ai/tools/tool-validator.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        if (window.ValidationPresets?._internals?._delete) {
            await window.ValidationPresets._internals._delete('bim_validation_last_session');
        }
    });

    afterEach(() => {
        helpers._setCurrentPageForTest(null);
    });

    it('add_validation_group appends to last-session preset', async () => {
        const result = await validatorTools.add_validation_group({
            ifcFileNames: ['x.ifc'],
            idsFileName: 'y.ids'
        });
        expect(result.groupIndex).toBe(0);
        const last = window.ValidationPresets.loadLastSession();
        expect(last.groups.length).toBe(1);
        expect(last.groups[0].ifcFileNames[0]).toBe('x.ifc');
    });

    it('add_validation_group dispatches ai:applyLastSession event', async () => {
        let fired = false;
        const handler = () => { fired = true; };
        window.addEventListener('ai:applyLastSession', handler, { once: true });
        await validatorTools.add_validation_group({
            ifcFileNames: ['x.ifc'], idsFileName: 'y.ids'
        });
        // Cleanup listener if not fired (e.g. on test failure)
        window.removeEventListener('ai:applyLastSession', handler);
        expect(fired).toBe(true);
    });

    it('delete_validation_group removes by index after confirm', async () => {
        window.ValidationPresets.saveLastSession([
            { ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' },
            { ifcFileNames: ['c.ifc'], idsFileName: 'd.ids' }
        ]);
        window.ValidationPresets.flushLastSession();
        const orig = window.confirm; window.confirm = () => true;
        try {
            const result = await validatorTools.delete_validation_group({ index: 0 });
            expect(result.deleted).toBe(true);
            const last = window.ValidationPresets.loadLastSession();
            expect(last.groups.length).toBe(1);
            expect(last.groups[0].ifcFileNames[0]).toBe('c.ifc');
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_validation_group cancels when confirm declined', async () => {
        window.ValidationPresets.saveLastSession([{ ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' }]);
        window.ValidationPresets.flushLastSession();
        const orig = window.confirm; window.confirm = () => false;
        try {
            const result = await validatorTools.delete_validation_group({ index: 0 });
            expect(result.cancelled).toBe(true);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_validation_group rejects out-of-range index', async () => {
        const orig = window.confirm; window.confirm = () => true;
        try {
            const result = await validatorTools.delete_validation_group({ index: 99 });
            expect(result.error).toBe('index_out_of_range');
        } finally {
            window.confirm = orig;
        }
    });

    it('run_validation sets autorun flag and returns navigating when not on validator', async () => {
        helpers._setCurrentPageForTest('parser');
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
        const result = await validatorTools.run_validation({});
        expect(result.navigating).toBe(true);
        expect(localStorage.getItem('bim_validator_autorun')).toBe('1');
        // Cancel the deferred navigation so it doesn't destroy the test context
        if (validatorTools.run_validation._timer) clearTimeout(validatorTools.run_validation._timer);
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
    });

    it('run_validation returns started when on validator with validateAll defined', async () => {
        helpers._setCurrentPageForTest('validator');
        const orig = window.validateAll;
        let called = false;
        window.validateAll = () => { called = true; };
        try {
            const result = await validatorTools.run_validation({});
            expect(result.started).toBe(true);
            expect(called).toBe(true);
        } finally {
            window.validateAll = orig;
        }
    });
});

describe('tools/tool-validator (failures)', () => {
    it('get_validation_failures returns wrong_page off validator', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('parser');
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.error).toBe('wrong_page');
        } finally {
            helpers._setCurrentPageForTest(null);
        }
    });

    it('get_validation_failures returns no_results when validationResults empty', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = null;
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.error).toBe('no_results');
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });

    it('get_validation_failures lists failures from a fake group', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = [{
            idsFileName: 'a.ids', idsTitle: 'A',
            ifcResults: [{
                ifcFile: { name: 'x.ifc' },
                results: [{ specName: 'S1', requirements: [{ requirement: 'IsExternal', pass: 5, fail: 3 }, { requirement: 'AllOK', pass: 10, fail: 0 }] }]
            }]
        }];
        try {
            const r = await tools.get_validation_failures({ groupIndex: 0 });
            expect(r.failures.length).toBe(1);
            expect(r.failures[0].requirement).toBe('IsExternal');
            expect(r.failures[0].failed).toBe(3);
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });

    it('count_failures_by_requirement aggregates across files', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-validator.js');
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('validator');
        const orig = window.validationResults;
        window.validationResults = [{
            ifcResults: [
                { ifcFile: { name: 'a.ifc' }, results: [{ specName: 'S', requirements: [{ requirement: 'R', pass: 1, fail: 2 }] }] },
                { ifcFile: { name: 'b.ifc' }, results: [{ specName: 'S', requirements: [{ requirement: 'R', pass: 0, fail: 4 }] }] }
            ]
        }];
        try {
            const r = await tools.count_failures_by_requirement({ groupIndex: 0 });
            expect(r.breakdown.length).toBe(1);
            expect(r.breakdown[0].failed).toBe(6);
            expect(r.breakdown[0].total).toBe(7);
        } finally {
            window.validationResults = orig;
            helpers._setCurrentPageForTest(null);
        }
    });
});
