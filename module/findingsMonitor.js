const _ = require('lodash');
const AttackManager = require('./attackManager'); // Import AttackManager untuk konfigurasi remote

class FindingsMonitor {
    constructor(io) {
        this.io = io;
        this.totalFound = 0;
        this.vulnerabilities = [];
        this.MAX_LOCAL_FINDINGS = 50; // Batasi jumlah temuan lokal untuk display

        this.severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    }

    reportVulnerability(issue) {
        // Deduplication Logic
        const isDuplicate = this.vulnerabilities.some(v => 
            v.description === issue.description && v.url === issue.url
        );
        if (isDuplicate) return;

        this.totalFound++;
        const finding = {
            ...issue,
            id: `VULN-${this.totalFound}`,
            detectedAt: new Date().toISOString(),
            url: issue.url || 'N/A',
            payload: issue.payload || 'N/A',
            cvss: this.assignCVSS(issue.severity),
            owasp: this.mapToOWASP(issue.description),
            mitigation: this.getMitigation(issue.description)
        };

        this.vulnerabilities.push(finding); // Tetap simpan lokal untuk display cepat
        if (this.vulnerabilities.length > this.MAX_LOCAL_FINDINGS) {
            this.vulnerabilities.shift(); // Hapus yang terlama jika melebihi batas
        }
        this.severityCounts[issue.severity]++;

        if (this.io) {
            this.io.emit('vulnerability', finding);
            this.io.emit('findings_stats', {
                total: this.totalFound,
                counts: this.severityCounts,
                riskScore: this.calculateGlobalRisk()
            });
            this.io.emit('log', { 
                msg: `[SECURITY] ${finding.severity.toUpperCase()} found at ${finding.url}`, 
                type: finding.severity === 'Critical' || finding.severity === 'High' ? 'error' : 'warn' 
            });
        }

        // Kirim temuan ke remote database untuk penyimpanan persisten
        this.sendToRemote('scan_findings', {
            severity: finding.severity,
            description: finding.description // Kirim deskripsi lengkap
        });
    }

    async sendToRemote(collection, data) {
        AttackManager.sendToRemote(collection, data);
    }

    assignCVSS(severity) {
        const scores = { 'Critical': 9.8, 'High': 7.5, 'Medium': 5.0, 'Low': 3.0 };
        return scores[severity] || 0.0;
    }

    mapToOWASP(desc) {
        const d = desc.toLowerCase();
        if (d.includes('sql')) return 'A03:2021-Injection';
        if (d.includes('xss') || d.includes('script')) return 'A03:2021-Injection (XSS)';
        if (d.includes('cors') || d.includes('origin')) return 'A05:2021-Security Misconfiguration';
        if (d.includes('header') || d.includes('missing')) return 'A05:2021-Security Misconfiguration';
        if (d.includes('.env') || d.includes('config')) return 'A01:2021-Broken Access Control';
        return 'A00:General';
    }

    getMitigation(desc) {
        const d = desc.toLowerCase();
        if (d.includes('sql')) return 'Use prepared statements and parameterized queries.';
        if (d.includes('xss')) return 'Implement Content Security Policy (CSP) and escape user input.';
        if (d.includes('header')) return 'Configure the web server to include missing security headers.';
        if (d.includes('.env')) return 'Restrict access to sensitive files using .htaccess or server config.';
        return 'Review server configuration and apply security best practices.';
    }

    calculateGlobalRisk() {
        const weights = { Critical: 10, High: 5, Medium: 2, Low: 1 };
        let totalWeight = 0;
        for (const [sev, count] of Object.entries(this.severityCounts)) {
            totalWeight += count * weights[sev];
        }
        return Math.min(100, totalWeight).toFixed(0);
    }

    getReportSummary() {
        return {
            vulnerabilities: _.reverse([...this.vulnerabilities]),
            summary: this.severityCounts,
            globalRisk: this.calculateGlobalRisk(),
            topTargets: _.chain(this.vulnerabilities)
                .countBy('url')
                .toPairs()
                .orderBy([1], ['desc'])
                .take(3)
                .value()
        };
    }

    reset() {
        this.vulnerabilities = [];
        this.totalFound = 0;
        this.severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    }
}

module.exports = FindingsMonitor;