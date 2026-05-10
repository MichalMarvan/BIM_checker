describe('tools/tool-ui', () => {
    let uiTools, helpers, executor;

    beforeEach(async () => {
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        uiTools = await import('../../assets/js/ai/tools/tool-ui.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
    });

    afterEach(() => {
        helpers._setCurrentPageForTest(null);
    });

    it('get_current_page returns home when override is home', async () => {
        helpers._setCurrentPageForTest('home');
        const result = await uiTools.get_current_page({});
        expect(result.page).toBe('home');
    });

    it('get_current_page returns validator when override is validator', async () => {
        helpers._setCurrentPageForTest('validator');
        const result = await uiTools.get_current_page({});
        expect(result.page).toBe('validator');
    });

    it('navigate_to_page returns navigating with target', async () => {
        const result = await uiTools.navigate_to_page({ page: 'validator' });
        clearTimeout(result._timer);
        expect(result.navigating).toBe(true);
        expect(result.target).toBe('validator');
        expect(typeof result.warning).toBe('string');
    });

    it('navigate_to_page throws on invalid page', async () => {
        let threw = false;
        try { await uiTools.navigate_to_page({ page: 'admin' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('register() adds 2 tools to executor', async () => {
        uiTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(2);
    });
});
