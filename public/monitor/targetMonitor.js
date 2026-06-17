const latencyCtx = document.getElementById('latencyChart').getContext('2d');
const latencyChart = new Chart(latencyCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{ label: 'Latency (ms)', data: [], borderColor: '#58a6ff', borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } },
            x: { display: false }
        },
        plugins: { legend: { display: false } }
    }
});

socket.on('target_movement', (data) => {
    const targetMovement = document.getElementById('targetMovement');
    const healthColor = data.health > 70 ? '#3fb950' : (data.health > 40 ? '#d29922' : '#da3633');
    
    const moveLine = `
        <div class="move-item" style="border-left: 3px solid ${healthColor}; margin-bottom: 10px; background: #1c2128; padding: 10px; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px;">
                <span style="color: #58a6ff; font-weight: bold;">[${data.timestamp}]</span>
                <span style="color: ${data.status < 400 ? '#3fb950' : '#da3633'}">HTTP ${data.status}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem; color: #8b949e;">
                <div>RTT: <span style="color: #c9d1d9">${data.latency}ms</span></div>
                <div>EMA: <span style="color: #c9d1d9">${data.ema}ms</span></div>
                <div>Jitter: <span style="color: #c9d1d9">${data.jitter}ms</span></div>
                <div>Health: <span style="color: ${healthColor}">${data.health}%</span></div>
            </div>
        </div>
    `;
    
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