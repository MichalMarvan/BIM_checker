describe('ValidationPresets.save (create)', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_presets');
    });

    it('save() returns a string id', () => {
        const id = ValidationPresets.save('Project A', []);
        expect(typeof id).toBe('string');
        expect(id.length > 0).toBe(true);
    });

    it('save() persists preset; list() returns it', () => {
        ValidationPresets.save('Project A', [
            { ifcFileNames: ['a.ifc'], idsFileName: 'spec.ids' }
        ]);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].name).toBe('Project A');
        expect(list[0].groups.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('a.ifc');
        expect(list[0].groups[0].idsFileName).toBe('spec.ids');
    });

    it('save() sets createdAt and updatedAt to the same value on create', () => {
        const id = ValidationPresets.save('P', []);
        const preset = ValidationPresets.list().find(p => p.id === id);
        expect(typeof preset.createdAt).toBe('number');
        expect(preset.createdAt).toBe(preset.updatedAt);
    });

    it('save() preserves multiple distinct presets', () => {
        ValidationPresets.save('A', []);
        ValidationPresets.save('B', []);
        ValidationPresets.save('C', []);
        const names = ValidationPresets.list().map(p => p.name).sort();
        expect(names.join(',')).toBe('A,B,C');
    });
});

describe('ValidationPresets.save (upsert)', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('saving same name twice does not duplicate', () => {
        ValidationPresets.save('A', [{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        ValidationPresets.save('A', [{ ifcFileNames: ['b.ifc'], idsFileName: null }]);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('b.ifc');
    });

    it('saving same name preserves the original id', () => {
        const id1 = ValidationPresets.save('A', []);
        const id2 = ValidationPresets.save('A', [{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        expect(id1).toBe(id2);
    });

    it('saving same name updates updatedAt but preserves createdAt', async () => {
        const id = ValidationPresets.save('A', []);
        const created = ValidationPresets.list().find(p => p.id === id).createdAt;
        await new Promise(r => setTimeout(r, 10));
        ValidationPresets.save('A', [{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        const after = ValidationPresets.list().find(p => p.id === id);
        expect(after.createdAt).toBe(created);
        expect(after.updatedAt > created).toBe(true);
    });

    it('save() throws on empty/whitespace name', () => {
        let threw = false;
        try { ValidationPresets.save('   ', []); } catch { threw = true; }
        expect(threw).toBe(true);
        threw = false;
        try { ValidationPresets.save('', []); } catch { threw = true; }
        expect(threw).toBe(true);
    });
});

describe('ValidationPresets.get', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('returns the preset by id', () => {
        const id = ValidationPresets.save('A', [{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        const preset = ValidationPresets.get(id);
        expect(preset !== null).toBe(true);
        expect(preset.name).toBe('A');
    });

    it('returns null for unknown id', () => {
        expect(ValidationPresets.get('nope')).toBe(null);
    });
});

describe('ValidationPresets.delete', () => {
    beforeEach(() => { localStorage.removeItem('bim_validation_presets'); });

    it('removes the preset; list no longer contains it', () => {
        const id = ValidationPresets.save('A', []);
        ValidationPresets.save('B', []);
        const ok = ValidationPresets.delete(id);
        expect(ok).toBe(true);
        const names = ValidationPresets.list().map(p => p.name);
        expect(names.length).toBe(1);
        expect(names[0]).toBe('B');
    });

    it('returns false for unknown id', () => {
        expect(ValidationPresets.delete('nope')).toBe(false);
    });
});

describe('ValidationPresets.saveLastSession + loadLastSession', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_last_session');
    });

    it('loadLastSession() returns null when nothing has been saved', () => {
        expect(ValidationPresets.loadLastSession()).toBe(null);
    });

    it('flushLastSession() persists the most recent saveLastSession() call', () => {
        const groups = [{ ifcFileNames: ['a.ifc'], idsFileName: 'spec.ids' }];
        ValidationPresets.saveLastSession(groups);
        ValidationPresets.flushLastSession();
        const loaded = ValidationPresets.loadLastSession();
        expect(loaded !== null).toBe(true);
        expect(loaded.groups[0].ifcFileNames[0]).toBe('a.ifc');
        expect(typeof loaded.savedAt).toBe('number');
    });

    it('saveLastSession() debounces — multiple calls coalesce', async () => {
        ValidationPresets.saveLastSession([{ ifcFileNames: ['a.ifc'], idsFileName: null }]);
        ValidationPresets.saveLastSession([{ ifcFileNames: ['b.ifc'], idsFileName: null }]);
        ValidationPresets.saveLastSession([{ ifcFileNames: ['c.ifc'], idsFileName: null }]);
        // Before debounce settles, last-session is unwritten
        expect(localStorage.getItem('bim_validation_last_session')).toBe(null);
        // Wait past debounce window
        await new Promise(r => setTimeout(r, 600));
        const loaded = ValidationPresets.loadLastSession();
        expect(loaded.groups[0].ifcFileNames[0]).toBe('c.ifc');
    });

    it('flushLastSession() with no pending data is a no-op', () => {
        // Should not throw
        ValidationPresets.flushLastSession();
        expect(ValidationPresets.loadLastSession()).toBe(null);
    });

    it('flushLastSession() cancels the pending debounce', async () => {
        ValidationPresets.saveLastSession([{ ifcFileNames: ['x.ifc'], idsFileName: null }]);
        ValidationPresets.flushLastSession();
        // Mutate again, do NOT flush
        ValidationPresets.saveLastSession([{ ifcFileNames: ['y.ifc'], idsFileName: null }]);
        // Immediately after the second call, value is still 'x.ifc' (flushed earlier)
        const immediate = ValidationPresets.loadLastSession();
        expect(immediate.groups[0].ifcFileNames[0]).toBe('x.ifc');
        // After debounce, becomes 'y.ifc'
        await new Promise(r => setTimeout(r, 600));
        const eventual = ValidationPresets.loadLastSession();
        expect(eventual.groups[0].ifcFileNames[0]).toBe('y.ifc');
    });
});

describe('ValidationPresets — bootstrap', () => {
    beforeEach(() => {
        localStorage.removeItem('bim_validation_presets');
        localStorage.removeItem('bim_validation_last_session');
    });

    it('exposes the module on window with the expected API surface', () => {
        expect(typeof window.ValidationPresets).toBe('object');
        const expected = ['list', 'get', 'save', 'delete', 'saveLastSession',
            'loadLastSession', 'flushLastSession', 'toPresetGroups', 'fromPresetGroups'];
        for (const fn of expected) {
            expect(typeof window.ValidationPresets[fn]).toBe('function');
        }
    });

    it('list() returns [] when localStorage is empty', () => {
        expect(Array.isArray(ValidationPresets.list())).toBe(true);
        expect(ValidationPresets.list().length).toBe(0);
    });
});
