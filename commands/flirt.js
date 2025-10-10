const fetch = require('node-fetch');
const { getText } = require('../lib/i18n');

async function flirtCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await fetch(`https://shizoapi.onrender.com/api/texts/flirt?apikey=${shizokeys}`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const flirtMessage = json.result;

        // Send the flirt message
        await sock.sendMessage(chatId, { text: flirtMessage }, { quoted: message });
    } catch (error) {
        console.error('Error in flirt command:', error);
        const userId = message.key.remoteJid;
        await sock.sendMessage(chatId, { text: getText(userId, 'messages.failed_to_fetch') }, { quoted: message });
    }
}

module.exports = { flirtCommand }; 