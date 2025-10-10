async function resetlinkCommand(sock, chatId, senderId) {
    try {
        // Check if sender is admin
        const groupMetadata = await sock.groupMetadata(chatId);
        const isAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(senderId);

        // Check if bot is admin
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isBotAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(botId);

        if (!isAdmin) {
            const { getText } = require('../lib/languages');
            const errorMsg = getText(senderId, 'responses.reset_link_admin_only');
            await sock.sendMessage(chatId, { text: errorMsg });
            return;
        }

        if (!isBotAdmin) {
            const { getText } = require('../lib/languages');
            const errorMsg = getText(senderId, 'responses.reset_link_bot_admin');
            await sock.sendMessage(chatId, { text: errorMsg });
            return;
        }

        // Reset the group link
        const newCode = await sock.groupRevokeInvite(chatId);
        
        // Send the new link
        const { getText } = require('../lib/languages');
        const successMsg = getText(senderId, 'responses.reset_link_success', 'en', { code: newCode });
        await sock.sendMessage(chatId, { 
            text: successMsg
        });

    } catch (error) {
        console.error('Error in resetlink command:', error);
        const { getText } = require('../lib/languages');
        const errorMsg = getText(senderId, 'responses.reset_link_failed');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = resetlinkCommand; 