const si = require('systeminformation');
const os = require('os');
const EventEmitter = require('events');
const antiLag = require('./antiLag');

class SystemMonitor extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        this.history = [];
        this.maxHistory = 60;
        this.interval = null;
    }

    async getTelemetry() {
        try {
            const [load, mem, network, cpu, temp, fs] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.networkStats(),
                si.cpu(),
                si.cpuTemperature(),
                si.fsStats()
            ]);

            const telemetry = {
                cpu: {
                    load: load.currentLoad.toFixed(2),
                    user: load.currentLoadUser.toFixed(2),
                    system: load.currentLoadSystem.toFixed(2),
                    cores: load.cpus.map(c => c.load.toFixed(1)),
                    model: `${cpu.manufacturer} ${cpu.brand}`,
                    temp: temp.main || 'N/A'
                },
                memory: {
                    total: (mem.total / 1024 / 1024 / 1024).toFixed(2),
                    available: (mem.available / 1024 / 1024 / 1024).toFixed(2),
                    active: (mem.active / 1024 / 1024).toFixed(2),
                    swaptotal: (mem.swaptotal / 1024 / 1024).toFixed(2)
                },
                network: {
                    interface: network[0]?.iface || 'eth0',
                    rx: (network[0]?.rx_sec / 1024 / 1024).toFixed(2), // MB/s
                    tx: (network[0]?.tx_sec / 1024 / 1024).toFixed(2),
                    total_rx: (network[0]?.rx_bytes / 1024 / 1024).toFixed(0),
                    total_tx: (network[0]?.tx_bytes / 1024 / 1024).toFixed(0)
                },
                os: {
                    platform: os.platform(),
                    release: os.release(),
                    uptime: this.formatUptime(os.uptime()),
                    loadAvg: os.loadavg().map(l => l.toFixed(2))
                },
                disk: {
                    read: (fs.rx_sec / 1024).toFixed(2),
                    write: (fs.wx_sec / 1024).toFixed(2)
                },
                timestamp: Date.now(),
                antiLag: antiLag.getStatus()
            };

            this.updateHistory(telemetry);
            return telemetry;
        } catch (error) {
            return { error: error.message };
        }
    }

    updateHistory(data) {
        this.history.push({ t: data.timestamp, l: data.cpu.load });
        if (this.history.length > this.maxHistory) this.history.shift();
    }

    formatUptime(seconds) {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        const s = Math.floor(seconds % 60);
        return `${d}d ${h}h ${m}m ${s}s`;
    }

    calculateTrend() {
        if (this.history.length < 2) return 'STABLE';
        const recent = this.history.slice(-5);
        const avg = recent.reduce((a, b) => a + parseFloat(b.l), 0) / recent.length;
        const last = parseFloat(recent[recent.length - 1].l);
        if (last > avg + 10) return 'SPIKING';
        if (last < avg - 10) return 'DROPPING';
        return 'STABLE';
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(async () => {
            const data = await this.getTelemetry();
            data.trend = this.calculateTrend();
            
            if (this.io) {
                this.io.emit('system_load', data);
                
                if (parseFloat(data.cpu.load) > 90) {
                    this.io.emit('log', { 
                        msg: `[SYS-MONITOR] Critical CPU Load: ${data.cpu.load}%`, 
                        type: 'error' 
                    });
                }
            }
            this.emit('telemetry', data);
        }, 1000);
    }

    stop() {
        clearInterval(this.interval);
        this.interval = null;
    }
}

module.exports = SystemMonitor;