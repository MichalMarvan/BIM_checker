/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-homepage (CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/index.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1024px) breakpoint for homepage', () => {
        expect(cssText.includes('@media (max-width: 1024px)')).toBe(true);
    });

    it('CSS stacks card-header on mobile (flex-direction: column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.card-header')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
    });

    it('CSS enforces 44px touch targets on .btn-icon-modern (WCAG 2.5.5)', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.btn-icon-modern')).toBe(true);
        expect(block.includes('min-width: 44px')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });

    it('CSS stacks tools-grid-modern and about-grid at < 1024px', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.tools-grid-modern')).toBe(true);
        expect(block.includes('.about-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
    });
});
