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

socket.on('system_load', (data) => {
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

    optimizerState.textContent = optState;
    optimizerState.style.color = data.isCritical ? '#da3633' : (data.isThrottling ? '#d29922' : '#3fb950');
    adaptiveConcurrency.textContent = data.adaptiveConcurrency || 'N/A';
    highTempCount.textContent = data.highTempCounter || '0';

    if (data.cpuTemp > 75 || data.isCritical) {
        cpuLagText.style.color = '#da3633';
    } else {
        cpuLagText.style.color = '#8b949e';
    }
});