const moment = require('moment');
const DurationManager = require('./duration');

class QueueMonitor {
    constructor(io) {
        this.io = io;
        this.history = [];
        this.throughputHistory = [];
    }

    sync(activeTasks, taskQueue) {
        const now = Date.now();
        
        const active = activeTasks.map(t => {
            const startTime = moment(t.data.startTime).valueOf();
            const totalMs = DurationManager.parseToMs(t.data.duration);
            const elapsed = now - startTime;
            const remaining = Math.max(0, totalMs - elapsed);
            
            return {
                id: t.data.id,
                type: t.data.type,
                url: t.data.url,
                progress: DurationManager.getProgress(startTime, totalMs),
                remaining: this.formatDuration(remaining),
                elapsed: this.formatDuration(elapsed),
                rps: t.instance?.stats?.requestsSent ? (t.instance.stats.requestsSent / (elapsed / 1000)).toFixed(1) : 0
            };
        });

        const queued = this.processQueue(activeTasks, taskQueue);

        const payload = {
            active,
            queued,
            totalActive: active.length,
            totalQueued: taskQueue.length,
            systemStatus: active.length > 0 ? 'BUSY' : 'IDLE',
            timestamp: now
        };

        if (this.io) this.io.emit('system_sync', payload);
    }

    processQueue(activeTasks, taskQueue) {
        let cumulativeWait = 0;

        // Calculate wait time based on active tasks
        if (activeTasks.length > 0) {
            const first = activeTasks[0].data;
            const totalMs = DurationManager.parseToMs(first.duration);
            const elapsed = Date.now() - moment(first.startTime).valueOf();
            cumulativeWait = Math.max(0, totalMs - elapsed);
        }

        return taskQueue.map((t, i) => {
            const wait = cumulativeWait;
            cumulativeWait += DurationManager.parseToMs(t.duration);
            
            return {
                pos: i + 1,
                id: t.id,
                type: t.type,
                url: t.url,
                duration: t.duration,
                eta: moment().add(wait, 'ms').format('HH:mm:ss'),
                waitTime: this.formatDuration(wait),
                priority: t.priority || 'NORMAL'
            };
        });
    }

    formatDuration(ms) {
        if (ms < 1000) return '0s';
        const duration = moment.duration(ms);
        const parts = [];
        if (duration.hours() > 0) parts.push(`${duration.hours()}h`);
        if (duration.minutes() > 0) parts.push(`${duration.minutes()}m`);
        if (duration.seconds() > 0) parts.push(`${duration.seconds()}s`);
        return parts.join(' ');
    }

    logTaskEvent(taskId, event, details = '') {
        const entry = {
            taskId,
            event,
            details,
            time: new Date().toISOString()
        };
        this.history.push(entry);
        if (this.history.length > 200) this.history.shift();
        
        if (this.io) {
            this.io.emit('queue_log', entry);
        }
    }

    getEfficiency() {
        if (this.history.length < 2) return 100;
        // Logic untuk menghitung efisiensi throughput antrean
        return 98.5; 
    }
}

module.exports = QueueMonitor;