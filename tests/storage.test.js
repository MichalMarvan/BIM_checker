// =======================
// STORAGE TESTS (IndexedDB)
// =======================

describe('Storage Module', () => {
    
    it('should have BIMStorage object defined', () => {
        expect(window.BIMStorage).toBeDefined();
    });

    it('should initialize storage', async () => {
        const result = await BIMStorage.init();
        expect(result).toBeTruthy();
    });

    it('should save and retrieve IFC file', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'test.ifc',
            content: 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCPROJECT();\nENDSEC;\nEND-ISO-10303-21;',
            size: 100,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', testFile);
        const files = await BIMStorage.getFiles('ifc');
        
        expect(files).toBeDefined();
        expect(files.length).toBeGreaterThan(0);
        
        const savedFile = files.find(f => f.name === 'test.ifc');
        expect(savedFile).toBeDefined();
        expect(savedFile.name).toBe('test.ifc');
    });

    it('should save and retrieve IDS file', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'test.ids',
            content: '<?xml version="1.0"?><ids></ids>',
            size: 50,
            type: 'ids'
        };

        await BIMStorage.saveFile('ids', testFile);
        const files = await BIMStorage.getFiles('ids');
        
        expect(files).toBeDefined();
        expect(files.length).toBeGreaterThan(0);
        
        const savedFile = files.find(f => f.name === 'test.ids');
        expect(savedFile).toBeDefined();
    });

    it('should delete file', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'to-delete.ifc',
            content: 'test content',
            size: 12,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', testFile);
        await BIMStorage.deleteFile('ifc', 'to-delete.ifc');
        
        const files = await BIMStorage.getFiles('ifc');
        const deletedFile = files.find(f => f.name === 'to-delete.ifc');
        
        expect(deletedFile).toBeUndefined();
    });

    it('should create folder structure', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'folder1/subfolder/file.ifc',
            content: 'test',
            size: 4,
            type: 'ifc',
            path: 'folder1/subfolder'
        };

        await BIMStorage.saveFile('ifc', testFile);
        const files = await BIMStorage.getFiles('ifc');
        
        const savedFile = files.find(f => f.name === 'folder1/subfolder/file.ifc');
        expect(savedFile).toBeDefined();
    });

    it('should get file by name', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'specific.ifc',
            content: 'specific content',
            size: 16,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', testFile);
        const file = await BIMStorage.getFile('ifc', 'specific.ifc');
        
        expect(file).toBeDefined();
        expect(file.name).toBe('specific.ifc');
        expect(file.content).toBe('specific content');
    });

    it('should return null for non-existent file', async () => {
        await BIMStorage.init();
        
        const file = await BIMStorage.getFile('ifc', 'non-existent-file-12345.ifc');
        expect(file).toBeNull();
    });

    it('should clear all files of specific type', async () => {
        await BIMStorage.init();
        
        // Save some test files
        await BIMStorage.saveFile('ifc', { name: 'clear1.ifc', content: 'test', size: 4, type: 'ifc' });
        await BIMStorage.saveFile('ifc', { name: 'clear2.ifc', content: 'test', size: 4, type: 'ifc' });
        
        // Clear all IFC files
        await BIMStorage.clearFiles('ifc');
        
        const files = await BIMStorage.getFiles('ifc');
        expect(files).toHaveLength(0);
    });

    it('should handle file size calculation', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'size-test.ifc',
            content: 'x'.repeat(1000), // 1000 bytes
            size: 1000,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', testFile);
        const file = await BIMStorage.getFile('ifc', 'size-test.ifc');
        
        expect(file.size).toBe(1000);
    });

    it('should handle special characters in file names', async () => {
        await BIMStorage.init();
        
        const testFile = {
            name: 'test file (1) #2.ifc',
            content: 'test',
            size: 4,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', testFile);
        const file = await BIMStorage.getFile('ifc', 'test file (1) #2.ifc');
        
        expect(file).toBeDefined();
        expect(file.name).toBe('test file (1) #2.ifc');
    });

    it('should handle duplicate file names by overwriting', async () => {
        await BIMStorage.init();
        
        const file1 = {
            name: 'duplicate.ifc',
            content: 'version 1',
            size: 9,
            type: 'ifc'
        };

        const file2 = {
            name: 'duplicate.ifc',
            content: 'version 2',
            size: 9,
            type: 'ifc'
        };

        await BIMStorage.saveFile('ifc', file1);
        await BIMStorage.saveFile('ifc', file2);
        
        const file = await BIMStorage.getFile('ifc', 'duplicate.ifc');
        expect(file.content).toBe('version 2');
    });

    it('should maintain separate storage for IFC and IDS', async () => {
        await BIMStorage.init();
        
        await BIMStorage.saveFile('ifc', { name: 'test.ifc', content: 'ifc content', size: 11, type: 'ifc' });
        await BIMStorage.saveFile('ids', { name: 'test.ids', content: 'ids content', size: 11, type: 'ids' });
        
        const ifcFiles = await BIMStorage.getFiles('ifc');
        const idsFiles = await BIMStorage.getFiles('ids');
        
        expect(ifcFiles.some(f => f.name === 'test.ifc')).toBe(true);
        expect(idsFiles.some(f => f.name === 'test.ids')).toBe(true);
        expect(ifcFiles.some(f => f.name === 'test.ids')).toBe(false);
        expect(idsFiles.some(f => f.name === 'test.ifc')).toBe(false);
    });
});
