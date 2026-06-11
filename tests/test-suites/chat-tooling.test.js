/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('ai/chat-tooling — tool filtering for agents', () => {
    let tooling, defs;

    beforeEach(async () => {
        tooling = await import('../../assets/js/ai/chat-tooling.js');
        defs = (await import('../../assets/js/ai/tool-defs.js')).TOOL_DEFINITIONS;
    });

    it('explicit enabledTools array filters exactly as before', () => {
        const agent = { provider: 'google', enabledTools: ['list_storage_files', 'run_validation'] };
        const result = tooling.resolveToolsForAgent(agent, 'https://generativelanguage.googleapis.com/v1beta/openai');
        expect(result.length).toBe(2);
        expect(result.map(d => d.function.name).includes('list_storage_files')).toBe(true);
    });

    it('cloud provider with no explicit selection gets the full toolset', () => {
        const agent = { provider: 'google', enabledTools: null };
        const result = tooling.resolveToolsForAgent(agent, 'https://generativelanguage.googleapis.com/v1beta/openai');
        expect(result.length).toBe(defs.length);
    });

    it('local provider (ollama) with no explicit selection gets the slim default set', () => {
        const agent = { provider: 'ollama', enabledTools: null };
        const result = tooling.resolveToolsForAgent(agent, 'http://localhost:11434/v1');
        const names = result.map(d => d.function.name);
        expect(result.length < defs.length).toBe(true);
        expect(names.includes('list_storage_files')).toBe(true);
        expect(names.includes('run_validation')).toBe(true);
        expect(names.includes('get_file_snippet')).toBe(true);
        expect(names.includes('bsdd_search')).toBe(false);
        expect(names.includes('create_agent')).toBe(false);
        expect(names.includes('set_theme')).toBe(false);
    });

    it('custom provider pointing at localhost is treated as local', () => {
        const agent = { provider: 'custom', enabledTools: null };
        const result = tooling.resolveToolsForAgent(agent, 'http://127.0.0.1:1234/v1');
        expect(result.length < defs.length).toBe(true);
    });

    it('explicit enabledTools beats the local default (user can re-enable everything)', () => {
        const agent = { provider: 'ollama', enabledTools: ['bsdd_search', 'create_agent'] };
        const result = tooling.resolveToolsForAgent(agent, 'http://localhost:11434/v1');
        const names = result.map(d => d.function.name);
        expect(names.includes('bsdd_search')).toBe(true);
        expect(names.includes('create_agent')).toBe(true);
        expect(result.length).toBe(2);
    });

    it('every name in DEFAULT_LOCAL_TOOLSET exists in TOOL_DEFINITIONS', () => {
        const all = new Set(defs.map(d => d.function.name));
        for (const name of tooling.DEFAULT_LOCAL_TOOLSET) {
            expect(all.has(name)).toBe(true);
        }
        expect(tooling.DEFAULT_LOCAL_TOOLSET.length > 20).toBe(true);
        expect(tooling.DEFAULT_LOCAL_TOOLSET.length < defs.length).toBe(true);
    });

    it('MAX_TOOL_ITERATIONS is raised to 8', () => {
        expect(tooling.MAX_TOOL_ITERATIONS).toBe(8);
    });
});
