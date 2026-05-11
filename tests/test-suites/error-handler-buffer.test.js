/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('ErrorHandler ring buffer', () => {
    beforeEach(() => {
        // Reset buffer between tests
        ErrorHandler._errorBuffer = [];
    });

    it('should expose recordError and getRecentErrors', () => {
        expect(typeof ErrorHandler.recordError).toBe('function');
        expect(typeof ErrorHandler.getRecentErrors).toBe('function');
    });

    it('should record an error message', () => {
        ErrorHandler.recordError('Test error 1');
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBe(1);
        expect(errors[0].includes('Test error 1')).toBe(true);
    });

    it('should keep only last 5 errors (FIFO)', () => {
        for (let i = 1; i <= 7; i++) {
            ErrorHandler.recordError(`Error ${i}`);
        }
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBe(5);
        expect(errors[0].includes('Error 3')).toBe(true);
        expect(errors[4].includes('Error 7')).toBe(true);
    });

    it('should return a defensive copy from getRecentErrors', () => {
        ErrorHandler.recordError('Error A');
        const copy = ErrorHandler.getRecentErrors();
        copy.push('mutation');
        expect(ErrorHandler.getRecentErrors().length).toBe(1);
    });

    it('should capture window.error events', () => {
        ErrorHandler._errorBuffer = [];
        const evt = new ErrorEvent('error', {
            message: 'Synthetic test error',
            filename: 'test.js',
            lineno: 42,
            colno: 7
        });
        window.dispatchEvent(evt);
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[errors.length - 1].includes('Synthetic test error')).toBe(true);
    });

    it('should capture unhandledrejection events', () => {
        ErrorHandler._errorBuffer = [];
        // Note: synthetic dispatch of PromiseRejectionEvent in JSDOM/Puppeteer requires the event constructor
        const evt = new Event('unhandledrejection');
        evt.reason = { message: 'Synthetic rejection' };
        window.dispatchEvent(evt);
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.some(e => e.includes('Synthetic rejection'))).toBe(true);
    });
});
