/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('validator last-session persistence (empty state)', () => {
    const KEY = 'bim_validation_last_session';

    function ensureContainer() {
        let el = document.getElementById('validationGroups');
        if (!el) {
            el = document.createElement('div');
            el.id = 'validationGroups';
            document.body.appendChild(el);
        }
        return el;
    }

    function makeGroup(id, ifcName) {
        return {
            id,
            ifcFiles: ifcName ? [{ id: 'mem_' + id, name: ifcName, size: 1, content: 'X' }] : [],
            idsFile: null,
            missingIfcNames: [],
            missingIdsName: null
        };
    }

    beforeEach(async () => {
        ensureContainer();
        localStorage.removeItem(KEY);
        validationGroups.length = 0;
        // No stored session → early return, but marks restore as done so
        // subsequent renders are allowed to persist.
        await _applyLastSession();
    });

    afterEach(() => {
        validationGroups.length = 0;
        localStorage.removeItem(KEY);
    });

    it('persists the empty state after the last group is removed', async () => {
        validationGroups.push(makeGroup(1, 'a.ifc'));
        renderValidationGroups();
        ValidationPresets.flushLastSession();
        expect(ValidationPresets.loadLastSession().groups.length).toBe(1);

        validationGroups.length = 0;
        renderValidationGroups();
        ValidationPresets.flushLastSession();
        const last = ValidationPresets.loadLastSession();
        expect(last !== null).toBe(true);
        expect(last.groups.length).toBe(0);
    });

    it('persists remaining groups after deleting one of several', async () => {
        validationGroups.push(makeGroup(1, 'first.ifc'));
        validationGroups.push(makeGroup(2, 'second.ifc'));
        renderValidationGroups();
        ValidationPresets.flushLastSession();
        expect(ValidationPresets.loadLastSession().groups.length).toBe(2);

        validationGroups.splice(0, 1);
        renderValidationGroups();
        ValidationPresets.flushLastSession();
        const last = ValidationPresets.loadLastSession();
        expect(last.groups.length).toBe(1);
        expect(last.groups[0].ifcFileNames[0]).toBe('second.ifc');
    });

    it('does not clobber a stored session before restore has run', () => {
        localStorage.setItem(KEY, JSON.stringify({
            groups: [{ ifcFileNames: ['precious.ifc'], idsFileName: null }],
            savedAt: 1
        }));
        window._validatorTestInternals.setLastSessionRestored(false);
        try {
            validationGroups.length = 0;
            renderValidationGroups();
            ValidationPresets.flushLastSession();
            const last = ValidationPresets.loadLastSession();
            expect(last.groups.length).toBe(1);
            expect(last.groups[0].ifcFileNames[0]).toBe('precious.ifc');
        } finally {
            window._validatorTestInternals.setLastSessionRestored(true);
        }
    });

    it('restores an empty last-session as an empty validator', async () => {
        validationGroups.push(makeGroup(9, 'stale.ifc'));
        localStorage.setItem(KEY, JSON.stringify({ groups: [], savedAt: 1 }));
        await _applyLastSession();
        expect(validationGroups.length).toBe(0);
    });
});
