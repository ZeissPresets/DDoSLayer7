/**
 * module/memoryManager.js
 * Memonitor penggunaan memory dan melakukan cleanup otomatis jika melewati threshold 400MB.
 */

const v8 = require('v8');
const os = require('os');

class MemoryManager {
    constructor(io, thresholdMb = 400) {
        this.io = io;
        this.thresholdOpt = 200 * 1024 * 1024;
        this.thresholdMax = 400 * 1024 * 1024;
        this.maxMemory = 512 * 1024 * 1024; // Limit standar Render.com
        this.checkInterval = 1000;
    }

    start() {
        const run = () => {
            const usage = process.memoryUsage();
            const rss = usage.rss; // Resident Set Size: Memori aktual yang digunakan container
            const heapUsed = usage.heapUsed;
            const heapStats = v8.getHeapStatistics();
            
            // Sinkronisasi data realtime ke Dashboard UI dengan fitur pendukung statistik V8
            if (this.io) {
                this.io.emit('memory_stats', {
                    used: (rss / 1024 / 1024).toFixed(2),
                    heap: (heapUsed / 1024 / 1024).toFixed(2),
                    total: 512,
                    percent: ((rss / this.maxMemory) * 100).toFixed(2),
                    v8_available: (heapStats.total_available_size / 1024 / 1024).toFixed(0),
                    sys_free: (os.freemem() / 1024 / 1024).toFixed(0)
                });
            }

            // Logika Threshold 200MB (Optimasi Instan)
            if (rss > this.thresholdOpt) {
                this.autoCleanup(rss, "Optimization Mode");
            }

            // Logika Threshold 400MB (Bekerja 2x Lipat lebih agresif)
            if (rss > this.thresholdMax) {
                this.checkInterval = 500;
                this.autoCleanup(rss, "Double Aggressive Mode");
            } else {
                this.checkInterval = 1000;
            }

            setTimeout(run, this.checkInterval);
        };
        run();
    }

    autoCleanup(rss, mode = "") {
        const msg = `[MEMORY] ${mode} active (${(rss / 1024 / 1024).toFixed(2)}MB). Clearing caches...`;
        if (this.io) this.io.emit('log', { msg, type: 'error' });
        
        // Force GC jika Node dijalankan dengan flag --expose-gc
        if (global.gc) {
            global.gc();
        }

        // Mengirim sinyal ke modul lain (via Socket.io) untuk membersihkan cache internal mereka
        if (this.io) this.io.emit('clear_internal_caches');
    }
}

module.exports = MemoryManager;