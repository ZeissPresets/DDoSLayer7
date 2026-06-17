const safeModeChart = new Chart(document.getElementById('safeModeChart').getContext('2d'), {
    type: 'bar',
    data: { labels: ['Stability'], datasets: [{ label: 'Cooldown Progress', data: [0], backgroundColor: '#d29922', borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 6, grid: { display: false }, ticks: { display: false } }, y: { display: false } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
});

socket.on('ai_strategy_stats', (data) => {
    const aiStateDisplay = document.getElementById('aiStateDisplay');
    const vectorWeights = document.getElementById('vectorWeights');

    aiStateDisplay.textContent = data.core.state || "ANALYZING";
    aiStateDisplay.className = `status ${data.core.threatLevel > 5 ? 'active' : 'idle'}`;
    
    if (data.vectors) {
        vectorWeights.innerHTML = Object.entries(data.vectors)
            .map(([k, v]) => `<div class="weight-box">${k.toUpperCase()}: <b>${v.toFixed(2)}</b></div>`)
            .join('');
    }
});

socket.on('attack_progress', (stats) => {
    const smIndicator = document.getElementById('safeModeIndicator');
    const smChartContainer = document.getElementById('cooldownChartContainer');
    const bpFingerprint = document.getElementById('bpFingerprint');

    if (stats.safeMode) {
        smIndicator.style.display = 'block';
        smChartContainer.style.display = 'block';
        safeModeChart.data.datasets[0].data = [stats.safeModeCooldown || 0];
        safeModeChart.update();
    } else {
        smIndicator.style.display = 'none';
        smChartContainer.style.display = 'none';
    }

    if (stats.aiState) document.getElementById('aiStateDisplay').textContent = stats.aiState;
    bpFingerprint.textContent = stats.safeMode ? "Restricted" : "Ultra-Deep";
});