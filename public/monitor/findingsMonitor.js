socket.on('vulnerability', (issue) => {
    const findingsList = document.getElementById('findingsList');
    const div = document.createElement('div');
    div.className = `finding-item`;
    div.style.padding = '10px';
    div.style.marginBottom = '8px';
    div.style.borderLeft = `4px solid ${issue.severity === 'Critical' || issue.severity === 'High' ? '#da3633' : '#d29922'}`;
    div.style.background = '#1c2128';
    div.innerHTML = `<strong>[${issue.severity}]</strong> ${issue.description} <br>
                     <small style="color: #58a6ff;">Target: ${issue.url}</small><br>
                     <small style="display:block; color:#8b949e; margin-top:4px">Detected at: ${new Date(issue.detectedAt).toLocaleTimeString()}</small>`;
    findingsList.prepend(div);
});