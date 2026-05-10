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
