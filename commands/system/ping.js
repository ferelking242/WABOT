const os = require('os');
const settings = require('../../config/settings');

function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;

    return time.trim();
}

async function pingCommand(sock, chatId, message) {
    try {
        const start = Date.now();
        const { i18n } = require('../../lib/i18n');
        const senderId = message.key.participant || message.key.remoteJid;
        const responseMsg = i18n.t(senderId, 'responses.pong') || 'Pong!';
        await sock.sendMessage(chatId, { text: responseMsg }, { quoted: message });
        const end = Date.now();
        const ping = Math.round((end - start) / 2);

        const uptimeInSeconds = process.uptime();
        const uptimeFormatted = formatTime(uptimeInSeconds);

        const botInfo = i18n.t(senderId, 'commands.ping.info', {
            ping: ping,
            uptime: uptimeFormatted,
            version: settings.version
        }) || `┏━━〔 🤖 Wabot 〕━━┓\n┃ 🚀 Ping     : ${ping} ms\n┃ ⏱️ Uptime   : ${uptimeFormatted}\n┃ 🔖 Version  : v${settings.version}\n┗━━━━━━━━━━━━━━━━━━━┛`;

        // Reply to the original message with the bot info
        await sock.sendMessage(chatId, { text: botInfo},{ quoted: message });

    } catch (error) {
        console.error('Error in ping command:', error);
        const { i18n } = require('../../lib/i18n');
        const senderId = message.key.participant || message.key.remoteJid;
        const errorMsg = i18n.t(senderId, 'messages.failed_to_fetch') || '❌ Failed to get bot status.';
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = pingCommand;
