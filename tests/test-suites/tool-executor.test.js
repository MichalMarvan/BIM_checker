describe('tool-executor', () => {
    let executor;

    beforeEach(async () => {
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
    });

    it('executeToolCall returns unknown_tool for unregistered name', async () => {
        const result = await executor.executeToolCall({ name: 'no_such', arguments: {} });
        expect(result.error).toBe('unknown_tool');
        expect(result.name).toBe('no_such');
    });

    it('executeToolCall calls registered handler with args', async () => {
        let received = null;
        executor._registerTool('test_tool', async (args) => { received = args; return { ok: true }; });
        const result = await executor.executeToolCall({ name: 'test_tool', arguments: { x: 5 } });
        expect(received.x).toBe(5);
        expect(result.ok).toBe(true);
    });

    it('executeToolCall wraps thrown errors in execution_error', async () => {
        executor._registerTool('boom', async () => { throw new Error('kaboom'); });
        const result = await executor.executeToolCall({ name: 'boom', arguments: {} });
        expect(result.error).toBe('execution_error');
        expect(result.message).toBe('kaboom');
        expect(result.tool).toBe('boom');
    });

    it('_registrySizeForTest reflects registered tools', async () => {
        expect(executor._registrySizeForTest()).toBe(0);
        executor._registerTool('a', async () => ({}));
        executor._registerTool('b', async () => ({}));
        expect(executor._registrySizeForTest()).toBe(2);
    });

    it('_resetRegistryForTest clears all entries', async () => {
        executor._registerTool('a', async () => ({}));
        executor._resetRegistryForTest();
        expect(executor._registrySizeForTest()).toBe(0);
    });
});
