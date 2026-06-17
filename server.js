const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const validator = require('validator');
const { SecurityScanner } = require('./scanning/scanning');
const { DDoSL7 } = require('./attack/DDoSL7');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Endpoint API untuk memicu pemindaian keamanan secara remote.
 * Menerima JSON: { "url": "https://target.com" }
 */
app.post('/api/scan', async (req, res) => {
    const { url, duration } = req.body;

    if (!url || !validator.isURL(url, { require_protocol: true })) {
        return res.status(400).json({ 
            error: "URL target tidak valid. Pastikan menyertakan protokol (http/https)." 
        });
    }

    try {
        const scanner = new SecurityScanner(url, io, duration);
        
        // Jalankan scan di background agar tidak memblokir response HTTP
        scanner.startFullAudit().catch(err => console.error(`[Scanner Error] ${err.message}`));

        res.json({ 
            status: "Processing",
            message: "Deep scanning telah dimulai di latar belakang.",
            target: url 
        });
    } catch (error) {
        res.status(500).json({ error: "Gagal menginisialisasi scanner." });
    }
});

app.post('/api/attack', async (req, res) => {
    const { url, duration } = req.body;
    if (!url) return res.status(400).json({ error: "URL target diperlukan" });

    try {
        const attacker = new DDoSL7(url, duration, io);
        attacker.start();

        res.json({ 
            status: "Running",
            message: `Attack simulation dimulai selama ${duration}` 
        });
    } catch (error) {
        res.status(500).json({ error: "Gagal memulai simulasi attack" });
    }
});

io.on('connection', (socket) => {
    console.log('[Socket] Browser terhubung untuk monitoring.');
});

server.listen(PORT, () => {
    console.log(`[Server] Security Audit Tool aktif di http://localhost:${PORT}`);
});