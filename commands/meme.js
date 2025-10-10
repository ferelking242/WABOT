const fetch = require('node-fetch');
const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

async function memeCommand(sock, chatId, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    const userLang = getUserLanguage(senderId);
    
    try {
        const response = await fetch('https://shizoapi.onrender.com/api/memes/cheems?apikey=shizo');
        
        // Check if response is an image
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
            const imageBuffer = await response.buffer();
            
            // Obtenir les messages localisés
            const memeSuccess = i18n.t(senderId, 'messages.meme_success');
            const quickActions = userLang === 'fr' ? 'Actions rapides' : 'Quick Actions';
            const anotherMeme = userLang === 'fr' ? '🎭 Autre Meme' : '🎭 Another Meme';
            const getMemeDesc = userLang === 'fr' ? 'Obtenir un autre meme' : 'Get another meme';
            const getJokeDesc = userLang === 'fr' ? 'Obtenir une blague' : 'Get a joke';
            
            const listMessage = {
                text: memeSuccess,
                footer: 'wabot by codecraft',
                title: '🎭 Meme',
                buttonText: '🎮 Actions',
                sections: [{
                    title: quickActions,
                    rows: [
                        {
                            title: anotherMeme,
                            description: getMemeDesc,
                            id: '.meme'
                        },
                        {
                            title: '😄 ' + (userLang === 'fr' ? 'Blague' : 'Joke'),
                            description: getJokeDesc,
                            id: userLang === 'fr' ? '.blague' : '.joke'
                        }
                    ]
                }]
            };

            // D'abord envoyer l'image du meme
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: memeSuccess
            }, { quoted: message });
            
            // Puis envoyer les boutons d'action
            await sock.sendMessage(chatId, listMessage, { quoted: message });
        } else {
            throw new Error('Invalid response type from API');
        }
    } catch (error) {
        console.error('Error in meme command:', error);
        const errorMsg = i18n.t(senderId, 'messages.meme_failed');
        await sock.sendMessage(chatId, { 
            text: errorMsg
        });
    }
}

module.exports = memeCommand;
