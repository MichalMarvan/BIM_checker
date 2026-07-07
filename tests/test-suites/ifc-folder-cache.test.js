/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC folder cache (BIM_checker/cache)', () => {
    // Real FileSystemDirectoryHandle without a picker dialog: the Origin
    // Private File System root. folder-cache reads whatever handle
    // fs-handle-store returns, so the whole write/read path runs for real.
    async function withOpfsRoot(fn) {
        const store = await import('../../assets/js/common/fs-handle-store.js');
        const fc = await import('../../assets/js/3d/ifc-engine/cache/folder-cache.js');
        const root = await navigator.storage.getDirectory();
        await store.saveRootHandle(root);
        try {
            return await fn(fc);
        } finally {
            try { await root.removeEntry('BIM_checker', { recursive: true }); } catch (e) { /* absent */ }
            try { await store.clearRootHandle(); } catch (e) { /* ignore */ }
        }
    }

    it('roundtrips a buffer through the connected folder', async () => {
        await withOpfsRoot(async (fc) => {
            const src = new Uint8Array([1, 2, 3, 250, 251, 252]).buffer;
            const okPut = await fc.folderCachePut('deadbeef01', src);
            expect(okPut).toBe(true);
            const back = await fc.folderCacheGet('deadbeef01');
            expect(back === null).toBe(false);
            expect(Array.from(new Uint8Array(back)).join(',')).toBe('1,2,3,250,251,252');
            const stats = await fc.folderCacheStats();
            expect(stats.count).toBe(1);
            expect(stats.bytes).toBe(6);
            await fc.folderCacheDelete('deadbeef01');
            expect(await fc.folderCacheGet('deadbeef01')).toBe(null);
        });
    });

    it('reports ok status with a folder and degrades to null without one', async () => {
        await withOpfsRoot(async (fc) => {
            await fc.folderCachePut('cafe02', new Uint8Array([9]).buffer);
            expect(await fc.folderCacheStatus()).toBe('ok');
        });
        // handle cleared by withOpfsRoot teardown → everything soft-fails
        const fc = await import('../../assets/js/3d/ifc-engine/cache/folder-cache.js');
        expect(await fc.folderCacheGet('cafe02')).toBe(null);
        expect(await fc.folderCachePut('cafe02', new Uint8Array([9]).buffer)).toBe(false);
        const status = await fc.folderCacheStatus();
        expect(status === 'no-folder' || status === 'unsupported').toBe(true);
    });
});
