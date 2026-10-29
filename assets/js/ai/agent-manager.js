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

export function isLocalEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        const host = url.hostname.toLowerCase();
        return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
    } catch {
        return false;
    }
}

export function validateUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalEndpoint(url));
    } catch {
        return false;
    }
}
