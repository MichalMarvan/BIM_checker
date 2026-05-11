/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('tool-presets', () => {
    let presetTools;
    let savedPresets;

    beforeEach(async () => {
        presetTools = await import('../../assets/js/ai/tools/tool-presets.js');
        savedPresets = window.ValidationPresets.list().slice();
    });

    afterEach(() => {
        for (const p of window.ValidationPresets.list()) {
            window.ValidationPresets.delete(p.id);
        }
        for (const p of savedPresets) {
            window.ValidationPresets.save(p.name, p.groups);
        }
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
    });

    it('list_presets returns array with groupCount', async () => {
        const id = window.ValidationPresets.save('TestPreset', [{ ifcFileNames: ['x.ifc'], idsFileName: 'y.ids' }]);
        try {
            const list = await presetTools.list_presets({});
            const me = list.find(p => p.id === id);
            expect(!!me).toBe(true);
            expect(me.groupCount).toBe(1);
        } finally {
            window.ValidationPresets.delete(id);
        }
    });

    it('save_preset uses current validationGroups when useCurrentGroups=true', async () => {
        const orig = window.validationGroups;
        window.validationGroups = [{
            ifcFiles: [{ name: 'a.ifc' }],
            idsFile: { name: 'b.ids' },
            missingIfcNames: [],
            missingIdsName: null
        }];
        try {
            const r = await presetTools.save_preset({ name: 'CurrentSnap_t', useCurrentGroups: true });
            expect(typeof r.presetId).toBe('string');
            expect(r.groupCount).toBe(1);
            const stored = window.ValidationPresets.get(r.presetId);
            expect(stored.groups[0].ifcFileNames[0]).toBe('a.ifc');
        } finally {
            window.validationGroups = orig;
        }
    });

    it('save_preset uses last-session when useCurrentGroups=false', async () => {
        window.ValidationPresets.saveLastSession([{ ifcFileNames: ['ls.ifc'], idsFileName: 'ls.ids' }]);
        window.ValidationPresets.flushLastSession();
        const r = await presetTools.save_preset({ name: 'FromLastSession_t' });
        expect(r.groupCount).toBe(1);
    });

    it('save_preset returns no_groups when nothing to snapshot', async () => {
        // Reset last-session to empty groups to bypass any leftover state
        try { window.ValidationPresets.saveLastSession([]); window.ValidationPresets.flushLastSession(); } catch (e) {}
        const r = await presetTools.save_preset({ name: 'Empty_t' });
        expect(r.error).toBe('no_groups');
    });

    it('delete_preset uses confirm and removes', async () => {
        const id = window.ValidationPresets.save('ToDelete_t', []);
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await presetTools.delete_preset({ id });
            expect(r.deleted).toBe(true);
            expect(window.ValidationPresets.get(id)).toBe(null);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_preset accepts name', async () => {
        const id = window.ValidationPresets.save('DelByName_t', []);
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await presetTools.delete_preset({ name: 'DelByName_t' });
            expect(r.deleted).toBe(true);
            expect(window.ValidationPresets.get(id)).toBe(null);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_preset returns missing_identifier without id or name', async () => {
        const r = await presetTools.delete_preset({});
        expect(r.error).toBe('missing_identifier');
    });

    it('load_preset writes last-session and dispatches event', async () => {
        const id = window.ValidationPresets.save('LoadMe_t', [{ ifcFileNames: ['a.ifc'], idsFileName: 'b.ids' }]);
        let dispatched = false;
        const handler = () => { dispatched = true; };
        window.addEventListener('ai:applyLastSession', handler);
        try {
            const r = await presetTools.load_preset({ id });
            expect(r.applied).toBe(true);
            expect(dispatched).toBe(true);
            const last = window.ValidationPresets.loadLastSession();
            expect(last.groups[0].ifcFileNames[0]).toBe('a.ifc');
        } finally {
            window.removeEventListener('ai:applyLastSession', handler);
            window.ValidationPresets.delete(id);
        }
    });

    it('apply_preset finds by name and triggers navigation timer when not on validator', async () => {
        const helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest('parser');
        const id = window.ValidationPresets.save('ApplyByName_t', [{ ifcFileNames: ['z.ifc'], idsFileName: 'w.ids' }]);
        try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
        try {
            const r = await presetTools.apply_preset({ presetName: 'ApplyByName_t' });
            expect(r.applied).toBe(true);
            expect(r.navigating).toBe(true);
            // Cancel pending navigation so test doesn't blow up the runner
            if (presetTools.load_preset._timer) clearTimeout(presetTools.load_preset._timer);
        } finally {
            window.ValidationPresets.delete(id);
            helpers._setCurrentPageForTest(null);
            try { localStorage.removeItem('bim_validator_autorun'); } catch (e) {}
        }
    });

    it('register adds 5 tools', async () => {
        let count = 0;
        presetTools.register(() => { count++; });
        expect(count).toBe(5);
    });
});
