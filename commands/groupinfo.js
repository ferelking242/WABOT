const { i18n } = require('../lib/i18n');

async function groupInfoCommand(sock, chatId, msg) {
    try {
        const senderId = msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        
        // Get group profile picture
        let pp;
        try {
            pp = await sock.profilePictureUrl(chatId, 'image');
        } catch {
            pp = 'https://i.imgur.com/2wzGhpF.jpeg'; // Default image
        }

        // Get admins from participants
        const participants = groupMetadata.participants;
        const groupAdmins = participants.filter(p => p.admin);
        const listAdmin = groupAdmins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`).join('\n');
        
        // Get group owner
        const owner = groupMetadata.owner || groupAdmins.find(p => p.admin === 'superadmin')?.id || chatId.split('-')[0] + '@s.whatsapp.net';

        // Create info text with i18n
        const description = groupMetadata.desc?.toString() || i18n.t(senderId, 'group.no_description');
        const text = `
${i18n.t(senderId, 'group.info_header')}
${i18n.t(senderId, 'group.info_id', { id: groupMetadata.id })}
${i18n.t(senderId, 'group.info_name', { name: groupMetadata.subject })}
${i18n.t(senderId, 'group.info_members', { count: participants.length })}
${i18n.t(senderId, 'group.info_owner', { owner: owner.split('@')[0] })}
${i18n.t(senderId, 'group.info_admins', { admins: listAdmin })}

${i18n.t(senderId, 'group.info_description', { desc: description })}
`.trim();

        // Send the message with image and mentions
        await sock.sendMessage(chatId, {
            image: { url: pp },
            caption: text,
            mentions: [...groupAdmins.map(v => v.id), owner]
        });

    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error in groupinfo command:', error);
        const senderId = msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;
        await sock.sendMessage(chatId, { text: i18n.t(senderId, 'group.info_failed') });
    }
}

module.exports = groupInfoCommand; 