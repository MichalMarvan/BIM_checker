/* ===========================================
   BIM CHECKER - WORKER POOL MANAGER
   Manages a pool of Web Workers for parallel processing
   =========================================== */

class WorkerPool {
    /**
     * Create a new worker pool
     * @param {Object} options
     * @param {number} options.size - Number of workers (default: auto)
     * @param {string} options.workerScript - Path to worker script
     */
    constructor(options = {}) {
        this.workerScript = options.workerScript;
        this.poolSize = options.size || WorkerPool.getOptimalPoolSize();
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        this.taskCallbacks = new Map();
        this.nextTaskId = 1;
        this.terminated = false;

        this._initializeWorkers();
    }

    /**
     * Get optimal pool size based on hardware
     * @returns {number}
     */
    static getOptimalPoolSize() {
        const cores = navigator.hardwareConcurrency || 4;
        // Leave 1 core for UI, minimum 1 worker
        return Math.max(1, cores - 1);
    }

    /**
     * Initialize worker instances
     * @private
     */
    _initializeWorkers() {
        for (let i = 0; i < this.poolSize; i++) {
            try {
                const worker = new Worker(this.workerScript);
                worker.id = i;
                worker.busy = false;

                worker.onmessage = (e) => this._handleWorkerMessage(worker, e);
                worker.onerror = (e) => this._handleWorkerError(worker, e);

                this.workers.push(worker);
                this.availableWorkers.push(worker);
            } catch (error) {
                console.warn(`Failed to create worker ${i}:`, error);
            }
        }
    }

    /**
     * Handle message from worker
     * @private
     */
    _handleWorkerMessage(worker, event) {
        const { taskId, type, data, error } = event.data;

        if (taskId && this.taskCallbacks.has(taskId)) {
            const { resolve, reject } = this.taskCallbacks.get(taskId);
            this.taskCallbacks.delete(taskId);

            if (error) {
                reject(new Error(error));
            } else {
                resolve(data);
            }
        }

        // Worker is now available
        worker.busy = false;
        this.availableWorkers.push(worker);

        // Process next queued task
        this._processQueue();
    }

    /**
     * Handle worker error
     * @private
     */
    _handleWorkerError(worker, error) {
        console.error(`Worker ${worker.id} error:`, error);
        worker.busy = false;
        this.availableWorkers.push(worker);
        this._processQueue();
    }

    /**
     * Process next task in queue
     * @private
     */
    _processQueue() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }

        const task = this.taskQueue.shift();
        this._executeTask(task);
    }

    /**
     * Execute a task on an available worker
     * @private
     */
    _executeTask(task) {
        const worker = this.availableWorkers.pop();
        if (!worker) {
            this.taskQueue.unshift(task);
            return;
        }

        worker.busy = true;
        worker.postMessage({
            taskId: task.id,
            type: task.type,
            data: task.data
        }, task.transferables || []);
    }

    /**
     * Submit a task to the pool
     * @param {string} type - Task type
     * @param {*} data - Task data
     * @param {Object} [options] - Options
     * @param {Array} [options.transferables] - Transferable objects
     * @param {number} [options.priority=0] - Task priority (higher = first)
     * @returns {Promise} Resolves with task result
     */
    submit(type, data, options = {}) {
        const { transferables = [], priority = 0 } = options;

        return new Promise((resolve, reject) => {
            if (this.terminated) {
                reject(new Error('Pool has been terminated'));
                return;
            }

            const taskId = this.nextTaskId++;
            const task = { id: taskId, type, data, transferables, priority };

            this.taskCallbacks.set(taskId, { resolve, reject });

            if (this.availableWorkers.length > 0) {
                this._executeTask(task);
            } else {
                // Insert by priority (higher priority first)
                const insertIndex = this.taskQueue.findIndex(t => t.priority < priority);
                if (insertIndex === -1) {
                    this.taskQueue.push(task);
                } else {
                    this.taskQueue.splice(insertIndex, 0, task);
                }
            }
        });
    }

    /**
     * Get pool statistics
     * @returns {Object}
     */
    getStats() {
        return {
            size: this.workers.length,
            active: this.workers.filter(w => w.busy).length,
            available: this.availableWorkers.length,
            queued: this.taskQueue.length
        };
    }

    /**
     * Get pool size
     * @returns {number}
     */
    get size() {
        return this.workers.length;
    }

    /**
     * Get queue length
     * @returns {number}
     */
    get queueLength() {
        return this.taskQueue.length;
    }

    /**
     * Terminate all workers
     */
    terminate() {
        this.terminated = true;

        for (const worker of this.workers) {
            worker.terminate();
        }

        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];

        // Reject pending callbacks
        for (const [taskId, { reject }] of this.taskCallbacks) {
            reject(new Error('Pool terminated'));
        }
        this.taskCallbacks.clear();
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.WorkerPool = WorkerPool;
}
