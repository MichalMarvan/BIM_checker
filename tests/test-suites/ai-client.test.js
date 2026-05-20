/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('ai-client', () => {
    let client;
    let originalFetch;

    beforeEach(async () => {
        client = await import('../../assets/js/ai/ai-client.js');
        originalFetch = window.fetch;
    });

    afterEach(() => {
        window.fetch = originalFetch;
    });

    function mockFetch(responseFn) {
        window.fetch = (...args) => Promise.resolve(responseFn(...args));
    }

    it('chatCompletion sends correct body with model + messages + temperature', async () => {
        let captured = null;
        mockFetch((url, opts) => {
            captured = { url, body: JSON.parse(opts.body) };
            return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
                { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
        await client.chatCompletion('https://api.example.com/v1', 'key123', 'm1',
            [{ role: 'user', content: 'hi' }], [], { temperature: 0.5 });
        expect(captured.url).toBe('https://api.example.com/v1/chat/completions');
        expect(captured.body.model).toBe('m1');
        expect(captured.body.messages[0].content).toBe('hi');
        expect(captured.body.temperature).toBe(0.5);
    });

    it('chatCompletion adds Authorization header when apiKey present', async () => {
        let capturedHeaders = null;
        mockFetch((url, opts) => {
            capturedHeaders = opts.headers;
            return new Response('{}', { status: 200 });
        });
        await client.chatCompletion('https://api.example.com/v1', 'sk-abc', 'm', [], []);
        expect(capturedHeaders['Authorization']).toBe('Bearer sk-abc');
    });

    it('chatCompletion does not add Authorization when apiKey empty', async () => {
        let capturedHeaders = null;
        mockFetch((url, opts) => {
            capturedHeaders = opts.headers;
            return new Response('{}', { status: 200 });
        });
        await client.chatCompletion('https://api.example.com/v1', '', 'm', [], []);
        expect(capturedHeaders['Authorization']).toBe(undefined);
    });

    it('chatCompletion 401 throws with code "auth"', async () => {
        mockFetch(() => new Response('Unauthorized', { status: 401 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err !== undefined).toBe(true);
        expect(err.status).toBe(401);
        expect(err.code).toBe('auth');
    });

    it('chatCompletion 429 throws with code "rate_limit"', async () => {
        mockFetch(() => new Response('Too many', { status: 429 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err.code).toBe('rate_limit');
    });

    it('chatCompletion 500 throws with code "server"', async () => {
        mockFetch(() => new Response('Boom', { status: 500 }));
        let err;
        try { await client.chatCompletion('https://api.example.com/v1', '', 'm', []); }
        catch (e) { err = e; }
        expect(err.code).toBe('server');
    });

    it('fetchModels returns sorted array of ids', async () => {
        mockFetch(() => new Response(
            JSON.stringify({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] }),
            { status: 200 }));
        const models = await client.fetchModels('https://api.example.com/v1', 'k');
        expect(models[0]).toBe('gpt-3.5');
        expect(models[1]).toBe('gpt-4');
    });

    it('testConnection returns {ok:true, models} on success', async () => {
        mockFetch(() => new Response(
            JSON.stringify({ data: [{ id: 'm1' }] }),
            { status: 200 }));
        const result = await client.testConnection('https://api.example.com/v1', 'k');
        expect(result.ok).toBe(true);
        expect(result.models[0]).toBe('m1');
    });

    it('testConnection returns {ok:false, error} on failure', async () => {
        mockFetch(() => new Response('nope', { status: 404 }));
        const result = await client.testConnection('https://api.example.com/v1', 'k');
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('classifyFetchFailure: HTTPS page + Firefox UA + http://localhost → mixed_content', () => {
        const code = client.classifyFetchFailure(
            'http://localhost:11434/v1',
            new TypeError('Failed to fetch'),
            { protocol: 'https:', userAgent: 'Mozilla/5.0 Firefox/124.0' }
        );
        expect(code).toBe('mixed_content');
    });

    it('classifyFetchFailure: HTTPS page + Chrome UA + http://localhost → cors_or_down (Chromium allows localhost)', () => {
        const code = client.classifyFetchFailure(
            'http://localhost:11434/v1',
            new TypeError('Failed to fetch'),
            { protocol: 'https:', userAgent: 'Mozilla/5.0 Chrome/124.0' }
        );
        expect(code).toBe('cors_or_down');
    });

    it('classifyFetchFailure: HTTP page + http://localhost → cors_or_down (no mixed content possible)', () => {
        const code = client.classifyFetchFailure(
            'http://localhost:11434/v1',
            new TypeError('Failed to fetch'),
            { protocol: 'http:', userAgent: 'Mozilla/5.0 Firefox/124.0' }
        );
        expect(code).toBe('cors_or_down');
    });

    it('classifyFetchFailure: remote HTTPS endpoint → network', () => {
        const code = client.classifyFetchFailure(
            'https://api.example.com/v1',
            new TypeError('Failed to fetch'),
            { protocol: 'https:', userAgent: 'Mozilla/5.0 Chrome/124.0' }
        );
        expect(code).toBe('network');
    });

    it('classifyFetchFailure: AbortError → aborted', () => {
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        const code = client.classifyFetchFailure(
            'https://api.example.com/v1',
            abortErr,
            { protocol: 'https:', userAgent: 'Mozilla/5.0 Chrome/124.0' }
        );
        expect(code).toBe('aborted');
    });

    it('fetchModels attaches err.code when fetch throws TypeError', async () => {
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
        let err;
        try { await client.fetchModels('http://localhost:11434/v1', ''); }
        catch (e) { err = e; }
        expect(err !== undefined).toBe(true);
        const validCodes = ['mixed_content', 'cors_or_down', 'network'];
        expect(validCodes.includes(err.code)).toBe(true);
    });

    it('testConnection returns structured code on fetch-level failure', async () => {
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
        const result = await client.testConnection('http://localhost:11434/v1', '');
        expect(result.ok).toBe(false);
        const validCodes = ['mixed_content', 'cors_or_down', 'network'];
        expect(validCodes.includes(result.code)).toBe(true);
    });

    it('chatCompletion attaches err.code when fetch throws', async () => {
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
        let err;
        try { await client.chatCompletion('http://localhost:11434/v1', '', 'm', [{ role: 'user', content: 'hi' }], []); }
        catch (e) { err = e; }
        expect(err !== undefined).toBe(true);
        const validCodes = ['mixed_content', 'cors_or_down', 'network'];
        expect(validCodes.includes(err.code)).toBe(true);
    });
});
