const scanForm = document.getElementById('scanForm');
const logTerminal = document.getElementById('logTerminal');
const statusIndicator = document.getElementById('statusIndicator');
const startBtn = document.getElementById('startBtn');
const findingsList = document.getElementById('findingsList');
const attackBtn = document.getElementById('attackBtn');

const socket = io();

// Listen untuk log real-time dari server
socket.on('log', (data) => {
    addLog(data.msg, data.type);
});

// Listen untuk temuan kerentanan baru
socket.on('vulnerability', (issue) => {
    addFinding(issue);
});

// Listen saat scan selesai
socket.on('scan_complete', (data) => {
    updateStatus(false);
    addLog(`Audit Selesai secara mendalam. Laporan: ${data.reportPath}`, 'success');
});

// Listen untuk progress attack
socket.on('attack_progress', (stats) => {
    statusIndicator.textContent = `CRITICAL ATTACK: ${stats.requestsSent} PKTS (${stats.progress}%)`;
});

socket.on('target_down', (data) => {
    statusIndicator.textContent = "SERVER CRASHED!";
    statusIndicator.style.background = "#da3633";
    alert(`Peringatan: Server ${data.url} terdeteksi DOWN!`);
});

socket.on('attack_complete', () => {
    updateStatus(false);
    statusIndicator.style.background = "";
    addLog("Stress test/Attack selesai. Cek laporan stabilitas server.", "success");
});

scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('url').value;
    const duration = document.getElementById('duration').value;

    // Update UI Status
    updateStatus(true);
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
    statusIndicator.className = 'status active';
    statusIndicator.style.background = "#da3633";

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

function addLog(msg, type = 'info') {
    const div = document.createElement('div');
    div.innerHTML = `<span style="color: ${type === 'error' ? '#f85149' : '#8b949e'}">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
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
}