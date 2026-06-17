const axios = require('axios');
const UserAgent = require('user-agents');

const state = { success: 0, failure: 0 };
const userAgent = new UserAgent();

function init(io) {
    const port = process.env.PORT || 3000;
    const host = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');

    const watchdog = async () => {
        try {
            await axios.get(`${host}/ping`, {
                timeout: 8000,
                params: { 
                    _cache: Date.now(),
                    uptime: process.uptime().toFixed(0)
                },
                headers: { 
                    'User-Agent': userAgent.random().toString(),
                    'X-Watchdog-Mode': 'Keep-Alive'
                }
            });
            state.success++;
        } catch (e) {
            state.failure++;
        }

        if (io) {
            io.emit('watchdog_stats', state);
        }
    };

    setInterval(watchdog, 10000);
}

module.exports = { init };