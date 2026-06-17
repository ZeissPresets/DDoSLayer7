/**
 * module/attackManager.js
 * Mengelola persistensi serangan di latar belakang.
 */

const activeAttacks = new Map();

class AttackManager {
    static register(url, instance) {
        activeAttacks.set(url, instance);
    }

    static stop(url) {
        const instance = activeAttacks.get(url);
        if (instance) {
            instance.stop();
            activeAttacks.delete(url);
            return true;
        }
        return false;
    }

    static remove(url) {
        activeAttacks.delete(url);
    }
}

module.exports = AttackManager;