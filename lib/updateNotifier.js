/**
 * Système de Notifications de Mises à Jour
 * Vérifie périodiquement les nouvelles versions et notifie les propriétaires
 */

const versionManager = require('./versionManager');
const settings = require('../config/settings');
const fs = require('fs');
const path = require('path');

class UpdateNotifier {
    constructor() {
        this.isRunning = false;
        this.checkInterval = null;
        this.lastNotifiedVersion = null;
        this.configFile = path.join(process.cwd(), 'data', 'update_notifications.json');
        this.config = this.loadConfig();
        
        // Configuration par défaut
        this.defaultConfig = {
            enabled: false,
            checkIntervalMinutes: 360, // 6 heures par défaut
            notifyOwners: true,
            notifyPreReleases: false,
            lastCheck: null,
            lastNotifiedVersion: null,
            autoUpdateEnabled: false
        };
    }

    /**
     * Charge la configuration depuis le fichier
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = fs.readFileSync(this.configFile, 'utf8');
                return { ...this.defaultConfig, ...JSON.parse(data) };
            }
        } catch (error) {
            console.warn('Erreur lors du chargement de la config notifications:', error.message);
        }
        return { ...this.defaultConfig };
    }

    /**
     * Sauvegarde la configuration dans le fichier
     */
    saveConfig() {
        try {
            // Créer le dossier data s'il n'existe pas
            const dataDir = path.dirname(this.configFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la config notifications:', error.message);
        }
    }

    /**
     * Démarre le système de vérification automatique
     */
    start() {
        if (this.isRunning) {
            console.log(`✅ Système de notifications déjà en cours d'exécution (config: ${this.config.enabled ? 'activé' : 'désactivé'})`);
            return;
        }

        if (!this.config.enabled) {
            // Système de notifications désactivé - démarrage silencieux
            return;
        }

        const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
        console.log(`🔔 Démarrage du système de notifications (activé - vérification toutes les ${this.config.checkIntervalMinutes} minutes)`);
        
        this.isRunning = true;
        
        // Première vérification après 5 minutes
        setTimeout(() => {
            if (this.isRunning) {
                this.checkForUpdates();
            }
        }, 5 * 60 * 1000);
        
        // Vérifications périodiques
        this.checkInterval = setInterval(() => {
            if (this.isRunning) {
                this.checkForUpdates();
            }
        }, intervalMs);
    }

    /**
     * Arrête le système de vérification automatique
     */
    stop() {
        if (!this.isRunning) {
            console.log(`💤 Système de notifications déjà arrêté (config: ${this.config.enabled ? 'activé' : 'désactivé'})`);
            return;
        }

        console.log(`🔕 Arrêt du système de notifications (config reste: ${this.config.enabled ? 'activé' : 'désactivé'})`);
        this.isRunning = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Vérifie s'il y a de nouvelles mises à jour
     */
    async checkForUpdates() {
        try {
            console.log(`🔍 Vérification automatique des mises à jour (intervalle: ${this.config.checkIntervalMinutes}min)...`);
            
            const updateInfo = await versionManager.checkForUpdates();
            this.config.lastCheck = new Date().toISOString();
            
            if (updateInfo.hasUpdate) {
                const newVersion = updateInfo.latestVersion;
                
                // Vérifier si on a déjà notifié cette version
                if (this.config.lastNotifiedVersion !== newVersion) {
                    // Vérifier si c'est une pré-release et si on doit notifier
                    const shouldNotify = !updateInfo.releaseInfo.isPrerelease || this.config.notifyPreReleases;
                    
                    if (shouldNotify) {
                        await this.sendUpdateNotification(updateInfo);
                        this.config.lastNotifiedVersion = newVersion;
                        console.log(`🔔 Notification envoyée pour la version ${newVersion}`);
                    } else {
                        console.log(`⚠️ Version ${newVersion} est une pré-release, notification ignorée`);
                    }
                }
            } else {
                console.log('✅ Aucune nouvelle mise à jour disponible');
            }
            
            this.saveConfig();
            
        } catch (error) {
            console.error('❌ Erreur lors de la vérification des mises à jour:', error.message);
        }
    }

    /**
     * Envoie une notification de mise à jour aux propriétaires
     */
    async sendUpdateNotification(updateInfo, sock = null) {
        try {
            if (!sock) {
                // Si pas de socket fourni, essayer de récupérer le socket global
                sock = global.sock || global.XeonBotInc;
            }
            
            if (!sock) {
                console.warn('⚠️ Aucun socket disponible pour envoyer la notification');
                return;
            }

            const releaseInfo = updateInfo.releaseInfo;
            const changelog = versionManager.formatChangelog(releaseInfo.body, releaseInfo.name);
            
            const notificationText = '🆕 **NOUVELLE MISE À JOUR DISPONIBLE**\n\n' +
                '📦 Version actuelle: ' + updateInfo.currentVersion + '\n' +
                '🚀 Nouvelle version: ' + updateInfo.latestVersion + '\n' +
                '📅 Publiée le: ' + new Date(releaseInfo.publishedAt).toLocaleDateString('fr-FR') + '\n\n' +
                changelog + '\n\n' +
                '🔗 Voir sur GitHub: ' + releaseInfo.htmlUrl + '\n\n' +
                '💡 **Commandes utiles:**\n' +
                '• .update info - Voir les détails\n' +
                '• .update now - Installer la mise à jour\n' +
                '• .update notify off - Désactiver ces notifications';

            // Envoyer à tous les propriétaires
            const ownerNumbers = [settings.ownerNumber];
            
            for (const ownerNumber of ownerNumbers) {
                if (ownerNumber) {
                    const ownerId = ownerNumber.includes('@s.whatsapp.net') ? 
                        ownerNumber : ownerNumber + '@s.whatsapp.net';
                    
                    try {
                        await sock.sendMessage(ownerId, {
                            text: notificationText
                        });
                        console.log(`✅ Notification envoyée à ${ownerNumber}`);
                    } catch (error) {
                        console.error(`❌ Erreur envoi notification à ${ownerNumber}:`, error.message);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi des notifications:', error.message);
        }
    }

    /**
     * Configure les notifications
     */
    configure(options) {
        const oldEnabled = this.config.enabled;
        
        // Mettre à jour la configuration
        Object.assign(this.config, options);
        this.saveConfig();
        
        // Redémarrer si nécessaire
        if (this.config.enabled && !oldEnabled) {
            console.log('⚡ Configuration changée: notifications activées - redémarrage du système');
            this.start();
        } else if (!this.config.enabled && oldEnabled) {
            console.log('⏸️ Configuration changée: notifications désactivées - arrêt du système');
            this.stop();
        } else if (this.config.enabled && this.isRunning) {
            console.log('🔄 Configuration mise à jour - système déjà en cours d\'exécution');
            // Redémarrer avec le nouvel interval
            this.stop();
            setTimeout(() => this.start(), 1000);
        }
    }

    /**
     * Obtient le statut actuel du système
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            running: this.isRunning,
            checkIntervalMinutes: this.config.checkIntervalMinutes,
            notifyOwners: this.config.notifyOwners,
            notifyPreReleases: this.config.notifyPreReleases,
            lastCheck: this.config.lastCheck,
            lastNotifiedVersion: this.config.lastNotifiedVersion,
            autoUpdateEnabled: this.config.autoUpdateEnabled,
            nextCheckIn: this.isRunning && this.checkInterval ? 
                Math.round((this.config.checkIntervalMinutes * 60 * 1000 - (Date.now() % (this.config.checkIntervalMinutes * 60 * 1000))) / 1000 / 60) : 
                null
        };
    }

    /**
     * Force une vérification manuelle
     */
    async forceCheck(sock = null) {
        console.log(`🔍 Vérification manuelle des mises à jour (système: ${this.config.enabled ? 'activé' : 'désactivé'})...`);
        
        if (sock) {
            // Stocker temporairement le socket pour les notifications
            const oldSock = global.sock;
            global.sock = sock;
            await this.checkForUpdates();
            global.sock = oldSock;
        } else {
            await this.checkForUpdates();
        }
    }

    /**
     * Réinitialise les notifications (pour re-notifier la version actuelle)
     */
    resetNotifications() {
        this.config.lastNotifiedVersion = null;
        this.saveConfig();
        console.log(`🔄 État des notifications réinitialisé (système: ${this.config.enabled ? 'activé' : 'désactivé'})`);
    }
}

// Instance singleton
const updateNotifier = new UpdateNotifier();

module.exports = updateNotifier;