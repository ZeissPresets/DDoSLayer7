const scanForm = document.getElementById('scanForm');
const logTerminal = document.getElementById('logTerminal');
const statusIndicator = document.getElementById('statusIndicator');
const startBtn = document.getElementById('startBtn');
const findingsList = document.getElementById('findingsList');
const attackBtn = document.getElementById('attackBtn');
const progressBar = document.getElementById('progressBar');
const durationCounter = document.getElementById('durationCounter');
const percentProgress = document.getElementById('percentProgress');
const debugTerminal = document.getElementById('debugTerminal');
const copyDebugBtn = document.getElementById('copyDebugBtn');
const stopAttackBtn = document.getElementById('stopAttackBtn');
const targetMovement = document.getElementById('targetMovement');
const memoryBar = document.getElementById('memoryBar');
const memoryText = document.getElementById('memoryText');
const memoryStatus = document.getElementById('memoryStatus');
const cpuLagText = document.getElementById('cpuLagText');
const kaSuccess = document.getElementById('kaSuccess');
const kaFailure = document.getElementById('kaFailure');
const kaUptime = document.getElementById('kaUptime');
const activeTasksList = document.getElementById('activeTasksList');
const queueList = document.getElementById('queueList');
const queueCountBadge = document.getElementById('queueCountBadge');
const aiStateDisplay = document.getElementById('aiStateDisplay');
const vectorWeights = document.getElementById('vectorWeights');
const bpProxies = document.getElementById('bpProxies');
const bpFingerprint = document.getElementById('bpFingerprint');
const bpIntegrity = document.getElementById('bpIntegrity');

const latencyCtx = document.getElementById('latencyChart').getContext('2d');
const latencyChart = new Chart(latencyCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Latency (ms)',
            data: [],
            borderColor: '#58a6ff',
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } },
            x: { display: false }
        },
        plugins: {
            legend: { display: false }
        }
    }
});

const watchdogCtx = document.getElementById('watchdogChart').getContext('2d');
const watchdogChart = new Chart(watchdogCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'OK',
                data: [],
                borderColor: '#3fb950',
                borderWidth: 1.5,
                tension: 0.4,
                fill: false,
                pointRadius: 0
            },
            {
                label: 'Fail',
                data: [],
                borderColor: '#f85149',
                borderWidth: 1.5,
                tension: 0.4,
                fill: false,
                pointRadius: 0
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { display: false },
            x: { display: false }
        },
        plugins: {
            legend: { display: false }
        }
    }
});

const safeModeCtx = document.getElementById('safeModeChart').getContext('2d');
const safeModeChart = new Chart(safeModeCtx, {
    type: 'bar',
    data: {
        labels: ['Stability'],
        datasets: [{
            label: 'Cooldown Progress',
            data: [0],
            backgroundColor: '#d29922',
            borderRadius: 4
        }]
    },
    options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                beginAtZero: true, 
                max: 6, 
                grid: { display: false }, 
                ticks: { display: false } 
            },
            y: { display: false }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
        }
    }
});

const cpuLagCtx = document.getElementById('cpuLagChart').getContext('2d');
const cpuLagChart = new Chart(cpuLagCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'CPU Load (%)',
                data: [],
                borderColor: '#f1e05a',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 0
            },
            {
                label: 'Event Loop Lag (ms)',
                data: [],
                borderColor: '#ff7800',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                yAxisID: 'lag'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } },
            lag: { type: 'linear', position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#ff7800', font: { size: 10 } } },
            x: { display: false }
        },
        plugins: { legend: { display: true, labels: { color: '#c9d1d9' } } }
    }
});

const socket = io();
let timerInterval;
let startTime;
let errorLogs = [];

// Listen untuk log real-time dari server
socket.on('log', (data) => {
    addLog(data.msg, data.type);
    if (data.type === 'error') {
        addDebugLog(data.msg);
    }
});

// Listen untuk temuan kerentanan baru
socket.on('vulnerability', (issue) => {
    addFinding(issue);
});

// Listen saat scan selesai
socket.on('scan_complete', (data) => {
    updateStatus(false);
    progressBar.style.width = '100%';
    percentProgress.textContent = '100%';
    addLog(`Audit Selesai secara mendalam.`, 'success');
    if(data.target) stopAttackBtn.style.display = 'none';
});

// Listen untuk progress attack
socket.on('attack_progress', (stats) => {
    statusIndicator.textContent = `CRITICAL ATTACK: ${stats.requestsSent} PKTS (${stats.progress}%)`;
    progressBar.style.width = `${stats.progress}%`;
    percentProgress.textContent = `${stats.progress}%`;

    // Update Safe Mode Indicator
    const smIndicator = document.getElementById('safeModeIndicator');
    const smChartContainer = document.getElementById('cooldownChartContainer');
    if (stats.safeMode) {
        smIndicator.style.display = 'block';
        smChartContainer.style.display = 'block';
        safeModeChart.data.datasets[0].data = [stats.safeModeCooldown || 0];
        safeModeChart.update();
    } else {
        smIndicator.style.display = 'none';
        smChartContainer.style.display = 'none';
    }

    // Update Identity Panel
    if (stats.proxyCount !== undefined) bpProxies.textContent = `${stats.proxyCount} Loaded`;
    if (stats.integrity) bpIntegrity.textContent = stats.integrity;
    bpFingerprint.textContent = stats.safeMode ? "Restricted" : "Ultra-Deep";

    // Update AI Panel
    aiStateDisplay.textContent = stats.aiState || "MAX_THROUGHPUT";
    aiStateDisplay.className = `status ${stats.aiState === 'BYPASS_EVASION' ? 'active' : 'idle'}`;
    
    if (stats.vectors) {
        vectorWeights.innerHTML = Object.entries(stats.vectors)
            .map(([k, v]) => `<div class="weight-box">${k.toUpperCase()}: <b>${v}</b></div>`)
            .join('');
    }
});

socket.on('target_movement', (data) => {
    const moveLine = `<div class="move-item"><b>[${data.timestamp}]</b> Status: ${data.status} | RTT: ${data.latency}ms</div>`;
    const div = document.createElement('div');
    div.innerHTML = moveLine;
    targetMovement.prepend(div);
    while (targetMovement.children.length > 10) {
        targetMovement.removeChild(targetMovement.lastChild);
    }

    latencyChart.data.labels.push(data.timestamp);
    latencyChart.data.datasets[0].data.push(parseFloat(data.latency));
    if (latencyChart.data.labels.length > 30) {
        latencyChart.data.labels.shift();
        latencyChart.data.datasets[0].data.shift();
    }
    latencyChart.update();
});

socket.on('memory_stats', (data) => {
    memoryText.textContent = `${data.used}MB / ${data.total}MB (${data.percent}%)`;
    memoryBar.style.width = `${data.percent}%`;
    
    if (parseFloat(data.used) > 400) {
        memoryStatus.textContent = 'HIGH USAGE';
        memoryStatus.className = 'status active';
        memoryStatus.style.background = '#da3633';
        memoryBar.style.background = '#da3633';
    } else {
        memoryStatus.textContent = 'Normal';
        memoryStatus.className = 'status idle';
        memoryStatus.style.background = '';
        memoryBar.style.background = '#f1e05a';
    }
});

socket.on('system_load', (data) => {
    // Sinkronisasi info load server ke UI jika panel tersedia
    const tempDisplay = data.cpuTemp > 0 ? `${data.cpuTemp}°C` : 'N/A';
    cpuLagText.textContent = `CPU: ${data.cpuLoad}% | Lag: ${data.eventLoopLag || 0}ms | Temp: ${tempDisplay}`;

    cpuLagChart.data.labels.push(new Date().toLocaleTimeString());
    cpuLagChart.data.datasets[0].data.push(parseFloat(data.cpuLoad));
    cpuLagChart.data.datasets[1].data.push(parseFloat(data.eventLoopLag));

    if (cpuLagChart.data.labels.length > 30) {
        cpuLagChart.data.labels.shift();
        cpuLagChart.data.datasets[0].data.shift();
        cpuLagChart.data.datasets[1].data.shift();
    }
    cpuLagChart.update();
    
    // Logika warna untuk indikator suhu dan load
    if (data.cpuTemp > 75 || data.isCritical) {
        cpuLagText.style.color = '#da3633';
    } else if (data.cpuTemp > 60) {
        cpuLagText.style.color = '#f1e05a'; // Oranye (Peringatan)
    } else {
        cpuLagText.style.color = '#8b949e'; // Normal
    }
});

socket.on('system_sync', (state) => {
    // Restore Terminal Logs from Background
    if (state.logs && state.logs.length > 0) {
        logTerminal.innerHTML = ''; // Clear to prevent duplicates
        state.logs.forEach(log => {
            addLog(log.msg, log.type);
        });
    }

    // Sync Identity Panel
    if (state.bypass) {
        bpProxies.textContent = `${state.bypass.proxyCount} Loaded`;
        bpIntegrity.textContent = state.bypass.integrity;
    }

    // Update Active Tasks
    if (state.active.length > 0) {
        activeTasksList.innerHTML = state.active.map(t => `
            <div class="task-item">
                <b>${t.type.toUpperCase()}</b>: ${t.url}<br>
                <small>Started: ${new Date(t.startTime).toLocaleTimeString()}</small>
            </div>
        `).join('');
        updateStatus(true);
    } else {
        activeTasksList.innerHTML = '<div class="empty-msg">No active tasks</div>';
        updateStatus(false);
    }

    // Sync Safe Mode State
    const attackTask = state.active.find(t => t.type === 'attack');
    const smIndicator = document.getElementById('safeModeIndicator');
    const smChartContainer = document.getElementById('cooldownChartContainer');
    
    if (attackTask && attackTask.stats && attackTask.stats.safeMode) {
        smIndicator.style.display = 'block';
        smChartContainer.style.display = 'block';
        safeModeChart.data.datasets[0].data = [attackTask.stats.safeModeCooldown || 0];
        safeModeChart.update();
    } else {
        smIndicator.style.display = 'none';
        smChartContainer.style.display = 'none';
    }

    // Update Queue
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
});

socket.on('watchdog_stats', (data) => {
    kaSuccess.textContent = data.success;
    kaFailure.textContent = data.failure;

    const total = data.success + data.failure;
    const uptimePercent = total > 0 ? ((data.success / total) * 100).toFixed(2) : "100.00";
    kaUptime.textContent = uptimePercent + "%";

    if (parseFloat(uptimePercent) < 95 && total > 10) { // Hanya notifikasi jika sudah ada cukup data
        addLog(`[WARNING] Uptime Keep-Alive turun di bawah 95%: ${uptimePercent}%`, 'error');
    }

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
});

socket.on('target_down', (data) => {
    statusIndicator.textContent = `SERVER CRASHED! (${data.url})`;
    statusIndicator.style.background = "#da3633";
    alert(`Peringatan: Server ${data.url} terdeteksi DOWN!`);
});

socket.on('attack_complete', () => {
    updateStatus(false);
    statusIndicator.style.background = "";
    progressBar.style.width = '100%';
    percentProgress.textContent = '100%';
    stopAttackBtn.style.display = 'none';
    addLog("Stress test/Attack selesai. Cek laporan stabilitas server.", "success");
});

scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('url').value;
    const duration = document.getElementById('duration').value;

    // Update UI Status
    updateStatus(true);
    resetMonitoring();
    addLog(`Initiating deep scan for target: ${url}`);
    addLog(`Configured duration: ${duration}`);
    findingsList.innerHTML = ''; // Reset temuan sebelumnya

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, duration })
        });

        const data = await response.json();

        if (response.ok) {
            addLog(`Server response: ${data.message}`);
            addLog(`Scanning engine is now analyzing headers and directories...`);
        } else {
            addLog(`Error: ${data.error}`, 'error');
            updateStatus(false);
        }
    } catch (err) {
        addLog(`System Error: Could not connect to backend`, 'error');
        updateStatus(false);
    }
});

attackBtn.addEventListener('click', async () => {
    const url = document.getElementById('url').value;
    const duration = document.getElementById('duration').value;
    if(!url) return alert("Masukkan URL Target");

    updateStatus(true);
    resetMonitoring();
    statusIndicator.className = 'status active';
    statusIndicator.style.background = "#da3633";
    stopAttackBtn.style.display = 'block';

    try {
        await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, duration })
        });
        addLog(`Deep Stress Test (Attack) dimulai pada ${url}`, 'error');
    } catch (err) {
        addLog(`Attack failed to start`, 'error');
        updateStatus(false);
    }
});

stopAttackBtn.addEventListener('click', async () => {
    const url = document.getElementById('url').value;
    try {
        const response = await fetch('/api/attack/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        if (response.ok) {
            addLog(data.message, 'success');
            stopAttackBtn.style.display = 'none';
        }
    } catch (err) {
        addLog("Gagal menghentikan serangan", 'error');
    }
});

copyDebugBtn.addEventListener('click', () => {
    const logText = errorLogs.join('\n');
    navigator.clipboard.writeText(logText).then(() => {
        alert('Error logs copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy logs: ', err);
    });
});

function addLog(msg, type = 'info') {
    const div = document.createElement('div');
    div.innerHTML = `<span style="color: ${type === 'error' ? '#f85149' : '#8b949e'}">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function addDebugLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] DEBUG_ERROR: ${msg}`;
    errorLogs.push(formattedMsg);
    
    const div = document.createElement('div');
    div.textContent = formattedMsg;
    debugTerminal.appendChild(div);
    debugTerminal.scrollTop = debugTerminal.scrollHeight;
}

function resetMonitoring() {
    progressBar.style.width = '0%';
    percentProgress.textContent = '0%';
    durationCounter.textContent = 'Elapsed: 0s';
    errorLogs = [];
    debugTerminal.innerHTML = '';
    document.getElementById('safeModeIndicator').style.display = 'none';
    document.getElementById('cooldownChartContainer').style.display = 'none';
    safeModeChart.data.datasets[0].data = [0];
    safeModeChart.update();
    latencyChart.data.labels = [];
    latencyChart.data.datasets[0].data = [];
    latencyChart.update();
    memoryBar.style.width = '0%';
    memoryText.textContent = '0MB / 512MB (0%)';
    cpuLagChart.data.labels = [];
    cpuLagChart.data.datasets[0].data = [];
    cpuLagChart.data.datasets[1].data = [];
    cpuLagChart.update();
}

function addFinding(issue) {
    const div = document.createElement('div');
    div.className = `finding-item`;
    div.style.padding = '10px';
    div.style.marginBottom = '8px';
    div.style.borderLeft = `4px solid ${issue.severity === 'High' ? '#da3633' : '#d29922'}`;
    div.style.background = '#1c2128';
    div.innerHTML = `<strong>[${issue.severity}]</strong> ${issue.description} <small style="display:block; color:#8b949e; margin-top:4px">${new Date(issue.foundAt).toLocaleTimeString()}</small>`;
    findingsList.appendChild(div);
}

function updateStatus(active) {
    statusIndicator.textContent = active ? 'Scanning' : 'Ready';
    statusIndicator.className = active ? 'status active' : 'status idle';
    startBtn.disabled = active;

    if (active) {
        startTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            durationCounter.textContent = `Elapsed: ${elapsed}s`;
        }, 1000);
    } else {
        clearInterval(timerInterval);
    }
}