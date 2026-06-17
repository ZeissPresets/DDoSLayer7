require('./module/optimalization');
const express = require('express');
const optimizer = require('./module/optimalization'); // Import optimizer
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const validator = require('validator');
const { SecurityScanner } = require('./scanning/scanning');
const { DDoSL7 } = require('./attack/DDoSL7');
const AttackManager = require('./module/attackManager');
const MemoryManager = require('./module/memoryManager');
const SystemMonitor = require('./module/sysMonitor');
require('./module/proxy');
const serveron = require('./module/serveron');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000; // Railway akan menyediakan PORT secara otomatis

const memoryManager = new MemoryManager(io);
const sysMonitor = new SystemMonitor(io);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Security Audit Tool aktif di port: ${PORT}`);
    
    // Jalankan modul berat setelah server berhasil bind ke port
    setTimeout(() => {
        AttackManager.init(io);
        optimizer.setAttackManager(AttackManager);
        memoryManager.start();
        sysMonitor.start();
        serveron.init(io);
    }, 1000); 
});

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

    socket.on('change_performance_mode', (mode) => {
        optimizer.setPerformanceMode(mode);
    });
});