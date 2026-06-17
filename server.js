const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const validator = require('validator');
const { SecurityScanner } = require('./scanning/scanning');
const { DDoSL7 } = require('./attack/DDoSL7');
const AttackManager = require('./module/attackManager');
const MemoryManager = require('./module/memoryManager');
require('./module/proxy');
const serveron = require('./module/serveron');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const memoryManager = new MemoryManager(io);
AttackManager.init(io);
memoryManager.start();
serveron.init(io);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/ping', (req, res) => res.send('pong'));

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
        AttackManager.register('scan', url, scanner, duration);
        
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
        AttackManager.register('attack', url, attacker, duration);
        attacker.start();

        res.json({ 
            status: "Running",
            message: `Attack simulation dimulai selama ${duration}` 
        });
    } catch (error) {
        res.status(500).json({ error: "Gagal memulai simulasi attack" });
    }
});

app.post('/api/attack/stop', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL target diperlukan" });

    const stopped = AttackManager.stop(url);
    if (stopped) {
        res.json({ message: "Serangan dihentikan secara paksa." });
    } else {
        res.status(404).json({ error: "Tidak ada serangan aktif untuk URL ini." });
    }
});

io.on('connection', (socket) => {
    console.log('[Socket] Browser terhubung untuk monitoring.');
    AttackManager.syncClient(socket);
});

server.listen(PORT, () => {
    console.log(`[Server] Security Audit Tool aktif di http://localhost:${PORT}`);
});