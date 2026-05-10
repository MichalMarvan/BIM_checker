import * as helpers from './_helpers.js';
import * as chatStorage from '../chat-storage.js';

function _safeAgent(a) {
    return {
        id: a.id,
        name: a.name,
        icon: a.icon || '🤖',
        provider: a.provider,
        model: a.model,
        baseUrl: a.baseUrl || '',
        systemPrompt: a.systemPrompt || '',
        temperature: typeof a.temperature === 'number' ? a.temperature : 0.7
    };
}

export async function list_agents() {
    const list = await chatStorage.listAgents();
    return list.map(_safeAgent);
}

export async function get_active_agent() {
    const id = window.__bimAiActiveAgentId;
    if (!id) return { error: 'no_active_agent', message: 'Žádný agent právě neřídí chat.' };
    const agent = await chatStorage.getAgent(id);
    if (!agent) return { error: 'not_found', message: 'Aktivní agent nebyl nalezen v úložišti.' };
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
    const id = await chatStorage.saveAgent({
        name: args.name.trim(),
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

export async function update_agent(args) {
    helpers.validateArgs(args, { id: { required: true } });
    if (window.__bimAiActiveAgentId && args.id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: 'Aktuálně běžící agent nelze měnit. Přepni se na jiného agenta nebo to udělej v UI.' };
    }
    const existing = await chatStorage.getAgent(args.id);
    if (!existing) return { error: 'not_found', message: 'Agent s tímto id neexistuje.' };
    const patch = { id: args.id };
    for (const k of ['name', 'icon', 'provider', 'baseUrl', 'apiKey', 'model', 'systemPrompt', 'temperature']) {
        if (k in args) patch[k] = args[k];
    }
    await chatStorage.saveAgent(patch);
    return { id: args.id, updated: true };
}

export async function delete_agent(args) {
    helpers.validateArgs(args, { id: { required: true } });
    if (window.__bimAiActiveAgentId && args.id === window.__bimAiActiveAgentId) {
        return { error: 'cannot_modify_active', message: 'Aktuálně běžící agent nelze smazat.' };
    }
    const all = await chatStorage.listAgents();
    if (all.length <= 1) {
        return { error: 'last_agent', message: 'Nelze smazat posledního zbývajícího agenta.' };
    }
    const target = all.find(a => a.id === args.id);
    if (!target) return { error: 'not_found' };
    if (!confirm(`Smazat agenta '${target.name}'?`)) return { cancelled: true };
    const ok = await chatStorage.deleteAgent(args.id);
    return { deleted: ok };
}

export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
    registerFn('create_agent', create_agent);
    registerFn('update_agent', update_agent);
    registerFn('delete_agent', delete_agent);
}
