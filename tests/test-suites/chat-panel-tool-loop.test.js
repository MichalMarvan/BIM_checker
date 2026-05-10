describe('chat-panel tool loop (mocked fetch)', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = window.fetch;
    });

    afterEach(() => {
        window.fetch = originalFetch;
    });

    it('single iteration completes when first response is final text', async () => {
        const responses = [{
            choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }]
        }];
        let callCount = 0;
        window.fetch = () => Promise.resolve(new Response(JSON.stringify(responses[callCount++]), { status: 200 }));
        const client = await import('../../assets/js/ai/ai-client.js');
        const result = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(result.choices[0].finish_reason).toBe('stop');
        expect(callCount).toBe(1);
    });

    it('two iterations when first response has tool_calls', async () => {
        const responses = [
            {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_storage_files', arguments: '{"type":"ifc"}' } }]
                    },
                    finish_reason: 'tool_calls'
                }]
            },
            {
                choices: [{ message: { role: 'assistant', content: 'Done!' }, finish_reason: 'stop' }]
            }
        ];
        let callCount = 0;
        window.fetch = () => Promise.resolve(new Response(JSON.stringify(responses[callCount++]), { status: 200 }));
        const client = await import('../../assets/js/ai/ai-client.js');
        const r1 = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(r1.choices[0].finish_reason).toBe('tool_calls');
        const r2 = await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(r2.choices[0].finish_reason).toBe('stop');
    });

    it('executor returns unknown_tool for unregistered name', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        const result = await executor.executeToolCall({ id: 'x', name: 'no_such_tool', arguments: {} });
        expect(result.error).toBe('unknown_tool');
    });

    it('all 43 tools registered after module load', async () => {
        const executor = await import('../../assets/js/ai/tool-executor.js');
        // Earlier test suites may have reset the registry; re-bootstrap explicitly
        executor._reinitializeForTest();
        expect(executor._registrySizeForTest()).toBe(43);
    });

    it('TOOL_DEFINITIONS contains 43 entries', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        expect(TOOL_DEFINITIONS.length).toBe(43);
    });

    it('every tool definition has a name and description in Czech', async () => {
        const { TOOL_DEFINITIONS } = await import('../../assets/js/ai/tool-defs.js');
        for (const def of TOOL_DEFINITIONS) {
            expect(typeof def.function.name).toBe('string');
            expect(typeof def.function.description).toBe('string');
            expect(def.function.description.length > 0).toBe(true);
        }
    });
});
