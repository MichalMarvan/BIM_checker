/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
import * as helpers from './_helpers.js';
import * as chatStorage from '../chat-storage.js';
function t(key, params) { return (typeof window.t === 'function') ? window.t(key, params) : key; }

function _safeAgent(a) {
    return {
        id: a.id,
        name: a.name,
        icon: a.icon || '🤖',
        provider: a.provider,
        model: a.model,
        baseUrl: a.baseUrl || '',
        systemPrompt: a.systemPrompt || '',
        temperature: typeof a.temperature === 'number' ? a.temperature : 0.7,
        enabledTools: a.enabledTools || null
    };
}

export async function list_agents() {
    const list = await chatStorage.listAgents();
    return list.map(_safeAgent);
}

export async function get_active_agent() {
    const id = window.__bimAiActiveAgentId;
    if (!id) return { error: 'no_active_agent', message: t('ai.tool.agents.noActive') };
    const agent = await chatStorage.getAgent(id);
    if (!agent) return { error: 'not_found', message: t('ai.tool.agents.activeNotFound') };
    return _safeAgent(agent);
}

export async function create_agent(args) {
    helpers.validateArgs(args, {
        name: { required: true },
        provider: { required: true },
        model: { required: true },
        apiKey: { required: true }
    });
    if (typeof args.name !== 'string' || args.name.trim().length === 0) {
        throw new Error('name must be a non-empty string');
    }
    const trimmedName = args.name.trim();
    const existing = await chatStorage.listAgents();
    const dup = existing.find(a => a.name.trim() === trimmedName);
    if (dup) {
        return { error: 'duplicate_name', existingId: dup.id, message: `Agent "${trimmedName}" už existuje (id ${dup.id}). Použij update_agent nebo zvol jiné jméno.` };
    }
    const id = await chatStorage.saveAgent({
        name: trimmedName,
        provider: args.provider,
        model: args.model,
        apiKey: args.apiKey,
        systemPrompt: args.systemPrompt || '',
        temperature: typeof args.temperature === 'number' ? args.temperature : 0.7,
        icon: args.icon || '🤖',
        baseUrl: args.baseUrl || ''
    });
    return { id, created: true };
}

async function _resolveAgentId(args) {
    if (args && args.id) return { id: args.id };
    if (args && args.name) {
        const all = await chatStorage.listAgents();
        const matches = all.filter(a => a.name.trim() === args.name.trim());
        if (matches.length === 0) return { error: 'not_found', message: `Agent "${args.name}" neexistuje.` };
        if (matches.length > 1) {
            return {
                error: 'ambiguous_name',
                message: `Více agentů má jméno "${args.name}". Zavolej znovu s id konkrétního.`,
                candidates: matches.map(a => ({ id: a.id, name: a.name }))
            };
        }
        return { id: matches[0].id };
    }
    return { error: 'missing_identifier', message: t('ai.tool.agents.missingIdentifier') };
}

export async function update_agent(args) {
    const resolved = await _resolveAgentId(args);
    if (resolved.error) return resolved;
    const id = resolved.id;
    if (window.__bimAiActiveAgentId && id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: t('ai.tool.agents.cannotModifyActive') };
    }
    const existing = await chatStorage.getAgent(id);
    if (!existing) return { error: 'not_found', message: t('ai.tool.agents.notFound') };
    // If only `name` was provided (no id), it's a lookup key, not a rename.
    // Otherwise treat name as a rename target.
    const isRename = !!args.id;
    const patch = { id, name: existing.name };
    for (const k of ['icon', 'provider', 'baseUrl', 'apiKey', 'model', 'systemPrompt', 'temperature']) {
        if (k in args) patch[k] = args[k];
    }
    if (isRename && 'name' in args) patch.name = args.name;
    await chatStorage.saveAgent(patch);
    return { id, updated: true };
}

export async function delete_agent(args) {
    const resolved = await _resolveAgentId(args);
    if (resolved.error) return resolved;
    const id = resolved.id;
    if (window.__bimAiActiveAgentId && id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: t('ai.tool.agents.cannotDeleteActive') };
    }
    const all = await chatStorage.listAgents();
    if (all.length <= 1) {
        return { error: 'last_agent', message: t('ai.tool.agents.lastAgent') };
    }
    const target = all.find(a => a.id === id);
    if (!target) return { error: 'not_found', message: t('ai.tool.agents.notFound') };
    if (!confirm(`Smazat agenta '${target.name}'?`)) return { cancelled: true };
    const ok = await chatStorage.deleteAgent(id);
    return { deleted: ok };
}

export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
    registerFn('create_agent', create_agent);
    registerFn('update_agent', update_agent);
    registerFn('delete_agent', delete_agent);
}
