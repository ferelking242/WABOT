/**
 * clearSession command - Efface la session WhatsApp courante
 */

const fs = require('fs');
const path = require('path');

async function clearSessionCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    
    try {
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isAuthorized = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!isAuthorized) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande est réservée au propriétaire du bot.'
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: '⚠️ Effacement de la session en cours...\n\nLe bot va se déconnecter et redémarrer.'
        }, { quoted: message });

        const sessionDir = path.join(process.cwd(), 'session');
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        setTimeout(() => process.exit(0), 3000);

    } catch (error) {
        console.error('Erreur clearSession:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Erreur: ${error.message}`
        }, { quoted: message });
    }
}

module.exports = clearSessionCommand;
