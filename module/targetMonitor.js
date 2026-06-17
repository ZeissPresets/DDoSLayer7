const _ = require('lodash');
const { performance } = require('perf_hooks');

class TargetMonitor {
    constructor(io) {
        this.io = io;
        this.targets = new Map();
        this.alpha = 0.3; // Weight untuk EMA (Exponential Moving Average)
        this.maxHistory = 100;
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
            startTime: performance.now(),
            p90: 0,
            lastLatency: 0
        });
    }

    recordMovement(url, data) {
        this.initTarget(url);
        const t = this.targets.get(url);
        
        // Pastikan input adalah angka untuk akurasi kalkulasi
        const latency = parseFloat(data.latency) || 0;
        const status = parseInt(data.status) || 0;

        // 1. Kalkulasi EMA (Exponential Moving Average) - Menghaluskan noise latensi
        if (t.ema === 0) {
            t.ema = latency;
        } else {
            t.ema = (this.alpha * latency) + (1 - this.alpha) * t.ema;
        }

        // 2. Kalkulasi RFC 3550 Jitter - Mengukur stabilitas koneksi
        // J = J + (|D(i-1, i)| - J)/16
        const diff = Math.abs(latency - t.lastLatency);
        t.jitter = t.jitter + (diff - t.jitter) / 16;
        t.lastLatency = latency;

        // 3. Tracking Status dan Ketersediaan
        if (status >= 200 && status < 400) t.successCount++;
        else t.failCount++;
        t.lastStatus = status;

        // 4. Kalkulasi Percentile p90
        t.history.push(latency);
        if (t.history.length > this.maxHistory) t.history.shift();
        
        const sortedHistory = [...t.history].sort((a, b) => a - b);
        const p90Index = Math.floor(sortedHistory.length * 0.9);
        t.p90 = sortedHistory[p90Index] || latency;

        // 5. Analisis Tren dan Skor Kesehatan
        const uptime = ((t.successCount / (t.successCount + t.failCount)) * 100).toFixed(2);
        const health = this.calculateHealthScore(t);
        const trend = this.analyzeTrend(t);

        const movement = {
            url,
            status: status,
            latency: latency.toFixed(2),
            ema: t.ema.toFixed(2),
            p90: t.p90.toFixed(2),
            jitter: t.jitter.toFixed(2),
            uptime: uptime,
            trend: trend,
            health: health,
            timestamp: new Date().toLocaleTimeString()
        };

        if (this.io) this.io.emit('target_movement', movement);
    }

    analyzeTrend(t) {
        if (t.history.length < 10) return 'INITIALIZING';
        
        const recent = _.takeRight(t.history, 5);
        const avg = _.mean(recent);
        
        if (t.lastStatus >= 500 || t.lastStatus === 0) return 'CRITICAL_FAIL';
        if (avg > t.ema * 1.5) return 'LATENCY_SPIKE';
        if (avg < t.ema * 0.8) return 'OPTIMIZING';
        
        return 'STABLE';
    }

    calculateHealthScore(t) {
        let score = 100;

        // Penalti Status Code
        if (t.lastStatus >= 500 || t.lastStatus === 0) score -= 60;
        else if (t.lastStatus >= 400) score -= 25;

        // Penalti Performa Latensi
        if (t.ema > 2000) score -= 30;
        else if (t.ema > 1000) score -= 15;
        
        // Penalti Ketidakstabilan (Jitter)
        if (t.jitter > 200) score -= 10;

        const uptimeRatio = (t.successCount / (t.successCount + t.failCount));
        score *= uptimeRatio;

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