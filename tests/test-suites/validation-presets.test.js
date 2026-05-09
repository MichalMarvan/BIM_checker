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
