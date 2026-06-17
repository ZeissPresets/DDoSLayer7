const v8 = require('v8');
const os = require('os');
const { performance } = require('perf_hooks');
const si = require('systeminformation');
const antiLag = require('./antiLag'); // Import antiLag module

process.env.UV_THREADPOOL_SIZE = os.cpus().length * 8;
process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;

class SystemOptimizer {
    constructor() {
        this.maxHeap = 420 * 1024 * 1024;
        this.cpuLimit = 90;
        this.modes = {
            eco: 65,     // Mode hemat energi & dingin
            normal: 70,  // Standar operasional
            extreme: 82  // Performa maksimal (High Temp)
        };
        this.perfMode = 'normal';
        this.tempLimit = this.modes[this.perfMode];
        this.isThrottling = false;
        this.isTempThrottling = false; // Flag khusus throttling suhu
        this.highTempCounter = 0; // Menghitung berapa lama suhu tinggi
        this.highTempThreshold = 10; 
        this.highRamCounter = 0; // Menghitung berapa lama RAM tinggi
        this.highRamThreshold = 10; // Threshold 10 detik penggunaan RAM tinggi
        this.lowRamCounter = 0; // Menghitung berapa lama RAM rendah
        this.lowRamThreshold = 60; // Threshold 60 detik (1 menit) untuk kembali ke normal
        this.lastGC = 0; // Timestamp terakhir GC dilakukan
        this.attackManager = null; // Akan diinisialisasi setelah AttackManager siap
        this.isRestarting = false;
        this.isCritical = false;
        this.init();
    }

    init() {
        process.on('uncaughtException', (err) => {
            this.logInternal(`SHIELD: Blocked process crash from Exception: ${err.message}`, 'error');
        });

        process.on('unhandledRejection', (reason) => {
            this.logInternal(`SHIELD: Prevented termination from Rejection: ${reason}`, 'warn');
        });
    }

    setAttackManager(manager) {
        this.attackManager = manager;

        this.startIntensiveMonitoring();
    }

    setPerformanceMode(mode) {
        if (this.modes[mode]) {
            this.perfMode = mode;
            this.tempLimit = this.modes[mode];
            this.logInternal(`PERFORMANCE: Profil diubah ke ${mode.toUpperCase()} (Batas Suhu: ${this.tempLimit}°C)`, 'success');
            return true;
        }
        return false;
    }

    startIntensiveMonitoring() {
        let lastLoopCheck = performance.now();

        setInterval(async () => {
            const now = performance.now();
            const lag = now - lastLoopCheck - 1000;
            lastLoopCheck = now;

            const cpuLoad = (os.loadavg()[0] * 100) / os.cpus().length;
            const heapUsage = v8.getHeapStatistics().used_heap_size;
            const cpuTemp = await si.cpuTemperature();
            const currentTemp = (cpuTemp.main && cpuTemp.main > 0) ? cpuTemp.main : (cpuTemp.max || 0);
            const antiLagStatus = antiLag.getStatus();

            // Deteksi Overheat
            this.isTempThrottling = currentTemp >= this.tempLimit;

            // Deteksi High RAM (Force Eco mode jika > 200MB terus-menerus)
            if (heapUsage > 200 * 1024 * 1024) {
                this.highRamCounter++;
                if (this.highRamCounter >= this.highRamThreshold && this.perfMode !== 'eco') {
                    this.setPerformanceMode('eco');
                    this.logInternal(`PERFORMANCE: Forced to ECO mode due to persistent high RAM usage (>200MB)`, 'warn');
                }
            } else {
                this.highRamCounter = 0;
            }

            // Deteksi Low RAM (Revert ke Normal jika < 150MB selama 1 menit)
            if (heapUsage < 150 * 1024 * 1024 && this.perfMode === 'eco') {
                this.lowRamCounter++;
                if (this.lowRamCounter >= this.lowRamThreshold) {
                    this.setPerformanceMode('normal');
                    this.logInternal(`PERFORMANCE: Restored to NORMAL mode due to stabilized RAM usage (<150MB)`, 'success');
                    this.lowRamCounter = 0;
                }
            } else {
                this.lowRamCounter = 0;
            }

            // Logika Emergency Brake
            if (lag > 800 || cpuLoad > 95 || heapUsage > this.maxHeap || this.isTempThrottling) {
                this.isCritical = true;
                this.isThrottling = true;
                
                if (currentTemp > this.tempLimit) { 
                    this.highTempCounter++;
                } else {
                    this.highTempCounter = 0;
                }

                let reason = [];
                if (lag > 500) reason.push(`Lag: ${lag.toFixed(0)}ms`);
                if (cpuLoad > this.cpuLimit) reason.push(`CPU: ${cpuLoad.toFixed(0)}%`);
                if (currentTemp > this.tempLimit) reason.push(`Temp: ${currentTemp}°C`);
                if (this.isTempThrottling) reason.push(`OVERHEAT_BRAKE`);

                if (lag > 500 || (this.isTempThrottling && this.highTempCounter % 5 === 0)) {
                    const msg = `GUARDIAN: High System Pressure [${reason.join(' | ')}] - Throttling Active`;
                    this.logInternal(msg, 'warn');
                    if (this.attackManager) this.attackManager.addInternalLog(`[OPTIMIZER] ${msg}`, 'warn');
                }
                this.emergencyCleanup(lag, cpuLoad, currentTemp, heapUsage);
            } else {
                // Reset status jika kondisi membaik
                this.isCritical = false;
                this.isThrottling = false;
            }

            // Emit detailed system load to dashboard
            if (this.attackManager && this.attackManager.io) {
                this.attackManager.io.emit('system_load', {
                    cpuLoad: cpuLoad.toFixed(2), eventLoopLag: lag.toFixed(0), cpuTemp: currentTemp,
                    isCritical: this.isCritical, isThrottling: this.isThrottling, isRestarting: this.isRestarting, perfMode: this.perfMode,
                    antiLag: antiLagStatus, isTempThrottling: this.isTempThrottling,
                    highTempCounter: this.highTempCounter, adaptiveConcurrency: this.getAdaptiveConcurrency(16) // Emit current adaptive concurrency
                });
            }

            // Proactive GC
            if (heapUsage > (this.maxHeap * 0.85) && global.gc && Date.now() - this.lastGC > 10000) {
                this.lastGC = Date.now();
                global.gc();
            }
        }, 1000);
    }

    emergencyCleanup(lag, cpu, temp = 0, heap = 0) {
        if (this.isRestarting) return; // Hindari restart berulang

        if (global.gc && heap > this.maxHeap && Date.now() - this.lastGC > 15000) { // Hanya GC jika heap tinggi dan belum lama GC
            this.lastGC = Date.now();
            global.gc();
        }
        if (this.attackManager && this.attackManager.io) {
            this.attackManager.io.emit('clear_internal_caches'); // Sinyal ke Bypasser untuk mengosongkan cache sesi
        }

        // Logika Auto-Restart Engine DDoSL7
        // Jika Event Loop sangat macet (lag > 1000ms) atau CPU sangat tinggi (>95%)
        const alStatus = antiLag.getStatus();
        if (alStatus.state === 'PANIC' || parseFloat(alStatus.backpressure) > 90 || lag > 2500 || cpu > 98) {
            this.isRestarting = true;
            const panicMsg = `!!! SYSTEM PANIC !!! Backpressure: ${alStatus.backpressure}. Performing Load Shedding...`;
            this.logInternal(panicMsg, 'error');
            if (this.attackManager) {
                this.attackManager.addInternalLog(`[CRITICAL] ${panicMsg}`, 'error');
                this.attackManager.clearQueue(); // Membersihkan antrean secara otomatis saat panic
            }

            this.attackManager.getFullState().then(state => {
                const activeAttack = state.active.find(t => t.type === 'attack');
                if (activeAttack) {
                    const url = activeAttack.url;
                    const duration = activeAttack.duration;
                    
                    this.attackManager.stop(url).then(() => {
                        // Beri sedikit waktu untuk cleanup
                        setTimeout(() => {
                            const DDoSL7 = require('../attack/DDoSL7').DDoSL7;
                            const newAttacker = new DDoSL7(url, duration, this.attackManager.io);
                            this.attackManager.register('attack', url, newAttacker, duration);
                            this.logInternal(`GUARDIAN: DDoSL7 Engine for ${url} successfully re-registered and restarted.`, 'success');
                            this.isRestarting = false;
                        }, 5000); // Tunggu 5 detik sebelum restart
                    });
                } else {
                    this.isRestarting = false;
                }
            });
        }

        // Jika suhu melewati batas kritis absolut (Emergency Stop)
        if (temp > this.tempLimit || this.highTempCounter >= this.highTempThreshold) {
            this.killHungTasks(true); // True untuk penurunan drastis
        }
    }

    killHungTasks() {
        this.attackManager.getFullState().then(state => {
            if (state.active.length > 0) {
                const target = state.active[0].url;
                this.attackManager.stop(target);
                this.logInternal(`GUARDIAN: Emergency STOP performed on ${target} to save server.`, 'error');
            }
        });
    }

    logInternal(msg, type) {
        try {
            if (this.attackManager && this.attackManager.addInternalLog) {
                this.attackManager.addInternalLog(`[OPTIMIZER] ${msg}`, type);
            }
        } catch (e) {
            console.log(`[OPTIMIZER-FALLBACK] ${msg}`);
        }
    }

    getAdaptiveConcurrency(base) {
        const load = os.loadavg()[0];
        
        // Jika Overheat, turunkan kecepatan secara software ke titik terendah (1-2 threads)
        if (this.isTempThrottling) {
            return 1; 
        }
        if (this.isCritical) {
            return Math.max(1, Math.floor(base * 0.1));
        }
        if (this.isThrottling || load > 12) {
            return Math.max(2, Math.floor(base * 0.3));
        }
        if (load > 8) {
            return Math.max(4, Math.floor(base * 0.5));
        }
        return Math.min(base, 16); // Hard cap at 16 threads for stability
    }
}

const optimizer = new SystemOptimizer();
module.exports = optimizer;