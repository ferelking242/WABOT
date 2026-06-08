const isAdmin = require('../../lib/isAdmin');
const { i18n } = require('../../lib/i18n');

async function kickCommand(sock, chatId, senderId, mentionedJids, message) {
    const messageSenderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    
    // Check if user is owner/sudo
    const isOwnerOrSudo = require('../../lib/isOwner');
    const hasOwnerPermission = await isOwnerOrSudo(senderId);
    if (!hasOwnerPermission) {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: i18n.t(messageSenderId, 'admin.bot_admin_first') }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: i18n.t(messageSenderId, 'admin.admin_only_kick') }, { quoted: message });
            return;
        }
    }

    let usersToKick = [];
    
    // Check for mentioned users
    if (mentionedJids && mentionedJids.length > 0) {
        usersToKick = mentionedJids;
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        usersToKick = [message.message.extendedTextMessage.contextInfo.participant];
    }
    
    // If no user found through either method
    if (usersToKick.length === 0) {
        await sock.sendMessage(chatId, { 
            text: i18n.t(messageSenderId, 'admin.mention_or_reply')
        }, { quoted: message });
        return;
    }

    // Get bot's ID
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    // Check if any of the users to kick is the bot itself
    if (usersToKick.includes(botId)) {
        await sock.sendMessage(chatId, { 
            text: i18n.t(messageSenderId, 'admin.cannot_kick_self')
        }, { quoted: message });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(chatId, usersToKick, "remove");
        
        // Get usernames for each kicked user
        const usernames = await Promise.all(usersToKick.map(async jid => {
            return `@${jid.split('@')[0]}`;
        }));
        
        await sock.sendMessage(chatId, { 
            text: i18n.t(messageSenderId, 'admin.kick_success', { users: usernames.join(', ') }),
            mentions: usersToKick
        });
    } catch (error) {
        console.error('Error in kick command:', error);
        await sock.sendMessage(chatId, { 
            text: i18n.t(messageSenderId, 'admin.kick_failed')
        });
    }
}

module.exports = kickCommand;
