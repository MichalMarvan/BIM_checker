/* ===========================================
   BIM CHECKER - UTILITY FUNCTIONS
   Shared helper functions
   =========================================== */

// Format file size to human-readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Show loading overlay
function showLoading(text = i18n.t('loading.text'), subtext = i18n.t('loading.subtext')) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        const loadingText = document.getElementById('loadingText');
        const loadingSubtext = document.getElementById('loadingSubtext');
        if (loadingText) loadingText.textContent = text;
        if (loadingSubtext) loadingSubtext.textContent = subtext;
        overlay.classList.add('show');
    }
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// Update progress bar
function updateProgress(percent, text = '') {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = percent + '%';
        progressBar.textContent = text || (percent + '%');
    }
}

// Show error message
function showError(message, containerId = 'errorMessage') {
    const errorElement = document.getElementById(containerId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// Hide error message
function hideError(containerId = 'errorMessage') {
    const errorElement = document.getElementById(containerId);
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// Debounce function for search/filter operations
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}

// Download text as file
function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Format date to locale string
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('cs-CZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Parse XML string to DOM
function parseXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Check for parse errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Invalid XML: ' + parserError.textContent);
    }

    return xmlDoc;
}

// Format XML for display
function formatXML(xml) {
    const PADDING = ' '.repeat(2);
    const reg = /(>)(<)(\/*)/g;
    let pad = 0;

    xml = xml.replace(reg, '$1\r\n$2$3');

    return xml.split('\r\n').map(node => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/) && pad > 0) {
            pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }

        const padding = PADDING.repeat(pad);
        pad += indent;

        return padding + node;
    }).join('\r\n');
}

// Switch tabs helper
function switchTab(tabName, event) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Activate selected tab
    if (event && event.target) {
        event.target.classList.add('active');
    }
    const tabContent = document.getElementById(tabName + 'Tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }
}

// Generate unique ID
function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Check if value matches pattern (regex or simple string)
function matchesPattern(value, pattern) {
    if (!pattern) return true;
    if (typeof pattern === 'string') {
        // Try as regex first
        try {
            const regex = new RegExp(pattern);
            return regex.test(value);
        } catch (e) {
            // If not valid regex, do simple string match
            return value.includes(pattern);
        }
    }
    return false;
}

// Sort array of objects by property
function sortByProperty(array, property, ascending = true) {
    return array.sort((a, b) => {
        const aVal = a[property];
        const bVal = b[property];

        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
    });
}

// Group array by property
function groupBy(array, property) {
    return array.reduce((groups, item) => {
        const key = item[property];
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
        return groups;
    }, {});
}
