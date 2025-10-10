const fetch = require('node-fetch');

async function shayariCommand(sock, chatId, message) {
    try {
        const response = await fetch('https://shizoapi.onrender.com/api/texts/shayari?apikey=shizo');
        const data = await response.json();
        
        if (!data || !data.result) {
            throw new Error('Invalid response from API');
        }

        const listMessage = {
            text: data.result,
            footer: 'wabot by codecraft',
            title: '🪄 Shayari',
            buttonText: '🎯 Actions',
            sections: [{
                title: 'Actions rapides',
                rows: [
                    {
                        title: 'Shayari 🪄',
                        description: 'Obtenir un autre shayari',
                        id: '.shayari'
                    },
                    {
                        title: '🌹 RoseDay',
                        description: 'Message de la journée des roses',
                        id: '.roseday'
                    }
                ]
            }]
        };

        await sock.sendMessage(chatId, listMessage, { quoted: message });
    } catch (error) {
        console.error('Error in shayari command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to fetch shayari. Please try again later.',
        }, { quoted: message });
    }
}

module.exports = { shayariCommand }; 