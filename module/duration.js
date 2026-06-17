/**
 * module/duration.js
 * Modul utilitas untuk menangani logika waktu, konversi durasi, 
 * dan kalkulasi progres untuk tugas asinkron backend.
 */

class DurationManager {
    /**
     * Mengonversi string durasi menjadi milidetik.
     * Mendukung format: 's' (detik), 'm' (menit), 'h' (jam), 'd' (hari).
     * @param {string|number} durationStr - Durasi (contoh: '5m', '1h')
     * @returns {number} Durasi dalam milidetik
     */
    static parseToMs(durationStr) {
        if (typeof durationStr === 'number') return durationStr;
        if (!durationStr) return 60000; // Default 1 menit (60000 ms)

        const value = parseInt(durationStr);
        const unit = durationStr.toLowerCase().match(/[a-z]/g)?.join('') || 'm';

        const multipliers = {
            's': 1000,
            'm': 60000,
            'h': 3600000,
            'd': 86400000
        };

        return value * (multipliers[unit] || 60000);
    }

    /**
     * Menghitung persentase progres waktu yang telah berlalu.
     * @param {number} startTime - Timestamp waktu mulai (Date.now())
     * @param {number} durationMs - Total durasi dalam milidetik
     * @returns {string} Progres dalam string persentase (0.00 - 100.00)
     */
    static getProgress(startTime, durationMs) {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed / durationMs) * 100;
        return Math.min(Math.max(progress, 0), 100).toFixed(2);
    }

    /**
     * Memeriksa apakah waktu tugas sudah berakhir.
     */
    static isExpired(startTime, durationMs) {
        return Date.now() >= (startTime + durationMs);
    }
}

module.exports = DurationManager;