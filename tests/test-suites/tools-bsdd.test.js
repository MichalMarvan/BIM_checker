describe('tool-bsdd (gated stubs)', () => {
    let bsddTools;

    beforeEach(async () => {
        bsddTools = await import('../../assets/js/ai/tools/tool-bsdd.js');
    });

    it('bsdd_search returns integration_disabled', async () => {
        const r = await bsddTools.bsdd_search({ query: 'wall' });
        expect(r.error).toBe('integration_disabled');
    });

    it('bsdd_get_property returns integration_disabled', async () => {
        const r = await bsddTools.bsdd_get_property({ uri: 'https://example/x' });
        expect(r.error).toBe('integration_disabled');
    });

    it('bsdd_search throws on missing query', async () => {
        let threw = false;
        try { await bsddTools.bsdd_search({}); } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('register adds 2 tools', async () => {
        let count = 0;
        bsddTools.register(() => { count++; });
        expect(count).toBe(2);
    });
});
