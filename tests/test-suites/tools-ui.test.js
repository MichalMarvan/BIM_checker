/* SPDX-License-Identifier: AGPL-3.0-or-later */
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

    it('request_user_attention calls ErrorHandler.info by default', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ui.js');
        const orig = window.ErrorHandler;
        let called = null;
        window.ErrorHandler = {
            info: (msg) => { called = { kind: 'info', msg }; },
            warning: () => {},
            error: () => {},
            success: () => {}
        };
        try {
            const r = await tools.request_user_attention({ message: 'hello' });
            expect(r.shown).toBe(true);
            expect(r.kind).toBe('info');
            expect(called.msg).toBe('hello');
        } finally {
            window.ErrorHandler = orig;
        }
    });

    it('request_user_attention returns invalid_kind for unknown kind', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ui.js');
        const orig = window.ErrorHandler;
        window.ErrorHandler = { info: () => {}, error: () => {} };
        try {
            const r = await tools.request_user_attention({ message: 'x', kind: 'rainbow' });
            expect(r.error).toBe('invalid_kind');
        } finally {
            window.ErrorHandler = orig;
        }
    });

    it('register() adds 3 tools to executor', async () => {
        uiTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(3);
    });
});
