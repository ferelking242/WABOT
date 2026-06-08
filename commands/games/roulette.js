const { getText, getUserLanguage } = require('../../lib/languages');

async function rouletteCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Russian Roulette results (6 chambers, 1 bullet) - logique corrigée avec vraies probabilités
        const outcomes = [
            { result: 'safe', emoji: '🔫', key: 'ROULETTE_SAFE_1' },
            { result: 'safe', emoji: '🔫', key: 'ROULETTE_SAFE_2' },
            { result: 'safe', emoji: '🔫', key: 'ROULETTE_SAFE_3' },
            { result: 'safe', emoji: '🔫', key: 'ROULETTE_SAFE_4' },
            { result: 'safe', emoji: '🔫', key: 'ROULETTE_SAFE_5' },
            { result: 'death', emoji: '💥', key: 'ROULETTE_DEATH' }
        ];
        
        // Sélection aléatoire avec vraie probabilité 1/6 pour la mort
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const message_text = getText(senderId, randomOutcome.key);
        const title = getText(senderId, 'ROULETTE_TITLE');
        const trigger = getText(senderId, 'ROULETTE_TRIGGER');
        
        // Formatage correct pour WhatsApp (* au lieu de **)
        let responseText = `🎰 ${title} 🎰\n\n@${senderId.split('@')[0]} ${trigger}\n\n${randomOutcome.emoji} ${message_text}`;
        
        if (randomOutcome.result === 'death') {
            const ripText = getText(senderId, 'ROULETTE_RIP');
            responseText += `\n\n${ripText}`;
        }
        
        await sock.sendMessage(chatId, { 
            text: responseText,
            mentions: [senderId]
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in roulette command:', error);
        const errorMsg = getText(senderId, 'ERROR');
        await sock.sendMessage(chatId, { 
            text: `❌ ${errorMsg}` 
        }, { quoted: message });
    }
}

module.exports = { rouletteCommand };