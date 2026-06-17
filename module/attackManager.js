const moment = require('moment');
const _ = require('lodash');
const si = require('systeminformation');
const NodeCache = require('node-cache');
const events = require('events');
const DurationManager = require('./duration');

const stateCache = new NodeCache({ stdTTL: 3600 }); // Cache untuk state terakhir per task
const activeTasks = new Map(); // Map untuk menyimpan instance task yang sedang berjalan
const taskQueue = []; // Antrian untuk task yang menunggu
const logBuffer = []; // Buffer untuk menyimpan log terminal latar belakang
const MAX_LOGS = 100;

class AttackManager extends events.EventEmitter {
    static io = null;
    static isInitialized = false;

    static async init(io) {
        if (this.isInitialized) return;
        this.io = io;
        this.startSystemMonitor();
        this.startTaskScheduler();
        this.isInitialized = true;
    }

    static startSystemMonitor() {
        setInterval(async () => {
            const sys = await this.getSystemInfo();
            if (this.io) {
                this.io.emit('system_load', sys);
                this.broadcastState();
            }
        }, 5000);
    }

    static startTaskScheduler() {
        setInterval(() => {
            if (taskQueue.length > 0 && activeTasks.size < 1) {
                this.executeTask(taskQueue.shift());
            }
        }, 1000);
    }

    static async executeTask(taskDetails) {
        const { type, url, duration, instance } = taskDetails;
        const taskData = {
            id: `${type}_${Date.now()}`,
            type, 
            url, 
            duration,
            startTime: moment().toISOString(),
            status: 'running',
            stats: {}
        };
        activeTasks.set(url, { instance, data: taskData });
        this.addInternalLog(`[SYSTEM] Background task started: ${type.toUpperCase()} on ${url}`, 'success');
        instance.start().catch(err => this.complete(url, 'failed'));
    }

    static register(type, url, instance, duration) {
        if (activeTasks.has(url)) return;
        const taskDetails = { type, url, duration, instance };
        if (activeTasks.size >= 1) taskQueue.push(taskDetails);
        else this.executeTask(taskDetails);
        this.broadcastState();
    }

    static addInternalLog(msg, type = 'info') {
        const logEntry = { msg, type, timestamp: new Date().toLocaleTimeString() };
        logBuffer.push(logEntry);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        if (this.io) {
            this.io.emit('log', logEntry);
        }
    }

    static async updateStats(url, stats) {
        const task = activeTasks.get(url);
        if (task) {
            task.data.stats = _.merge(task.data.stats, stats);
            this.broadcastState();
        }
    }

    static async stop(url) {
        const task = activeTasks.get(url);
        if (task && task.instance) {
            task.instance.stop();
            await this.complete(url, 'stopped');
            return true;
        }
        return false;
    }

    static async complete(url, reason = 'finished') {
        const task = activeTasks.get(url);
        if (task) {
            activeTasks.delete(url);
            this.addInternalLog(`[SYSTEM] Task completed: ${url} (${reason})`, 'info');
            this.broadcastState();
        }
    }

    static async getSystemInfo() {
        const mem = await si.mem();
        const cpu = await si.currentLoad();
        return {
            ramUsed: (mem.active / 1024 / 1024).toFixed(2),
            ramTotal: (mem.total / 1024 / 1024).toFixed(2),
            cpuLoad: cpu.currentLoad.toFixed(2)
        };
    }

    static async getFullState() {
        const active = Array.from(activeTasks.values());
        let activeRemainingTime = 0;

        // Hitung sisa waktu tugas yang sedang aktif
        if (active.length > 0) {
            const task = active[0].data;
            const startTimeMs = moment(task.startTime).valueOf();
            const durationMs = DurationManager.parseToMs(task.duration);
            const elapsedMs = Date.now() - startTimeMs;
            activeRemainingTime = Math.max(0, durationMs - elapsedMs);
        }

        let cumulativeWait = activeRemainingTime;
        const queuedWithWait = taskQueue.map((t, i) => {
            const wait = cumulativeWait;
            cumulativeWait += DurationManager.parseToMs(t.duration);
            return { 
                pos: i + 1, 
                url: t.url, 
                type: t.type, 
                duration: t.duration,
                waitTime: Math.ceil(wait / 1000) // Konversi ke detik
            };
        });

        return {
            active: active.map(t => t.data),
            queued: queuedWithWait,
            serverLoad: await this.getSystemInfo(),
            logs: logBuffer
        };
    }

    static broadcastState() {
        if (!this.io) return;
        this.getFullState().then(s => this.io.emit('system_sync', s));
    }

    static syncClient(socket) {
        this.getFullState().then(s => socket.emit('system_sync', s));
    }

    static remove(url) { this.complete(url); }
}

module.exports = AttackManager;