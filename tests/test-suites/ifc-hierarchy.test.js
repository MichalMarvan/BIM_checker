/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IFCHierarchy', () => {
    it('should expose IFCHierarchy global', () => {
        expect(typeof window.IFCHierarchy).toBe('object');
        expect(typeof window.IFCHierarchy.load).toBe('function');
        expect(typeof window.IFCHierarchy.isSubtypeOf).toBe('function');
        expect(typeof window.IFCHierarchy.getSubtypes).toBe('function');
        expect(typeof window.IFCHierarchy.getPredefinedTypeIndex).toBe('function');
        expect(typeof window.IFCHierarchy.getObjectTypeIndex).toBe('function');
    });

    it('should load IFC4 hierarchy', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCWALL')).toBe(true);
    });

    it('should detect direct subtype', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALLSTANDARDCASE', 'IFCWALL')).toBe(true);
    });

    it('should detect transitive subtype', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCROOT')).toBe(true);
    });

    it('should reject unrelated classes', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.isSubtypeOf('IFC4', 'IFCWALL', 'IFCDOOR')).toBe(false);
    });

    it('should return predefinedTypeIndex for IFCWALL', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getPredefinedTypeIndex('IFC4', 'IFCWALL')).toBe(8);
    });

    it('should return null predefinedTypeIndex for IFCROOT', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getPredefinedTypeIndex('IFC4', 'IFCROOT')).toBeNull();
    });

    it('should return objectTypeIndex for IFCWALL', async () => {
        await IFCHierarchy.load('IFC4');
        expect(IFCHierarchy.getObjectTypeIndex('IFC4', 'IFCWALL')).toBe(4);
    });

    it('should return getSubtypes including self', async () => {
        await IFCHierarchy.load('IFC4');
        const subs = IFCHierarchy.getSubtypes('IFC4', 'IFCWALL');
        expect(subs).toContain('IFCWALL');
        expect(subs).toContain('IFCWALLSTANDARDCASE');
    });

    it('should cache load (second call resolves immediately)', async () => {
        await IFCHierarchy.load('IFC4');
        const t0 = performance.now();
        await IFCHierarchy.load('IFC4');
        const dt = performance.now() - t0;
        expect(dt < 50).toBe(true);
    });
});

describe('IFCHierarchy — defensive non-JSON response', () => {
    it('throws a useful error when the hierarchy URL returns HTML', async () => {
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<!DOCTYPE html><html><body>404</body></html>'),
            json: () => Promise.reject(new SyntaxError("Unexpected token '<'"))
        });
        try {
            let err = null;
            try { await IFCHierarchy.load('__nonexistent_version__'); }
            catch (e) { err = e; }
            expect(err !== null).toBe(true);
            const msg = String(err && err.message || '');
            expect(msg.includes('non-JSON')).toBe(true);
            expect(msg.includes('__nonexistent_version__')).toBe(true);
        } finally {
            window.fetch = origFetch;
        }
    });
});
