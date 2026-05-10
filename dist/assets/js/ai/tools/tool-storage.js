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

export function register(registerFn) {
    registerFn('list_storage_files', list_storage_files);
    registerFn('list_storage_folders', list_storage_folders);
    registerFn('delete_file_from_storage', delete_file_from_storage);
}
