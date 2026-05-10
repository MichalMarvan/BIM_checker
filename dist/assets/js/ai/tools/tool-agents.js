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

export function register(registerFn) {
    registerFn('list_agents', list_agents);
    registerFn('get_active_agent', get_active_agent);
}
