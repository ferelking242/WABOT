const settings = require('../config/settings');
const { addSudo, removeSudo, getSudoList } = require('../lib/index');
const { i18n } = require('../lib/i18n');

function extractMentionedJid(message) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    
    // Try different number formats: +123456789, @123456789, 123456789
    const match = text.match(/(?:[@+])?(\d{7,15})(?!@)/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
}

async function sudoCommand(sock, chatId, message) {
    const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    const isOwnerOrSudo = require('../lib/isOwner');
    const isOwner = await isOwnerOrSudo(senderId);

    const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const args = rawText.trim().split(' ').slice(1);
    const sub = (args[0] || '').toLowerCase();

    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        await sock.sendMessage(chatId, { text: 'Usage:\n.sudo add <@user|number>\n.sudo del <@user|number>\n.sudo list' });
        return;
    }

    if (sub === 'list') {
        const list = await getSudoList();
        if (list.length === 0) {
            await sock.sendMessage(chatId, { text: 'No sudo users set.' });
            return;
        }
        const text = list.map((j, i) => `${i + 1}. ${j}`).join('\n');
        await sock.sendMessage(chatId, { text: `Sudo users:\n${text}` });
        return;
    }

    // Only the OWNER (not sudos) can add/remove sudos to prevent privilege escalation
    const settings = require('../config/settings');
    const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
    const isActualOwner = senderId === ownerJid;
    
    if (!isActualOwner) {
        await sock.sendMessage(chatId, { text: '❌ Only the bot owner can add/remove sudo users. Use .sudo list to view.' });
        return;
    }

    const targetJid = extractMentionedJid(message);
    if (!targetJid) {
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        const errorMsg = i18n.t(senderId, 'admin.mention_user_or_number');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    if (sub === 'add') {
        const ok = await addSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? `✅ Added sudo: ${targetJid}` : '❌ Failed to add sudo' });
        return;
    }

    if (sub === 'del' || sub === 'remove') {
        const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
        if (targetJid === ownerJid) {
            await sock.sendMessage(chatId, { text: 'Owner cannot be removed.' });
            return;
        }
        const ok = await removeSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? `✅ Removed sudo: ${targetJid}` : '❌ Failed to remove sudo' });
        return;
    }
}

module.exports = sudoCommand;


