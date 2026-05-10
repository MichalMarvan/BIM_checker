describe('settings tool picker (state logic)', () => {
    let catalog;

    beforeEach(async () => {
        catalog = await import('../../assets/js/ai/tool-catalog.js');
    });

    it('null enabledTools means all 56 enabled', async () => {
        const enabledTools = null;
        const enabledSet = enabledTools === null || enabledTools === undefined
            ? new Set(catalog.TOOL_CATEGORIES.flatMap(c => c.tools.map(t => t.name)))
            : new Set(enabledTools);
        expect(enabledSet.size).toBe(56);
    });

    it('subset enabledTools restricts to those names', async () => {
        const enabledTools = ['get_theme', 'set_theme'];
        const enabledSet = new Set(enabledTools);
        expect(enabledSet.has('get_theme')).toBe(true);
        expect(enabledSet.has('list_agents')).toBe(false);
    });

    it('collect counts: full whitelist returns null (default)', async () => {
        const checked = catalog.getAllToolNames();
        const result = checked.length === catalog.TOTAL_TOOLS ? null : checked;
        expect(result).toBe(null);
    });

    it('collect counts: partial returns array', async () => {
        const checked = ['get_theme', 'set_theme', 'list_agents'];
        const result = checked.length === catalog.TOTAL_TOOLS ? null : checked;
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
    });
});
