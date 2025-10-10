/**
 * ✅ SESSION STATE MANAGER
 * Gestionnaire intelligent des états de session avec cache TTL
 */

const chalk = require('chalk');

class SessionStateManager {
    constructor() {
        // Cache intelligent pour les états
        this.sessionCache = new Map(); // sessionId -> cached state with TTL
        this.stateHistory = new Map(); // sessionId -> array of state changes
        this.cacheTTL = 2 * 60 * 1000; // 2 minutes TTL pour le cache
        this.maxHistoryEntries = 10; // Garder les 10 derniers changements d'état
        
        console.log(chalk.blue('[STATE] SessionStateManager initialized'));
        
        // Nettoyage périodique du cache (toutes les minutes)
        setInterval(() => this.cleanupCache(), 60000);
    }

    /**
     * ✅ Mettre à jour l'état d'une session avec cache intelligent
     */
    updateSessionState(sessionId, state, metadata = {}) {
        const now = Date.now();
        
        console.log(chalk.blue(`[STATE] Updating session ${sessionId} state to ${state}`));
        
        // Mettre à jour le cache avec TTL
        this.sessionCache.set(sessionId, {
            state,
            metadata,
            lastUpdate: now,
            expiresAt: now + this.cacheTTL
        });
        
        // Ajouter à l'historique des états
        if (!this.stateHistory.has(sessionId)) {
            this.stateHistory.set(sessionId, []);
        }
        
        const history = this.stateHistory.get(sessionId);
        history.push({
            state,
            metadata,
            timestamp: now
        });
        
        // Limiter la taille de l'historique
        if (history.length > this.maxHistoryEntries) {
            history.splice(0, history.length - this.maxHistoryEntries);
        }
        
        this.stateHistory.set(sessionId, history);
    }

    /**
     * ✅ Récupérer l'état d'une session depuis le cache
     */
    getSessionState(sessionId) {
        const cached = this.sessionCache.get(sessionId);
        
        if (!cached) {
            return null;
        }
        
        // Vérifier si le cache a expiré
        if (Date.now() > cached.expiresAt) {
            console.log(chalk.yellow(`[STATE] Cache expired for session ${sessionId}, removing`));
            this.sessionCache.delete(sessionId);
            return null;
        }
        
        return cached;
    }

    /**
     * ✅ Récupérer l'historique des états d'une session
     */
    getSessionHistory(sessionId) {
        return this.stateHistory.get(sessionId) || [];
    }

    /**
     * ✅ Nettoyer le cache expiré
     */
    cleanupCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [sessionId, cached] of this.sessionCache.entries()) {
            if (now > cached.expiresAt) {
                this.sessionCache.delete(sessionId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(chalk.green(`[STATE] Cleaned ${cleaned} expired cache entries`));
        }
    }

    /**
     * ✅ Obtenir les statistiques des états
     */
    getStateStats() {
        const totalCached = this.sessionCache.size;
        const totalHistories = this.stateHistory.size;
        
        const statesByStatus = {};
        for (const [, cached] of this.sessionCache.entries()) {
            statesByStatus[cached.state] = (statesByStatus[cached.state] || 0) + 1;
        }
        
        return {
            totalCached,
            totalHistories,
            statesByStatus,
            cacheTTL: this.cacheTTL
        };
    }

    /**
     * ✅ Supprimer toutes les données d'une session
     */
    removeSession(sessionId) {
        const hadCache = this.sessionCache.has(sessionId);
        const hadHistory = this.stateHistory.has(sessionId);
        
        this.sessionCache.delete(sessionId);
        this.stateHistory.delete(sessionId);
        
        if (hadCache || hadHistory) {
            console.log(chalk.yellow(`[STATE] Removed session ${sessionId} from cache and history`));
        }
        
        return { hadCache, hadHistory };
    }

    /**
     * ✅ Vérifier si une session a un état spécifique
     */
    hasState(sessionId, expectedState) {
        const cached = this.getSessionState(sessionId);
        return cached && cached.state === expectedState;
    }

    /**
     * ✅ Obtenir toutes les sessions avec un état donné
     */
    getSessionsByState(targetState) {
        const sessions = [];
        
        for (const [sessionId, cached] of this.sessionCache.entries()) {
            if (cached.state === targetState && Date.now() <= cached.expiresAt) {
                sessions.push({
                    sessionId,
                    state: cached.state,
                    metadata: cached.metadata,
                    lastUpdate: cached.lastUpdate
                });
            }
        }
        
        return sessions;
    }

    /**
     * ✅ Prolonger le TTL d'une session (pour les sessions actives)
     */
    extendSessionTTL(sessionId) {
        const cached = this.sessionCache.get(sessionId);
        if (cached) {
            cached.expiresAt = Date.now() + this.cacheTTL;
            console.log(chalk.blue(`[STATE] Extended TTL for session ${sessionId}`));
            return true;
        }
        return false;
    }
}

module.exports = { SessionStateManager };