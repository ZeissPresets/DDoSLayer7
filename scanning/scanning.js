const axios = require('axios');
const cheerio = require('cheerio');
const chalk = require('chalk');
const fs = require('fs');
const pLimit = require('p-limit');
const path = require('path');
const sslChecker = require('ssl-checker');
const DurationManager = require('../module/duration');
const dns = require('dns');
const net = require('net');
const url = require('url');
const zlib = require('zlib');
const antiLag = require('../module/antiLag'); // Import antiLag module

let AttackManager; // Deklarasi di luar agar bisa diakses
class SecurityScanner {
    constructor(targetUrl, io = null, durationStr = '1m') {
        this.targetUrl = targetUrl.replace(/\/$/, "");
        this.urlObj = new URL(this.targetUrl);
        this.limit = pLimit(10);
        this.io = io;
        this.duration = DurationManager.parseToMs(durationStr);
        this.report = {
            target: this.targetUrl,
            startTime: new Date().toISOString(),
            vulnerabilities: [],
            summary: { 
                technologies: [], 
                headersFound: [], 
                portsOpen: [], 
                dnsRecords: {},
                leakedEmails: []
            }
        };
    }

    emitLog(msg, type = 'info') {
        if (!AttackManager) AttackManager = require('../module/attackManager');
        AttackManager.addInternalLog(msg, type);
    }

    async start() {
        if (!AttackManager) AttackManager = require('../module/attackManager');
        return this.startFullAudit();
    }

    async startFullAudit() {
        this.emitLog(`[*] CORE: Deep Scan Engagement: ${this.targetUrl}`, 'info');
        try {
            // Update progress awal ke Manager
            if (!AttackManager) AttackManager = require('../module/attackManager');
            AttackManager.updateStats(this.targetUrl, { progress: 10, status: 'Initializing' });

            // Jalankan modul audit secara sekuensial dengan jeda dinamis
            await this.dnsRecon();
            await this.applyDynamicDelay();
            await this.portScan();
            await this.applyDynamicDelay();
            await this.checkSecurityHeaders();
            await this.applyDynamicDelay();
            await this.fingerprintStack();
            await this.applyDynamicDelay();
            await this.checkRobotsTxt();
            await this.applyDynamicDelay();
            await this.checkSecurityTxt();
            await this.applyDynamicDelay();
            await this.fuzzSensitiveDirectories();
            await this.applyDynamicDelay();
            await this.auditSSL();
            await this.applyDynamicDelay();
            await this.analyzeHTML();
            await this.applyDynamicDelay();
            await this.checkCORS();
            await this.applyDynamicDelay();
            await this.testVulnerabilities();

            if (!AttackManager) AttackManager = require('../module/attackManager');
            AttackManager.updateStats(this.targetUrl, { progress: 100, status: 'Completed' });
            if (this.io) this.io.emit('scan_complete', { status: 'success', target: this.targetUrl });
            AttackManager.complete(this.targetUrl);
        } catch (error) {
            this.emitLog(`[!] FATAL: ${error.message}`, 'error');
            if (!AttackManager) AttackManager = require('../module/attackManager');
            AttackManager.complete(this.targetUrl, 'failed');
        }
    }

    async applyDynamicDelay() {
        const baseScanDelay = 1000; // 1 detik jeda dasar antar modul
        const delay = baseScanDelay * antiLag.getThrottleMultiplier();
        if (delay > baseScanDelay) {
            this.emitLog(`  [i] Scanner throttling due to system pressure. Delaying next module by ${delay.toFixed(0)}ms.`, 'warn');
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async dnsRecon() {
        this.emitLog('[+] Modul: DNS Reconnaissance...', 'info');
        const records = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];
        for (const type of records) {
            try {
                const results = await dns.promises.resolve(this.urlObj.hostname, type);
                this.report.summary.dnsRecords[type] = results;
            } catch (e) {}
        }
    }

    async portScan() {
        this.emitLog('[+] Modul: Aggressive Port Scanning...', 'info');
        const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 3306, 3389, 5432, 8080, 8443];
        const scan = ports.map(port => this.limit(() => {
            return new Promise((res) => {
                const socket = new net.Socket();
                socket.setTimeout(2000);
                socket.on('connect', () => {
                    this.report.summary.portsOpen.push(port);
                    this.emitLog(`  [i] Port Terbuka: ${port}`, 'success');
                    socket.destroy();
                    res();
                });
                socket.on('timeout', () => { socket.destroy(); res(); });
                socket.on('error', () => { socket.destroy(); res(); });
                socket.connect(port, this.urlObj.hostname);
            });
        }));
        await Promise.all(scan);
    }

    async checkSecurityHeaders() {
        this.emitLog('[+] Modul: Security Header Audit...', 'info');
        try {
            const response = await axios.get(this.targetUrl, { timeout: 10000 });
            const headers = response.headers;
            const securityHeaders = {
                'Content-Security-Policy': 'High',
                'X-Frame-Options': 'Medium',
                'X-Content-Type-Options': 'Low',
                'Strict-Transport-Security': 'High',
                'Referrer-Policy': 'Low',
                'Permissions-Policy': 'Low',
                'X-XSS-Protection': 'Medium'
            };
            for (const [h, s] of Object.entries(securityHeaders)) {
                if (!headers[h.toLowerCase()]) this.logIssue(s, `Missing: ${h}`);
                else this.report.summary.headersFound.push(h);
            }
            if (headers['server']) this.logIssue('Low', `Information Leak: Server Header (${headers['server']})`);
            if (headers['x-powered-by']) this.logIssue('Low', `Information Leak: X-Powered-By (${headers['x-powered-by']})`);
        } catch (err) {
            this.emitLog(`  [-] Error: ${err.message}`, 'error');
        }
    }

    async auditSSL() {
        if (!this.targetUrl.startsWith('https')) return;
        this.emitLog('[+] Modul: SSL/TLS Deep Audit...', 'info');
        try {
            const details = await sslChecker(this.urlObj.hostname);
            if (details.daysRemaining < 30) this.logIssue('Medium', `SSL Expiring: ${details.daysRemaining} days left`);
            this.emitLog(`  [i] SSL: ${details.valid ? 'Valid' : 'Invalid'} (${details.daysRemaining} days remaining)`, 'success');
        } catch (err) {
            this.logIssue('Low', `SSL Check Failed: ${err.message}`);
        }
    }

    async checkRobotsTxt() {
        try {
            const res = await axios.get(`${this.targetUrl}/robots.txt`);
            if (res.status === 200) {
                this.emitLog(`  [i] robots.txt found. Checking for disallowed paths...`, 'success');
                if (res.data.includes('Disallow:')) this.logIssue('Low', 'Robots.txt contains Disallow rules (Potential path disclosure)');
            }
        } catch (e) {}
    }

    async checkSecurityTxt() {
        try {
            await axios.get(`${this.targetUrl}/.well-known/security.txt`);
        } catch (e) {
            this.logIssue('Low', 'Missing security.txt in .well-known/ (Non-critical)');
        }
    }

    async fingerprintStack() {
        this.emitLog('[+] Modul: Tech Stack Fingerprinting...', 'info');
        try {
            const { data, headers } = await axios.get(this.targetUrl);
            const $ = cheerio.load(data);
            const body = data.toLowerCase();
            const checks = {
                'WordPress': body.includes('wp-content'),
                'Joomla': body.includes('joomla'),
                'Drupal': body.includes('drupal'),
                'React': body.includes('react'),
                'Vue.js': body.includes('vue.js'),
                'Angular': body.includes('ng-app'),
                'Express': headers['x-powered-by'] === 'Express',
                'Laravel': body.includes('laravel_session'),
                'Next.js': body.includes('_next/static')
            };
            for (const [name, found] of Object.entries(checks)) {
                if (found) this.report.summary.technologies.push(name);
            }
            if ($('meta[name="generator"]').length) this.report.summary.technologies.push($('meta[name="generator"]').attr('content'));
            this.emitLog(`  [i] Tech: ${this.report.summary.technologies.join(', ') || 'Unknown'}`, 'success');
        } catch (err) {}
    }

    async analyzeHTML() {
        this.emitLog('[+] Modul: Deep HTML Analysis...', 'info');
        try {
            const { data } = await axios.get(this.targetUrl);
            const $ = cheerio.load(data);
            const comments = data.match(/<!--[\s\S]*?-->/g);
            if (comments) {
                comments.forEach(c => {
                    if (c.toLowerCase().includes('pass') || c.toLowerCase().includes('user') || c.includes('127.0.0.1')) {
                        this.logIssue('Medium', 'Sensitive Info in HTML Comments');
                    }
                });
            }
            $('input[type="hidden"]').each((i, el) => {
                const val = $(el).attr('value');
                if (val && (val.length > 20 || val.includes('{'))) {
                    this.logIssue('Low', 'Suspect Hidden Input Field');
                }
            });
            const emails = data.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
            if (emails) this.report.summary.leakedEmails = [...new Set(emails)];
        } catch (e) {}
    }

    async checkCORS() {
        try {
            const res = await axios.options(this.targetUrl, { headers: { 'Origin': 'https://evil-attacker.com' } });
            if (res.headers['access-control-allow-origin'] === '*' || res.headers['access-control-allow-origin'] === 'https://evil-attacker.com') {
                this.logIssue('High', 'Insecure CORS Policy (Permissive Origin)');
            }
        } catch (e) {}
    }

    async testVulnerabilities() {
        this.emitLog('[+] Modul: Vulnerability Probing...', 'info');
        await Promise.all([this.testSqlInjection(), this.testXSS()]);
    }

    async testSqlInjection() {
        const payloads = ["'", "';--", "' OR '1'='1"];
        const params = ['id', 'q', 'search', 'user', 'cat'];
        for (const p of payloads) {
            for (const param of params) {
                try {
                    const res = await axios.get(`${this.targetUrl}?${param}=${encodeURIComponent(p)}`, { timeout: 5000 });
                    if (res.data.toLowerCase().includes('sql syntax') || res.data.toLowerCase().includes('mysql')) {
                        this.logIssue('Critical', `Potential SQL Injection on parameter: ${param}`);
                        return;
                    }
                } catch (e) {}
            }
        }
    }

    async testXSS() {
        const payload = '<script>alert(1)</script>';
        const params = ['q', 's', 'id', 'search'];
        for (const param of params) {
            try {
                const res = await axios.get(`${this.targetUrl}?${param}=${encodeURIComponent(payload)}`, { timeout: 5000 });
                if (res.data.includes(payload)) {
                    this.logIssue('High', `Potential Reflected XSS on parameter: ${param}`);
                    return;
                }
            } catch (e) {}
        }
    }

    async fuzzSensitiveDirectories() {
        this.emitLog('[+] Modul: Aggressive Directory Fuzzing...', 'info');
        const payloads = [
            '/.env', '/.git/config', '/.vscode/', '/phpinfo.php', '/config.json', 
            '/backup.zip', '/.htaccess', '/admin', '/wp-admin', '/admin.php',
            '/config.php', '/.env.example', '/server-status', '/_profiler'
        ];
        const tasks = payloads.map(p => this.limit(async () => {
            try {
                const res = await axios.head(`${this.targetUrl}${p}`, { timeout: 5000, validateStatus: false });
                if (res.status === 200) this.logIssue('High', `Sensitive path exposed: ${p}`);
            } catch (err) {}
        }));
        await Promise.all(tasks);
    }

    logIssue(severity, description) {
        const color = severity === 'High' ? chalk.red : chalk.magenta;
        console.log(color(`  [!] [${severity}] ${description}`));
        const issue = { severity, description, foundAt: new Date().toISOString() };
        this.report.vulnerabilities.push(issue);
        if (this.io) this.io.emit('vulnerability', issue);
    }
}

// Logika agar bisa dijalankan langsung dari terminal
if (require.main === module) {
    const target = process.argv[2];
    const duration = process.argv[3] || '1m';
    if (!target) {
        console.log(chalk.red("Usage: npm run scan <target-url>"));
        process.exit(1);
    }
    new SecurityScanner(target, null, duration).startFullAudit();
}

module.exports = { SecurityScanner };