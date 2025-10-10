const SerenaAI = require('../serena-assistant/core/SerenaAI');
const { database } = require('./database');
// Migration completed: now uses Supabase direct instead of ORM

/**
 * Module d'intégration de Serena dans le pipeline de messages WhatsApp
 * Gère les réponses automatiques intelligentes pour les Companions
 */
class SerenaIntegration {
    constructor() {
        this.activeSerenas = new Map(); // Cache des instances Serena actives
        this.lastCleanup = Date.now();
        this.cleanupInterval = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * Vérifie si un message doit être traité par Serena
     */
    async shouldProcessMessage(message, userJid, isGroupMsg, companion) {
        try {
            // Vérifier que c'est un companion qui a Serena activée
            if (!companion || !companion.companion_name) {
                return false;
            }

            // Vérifier que le message n'est pas une commande
            const messageText = message.message?.conversation || 
                               message.message?.extendedTextMessage?.text || '';
            
            if (messageText.startsWith('.') || messageText.startsWith('#')) {
                return false;
            }

            // Vérifier que Serena est activée pour ce companion
            const serena = await this.getOrCreateSerena(companion.companion_name);
            if (!serena || !serena.isEnabled()) {
                return false;
            }

            // Éviter les boucles (ne pas répondre aux messages du bot lui-même)
            if (message.key.fromMe) {
                return false;
            }

            // Messages vides ou médias uniquement
            if (!messageText || messageText.trim().length === 0) {
                return false;
            }

            // Messages très courts (emojis, etc.) - skip pour éviter le spam
            if (messageText.trim().length <= 3 && !/[a-zA-Z0-9]/.test(messageText)) {
                return false;
            }

            console.log(`✅ [SERENA-INTEGRATION] Message éligible pour traitement: ${companion.companion_name}`);
            return true;

        } catch (error) {
            console.error('❌ [SERENA-INTEGRATION] Erreur shouldProcessMessage:', error);
            return false;
        }
    }

    /**
     * Traite un message avec Serena et envoie la réponse
     */
    async processMessage(sock, message, userJid, isGroupMsg, companion) {
        try {
            const messageText = message.message?.conversation || 
                               message.message?.extendedTextMessage?.text || '';

            // Obtenir l'instance Serena
            const serena = await this.getOrCreateSerena(companion.companion_name);
            if (!serena) {
                console.warn(`⚠️ [SERENA-INTEGRATION] Impossible d'obtenir Serena pour ${companion.companion_name}`);
                return false;
            }

            // Préparer le contexte
            const context = {
                isGroupMsg,
                userJid,
                companionName: companion.companion_name,
                timestamp: Date.now(),
                includeProducts: this.shouldIncludeProducts(messageText)
            };

            console.log(`🤖 [SERENA-INTEGRATION] Traitement du message: "${messageText.substring(0, 50)}..."`);

            // Ajouter indicateur de frappe
            await this.showTyping(sock, userJid);

            // Générer la réponse
            const response = await serena.processMessage(userJid, messageText, context);

            if (response) {
                // Délai naturel pour rendre la réponse plus humaine
                const delay = this.calculateResponseDelay(response);
                await this.sleep(delay);

                // Envoyer la réponse
                await sock.sendMessage(userJid, { text: response });

                console.log(`✅ [SERENA-INTEGRATION] Réponse envoyée: "${response.substring(0, 50)}..."`);
                return true;
            } else {
                console.log(`ℹ️ [SERENA-INTEGRATION] Aucune réponse générée pour ce message`);
                return false;
            }

        } catch (error) {
            console.error('❌ [SERENA-INTEGRATION] Erreur processMessage:', error);
            
            // Envoyer un message d'erreur discret en cas de problème
            try {
                await sock.sendMessage(userJid, { 
                    text: "Désolé, je ne peux pas répondre pour le moment. Pouvez-vous réessayer ?" 
                });
            } catch (sendError) {
                console.error('❌ [SERENA-INTEGRATION] Impossible d\'envoyer le message d\'erreur:', sendError);
            }

            return false;
        }
    }

    /**
     * Obtient ou crée une instance Serena pour un companion
     */
    async getOrCreateSerena(companionName) {
        try {
            // Nettoyer le cache si nécessaire
            this.cleanupCache();

            // Vérifier le cache
            if (this.activeSerenas.has(companionName)) {
                const cached = this.activeSerenas.get(companionName);
                // Vérifier que l'instance est toujours valide (moins de 1 heure)
                if (Date.now() - cached.created < 60 * 60 * 1000) {
                    return cached.serena;
                } else {
                    this.activeSerenas.delete(companionName);
                }
            }

            // Créer une nouvelle instance
            const serena = new SerenaAI(companionName);
            await serena.initialize();

            // Mettre en cache
            this.activeSerenas.set(companionName, {
                serena,
                created: Date.now(),
                lastUsed: Date.now()
            });

            return serena;

        } catch (error) {
            console.error(`❌ [SERENA-INTEGRATION] Erreur getOrCreateSerena pour ${companionName}:`, error);
            return null;
        }
    }

    /**
     * Détermine si les produits doivent être inclus dans le contexte
     */
    shouldIncludeProducts(messageText) {
        const productKeywords = [
            'produit', 'product', 'prix', 'price', 'coût', 'cost', 'acheter', 'buy',
            'vendre', 'sell', 'catalogue', 'catalog', 'disponible', 'available',
            'stock', 'commande', 'order', 'service', 'offre', 'offer'
        ];

        return productKeywords.some(keyword => 
            messageText.toLowerCase().includes(keyword)
        );
    }

    /**
     * Affiche l'indicateur de frappe
     */
    async showTyping(sock, chatId) {
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
        } catch (error) {
            // Ignore les erreurs de présence
        }
    }

    /**
     * Calcule un délai de réponse naturel basé sur la longueur de la réponse
     */
    calculateResponseDelay(response) {
        const baseDelay = 1000; // 1 seconde minimum
        const charDelay = response.length * 20; // 20ms par caractère
        const maxDelay = 4000; // 4 secondes maximum

        return Math.min(baseDelay + charDelay, maxDelay);
    }

    /**
     * Utilitaire de sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Nettoie le cache des instances Serena
     */
    cleanupCache() {
        const now = Date.now();
        
        // Ne nettoyer qu'une fois par intervalle
        if (now - this.lastCleanup < this.cleanupInterval) {
            return;
        }

        const maxAge = 60 * 60 * 1000; // 1 heure
        
        for (const [companionName, data] of this.activeSerenas.entries()) {
            if (now - data.lastUsed > maxAge) {
                console.log(`🧹 [SERENA-INTEGRATION] Nettoyage cache Serena: ${companionName}`);
                this.activeSerenas.delete(companionName);
            }
        }

        this.lastCleanup = now;
    }

    /**
     * Met à jour le timestamp de dernière utilisation
     */
    updateLastUsed(companionName) {
        if (this.activeSerenas.has(companionName)) {
            this.activeSerenas.get(companionName).lastUsed = Date.now();
        }
    }

    /**
     * Méthode pour forcer le rechargement d'une configuration Serena
     */
    async reloadSerena(companionName) {
        this.activeSerenas.delete(companionName);
        return await this.getOrCreateSerena(companionName);
    }

    /**
     * Obtient les statistiques d'utilisation
     */
    getStats() {
        return {
            activeInstances: this.activeSerenas.size,
            instances: Array.from(this.activeSerenas.entries()).map(([name, data]) => ({
                companionName: name,
                created: new Date(data.created),
                lastUsed: new Date(data.lastUsed),
                age: Date.now() - data.created
            }))
        };
    }
}

// Instance singleton
const serenaIntegration = new SerenaIntegration();

/**
 * Fonction d'intégration principale à appeler depuis le gestionnaire de messages
 */
async function handleSerenaIntegration(sock, message, userJid, isGroupMsg, companion) {
    try {
        // Vérifier si le message doit être traité
        const shouldProcess = await serenaIntegration.shouldProcessMessage(
            message, userJid, isGroupMsg, companion
        );

        if (!shouldProcess) {
            return false;
        }

        // Traiter le message
        return await serenaIntegration.processMessage(
            sock, message, userJid, isGroupMsg, companion
        );

    } catch (error) {
        console.error('❌ [SERENA-INTEGRATION] Erreur handleSerenaIntegration:', error);
        return false;
    }
}

module.exports = {
    SerenaIntegration,
    handleSerenaIntegration,
    serenaIntegration
};