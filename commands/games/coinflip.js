const { getText, getUserLanguage } = require('../../lib/languages');

async function coinflipCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Coin flip results
        const results = ['heads', 'tails'];
        const result = results[Math.floor(Math.random() * results.length)];
        
        // Multilingual responses
        const responses = {
            heads: {
                fr: { emoji: '🪙', text: 'Face', description: 'La pièce est tombée sur Face!' },
                en: { emoji: '🪙', text: 'Heads', description: 'The coin landed on Heads!' },
                es: { emoji: '🪙', text: 'Cara', description: '¡La moneda cayó en Cara!' }
            },
            tails: {
                fr: { emoji: '🪙', text: 'Pile', description: 'La pièce est tombée sur Pile!' },
                en: { emoji: '🪙', text: 'Tails', description: 'The coin landed on Tails!' },
                es: { emoji: '🪙', text: 'Cruz', description: '¡La moneda cayó en Cruz!' }
            }
        };
        
        const coinResult = responses[result][userLang] || responses[result]['en'];
        
        // Check if user made a prediction
        let predictionText = '';
        if (args.length > 0) {
            const userChoice = args[0].toLowerCase();
            const validChoices = {
                fr: { face: 'heads', pile: 'tails', head: 'heads', tail: 'tails' },
                en: { heads: 'heads', tails: 'tails', head: 'heads', tail: 'tails' },
                es: { cara: 'heads', cruz: 'tails', head: 'heads', tail: 'tails' }
            };
            
            const userLangChoices = validChoices[userLang] || validChoices['en'];
            
            if (userLangChoices[userChoice]) {
                const userPrediction = userLangChoices[userChoice];
                const isCorrect = userPrediction === result;
                
                if (isCorrect) {
                    predictionText = userLang === 'fr' ? `\n\n🎉 *Bravo @${senderId.split('@')[0]}!* Tu as gagné!` :
                                    userLang === 'es' ? `\n\n🎉 *¡Bravo @${senderId.split('@')[0]}!* ¡Ganaste!` :
                                    `\n\n🎉 *Congratulations @${senderId.split('@')[0]}!* You won!`;
                } else {
                    predictionText = userLang === 'fr' ? `\n\n😔 *Dommage @${senderId.split('@')[0]}!* Tu as perdu!` :
                                    userLang === 'es' ? `\n\n😔 *¡Lástima @${senderId.split('@')[0]}!* ¡Perdiste!` :
                                    `\n\n😔 *Sorry @${senderId.split('@')[0]}!* You lost!`;
                }
            }
        }
        
        let responseText = '';
        if (userLang === 'fr') {
            responseText = `🪙 *Lancer de Pièce* 🪙\n\n*La pièce tourne dans les airs...*\n\n${coinResult.emoji} *${coinResult.text}*\n${coinResult.description}${predictionText}`;
        } else if (userLang === 'es') {
            responseText = `🪙 *Lanzamiento de Moneda* 🪙\n\n*La moneda gira en el aire...*\n\n${coinResult.emoji} *${coinResult.text}*\n${coinResult.description}${predictionText}`;
        } else {
            responseText = `🪙 *Coin Flip* 🪙\n\n*The coin spins through the air...*\n\n${coinResult.emoji} *${coinResult.text}*\n${coinResult.description}${predictionText}`;
        }
        
        if (!args.length) {
            const helpText = userLang === 'fr' ? '\n\n💡 *Astuce:* Prédis le résultat avec `.coinflip face` ou `.coinflip pile`' :
                            userLang === 'es' ? '\n\n💡 *Consejo:* Predice el resultado con `.coinflip cara` o `.coinflip cruz`' :
                            '\n\n💡 *Tip:* Predict the result with `.coinflip heads` or `.coinflip tails`';
            responseText += helpText;
        }
        
        await sock.sendMessage(chatId, { 
            text: responseText,
            mentions: predictionText ? [senderId] : []
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in coinflip command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error in coin flip game. Please try again later!' 
        }, { quoted: message });
    }
}

module.exports = { coinflipCommand };