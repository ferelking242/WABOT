/**
 * Optimized Translation Command for wabot
 * Uses parallel API calls and intelligent caching
 */

const { i18n } = require('../../lib/i18n');
const { apiHandler } = require('../../lib/optimizedApi');

async function optimizedTranslateCommand(sock, chatId, message, userMessage) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Check if this is a translate command
        if (!userMessage.startsWith('.trt ') && !userMessage.startsWith('.translate ')) {
            return false;
        }

        const args = userMessage.split(' ');
        if (args.length < 3) {
            const usage = i18n.t(senderId, 'commands.translate.usage');
            const example = i18n.t(senderId, 'commands.translate.example');
            await sock.sendMessage(chatId, { 
                text: `❌ Usage incorrect\n\n*Usage:* ${usage}\n*Exemple:* ${example}` 
            }, { quoted: message });
            return true;
        }

        const targetLang = args.pop(); // Last argument is target language
        const textToTranslate = args.slice(1).join(' '); // Everything else is text

        if (!textToTranslate.trim()) {
            const errorMsg = i18n.t(senderId, 'messages.provide_text');
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
            return true;
        }

        // Send processing message
        const processingMsg = i18n.t(senderId, 'bot.status.processing');
        const processingMsgSent = await sock.sendMessage(chatId, { 
            text: processingMsg 
        }, { quoted: message });

        try {
            // Use optimized translation handler with parallel requests and caching
            const translatedText = await apiHandler.handleTranslation(textToTranslate, targetLang);
            
            // Delete processing message
            await sock.sendMessage(chatId, { delete: processingMsgSent.key });

            // Format response
            const response = `🌐 *Traduction* (${targetLang.toUpperCase()})\n\n` +
                           `*Original:* ${textToTranslate}\n\n` +
                           `*Traduit:* ${translatedText}`;

            await sock.sendMessage(chatId, { text: response }, { quoted: message });

        } catch (error) {
            // Delete processing message
            await sock.sendMessage(chatId, { delete: processingMsgSent.key });

            console.error('Translation error:', error.message);
            
            const errorMsg = i18n.t(senderId, 'responses.translate_failed') || 
                           'Erreur lors de la traduction. Vérifiez le code de langue et réessayez.';
            await sock.sendMessage(chatId, { 
                text: `❌ ${errorMsg}\n\n*Erreur:* ${error.message}` 
            }, { quoted: message });
        }

        return true;
    } catch (error) {
        console.error('Optimized translate command error:', error);
        return false;
    }
}

module.exports = { optimizedTranslateCommand };