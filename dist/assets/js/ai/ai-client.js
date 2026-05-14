/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * AI client — direct browser calls to OpenAI-compatible endpoints.
 * Supports streaming via Server-Sent Events. Maps HTTP errors to structured codes.
 */

const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i;

function _isLocalEndpoint(endpoint) {
    return typeof endpoint === 'string' && LOCAL_HOST_RE.test(endpoint);
}

function _browserBlocksHttpLocalhostFor(ua) {
    if (!ua) return false;
    const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
    return !isChromium;
}

/**
 * Classify a fetch() failure (no response) into an actionable code.
 * Only call this when fetch threw before producing a Response.
 * `ctx` overrides allow deterministic tests: { protocol, userAgent }.
 */
export function classifyFetchFailure(endpoint, err, ctx) {
    const protocol = (ctx && ctx.protocol) || (typeof location !== 'undefined' ? location.protocol : '');
    const ua = (ctx && ctx.userAgent) || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const httpEndpoint = typeof endpoint === 'string' && endpoint.startsWith('http://');
    const onHttps = protocol === 'https:';
    const local = _isLocalEndpoint(endpoint);
    if (httpEndpoint && onHttps && _browserBlocksHttpLocalhostFor(ua)) {
        return 'mixed_content';
    }
    if (local) return 'cors_or_down';
    if (err && /abort/i.test(err.name || '')) return 'aborted';
    return 'network';
}

export async function chatCompletion(endpoint, apiKey, model, messages, tools, options = {}) {
    const { temperature = 0.7, maxTokens, signal, onStream } = options;
    const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const body = { model, messages, temperature };
    if (tools?.length) body.tools = tools;
    if (maxTokens) body.max_tokens = maxTokens;
    if (onStream) body.stream = true;

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal
        });
    } catch (fetchErr) {
        const code = classifyFetchFailure(endpoint, fetchErr);
        const err = new Error(fetchErr.message || 'fetch failed');
        err.code = code;
        err.cause = fetchErr;
        throw err;
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const err = new Error(`LLM error (${res.status}): ${errText}`);
        err.status = res.status;
        if (res.status === 401 || res.status === 403) err.code = 'auth';
        else if (res.status === 429) err.code = 'rate_limit';
        else if (res.status >= 500) err.code = 'server';
        else err.code = 'http';
        throw err;
    }

    if (onStream && body.stream) {
        return readStream(res, onStream);
    }

    return res.json();
}

async function readStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    const toolCalls = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
                const json = JSON.parse(line.slice(6));
                const choice = json.choices?.[0];
                const delta = choice?.delta;

                if (delta?.content) {
                    fullContent += delta.content;
                    onChunk(delta.content, fullContent);
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index || 0;
                        if (!toolCalls[idx]) {
                            toolCalls[idx] = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                        }
                        if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                }
            } catch { /* skip malformed SSE line */ }
        }
    }

    const result = {
        choices: [{
            message: {
                role: 'assistant',
                content: fullContent || null
            },
            finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
        }]
    };
    if (toolCalls.length) result.choices[0].message.tool_calls = toolCalls;
    return result;
}

export async function fetchModels(endpoint, apiKey) {
    const url = `${endpoint.replace(/\/+$/, '')}/models`;
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    let res;
    try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    } catch (fetchErr) {
        const code = classifyFetchFailure(endpoint, fetchErr);
        const err = new Error(fetchErr.message || 'fetch failed');
        err.code = code;
        err.cause = fetchErr;
        throw err;
    }
    if (!res.ok) {
        const err = new Error(`Failed to fetch models (${res.status})`);
        err.status = res.status;
        if (res.status === 401 || res.status === 403) err.code = 'auth';
        else if (res.status >= 500) err.code = 'server';
        else err.code = 'http';
        throw err;
    }

    const data = await res.json();
    return (data.data || data.models || []).map(m => m.id || m.name || m).sort();
}

export async function testConnection(endpoint, apiKey) {
    try {
        const models = await fetchModels(endpoint, apiKey);
        return { ok: true, models };
    } catch (err) {
        return { ok: false, error: err.message, code: err.code || 'unknown', status: err.status };
    }
}
