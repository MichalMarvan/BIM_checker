/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-chat (Phase 12d bottom sheet)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ai-chat.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block (was 767px before 12d)', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS positions chat panel above bottom tab bar (64px reserve)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.chat-panel')).toBe(true);
        expect(block.includes('64px')).toBe(true);
        expect(block.includes('env(safe-area-inset-bottom')).toBe(true);
    });

    it('CSS adds drag-handle pseudo-element on chat-panel header', () => {
        expect(cssText.includes('.chat-panel__header::before')).toBe(true);
        expect(cssText.includes('width: 40px')).toBe(true);
    });

    it('CSS hides chat-heads-stack on mobile per spec', () => {
        expect(cssText.includes('.chat-heads-stack')).toBe(true);
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.chat-heads-stack')).toBe(true);
    });

    it('chat-panel-mobile.js exposes height state API on window', () => {
        expect(typeof window.__bimChatPanelMobile).toBe('object');
        expect(typeof window.__bimChatPanelMobile.nextState).toBe('function');
        expect(window.__bimChatPanelMobile.nextState('default')).toBe('expanded');
        expect(window.__bimChatPanelMobile.nextState('expanded')).toBe('collapsed');
        expect(window.__bimChatPanelMobile.nextState('collapsed')).toBe('default');
    });
});
