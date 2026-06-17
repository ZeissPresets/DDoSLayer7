socket.on('system_sync', (state) => {
    const activeTasksList = document.getElementById('activeTasksList');
    const queueList = document.getElementById('queueList');
    const queueCountBadge = document.getElementById('queueCountBadge');

    // Update Active Tasks
    if (state.active && state.active.length > 0) {
        activeTasksList.innerHTML = state.active.map(t => `
            <div class="task-item">
                <b>${t.type.toUpperCase()}</b>: ${t.url}<br>
                <small>Started: ${new Date(t.startTime).toLocaleTimeString()}</small>
            </div>
        `).join('');
    } else {
        activeTasksList.innerHTML = '<div class="empty-msg">No active tasks</div>';
    }

    // Update Queue
    if (state.queued) {
        queueCountBadge.textContent = state.queued.length;
        
        const formatWaitTime = (seconds) => {
            if (seconds <= 0) return "Starting soon...";
            if (seconds < 60) return `${seconds}s`;
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return s > 0 ? `${m}m ${s}s` : `${m}m`;
        };

        if (state.queued.length > 0) {
            queueList.innerHTML = state.queued.map(q => `
                <div class="task-item small" style="border-left: 3px solid #d29922; margin-bottom: 5px;">
                    <b>#${q.pos} [${q.type.toUpperCase()}]</b>: ${q.url.substring(0, 30)}...
                    <div style="font-size: 0.7rem; color: #d29922; font-weight: bold;">Est. wait: ${formatWaitTime(q.waitTime)}</div>
                </div>
            `).join('');
        } else {
            queueList.innerHTML = '<div class="empty-msg">Queue is empty</div>';
        }
    }
});

const watchdogChart = new Chart(document.getElementById('watchdogChart').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'OK', data: [], borderColor: '#3fb950', borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0 }, { label: 'Fail', data: [], borderColor: '#f85149', borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false }, x: { display: false } }, plugins: { legend: { display: false } } }
});

socket.on('watchdog_stats', (data) => {
    document.getElementById('kaSuccess').textContent = data.success;
    document.getElementById('kaFailure').textContent = data.failure;
    const total = data.success + data.failure;
    document.getElementById('kaUptime').textContent = (total > 0 ? ((data.success / total) * 100).toFixed(2) : "100.00") + "%";

    // Update Watchdog Chart
    const ts = new Date().toLocaleTimeString();
    watchdogChart.data.labels.push(ts);
    watchdogChart.data.datasets[0].data.push(data.success);
    watchdogChart.data.datasets[1].data.push(data.failure);
    if (watchdogChart.data.labels.length > 20) {
        watchdogChart.data.labels.shift();
        watchdogChart.data.datasets[0].data.shift();
        watchdogChart.data.datasets[1].data.shift();
    }
    watchdogChart.update();
    
    // Update details
    document.getElementById('kaResolvedIP').textContent = data.resolvedIP || 'N/A';
    document.getElementById('kaCurrentEndpoint').textContent = data.currentEndpoint || '/ping';
    document.getElementById('kaBackoffDelay').textContent = `${(data.backoffDelay / 1000).toFixed(0)}s`;
    document.getElementById('kaOverallProxyHealth').textContent = `${data.overallProxyHealth}%`;
});