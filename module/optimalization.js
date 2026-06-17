const v8 = require('v8');
const os = require('os');
const { performance } = require('perf_hooks');
const si = require('systeminformation');

process.env.UV_THREADPOOL_SIZE = os.cpus().length * 8;
process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;

class SystemOptimizer {
    constructor() {
        this.maxHeap = 420 * 1024 * 1024;
        this.cpuLimit = 90;
        this.tempLimit = 75; // Batas suhu aman dalam Celcius
        this.isThrottling = false;
        this.highTempCounter = 0; // Menghitung berapa lama suhu tinggi
        this.highTempThreshold = 5; // Jika suhu tinggi selama 5 detik berturut-turut
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

        this.startIntensiveMonitoring();
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
            const currentTemp = cpuTemp.main > 0 ? cpuTemp.main : 0; // Handle cases where temp sensor is unavailable

            // Logika Emergency Brake
            if (lag > 500 || cpuLoad > this.cpuLimit || heapUsage > this.maxHeap || currentTemp > this.tempLimit) {
                this.isCritical = true;
                this.isThrottling = true;
                
                if (currentTemp > 80) { // Jika suhu di atas 80, mulai hitung
                    this.highTempCounter++;
                } else {
                    this.highTempCounter = 0;
                }

                let reason = [];
                if (lag > 500) reason.push(`Lag: ${lag.toFixed(0)}ms`);
                if (cpuLoad > this.cpuLimit) reason.push(`CPU: ${cpuLoad.toFixed(0)}%`);
                if (currentTemp > this.tempLimit) reason.push(`Temp: ${currentTemp}°C`);

                this.logInternal(`GUARDIAN: Emergency intervention [${reason.join(' | ')}]`, 'error');
                this.emergencyCleanup(lag, cpuLoad, cpuTemp.main);
            } else {
                this.isCritical = false;
                this.isThrottling = false;
            }

            // Proactive GC
            if (heapUsage > (this.maxHeap * 0.8) && global.gc) {
                global.gc();
            }
        }, 1000);
    }

    emergencyCleanup(lag, cpu, temp = 0) {
        if (this.isRestarting) return; // Hindari restart berulang

        if (global.gc) global.gc();

        // Sinyal ke Bypasser untuk mengosongkan cache sesi
        const AttackManager = require('./attackManager');
        if (AttackManager && AttackManager.io) {
            AttackManager.io.emit('clear_internal_caches');
        }

        // Logika Auto-Restart Engine DDoSL7
        // Jika Event Loop sangat macet (lag > 1000ms) atau CPU sangat tinggi (>95%)
        if (lag > 1000 || cpu > 95 || temp > 85 || this.highTempCounter >= this.highTempThreshold) {
            this.isRestarting = true;
            this.logInternal(`GUARDIAN: Initiating DDoSL7 Engine Auto-Restart due to severe congestion.`, 'error');
            
            AttackManager.getFullState().then(state => {
                const activeAttack = state.active.find(t => t.type === 'attack');
                if (activeAttack) {
                    const url = activeAttack.url;
                    const duration = activeAttack.duration;
                    
                    AttackManager.stop(url).then(() => {
                        // Beri sedikit waktu untuk cleanup
                        setTimeout(() => {
                            const DDoSL7 = require('../attack/DDoSL7').DDoSL7;
                            const newAttacker = new DDoSL7(url, duration, AttackManager.io);
                            AttackManager.register('attack', url, newAttacker, duration);
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
        const AttackManager = require('./attackManager');
        AttackManager.getFullState().then(state => {
            if (state.active.length > 0) {
                const target = state.active[0].url;
                AttackManager.stop(target);
                this.logInternal(`GUARDIAN: Emergency STOP performed on ${target} to save server.`, 'error');
            }
        });
    }

    logInternal(msg, type) {
        try {
            const AttackManager = require('./attackManager');
            if (AttackManager && AttackManager.addInternalLog) {
                AttackManager.addInternalLog(`[OPTIMIZER] ${msg}`, type);
            }
        } catch (e) {
            console.log(`[OPTIMIZER-FALLBACK] ${msg}`);
        }
    }

    getAdaptiveConcurrency(base) {
        const load = os.loadavg()[0];
        if (this.isCritical) {
            return Math.max(10, Math.floor(base * 0.2));
        }
        if (this.isThrottling || load > 12) {
            return Math.max(50, Math.floor(base * 0.4));
        }
        if (load > 8) {
            return Math.max(100, Math.floor(base * 0.6));
        }
        return Math.min(base, 1000);
    }
}

const optimizer = new SystemOptimizer();
optimizer.init(); // Pastikan optimizer diinisialisasi
module.exports = optimizer;