const fetch = require('node-fetch');
const { getText } = require('../lib/i18n');

async function dareCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await fetch(`https://shizoapi.onrender.com/api/texts/dare?apikey=${shizokeys}`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const dareMessage = json.result;

        // Send the dare message
        await sock.sendMessage(chatId, { text: dareMessage }, { quoted: message });
    } catch (error) {
        console.error('Error in dare command:', error);
        const userId = message.key.remoteJid;
        await sock.sendMessage(chatId, { text: getText(userId, 'messages.failed_to_fetch') }, { quoted: message });
    }
}

module.exports = { dareCommand };
