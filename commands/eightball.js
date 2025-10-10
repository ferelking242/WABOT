const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

async function eightBallCommand(sock, chatId, question, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    const userLang = getUserLanguage(senderId);
    
    if (!question) {
        const errorMsg = i18n.t(senderId, 'messages.8ball_no_question');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    // Obtenir les réponses 8ball depuis les fichiers de localisation
    const responses = i18n.t(senderId, '8ball_responses') || [];
    const responseArray = Array.isArray(responses) ? responses : [
        "Yes, definitely!",
        "No way!",
        "Ask again later.",
        "It is certain.",
        "Very doubtful.",
        "Without a doubt.",
        "My reply is no.",
        "Signs point to yes."
    ];
    
    const randomResponse = responseArray[Math.floor(Math.random() * responseArray.length)];
    await sock.sendMessage(chatId, { text: `🎱 ${randomResponse}` });
}

module.exports = { eightBallCommand };
