import * as helpers from './_helpers.js';

export async function list_storage_files(args) {
    helpers.validateArgs(args, { type: { required: true, enum: ['ifc', 'ids'] } });
    if (typeof window.BIMStorage === 'undefined') throw new Error('BIMStorage not available');
    await window.BIMStorage.init();
    const files = await window.BIMStorage.getFiles(args.type);
    return files.map(f => ({
        name: f.name,
        size: f.size,
        folder: f.folderId || 'root',
        modifiedAt: f.modifiedAt
    }));
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
    registerFn('delete_file_from_storage', delete_file_from_storage);
}
