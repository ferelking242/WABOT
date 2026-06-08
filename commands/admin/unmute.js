async function unmuteCommand(sock, chatId, message) {
    const { i18n } = require('../../lib/i18n');
    const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    await sock.groupSettingUpdate(chatId, 'not_announcement'); // Unmute the group
    const successMsg = i18n.t(senderId, 'responses.group_unmuted');
    await sock.sendMessage(chatId, { text: successMsg });
}

module.exports = unmuteCommand;
