const { i18n, getText, getUserLanguage } = require('../lib/i18n');
const settings = require('../config/settings');
const { rateLimiter } = require('../lib/rateLimiter');

/**
 * Commande .rate - Contrôle du système de limitation de taux (Propriétaire uniquement)
 * Usage: .rate on/off/status
 */
async function rateCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Vérifier si l'utilisateur est propriétaire (SEULEMENT propriétaire, pas sudo)
        const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
        const isOwner = senderId === ownerJid;
        if (!isOwner) {
            const errorMsg = userLang === 'fr' 
                ? '👑 Cette commande est réservée au propriétaire uniquement pour des raisons de sécurité.'
                : '👑 This command is reserved for the owner only for security reasons.';
            await sock.sendMessage(chatId, { text: errorMsg });
            return;
        }

        const action = args[0]?.toLowerCase();

        if (!action || !['on', 'off', 'status'].includes(action)) {
            const usageMsg = userLang === 'fr' 
                ? `🔧 *Contrôle du Rate Limiting*\n\n*Usage:*\n• \`.rate on\` - Activer le système\n• \`.rate off\` - Désactiver le système\n• \`.rate status\` - Voir l'état actuel\n\n*Statut actuel:* ${rateLimiter.isEnabled ? '✅ Activé' : '❌ Désactivé'}`
                : `🔧 *Rate Limiting Control*\n\n*Usage:*\n• \`.rate on\` - Enable system\n• \`.rate off\` - Disable system\n• \`.rate status\` - Check current status\n\n*Current Status:* ${rateLimiter.isEnabled ? '✅ Enabled' : '❌ Disabled'}`;
            
            await sock.sendMessage(chatId, { text: usageMsg });
            return;
        }

        switch (action) {
            case 'on':
                rateLimiter.enable();
                const onMsg = userLang === 'fr' 
                    ? '✅ **Système de Rate Limiting ACTIVÉ**\n\n🔒 Les limites de taux sont maintenant appliquées.\n📊 Utilisateurs VIP conservent leurs privilèges.\n👑 Propriétaire reste illimité.'
                    : '✅ **Rate Limiting System ENABLED**\n\n🔒 Rate limits are now enforced.\n📊 VIP users maintain their privileges.\n👑 Owner remains unlimited.';
                await sock.sendMessage(chatId, { text: onMsg });
                break;

            case 'off':
                rateLimiter.disable();
                const offMsg = userLang === 'fr'
                    ? '⚠️ **Système de Rate Limiting DÉSACTIVÉ**\n\n🚫 Toutes les limites de taux sont suspendues.\n⚡ Tous les utilisateurs ont un accès illimité.\n🛡️ Réactivez pour restaurer la protection anti-spam.'
                    : '⚠️ **Rate Limiting System DISABLED**\n\n🚫 All rate limits are suspended.\n⚡ All users have unlimited access.\n🛡️ Re-enable to restore anti-spam protection.';
                await sock.sendMessage(chatId, { text: offMsg });
                break;

            case 'status':
                const stats = rateLimiter.getGlobalStats();
                const statusMsg = userLang === 'fr'
                    ? `📊 **État du Rate Limiting**\n\n🔧 **Statut:** ${rateLimiter.isEnabled ? '✅ Activé' : '❌ Désactivé'}\n👥 **Utilisateurs actifs:** ${stats.activeUsers}\n📝 **Requêtes totales:** ${stats.totalRequests}\n🚫 **Requêtes bloquées:** ${stats.blockedRequests}\n⚡ **Utilisateurs VIP:** ${stats.vipUsers}\n\n🔄 **Dernière mise à jour:** ${new Date().toLocaleString('fr-FR')}`
                    : `📊 **Rate Limiting Status**\n\n🔧 **Status:** ${rateLimiter.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n👥 **Active users:** ${stats.activeUsers}\n📝 **Total requests:** ${stats.totalRequests}\n🚫 **Blocked requests:** ${stats.blockedRequests}\n⚡ **VIP users:** ${stats.vipUsers}\n\n🔄 **Last update:** ${new Date().toLocaleString('en-US')}`;
                await sock.sendMessage(chatId, { text: statusMsg });
                break;
        }

    } catch (error) {
        console.error('Error in rate command:', error);
        const errorMsg = i18n.t(message.key.participantAlt || message.key.participant || message.key.remoteJid, 'messages.processing_error');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = rateCommand;