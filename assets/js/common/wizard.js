/**
 * BIM Checker - Wizard Module
 * Interactive tutorial/guide system for all pages
 */

/**
 * WizardOverlay - Creates the dark overlay with spotlight effect
 */
class WizardOverlay {
    constructor() {
        this.element = null;
        this.spotlight = null;
        this.create();
    }

    create() {
        // Main overlay container
        this.element = document.createElement('div');
        this.element.className = 'wizard-overlay';
        this.element.innerHTML = '<div class="wizard-overlay-bg"></div>';

        // Spotlight element
        this.spotlight = document.createElement('div');
        this.spotlight.className = 'wizard-spotlight';

        document.body.appendChild(this.element);
        document.body.appendChild(this.spotlight);
    }

    show() {
        this.element.classList.add('active');
    }

    hide() {
        this.element.classList.remove('active');
        this.spotlight.style.display = 'none';
        // Reset overlay to non-blocking
        this.element.style.pointerEvents = 'none';
    }

    highlightElement(targetElement, padding = 8, blockInteraction = false) {
        if (!targetElement) {
            this.spotlight.style.display = 'none';
            // Reset overlay to non-blocking when no element is highlighted
            this.element.style.pointerEvents = 'none';
            this.element.style.clipPath = '';
            return;
        }

        const rect = targetElement.getBoundingClientRect();
        const top = rect.top - padding;
        const left = rect.left - padding;
        const width = rect.width + padding * 2;
        const height = rect.height + padding * 2;

        this.spotlight.style.display = 'block';
        this.spotlight.style.top = `${top}px`;
        this.spotlight.style.left = `${left}px`;
        this.spotlight.style.width = `${width}px`;
        this.spotlight.style.height = `${height}px`;

        if (blockInteraction === 'outside') {
            // Block clicks outside spotlight only, allow clicks inside
            // Use clip-path to create a "frame" shape (full screen minus spotlight hole)
            const right = left + width;
            const bottom = top + height;
            this.element.style.clipPath = `polygon(
                0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px
            )`;
            this.element.style.pointerEvents = 'all';
        } else if (blockInteraction === true) {
            // Block ALL clicks (inside and outside)
            this.element.style.clipPath = '';
            this.element.style.pointerEvents = 'all';
        } else {
            // No blocking - allow all clicks
            this.element.style.clipPath = '';
            this.element.style.pointerEvents = 'none';
        }
    }

    destroy() {
        this.element?.remove();
        this.spotlight?.remove();
    }
}

/**
 * WizardTooltip - The tooltip bubble with step content
 */
class WizardTooltip {
    constructor(manager) {
        this.manager = manager;
        this.element = null;
        this.create();
    }

    create() {
        this.element = document.createElement('div');
        this.element.className = 'wizard-tooltip';
        this.element.innerHTML = `
            <div class="wizard-tooltip__progress">
                <span class="wizard-tooltip__step"></span>
                <div class="wizard-tooltip__progress-bar">
                    <div class="wizard-tooltip__progress-fill"></div>
                </div>
            </div>
            <div class="wizard-tooltip__content">
                <div class="wizard-tooltip__header">
                    <div class="wizard-tooltip__icon"></div>
                    <h3 class="wizard-tooltip__title"></h3>
                </div>
                <p class="wizard-tooltip__description"></p>
                <div class="wizard-tooltip__required" style="display: none;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span data-i18n="wizard.requiredStep"></span>
                </div>
            </div>
            <div class="wizard-tooltip__actions">
                <button class="wizard-tooltip__btn wizard-tooltip__btn--skip" data-action="skip">
                    <span data-i18n="wizard.skip"></span>
                </button>
                <div class="wizard-tooltip__nav">
                    <button class="wizard-tooltip__btn wizard-tooltip__btn--prev" data-action="prev" style="display: none;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        <span data-i18n="wizard.prev"></span>
                    </button>
                    <button class="wizard-tooltip__btn wizard-tooltip__btn--next" data-action="next">
                        <span data-i18n="wizard.next"></span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="wizard-tooltip__arrow"></div>
        `;

        // Event listeners
        this.element.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            if (action === 'next') this.manager.next();
            else if (action === 'prev') this.manager.prev();
            else if (action === 'skip') this.manager.skip();
        });

        document.body.appendChild(this.element);
    }

    render(step, currentIndex, totalSteps, isCompleted = false) {
        const i18n = window.i18n;

        // Update progress
        const stepEl = this.element.querySelector('.wizard-tooltip__step');
        stepEl.textContent = i18n ?
            i18n.t('wizard.step', { current: currentIndex + 1, total: totalSteps }) :
            `${currentIndex + 1}/${totalSteps}`;

        const progressFill = this.element.querySelector('.wizard-tooltip__progress-fill');
        progressFill.style.width = `${((currentIndex + 1) / totalSteps) * 100}%`;

        // Update content
        this.element.querySelector('.wizard-tooltip__icon').textContent = step.icon || '📌';
        this.element.querySelector('.wizard-tooltip__title').textContent =
            i18n ? i18n.t(step.title) : step.title;
        this.element.querySelector('.wizard-tooltip__description').textContent =
            i18n ? i18n.t(step.content) : step.content;

        // Required indicator - hide if already completed
        const requiredEl = this.element.querySelector('.wizard-tooltip__required');
        requiredEl.style.display = (step.required && !isCompleted) ? 'inline-flex' : 'none';
        if (step.required && i18n) {
            requiredEl.querySelector('span').textContent = i18n.t('wizard.requiredStep');
        }

        // Update buttons
        const prevBtn = this.element.querySelector('[data-action="prev"]');
        const nextBtn = this.element.querySelector('[data-action="next"]');
        const skipBtn = this.element.querySelector('[data-action="skip"]');

        prevBtn.style.display = currentIndex > 0 ? 'inline-flex' : 'none';

        // Last step
        const isLast = currentIndex === totalSteps - 1;
        const nextSpan = nextBtn.querySelector('span');
        if (i18n) {
            nextSpan.textContent = isLast ? i18n.t('wizard.finish') : i18n.t('wizard.next');
            skipBtn.querySelector('span').textContent = i18n.t('wizard.skip');
            prevBtn.querySelector('span').textContent = i18n.t('wizard.prev');
        }

        if (isLast) {
            nextBtn.classList.add('wizard-tooltip__btn--finish');
        } else {
            nextBtn.classList.remove('wizard-tooltip__btn--finish');
        }

        // Disable next if required and waiting (but not if already completed)
        if (step.required && step.waitFor && !isCompleted) {
            nextBtn.disabled = true;
            if (i18n && step.waitingLabel) {
                nextSpan.textContent = i18n.t(step.waitingLabel);
            }
        } else {
            nextBtn.disabled = false;
        }

        // Skip button - hide for required steps (unless completed)
        skipBtn.style.display = (step.required && !isCompleted) ? 'none' : 'inline-flex';

        // Hide all buttons if step has hideButtons flag
        if (step.hideButtons) {
            const actionsEl = this.element.querySelector('.wizard-tooltip__actions');
            if (actionsEl) {
                actionsEl.style.display = 'none';
            }
        } else {
            const actionsEl = this.element.querySelector('.wizard-tooltip__actions');
            if (actionsEl) {
                actionsEl.style.display = '';
            }
        }

        // Translate buttons
        if (i18n) {
            i18n.translateElement(this.element);
        }
    }

    position(targetElement, preferredPosition = 'bottom') {
        if (!targetElement) {
            // Center on screen if no target
            this.element.style.top = '50%';
            this.element.style.left = '50%';
            this.element.style.transform = 'translate(-50%, -50%)';
            this.element.querySelector('.wizard-tooltip__arrow').style.display = 'none';
            return;
        }

        const rect = targetElement.getBoundingClientRect();
        const tooltipRect = this.element.getBoundingClientRect();
        const arrow = this.element.querySelector('.wizard-tooltip__arrow');
        const padding = 16;
        const arrowSize = 8;

        // Reset transform
        this.element.style.transform = '';
        arrow.style.display = 'block';
        arrow.className = 'wizard-tooltip__arrow';

        // Calculate best position
        const positions = {
            bottom: {
                top: rect.bottom + padding + arrowSize,
                left: rect.left + rect.width / 2 - tooltipRect.width / 2,
                arrowClass: 'wizard-tooltip__arrow--bottom'
            },
            top: {
                top: rect.top - tooltipRect.height - padding - arrowSize,
                left: rect.left + rect.width / 2 - tooltipRect.width / 2,
                arrowClass: 'wizard-tooltip__arrow--top'
            },
            left: {
                top: rect.top + rect.height / 2 - tooltipRect.height / 2,
                left: rect.left - tooltipRect.width - padding - arrowSize,
                arrowClass: 'wizard-tooltip__arrow--left'
            },
            right: {
                top: rect.top + rect.height / 2 - tooltipRect.height / 2,
                left: rect.right + padding + arrowSize,
                arrowClass: 'wizard-tooltip__arrow--right'
            }
        };

        // Try preferred position first, then others
        const order = [preferredPosition, 'bottom', 'top', 'right', 'left'];
        let chosen = null;

        for (const pos of order) {
            const p = positions[pos];
            if (
                p.top >= 10 &&
                p.left >= 10 &&
                p.top + tooltipRect.height <= window.innerHeight - 10 &&
                p.left + tooltipRect.width <= window.innerWidth - 10
            ) {
                chosen = { ...p, position: pos };
                break;
            }
        }

        // If no position fits perfectly, force the preferred position (clamped to screen)
        if (!chosen) {
            const p = positions[preferredPosition];
            chosen = { ...p, position: preferredPosition };
        }

        // Apply position
        this.element.style.top = `${Math.max(10, chosen.top)}px`;
        this.element.style.left = `${Math.max(10, Math.min(chosen.left, window.innerWidth - tooltipRect.width - 10))}px`;
        arrow.classList.add(chosen.arrowClass);
    }

    show() {
        this.element.classList.add('active');
    }

    hide() {
        this.element.classList.remove('active');
    }

    enableNext() {
        const nextBtn = this.element.querySelector('[data-action="next"]');
        nextBtn.disabled = false;
        const i18n = window.i18n;
        if (i18n) {
            nextBtn.querySelector('span').textContent = i18n.t('wizard.next');
        }
    }

    destroy() {
        this.element?.remove();
    }
}

/**
 * WizardSidebar - Help panel with documentation and FAQ
 */
class WizardSidebar {
    constructor(manager) {
        this.manager = manager;
        this.element = null;
        this.backdrop = null;
        this.isOpen = false;
        this.create();
    }

    create() {
        // Backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'wizard-sidebar__backdrop';
        this.backdrop.addEventListener('click', () => this.close());

        // Sidebar
        this.element = document.createElement('div');
        this.element.className = 'wizard-sidebar';
        this.element.innerHTML = `
            <div class="wizard-sidebar__header">
                <h2 class="wizard-sidebar__title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span data-i18n="wizard.help.title">Nápověda</span>
                </h2>
                <button class="wizard-sidebar__close" data-action="close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="wizard-sidebar__content">
                <button class="wizard-sidebar__start" data-action="start">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span data-i18n="wizard.start">Spustit průvodce</span>
                </button>

                <div class="wizard-sidebar__section wizard-sidebar__section--about">
                    <h3 class="wizard-sidebar__section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/>
                            <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <span data-i18n="wizard.help.about">O této stránce</span>
                    </h3>
                    <p class="wizard-sidebar__about"></p>
                </div>

                <div class="wizard-sidebar__section wizard-sidebar__section--faq">
                    <h3 class="wizard-sidebar__section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span data-i18n="wizard.help.faq">Časté otázky</span>
                    </h3>
                    <div class="wizard-faq"></div>
                </div>

                <div class="wizard-sidebar__section wizard-sidebar__section--shortcuts" style="display: none;">
                    <h3 class="wizard-sidebar__section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M8 16h8"/>
                        </svg>
                        <span data-i18n="wizard.help.shortcuts">Klávesové zkratky</span>
                    </h3>
                    <div class="wizard-shortcuts"></div>
                </div>
            </div>
        `;

        // Event listeners
        this.element.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            if (action === 'close') this.close();
            else if (action === 'start') {
                this.close();
                this.manager.start();
            }
        });

        // FAQ accordion
        this.element.addEventListener('click', (e) => {
            const question = e.target.closest('.wizard-faq__question');
            if (!question) return;

            const item = question.closest('.wizard-faq__item');
            item.classList.toggle('open');
        });

        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.element);
    }

    render(helpContent) {
        const i18n = window.i18n;

        // About section
        const aboutEl = this.element.querySelector('.wizard-sidebar__about');
        aboutEl.textContent = i18n ? i18n.t(helpContent.about) : helpContent.about;

        // FAQ section
        const faqContainer = this.element.querySelector('.wizard-faq');
        faqContainer.innerHTML = '';

        if (helpContent.faq && helpContent.faq.length > 0) {
            helpContent.faq.forEach(item => {
                const faqItem = document.createElement('div');
                faqItem.className = 'wizard-faq__item';
                faqItem.innerHTML = `
                    <button class="wizard-faq__question">
                        <span>${i18n ? i18n.t(item.question) : item.question}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    <div class="wizard-faq__answer">
                        <p class="wizard-faq__answer-content">${i18n ? i18n.t(item.answer) : item.answer}</p>
                    </div>
                `;
                faqContainer.appendChild(faqItem);
            });
            this.element.querySelector('.wizard-sidebar__section--faq').style.display = 'block';
        } else {
            this.element.querySelector('.wizard-sidebar__section--faq').style.display = 'none';
        }

        // Shortcuts section
        const shortcutsContainer = this.element.querySelector('.wizard-shortcuts');
        const shortcutsSection = this.element.querySelector('.wizard-sidebar__section--shortcuts');

        if (helpContent.shortcuts && helpContent.shortcuts.length > 0) {
            shortcutsContainer.innerHTML = '';
            helpContent.shortcuts.forEach(item => {
                const shortcutItem = document.createElement('div');
                shortcutItem.className = 'wizard-shortcuts__item';
                shortcutItem.innerHTML = `
                    <span class="wizard-shortcuts__key">${item.key}</span>
                    <span class="wizard-shortcuts__action">${i18n ? i18n.t(item.action) : item.action}</span>
                `;
                shortcutsContainer.appendChild(shortcutItem);
            });
            shortcutsSection.style.display = 'block';
        } else {
            shortcutsSection.style.display = 'none';
        }

        // Translate static elements
        if (i18n) {
            i18n.translateElement(this.element);
        }
    }

    open() {
        this.isOpen = true;
        this.element.classList.add('open');
        this.backdrop.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.isOpen = false;
        this.element.classList.remove('open');
        this.backdrop.classList.remove('open');
        document.body.style.overflow = '';
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    destroy() {
        this.element?.remove();
        this.backdrop?.remove();
    }
}

/**
 * WizardManager - Main controller for the wizard system
 */
class WizardManager {
    constructor() {
        this.currentPage = null;
        this.currentStep = 0;
        this.steps = [];
        this.helpContent = null;
        this.isActive = false;

        this.overlay = null;
        this.tooltip = null;
        this.sidebar = null;

        this.eventListeners = [];
        this.waitingForEvent = null;
        this.completedSteps = new Set();
        this.lastDirection = 1;

        // Sub-steps (for modal triggers)
        this.subSteps = null;
        this.currentSubStep = -1;
        this.parentStepIndex = -1;
        this.inSubSteps = false;
    }

    /**
     * Initialize wizard for a specific page
     */
    init(pageName) {
        this.currentPage = pageName;

        // Load steps and help content
        if (window.WIZARD_STEPS && window.WIZARD_STEPS[pageName]) {
            this.steps = window.WIZARD_STEPS[pageName].steps || [];
        }
        if (window.WIZARD_HELP && window.WIZARD_HELP[pageName]) {
            this.helpContent = window.WIZARD_HELP[pageName];
        }

        // Create components
        this.overlay = new WizardOverlay();
        this.tooltip = new WizardTooltip(this);
        this.sidebar = new WizardSidebar(this);

        // Render sidebar content
        if (this.helpContent) {
            this.sidebar.render(this.helpContent);
        }

        // Check first visit
        this.checkFirstVisit();

        // Keyboard navigation
        document.addEventListener('keydown', this.handleKeydown.bind(this));

        // Window resize - reposition tooltip
        window.addEventListener('resize', () => {
            if (this.isActive && this.steps[this.currentStep]) {
                this.positionCurrentStep();
            }
        });

        // Language change - re-render sidebar and update tooltip
        window.addEventListener('languageChanged', () => {
            if (this.helpContent) {
                this.sidebar.render(this.helpContent);
            }
            if (this.isActive && this.steps[this.currentStep]) {
                this.tooltip.show(this.steps[this.currentStep], this.currentStep, this.steps.length);
            }
        });

        console.log(`[Wizard] Initialized for page: ${pageName}`);
    }

    /**
     * Check if this is user's first visit and show hint
     */
    checkFirstVisit() {
        const key = `wizardFirstVisit.${this.currentPage}`;
        const visited = localStorage.getItem(key);

        if (!visited) {
            this.showFirstVisitHint();
            localStorage.setItem(key, 'true');
        }
    }

    /**
     * Show pulsing hint on wizard button
     */
    showFirstVisitHint() {
        const wizardBtn = document.getElementById('wizard-btn');
        if (!wizardBtn) return;

        const hint = document.createElement('div');
        hint.className = 'wizard-hint';
        hint.textContent = window.i18n ?
            window.i18n.t('wizard.hint.firstVisit') :
            'Nový zde? Klikni pro průvodce!';

        wizardBtn.style.position = 'relative';
        wizardBtn.appendChild(hint);

        // Remove hint after click or timeout
        const removeHint = () => {
            hint.remove();
            wizardBtn.removeEventListener('click', removeHint);
        };

        wizardBtn.addEventListener('click', removeHint);
        setTimeout(removeHint, 10000); // Auto-remove after 10s
    }

    /**
     * Start the wizard from the beginning
     */
    start() {
        if (this.steps.length === 0) {
            console.warn('[Wizard] No steps defined for this page');
            return;
        }

        this.isActive = true;
        this.currentStep = 0;
        document.body.style.overflow = 'hidden';
        this.overlay.show();
        this.showStep(this.currentStep);
    }

    /**
     * Stop the wizard
     */
    stop() {
        // Execute afterHide callback on current step if defined
        if (this.previousStepIndex !== undefined) {
            const prevStep = this.steps[this.previousStepIndex];
            if (prevStep && prevStep.afterHide && typeof prevStep.afterHide === 'function') {
                prevStep.afterHide();
            }
            this.previousStepIndex = undefined;
        }

        this.isActive = false;
        document.body.style.overflow = '';
        this.overlay.hide();
        this.tooltip.hide();
        this.clearEventListeners();
        this.waitingForEvent = null;
    }

    /**
     * Go to next step
     */
    next() {
        this.lastDirection = 1;

        // If in sub-steps mode, navigate within sub-steps
        if (this.inSubSteps) {
            this.nextSubStep();
            return;
        }

        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
        } else {
            this.finish();
        }
    }

    /**
     * Go to previous step
     */
    prev() {
        this.lastDirection = -1;

        // If in sub-steps mode, navigate within sub-steps
        if (this.inSubSteps) {
            this.prevSubStep();
            return;
        }

        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }

    /**
     * Skip current step (only for optional steps)
     */
    skip() {
        this.next();
    }

    /**
     * Go to specific step
     */
    goToStep(index) {
        if (index >= 0 && index < this.steps.length) {
            this.currentStep = index;
            this.showStep(this.currentStep);
        }
    }

    /**
     * Finish the wizard
     */
    finish() {
        this.stop();
        this.markCompleted();

        // Show success message
        if (window.showSuccess) {
            const i18n = window.i18n;
            window.showSuccess(
                i18n ? i18n.t('wizard.completed') : 'Průvodce dokončen!'
            );
        }
    }

    /**
     * Wait for scroll to finish by detecting when position stops changing
     */
    waitForScrollEnd(target, callback) {
        let lastY = target.getBoundingClientRect().top;
        let sameCount = 0;

        const checkScroll = () => {
            const currentY = target.getBoundingClientRect().top;
            if (Math.abs(currentY - lastY) < 1) {
                sameCount++;
                if (sameCount >= 3) {
                    // Position stable for 3 frames, scroll is done
                    callback();
                    return;
                }
            } else {
                sameCount = 0;
            }
            lastY = currentY;
            requestAnimationFrame(checkScroll);
        };

        requestAnimationFrame(checkScroll);
    }

    /**
     * Check if element is visible (not hidden, has dimensions, in viewport or modal)
     */
    isElementVisible(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return false;
        }

        // Check if element is inside a visible modal
        const modal = element.closest('.modal-overlay');
        if (modal) {
            const modalStyle = window.getComputedStyle(modal);
            return modalStyle.display !== 'none' && modalStyle.visibility !== 'hidden';
        }

        return true;
    }

    /**
     * Find next visible step index
     */
    findNextVisibleStep(fromIndex, direction = 1) {
        let index = fromIndex + direction;
        while (index >= 0 && index < this.steps.length) {
            const step = this.steps[index];
            const target = document.querySelector(step.target);
            if (this.isElementVisible(target) || step.required) {
                return index;
            }
            index += direction;
        }
        return direction > 0 ? this.steps.length - 1 : 0;
    }

    /**
     * Show a specific step
     */
    showStep(index) {
        this.clearEventListeners();

        // Execute afterHide callback on previous step if defined
        if (this.previousStepIndex !== undefined && this.previousStepIndex !== index) {
            const prevStep = this.steps[this.previousStepIndex];
            if (prevStep && prevStep.afterHide && typeof prevStep.afterHide === 'function') {
                prevStep.afterHide();
            }
        }
        this.previousStepIndex = index;

        const step = this.steps[index];
        if (!step) return;

        // Execute beforeShow callback if defined
        if (step.beforeShow && typeof step.beforeShow === 'function') {
            step.beforeShow();
        }

        // Find target element
        const target = document.querySelector(step.target);

        // If target is not visible and step is not required, skip to next visible step
        if (!this.isElementVisible(target) && !step.required) {
            const nextIndex = this.findNextVisibleStep(index, this.lastDirection || 1);
            if (nextIndex !== index) {
                this.currentStep = nextIndex;
                this.showStep(nextIndex);
                return;
            }
        }

        // Check if this step was already completed
        const isCompleted = this.completedSteps.has(index);

        // Render tooltip content first (but don't position yet)
        this.tooltip.render(step, index, this.steps.length, isCompleted);
        this.tooltip.show();

        // Check if we need to scroll
        let needsScroll = false;
        if (target) {
            const rect = target.getBoundingClientRect();
            needsScroll = rect.top < 100 || rect.bottom > window.innerHeight - 100;
        }

        // Block interaction if step explicitly requests it
        const blockInteraction = step.blockInteraction || false;

        if (needsScroll && target) {
            // Scroll first, then position after scroll completes
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Wait for scroll to actually complete, then position
            this.waitForScrollEnd(target, () => {
                this.overlay.highlightElement(target, 8, blockInteraction);
                this.tooltip.position(target, step.position || 'bottom');
            });
        } else {
            // No scroll needed, position immediately
            this.overlay.highlightElement(target, 8, blockInteraction);
            setTimeout(() => {
                this.tooltip.position(target, step.position || 'bottom');
            }, 50);
        }

        // Setup event listener for required steps (unless already completed)
        if (step.required && step.waitFor && !this.completedSteps.has(index)) {
            this.setupWaitForEvent(step.waitFor);
        }

        // Setup modal trigger if defined (for sub-steps when modal opens)
        if (step.modalTrigger && !this.completedSteps.has(index)) {
            this.setupModalTrigger(step.modalTrigger, index);
        }
    }

    /**
     * Setup modal trigger to show sub-steps when modal opens
     */
    setupModalTrigger(modalTrigger, parentStepIndex) {
        const modal = document.querySelector(modalTrigger.modalSelector);
        if (!modal) return;

        this.subSteps = modalTrigger.subSteps;
        this.currentSubStep = -1;
        this.parentStepIndex = parentStepIndex;
        this.inSubSteps = false;

        // Track if we're waiting for files to load after modal closed
        let waitingForLoad = false;

        // Create observer to watch for modal visibility changes
        const checkModalVisible = () => {
            const style = window.getComputedStyle(modal);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

            if (isVisible && !this.inSubSteps && this.subSteps && this.subSteps.length > 0) {
                // Modal just opened, start sub-steps
                this.inSubSteps = true;
                this.currentSubStep = 0;
                waitingForLoad = false;
                this.showSubStep(this.currentSubStep);
            } else if (!isVisible && this.inSubSteps) {
                // Modal closed, exit sub-steps
                this.inSubSteps = false;
                this.currentSubStep = -1;

                // Check if the parent step was completed (file was loaded)
                if (this.completedSteps.has(this.parentStepIndex)) {
                    // Step completed, advance to next step
                    this.currentStep = this.parentStepIndex + 1;
                    if (this.currentStep < this.steps.length) {
                        this.showStep(this.currentStep);
                    } else {
                        this.finish();
                    }
                } else {
                    // Step not completed yet - files are still loading
                    // Just hide the tooltip and wait for the event
                    // Don't call showStep which would clear the event listener!
                    this.tooltip.hide();
                    this.overlay.highlightElement(null);
                    waitingForLoad = true;
                }
            } else if (waitingForLoad && this.completedSteps.has(this.parentStepIndex)) {
                // Files finished loading after modal closed
                waitingForLoad = false;
                this.currentStep = this.parentStepIndex + 1;
                if (this.currentStep < this.steps.length) {
                    this.showStep(this.currentStep);
                } else {
                    this.finish();
                }
            }
        };

        // Check periodically while on this step
        this.modalCheckInterval = setInterval(checkModalVisible, 200);
        this.eventListeners.push({ interval: this.modalCheckInterval });
    }

    /**
     * Validate a sub-step condition
     */
    validateSubStep(subStep) {
        if (!subStep.validate) return { valid: true };

        const validate = subStep.validate;
        const i18n = window.i18n;

        if (validate.type === 'selectedCount') {
            // Check if selected count meets minimum
            const countEl = document.querySelector(validate.selector);
            const count = countEl ? parseInt(countEl.textContent, 10) : 0;
            if (count < validate.minValue) {
                return {
                    valid: false,
                    message: i18n ? i18n.t(validate.errorKey) : 'Please select at least one file'
                };
            }
        } else if (validate.selector) {
            // Check if elements exist
            const elements = document.querySelectorAll(validate.selector);
            if (elements.length === 0) {
                return {
                    valid: false,
                    message: i18n ? i18n.t(validate.errorKey) : 'No files available'
                };
            }
        }

        return { valid: true };
    }

    /**
     * Show a sub-step (inside modal)
     */
    showSubStep(subIndex) {
        if (!this.subSteps || subIndex < 0 || subIndex >= this.subSteps.length) return;

        const subStep = this.subSteps[subIndex];
        const target = document.querySelector(subStep.target);
        const i18n = window.i18n;

        // Validate and get any warning message
        const validation = this.validateSubStep(subStep);

        // Build content with optional warning
        let content = i18n ? i18n.t(subStep.content) : subStep.content;
        if (!validation.valid && validation.message) {
            content = `⚠️ ${validation.message}\n\n${content}`;
        }

        // Update tooltip for sub-step
        const totalSteps = this.steps.length;
        const displayIndex = this.parentStepIndex;

        this.tooltip.render({
            ...subStep,
            content: content,
            title: i18n ? i18n.t(subStep.title) : subStep.title,
            required: false
        }, displayIndex, totalSteps, false);
        this.tooltip.show();

        // Disable Next button if validation fails (for steps with validation)
        if (subStep.validate) {
            const nextBtn = this.tooltip.element.querySelector('[data-action="next"]');
            if (nextBtn) {
                nextBtn.disabled = !validation.valid;
            }
        }

        // Position on target - delay to ensure modal is fully rendered
        setTimeout(() => {
            // Re-query target in case DOM changed during modal animation
            const currentTarget = document.querySelector(subStep.target);
            // Use blockInteraction from subStep config (default to false)
            const blockInteraction = subStep.blockInteraction || false;
            this.overlay.highlightElement(currentTarget, 8, blockInteraction);
            setTimeout(() => {
                this.tooltip.position(currentTarget, subStep.position || 'bottom');
            }, 50);

            // Re-validate after delay (tree might have loaded)
            if (subStep.validate) {
                const revalidation = this.validateSubStep(subStep);
                const nextBtn = this.tooltip.element.querySelector('[data-action="next"]');
                if (nextBtn) {
                    nextBtn.disabled = !revalidation.valid;
                }
                // Update content if validation state changed
                if (revalidation.valid !== validation.valid) {
                    let newContent = i18n ? i18n.t(subStep.content) : subStep.content;
                    if (!revalidation.valid && revalidation.message) {
                        newContent = `⚠️ ${revalidation.message}\n\n${newContent}`;
                    }
                    const contentEl = this.tooltip.element.querySelector('.wizard-tooltip__content');
                    if (contentEl) {
                        contentEl.textContent = newContent;
                    }
                }
            }
        }, 150);
    }

    /**
     * Override next/prev for sub-steps
     */
    nextSubStep() {
        const currentSubStep = this.subSteps[this.currentSubStep];

        // Re-validate before proceeding
        if (currentSubStep && currentSubStep.validate) {
            const validation = this.validateSubStep(currentSubStep);
            if (!validation.valid) {
                // Refresh to show updated message
                this.showSubStep(this.currentSubStep);
                return;
            }
        }

        // Handle clickOnNext - click the target element
        if (currentSubStep && currentSubStep.clickOnNext) {
            const targetEl = document.querySelector(currentSubStep.target);
            if (targetEl) {
                targetEl.click();
            }
            return; // Don't advance - wait for file load event
        }

        // Move to next sub-step
        if (this.currentSubStep < this.subSteps.length - 1) {
            this.currentSubStep++;
            this.showSubStep(this.currentSubStep);
        }
    }

    prevSubStep() {
        if (this.currentSubStep > 0) {
            this.currentSubStep--;
            this.showSubStep(this.currentSubStep);
        } else {
            // At first sub-step, close modal and return to parent step
            const step = this.steps[this.parentStepIndex];
            if (step && step.modalTrigger) {
                const modal = document.querySelector(step.modalTrigger.modalSelector);
                if (modal) {
                    // Find and click the cancel/close button
                    const closeBtn = modal.querySelector('.modal-close, .btn-secondary, [onclick*="close"]');
                    if (closeBtn) {
                        closeBtn.click();
                    } else {
                        // Fallback: hide modal directly
                        modal.classList.remove('active');
                        modal.style.display = 'none';
                    }
                }
            }
            // Exit sub-steps mode (will be handled by modal visibility check)
            this.inSubSteps = false;
            this.currentSubStep = -1;
            this.showStep(this.parentStepIndex);
        }
    }

    /**
     * Position current step (for resize handling)
     */
    positionCurrentStep() {
        const step = this.steps[this.currentStep];
        if (!step) return;

        const target = document.querySelector(step.target);
        const blockInteraction = step.blockInteraction || false;
        this.overlay.highlightElement(target, 8, blockInteraction);
        this.tooltip.position(target, step.position || 'bottom');
    }

    /**
     * Setup event listener for required action
     */
    setupWaitForEvent(waitFor) {
        this.waitingForEvent = waitFor;

        if (waitFor.event) {
            const handler = () => {
                this.waitingForEvent = null;
                // Mark this step as completed
                this.completedSteps.add(this.currentStep);

                // Check if step has hideButtons - if so, auto-advance
                const step = this.steps[this.currentStep];
                if (step && step.hideButtons) {
                    // Auto-advance to next step
                    if (this.currentStep < this.steps.length - 1) {
                        this.currentStep++;
                        this.showStep(this.currentStep);
                    } else {
                        this.finish();
                    }
                } else {
                    this.tooltip.enableNext();
                }
            };

            // Custom event listener - this is the only way to complete the step
            document.addEventListener(waitFor.event, handler, { once: true });
            this.eventListeners.push({ event: waitFor.event, handler });

            // For file inputs, also listen for change event
            const step = this.steps[this.currentStep];
            if (step && step.target) {
                const target = document.querySelector(step.target);
                if (target && target.tagName === 'INPUT' && target.type === 'file') {
                    target.addEventListener('change', handler, { once: true });
                    this.eventListeners.push({ element: target, event: 'change', handler });
                }
            }
        }

        // Timeout fallback (if specified)
        if (waitFor.timeout) {
            setTimeout(() => {
                if (this.waitingForEvent === waitFor) {
                    this.tooltip.enableNext();
                    this.waitingForEvent = null;
                }
            }, waitFor.timeout);
        }
    }

    /**
     * Clear all event listeners
     */
    clearEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, interval }) => {
            if (interval) {
                clearInterval(interval);
            } else {
                const target = element || document;
                target.removeEventListener(event, handler);
            }
        });
        this.eventListeners = [];
        this.inSubSteps = false;
        this.subSteps = null;
        this.currentSubStep = -1;
    }

    /**
     * Mark wizard as completed for this page
     */
    markCompleted() {
        localStorage.setItem(`wizardCompleted.${this.currentPage}`, 'true');
    }

    /**
     * Check if wizard was completed
     */
    isCompleted() {
        return localStorage.getItem(`wizardCompleted.${this.currentPage}`) === 'true';
    }

    /**
     * Open help sidebar
     */
    openSidebar() {
        this.sidebar.open();
    }

    /**
     * Close help sidebar
     */
    closeSidebar() {
        this.sidebar.close();
    }

    /**
     * Handle keyboard navigation
     */
    handleKeydown(e) {
        if (!this.isActive) return;

        // Don't capture keys when user is typing in input/textarea or dialog is open
        const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        const isDialogOpen = document.querySelector('.error-overlay.show, .swal2-container, [role="dialog"]');

        switch (e.key) {
            case 'Escape':
                // Only stop wizard if no dialog is open
                if (!isDialogOpen) {
                    this.stop();
                }
                break;
            case 'ArrowRight':
                if (!this.waitingForEvent && !isTyping) {
                    this.next();
                }
                break;
            case 'Enter':
                // Don't capture Enter when typing or dialog is open
                if (!this.waitingForEvent && !isTyping && !isDialogOpen) {
                    this.next();
                }
                break;
            case 'ArrowLeft':
                if (!isTyping) {
                    this.prev();
                }
                break;
        }
    }

    /**
     * Destroy wizard and clean up
     */
    destroy() {
        this.stop();
        this.overlay?.destroy();
        this.tooltip?.destroy();
        this.sidebar?.destroy();
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.WizardManager = WizardManager;
}
