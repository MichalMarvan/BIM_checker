/**
 * Routes tool calls dispatched by the AI to handler functions.
 * Phase 8: REGISTRY is populated as each task adds tools.
 */

const REGISTRY = {};

export function _registerTool(name, fn) {
    REGISTRY[name] = fn;
}

export async function executeToolCall(toolCall) {
    const name = toolCall?.name;
    const args = toolCall?.arguments;
    const fn = REGISTRY[name];
    if (!fn) return { error: 'unknown_tool', name };
    try {
        return await fn(args);
    } catch (e) {
        console.warn('[tool-executor]', name, 'failed:', e);
        return { error: 'execution_error', message: e.message, tool: name };
    }
}

export function _registrySizeForTest() { return Object.keys(REGISTRY).length; }
export function _resetRegistryForTest() {
    for (const k of Object.keys(REGISTRY)) delete REGISTRY[k];
}
