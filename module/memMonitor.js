const v8 = require('v8');
const EventEmitter = require('events');

class MemoryMonitor extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        this.thresholds = {
            warning: 250 * 1024 * 1024,
            critical: 400 * 1024 * 1024,
            panic: 480 * 1024 * 1024
        };
        this.limit = 512 * 1024 * 1024;
        this.baseline = null;
        this.history = [];
        this.isCleaning = false;
    }

    getDetailedStats() {
        const usage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const heapSpace = v8.getHeapSpaceStatistics();

        return {
            rss: (usage.rss / 1024 / 1024).toFixed(2),
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
            external: (usage.external / 1024 / 1024).toFixed(2),
            arrayBuffers: (usage.arrayBuffers / 1024 / 1024).toFixed(2),
            v8: {
                limit: (heapStats.heap_size_limit / 1024 / 1024).toFixed(0),
                available: (heapStats.total_available_size / 1024 / 1024).toFixed(0),
                malloced: (heapStats.malloced_memory / 1024 / 1024).toFixed(0),
                peak: (heapStats.peak_malloced_memory / 1024 / 1024).toFixed(0)
            },
            spaces: heapSpace.map(s => ({
                name: s.space_name,
                used: (s.space_used_size / 1024 / 1024).toFixed(2),
                size: (s.space_size / 1024 / 1024).toFixed(2)
            })),
            percent: ((usage.rss / this.limit) * 100).toFixed(2)
        };
    }

    detectLeak(currentRss) {
        if (!this.baseline) this.baseline = currentRss;
        this.history.push(currentRss);
        if (this.history.length > 100) this.history.shift();

        if (this.history.length >= 50) {
            const firstHalf = this.history.slice(0, 25);
            const secondHalf = this.history.slice(-25);
            const avg1 = firstHalf.reduce((a, b) => a + b, 0) / 25;
            const avg2 = secondHalf.reduce((a, b) => a + b, 0) / 25;
            
            if (avg2 > avg1 * 1.25) return true; // Baseline naik 25%
        }
        return false;
    }

    start() {
        setInterval(() => {
            const stats = this.getDetailedStats();
            const rssNum = parseFloat(stats.rss) * 1024 * 1024;

            if (this.io) {
                this.io.emit('memory_stats', {
                    ...stats,
                    hasLeak: this.detectLeak(rssNum),
                    status: this.getStatus(rssNum)
                });
            }

            this.checkEmergency(rssNum);
        }, 1000);
    }

    getStatus(rss) {
        if (rss > this.thresholds.panic) return 'PANIC';
        if (rss > this.thresholds.critical) return 'CRITICAL';
        if (rss > this.thresholds.warning) return 'WARNING';
        return 'NORMAL';
    }

    async checkEmergency(rss) {
        if (rss > this.thresholds.critical && !this.isCleaning) {
            this.isCleaning = true;
            await this.performCleanup(rss > this.thresholds.panic ? "DEEP" : "STANDARD");
            this.isCleaning = false;
        }
    }

    async performCleanup(mode) {
        if (this.io) {
            this.io.emit('log', { 
                msg: `[MEM-MONITOR] Initiating ${mode} memory release...`, 
                type: 'error' 
            });
            this.io.emit('clear_internal_caches');
        }

        if (global.gc) {
            global.gc();
        }

        return new Promise(resolve => setTimeout(resolve, 500));
    }

    resetBaseline() {
        const usage = process.memoryUsage();
        this.baseline = usage.rss;
        this.history = [];
    }
}

module.exports = MemoryMonitor;