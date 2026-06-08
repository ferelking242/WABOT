    // Normaliser un JID pour comparaison (enlève le device suffix et gère @lid)
    function normalizeJid(jid) {
        if (!jid) return '';
        // Enlever le device suffix (:X) en premier
        let normalized = jid.split(':')[0];
        // S'assurer qu'on a un domaine, sinon ajouter @s.whatsapp.net
        if (!normalized.includes('@')) {
            normalized = `${normalized}@s.whatsapp.net`;
        }
        // Normaliser @lid vers @s.whatsapp.net
        normalized = normalized.replace('@lid', '@s.whatsapp.net');
        return normalized;
    }

    async function isAdmin(sock, chatId, senderId) {
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants;

            // Détection dynamique du bot - Utiliser le LID (Linked ID) dans les groupes
            let botJid = null;
            let botLid = null;

            if (sock.user && sock.user.id) {
                const rawBotId = typeof sock.user.id === 'string' ? sock.user.id : String(sock.user.id);
                botJid = normalizeJid(rawBotId);
                if (sock.user.lid) {
                    const rawBotLid = typeof sock.user.lid === 'string' ? sock.user.lid : String(sock.user.lid);
                    botLid = normalizeJid(rawBotLid);
                }
            }

            if (!botJid && !botLid) {
                return { isSenderAdmin: false, isBotAdmin: false };
            }

            const normalizedSenderId = normalizeJid(senderId);

            const participant = participants.find(p => normalizeJid(p.id) === normalizedSenderId);
            const bot = participants.find(p => {
                const normalizedP = normalizeJid(p.id);
                return normalizedP === botJid || (botLid && normalizedP === botLid);
            });

            const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
            const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

            if (!bot) {
                return { isSenderAdmin, isBotAdmin: false };
            }

            return { isSenderAdmin, isBotAdmin };
        } catch (error) {
            console.error('❌ [isAdmin]', error.message || error);
            return { isSenderAdmin: false, isBotAdmin: false };
        }
    }

    module.exports = isAdmin;
