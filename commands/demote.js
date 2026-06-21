const isAdmin = require('../lib/isAdmin');
const { i18n } = require('../lib/i18n');

async function demoteCommand(sock, chatId, mentionedJids, message) {
    try {
        // First check if it's a group
        if (!chatId.endsWith('@g.us')) {
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t(senderId, 'admin.group_only');
            await sock.sendMessage(chatId, { 
                text: errorMsg
            });
            return;
        }

        // Check admin status first, before any other operations
        try {
            const adminStatus = await isAdmin(sock, chatId, message.key.participantAlt || message.key.participant || message.key.remoteJid);
            
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            if (!adminStatus.isBotAdmin) {
                const errorMsg = i18n.t(senderId, 'admin.bot_admin_first_error');
                await sock.sendMessage(chatId, { 
                    text: errorMsg
                });
                return;
            }

            if (!adminStatus.isSenderAdmin) {
                const errorMsg = i18n.t(senderId, 'admin.admin_only_demote');
                await sock.sendMessage(chatId, { 
                    text: errorMsg
                });
                return;
            }
        } catch (adminError) {
            console.error('Error checking admin status:', adminError);
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t(senderId, 'admin.bot_admin_first_error');
            await sock.sendMessage(chatId, { 
                text: errorMsg
            });
            return;
        }

        let userToDemote = [];
        
        // Check for mentioned users
        if (mentionedJids && mentionedJids.length > 0) {
            userToDemote = mentionedJids;
        }
        // Check for replied message
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToDemote = [message.message.extendedTextMessage.contextInfo.participant];
        }
        
        // If no user found through either method
        if (userToDemote.length === 0) {
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t(senderId, 'admin.mention_user_demote');
            await sock.sendMessage(chatId, { 
                text: errorMsg
            });
            return;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.groupParticipantsUpdate(chatId, userToDemote, "demote");
        
        // Get usernames for each demoted user
        const usernames = await Promise.all(userToDemote.map(async jid => {
            return `@${jid.split('@')[0]}`;
        }));

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const demoterName = `@${senderId.split('@')[0]}`;
        const demotionMessage = i18n.t(senderId, 'admin.demote_success', {
            count: userToDemote.length > 1 ? 's' : '',
            users: usernames.map(name => `• ${name}`).join('\n'),
            demoter: demoterName,
            date: new Date().toLocaleString()
        });
        
        await sock.sendMessage(chatId, { 
            text: demotionMessage,
            mentions: [...userToDemote, senderId]
        });
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error in demote command:', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ Rate limit reached. Please try again in a few seconds.'
                });
            } catch (retryError) {
                console.error('Error sending retry message:', retryError);
            }
        } else {
            try {
                const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
                const errorMsg = i18n.t(senderId, 'admin.demote_failed');
                await sock.sendMessage(chatId, { 
                    text: errorMsg
                });
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }
}

// Function to handle automatic demotion detection
async function handleDemotionEvent(sock, groupId, participants, author) {
    try {
        if (!groupId || !participants) {
            console.log('Invalid groupId or participants:', { groupId, participants });
            return;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get usernames for demoted participants
        const demotedUsernames = await Promise.all(participants.map(async jid => {
            return `@${jid.split('@')[0]}`;
        }));

        let demotedBy;
        let mentionList = [...participants];

        if (author && author.length > 0) {
            // Ensure author has the correct format
            const authorJid = author;
            demotedBy = `@${authorJid.split('@')[0]}`;
            mentionList.push(authorJid);
        } else {
            demotedBy = 'System';
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const demotionMessage = `*『 GROUP DEMOTION 』*\n\n` +
            `👤 *Demoted User${participants.length > 1 ? 's' : ''}:*\n` +
            `${demotedUsernames.map(name => `• ${name}`).join('\n')}\n\n` +
            `👑 *Demoted By:* ${demotedBy}\n\n` +
            `📅 *Date:* ${new Date().toLocaleString()}`;
        
        await sock.sendMessage(groupId, {
            text: demotionMessage,
            mentions: mentionList
        });
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error handling demotion event:', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

module.exports = { demoteCommand, handleDemotionEvent };
