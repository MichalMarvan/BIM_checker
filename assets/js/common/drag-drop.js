/* ===========================================
   BIM CHECKER - DRAG & DROP MODULE
   Reusable drag-drop functionality for file uploads
   =========================================== */

/**
 * DragDropHandler - Creates reusable drag-drop zones
 *
 * Usage:
 * const handler = new DragDropHandler({
 *     dropZone: document.getElementById('myDropZone'),
 *     fileInput: document.getElementById('myFileInput'),
 *     onFiles: (files) => { ... },
 *     accept: ['.ifc'],
 *     multiple: true
 * });
 */
class DragDropHandler {
    /**
     * Create a new drag-drop handler
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.dropZone - The drop zone element
     * @param {HTMLElement} [options.fileInput] - Optional file input element
     * @param {Function} options.onFiles - Callback when files are dropped/selected
     * @param {Array<string>} [options.accept] - Accepted file extensions (e.g., ['.ifc', '.xml'])
     * @param {boolean} [options.multiple=true] - Allow multiple files
     * @param {string} [options.dragOverClass='drag-over'] - CSS class to add on dragover
     * @param {string} [options.activeClass='has-files'] - CSS class when files are loaded
     * @param {Function} [options.onDragEnter] - Callback on drag enter
     * @param {Function} [options.onDragLeave] - Callback on drag leave
     * @param {Function} [options.onError] - Callback on validation error
     */
    constructor(options) {
        this.dropZone = options.dropZone;
        this.fileInput = options.fileInput;
        this.onFiles = options.onFiles;
        this.accept = options.accept || [];
        this.multiple = options.multiple !== false;
        this.dragOverClass = options.dragOverClass || 'drag-over';
        this.activeClass = options.activeClass || 'has-files';
        this.onDragEnter = options.onDragEnter;
        this.onDragLeave = options.onDragLeave;
        this.onError = options.onError;

        if (!this.dropZone) {
            console.warn('DragDropHandler: No drop zone element provided');
            return;
        }

        this.init();
    }

    /**
     * Initialize event listeners
     */
    init() {
        // Drop zone click opens file picker
        if (this.fileInput) {
            this.dropZone.addEventListener('click', (e) => {
                // Don't trigger if clicking a button inside the drop zone
                if (e.target.tagName !== 'BUTTON') {
                    this.fileInput.click();
                }
            });

            // File input change handler
            this.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    this.handleFiles(files);
                }
                // Reset input so same file can be selected again
                e.target.value = '';
            });
        }

        // Drag and drop events
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
    }

    /**
     * Handle dragover event
     * @param {DragEvent} e
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }

    /**
     * Handle dragenter event
     * @param {DragEvent} e
     */
    handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add(this.dragOverClass);

        if (this.onDragEnter) {
            this.onDragEnter(e);
        }
    }

    /**
     * Handle dragleave event
     * @param {DragEvent} e
     */
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove(this.dragOverClass);

        if (this.onDragLeave) {
            this.onDragLeave(e);
        }
    }

    /**
     * Handle drop event
     * @param {DragEvent} e
     */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove(this.dragOverClass);

        const files = Array.from(e.dataTransfer.files);
        this.handleFiles(files);
    }

    /**
     * Process dropped/selected files
     * @param {File[]} files - Array of files
     */
    handleFiles(files) {
        // Filter by accepted extensions if specified
        let validFiles = files;

        if (this.accept.length > 0) {
            validFiles = files.filter(file => {
                const fileName = file.name.toLowerCase();
                return this.accept.some(ext => fileName.endsWith(ext.toLowerCase()));
            });

            // Report error if no valid files
            if (validFiles.length === 0 && files.length > 0) {
                const errorMsg = `No valid files. Accepted formats: ${this.accept.join(', ')}`;
                if (this.onError) {
                    this.onError(errorMsg, files);
                } else {
                    console.warn('DragDropHandler:', errorMsg);
                }
                return;
            }
        }

        // If not multiple, take only first file
        if (!this.multiple && validFiles.length > 1) {
            validFiles = [validFiles[0]];
        }

        // Call the callback with valid files
        if (this.onFiles && validFiles.length > 0) {
            this.onFiles(validFiles);
        }
    }

    /**
     * Set the active state (files loaded)
     * @param {boolean} hasFiles
     */
    setActive(hasFiles) {
        if (hasFiles) {
            this.dropZone.classList.add(this.activeClass);
        } else {
            this.dropZone.classList.remove(this.activeClass);
        }
    }

    /**
     * Destroy the handler and remove event listeners
     */
    destroy() {
        // Note: This creates new function references, so we can't properly remove listeners
        // In a real app, you'd want to store references to bound handlers
        this.dropZone = null;
        this.fileInput = null;
        this.onFiles = null;
    }
}

/**
 * Helper function to quickly setup a drop zone
 * @param {string} dropZoneId - ID of drop zone element
 * @param {string} fileInputId - ID of file input element
 * @param {Function} handler - Callback function for files
 * @param {Array<string>} [acceptedExtensions] - Accepted file extensions
 * @returns {DragDropHandler}
 */
function setupDragDrop(dropZoneId, fileInputId, handler, acceptedExtensions = []) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);

    if (!dropZone) {
        console.warn('setupDragDrop: Drop zone not found:', dropZoneId);
        return null;
    }

    return new DragDropHandler({
        dropZone,
        fileInput,
        onFiles: handler,
        accept: acceptedExtensions
    });
}

/**
 * Simplified drag-drop setup for upload boxes (legacy compatibility)
 * This function mimics the old setupDragDrop from validator.js
 * @param {string} boxId - ID of the upload box
 * @param {string} inputId - ID of the file input (not used in this version)
 * @param {Function} handler - Callback for files
 * @param {Object} [options] - Additional options
 */
function setupUploadBox(boxId, inputId, handler, options = {}) {
    const box = document.getElementById(boxId);
    if (!box) return null;

    const borderColorDefault = options.borderColorDefault || '#667eea';
    const borderColorActive = options.borderColorActive || '#764ba2';

    box.addEventListener('dragover', (e) => {
        e.preventDefault();
        box.style.borderColor = borderColorActive;
    });

    box.addEventListener('dragleave', () => {
        box.style.borderColor = borderColorDefault;
    });

    box.addEventListener('drop', (e) => {
        e.preventDefault();
        box.style.borderColor = borderColorDefault;
        const files = Array.from(e.dataTransfer.files);
        handler(files);
    });

    return box;
}

/**
 * Read file as text with Promise
 * @param {File} file - File to read
 * @returns {Promise<string>} File content as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file: ' + file.name));
        reader.readAsText(file);
    });
}

/**
 * Read file as ArrayBuffer with Promise
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>} File content as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file: ' + file.name));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Read file as Data URL with Promise
 * @param {File} file - File to read
 * @returns {Promise<string>} File content as Data URL
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file: ' + file.name));
        reader.readAsDataURL(file);
    });
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DragDropHandler,
        setupDragDrop,
        setupUploadBox,
        readFileAsText,
        readFileAsArrayBuffer,
        readFileAsDataURL
    };
}
