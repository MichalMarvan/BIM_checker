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
