const axios = require('axios');
const UserAgent = require('user-agents');

const state = { success: 0, failure: 0 };
const userAgent = new UserAgent();
let backoffDelay = 1000; // Initial delay 1 second

function init(io) {
    const port = process.env.PORT || 3000;
    const host = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');

    const watchdog = async () => {
        const total = state.success + state.failure;
        const uptime = total > 0 ? (state.success / total) * 100 : 100;

        // Fitur Pemulihan (Uptime < 95%)
        if (uptime < 95) {
            for(let i=0; i<3; i++) {
                sendPing(host, io);
            }
            // Apply exponential backoff
            backoffDelay = Math.min(backoffDelay * 2, 30000); // Max 30 seconds
            setTimeout(watchdog, backoffDelay);
            return;
        }

        // Reset backoff delay if uptime is normal
        backoffDelay = 1000;
        await sendPing(host, io);
        setTimeout(watchdog, 10000);
    };

    watchdog();
}

async function sendPing(host, io) {
    try {
        await axios.get(`${host}/ping`, {
            timeout: 3000,
            params: { _cache: Date.now() },
            headers: { 
                'User-Agent': userAgent.random().toString(),
                'X-Watchdog-Mode': 'Recovery-High-Freq'
            }
        });
        state.success++;
    } catch (e) {
        state.failure++;
    }
    if (io) io.emit('watchdog_stats', state);
}

module.exports = { init };