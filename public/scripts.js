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
const perfMode = document.getElementById('perfMode');

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

// Listen saat scan selesai
socket.on('scan_complete', (data) => {
    updateStatus(false);
    progressBar.style.width = '100%';
    percentProgress.textContent = '100%';
    addLog(`Audit Selesai secara mendalam.`, 'success');
    if(data.target) stopAttackBtn.style.display = 'none';
});

socket.on('target_down', (data) => {
    document.getElementById('statusIndicator').textContent = `SERVER CRASHED! (${data.url})`;
    document.getElementById('statusIndicator').style.background = "#da3633";
    alert(`Peringatan: Server ${data.url} terdeteksi DOWN!`);
});

socket.on('attack_complete', () => {
    updateStatus(false);
    document.getElementById('statusIndicator').style.background = "";
    progressBar.style.width = '100%';
    percentProgress.textContent = '100%';
    stopAttackBtn.style.display = 'none';
    addLog("Stress test/Attack selesai. Cek laporan stabilitas server.", "success");
});

socket.on('attack_progress', (stats) => {
    document.getElementById('statusIndicator').textContent = `CRITICAL ATTACK: ${stats.requestsSent} PKTS (${stats.progress}%)`;
    progressBar.style.width = `${stats.progress}%`;
    percentProgress.textContent = `${stats.progress}%`;
});

socket.on('system_sync', (state) => {
    if (state.logs && state.logs.length > 0) {
        logTerminal.innerHTML = '';
        state.logs.forEach(log => addLog(log.msg, log.type));
    }
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

perfMode.addEventListener('change', () => {
    socket.emit('change_performance_mode', perfMode.value);
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
    let color = '#8b949e'; // default info
    if (type === 'error') color = '#f85149';
    if (type === 'warn') color = '#d29922';
    if (type === 'success') color = '#3fb950';

    div.innerHTML = `<span style="color: ${color}">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function addDebugLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] DEBUG_ERROR: ${msg}`;
    errorLogs.push(formattedMsg);
    
    // Coba parse jika pesan adalah objek Error
    let displayMsg = formattedMsg;
    try {
        const errorObj = JSON.parse(msg);
        if (errorObj.stack) displayMsg = `[${timestamp}] DEBUG_ERROR: ${errorObj.message}\n${errorObj.stack}`;
    } catch (e) { /* not a JSON error object */ }

    errorLogs.push(displayMsg);
    
    const div = document.createElement('div');
    div.textContent = formattedMsg;
    div.textContent = displayMsg;
    div.style.whiteSpace = 'pre-wrap'; // Agar stack trace tampil rapi
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