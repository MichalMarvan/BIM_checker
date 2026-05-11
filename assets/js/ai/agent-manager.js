/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
import * as storage from './chat-storage.js';
import { PROVIDERS } from './providers.js';

export async function loadAgents() { return storage.listAgents(); }
export async function loadFavorites() { return storage.listFavorites(); }
export async function getAgent(id) { return storage.getAgent(id); }

export function getEffectiveEndpoint(agent) {
    if (!agent) return '';
    return agent.baseUrl || (PROVIDERS[agent.provider]?.endpoint || '');
}

export function validateUrl(url) {
    if (!url) return false;
    return /^https?:\/\//.test(url);
}
