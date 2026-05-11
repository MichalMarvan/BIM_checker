/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-nav', () => {
    let originalPage;

    beforeEach(() => {
        originalPage = document.body.dataset.page;
    });

    afterEach(() => {
        if (originalPage) document.body.dataset.page = originalPage;
        else delete document.body.dataset.page;
        document.querySelectorAll('.bim-mobile-tabs[data-test-injected]').forEach(n => n.remove());
    });

    function injectTabs() {
        const nav = document.createElement('nav');
        nav.className = 'bim-mobile-tabs';
        nav.setAttribute('data-test-injected', '1');
        for (const t of ['home', 'validator', 'parser', 'viewer']) {
            const a = document.createElement('a');
            a.className = 'bim-mobile-tabs__tab';
            a.dataset.tab = t;
            a.textContent = t;
            nav.appendChild(a);
        }
        document.body.appendChild(nav);
        return nav;
    }

    it('highlightActiveTab adds is-active to the matching tab', () => {
        const nav = injectTabs();
        document.body.dataset.page = 'validator';
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(1);
        expect(active[0].dataset.tab).toBe('validator');
    });

    it('highlightActiveTab clears stale is-active classes', () => {
        const nav = injectTabs();
        nav.querySelectorAll('.bim-mobile-tabs__tab').forEach(t => t.classList.add('is-active'));
        document.body.dataset.page = 'home';
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(1);
        expect(active[0].dataset.tab).toBe('home');
    });

    it('highlightActiveTab is a no-op when body has no data-page', () => {
        const nav = injectTabs();
        delete document.body.dataset.page;
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(0);
    });

    it('highlightActiveTab is a no-op when no tabs exist', () => {
        document.body.dataset.page = 'home';
        let threw = false;
        try { window.__bimMobileNav.highlightActiveTab(); } catch (e) { threw = true; }
        expect(threw).toBe(false);
    });

    it('translations include all 4 mobile.nav keys in CS', () => {
        const cs = window.translations && window.translations.cs;
        expect(typeof cs).toBe('object');
        expect(cs['mobile.nav.home']).toBe('Domů');
        expect(cs['mobile.nav.validator']).toBe('Validator');
        expect(cs['mobile.nav.parser']).toBe('Parser');
        expect(cs['mobile.nav.viewer']).toBe('Viewer');
    });

    it('translations include all 4 mobile.nav keys in EN', () => {
        const en = window.translations && window.translations.en;
        expect(typeof en).toBe('object');
        expect(en['mobile.nav.home']).toBe('Home');
        expect(en['mobile.nav.validator']).toBe('Validator');
        expect(en['mobile.nav.parser']).toBe('Parser');
        expect(en['mobile.nav.viewer']).toBe('Viewer');
    });
});
