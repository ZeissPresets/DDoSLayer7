class AIMonitor {
    constructor(io) {
        this.io = io;
        this.decisionHistory = [];
        this.maxDecisions = 50;
    }

    updateStrategy(aiEngine) {
        if (!aiEngine || !this.io) return;

        const strategy = {
            core: {
                state: aiEngine.state,
                threatLevel: aiEngine.threatLevel,
                learningRate: aiEngine.learningRate,
                confidence: this.calculateConfidence(aiEngine)
            },
            vectors: aiEngine.vectorWeights,
            analytics: {
                historySize: aiEngine.history.length,
                lastLatency: aiEngine.history.length > 0 ? aiEngine.history[aiEngine.history.length - 1].latency.toFixed(2) : 0,
                avgSuccess: this.calculateAvgSuccess(aiEngine)
            },
            mutation: this.getLastMutation(aiEngine)
        };

        this.io.emit('ai_strategy_stats', strategy);
        this.recordDecision(aiEngine);
    }

    calculateConfidence(ai) {
        // Menghitung seberapa yakin AI dengan strateginya (0.0 - 1.0)
        if (ai.history.length < 10) return 0.5;
        const recent = ai.history.slice(-10);
        const successVolatility = Math.abs(recent[0].successRate - recent[9].successRate);
        return (1 - successVolatility).toFixed(2);
    }

    calculateAvgSuccess(ai) {
        if (ai.history.length === 0) return 0;
        const sum = ai.history.reduce((a, b) => a + b.successRate, 0);
        return (sum / ai.history.length).toFixed(4);
    }

    recordDecision(ai) {
        const decision = {
            t: new Date().toLocaleTimeString(),
            s: ai.state,
            w: { ...ai.vectorWeights }
        };
        this.decisionHistory.push(decision);
        if (this.decisionHistory.length > this.maxDecisions) this.decisionHistory.shift();
    }

    getLastMutation(ai) {
        if (this.decisionHistory.length < 2) return "INITIALIZING";
        const last = this.decisionHistory[this.decisionHistory.length - 1];
        const prev = this.decisionHistory[this.decisionHistory.length - 2];
        
        if (last.s !== prev.s) return `STATE_SHIFT: ${prev.s} -> ${last.s}`;
        return "REFINING_WEIGHTS";
    }

    getVectorHeatmap() {
        // Digunakan untuk visualisasi radar chart di frontend
        if (this.decisionHistory.length === 0) return null;
        return this.decisionHistory[this.decisionHistory.length - 1].w;
    }

    getAILogs() {
        return this.decisionHistory.map(d => `[${d.t}] AI shifted to ${d.s} mode.`);
    }
}

module.exports = AIMonitor;