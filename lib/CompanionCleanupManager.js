/**
 * ✅ COMPANION CLEANUP MANAGER
 * Système de nettoyage automatique avancé pour les companions
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class CompanionCleanupManager {
    constructor(database) {
        this.db = database;
        this.cleanupNotifications = new Set(); // Track notifications already sent
        this.lastCleanupTime = 0;
        this.cleanupInterval = 15 * 60 * 1000; // 15 minutes
        this.orphanTimeout = 10 * 60 * 1000; // 10 minutes pour considérer orphelin
        
        // Démarrer le nettoyage automatique silencieusement
        setTimeout(() => this.performAutomaticCleanup(), 5000);
        setInterval(() => this.performAutomaticCleanup(), this.cleanupInterval);
    }

    /**
     * ✅ Effectuer un nettoyage automatique complet
     */
    async performAutomaticCleanup() {
        const startTime = Date.now();
        // Nettoyage automatique en cours (logs réduits)
        
        const results = {
            orphanedCompanions: 0,
            corruptedSessions: 0,
            expiredSessions: 0,
            ownersNotified: new Set()
        };
        
        try {
            // 1. Nettoyer les companions orphelins en DB
            await this.cleanupOrphanedCompanionsInDB(results);
            
            // 2. Scanner et nettoyer les sessions corrompues/expirées
            await this.scanAndCleanupSessions(results);
            
            // 3. Re-synchroniser l'état en mémoire
            this.resyncMemoryState(results);
            
        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Error during cleanup: ${error.message}`));
        }
        
        const duration = Date.now() - startTime;
        this.lastCleanupTime = Date.now();
        
        // Nettoyage terminé (logs réduits pour éviter le spam)
        
        return results;
    }

    /**
     * ✅ Nettoyer les companions orphelins en base de données
     */
    async cleanupOrphanedCompanionsInDB(results) {
        // Recherche silencieuse
        
        try {
            const { data: orphanedCompanions, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('status', 'initializing')
                .lt('created_at', new Date(Date.now() - this.orphanTimeout).toISOString());
            
            if (error) {
                console.error(chalk.red(`[AUTO-CLEANUP] Erreur lors de la recherche d'orphelins: ${error.message}`));
                return;
            }
            
            if (!orphanedCompanions || orphanedCompanions.length === 0) {
                // Aucun companion orphelin trouvé
                return;
            }
            
            console.log(chalk.yellow(`[AUTO-CLEANUP] 🧹 ${orphanedCompanions.length} companion(s) orphelin(s) trouvé(s) en DB`));
            
            for (const orphan of orphanedCompanions) {
                try {
                    // Supprimer de la DB
                    const { error: deleteError } = await this.db.supabase
                        .from('companions')
                        .delete()
                        .eq('user_id', orphan.user_id);
                    
                    if (deleteError) {
                        console.error(chalk.red(`[AUTO-CLEANUP] Erreur suppression orphelin ${orphan.companion_name}: ${deleteError.message}`));
                        continue;
                    }
                    
                    console.log(chalk.green(`[AUTO-CLEANUP] ✅ Companion orphelin supprimé de DB: ${orphan.companion_name}`));
                    results.orphanedCompanions++;
                    results.ownersNotified.add(orphan.owner_jid);
                    
                } catch (cleanupError) {
                    console.error(chalk.red(`[AUTO-CLEANUP] Erreur lors du nettoyage de ${orphan.companion_name}: ${cleanupError.message}`));
                }
            }
            
        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] Erreur générale lors de la recherche d'orphelins: ${error.message}`));
        }
    }

    /**
     * ✅ Scanner et nettoyer les sessions corrompues/expirées
     */
    async scanAndCleanupSessions(results) {
        // Scan silencieux
        
        const sessionsDir = './sessions';
        if (!fs.existsSync(sessionsDir)) {
            console.log(chalk.green(`[AUTO-CLEANUP] ✅ Dossier sessions n'existe pas, rien à nettoyer`));
            return;
        }
        
        try {
            const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
            const companionSessions = entries.filter(entry => 
                entry.isDirectory() && entry.name.startsWith('companion-')
            );
            
            // Scan silencieux sauf si vraiment nécessaire
            if (companionSessions.length > 0) {
                console.log(chalk.blue(`[AUTO-CLEANUP] ${companionSessions.length} dossier(s) companion trouvé(s)`));
            }
            
            for (const sessionDir of companionSessions) {
                const sessionPath = path.join(sessionsDir, sessionDir.name);
                const sessionName = sessionDir.name;
                
                try {
                    await this.checkAndCleanupSession(sessionPath, sessionName, results);
                } catch (sessionError) {
                    console.error(chalk.red(`[AUTO-CLEANUP] Erreur lors du scan de ${sessionName}: ${sessionError.message}`));
                }
            }
            
        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] Erreur lors du scan des sessions: ${error.message}`));
        }
        
        // Scan terminé silencieusement
    }

    /**
     * ✅ Vérifier et nettoyer une session individuelle
     */
    async checkAndCleanupSession(sessionPath, sessionName, results) {
        const credsPath = path.join(sessionPath, 'creds.json');
        const stats = fs.statSync(sessionPath);
        const sessionAge = Date.now() - stats.mtime.getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 heures
        
        // Vérifier si c'est une session corrompue
        if (!fs.existsSync(credsPath)) {
            if (sessionAge > 60 * 60 * 1000) { // Plus d'1 heure sans creds.json
                console.log(chalk.yellow(`[AUTO-CLEANUP] 🗑️ Session corrompue (pas de creds.json): ${sessionName}`));
                this.removeSessionDirectory(sessionPath, sessionName);
                results.corruptedSessions++;
                return;
            }
            return; // Session récente, peut être en cours de création
        }
        
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            
            // Session non enregistrée et ancienne
            if (!creds.registered && sessionAge > maxAge) {
                console.log(chalk.yellow(`[AUTO-CLEANUP] 🗑️ Session expirée non-enregistrée: ${sessionName}`));
                this.removeSessionDirectory(sessionPath, sessionName);
                results.expiredSessions++;
                
                // Si c'est une session corrompue avec un nom valide, essayer de trouver le propriétaire
                const companionName = sessionName.replace('companion-', '');
                const dbCompanion = await this.getCompanionConfigFromDB(companionName);
                if (dbCompanion) {
                    results.ownersNotified.add(dbCompanion.owner_jid);
                    // Marquer comme disconnected en DB
                    await this.updateCompanionStatusInDB(dbCompanion.user_id, 'disconnected');
                }
            }
            
        } catch (parseError) {
            // creds.json corrompu
            console.log(chalk.yellow(`[AUTO-CLEANUP] 🗑️ Session avec creds.json corrompu: ${sessionName}`));
            this.removeSessionDirectory(sessionPath, sessionName);
            results.corruptedSessions++;
        }
    }

    /**
     * ✅ Supprimer un dossier de session
     */
    removeSessionDirectory(sessionPath, sessionName) {
        try {
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(chalk.green(`[AUTO-CLEANUP] ✅ Session supprimée: ${sessionName}`));
            }
        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] Erreur suppression ${sessionName}: ${error.message}`));
        }
    }

    /**
     * ✅ Re-synchroniser l'état en mémoire
     */
    resyncMemoryState(results) {
        // Re-synchronisation silencieuse
    }

    /**
     * ✅ Nettoyage d'urgence d'un companion spécifique
     */
    async performEmergencyCleanup(sessionId, sessionPath, companionName, reason = 'emergency') {
        console.log(chalk.red(`[CLEANUP] 🚨 Emergency cleanup for ${companionName}: ${reason}`));
        
        try {
            // Supprimer les fichiers de session
            if (sessionPath && fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(chalk.green(`[CLEANUP] ✅ Session files removed: ${sessionPath}`));
            }
            
            // Marquer comme failed en DB si possible
            try {
                await this.updateCompanionStatusInDB(sessionId, 'failed');
            } catch (dbError) {
                console.log(chalk.yellow(`[CLEANUP] Could not update DB status: ${dbError.message}`));
            }
            
            console.log(chalk.green(`[CLEANUP] ✅ Emergency cleanup completed for ${companionName}`));
            return true;
            
        } catch (error) {
            console.error(chalk.red(`[CLEANUP] ❌ Emergency cleanup failed for ${companionName}: ${error.message}`));
            return false;
        }
    }

    /**
     * ✅ Obtenir les statistiques de nettoyage
     */
    getCleanupStats() {
        return {
            lastCleanupTime: this.lastCleanupTime,
            timeSinceLastCleanup: this.lastCleanupTime ? Date.now() - this.lastCleanupTime : null,
            cleanupInterval: this.cleanupInterval,
            orphanTimeout: this.orphanTimeout,
            notificationsSent: this.cleanupNotifications.size
        };
    }

    // Méthodes à implémenter par le CompanionSessionManager
    async getCompanionConfigFromDB(companionName) {
        throw new Error('getCompanionConfigFromDB must be implemented by parent class');
    }

    async updateCompanionStatusInDB(sessionId, status) {
        throw new Error('updateCompanionStatusInDB must be implemented by parent class');
    }
}

module.exports = { CompanionCleanupManager };