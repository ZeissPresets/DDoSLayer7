const _ = require('lodash');

class TargetMonitor {
    constructor(io) {
        this.io = io;
        this.targets = new Map();
        this.alpha = 0.3; // Untuk EMA calculation
    }

    initTarget(url) {
        if (this.targets.has(url)) return;
        this.targets.set(url, {
            history: [],
            ema: 0,
            jitter: 0,
            successCount: 0,
            failCount: 0,
            lastStatus: null,
            startTime: Date.now()
        });
    }

    recordMovement(url, data) {
        this.initTarget(url);
        const t = this.targets.get(url);
        const latency = parseFloat(data.latency);

        // EMA (Exponential Moving Average) Calculation
        if (t.ema === 0) t.ema = latency;
        else t.ema = (this.alpha * latency) + (1 - this.alpha) * t.ema;

        // Jitter Calculation
        const lastLatency = t.history.length > 0 ? t.history[t.history.length - 1] : latency;
        t.jitter = Math.abs(latency - lastLatency);

        // Status Tracking
        if (data.status >= 200 && data.status < 400) t.successCount++;
        else t.failCount++;
        t.lastStatus = data.status;

        t.history.push(latency);
        if (t.history.length > 50) t.history.shift();

        const movement = {
            url,
            status: data.status,
            latency: latency.toFixed(2),
            ema: t.ema.toFixed(2),
            jitter: t.jitter.toFixed(2),
            uptime: ((t.successCount / (t.successCount + t.failCount)) * 100).toFixed(2),
            trend: this.analyzeTrend(t),
            health: this.calculateHealthScore(t),
            timestamp: new Date().toLocaleTimeString()
        };

        if (this.io) this.io.emit('target_movement', movement);
    }

    analyzeTrend(t) {
        if (t.history.length < 5) return 'STABILIZING';
        const recent = _.takeRight(t.history, 5);
        const avg = _.mean(recent);
        
        if (t.lastStatus >= 500) return 'CRASHING';
        if (avg > t.ema * 1.5) return 'LAGGING';
        if (avg < t.ema * 0.8) return 'RECOVERING';
        return 'STABLE';
    }

    calculateHealthScore(t) {
        let score = 100;
        if (t.lastStatus >= 500) score -= 50;
        else if (t.lastStatus >= 400) score -= 20;

        if (t.ema > 1000) score -= 30;
        else if (t.ema > 500) score -= 15;

        if (t.jitter > 200) score -= 10;
        
        const uptime = (t.successCount / (t.successCount + t.failCount));
        score *= uptime;

        return Math.max(0, Math.min(100, score)).toFixed(0);
    }

    getSummary(url) {
        const t = this.targets.get(url);
        if (!t) return null;
        return {
            totalRequests: t.successCount + t.failCount,
            avgLatency: _.mean(t.history).toFixed(2),
            peakLatency: _.max(t.history).toFixed(2),
            reliability: ((t.successCount / (t.successCount + t.failCount)) * 100).toFixed(2)
        };
    }

    reset(url) {
        if (url) this.targets.delete(url);
        else this.targets.clear();
    }
}

module.exports = TargetMonitor;