/* SPDX-License-Identifier: AGPL-3.0-or-later */
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

describe('agent-presets', () => {
    let presets;
    let catalog;

    beforeEach(async () => {
        presets = await import('../../assets/js/ai/agent-presets.js');
        catalog = await import('../../assets/js/ai/tool-catalog.js');
    });

    it('AGENT_PRESETS contains exactly 6 presets', async () => {
        expect(presets.AGENT_PRESETS.length).toBe(6);
    });

    it('getPreset returns valid preset for known id', async () => {
        const p = presets.getPreset('validator');
        expect(p.name).toBe('Validator');
        expect(Array.isArray(p.enabledTools)).toBe(true);
        expect(p.enabledTools.includes('run_validation')).toBe(true);
    });

    it('getPreset returns null for unknown id', async () => {
        expect(presets.getPreset('nonexistent')).toBe(null);
    });

    it('general preset has enabledTools=null (means all tools)', async () => {
        expect(presets.getPreset('general').enabledTools).toBe(null);
    });

    it('all preset enabledTools reference valid tool names in catalog', async () => {
        const allNames = new Set(catalog.getAllToolNames());
        for (const p of presets.AGENT_PRESETS) {
            if (!p.enabledTools) continue;
            for (const name of p.enabledTools) {
                expect(allNames.has(name)).toBe(true);
            }
        }
    });
});

describe('chat-panel tool filtering', () => {
    let defs;

    beforeEach(async () => {
        defs = await import('../../assets/js/ai/tool-defs.js');
    });

    it('filter passes all 56 tools when enabledTools is null', async () => {
        const enabledTools = null;
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(56);
    });

    it('filter restricts to whitelist when enabledTools is array', async () => {
        const enabledTools = ['set_theme', 'get_theme', 'list_agents'];
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(3);
        const names = filteredTools.map(t => t.function.name).sort();
        expect(names.includes('get_theme')).toBe(true);
        expect(names.includes('list_agents')).toBe(true);
        expect(names.includes('set_theme')).toBe(true);
    });

    it('filter returns empty array when enabledTools is empty array', async () => {
        const enabledTools = [];
        const filteredTools = (enabledTools && Array.isArray(enabledTools))
            ? defs.TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
            : defs.TOOL_DEFINITIONS;
        expect(filteredTools.length).toBe(0);
    });
});
