// =======================
// WORKER POOL TESTS
// =======================

describe('Worker Pool Manager', () => {

    it('should detect hardware concurrency', () => {
        const poolSize = WorkerPool.getOptimalPoolSize();
        expect(poolSize).toBeGreaterThan(0);
        expect(poolSize <= (navigator.hardwareConcurrency || 4)).toBe(true);
    });

    it('should create pool with specified size', () => {
        const pool = new WorkerPool({ size: 2, workerScript: 'test-worker.js' });
        expect(pool.size).toBe(2);
        pool.terminate();
    });

    it('should queue tasks when all workers busy', () => {
        const pool = new WorkerPool({ size: 1, workerScript: 'test-worker.js' });
        expect(pool.queueLength).toBe(0);
        pool.terminate();
    });

    it('should return pool stats', () => {
        const pool = new WorkerPool({ size: 2, workerScript: 'test-worker.js' });
        const stats = pool.getStats();

        expect(stats.size).toBe(2);
        expect(stats.active).toBe(0);
        expect(stats.queued).toBe(0);

        pool.terminate();
    });

    it('should terminate all workers', () => {
        const pool = new WorkerPool({ size: 2, workerScript: 'test-worker.js' });
        pool.terminate();

        const stats = pool.getStats();
        expect(stats.size).toBe(0);
    });

    it('should have submit method', () => {
        const pool = new WorkerPool({ size: 1, workerScript: 'test-worker.js' });
        expect(pool.submit).toBeDefined();
        pool.terminate();
    });

    it('should reject submit after termination', async () => {
        const pool = new WorkerPool({ size: 1, workerScript: 'test-worker.js' });
        pool.terminate();

        let errorThrown = false;
        try {
            await pool.submit('TEST', {});
        } catch (e) {
            errorThrown = true;
            expect(e.message).toContain('terminated');
        }
        expect(errorThrown).toBe(true);
    });

});
