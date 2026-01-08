/**
 * BIM Checker - Index Page JavaScript
 * Main page logic for file storage management
 *
 * Dependencies: storage.js (IndexedDBStorage, StorageManager)
 */

// =======================
// FILE PANEL
// =======================
class FilePanel {
    constructor(type, storageKey) {
        this.type = type; // 'ifc' or 'ids'
        this.storage = new StorageManager(storageKey);
        this.selectedFolder = 'root';
        this.selectedFile = null;
        this.draggedFileId = null;

        this.elements = {
            dropZone: document.getElementById(`${type}DropZone`),
            fileTree: document.getElementById(`${type}FileTree`),
            fileInput: document.getElementById(`${type}FileInput`),
            stats: document.getElementById(`${type}Stats`),
            newFolderBtn: document.getElementById(`${type}NewFolderBtn`),
            uploadBtn: document.getElementById(`${type}UploadBtn`),
            expandAllBtn: document.getElementById(`${type}ExpandAllBtn`),
            collapseAllBtn: document.getElementById(`${type}CollapseAllBtn`)
        };

        this.init();
    }

    async init() {
        // Wait for storage to be ready
        await this.storage.init();
        // Drop zone events
        this.elements.dropZone.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('drag-over');
        });

        this.elements.dropZone.addEventListener('dragleave', () => {
            this.elements.dropZone.classList.remove('drag-over');
        });

        this.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('drag-over');
            this.handleFiles(Array.from(e.dataTransfer.files));
        });

        // File input
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFiles(Array.from(e.target.files));
            e.target.value = ''; // Reset
        });

        // Buttons
        this.elements.newFolderBtn.addEventListener('click', () => this.createNewFolder());
        this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.elements.collapseAllBtn.addEventListener('click', () => this.collapseAll());

        // Setup deselection on outside click - using setTimeout to avoid conflicts
        // Store bound handler for cleanup
        this.handleOutsideClick = (e) => {
            // Don't deselect if clicking inside this panel's file tree
            if (this.elements.fileTree.contains(e.target)) {
                return;
            }

            // Don't deselect if clicking on buttons in card header
            if (e.target.closest('.card-actions') || e.target.closest('.card-header')) {
                return;
            }

            // Deselect if we have something selected
            if (this.selectedFolder !== 'root' || this.selectedFile !== null) {
                this.selectedFolder = 'root';
                this.selectedFile = null;
                this.render();
            }
        };

        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick, { capture: false });
        }, 100);

        this.render();
    }

    // Cleanup method to remove document-level event listeners
    destroy() {
        if (this.handleOutsideClick) {
            document.removeEventListener('click', this.handleOutsideClick, { capture: false });
            this.handleOutsideClick = null;
        }
    }

    async handleFiles(files) {
        const extensions = this.type === 'ifc' ? ['.ifc'] : ['.ids', '.xml'];
        const validFiles = files.filter(f => {
            const name = f.name.toLowerCase();
            return extensions.some(ext => name.endsWith(ext));
        });

        if (validFiles.length === 0) {
            const errorKey = this.type === 'ifc' ? 'validator.error.onlyIfcAllowed' : 'validator.error.onlyIdsAllowed';
            ErrorHandler.error(i18n.t(errorKey));
            return;
        }

        // Check for large files and warn user
        const largeFiles = validFiles.filter(f => f.size > 50 * 1024 * 1024); // 50 MB
        if (largeFiles.length > 0) {
            const fileList = largeFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join(', ');
            ErrorHandler.confirm(
                `${i18n.t('msg.fileTooBig')}: ${fileList}. ${i18n.t('msg.continue')}`,
                () => this.uploadFiles(validFiles)
            );
            return;
        }

        await this.uploadFiles(validFiles);
    }

    async uploadFiles(validFiles) {

        // Show loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        const progressBar = document.getElementById('progressBar');
        const loadingSubtext = document.getElementById('loadingSubtext');
        const fileInfo = document.getElementById('fileInfo');

        // Support both old and new progress bar structure
        const progressBarFill = progressBar.querySelector('.progress-bar-fill') || progressBar;
        const progressBarText = progressBar.querySelector('.progress-bar-text') || progressBar;

        loadingOverlay.classList.add('show');

        let processed = 0;
        for (const file of validFiles) {
            const fileNum = processed + 1;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);

            loadingSubtext.textContent = `${i18n.t('parser.storage.fileCount')} ${fileNum} / ${validFiles.length}`;
            fileInfo.textContent = `${file.name} (${sizeMB} MB)`;

            const reader = new FileReader();

            // Progress for reading file
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentRead = Math.round((e.loaded / e.total) * 100);
                    const overallPercent = Math.round(
                        ((processed + (percentRead / 100)) / validFiles.length) * 100
                    );
                    progressBarFill.style.width = overallPercent + '%';
                    progressBarText.textContent = overallPercent + '%';
                }
            };

            await new Promise((resolve) => {
                reader.onload = async (e) => {
                    loadingSubtext.textContent = i18n.t('loading.database');
                    await this.storage.addFile({
                        name: file.name,
                        size: file.size,
                        content: e.target.result
                    }, this.selectedFolder);
                    processed++;

                    const overallPercent = Math.round((processed / validFiles.length) * 100);
                    progressBarFill.style.width = overallPercent + '%';
                    progressBarText.textContent = overallPercent + '%';

                    // Update UI every 3 files for smoother feedback
                    if (processed % 3 === 0 || processed === validFiles.length) {
                        this.render();
                    }

                    resolve();
                };
                reader.onerror = () => {
                    ErrorHandler.error(`${i18n.t('msg.readError')}: ${file.name}`);
                    processed++;
                    resolve();
                };
                reader.readAsText(file);
            });
        }

        // Hide loading overlay
        loadingOverlay.classList.remove('show');

        // Final render to ensure all files are visible
        this.render();
        ErrorHandler.success(`${i18n.t('msg.success')} ${validFiles.length} ${i18n.t('msg.files')}`);
    }

    async createNewFolder() {
        ErrorHandler.prompt(i18n.t('msg.folderName'), '', async (name) => {
            const folderId = await this.storage.createFolder(name, this.selectedFolder);
            // Render immediately after metadata update (before IndexedDB save completes)
            this.render();
            // Auto-select and expand the new folder
            this.selectedFolder = folderId;
        });
    }

    async deleteFolder(folderId) {
        ErrorHandler.confirm(i18n.t('msg.deleteFolder'), async () => {
            // Select parent before delete
            const folder = this.storage.metadata.folders[folderId];
            if (folder) {
                this.selectedFolder = folder.parent;
            }
            await this.storage.deleteFolder(folderId);
            // Render immediately after metadata update
            this.render();
        });
    }

    async renameFolder(folderId) {
        const folder = this.storage.metadata.folders[folderId];
        ErrorHandler.prompt(i18n.t('msg.newFolderName'), folder.name, async (newName) => {
            await this.storage.renameFolder(folderId, newName);
            // Render immediately after metadata update
            this.render();
        });
    }

    async deleteFile(fileId) {
        ErrorHandler.confirm(i18n.t('btn.delete'), async () => {
            await this.storage.deleteFile(fileId);
            // Render immediately after metadata update
            this.render();
        });
    }

    async expandAll() {
        // Expand all in metadata (fast!)
        Object.values(this.storage.metadata.folders).forEach(folder => {
            folder.expanded = true;
        });
        // Save to localStorage (instant!)
        this.storage.saveExpandedStates();
        this.render();
    }

    async collapseAll() {
        // Collapse all in metadata (fast!)
        Object.values(this.storage.metadata.folders).forEach(folder => {
            if (folder.id !== 'root') folder.expanded = false;
        });
        // Save to localStorage (instant!)
        this.storage.saveExpandedStates();
        this.render();
    }

    renderFolder(folderId, level = 0) {
        const folder = this.storage.metadata.folders[folderId];
        if (!folder) return '';

        const isExpanded = folder.expanded;
        const hasChildren = folder.children.length > 0 || folder.files.length > 0;

        // For root folder, render only children without header
        if (folderId === 'root') {
            let html = '';

            // Render child folders FIRST (sorted by name)
            const childFolders = folder.children
                .map(id => this.storage.metadata.folders[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            childFolders.forEach(childFolder => {
                html += this.renderFolder(childFolder.id, level + 1);
            });

            // Render files AFTER folders (sorted by name)
            const files = folder.files
                .map(id => this.storage.metadata.files[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            files.forEach(file => {
                const sizeKB = (file.size / 1024).toFixed(1);
                const escapedFileId = this.escapeHtml(file.id);
                const escapedFileName = this.escapeHtml(file.name);
                html += `
                    <div class="tree-file ${this.selectedFile === file.id ? 'selected' : ''}"
                         data-file-id="${escapedFileId}"
                         draggable="true">
                        <span class="file-icon">📄</span>
                        <span class="file-name">${escapedFileName}</span>
                        <span class="file-size">${sizeKB} KB</span>
                        <div class="file-actions">
                            <button class="action-btn delete-file-btn" data-file-id="${escapedFileId}" title="${i18n.t('btn.delete')}">🗑️</button>
                        </div>
                    </div>
                `;
            });

            return html;
        }

        // For non-root folders, render normally with header
        // Arrow for expand/collapse
        const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        const escapedFolderId = this.escapeHtml(folderId);
        const escapedFolderName = this.escapeHtml(folder.name);

        let html = `
            <div class="tree-folder" data-folder-id="${escapedFolderId}">
                <div class="tree-folder-header ${this.selectedFolder === folderId ? 'selected' : ''}"
                     data-folder-id="${escapedFolderId}">
                    <span class="folder-arrow" data-folder-id="${escapedFolderId}">${arrow}</span>
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${escapedFolderName}</span>
                    <div class="folder-actions">
                        <button class="action-btn rename-folder-btn" data-folder-id="${escapedFolderId}" title="${i18n.t('btn.rename')}">✏️</button>
                        <button class="action-btn delete-folder-btn" data-folder-id="${escapedFolderId}" title="${i18n.t('btn.delete')}">🗑️</button>
                    </div>
                </div>
                <div class="tree-folder-children ${isExpanded ? 'expanded' : ''}">
        `;

        // Render child folders FIRST (sorted by name)
        const childFolders = folder.children
            .map(id => this.storage.metadata.folders[id])
            .filter(f => f)
            .sort((a, b) => a.name.localeCompare(b.name));

        childFolders.forEach(childFolder => {
            html += this.renderFolder(childFolder.id, level + 1);
        });

        // Render files AFTER folders (sorted by name)
        const files = folder.files
            .map(id => this.storage.metadata.files[id])
            .filter(f => f)
            .sort((a, b) => a.name.localeCompare(b.name));

        files.forEach(file => {
            const sizeKB = (file.size / 1024).toFixed(1);
            const escapedFileId = this.escapeHtml(file.id);
            const escapedFileName = this.escapeHtml(file.name);
            html += `
                <div class="tree-file ${this.selectedFile === file.id ? 'selected' : ''}"
                     data-file-id="${escapedFileId}"
                     draggable="true">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${escapedFileName}</span>
                    <span class="file-size">${sizeKB} KB</span>
                    <div class="file-actions">
                        <button class="action-btn delete-file-btn" data-file-id="${escapedFileId}" title="${i18n.t('btn.delete')}">🗑️</button>
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
        return html;
    }

    render() {
        this.elements.fileTree.innerHTML = this.renderFolder('root');
        this.attachEventListeners();

        // Update stats
        const stats = this.storage.getStats();
        const sizeKB = (stats.totalSize / 1024).toFixed(1);

        // Find stat values and update them
        const statValues = this.elements.stats.querySelectorAll('.stat-value');
        if (statValues.length >= 2) {
            statValues[0].textContent = stats.fileCount;
            statValues[1].textContent = `${sizeKB} KB`;
        }
    }

    // Escape HTML to prevent XSS
    escapeHtml(str) {
        if (typeof str !== 'string') return str;
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Attach event listeners after rendering (replaces inline handlers)
    attachEventListeners() {
        const fileTree = this.elements.fileTree;

        // File click events
        fileTree.querySelectorAll('.tree-file').forEach(fileEl => {
            const fileId = fileEl.dataset.fileId;

            fileEl.addEventListener('click', (e) => this.selectFile(fileId, e));
            fileEl.addEventListener('dragstart', (e) => this.handleDragStart(e, fileId));
            fileEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });

        // Delete file buttons
        fileTree.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.fileId);
            });
        });

        // Folder header events
        fileTree.querySelectorAll('.tree-folder-header').forEach(header => {
            const folderId = header.dataset.folderId;

            header.addEventListener('click', (e) => this.selectFolder(folderId, e));
            header.addEventListener('dragover', (e) => this.handleDragOver(e, folderId));
            header.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            header.addEventListener('drop', (e) => this.handleDrop(e, folderId));
        });

        // Folder arrow (toggle) events
        fileTree.querySelectorAll('.folder-arrow').forEach(arrow => {
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFolder(arrow.dataset.folderId);
            });
        });

        // Rename folder buttons
        fileTree.querySelectorAll('.rename-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.renameFolder(btn.dataset.folderId);
            });
        });

        // Delete folder buttons
        fileTree.querySelectorAll('.delete-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFolder(btn.dataset.folderId);
            });
        });
    }

    selectFolder(folderId, event) {
        if (event) event.stopPropagation();

        const folder = this.storage.metadata.folders[folderId];
        if (folder) {
            // If clicking on already selected folder, deselect it
            if (this.selectedFolder === folderId) {
                this.selectedFolder = 'root';
            } else {
                this.selectedFolder = folderId;
            }
            this.selectedFile = null; // Deselect file when folder is selected
            this.render();
        }
    }

    async toggleFolder(folderId) {
        const folder = this.storage.metadata.folders[folderId];
        if (folder) {
            await this.storage.toggleFolder(folderId);
            this.render();
        }
    }

    selectFile(fileId, event) {
        if (event) event.stopPropagation();

        // If clicking on already selected file, deselect it
        if (this.selectedFile === fileId) {
            this.selectedFile = null;
            this.selectedFolder = 'root';
        } else {
            this.selectedFile = fileId;
            this.selectedFolder = null; // Deselect folder when file is selected
        }
        this.render();
    }

    // Drag & Drop handlers
    handleDragStart(event, fileId) {
        this.draggedFileId = fileId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', fileId);
        event.target.style.opacity = '0.4';
    }

    handleDragEnd(event) {
        event.target.style.opacity = '1';
    }

    handleDragOver(event, folderId) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';

        // Add visual feedback
        const folderHeader = event.currentTarget;
        folderHeader.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    }

    async handleDrop(event, targetFolderId) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over');

        if (!this.draggedFileId) return;

        const file = this.storage.metadata.files[this.draggedFileId];
        if (!file) return;

        // Don't move if already in target folder
        if (file.folderId === targetFolderId) return;

        // Move file to target folder
        await this.storage.moveFile(this.draggedFileId, targetFolderId);
        this.draggedFileId = null;
        this.render();
    }

    // Public API for other pages
    getFile(fileId) {
        return this.storage.metadata.files[fileId];
    }

    getAllFiles() {
        return Object.values(this.storage.metadata.files);
    }
}

// =======================
// INITIALIZE
// =======================
let filePanel_ifc, filePanel_ids;

window.addEventListener('DOMContentLoaded', () => {
    filePanel_ifc = new FilePanel('ifc', 'ifc_files');
    filePanel_ids = new FilePanel('ids', 'ids_files');
});

// Re-render file trees when language changes
window.addEventListener('languageChanged', () => {
    if (filePanel_ifc) filePanel_ifc.render();
    if (filePanel_ids) filePanel_ids.render();
});
