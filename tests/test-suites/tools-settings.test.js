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

    it('register adds 4 tools to executor', async () => {
        const exec = await import('../../assets/js/ai/tool-executor.js');
        exec._resetRegistryForTest();
        let count = 0;
        const fakeRegister = () => { count++; };
        settingsTools.register(fakeRegister);
        expect(count).toBe(4);
        exec._reinitializeForTest();
    });
});
