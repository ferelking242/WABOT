const isAdmin = require('../../lib/isAdmin');
const { getText, getUserLanguage } = require('../../lib/languages');

async function deleteCommand(sock, chatId, message, senderId) {
    const userLang = getUserLanguage(senderId);
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        const errorMsg = getText(senderId, 'DELETE_NEED_ADMIN', userLang);
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    if (!isSenderAdmin) {
        const errorMsg = getText(senderId, 'DELETE_ADMIN_ONLY', userLang);
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;

    if (quotedMessage) {
        await sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: false, id: quotedMessage, participant: quotedParticipant } });
    } else {
        const errorMsg = getText(senderId, 'DELETE_REPLY_TO_MESSAGE', userLang);
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = deleteCommand;
