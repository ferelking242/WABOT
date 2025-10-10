/**
 * Optimized AI Commands for wabot
 * Uses parallel API calls and intelligent caching
 */

const { i18n } = require('../../lib/i18n');
const { apiHandler } = require('../../lib/optimizedApi');

async function optimizedAiCommand(sock, chatId, message, userMessage) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Extract command and query
        let command, query;
        if (userMessage.startsWith('.gpt ')) {
            command = 'gpt';
            query = userMessage.slice(5).trim();
        } else if (userMessage.startsWith('.gemini ')) {
            command = 'gemini';
            query = userMessage.slice(8).trim();
        } else if (userMessage.startsWith('.claude ')) {
            command = 'claude';
            query = userMessage.slice(8).trim();
        } else {
            return false; // Not an AI command
        }

        if (!query) {
            const errorMsg = i18n.t(senderId, 'ai.provide_question');
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
            return true;
        }

        // Send processing message
        const processingMsg = i18n.t(senderId, 'bot.status.processing');
        const processingMsgSent = await sock.sendMessage(chatId, { 
            text: processingMsg 
        }, { quoted: message });

        try {
            // Use optimized AI handler with parallel requests
            // Get user language for forcing AI response language
            const { getUserLanguage } = require('../../lib/languages');
            const userLang = getUserLanguage(senderId);
            
            const response = await apiHandler.handleAiRequest(query, command, userLang);
            
            // Delete processing message
            await sock.sendMessage(chatId, { delete: processingMsgSent.key });

            // Extract response content
            let answer = response.result || response.data || response.response || response.answer;
            if (!answer) {
                throw new Error('No valid response from AI');
            }

            // Send AI response
            const aiNames = {
                gpt: '🧠 *ChatGPT:*',
                gemini: '💎 *Gemini AI:*',
                claude: '🤖 *Claude AI:*'
            };

            await sock.sendMessage(chatId, {
                text: `${aiNames[command] || '🤖 *AI:*'}\n\n${answer}`
            }, { quoted: message });

        } catch (error) {
            // Delete processing message
            await sock.sendMessage(chatId, { delete: processingMsgSent.key });

            console.error(`AI command error (${command}):`, error.message);
            
            const errorMsg = i18n.t(senderId, 'ai.error_response');
            await sock.sendMessage(chatId, { 
                text: `${errorMsg}\n\n*Erreur:* ${error.message}` 
            }, { quoted: message });
        }

        return true;
    } catch (error) {
        console.error('Optimized AI command error:', error);
        return false;
    }
}

module.exports = { optimizedAiCommand };