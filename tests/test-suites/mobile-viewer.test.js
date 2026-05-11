/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-viewer (Phase 12f CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ifc-viewer.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS stacks controls (column) + 16px control-input font (iOS no-zoom)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.controls')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
        expect(block.includes('.control-input')).toBe(true);
        expect(block.includes('font-size: 16px')).toBe(true);
    });

    it('CSS stacks file-list + makes file-card full width', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.file-list')).toBe(true);
        expect(block.includes('.file-card')).toBe(true);
        expect(block.includes('width: 100%')).toBe(true);
    });

    it('CSS enforces 44px touch targets on pagination buttons', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.pagination-controls button')).toBe(true);
        expect(block.includes('min-width: 44px')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });

    it('CSS stacks pagination-container vertically (column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.pagination-container')).toBe(true);
        const stack = block.indexOf('.pagination-container');
        const sub = block.slice(stack, stack + 300);
        expect(sub.includes('flex-direction: column')).toBe(true);
    });
});
