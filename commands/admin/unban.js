const { channelInfo } = require('../../lib/messageConfig');
const { db } = require('../../lib/database');

async function unbanCommand(sock, chatId, message) {
    let userToUnban;
    
    // Check for mentioned users
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToUnban = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToUnban = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToUnban) {
        await sock.sendMessage(chatId, { 
            text: 'Please mention the user or reply to their message to unban!', 
            ...channelInfo 
        });
        return;
    }

    try {
        // Check if user is actually banned
        const isBanned = await db.isBanned(userToUnban);
        
        if (isBanned) {
            // Unban the user
            const success = await db.setBanStatus(userToUnban, false);
            
            if (success) {
                await sock.sendMessage(chatId, { 
                    text: `Successfully unbanned ${userToUnban.split('@')[0]}!`,
                    mentions: [userToUnban],
                    ...channelInfo 
                });
            } else {
                throw new Error('Failed to unban user in database');
            }
        } else {
            await sock.sendMessage(chatId, { 
                text: `${userToUnban.split('@')[0]} is not banned!`,
                mentions: [userToUnban],
                ...channelInfo 
            });
        }
    } catch (error) {
        console.error('Error in unban command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to unban user!', ...channelInfo });
    }
}

module.exports = unbanCommand; 