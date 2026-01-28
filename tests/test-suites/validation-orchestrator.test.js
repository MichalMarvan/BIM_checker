// =======================
// VALIDATION ORCHESTRATOR TESTS
// =======================

describe('Validation Orchestrator', () => {

    it('should determine strategy for small file', () => {
        const strategy = ValidationOrchestrator.determineStrategy(30 * 1024 * 1024); // 30MB
        expect(strategy).toBe('single');
    });

    it('should determine strategy for large file', () => {
        const strategy = ValidationOrchestrator.determineStrategy(60 * 1024 * 1024); // 60MB
        expect(strategy).toBe('parallel');
    });

    it('should use 50MB as threshold', () => {
        expect(ValidationOrchestrator.LARGE_FILE_THRESHOLD).toBe(50 * 1024 * 1024);
    });

    it('should calculate chunk size based on file size', () => {
        const chunkSize = ValidationOrchestrator.calculateChunkSize(100 * 1024 * 1024);
        expect(chunkSize).toBeGreaterThan(0);
        expect(chunkSize <= 10 * 1024 * 1024).toBe(true); // Max 10MB chunks
    });

    it('should emit progress events', () => {
        const orchestrator = new ValidationOrchestrator();
        let progressReceived = false;

        orchestrator.on('progress', (data) => {
            progressReceived = true;
        });

        orchestrator.emit('progress', { percent: 50 });
        expect(progressReceived).toBe(true);
    });

    it('should check worker support', () => {
        const supported = ValidationOrchestrator.isWorkerSupported();
        // In browser should be true
        expect(typeof supported).toBe('boolean');
    });

    it('should allow adding and removing listeners', () => {
        const orchestrator = new ValidationOrchestrator();
        let callCount = 0;
        const listener = () => callCount++;

        orchestrator.on('test', listener);
        orchestrator.emit('test', {});
        expect(callCount).toBe(1);

        orchestrator.off('test', listener);
        orchestrator.emit('test', {});
        expect(callCount).toBe(1); // Should still be 1
    });

    it('should handle abort', () => {
        const orchestrator = new ValidationOrchestrator();
        let abortEmitted = false;

        orchestrator.on('abort', () => {
            abortEmitted = true;
        });

        orchestrator.abort();
        expect(abortEmitted).toBe(true);
        expect(orchestrator.aborted).toBe(true);
    });

});
