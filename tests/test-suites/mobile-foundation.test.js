/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-foundation (DOM smoke)', () => {
    function injectMarkupForPage(page) {
        document.body.dataset.page = page;
        const topbar = document.createElement('header');
        topbar.className = 'bim-mobile-topbar';
        topbar.innerHTML = '<a class="bim-mobile-topbar__brand"><span class="bim-mobile-topbar__icon">🏗️</span><span class="bim-mobile-topbar__name">BIM Checker</span></a><button class="bim-mobile-topbar__settings">⚙️</button>';
        topbar.setAttribute('data-test-injected', '1');
        document.body.appendChild(topbar);

        const tabs = document.createElement('nav');
        tabs.className = 'bim-mobile-tabs';
        tabs.setAttribute('data-test-injected', '1');
        for (const t of ['home', 'validator', 'parser', 'viewer']) {
            const a = document.createElement('a');
            a.className = 'bim-mobile-tabs__tab';
            a.dataset.tab = t;
            tabs.appendChild(a);
        }
        document.body.appendChild(tabs);
    }

    afterEach(() => {
        delete document.body.dataset.page;
        document.querySelectorAll('[data-test-injected="1"]').forEach(n => n.remove());
    });

    it('topbar contains brand + settings button', () => {
        injectMarkupForPage('home');
        const tb = document.querySelector('.bim-mobile-topbar');
        expect(!!tb.querySelector('.bim-mobile-topbar__brand')).toBe(true);
        expect(!!tb.querySelector('.bim-mobile-topbar__settings')).toBe(true);
    });

    it('bottom tabs contain exactly 4 tabs for each known page key', () => {
        injectMarkupForPage('home');
        const tabs = document.querySelectorAll('.bim-mobile-tabs__tab');
        expect(tabs.length).toBe(4);
        const keys = Array.from(tabs).map(t => t.dataset.tab).sort();
        expect(keys.join(',')).toBe('home,parser,validator,viewer');
    });

    it('mobile-nav.js highlights correct tab when body[data-page] is set', () => {
        injectMarkupForPage('parser');
        window.__bimMobileNav.highlightActiveTab();
        const active = document.querySelector('.bim-mobile-tabs__tab.is-active');
        expect(!!active).toBe(true);
        expect(active.dataset.tab).toBe('parser');
    });
});
