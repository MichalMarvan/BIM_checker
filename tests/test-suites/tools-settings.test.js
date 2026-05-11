/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('tool-settings', () => {
    let settingsTools;
    let helpers;
    let savedTheme;
    let savedLang;

    beforeEach(async () => {
        settingsTools = await import('../../assets/js/ai/tools/tool-settings.js');
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        savedTheme = localStorage.getItem('theme');
        savedLang = localStorage.getItem('lang');
    });

    afterEach(() => {
        if (savedTheme === null) localStorage.removeItem('theme'); else localStorage.setItem('theme', savedTheme);
        if (savedLang === null) localStorage.removeItem('lang'); else localStorage.setItem('lang', savedLang);
    });

    it('get_theme returns current theme string', async () => {
        const r = await settingsTools.get_theme({});
        expect(typeof r.theme).toBe('string');
    });

    it('set_theme applies dark theme', async () => {
        const r = await settingsTools.set_theme({ theme: 'dark' });
        expect(r.applied).toBe('dark');
    });

    it('set_theme rejects invalid value', async () => {
        let threw = false;
        try { await settingsTools.set_theme({ theme: 'rainbow' }); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('get_language returns current lang', async () => {
        const r = await settingsTools.get_language({});
        expect(['cs', 'en'].includes(r.lang)).toBe(true);
    });

    it('set_language applies en', async () => {
        const r = await settingsTools.set_language({ lang: 'en' });
        expect(r.applied).toBe('en');
    });

    it('set_language rejects invalid lang', async () => {
        let threw = false;
        try { await settingsTools.set_language({ lang: 'fr' }); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('start_wizard returns wrong_page when window.wizard is missing', async () => {
        const orig = window.wizard;
        delete window.wizard;
        try {
            const r = await settingsTools.start_wizard({});
            expect(r.error).toBe('wrong_page');
        } finally {
            if (orig) window.wizard = orig;
        }
    });

    it('start_wizard returns started when wizard exists', async () => {
        const orig = window.wizard;
        let startCalled = false;
        window.wizard = { start: () => { startCalled = true; }, stop: () => {} };
        try {
            const r = await settingsTools.start_wizard({});
            expect(r.started).toBe(true);
            expect(startCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.wizard; else window.wizard = orig;
        }
    });

    it('dismiss_wizard returns dismissed', async () => {
        const orig = window.wizard;
        let stopCalled = false;
        window.wizard = { start: () => {}, stop: () => { stopCalled = true; } };
        try {
            const r = await settingsTools.dismiss_wizard({});
            expect(r.dismissed).toBe(true);
            expect(stopCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.wizard; else window.wizard = orig;
        }
    });

    it('install_pwa returns available:false when no prompt cached', async () => {
        const orig = window.PWA;
        window.PWA = { canInstall: () => false, prompt: async () => ({ available: false }) };
        try {
            const r = await settingsTools.install_pwa({});
            expect(r.available).toBe(false);
        } finally {
            if (orig === undefined) delete window.PWA; else window.PWA = orig;
        }
    });

    it('install_pwa calls PWA.prompt when available', async () => {
        const orig = window.PWA;
        let promptCalled = false;
        window.PWA = { canInstall: () => true, prompt: async () => { promptCalled = true; return { available: true, accepted: true }; } };
        try {
            const r = await settingsTools.install_pwa({});
            expect(r.accepted).toBe(true);
            expect(promptCalled).toBe(true);
        } finally {
            if (orig === undefined) delete window.PWA; else window.PWA = orig;
        }
    });

    it('open_bug_report calls BugReport.open and prefills description', async () => {
        const orig = window.BugReport;
        let opened = false;
        const ta = document.createElement('textarea');
        ta.id = 'bugReportDesc';
        document.body.appendChild(ta);
        window.BugReport = { open: () => { opened = true; } };
        try {
            const r = await settingsTools.open_bug_report({ description: 'lorem ipsum' });
            expect(r.opened).toBe(true);
            expect(opened).toBe(true);
            expect(document.getElementById('bugReportDesc').value).toBe('lorem ipsum');
        } finally {
            ta.remove();
            if (orig === undefined) delete window.BugReport; else window.BugReport = orig;
        }
    });

    it('open_bug_report works without description arg', async () => {
        const orig = window.BugReport;
        window.BugReport = { open: () => {} };
        try {
            const r = await settingsTools.open_bug_report({});
            expect(r.opened).toBe(true);
        } finally {
            if (orig === undefined) delete window.BugReport; else window.BugReport = orig;
        }
    });

    it('register adds 8 tools to executor', async () => {
        const exec = await import('../../assets/js/ai/tool-executor.js');
        exec._resetRegistryForTest();
        let count = 0;
        const fakeRegister = () => { count++; };
        settingsTools.register(fakeRegister);
        expect(count).toBe(8);
        exec._reinitializeForTest();
    });
});
