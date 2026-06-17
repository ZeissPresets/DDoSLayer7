socket.on('identity_stats', (data) => {
    const bpProxies = document.getElementById('bpProxies');
    const bpSessions = document.getElementById('bpSessions');
    const bpIntegrity = document.getElementById('bpIntegrity');
    const detailedProxyStats = document.getElementById('detailedProxyStats');

    if (data.pool) {
        bpProxies.textContent = `${data.pool.proxies} Loaded`;
        bpSessions.textContent = data.pool.activeSessions;
    }
    if (data.engine) {
        bpIntegrity.textContent = data.engine.integrity;
    }

    if (data.detailedProxyStats && data.detailedProxyStats.length > 0) {
        detailedProxyStats.innerHTML = data.detailedProxyStats.map(p => {
            const healthColor = p.healthScore > 70 ? '#3fb950' : (p.healthScore > 40 ? '#d29922' : '#da3633');
            return `
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 3px; padding: 2px 0;">
                    <span style="color: #8b949e;">${p.url.substring(0, 25)}...</span>
                    <span>Fails: <span style="color: #f85149;">${p.fails}</span> | Health: <span style="color: ${healthColor};">${p.healthScore}%</span></span>
                </div>
            `;
        }).join('');
    } else {
        detailedProxyStats.innerHTML = '<div style="font-size: 0.7rem; color: #8b949e;">No proxies loaded or available.</div>';
    }
});