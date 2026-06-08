const axios = require('axios');
const fetch = require('node-fetch');
const { i18n, getUserLanguage } = require('../../lib/i18n');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t('ai.provide_question', { lng: getUserLanguage(senderId), defaultValue: "❓ Please provide a question for the AI." });
            return await sock.sendMessage(chatId, { 
                text: errorMsg
            });
        }

        // Get the command and query
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t('ai.provide_question', { lng: getUserLanguage(senderId), defaultValue: "❓ Please provide a question for the AI." });
            return await sock.sendMessage(chatId, { 
                text: errorMsg
            });
        }

        try {
            // Show processing message
            await sock.sendMessage(chatId, {
                react: { text: '🤖', key: message.key }
            });

            if (command === '.gpt') {
                // Call the GPT API
                const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);
                
                if (response.data && response.data.success && response.data.result) {
                    const answer = response.data.result.prompt;
                    await sock.sendMessage(chatId, {
                        text: answer
                    }, {
                        quoted: message
                    });
                    
                } else {
                    throw new Error('Invalid response from API');
                }
            } else if (command === '.gemini') {
                // Working Gemini APIs 
                // Try multiple working APIs for Gemini
                const geminiApis = [
                    `https://api.yanzbotz.my.id/api/ai/characterai?query=${encodeURIComponent(query)}&name=gemini`,
                    `https://api.vreden.my.id/api/gemini?query=${encodeURIComponent(query)}`,
                    `https://api.dreaded.site/api/gemini2?text=${encodeURIComponent(query)}`
                ];
                
                for (const api of geminiApis) {
                    try {
                        const response = await fetch(api);
                        const data = await response.json();
                        
                        let answer = data.result || data.data || data.response || data.answer;
                        if (answer) {
                            await sock.sendMessage(chatId, {
                                text: `🧠 *Gemini AI:*\n\n${answer}`
                            }, {
                                quoted: message
                            });
                            return;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('All Gemini APIs failed');

                
            } else if (command === '.claude') {
                // Try multiple working APIs for Claude
                const claudeApis = [
                    `https://api.yanzbotz.my.id/api/ai/characterai?query=${encodeURIComponent(query)}&name=claude`,
                    `https://api.vreden.my.id/api/claude?query=${encodeURIComponent(query)}`,
                    `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`
                ];
                
                for (const api of claudeApis) {
                    try {
                        const response = await fetch(api);
                        const data = await response.json();
                        
                        let answer = data.result?.prompt || data.result || data.data || data.response || data.answer;
                        if (answer) {
                            await sock.sendMessage(chatId, {
                                text: `🧠 *Claude AI:*\n\n${answer}`
                            }, {
                                quoted: message
                            });
                            return;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('All Claude APIs failed');

            }
        } catch (error) {
            console.error('API Error:', error);
            const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const errorMsg = i18n.t('ai.error_response', { lng: getUserLanguage(senderId), defaultValue: "❌ Error occurred while processing your request." });
            await sock.sendMessage(chatId, {
                text: errorMsg,
                contextInfo: {
                    mentionedJid: [senderId],
                    quotedMessage: message.message
                }
            });
        }
    } catch (error) {
        console.error('AI Command Error:', error);
        await sock.sendMessage(chatId, {
            text: "❌ An error occurred. Please try again later.",
            contextInfo: {
                mentionedJid: [message.key.participantAlt || message.key.participant || message.key.remoteJid],
                quotedMessage: message.message
            }
        });
    }
}

module.exports = aiCommand; 