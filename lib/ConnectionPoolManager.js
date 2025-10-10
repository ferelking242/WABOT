/**
 * ✅ CONNECTION POOL MANAGER
 * Gestionnaire des pools de connexions et résolution des conflits pour le système companion
 */

const chalk = require('chalk');

class ConnectionPoolManager {
    constructor() {
        // Pool de connexions et anti-conflit
        this.connectionPool = new Map(); // phoneNumber -> { sessionId, lastActivity, state }
        this.sessionStates = new Map(); // sessionId -> { state, lastUpdate, phoneNumber, retryCount }
        this.conflictResolver = new Map(); // phoneNumber -> resolving timestamp
        this.maxConnectionsPerPhone = 5; // OPTIMISÉ: Permettre plusieurs connexions par téléphone pour scaling
        this.connectionTimeout = 5 * 60 * 1000; // 5 minutes timeout
        
        console.log(chalk.blue('[POOL] ConnectionPoolManager initialized'));
        
        // Nettoyage périodique du pool de connexions (toutes les 30 secondes)
        setInterval(() => this.cleanupConnectionPool(), 30000);
    }

    /**
     * ✅ Vérifier et résoudre les conflits de connexion pour un numéro de téléphone
     */
    async checkConnectionConflicts(phoneNumber, newSessionId, activeSessions) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[POOL] Checking connection conflicts for phone ${cleanPhone}`));
        
        // Vérifier s'il y a déjà une connexion active pour ce numéro
        // Structure corrigée : Map<phone, Map<sessionId, connInfo>>
        let phoneConnections = this.connectionPool.get(cleanPhone) || new Map();
        const activeConnectionsForPhone = Array.from(phoneConnections.values())
            .filter(conn => activeSessions.has(conn.sessionId))
            .length;
        
        if (activeConnectionsForPhone >= this.maxConnectionsPerPhone) {
            console.log(chalk.yellow(`[POOL] ⚠️ Max connections (${this.maxConnectionsPerPhone}) reached for phone ${cleanPhone}`));
            
            // Trouver la connexion la plus ancienne à remplacer
            const connections = Array.from(phoneConnections.values());
            const oldestConnection = connections.sort((a, b) => a.lastActivity - b.lastActivity)[0];
            
            if (oldestConnection) {
                console.log(chalk.yellow(`[POOL] Replacing oldest connection ${oldestConnection.sessionId} with new ${newSessionId}`));
                phoneConnections.delete(oldestConnection.sessionId);
                phoneConnections.set(newSessionId, {
                    sessionId: newSessionId,
                    lastActivity: Date.now(),
                    state: 'connecting',
                    phoneNumber: cleanPhone
                });
                this.connectionPool.set(cleanPhone, phoneConnections);
                return { conflict: false, action: 'replaced_oldest' };
            }
        }
        
        // Ajouter la nouvelle connexion avec structure correcte
        if (!this.connectionPool.has(cleanPhone)) {
            this.connectionPool.set(cleanPhone, new Map());
            phoneConnections = this.connectionPool.get(cleanPhone);
        }
        phoneConnections.set(newSessionId, {
            sessionId: newSessionId,
            lastActivity: Date.now(),
            state: 'connecting',
            phoneNumber: cleanPhone
        });
        
        return { conflict: false, action: 'added_new' };
    }

    /**
     * ✅ Mettre à jour l'état d'une session dans le pool
     */
    updateSessionState(sessionId, state, phoneNumber = null) {
        console.log(chalk.blue(`[POOL] Updating session ${sessionId} state to ${state}`));
        
        // Mettre à jour l'état de la session
        const currentState = this.sessionStates.get(sessionId) || {};
        this.sessionStates.set(sessionId, {
            ...currentState,
            state: state,
            lastUpdate: Date.now(),
            phoneNumber: phoneNumber || currentState.phoneNumber,
            retryCount: state === 'connected' ? 0 : currentState.retryCount || 0
        });
        
        // Mettre à jour le pool de connexions si on a le numéro de téléphone
        const phone = phoneNumber || currentState.phoneNumber;
        if (phone) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const poolEntry = this.connectionPool.get(cleanPhone);
            if (poolEntry && poolEntry.sessionId === sessionId) {
                poolEntry.state = state;
                poolEntry.lastActivity = Date.now();
                this.connectionPool.set(cleanPhone, poolEntry);
            }
        }
    }

    /**
     * ✅ Nettoyer les entrées expirées du pool de connexions
     */
    cleanupConnectionPool() {
        const now = Date.now();
        let cleaned = 0;
        
        // Nettoyer les connexions expirées du pool
        for (const [phone, connection] of this.connectionPool.entries()) {
            if (now - connection.lastActivity > this.connectionTimeout) {
                console.log(chalk.yellow(`[POOL] Removing expired connection for phone ${phone} (session: ${connection.sessionId})`));
                this.connectionPool.delete(phone);
                cleaned++;
            }
        }
        
        // Nettoyer les états de session expirés
        for (const [sessionId, state] of this.sessionStates.entries()) {
            if (now - state.lastUpdate > this.connectionTimeout) {
                // Note: activeSessions check would need to be passed in for proper cleanup
                console.log(chalk.yellow(`[POOL] Removing expired session state for ${sessionId}`));
                this.sessionStates.delete(sessionId);
                cleaned++;
            }
        }
        
        // Nettoyer les résolveurs de conflit expirés
        for (const [phone, timestamp] of this.conflictResolver.entries()) {
            if (now - timestamp > 60000) { // 1 minute timeout pour résolution
                this.conflictResolver.delete(phone);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(chalk.green(`[POOL] Cleaned ${cleaned} expired entries from connection pool`));
        }
    }

    /**
     * ✅ Résoudre un conflit de session en cours
     */
    async resolveSessionConflict(phoneNumber, preferredSessionId = null, activeSessions, closeSessionCallback) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        
        // Éviter les résolutions concurrentes
        if (this.conflictResolver.has(cleanPhone)) {
            console.log(chalk.yellow(`[POOL] Conflict resolution already in progress for phone ${cleanPhone}`));
            return false;
        }
        
        this.conflictResolver.set(cleanPhone, Date.now());
        
        try {
            console.log(chalk.cyan(`[POOL] Resolving session conflict for phone ${cleanPhone}`));
            
            // Trouver toutes les sessions pour ce numéro
            const conflictingSessions = [];
            for (const [sessionId, session] of activeSessions.entries()) {
                const sessionState = this.sessionStates.get(sessionId);
                if (sessionState?.phoneNumber === cleanPhone) {
                    conflictingSessions.push({
                        sessionId,
                        session,
                        state: sessionState,
                        lastActivity: sessionState.lastUpdate
                    });
                }
            }
            
            if (conflictingSessions.length <= 1) {
                console.log(chalk.green(`[POOL] No conflict found for phone ${cleanPhone}`));
                return true;
            }
            
            console.log(chalk.red(`[POOL] Found ${conflictingSessions.length} conflicting sessions for phone ${cleanPhone}`));
            
            // Trier par préférence puis par activité récente
            conflictingSessions.sort((a, b) => {
                if (preferredSessionId) {
                    if (a.sessionId === preferredSessionId) return -1;
                    if (b.sessionId === preferredSessionId) return 1;
                }
                return b.lastActivity - a.lastActivity; // Plus récent en premier
            });
            
            // Garder la première session, fermer les autres
            const keepSession = conflictingSessions[0];
            const closeSessions = conflictingSessions.slice(1);
            
            console.log(chalk.green(`[POOL] Keeping session ${keepSession.sessionId}, closing ${closeSessions.length} others`));
            
            for (const sessionToClose of closeSessions) {
                console.log(chalk.yellow(`[POOL] Closing conflicting session ${sessionToClose.sessionId}`));
                if (closeSessionCallback) {
                    await closeSessionCallback(sessionToClose.sessionId);
                }
            }
            
            // Mettre à jour le pool avec la session conservée
            this.connectionPool.set(cleanPhone, {
                sessionId: keepSession.sessionId,
                lastActivity: Date.now(),
                state: keepSession.state.state
            });
            
            console.log(chalk.green(`[POOL] ✅ Conflict resolved for phone ${cleanPhone}, keeping ${keepSession.sessionId}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red(`[POOL] ❌ Error resolving conflict for phone ${cleanPhone}: ${error.message}`));
            return false;
        } finally {
            this.conflictResolver.delete(cleanPhone);
        }
    }

    /**
     * ✅ Vérifier la limite de connexions pour un numéro de téléphone
     */
    checkConnectionLimit(phoneNumber) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        let activeConnectionsForPhone = 0;
        
        for (const [phone, connection] of this.connectionPool.entries()) {
            if (phone === cleanPhone && connection.state === 'connected') {
                activeConnectionsForPhone++;
            }
        }
        
        return {
            current: activeConnectionsForPhone,
            limit: this.maxConnectionsPerPhone,
            limitReached: activeConnectionsForPhone >= this.maxConnectionsPerPhone
        };
    }

    /**
     * ✅ Obtenir les statistiques du pool
     */
    getPoolStats() {
        const totalConnections = this.connectionPool.size;
        const totalStates = this.sessionStates.size;
        const activeConflictResolutions = this.conflictResolver.size;
        
        const statesByStatus = {};
        for (const [, state] of this.sessionStates.entries()) {
            statesByStatus[state.state] = (statesByStatus[state.state] || 0) + 1;
        }
        
        return {
            totalConnections,
            totalStates,
            activeConflictResolutions,
            statesByStatus,
            maxConnectionsPerPhone: this.maxConnectionsPerPhone
        };
    }
}

module.exports = { ConnectionPoolManager };