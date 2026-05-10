describe('tool-catalog', () => {
    let catalog;
    let defs;

    beforeEach(async () => {
        catalog = await import('../../assets/js/ai/tool-catalog.js');
        defs = await import('../../assets/js/ai/tool-defs.js');
    });

    it('TOOL_CATEGORIES covers exactly all 56 tool names from TOOL_DEFINITIONS', async () => {
        const catalogNames = new Set(catalog.getAllToolNames());
        const defNames = new Set(defs.TOOL_DEFINITIONS.map(d => d.function.name));
        expect(catalogNames.size).toBe(56);
        expect(defNames.size).toBe(56);
        let missing = 0;
        for (const n of defNames) if (!catalogNames.has(n)) missing++;
        expect(missing).toBe(0);
    });

    it('TOTAL_TOOLS equals 56', async () => {
        expect(catalog.TOTAL_TOOLS).toBe(56);
    });

    it('getCategoryForTool returns correct category for known tool', async () => {
        expect(catalog.getCategoryForTool('set_theme')).toBe('settings');
        expect(catalog.getCategoryForTool('move_file')).toBe('storage');
        expect(catalog.getCategoryForTool('apply_preset')).toBe('presets');
        expect(catalog.getCategoryForTool('compare_ifc_files')).toBe('ifc');
    });

    it('getCategoryForTool returns null for unknown tool', async () => {
        expect(catalog.getCategoryForTool('nonexistent_tool_xyz')).toBe(null);
    });

    it('no tool name appears in more than one category', async () => {
        const allNames = catalog.getAllToolNames();
        const unique = new Set(allNames);
        expect(unique.size).toBe(allNames.length);
    });
});
