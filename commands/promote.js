const { isAdmin } = require('../lib/isAdmin');
const { i18n } = require('../lib/i18n');

// Function to handle manual promotions via command
async function promoteCommand(sock, chatId, mentionedJids, message) {
    let userToPromote = [];
    
    // Check for mentioned users
    if (mentionedJids && mentionedJids.length > 0) {
        userToPromote = mentionedJids;
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToPromote = [message.message.extendedTextMessage.contextInfo.participant];
    }
    
    // If no user found through either method
    if (userToPromote.length === 0) {
        const errorMsg = i18n.t(message?.key?.participant || message?.key?.remoteJid, 'admin.mention_user_promote');
        await sock.sendMessage(chatId, { 
            text: errorMsg
        });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(chatId, userToPromote, "promote");
        
        // Get usernames for each promoted user
        const usernames = await Promise.all(userToPromote.map(async jid => {
            
            return `@${jid.split('@')[0]}`;
        }));

        // Get promoter's name (the bot user in this case)
        const promoterJid = sock.user.id;
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        
        const promotionMessage = i18n.t(senderId, 'admin.promote_success', {
            count: userToPromote.length > 1 ? 's' : '',
            users: usernames.map(name => `• ${name}`).join('\n'),
            promoter: `@${promoterJid.split('@')[0]}`,
            date: new Date().toLocaleString()
        });
        await sock.sendMessage(chatId, { 
            text: promotionMessage,
            mentions: [...userToPromote, promoterJid]
        });
    } catch (error) {
        console.error('Error in promote command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        const errorMsg = i18n.t(senderId, 'admin.promote_failed');
        await sock.sendMessage(chatId, { text: errorMsg});
    }
}

// Function to handle automatic promotion detection
async function handlePromotionEvent(sock, groupId, participants, author) {
    try {
       /* console.log('Promotion Event Data:', {
            groupId,
            participants,
            author
        });*/

        // 🚀 CRITICAL: Check if BOT itself was promoted in a COMMUNITY
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const settings = require('../config/settings');
        const botNumber = settings.botPhoneNumber + '@s.whatsapp.net';
        const botJid = jidNormalizedUser(sock.user?.id) || botNumber;
        
        if (participants.includes(botJid)) {
            console.log(`🎉 Bot was promoted to admin in: ${groupId}`);
            
            // Trigger Wabot Center creation via dedicated service
            const { triggerWabotCenterOnBotPromotion } = require('../services/wabotCenter');
            await triggerWabotCenterOnBotPromotion(sock, groupId, botJid);
        }

        // Get usernames for promoted participants
        const promotedUsernames = await Promise.all(participants.map(async jid => {
            return `@${jid.split('@')[0]} `;
        }));

        let promotedBy;
        let mentionList = [...participants];

        if (author && author.length > 0) {
            // Ensure author has the correct format
            const authorJid = author;
            promotedBy = `@${authorJid.split('@')[0]}`;
            mentionList.push(authorJid);
        } else {
            promotedBy = 'System';
        }

        const promotionMessage = `*『 GROUP PROMOTION 』*\n\n` +
            `👥 *Promoted User${participants.length > 1 ? 's' : ''}:*\n` +
            `${promotedUsernames.map(name => `• ${name}`).join('\n')}\n\n` +
            `👑 *Promoted By:* ${promotedBy}\n\n` +
            `📅 *Date:* ${new Date().toLocaleString()}`;
        
        await sock.sendMessage(groupId, {
            text: promotionMessage,
            mentions: mentionList
        });
    } catch (error) {
        console.error('Error handling promotion event:', error);
    }
}

module.exports = { promoteCommand, handlePromotionEvent };
