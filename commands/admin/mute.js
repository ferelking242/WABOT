const isAdmin = require('../../lib/isAdmin');
const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');

async function muteCommand(sock, chatId, senderId, durationInMinutes) {
    console.log(`Attempting to mute the group for ${durationInMinutes} minutes.`); // Log for debugging

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
    if (!isBotAdmin) {
        const errorMsg = i18n.t(senderId, 'admin.bot_admin_first');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    if (!isSenderAdmin) {
        const errorMsg = i18n.t(senderId, 'admin.admin_only_mute');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    const durationInMilliseconds = durationInMinutes * 60 * 1000;
    try {
        await sock.groupSettingUpdate(chatId, 'announcement'); // Mute the group
        const successMsg = i18n.t(senderId, 'admin.mute_success', { minutes: durationInMinutes });
        await sock.sendMessage(chatId, { text: successMsg });

        setTimeout(async () => {
            await sock.groupSettingUpdate(chatId, 'not_announcement'); // Unmute after the duration
            const unmuteMsg = i18n.t(senderId, 'admin.mute_unmute_success');
            await sock.sendMessage(chatId, { text: unmuteMsg });
        }, durationInMilliseconds);
    } catch (error) {
        console.error('Error muting/unmuting the group:', error);
        const errorMsg = i18n.t(senderId, 'admin.mute_error');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = muteCommand;
