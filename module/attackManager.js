const path = require('path');
const moment = require('moment');
const _ = require('lodash');
const si = require('systeminformation');
const NodeCache = require('node-cache');
const events = require('events');

const stateCache = new NodeCache({ stdTTL: 3600 }); // Cache untuk state terakhir per task
const activeTasks = new Map(); // Map untuk menyimpan instance task yang sedang berjalan
const taskQueue = []; // Antrian untuk task yang menunggu

class AttackManager extends events.EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.systemMonitorInterval = null;
        this.taskSchedulerInterval = null;
        this.isInitialized = false;
    }

    async init(io) {
        if (this.isInitialized) return;
        this.io = io;

        this.startSystemMonitor();
        this.startTaskScheduler();
        this.setupSocketListeners();
        this.isInitialized = true;
    }

    setupSocketListeners() {
        if (this.io) {
            this.io.on('connection', (socket) => {
                this.syncClient(socket);
                socket.on('request_full_state', () => this.syncClient(socket));
            });

            // Listen untuk sinyal pembersihan cache dari MemoryManager
            this.io.on('clear_internal_caches', () => {
                stateCache.flushAll();
                this.emit('log', { msg: '[MANAGER] Cache internal dibersihkan oleh MemoryManager.', type: 'warn' });
            });
        }
    }

    startSystemMonitor() {
        this.systemMonitorInterval = setInterval(async () => {
            const sys = await this.getSystemInfo();
            this.io.emit('system_load', sys);
            this.broadcastState(); // Broadcast state secara berkala
        }, 5000); // Setiap 5 detik
    }

    startTaskScheduler() {
        this.taskSchedulerInterval = setInterval(() => {
            if (taskQueue.length > 0 && activeTasks.size < 1) { // Hanya 1 task aktif pada satu waktu
                const nextTask = taskQueue.shift();
                this.executeTask(nextTask);
            }
        }, 1000); // Cek antrian setiap 1 detik
    }

    async executeTask(taskDetails) {
        const { type, url, duration, instance } = taskDetails;
        const taskId = `${type}_${Buffer.from(url).toString('base64').substring(0, 8)}`;
        const taskData = {
            id: taskId,
            type,
            url,
            duration,
            startTime: moment().toISOString(),
            status: 'running',
            stats: {}
        };

        activeTasks.set(url, { instance, data: taskData });
        instance.start().then(() => {
            this.emit('log', { msg: `[MANAGER] Task ${taskId} dimulai: ${url}`, type: 'info' });
            this.broadcastState();
        }).catch(async (err) => {
            this.emit('log', { msg: `[MANAGER] Gagal memulai task ${taskId}: ${err.message}`, type: 'error' });
            await this.complete(url, 'failed');
        });
    }

    register(type, url, instance, duration) {
        if (activeTasks.has(url)) {
            this.emit('log', { msg: `[MANAGER] Task untuk ${url} sudah berjalan atau dalam antrian.`, type: 'warn' });
            return;
        }

        const taskDetails = { type, url, duration, instance };
        if (activeTasks.size >= 1) { // Jika sudah ada task berjalan, masukkan ke antrian
            taskQueue.push(taskDetails);
            this.emit('log', { msg: `[MANAGER] Task untuk ${url} ditambahkan ke antrian.`, type: 'info' });
        } else {
            this.executeTask(taskDetails);
        }
        this.broadcastState();
    }

    async updateStats(url, stats) {
        const task = activeTasks.get(url);
        if (task) {
            task.data.stats = _.merge(task.data.stats, stats);
            stateCache.set(`last_stats_${url}`, task.data);
            this.broadcastState(); // Update state secara real-time
        }
    }

    async stop(url) {
        const task = activeTasks.get(url);
        if (task && task.instance) {
            if (typeof task.instance.stop === 'function') task.instance.stop();
            await this.complete(url, 'force_stopped');
            return true;
        }
        // Hapus dari antrian jika belum dimulai
        const queueIndex = taskQueue.findIndex(t => t.url === url);
        if (queueIndex !== -1) {
            taskQueue.splice(queueIndex, 1);
            this.emit('log', { msg: `[MANAGER] Task untuk ${url} dihapus dari antrian.`, type: 'info' });
            this.broadcastState();
            return true;
        }
        return false;
    }

    async complete(url, reason = 'finished') {
        const task = activeTasks.get(url);
        if (task) {
            const finalData = {
                ...task.data,
                status: reason,
                endTime: moment().toISOString()
            };
            
            activeTasks.delete(url);
            stateCache.del(`last_stats_${url}`);
            this.emit('log', { msg: `[MANAGER] Task ${finalData.id} selesai dengan status: ${reason}.`, type: 'info' });
            this.broadcastState();
        }
    }

    async getSystemInfo() {
        const mem = await si.mem();
        const cpu = await si.currentLoad();
        return {
            ramUsed: (mem.active / 1024 / 1024).toFixed(2),
            ramTotal: (mem.total / 1024 / 1024).toFixed(2),
            cpuLoad: cpu.currentLoad.toFixed(2)
        };
    }

    async getFullState() {
        const current = Array.from(activeTasks.values()).map(t => t.data);
        const sysInfo = await this.getSystemInfo();
        
        return {
            active: current,
            queued: taskQueue.map(t => ({ id: t.id, type: t.type, url: t.url })),
            serverLoad: sysInfo
        };
    }

    broadcastState() {
        if (!this.io) return;
        this.getFullState().then(state => {
            this.io.emit('system_sync', state);
        }).catch(e => {
            this.emit('log', { msg: `[MANAGER] Gagal broadcast state: ${e.message}`, type: 'error' });
        });
    }

    syncClient(socket) {
        this.getFullState().then(state => {
            socket.emit('system_sync', state);
        }).catch(e => {
            this.emit('log', { msg: `[MANAGER] Gagal sync client: ${e.message}`, type: 'error' });
        });
    }

    remove(url) {
        // Ini dipanggil oleh instance task itu sendiri saat selesai
        // Jadi cukup panggil complete
        this.complete(url);
    }
}

const manager = new AttackManager();
module.exports = manager;

class AttackManager {
    static register(url, instance) {
        activeAttacks.set(url, instance);
    }

    static stop(url) {
        const instance = activeAttacks.get(url);
        if (instance) {
            instance.stop();
            activeAttacks.delete(url);
            return true;
        }
        return false;
    }

    static remove(url) {
        activeAttacks.delete(url);
    }
}

module.exports = AttackManager;