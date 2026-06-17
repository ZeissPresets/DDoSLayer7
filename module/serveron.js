const cluster = require('cluster');
const axios = require('axios');
const UserAgent = require('user-agents');
const { HttpProxyAgent, HttpsProxyAgent } = require('http-proxy-agent');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const { performance } = require('perf_hooks');

const state = { success: 0, failure: 0 };
const userAgent = new UserAgent();
let backoffDelay = 1000; // Initial delay 1 second
let proxyPool = [];
let resolvedIP = null;
let currentProxyIndex = 0;
let proxyStats = new Map(); // Melacak kesehatan proxy: { fails: 0, lastTry: Date, lastLatency: 0, healthScore: 100 }
const MAX_PROXY_FAILS = 3;
const PROXY_COOLDOWN = 60000; // 1 menit cooldown untuk proxy bermasalah

// Internal bypass headers for self-ping
const internalBypassHeaders = (host) => {
    const ua = userAgent.random().toString();
    const isChrome = ua.includes('Chrome');
    const platform = ua.includes('Windows') ? 'Windows' : (ua.includes('iPhone') ? 'iOS' : (ua.includes('Macintosh') ? 'macOS' : 'Linux'));
    
    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua-Mobile': ua.includes('Mobile') ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': `"${platform}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': host + '/',
        'X-Internal-Ping': crypto.randomBytes(16).toString('hex'),
        'X-Forwarded-For': Array.from({length: 4}, () => crypto.randomInt(1, 255)).join('.'),
        'X-Requested-With': 'XMLHttpRequest',
        'Connection': 'keep-alive'
    };

    if (isChrome) {
        headers['Sec-Ch-Ua'] = '"Not_A Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"';
    }

    return headers;
};

// Alternative endpoints to try if /ping fails
const internalEndpoints = ['/ping', '/', '/health', '/status', '/favicon.ico'];
let currentEndpointIndex = 0;

async function init(io) {
    const port = process.env.PORT || 3000;
    const rawHost = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');
    const urlObj = new URL(rawHost);

    if (cluster.isMaster) {
        // Primary Process: Hanya mengelola Worker dan memancarkan data ke Dashboard
        const watchdogWorker = cluster.fork({ IS_WATCHDOG: 'true' });

        watchdogWorker.on('message', (msg) => {
            if (msg.type === 'watchdog_stats') {
                state.success = msg.data.success;
                state.failure = msg.data.failure;
                if (io) io.emit('watchdog_stats', state);
            }
            if (msg.type === 'log' && io) io.emit('log', msg.data);
        });

        cluster.on('exit', (worker) => {
            if (worker.process.env.IS_WATCHDOG === 'true') {
                cluster.fork({ IS_WATCHDOG: 'true' });
            }
        });
        return;
    }

    if (process.env.IS_WATCHDOG !== 'true') return;

    // Pre-resolve DNS to avoid lookups during critical failure
    try {
        const lookup = await dns.lookup(urlObj.hostname);
        resolvedIP = lookup.address;
    } catch (e) {
        resolvedIP = urlObj.hostname;
    }

    // Load proxies from file for internal use
    try {
        const proxiesPath = path.join(process.cwd(), 'proxies.txt');
        if (fs.existsSync(proxiesPath)) {
            proxyPool = fs.readFileSync(proxiesPath, 'utf8')
                          .split(/\r?\n/)
                          .map(p => p.trim())
                          .filter(p => p.length > 0);
        }
    } catch (e) {}

    const watchdog = async () => {
        const total = state.success + state.failure;
        const uptime = total > 0 ? (state.success / total) * 100 : 100;

        // Jitter: Tambahkan delay acak agar tidak terbaca sebagai pattern bot
        const jitter = Math.floor(Math.random() * 5000);

        // Fitur Pemulihan Panik (Uptime < 90%)
        if (uptime < 90 && total > 10) {
            const recoveryBurst = internalEndpoints.slice(0, 3).map(ep => {
                const proxy = this.getBestProxy();
                const method = Math.random() > 0.5 ? 'GET' : 'HEAD';
                return sendPing(rawHost, io, ep, proxy, method);
            });
            
            await Promise.allSettled(recoveryBurst);
            
            // Apply exponential backoff
            backoffDelay = Math.min(backoffDelay * 2, 30000); // Max 30 seconds
            setTimeout(watchdog, backoffDelay + jitter);
            return;
        }

        // Fitur Pemulihan Standar (90% - 95%)
        if (uptime < 95 && total > 10) {
            currentEndpointIndex = (currentEndpointIndex + 1) % internalEndpoints.length;
            const proxy = this.getBestProxy();
            await sendPing(rawHost, io, internalEndpoints[currentEndpointIndex], proxy, 'GET');
            setTimeout(watchdog, 5000 + jitter);
            return;
        }

        // Reset backoff delay if uptime is normal
        backoffDelay = 1000;
        currentEndpointIndex = 0; // Reset to default endpoint

        const proxy = this.getBestProxy();
        await sendPing(rawHost, io, internalEndpoints[currentEndpointIndex], proxy);
        setTimeout(watchdog, 15000 + jitter); // Lebih lambat sedikit untuk stealth
    };

    this.getBestProxy = () => {
        if (proxyPool.length === 0) return null;
        
        let attempts = 0;
        const now = Date.now();

        while (attempts < proxyPool.length) {
            currentProxyIndex = (currentProxyIndex + 1) % proxyPool.length;
            const p = proxyPool[currentProxyIndex];
            const stat = proxyStats.get(p) || { fails: 0, lastTry: 0 };

            // Cek jika proxy tidak sedang dalam cooldown
            if (stat.fails < MAX_PROXY_FAILS || (now - stat.lastTry) > PROXY_COOLDOWN) {
                return p;
            }
            attempts++;
        }
        return null; // Fallback ke direct jika tidak ada proxy sehat
    };

    watchdog();
}

function getProxyHealthScore(proxy) {
    const stat = proxyStats.get(proxy);
    if (!stat) return 100;
    let score = 100;
    score -= stat.fails * 10; // Setiap kegagalan mengurangi 10 poin
    if (stat.lastLatency > 5000) score -= 20; // Latensi tinggi
    if (stat.fails >= MAX_PROXY_FAILS) score -= 50; // Hampir mati
    return Math.max(0, score);
}

function getOverallProxyHealth() {
    if (proxyPool.length === 0) return 100;
    const totalScore = Array.from(proxyPool).reduce((sum, p) => sum + getProxyHealthScore(p), 0);
    return (totalScore / proxyPool.length).toFixed(0);
}

async function sendPing(host, io, endpoint = '/ping', proxyUrl = null, method = 'GET') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const start = performance.now();

    try {
        const requestConfig = {
            method: method,
            url: `${host}${endpoint}`,
            signal: controller.signal,
            params: { 
                _cache: Date.now(),
                _nonce: crypto.randomBytes(8).toString('hex'),
                _ip_hint: resolvedIP
            },
            headers: { 
                'User-Agent': userAgent.random().toString(),
                'X-Watchdog-Mode': 'Keep-Alive',
                ...internalBypassHeaders(host)
            }
        };

        if (proxyUrl) {
            const hostPort = proxyUrl.replace(/https?:\/\//, '').split(':');
            const proxyAgentOptions = {
                host: hostPort[0],
                port: parseInt(hostPort[1]),
                keepAlive: true,
                timeout: 6000 
            };
            if (proxyUrl.startsWith('https')) {
                requestConfig.httpsAgent = new HttpsProxyAgent(proxyAgentOptions);
            } else {
                requestConfig.httpAgent = new HttpProxyAgent(proxyAgentOptions);
            }
        }

        await axios(requestConfig);
        state.success++;
        
        const latency = performance.now() - start;
        if (proxyUrl) {
            proxyStats.set(proxyUrl, { fails: 0, lastTry: Date.now(), lastLatency: latency, healthScore: getProxyHealthScore(proxyUrl) });
        }
    } catch (e) {
        state.failure++;
        
        if (e.name === 'AbortError') {
            const logData = { msg: `[WATCHDOG] Ping timed out on ${endpoint}`, type: 'warn' };
            if (process.send) process.send({ type: 'log', data: logData });
            else if (io) io.emit('log', logData);
        }

        if (proxyUrl) {
            const stat = proxyStats.get(proxyUrl) || { fails: 0, lastTry: 0 };
            proxyStats.set(proxyUrl, { 
                fails: stat.fails + 1, 
                lastTry: Date.now() 
            });
        }
        const latency = performance.now() - start; // Catat latensi kegagalan juga
        if (proxyUrl) {
            const stat = proxyStats.get(proxyUrl);
            if (stat) proxyStats.set(proxyUrl, { ...stat, lastLatency: latency, healthScore: getProxyHealthScore(proxyUrl) });
        }
    } finally {
        clearTimeout(timeoutId);
    }

    // Kirim data ke Primary process melalui IPC
    if (process.send) {
        process.send({ 
            type: 'watchdog_stats', 
            data: { 
                ...state, 
                resolvedIP: resolvedIP,
                currentEndpoint: internalEndpoints[currentEndpointIndex],
                backoffDelay: backoffDelay,
                overallProxyHealth: getOverallProxyHealth(),
                detailedProxyStats: Array.from(proxyStats.entries()).map(([url, stats]) => ({ url, ...stats }))
            } 
        });
    } else if (io) {
        io.emit('watchdog_stats', { 
            ...state, 
            resolvedIP: resolvedIP,
            currentEndpoint: internalEndpoints[currentEndpointIndex],
            backoffDelay: backoffDelay,
            overallProxyHealth: getOverallProxyHealth(),
            detailedProxyStats: Array.from(proxyStats.entries()).map(([url, stats]) => ({ url, ...stats }))
        });
    }
}

module.exports = { init };