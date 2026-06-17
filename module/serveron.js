const axios = require('axios');
const UserAgent = require('user-agents');
const { HttpProxyAgent, HttpsProxyAgent } = require('http-proxy-agent');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const state = { success: 0, failure: 0 };
const userAgent = new UserAgent();
let backoffDelay = 1000; // Initial delay 1 second
let proxyPool = [];
let currentProxyIndex = 0;

// Internal bypass headers for self-ping
const internalBypassHeaders = () => ({
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'X-Internal-Ping': crypto.randomBytes(4).toString('hex')
});

// Alternative endpoints to try if /ping fails
const internalEndpoints = ['/ping', '/', '/health', '/status'];
let currentEndpointIndex = 0;

function init(io) {
    const port = process.env.PORT || 3000;
    const host = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');

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

        // Fitur Pemulihan (Uptime < 95%)
        if (uptime < 95) {
            // Rotate endpoint and proxy more aggressively during recovery
            currentEndpointIndex = (currentEndpointIndex + 1) % internalEndpoints.length;
            currentProxyIndex = (currentProxyIndex + 1) % (proxyPool.length || 1);

            for(let i=0; i<3; i++) {
                await sendPing(host, io, internalEndpoints[currentEndpointIndex], proxyPool[currentProxyIndex]);
            }
            // Apply exponential backoff
            backoffDelay = Math.min(backoffDelay * 2, 30000); // Max 30 seconds
            setTimeout(watchdog, backoffDelay);
            return;
        }
        // Reset backoff delay if uptime is normal
        backoffDelay = 1000;
        currentEndpointIndex = 0; // Reset to default endpoint
        currentProxyIndex = (currentProxyIndex + 1) % (proxyPool.length || 1); // Rotate proxy even if healthy
        await sendPing(host, io, internalEndpoints[currentEndpointIndex], proxyPool[currentProxyIndex]);
        setTimeout(watchdog, 10000);
    };

    watchdog();
}

async function sendPing(host, io, endpoint = '/ping', proxyUrl = null) {
    try {
        const requestConfig = {
            timeout: 3000,
            params: { 
                _cache: Date.now(),
                _nonce: crypto.randomBytes(4).toString('hex')
            },
            headers: { 
                'User-Agent': userAgent.random().toString(),
                'X-Watchdog-Mode': 'Keep-Alive',
                ...internalBypassHeaders()
            }
        };

        // Add proxy agent if a proxy is available
        if (proxyUrl) {
            const hostPort = proxyUrl.replace(/https?:\/\//, '').split(':');
            const proxyAgentOptions = {
                host: hostPort[0],
                port: parseInt(hostPort[1]),
                keepAlive: true,
                timeout: 2500 // Shorter timeout for proxy connection
            };
            if (proxyUrl.startsWith('https')) {
                requestConfig.httpsAgent = new HttpsProxyAgent(proxyAgentOptions);
            } else {
                requestConfig.httpAgent = new HttpProxyAgent(proxyAgentOptions);
            }
        }

        await axios.get(`${host}${endpoint}`, requestConfig);
        state.success++;
    } catch (e) {
        state.failure++;
    }
    if (io) io.emit('watchdog_stats', state);
}

module.exports = { init };