/**
 * Routes tool calls dispatched by the AI to handler functions.
 * REGISTRY is populated at module load via _bootstrap() — each tool sub-module
 * exports register() and gets called once.
 */

import * as storageTools from './tools/tool-storage.js';
import * as validatorTools from './tools/tool-validator.js';
import * as idsTools from './tools/tool-ids.js';
import * as ifcTools from './tools/tool-ifc.js';
import * as uiTools from './tools/tool-ui.js';
import * as settingsTools from './tools/tool-settings.js';
import * as agentTools from './tools/tool-agents.js';
import * as presetTools from './tools/tool-presets.js';

const REGISTRY = {};

export function _registerTool(name, fn) {
    REGISTRY[name] = fn;
}

function _bootstrap() {
    storageTools.register(_registerTool);
    validatorTools.register(_registerTool);
    idsTools.register(_registerTool);
    ifcTools.register(_registerTool);
    uiTools.register(_registerTool);
    settingsTools.register(_registerTool);
    agentTools.register(_registerTool);
    presetTools.register(_registerTool);
}

_bootstrap();

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
export function _reinitializeForTest() {
    _resetRegistryForTest();
    _bootstrap();
}
