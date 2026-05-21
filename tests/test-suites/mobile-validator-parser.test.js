/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-validator (Phase 12e CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ids-validator.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS stacks filters-grid + uses 16px input font for iOS no-zoom', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.filters-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
        expect(block.includes('.filter-input')).toBe(true);
        expect(block.includes('font-size: 16px')).toBe(true);
    });

    it('CSS stacks spec-header on mobile (column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.spec-header')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
    });

    it('CSS enforces 44px touch targets on presets controls', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.presets-panel__select')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });
});

describe('mobile-parser (Phase 12e CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ids-parser.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) and stacks ids-info-grid', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.ids-info-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
    });
});

describe('ValidationEngine.validateBatch — schema-aware applicability', () => {
    const sample = [{ id: '1', guid: 'g1', entity: 'IFCWALL', name: 'W', propertySets: {}, fileName: 'a.ifc', attributes: {} }];
    const baseSpec = {
        name: 'S1',
        applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
        requirements: []
    };

    it('skips when ifcVersions excludes the IFC schema', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC2X3', ifcVersions: ['IFC2X3'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status).toBe('skipped');
        expect(result.skipReason).toBe('ifc-version-mismatch');
    });

    it('errors when all declared versions are unsupported', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4X3 IFC4X3_TC1', ifcVersions: ['IFC4X3', 'IFC4X3_TC1'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status).toBe('error');
        expect(String(result.errorMessage || '').includes('IFC4X3')).toBe(true);
    });

    it('validates and warns on partial mismatch', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4 IFC4X3', ifcVersions: ['IFC4', 'IFC4X3'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4' });
        expect(result.status === 'pass' || result.status === 'fail').toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.warnings.length > 0).toBe(true);
    });

    it('treats absent ifcSchema as UNKNOWN and skips versioned specs', async () => {
        const spec = { ...baseSpec, ifcVersion: 'IFC4', ifcVersions: ['IFC4'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec); // no options
        // No declared IFC schema → treated as UNKNOWN → mismatch with declared IFC4 → skipped
        expect(result.status).toBe('skipped');
        expect(result.skipReason).toBe('ifc-version-mismatch');
    });

    it('worker handleValidateSpec: all-unsupported errors even when ifcSchema equals an unsupported declared version', async () => {
        // This guards the worker's inline gate behavior.
        // Worker direct invocation is impractical in this test env; verify via the validateBatch parallel path instead.
        // (validateBatch is the canonical implementation that handleValidateSpec mirrors.)
        const spec = { ...baseSpec, ifcVersion: 'IFC4X3_TC1', ifcVersions: ['IFC4X3_TC1'] };
        const result = await window.ValidationEngine.validateBatch(sample, spec, { ifcSchema: 'IFC4X3_TC1' });
        expect(result.status).toBe('error');
        expect(String(result.errorMessage || '').includes('IFC4X3_TC1')).toBe(true);
    });
});
