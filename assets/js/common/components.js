/* ===========================================
   BIM CHECKER - HTML COMPONENTS
   Reusable UI components for consistent layout
   =========================================== */

/**
 * HTML Components - generates common UI elements
 * Eliminates HTML duplication across pages
 */
const HTMLComponents = {
    /**
     * Generate navbar HTML
     * @param {Object} options - Configuration options
     * @param {string} options.pageTitle - Title to display (i18n key)
     * @param {string} options.pageTitleDefault - Default title text
     * @param {boolean} options.isSubpage - Whether this is a subpage (shows back button)
     * @param {string} options.backUrl - URL for back button (default: '../index.html' for subpages, '#' for main)
     * @returns {string} HTML string
     */
    navbar(options = {}) {
        const {
            pageTitle = 'app.title',
            pageTitleDefault = 'BIM Checker',
            isSubpage = false,
            backUrl = isSubpage ? '../index.html' : '#'
        } = options;

        const navbarClass = isSubpage ? 'navbar navbar-subpage' : 'navbar';

        const backButton = isSubpage
            ? `<a href="${backUrl}" class="back-home-btn" data-i18n="btn.back">&larr; Dom&uring;</a>`
            : '';

        const brandSection = !isSubpage ? `
            <div class="navbar-brand">
                <div class="brand-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                </div>
                <div class="brand-text">
                    <span class="brand-name" data-i18n="app.title">BIM Checker</span>
                    <span class="brand-version" data-i18n="app.version">Beta 0.1</span>
                </div>
            </div>
            <nav class="navbar-menu">
                <a href="#uloziste" class="nav-link" data-i18n="nav.storage">&Uacute;lo&zcaron;i&scaron;t&ecaron;</a>
                <a href="#nastroje" class="nav-link" data-i18n="nav.tools">N&aacute;stroje</a>
                <a href="#o-projektu" class="nav-link" data-i18n="nav.about">O projektu</a>
            </nav>` : '';

        const titleSection = isSubpage
            ? `<h1 class="page-title" data-i18n="${pageTitle}">${pageTitleDefault}</h1>`
            : '';

        return `
    <nav class="${navbarClass}">
        <div class="navbar-container">
            ${backButton}
            ${brandSection}
            ${titleSection}
            <div class="navbar-actions">
                <div class="language-switcher">
                    <button class="lang-btn active" data-lang="cs">CZ</button>
                    <button class="lang-btn" data-lang="en">EN</button>
                </div>
                <button class="theme-toggle" id="themeToggle" title="P&rcaron;epnout motiv">
                    <svg class="theme-icon theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                    <svg class="theme-icon theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </nav>`;
    },

    /**
     * Generate footer HTML
     * @returns {string} HTML string
     */
    footer() {
        return `
    <footer class="footer-modern">
        <div class="footer-container">
            <div class="footer-content">
                <div class="footer-brand">
                    <div class="footer-brand-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                    </div>
                    <div>
                        <div class="footer-brand-name" data-i18n="app.title">BIM Checker</div>
                        <div class="footer-brand-tagline" data-i18n="footer.text">N&aacute;stroje pro pr&aacute;ci s BIM daty</div>
                    </div>
                </div>
                <div class="footer-meta">
                    <span data-i18n="app.version">Beta verze 0.1</span>
                    <span class="footer-divider">&bull;</span>
                    <span data-i18n="app.year">2025</span>
                </div>
            </div>
            <div class="footer-tech">
                <span class="tech-badge-modern">HTML5</span>
                <span class="tech-badge-modern">CSS3</span>
                <span class="tech-badge-modern">JavaScript</span>
                <span class="tech-badge-modern">IFC</span>
                <span class="tech-badge-modern">IDS</span>
                <span class="tech-badge-modern">buildingSMART</span>
            </div>
        </div>
    </footer>`;
    },

    /**
     * Generate loading overlay HTML
     * @param {Object} options - Configuration options
     * @param {string} options.id - Element ID (default: 'loading')
     * @param {string} options.titleKey - i18n key for title
     * @param {string} options.titleDefault - Default title text
     * @param {boolean} options.showProgress - Whether to show progress bar
     * @returns {string} HTML string
     */
    loadingOverlay(options = {}) {
        const {
            id = 'loading',
            titleKey = 'loading.files',
            titleDefault = 'Nahr&aacute;v&aacute;m soubory...',
            showProgress = true
        } = options;

        const progressBar = showProgress ? `
            <div class="progress-bar-modern-container">
                <div class="progress-bar-modern" id="progressBar">
                    <div class="progress-bar-fill"></div>
                    <span class="progress-bar-text">0%</span>
                </div>
            </div>` : '';

        return `
    <div class="loading-overlay-modern" id="${id}">
        <div class="loading-card">
            <div class="loading-spinner-modern"></div>
            <h3 class="loading-title" data-i18n="${titleKey}">${titleDefault}</h3>
            <p class="loading-subtitle" id="loadingSubtext" data-i18n="loading.subtext">Pros&iacute;m &ccaron;ekejte...</p>
            ${progressBar}
            <div class="file-info-modern" id="fileInfo"></div>
        </div>
    </div>`;
    },

    /**
     * Inject navbar into page
     * @param {Object} options - Navbar options
     * @param {string} targetSelector - CSS selector for target element (default: 'body', prepends)
     */
    injectNavbar(options = {}, targetSelector = 'body') {
        const html = this.navbar(options);
        const target = document.querySelector(targetSelector);
        if (target) {
            if (targetSelector === 'body') {
                target.insertAdjacentHTML('afterbegin', html);
            } else {
                target.innerHTML = html;
            }
        }
    },

    /**
     * Inject footer into page
     * @param {string} targetSelector - CSS selector for target element (default: 'body', appends)
     */
    injectFooter(targetSelector = 'body') {
        const html = this.footer();
        const target = document.querySelector(targetSelector);
        if (target) {
            if (targetSelector === 'body') {
                // Insert before closing body tag (before scripts)
                const scripts = target.querySelectorAll('script');
                if (scripts.length > 0) {
                    scripts[0].insertAdjacentHTML('beforebegin', html);
                } else {
                    target.insertAdjacentHTML('beforeend', html);
                }
            } else {
                target.innerHTML = html;
            }
        }
    },

    /**
     * Replace placeholder elements with components
     * Call this after DOMContentLoaded
     * Looks for elements with data-component attribute
     */
    hydrate() {
        // Replace navbar placeholders
        document.querySelectorAll('[data-component="navbar"]').forEach(el => {
            const options = {
                pageTitle: el.dataset.pageTitle || 'app.title',
                pageTitleDefault: el.dataset.pageTitleDefault || 'BIM Checker',
                isSubpage: el.dataset.isSubpage === 'true',
                backUrl: el.dataset.backUrl
            };
            el.outerHTML = this.navbar(options);
        });

        // Replace footer placeholders
        document.querySelectorAll('[data-component="footer"]').forEach(el => {
            el.outerHTML = this.footer();
        });

        // Replace loading overlay placeholders
        document.querySelectorAll('[data-component="loading"]').forEach(el => {
            const options = {
                id: el.dataset.id || 'loading',
                titleKey: el.dataset.titleKey || 'loading.files',
                titleDefault: el.dataset.titleDefault || 'Nahravám soubory...',
                showProgress: el.dataset.showProgress !== 'false'
            };
            el.outerHTML = this.loadingOverlay(options);
        });
    }
};

// Auto-hydrate on DOMContentLoaded if placeholders exist
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-component]')) {
        HTMLComponents.hydrate();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HTMLComponents;
}
