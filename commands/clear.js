const { getText, getUserLanguage } = require('../lib/i18n');

async function clearCommand(sock, chatId, message) {
    try {
        if (!message || !message.key) {
            console.error('Message or message key is undefined');
            return;
        }
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Essayer d'activer les messages éphémères pour 2h
        try {
            await sock.sendMessage(chatId, {
                disappearingMessagesInChat: {
                    ephemeralExpiration: 2 * 60 * 60 // 2 heures
                }
            });
            
            const successMsg = getText(senderId, 'CLEAR_EPHEMERAL_SUCCESS');
                
            await sock.sendMessage(chatId, { text: successMsg });
            
        } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
            console.error('Erreur messages éphémères:', error);
            
            // Solution simple : message informatif
            const infoMsg = getText(senderId, 'CLEAR_INFO_MESSAGE');
                
            await sock.sendMessage(chatId, { text: infoMsg });
        }
        
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error in clear command:', error);
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = getText(senderId, 'CLEAR_ERROR', userLang);
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = { clearCommand };
