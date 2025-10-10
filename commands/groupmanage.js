const { channelConfig } = require('../lib/channelConfig');

// Commandes de gestion de groupe
async function setGroupName(sock, chatId, message, newName) {
    try {
        if (!newName) {
            return await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier un nom\n\nUtilisation: .setname [nouveau nom]",
                ...channelConfig
            }, { quoted: message });
        }

        await sock.groupUpdateSubject(chatId, newName);
        await sock.sendMessage(chatId, {
            text: `✅ Nom du groupe changé en: *${newName}*`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error setting group name:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de changer le nom du groupe. Vérifiez que le bot est admin.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function setGroupDescription(sock, chatId, message, description) {
    try {
        if (!description) {
            return await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier une description\n\nUtilisation: .setdesc [nouvelle description]",
                ...channelConfig
            }, { quoted: message });
        }

        await sock.groupUpdateDescription(chatId, description);
        await sock.sendMessage(chatId, {
            text: `✅ Description du groupe mise à jour:\n\n*${description}*`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error setting group description:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de changer la description. Vérifiez que le bot est admin.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function setGroupSettings(sock, chatId, message, setting, value) {
    try {
        let settingText = '';
        let announcement = false;
        let restrict = false;

        switch (setting) {
            case 'open':
                announcement = false;
                restrict = false;
                settingText = 'Ouvert (tous peuvent envoyer des messages et modifier les infos)';
                break;
            case 'announce':
                announcement = true;
                restrict = false;
                settingText = 'Annonces uniquement (seuls les admins peuvent envoyer des messages)';
                break;
            case 'restrict':
                announcement = false;
                restrict = true;
                settingText = 'Restreint (seuls les admins peuvent modifier les infos du groupe)';
                break;
            case 'closed':
                announcement = true;
                restrict = true;
                settingText = 'Fermé (seuls les admins peuvent envoyer des messages et modifier les infos)';
                break;
            default:
                return await sock.sendMessage(chatId, {
                    text: "❌ Paramètre invalide\n\nUtilisations:\n• .groupsetting open - Ouvert\n• .groupsetting announce - Annonces seulement\n• .groupsetting restrict - Messages ouverts, infos restreintes\n• .groupsetting closed - Fermé",
                    ...channelConfig
                }, { quoted: message });
        }

        await sock.groupSettingUpdate(chatId, announcement ? 'announcement' : 'not_announcement');
        await sock.groupSettingUpdate(chatId, restrict ? 'locked' : 'unlocked');

        await sock.sendMessage(chatId, {
            text: `✅ Paramètres du groupe mis à jour:\n*${settingText}*`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error updating group settings:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de modifier les paramètres. Vérifiez que le bot est admin.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function setGroupIcon(sock, chatId, message) {
    try {
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage?.imageMessage) {
            return await sock.sendMessage(chatId, {
                text: "❌ Veuillez répondre à une image avec .seticon",
                ...channelConfig
            }, { quoted: message });
        }

        // Download the image
        const imageBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});
        
        await sock.updateProfilePicture(chatId, imageBuffer);
        await sock.sendMessage(chatId, {
            text: "✅ Photo de profil du groupe mise à jour !",
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error setting group icon:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de changer la photo. Vérifiez que le bot est admin et que l'image est valide.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function getGroupInfo(sock, chatId, message) {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const members = groupMetadata.participants.filter(p => !p.admin);

        let infoText = `*📊 INFORMATIONS DU GROUPE*\n\n`;
        infoText += `*Nom:* ${groupMetadata.subject}\n`;
        infoText += `*Description:* ${groupMetadata.desc || 'Aucune description'}\n`;
        infoText += `*Créé le:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n`;
        infoText += `*Créé par:* ${groupMetadata.owner ? '@' + groupMetadata.owner.split('@')[0] : 'Inconnu'}\n`;
        infoText += `*ID du groupe:* ${chatId}\n\n`;
        infoText += `*👥 Participants:* ${groupMetadata.participants.length}\n`;
        infoText += `*👑 Admins:* ${admins.length}\n`;
        infoText += `*👤 Membres:* ${members.length}\n\n`;
        
        if (groupMetadata.announce) {
            infoText += `*🔒 Mode:* Annonces uniquement\n`;
        } else {
            infoText += `*🔓 Mode:* Messages ouverts\n`;
        }
        
        if (groupMetadata.restrict) {
            infoText += `*⚙️ Modification des infos:* Admins seulement\n`;
        } else {
            infoText += `*⚙️ Modification des infos:* Tous les participants\n`;
        }

        await sock.sendMessage(chatId, {
            text: infoText,
            ...channelConfig,
            mentions: groupMetadata.owner ? [groupMetadata.owner] : []
        }, { quoted: message });
    } catch (error) {
        console.error('Error getting group info:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de récupérer les informations du groupe.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function leaveGroup(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, {
            text: "👋 Au revoir ! Le bot quitte le groupe...",
            ...channelConfig
        }, { quoted: message });
        
        setTimeout(async () => {
            await sock.groupLeave(chatId);
        }, 2000);
    } catch (error) {
        console.error('Error leaving group:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de quitter le groupe.",
            ...channelConfig
        }, { quoted: message });
    }
}

module.exports = {
    setGroupName,
    setGroupDescription,
    setGroupSettings,
    setGroupIcon,
    getGroupInfo,
    leaveGroup
};