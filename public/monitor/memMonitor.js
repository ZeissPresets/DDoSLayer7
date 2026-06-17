socket.on('memory_stats', (data) => {
    const memoryText = document.getElementById('memoryText');
    const memoryBar = document.getElementById('memoryBar');
    const memoryStatus = document.getElementById('memoryStatus');

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

socket.on('clear_internal_caches', () => {
    console.log('[MEM-FRONTEND] UI notified of internal cache cleanup.');
});