/* ===========================================
   BIM CHECKER - PERFORMANCE MONITOR
   Real-time performance monitoring
   =========================================== */

class PerformanceMonitor {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.showPanel = options.showPanel || false;
        this.warnThreshold = options.warnThreshold || {
            memory: 500, // MB
            fps: 30,
            loadTime: 3000 // ms
        };

        this.metrics = {
            fps: 0,
            memory: 0,
            loadTime: 0,
            parseTime: 0,
            renderTime: 0,
            entityCount: 0,
            fileSize: 0
        };

        this.history = {
            fps: [],
            memory: [],
            timestamps: []
        };

        this.maxHistoryLength = 60; // Keep last 60 samples
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.memoryIntervalId = null; // Store interval ID for cleanup

        if (this.enabled) {
            this.init();
        }
    }

    init() {
        // Create performance panel if needed
        if (this.showPanel) {
            this.createPanel();
        }

        // Start monitoring
        this.startMonitoring();

        // Set up performance marks
        this.setupPerformanceObserver();
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'performance-monitor';
        panel.innerHTML = `
            <div class="perf-monitor">
                <div class="perf-header">
                    <span>📊 Performance</span>
                    <button class="perf-close">✕</button>
                </div>
                <div class="perf-content">
                    <div class="perf-metric">
                        <span class="perf-label">FPS:</span>
                        <span class="perf-value" id="perf-fps">0</span>
                    </div>
                    <div class="perf-metric">
                        <span class="perf-label">Memory:</span>
                        <span class="perf-value" id="perf-memory">0 MB</span>
                    </div>
                    <div class="perf-metric">
                        <span class="perf-label">Entities:</span>
                        <span class="perf-value" id="perf-entities">0</span>
                    </div>
                    <div class="perf-metric">
                        <span class="perf-label">Load Time:</span>
                        <span class="perf-value" id="perf-load">0 ms</span>
                    </div>
                    <canvas id="perf-graph" width="200" height="50"></canvas>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .perf-monitor {
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.9);
                color: #0f0;
                font-family: monospace;
                font-size: 12px;
                padding: 10px;
                border-radius: 5px;
                z-index: 10000;
                min-width: 220px;
            }
            
            .perf-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 5px;
                border-bottom: 1px solid #0f0;
            }
            
            .perf-close {
                background: none;
                border: none;
                color: #0f0;
                cursor: pointer;
                font-size: 16px;
                padding: 0;
            }
            
            .perf-metric {
                display: flex;
                justify-content: space-between;
                margin: 5px 0;
            }
            
            .perf-label {
                opacity: 0.7;
            }
            
            .perf-value {
                font-weight: bold;
            }
            
            .perf-value.warning {
                color: #ff0;
            }
            
            .perf-value.critical {
                color: #f00;
            }
            
            #perf-graph {
                margin-top: 10px;
                border: 1px solid #0f0;
                width: 100%;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(panel);

        // Set up close button
        panel.querySelector('.perf-close').addEventListener('click', () => {
            panel.style.display = 'none';
            this.showPanel = false;
        });

        this.panel = panel;
        this.canvas = panel.querySelector('#perf-graph');
        this.ctx = this.canvas.getContext('2d');
    }

    startMonitoring() {
        // Monitor FPS
        const measureFPS = () => {
            const now = performance.now();
            const delta = now - this.lastFrameTime;

            this.frameCount++;

            if (delta >= 1000) {
                this.metrics.fps = Math.round(this.frameCount * 1000 / delta);
                this.frameCount = 0;
                this.lastFrameTime = now;
            }

            requestAnimationFrame(measureFPS);
        };

        measureFPS();

        // Monitor memory (if available)
        if (performance.memory) {
            this.memoryIntervalId = setInterval(() => {
                this.metrics.memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
                this.updateHistory();
                this.updatePanel();
                this.checkThresholds();
            }, 1000);
        }
    }

    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'measure') {
                        this.handlePerformanceMeasure(entry);
                    }
                }
            });

            observer.observe({ entryTypes: ['measure'] });
        }
    }

    handlePerformanceMeasure(entry) {
        switch(entry.name) {
            case 'ifc-parse':
                this.metrics.parseTime = Math.round(entry.duration);
                break;
            case 'render-update':
                this.metrics.renderTime = Math.round(entry.duration);
                break;
            case 'file-load':
                this.metrics.loadTime = Math.round(entry.duration);
                break;
        }
    }

    updateHistory() {
        this.history.fps.push(this.metrics.fps);
        this.history.memory.push(this.metrics.memory);
        this.history.timestamps.push(Date.now());

        // Limit history length
        if (this.history.fps.length > this.maxHistoryLength) {
            this.history.fps.shift();
            this.history.memory.shift();
            this.history.timestamps.shift();
        }
    }

    updatePanel() {
        if (!this.showPanel || !this.panel) {
            return;
        }

        // Update values
        const fpsElement = this.panel.querySelector('#perf-fps');
        const memoryElement = this.panel.querySelector('#perf-memory');
        const entitiesElement = this.panel.querySelector('#perf-entities');
        const loadElement = this.panel.querySelector('#perf-load');

        fpsElement.textContent = this.metrics.fps;
        memoryElement.textContent = `${this.metrics.memory} MB`;
        entitiesElement.textContent = this.metrics.entityCount;
        loadElement.textContent = `${this.metrics.loadTime} ms`;

        // Apply warning styles
        this.applyWarningStyle(fpsElement, this.metrics.fps < this.warnThreshold.fps);
        this.applyWarningStyle(memoryElement, this.metrics.memory > this.warnThreshold.memory);
        this.applyWarningStyle(loadElement, this.metrics.loadTime > this.warnThreshold.loadTime);

        // Draw graph
        this.drawGraph();
    }

    applyWarningStyle(element, isWarning) {
        if (isWarning) {
            element.classList.add('warning');
        } else {
            element.classList.remove('warning');
        }
    }

    drawGraph() {
        if (!this.ctx) {
            return;
        }

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, width, height);

        // Draw FPS graph
        if (this.history.fps.length > 1) {
            this.ctx.strokeStyle = '#0f0';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();

            for (let i = 0; i < this.history.fps.length; i++) {
                const x = (i / (this.history.fps.length - 1)) * width;
                const y = height - (this.history.fps[i] / 60) * height;

                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }

            this.ctx.stroke();
        }

        // Draw memory graph (scaled)
        if (this.history.memory.length > 1) {
            this.ctx.strokeStyle = '#ff0';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();

            const maxMemory = Math.max(...this.history.memory, 100);

            for (let i = 0; i < this.history.memory.length; i++) {
                const x = (i / (this.history.memory.length - 1)) * width;
                const y = height - (this.history.memory[i] / maxMemory) * height;

                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }

            this.ctx.stroke();
        }
    }

    checkThresholds() {
        // Check for performance issues
        if (this.metrics.memory > this.warnThreshold.memory) {
            this.onMemoryWarning(this.metrics.memory);
        }

        if (this.metrics.fps < this.warnThreshold.fps && this.metrics.fps > 0) {
            this.onFPSWarning(this.metrics.fps);
        }
    }

    onMemoryWarning(memory) {
        console.warn(`High memory usage: ${memory} MB`);

        // Trigger memory optimization
        if (memory > this.warnThreshold.memory * 1.5) {
            this.suggestOptimization();
        }
    }

    onFPSWarning(fps) {
        console.warn(`Low FPS: ${fps}`);
    }

    suggestOptimization() {
        const suggestions = [];

        if (this.metrics.entityCount > 50000) {
            suggestions.push('Consider filtering entities or using pagination');
        }

        if (this.metrics.memory > 500) {
            suggestions.push('Clear unused data from memory');
            suggestions.push('Consider using streaming for large files');
        }

        if (this.metrics.renderTime > 100) {
            suggestions.push('Optimize rendering with virtualization');
        }

        if (suggestions.length > 0) {
            console.group('Performance Optimization Suggestions');
            suggestions.forEach(s => console.log(`• ${s}`));
            console.groupEnd();
        }
    }

    // Public API
    startMeasure(name) {
        if (this.enabled) {
            performance.mark(`${name}-start`);
        }
    }

    endMeasure(name) {
        if (this.enabled) {
            performance.mark(`${name}-end`);
            performance.measure(name, `${name}-start`, `${name}-end`);
        }
    }

    updateMetric(name, value) {
        this.metrics[name] = value;
        this.updatePanel();
    }

    reset() {
        this.metrics = {
            fps: 0,
            memory: 0,
            loadTime: 0,
            parseTime: 0,
            renderTime: 0,
            entityCount: 0,
            fileSize: 0
        };

        this.history = {
            fps: [],
            memory: [],
            timestamps: []
        };

        this.updatePanel();
    }

    toggle() {
        this.showPanel = !this.showPanel;

        if (this.showPanel) {
            if (!this.panel) {
                this.createPanel();
            }
            this.panel.style.display = 'block';
        } else if (this.panel) {
            this.panel.style.display = 'none';
        }
    }

    destroy() {
        // Clear memory monitoring interval
        if (this.memoryIntervalId) {
            clearInterval(this.memoryIntervalId);
            this.memoryIntervalId = null;
        }

        if (this.panel) {
            this.panel.remove();
        }
    }
}

// Export for use
window.PerformanceMonitor = PerformanceMonitor;

// Auto-initialize with keyboard shortcut
document.addEventListener('DOMContentLoaded', () => {
    // Create global performance monitor
    window.perfMonitor = new PerformanceMonitor({
        enabled: true,
        showPanel: false
    });

    // Toggle with Ctrl+Shift+P
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            window.perfMonitor.toggle();
        }
    });
});
