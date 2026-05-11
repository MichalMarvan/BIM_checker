/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Provider presets — predefined LLM endpoint configurations
 */

export const PROVIDERS = {
    ollama:     { name: 'Ollama',      endpoint: 'http://localhost:11434/v1', needsKey: false },
    google:     { name: 'Google AI',   endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true },
    openai:     { name: 'OpenAI',      endpoint: 'https://api.openai.com/v1', needsKey: true },
    openrouter: { name: 'OpenRouter',  endpoint: 'https://openrouter.ai/api/v1', needsKey: true },
    custom:     { name: 'Custom',      endpoint: '', needsKey: false }
};

export function detectProvider(url) {
    if (!url) return 'custom';
    const lower = url.toLowerCase();
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) return 'ollama';
    if (lower.includes('generativelanguage.googleapis.com')) return 'google';
    if (lower.includes('api.openai.com')) return 'openai';
    if (lower.includes('openrouter.ai')) return 'openrouter';
    return 'custom';
}
