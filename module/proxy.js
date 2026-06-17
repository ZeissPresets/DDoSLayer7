const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pLimit = require('p-limit');

class ProxyGenerator {
    constructor() {
        this.filePath = path.join(process.cwd(), 'proxies.txt');
        this.sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
            'https://www.proxy-list.download/api/v1/get?type=http',
            'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
            'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt'
        ];
        this.batchSize = 100;
        this.intervalTime = 10000;
        this.limit = pLimit(50);
    }

    async checkProxy(proxyUrl) {
        try {
            const hostPort = proxyUrl.replace('http://', '').split(':');
            const start = Date.now();
            await axios.get('http://www.google.com', {
                proxy: { host: hostPort[0], port: parseInt(hostPort[1]) },
                timeout: 5000,
                validateStatus: false
            });
            return { url: proxyUrl, latency: Date.now() - start, alive: true };
        } catch {
            return { alive: false };
        }
    }

    async rotate() {
        try {
            const source = this.sources[Math.floor(Math.random() * this.sources.length)];
            const response = await axios.get(source, { timeout: 8000 });
            let rawProxies = response.data.split(/\r?\n/)
                .filter(line => line.includes(':'))
                .map(line => `http://${line.trim()}`)
                .slice(0, 200);
            
            rawProxies = [...new Set(rawProxies)];
            
            const results = await Promise.all(rawProxies.map(p => this.limit(() => this.checkProxy(p))));
            const alive = results.filter(r => r.alive)
                .sort((a, b) => a.latency - b.latency)
                .map(r => r.url);

            if (alive.length > 0) {
                fs.writeFileSync(this.filePath, alive.slice(0, this.batchSize).join('\n'), 'utf8');
            }
        } catch (e) {}
    }

    init() {
        // Berikan jeda 30 detik sebelum rotasi pertama agar startup lancar
        setTimeout(() => this.rotate(), 30000);
        setInterval(() => this.rotate(), this.intervalTime);
    }
}

new ProxyGenerator().init();