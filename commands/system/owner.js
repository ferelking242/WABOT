const settings = require('../../config/settings');
const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');

async function ownerCommand(sock, chatId, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    
    // Créer une vCard améliorée avec plus d'informations
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${settings.botOwner}
ORG:CodeCraft Team
TITLE:wabot Creator & Developer
TEL;waid=${settings.ownerNumber}:${settings.ownerNumber}
URL:https://github.com/codecraft
EMAIL:contact@codecraft.dev
NOTE:${i18n.t(senderId, 'responses.owner_description')}
END:VCARD
`;

    // Envoyer d'abord un message descriptif
    const ownerTitle = i18n.t(senderId, 'messages.owner_card_title');
    const description = i18n.t(senderId, 'responses.owner_description');
    
    await sock.sendMessage(chatId, {
        text: `🔥 *${ownerTitle}*

${description}`
    });
    
    // Puis envoyer la carte de contact
    await sock.sendMessage(chatId, {
        contacts: { 
            displayName: `${settings.botOwner} - wabot Creator`, 
            contacts: [{ vcard }] 
        },
    });
}

module.exports = ownerCommand;
