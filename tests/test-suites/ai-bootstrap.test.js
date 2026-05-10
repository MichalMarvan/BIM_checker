describe('AI bootstrap', () => {
    it('PROVIDERS exposes all 5 providers', async () => {
        const { PROVIDERS } = await import('../../assets/js/ai/providers.js');
        const expected = ['ollama', 'google', 'openai', 'openrouter', 'custom'];
        for (const key of expected) {
            expect(typeof PROVIDERS[key]).toBe('object');
            expect(typeof PROVIDERS[key].name).toBe('string');
            expect(typeof PROVIDERS[key].endpoint).toBe('string');
            expect(typeof PROVIDERS[key].needsKey).toBe('boolean');
        }
    });

    it('detectProvider returns correct keys', async () => {
        const { detectProvider } = await import('../../assets/js/ai/providers.js');
        expect(detectProvider('http://localhost:11434/v1')).toBe('ollama');
        expect(detectProvider('https://api.openai.com/v1')).toBe('openai');
        expect(detectProvider('https://generativelanguage.googleapis.com/v1beta/openai')).toBe('google');
        expect(detectProvider('https://openrouter.ai/api/v1')).toBe('openrouter');
        expect(detectProvider('https://example.com/v1')).toBe('custom');
        expect(detectProvider('')).toBe('custom');
    });

    it('chat-storage exposes the API surface as functions', async () => {
        const storage = await import('../../assets/js/ai/chat-storage.js');
        const expected = ['listAgents','getAgent','saveAgent','deleteAgent',
            'setFavorite','listFavorites','getSettings','updateSettings',
            'listThreads','getThread','createThread','deleteThread','updateThreadTitle',
            'listMessages','appendMessage','clearThread'];
        for (const fn of expected) expect(typeof storage[fn]).toBe('function');
    });

    it('TOOL_DEFINITIONS has 44 entries in Phase 9b', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
        expect(TOOL_DEFINITIONS.length).toBe(44);
    });
});
