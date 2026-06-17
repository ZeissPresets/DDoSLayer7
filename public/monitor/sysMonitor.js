const cpuLagCtx = document.getElementById('cpuLagChart').getContext('2d');
const cpuLagChart = new Chart(cpuLagCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'CPU Load (%)', data: [], borderColor: '#f1e05a', borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 },
            { label: 'Event Loop Lag (ms)', data: [], borderColor: '#ff7800', borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0, yAxisID: 'lag' }
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

const bpCtx = document.getElementById('bpSparkline').getContext('2d');
const bpChart = new Chart(bpCtx, {
    type: 'line',
    data: {
        labels: Array(60).fill(''),
        datasets: [{
            label: 'Backpressure',
            data: [],
            borderColor: '#3fb950',
            borderWidth: 1.5,
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { display: false },
            y: { display: false, min: 0, max: 100 }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
});

const tempCtx = document.getElementById('tempChart').getContext('2d');
const tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Temp',
            data: [],
            borderColor: '#ff4500',
            backgroundColor: 'rgba(255, 69, 0, 0.1)',
            borderWidth: 1.5,
            tension: 0.4,
            fill: true,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { suggestedMin: 30, suggestedMax: 80, grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 9 } } },
            x: { display: false }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
    }
});

socket.on('system_load', (data) => {
    // Validasi data agar tidak crash jika struktur tidak sesuai
    if (!data || data.cpuLoad === undefined) return;

    const cpuLagText = document.getElementById('cpuLagText');
    const optimizerState = document.getElementById('optimizerState');
    const adaptiveConcurrency = document.getElementById('adaptiveConcurrency');
    const highTempCount = document.getElementById('highTempCount');

    const tempDisplay = data.cpuTemp > 0 ? `${data.cpuTemp}°C` : 'N/A';
    const bpRaw = data.antiLag ? data.antiLag.backpressure : '0%';
    const bpValue = parseFloat(bpRaw);
    
    // Logika pewarnaan dinamis
    let bpColor = '#3fb950'; // Hijau: 0-30% (Kondisi Sehat)
    if (bpValue > 70) bpColor = '#da3633'; // Merah: >70% (Kondisi Kritis)
    else if (bpValue > 30) bpColor = '#d29922'; // Kuning: 30-70% (Peringatan)

    // Update Sparkline
    bpChart.data.datasets[0].data.push(bpValue);
    bpChart.data.datasets[0].borderColor = bpColor;
    bpChart.data.datasets[0].backgroundColor = bpColor + '22'; // Transparansi 13% (hex 22)
    if (bpChart.data.datasets[0].data.length > 60) bpChart.data.datasets[0].data.shift();
    bpChart.update('none'); // Update tanpa animasi untuk performa

    const bpSpan = `<span style="color: ${bpColor}; font-weight: bold;">${bpRaw}</span>`;
    cpuLagText.innerHTML = `CPU: ${data.cpuLoad}% | Lag: ${data.eventLoopLag || 0}ms | BP: ${bpSpan} | Temp: ${tempDisplay}`;

    cpuLagChart.data.labels.push(new Date().toLocaleTimeString());
    cpuLagChart.data.datasets[0].data.push(parseFloat(data.cpuLoad));
    cpuLagChart.data.datasets[1].data.push(parseFloat(data.eventLoopLag));

    if (cpuLagChart.data.labels.length > 30) {
        cpuLagChart.data.labels.shift();
        cpuLagChart.data.datasets[0].data.shift();
        cpuLagChart.data.datasets[1].data.shift();
    }
    cpuLagChart.update();

    let optState = 'Normal';
    if (data.isCritical) optState = 'CRITICAL';
    else if (data.isThrottling) optState = 'THROTTLING';
    else if (data.isRestarting) optState = 'RESTARTING';

    optimizerState.textContent = `${optState} (${data.perfMode || 'normal'})`;
    optimizerState.style.color = data.isCritical ? '#da3633' : (data.isThrottling ? '#d29922' : '#3fb950');
    adaptiveConcurrency.textContent = data.adaptiveConcurrency || 'N/A';
    highTempCount.textContent = data.highTempCounter || '0';

    if (data.cpuTemp > 75 || data.isCritical) {
        cpuLagText.style.color = '#da3633';
    } else {
        cpuLagText.style.color = '#8b949e';
    }

    // Update Temperature Trend Chart (10 Minutes @ 1s interval = 600 points)
    const currentTemp = parseFloat(data.cpuTemp);
    if (!isNaN(currentTemp)) {
        const ts = new Date().toLocaleTimeString();
        tempChart.data.labels.push(ts);
        tempChart.data.datasets[0].data.push(currentTemp);

        if (tempChart.data.labels.length > 600) {
            tempChart.data.labels.shift();
            tempChart.data.datasets[0].data.shift();
        }
        
        const dataArr = tempChart.data.datasets[0].data;
        const min = Math.min(...dataArr).toFixed(1);
        const max = Math.max(...dataArr).toFixed(1);
        const avg = (dataArr.reduce((a, b) => a + b, 0) / dataArr.length).toFixed(1);
        document.getElementById('tempStats').textContent = `Min: ${min}°C | Max: ${max}°C | Avg: ${avg}°C`;
        tempChart.update('none');
    }
});

// Listener untuk detail sistem tambahan (Network, Disk, Uptime)
socket.on('os_telemetry', (data) => {
    if (!data) return;
    document.getElementById('netRx').textContent = `${data.network.rx} MB/s`;
    document.getElementById('netTx').textContent = `${data.network.tx} MB/s`;
    document.getElementById('diskRead').textContent = `${data.disk.read} KB/s`;
    document.getElementById('diskWrite').textContent = `${data.disk.write} KB/s`;
    document.getElementById('sysUptime').textContent = data.os.uptime;
});