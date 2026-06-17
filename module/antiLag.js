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
        this.emaLagFast = 0; // Deteksi spike mendadak
        this.emaLagSlow = 0; // Deteksi tren jangka panjang
        this.backpressure = 0;
        this.alphaFast = 0.5;
        this.alphaSlow = 0.05;
        this.checkInterval = 50; // Interval lebih rapat (50ms) untuk presisi tinggi
        this.lastCongestionEmit = 0;
        this.maxMemory = 420 * 1024 * 1024; // Batas waspada RAM diturunkan untuk Render (512MB limit)
        this.thresholds = {
            warning: 50,   // ms
            critical: 200, // ms
            panic: 600     // ms lag di atas 600ms sudah dianggap bahaya besar
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
        const tick = () => {
            if (!this.isActive) return;
            
            const start = performance.now();
            
            // Menggunakan setImmediate untuk mengukur jeda antrian Event Loop yang sebenarnya
            setImmediate(() => {
                const currentLag = performance.now() - start;
                this.updateStats(currentLag);
                
                // Dinamis interval: jika berat, monitor lebih kencang
                const nextCheck = this.backpressure > 0.7 ? 20 : this.checkInterval;
                setTimeout(tick, nextCheck);
            });
        };

        tick();
    }

    updateStats(lag) {
        // 1. Kalkulasi Dual-EMA
        this.emaLagFast = (lag * this.alphaFast) + (this.emaLagFast * (1 - this.alphaFast));
        this.emaLagSlow = (lag * this.alphaSlow) + (this.emaLagSlow * (1 - this.alphaSlow));
        
        // 2. Faktor Memori (RSS)
        const memUsage = process.memoryUsage().rss;
        const memFactor = Math.min(1, memUsage / this.maxMemory);

        // 3. Kombinasi Tekanan: 70% Lag + 30% RAM
        const lagPressure = Math.min(1, this.emaLagFast / this.thresholds.panic);
        const combinedPressure = (lagPressure * 0.7) + (memFactor * 0.3);

        // 4. Skalabilitas Kuadratik: Rem makin dalam jika tekanan makin tinggi
        this.backpressure = Math.pow(combinedPressure, 2); 

        // Emit event jika kondisi kritis (Debounced 5s)
        if (this.emaLagFast > this.thresholds.critical && Date.now() - this.lastCongestionEmit > 5000) {
            this.lastCongestionEmit = Date.now();
            this.emit('congestion', { lag: this.emaLagFast, factor: this.backpressure });
        }
    }

    /**
     * Returns a recommended delay multiplier.
     * Usage: setTimeout(task, 100 * antiLag.getThrottleMultiplier())
     */
    getThrottleMultiplier() {
        if (this.backpressure < 0.1) return 1;
        // Throttling yang lebih agresif (hingga 25x delay)
        return 1 + (this.backpressure * 25); 
    }

    /**
     * Returns a recommended concurrency scale.
     * Usage: const threads = Math.floor(maxThreads * antiLag.getEfficiencyFactor())
     */
    getEfficiencyFactor() {
        // Kekuatan serangan dikurangi drastis jika sistem macet
        return Math.max(0.05, 1 - this.backpressure);
    }

    getStatus() {
        let state = 'HEALTHY';
        if (this.emaLagFast > this.thresholds.panic) state = 'PANIC';
        else if (this.emaLagFast > this.thresholds.critical) state = 'CRITICAL';
        else if (this.emaLagFast > this.thresholds.warning) state = 'WARNING';

        return {
            state,
            lag: this.emaLagFast.toFixed(2),
            trend: this.emaLagSlow.toFixed(2),
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