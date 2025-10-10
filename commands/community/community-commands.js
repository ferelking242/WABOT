/**
 * Commandes principales pour la gestion des communautés WhatsApp
 */

const { 
    isCommunity,
    getCommunityInfo,
    setCommunityDescription,
    setCommunityIcon,
    createCommunityChannel,
    listCommunityChannels,
    sendCommunityAnnouncement
} = require('./whatsapp-community');

const { channelConfig } = require('../../lib/channelConfig');

/**
 * Commande principale pour les communautés
 */
async function communityCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        if (!args || args.length === 0) {
            const helpMessage = `🏘️ *GESTION DES COMMUNAUTÉS WHATSAPP*\n\n` +
                              `📋 *COMMANDES DISPONIBLES:*\n\n` +
                              `• \`.community info\` - Informations de la communauté\n` +
                              `• \`.community setdesc [description]\` - Modifier la description\n` +
                              `• \`.community seticon\` - Modifier l'icône (avec image)\n` +
                              `• \`.community channels\` - Lister les canaux\n` +
                              `• \`.community announce [message]\` - Annonce à la communauté\n` +
                              `• \`.community help\` - Afficher cette aide\n\n` +
                              `💡 *NOTE:*\n` +
                              `Ces commandes fonctionnent uniquement dans les communautés WhatsApp,\n` +
                              `pas dans les groupes normaux.\n\n` +
                              `🔧 *POUR LES ADMINISTRATEURS SEULEMENT*`;

            await sock.sendMessage(chatId, {
                text: helpMessage,
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const command = args[0].toLowerCase();
        const additionalArgs = args.slice(1);

        switch (command) {
            case 'info':
                await getCommunityInfo(sock, chatId, message);
                break;

            case 'setdesc':
                const description = additionalArgs.join(' ');
                await setCommunityDescription(sock, chatId, message, description);
                break;

            case 'seticon':
                await setCommunityIcon(sock, chatId, message);
                break;

            case 'channels':
                await listCommunityChannels(sock, chatId, message);
                break;

            case 'announce':
                const announcement = additionalArgs.join(' ');
                await sendCommunityAnnouncement(sock, chatId, message, announcement);
                break;

            case 'help':
                await communityCommand(sock, chatId, message, []);
                break;

            default:
                await sock.sendMessage(chatId, {
                    text: `❌ Commande inconnue: ${command}\n\nUtilisez \`.community help\` pour voir toutes les commandes disponibles.`,
                    ...channelConfig
                }, { quoted: message });
                break;
        }

    } catch (error) {
        console.error('Erreur dans la commande community:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'exécution de la commande community.",
            ...channelConfig
        }, { quoted: message });
    }
}

module.exports = {
    name: 'community',
    description: 'Gérer les communautés WhatsApp',
    category: 'admin',
    usage: '.community [info|setdesc|seticon|channels|announce|help]',
    execute: communityCommand
};