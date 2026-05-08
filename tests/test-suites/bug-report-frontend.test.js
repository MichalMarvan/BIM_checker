describe('BugReport namespace', () => {
    beforeEach(() => {
        // Remove any leftover modal from previous tests
        const existing = document.getElementById('bugReportModal');
        if (existing) existing.remove();
        // Reset _injected state
        if (window.BugReport && window.BugReport._reset) {
            window.BugReport._reset();
        }
    });

    it('should expose BugReport namespace', () => {
        expect(typeof window.BugReport).toBe('object');
        expect(typeof window.BugReport.init).toBe('function');
        expect(typeof window.BugReport.open).toBe('function');
        expect(typeof window.BugReport.close).toBe('function');
    });

    it('init() injects modal HTML into document.body', () => {
        BugReport.init();
        const modal = document.getElementById('bugReportModal');
        expect(modal).toBeTruthy();
        expect(modal.querySelector('#bugReportTitle')).toBeTruthy();
        expect(modal.querySelector('#bugReportDesc')).toBeTruthy();
        expect(modal.querySelector('#bugReportSubmit')).toBeTruthy();
    });

    it('init() is idempotent', () => {
        BugReport.init();
        BugReport.init();
        const modals = document.querySelectorAll('#bugReportModal');
        expect(modals.length).toBe(1);
    });

    it('open() shows modal and resets fields', () => {
        BugReport.init();
        document.getElementById('bugReportTitle').value = 'old title';
        document.getElementById('bugReportDesc').value = 'old desc';
        BugReport.open();
        const modal = document.getElementById('bugReportModal');
        expect(modal.style.display).toBe('flex');
        expect(document.getElementById('bugReportTitle').value).toBe('');
        expect(document.getElementById('bugReportDesc').value).toBe('');
    });

    it('close() hides modal', () => {
        BugReport.init();
        BugReport.open();
        BugReport.close();
        const modal = document.getElementById('bugReportModal');
        expect(modal.style.display).toBe('none');
    });

    it('buildMetadata() returns required fields', () => {
        BugReport.init();
        const m = BugReport._buildMetadata();
        expect(typeof m.appVersion).toBe('string');
        expect(typeof m.userAgent).toBe('string');
        expect(typeof m.pagePath).toBe('string');
        expect(typeof m.language).toBe('string');
        expect(typeof m.timestamp).toBe('string');
        expect(Array.isArray(m.recentErrors)).toBe(true);
    });

    it('buildMetadata().recentErrors mirrors ErrorHandler buffer', () => {
        BugReport.init();
        ErrorHandler._errorBuffer = [];
        ErrorHandler.recordError('Test error A');
        ErrorHandler.recordError('Test error B');
        const m = BugReport._buildMetadata();
        expect(m.recentErrors.length).toBe(2);
        expect(m.recentErrors[0].includes('Test error A')).toBe(true);
    });

    it('submit with empty title shows inline error and does not call fetch', async () => {
        BugReport.init();
        BugReport.open();
        let fetchCalled = false;
        const origFetch = window.fetch;
        window.fetch = () => { fetchCalled = true; return Promise.resolve(new Response('{}', { status: 201 })); };

        document.getElementById('bugReportTitle').value = '';
        document.getElementById('bugReportDesc').value = 'desc';
        await BugReport._submit();

        expect(fetchCalled).toBe(false);
        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);

        window.fetch = origFetch;
    });

    it('submit with 201 response shows success state with issue URL', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve(new Response(
            JSON.stringify({ ok: true, issueUrl: 'https://github.com/x/y/issues/42', issueNumber: 42 }),
            { status: 201 }
        ));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const successEl = document.getElementById('bugReportSuccess');
        expect(successEl.hasAttribute('hidden')).toBe(false);
        expect(successEl.innerHTML.includes('issues/42')).toBe(true);

        window.fetch = origFetch;
    });

    it('submit with 429 shows rate limit message', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve(new Response(
            JSON.stringify({ error: 'rate_limit', limit: 'hourly' }),
            { status: 429 }
        ));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);
        // Error message should reference rate limit
        expect(errEl.textContent.toLowerCase().includes('mnoho') || errEl.textContent.toLowerCase().includes('many')).toBe(true);

        window.fetch = origFetch;
    });

    it('submit with network failure shows fallback link', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('Network down'));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);
        expect(errEl.innerHTML.includes('github.com/MichalMarvan/BIM_checker/issues/new')).toBe(true);

        window.fetch = origFetch;
    });
});
