/**
 * Configuration centralisée pour les messages
 * Utilisé par toutes les commandes du bot
 */

// Configuration simple sans tags forward/channel
const channelConfig = {
    contextInfo: {
        // Configuration nettoyée - pas de forwarding/channel tags
    }
};

const externalChannelConfig = {
    contextInfo: {
        // Configuration nettoyée - pas de forwarding/channel tags
    }
};

module.exports = {
    channelConfig,
    externalChannelConfig
};