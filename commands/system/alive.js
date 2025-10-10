const settings = require("../../config/settings");
const { i18n, getUserLanguage } = require('../../lib/i18n');

async function aliveCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    
    try {
        const userLang = getUserLanguage(senderId);
        
        // Use correct i18n API signature: t(userId, key, variables, fallbackLang)
        let aliveText = i18n.t(senderId, 'bot.alive_message', { version: settings.version }, 'en');
        
        // Ensure text is a string to prevent text.match errors in Baileys
        if (typeof aliveText !== 'string') {
            aliveText = i18n.t(senderId, 'bot.alive_message_fallback', { version: settings.version }, 'en');
        }

        await sock.sendMessage(chatId, {
            text: aliveText
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        const fallbackText = i18n.t(senderId, 'bot.alive_message_fallback', { version: settings.version }, 'en');
        await sock.sendMessage(chatId, { text: fallbackText }, { quoted: message });
    }
}

module.exports = aliveCommand;