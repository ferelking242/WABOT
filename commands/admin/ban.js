const { channelInfo } = require('../../lib/messageConfig');
const { i18n, getUserLanguage, getText } = require('../../lib/i18n');
const { db } = require('../../lib/database');

async function banCommand(sock, chatId, message) {
    let userToBan;
    
    // Check for mentioned users
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToBan = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToBan = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToBan) {
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = i18n.t('ban.mention_user', { lng: getUserLanguage(senderId), defaultValue: "❌ Please mention a user to ban." });
        await sock.sendMessage(chatId, { 
            text: errorMsg, 
            ...channelInfo 
        });
        return;
    }

    try {
        // Check if user is already banned
        const alreadyBanned = await db.isBanned(userToBan);
        
        if (!alreadyBanned) {
            // Ban the user
            const success = await db.setBanStatus(userToBan, true, 'Banned by admin');
            
            if (success) {
                const senderId = message.key.participant || message.key.remoteJid;
                const userLang = getUserLanguage(senderId);
                const successMsg = getText(senderId, 'SUCCESS', userLang);
                await sock.sendMessage(chatId, { 
                    text: `${successMsg} - Banned @${userToBan.split('@')[0]}!`,
                    mentions: [userToBan],
                    ...channelInfo 
                });
            } else {
                throw new Error('Failed to ban user in database');
            }
        } else {
            const senderId = message.key.participant || message.key.remoteJid;
            const userLang = getUserLanguage(senderId);
            const errorMsg = getText(senderId, 'ERROR', userLang);
            await sock.sendMessage(chatId, { 
                text: `${errorMsg} - ${userToBan.split('@')[0]} is already banned!`,
                mentions: [userToBan],
                ...channelInfo 
            });
        }
    } catch (error) {
        console.error('Error in ban command:', error);
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = getText(senderId, 'ERROR', userLang);
        await sock.sendMessage(chatId, { text: `${errorMsg} - Failed to ban user!`, ...channelInfo });
    }
}

module.exports = banCommand;
