/* SPDX-License-Identifier: AGPL-3.0-or-later */
import * as helpers from './_helpers.js';

function _resolvePresetId(args) {
    if (typeof window.ValidationPresets === 'undefined') throw new Error('ValidationPresets not available');
    if (args && args.id) return { id: args.id };
    if (args && args.name) {
        const matches = window.ValidationPresets.list().filter(p => p.name.trim() === args.name.trim());
        if (matches.length === 0) return { error: 'not_found', message: `Preset "${args.name}" neexistuje.` };
        if (matches.length > 1) {
            return {
                error: 'ambiguous_name',
                candidates: matches.map(p => ({ id: p.id, name: p.name }))
            };
        }
        return { id: matches[0].id };
    }
    return { error: 'missing_identifier', message: 'Zadej id nebo name presetu.' };
}

export async function list_presets() {
    if (typeof window.ValidationPresets === 'undefined') throw new Error('ValidationPresets not available');
    return window.ValidationPresets.list().map(p => ({
        id: p.id,
        name: p.name,
        groupCount: (p.groups || []).length,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt
    }));
}

export async function save_preset(args) {
    helpers.validateArgs(args, { name: { required: true } });
    if (typeof window.ValidationPresets === 'undefined') throw new Error('ValidationPresets not available');
    let groups;
    if (args.useCurrentGroups && Array.isArray(window.validationGroups)) {
        groups = window.ValidationPresets.toPresetGroups(window.validationGroups);
    } else {
        const last = window.ValidationPresets.loadLastSession();
        groups = (last && Array.isArray(last.groups)) ? last.groups : [];
    }
    if (groups.length === 0) {
        return { error: 'no_groups', message: 'Nejsou žádné skupiny k uložení (validator je prázdný a žádný last-session preset).' };
    }
    const id = window.ValidationPresets.save(args.name.trim(), groups);
    return { presetId: id, groupCount: groups.length };
}

export async function delete_preset(args) {
    const resolved = _resolvePresetId(args);
    if (resolved.error) return resolved;
    const preset = window.ValidationPresets.get(resolved.id);
    if (!preset) return { error: 'not_found' };
    if (!confirm(`Smazat preset '${preset.name}'?`)) return { cancelled: true };
    const ok = window.ValidationPresets.delete(resolved.id);
    return { deleted: ok };
}

async function _applyPresetToLastSession(presetId, andNavigate) {
    const preset = window.ValidationPresets.get(presetId);
    if (!preset) return { error: 'not_found' };
    window.ValidationPresets.saveLastSession(preset.groups || []);
    window.ValidationPresets.flushLastSession();
    window.dispatchEvent(new CustomEvent('ai:applyLastSession'));
    const onValidator = helpers.getCurrentPageId() === 'validator';
    if (!onValidator && andNavigate) {
        try { localStorage.setItem('bim_validator_autorun', '1'); } catch (e) {}
        const targetUrl = (location.pathname.includes('/pages/'))
            ? './ids-ifc-validator.html'
            : './pages/ids-ifc-validator.html';
        load_preset._timer = setTimeout(() => { window.location.href = targetUrl; }, 150);
        return { applied: true, navigating: true, presetId };
    }
    return { applied: true, presetId, appliedTo: onValidator ? 'live UI' : 'last-session preset' };
}

export async function load_preset(args) {
    const resolved = _resolvePresetId(args);
    if (resolved.error) return resolved;
    return _applyPresetToLastSession(resolved.id, !!args.andNavigate);
}

export async function apply_preset(args) {
    helpers.validateArgs(args, { presetName: { required: true } });
    const resolved = _resolvePresetId({ name: args.presetName });
    if (resolved.error) return resolved;
    return _applyPresetToLastSession(resolved.id, true);
}

export function register(registerFn) {
    registerFn('list_presets', list_presets);
    registerFn('save_preset', save_preset);
    registerFn('delete_preset', delete_preset);
    registerFn('load_preset', load_preset);
    registerFn('apply_preset', apply_preset);
}
