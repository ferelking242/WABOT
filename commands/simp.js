const fetch = require('node-fetch');

// commandHandler appelle: simpCommand(sock, chatId, message)
async function simpCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const mentionedJid = contextInfo?.mentionedJid || [];
        const quotedParticipant = contextInfo?.participant;

        // Priorité: message quoté > mentionné > expéditeur lui-même
        let who;
        if (quotedParticipant) {
            who = quotedParticipant;
        } else if (mentionedJid.length > 0) {
            who = mentionedJid[0];
        } else {
            who = senderId;
        }

        // Photo de profil
        let avatarUrl;
        try {
            avatarUrl = await sock.profilePictureUrl(who, 'image');
        } catch {
            avatarUrl = 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
        }

        // Carte simp via l'API
        const apiUrl = `https://some-random-api.com/canvas/misc/simpcard?avatar=${encodeURIComponent(avatarUrl)}`;
        const response = await fetch(apiUrl);

        if (!response.ok) throw new Error(`API status: ${response.status}`);

        const imageBuffer = await response.buffer();

        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: '😩 *your religion is simping* 😩'
        });

    } catch (error) {
        console.error('Erreur commande simp:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Impossible de générer la carte simp. Réessaie plus tard !'
        });
    }
}

module.exports = { simpCommand };
