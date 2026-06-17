const { performance } = require('perf_hooks');
const EventEmitter = require('events');
const os = require('os');

/**
 * AntiLagSystem
 * High-resolution Event Loop monitoring and Backpressure controller.
 * Prevents "Severe Congestion" by providing a scaling factor for resource-intensive tasks.
 */
class AntiLagSystem extends EventEmitter {
    constructor() {
        super();
        this.emaLag = 0; // Menggunakan Exponential Moving Average
        this.backpressure = 0;
        this.alpha = 0.2; // Faktor bobot untuk EMA (0.1 - 0.3 disarankan)
        this.checkInterval = 100;
        this.lastCongestionEmit = 0;
        this.thresholds = {
            warning: 100,
            critical: 400,
            panic: 1200
        };
        this.isActive = false;
    }

    /**
     * Starts the monitor. Uses setImmediate to measure the actual delay
     * in the Node.js Event Loop queue.
     */
    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.monitor();
    }

    monitor() {
        let lastCheck = performance.now();

        const tick = () => {
            if (!this.isActive) return;
            
            const now = performance.now();
            const currentLag = Math.max(0, now - lastCheck - this.checkInterval);
            lastCheck = now;

            this.updateStats(currentLag);

            // Menggunakan setTimeout dikombinasikan dengan durasi dinamis
            setTimeout(tick, this.checkInterval);
        };

        setTimeout(tick, this.checkInterval);
    }

    updateStats(lag) {
        // Kalkulasi EMA: Lebih ringan daripada looping array history
        this.emaLag = (lag * this.alpha) + (this.emaLag * (1 - this.alpha));
        
        // Kalkulasi Backpressure: Menggunakan kuadratik agar pengereman lebih kuat di titik kritis
        const rawPressure = Math.min(1, this.emaLag / this.thresholds.panic);
        this.backpressure = Math.pow(rawPressure, 2); 

        if (this.emaLag > this.thresholds.critical && Date.now() - this.lastCongestionEmit > 5000) {
            this.lastCongestionEmit = Date.now();
            this.emit('congestion', { lag: this.emaLag, factor: this.backpressure });
        }
    }

    /**
     * Returns a recommended delay multiplier.
     * Usage: setTimeout(task, 100 * antiLag.getThrottleMultiplier())
     */
    getThrottleMultiplier() {
        if (this.backpressure < 0.1) return 1;
        // Multiplier meningkat tajam saat mendekati panic threshold
        return 1 + (this.backpressure * 15); 
    }

    /**
     * Returns a recommended concurrency scale.
     * Usage: const threads = Math.floor(maxThreads * antiLag.getEfficiencyFactor())
     */
    getEfficiencyFactor() {
        // Inverse of backpressure with a floor of 10%
        return Math.max(0.1, 1 - this.backpressure);
    }

    getStatus() {
        let state = 'HEALTHY';
        if (this.emaLag > this.thresholds.panic) state = 'PANIC';
        else if (this.emaLag > this.thresholds.critical) state = 'CRITICAL';
        else if (this.emaLag > this.thresholds.warning) state = 'WARNING';

        return {
            state,
            lag: this.emaLag.toFixed(2),
            backpressure: (this.backpressure * 100).toFixed(1) + '%',
            loadAvg: os.loadavg()[0].toFixed(2)
        };
    }

    stop() {
        this.isActive = false;
    }
}

// Export as Singleton
const antiLag = new AntiLagSystem();
antiLag.start();

module.exports = antiLag;