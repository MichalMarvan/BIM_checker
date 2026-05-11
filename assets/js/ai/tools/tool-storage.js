/* SPDX-License-Identifier: AGPL-3.0-or-later */
import * as helpers from './_helpers.js';

function _buildFolderPath(foldersMap, folderId) {
    const names = [];
    let cur = foldersMap[folderId];
    while (cur) {
        // Use stable ID 'root' for root folder instead of the localized name
        names.unshift(cur.id === 'root' ? 'root' : cur.name);
        if (!cur.parent) break;
        cur = foldersMap[cur.parent];
    }
    return names.join('/');
}

function _collectDescendantFolderIds(foldersMap, rootId) {
    const result = new Set([rootId]);
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop();
        const f = foldersMap[id];
        if (!f) continue;
        for (const child of (f.children || [])) {
            if (!result.has(child)) {
                result.add(child);
                stack.push(child);
            }
        }
    }
    return result;
}

function _resolveFolderId(foldersMap, nameOrPath) {
    if (!nameOrPath || nameOrPath === 'root') return { id: 'root' };
    const needle = String(nameOrPath).toLowerCase();
    const matches = Object.values(foldersMap).filter(f => {
        if (f.id === 'root') return false;
        if (f.name.toLowerCase() === needle) return true;
        const path = _buildFolderPath(foldersMap, f.id).toLowerCase();
        return path === needle || path.endsWith('/' + needle);
    });
    if (matches.length === 0) return { error: 'not_found', message: `Složka "${nameOrPath}" neexistuje.` };
    if (matches.length > 1) {
        return {
            error: 'ambiguous_folder',
            message: `Více složek odpovídá "${nameOrPath}". Zadej úplnou cestu.`,
            candidates: matches.map(f => ({ id: f.id, path: _buildFolderPath(foldersMap, f.id) }))
        };
    }
    return { id: matches[0].id };
}

export async function list_storage_files(args) {
    helpers.validateArgs(args, { type: { required: true, enum: ['ifc', 'ids'] } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folders = sm.data.folders || {};
    const files = Object.values(sm.data.files || {});

    let matchIds = null;
    if (args.folder) {
        const needle = String(args.folder).toLowerCase();
        const matchedRoots = Object.values(folders).filter(f => {
            const path = _buildFolderPath(folders, f.id).toLowerCase();
            return path.includes(needle);
        });
        const allMatched = new Set();
        for (const root of matchedRoots) {
            for (const id of _collectDescendantFolderIds(folders, root.id)) allMatched.add(id);
        }
        matchIds = allMatched;
    }

    const out = [];
    for (const f of files) {
        if (matchIds && !matchIds.has(f.folder)) continue;
        out.push({
            name: f.name,
            size: f.size,
            folder: _buildFolderPath(folders, f.folder) || 'root',
            modifiedAt: f.modifiedAt || f.uploadDate
        });
    }
    return out;
}

export async function list_storage_folders(args) {
    helpers.validateArgs(args, { type: { required: true, enum: ['ifc', 'ids'] } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folders = sm.data.folders || {};
    const filesMap = sm.data.files || {};
    const out = [];
    for (const f of Object.values(folders)) {
        const path = _buildFolderPath(folders, f.id) || 'root';
        const fileNames = (f.files || [])
            .map(fid => filesMap[fid])
            .filter(Boolean)
            .map(file => file.name);
        out.push({
            name: path,
            fileCount: fileNames.length,
            files: fileNames
        });
    }
    out.sort((a, b) => (b.fileCount - a.fileCount) || a.name.localeCompare(b.name));
    return out;
}

export async function delete_file_from_storage(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (!confirm(`Smazat soubor '${args.name}' z úložiště?`)) return { cancelled: true };
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    await sm.deleteFile(file.id);
    return { deleted: true };
}

export async function create_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folders = sm.data.folders;
    const parentResolution = _resolveFolderId(folders, args.parentName || 'root');
    if (parentResolution.error) return parentResolution;
    const folderId = await sm.createFolder(args.name.trim(), parentResolution.id);
    return { folderId, path: _buildFolderPath(folders, folderId) };
}

export async function rename_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        folderName: { required: true },
        newName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const resolved = _resolveFolderId(sm.data.folders, args.folderName);
    if (resolved.error) return resolved;
    if (resolved.id === 'root') return { error: 'cannot_modify_root', message: 'Kořenovou složku nelze přejmenovat.' };
    const ok = await sm.renameFolder(resolved.id, args.newName.trim());
    return { renamed: ok, folderId: resolved.id };
}

export async function delete_folder(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        folderName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const resolved = _resolveFolderId(sm.data.folders, args.folderName);
    if (resolved.error) return resolved;
    if (resolved.id === 'root') return { error: 'cannot_modify_root', message: 'Kořenovou složku nelze smazat.' };
    const folder = sm.data.folders[resolved.id];
    const fileCount = (folder.files || []).length;
    if (!confirm(`Smazat složku '${folder.name}' (${fileCount} souborů + podsložky)?`)) {
        return { cancelled: true };
    }
    const ok = await sm.deleteFolder(resolved.id);
    return { deleted: ok };
}

export async function move_file(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        fileName: { required: true },
        targetFolderName: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const file = await window.BIMStorage.getFile(args.type, args.fileName);
    if (!file) return { error: 'not_found', message: `Soubor "${args.fileName}" neexistuje.` };
    const folderResolved = _resolveFolderId(sm.data.folders, args.targetFolderName);
    if (folderResolved.error) return folderResolved;
    const ok = await sm.moveFile(file.id, folderResolved.id);
    return { moved: ok, fileId: file.id, targetFolderId: folderResolved.id };
}

export async function move_files_batch(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        fileNames: { required: true },
        targetFolderName: { required: true }
    });
    if (!Array.isArray(args.fileNames)) {
        throw new Error('fileNames must be an array of strings');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const sm = args.type === 'ifc' ? window.BIMStorage.ifcStorage : window.BIMStorage.idsStorage;
    if (!sm.data) await sm.load();
    const folderResolved = _resolveFolderId(sm.data.folders, args.targetFolderName);
    if (folderResolved.error) return folderResolved;
    const moved = [];
    const skipped = [];
    for (const name of args.fileNames) {
        const file = await window.BIMStorage.getFile(args.type, name);
        if (!file) {
            skipped.push({ name, reason: 'not_found' });
            continue;
        }
        const ok = await sm.moveFile(file.id, folderResolved.id);
        if (ok) moved.push(name); else skipped.push({ name, reason: 'move_failed' });
    }
    return { moved, skipped, targetFolderId: folderResolved.id };
}

export async function download_file(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const blob = new Blob([content], { type: args.type === 'ifc' ? 'text/plain' : 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { downloaded: true, name: args.name, size: file.size };
}

export async function get_file_snippet(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    const maxBytes = typeof args.maxBytes === 'number' && args.maxBytes > 0
        ? Math.min(args.maxBytes, 50000)
        : 8000;
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const truncated = content.length > maxBytes;
    return {
        name: args.name,
        snippet: truncated ? content.slice(0, maxBytes) : content,
        truncated,
        totalBytes: content.length
    };
}

export async function get_file_summary(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true }
    });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const content = await window.BIMStorage.getFileContent(args.type, file.id);
    const out = {
        name: args.name,
        size: file.size,
        modifiedAt: file.modifiedAt || file.uploadDate || null
    };
    if (args.type === 'ifc') {
        if (typeof window.IFCParserCore === 'undefined') {
            out.warning = 'IFCParserCore not available — entity counts skipped';
            return out;
        }
        const entities = window.IFCParserCore.parseIFCContent(content, args.name) || [];
        const counts = {};
        for (const e of entities) {
            const t = (e.entity || '').toUpperCase();
            counts[t] = (counts[t] || 0) + 1;
        }
        out.entityCount = entities.length;
        out.topTypes = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => ({ name: n, count: c }));
    } else {
        if (typeof window.parseIDS === 'undefined') {
            out.warning = 'parseIDS not available — spec count skipped';
            return out;
        }
        const ids = window.parseIDS(content, args.name);
        out.specCount = ids?.specifications?.length || 0;
        out.title = ids?.info?.title || null;
        out.ifcVersion = ids?.info?.ifcVersion || null;
    }
    return out;
}

export async function replace_file_content(args) {
    helpers.validateArgs(args, {
        type: { required: true, enum: ['ifc', 'ids'] },
        name: { required: true },
        content: { required: true }
    });
    if (typeof args.content !== 'string') {
        throw new Error('content must be a string');
    }
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const file = await window.BIMStorage.getFile(args.type, args.name);
    if (!file) return { error: 'not_found' };
    const oldSize = file.size || 0;
    const newSize = args.content.length;
    const sizeDeltaPercent = oldSize > 0 ? Math.abs(newSize - oldSize) / oldSize * 100 : 0;
    const warning = sizeDeltaPercent > 50
        ? ` POZOR: nová velikost se liší o ${sizeDeltaPercent.toFixed(0)}%.`
        : '';
    if (!confirm(`Přepsat obsah '${args.name}'?${warning}`)) {
        return { cancelled: true };
    }
    await window.BIMStorage.saveFile(args.type, { name: args.name, size: newSize, content: args.content }, file.folder);
    return { replaced: true, oldSize, newSize };
}

export function register(registerFn) {
    registerFn('list_storage_files', list_storage_files);
    registerFn('list_storage_folders', list_storage_folders);
    registerFn('delete_file_from_storage', delete_file_from_storage);
    registerFn('create_folder', create_folder);
    registerFn('rename_folder', rename_folder);
    registerFn('delete_folder', delete_folder);
    registerFn('move_file', move_file);
    registerFn('move_files_batch', move_files_batch);
    registerFn('download_file', download_file);
    registerFn('get_file_snippet', get_file_snippet);
    registerFn('get_file_summary', get_file_summary);
    registerFn('replace_file_content', replace_file_content);
}
