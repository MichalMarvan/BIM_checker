/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-modals (CSS at < 1024px)', () => {
    let modal;

    function injectModal(openClass) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        if (openClass) modal.classList.add(openClass);
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header"><h2>Test</h2><button class="modal-close">×</button></div>
                <div class="modal-body">Body</div>
            </div>`;
        modal.setAttribute('data-test-injected', '1');
        document.body.appendChild(modal);
        return modal;
    }

    afterEach(() => {
        document.querySelectorAll('[data-test-injected="1"]').forEach(n => n.remove());
    });

    it('mobile-nav.css is loaded in test-runner', async () => {
        const sheets = Array.from(document.styleSheets);
        const found = sheets.some(s => (s.href || '').includes('mobile-nav.css'));
        expect(found).toBe(true);
    });

    it('CSS file contains a mobile modal-container override', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('.modal-container')).toBe(true);
        expect(text.includes('max-width: none')).toBe(true);
        expect(text.includes('border-radius: 0')).toBe(true);
    });

    it('CSS handles both .show and .active open states', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('.modal-overlay.show')).toBe(true);
        expect(text.includes('.modal-overlay.active')).toBe(true);
    });

    it('CSS makes modal-header sticky and modal-body scrollable', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('position: sticky')).toBe(true);
        expect(text.includes('overflow-y: auto')).toBe(true);
    });
});
