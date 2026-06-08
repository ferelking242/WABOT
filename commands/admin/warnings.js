const fs = require('fs');
const path = require('path');

const warningsFilePath = path.join(__dirname, '../data/warnings.json');

function loadWarnings() {
    if (!fs.existsSync(warningsFilePath)) {
        fs.writeFileSync(warningsFilePath, JSON.stringify({}), 'utf8');
    }
    const data = fs.readFileSync(warningsFilePath, 'utf8');
    return JSON.parse(data);
}

async function warningsCommand(sock, chatId, mentionedJidList, message) {
    const warnings = loadWarnings();

    if (mentionedJidList.length === 0) {
        const { i18n } = require('../../lib/i18n');
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const errorMsg = i18n.t(senderId, 'responses.check_warnings');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    const userToCheck = mentionedJidList[0];
    const warningCount = warnings[userToCheck] || 0;

    const { i18n } = require('../../lib/i18n');
    const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    const warningMsg = i18n.t(senderId, 'responses.warning_count', { count: warningCount });
    await sock.sendMessage(chatId, { text: warningMsg });
}

module.exports = warningsCommand;
