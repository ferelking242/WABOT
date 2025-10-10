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
            console.log(`🔍 [isAdmin] Début vérification - chatId: ${chatId}, senderId: ${senderId}`);
            
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants;
            
            console.log(`📋 [isAdmin] Groupe: ${groupMetadata.subject}, Participants: ${participants.length}`);
            
            // Détection dynamique du bot - Utiliser le LID (Linked ID) dans les groupes
            let botJid = null;
            let botLid = null;
            
            // Récupérer le JID ET le LID du bot depuis sock.user
            if (sock.user && sock.user.id) {
                const rawBotId = typeof sock.user.id === 'string' ? sock.user.id : String(sock.user.id);
                botJid = normalizeJid(rawBotId);
                console.log(`🤖 [isAdmin] Bot JID: ${botJid} (raw: ${rawBotId})`);
                
                // Récupérer le LID (Linked ID) - C'EST LUI QUI APPARAIT DANS LES GROUPES
                if (sock.user.lid) {
                    const rawBotLid = typeof sock.user.lid === 'string' ? sock.user.lid : String(sock.user.lid);
                    botLid = normalizeJid(rawBotLid);
                    console.log(`🤖 [isAdmin] Bot LID: ${botLid} (raw: ${rawBotLid})`);
                }
            }
            
            if (!botJid && !botLid) {
                console.error('❌ [isAdmin] Impossible de déterminer le JID/LID du bot');
                return { isSenderAdmin: false, isBotAdmin: false };
            }
            
            // Normaliser le senderId pour comparaison
            const normalizedSenderId = normalizeJid(senderId);
            console.log(`🔄 [isAdmin] JIDs normalisés - Bot JID: ${botJid}, Bot LID: ${botLid || 'none'}, Sender: ${normalizedSenderId}`);
            
            // Trouver le participant sender
            const participant = participants.find(p => normalizeJid(p.id) === normalizedSenderId);
            
            // Chercher le bot dans les participants en utilisant JID OU LID
            // Dans les groupes, le bot apparaît avec son LID, pas son JID
            const bot = participants.find(p => {
                const normalizedP = normalizeJid(p.id);
                return normalizedP === botJid || (botLid && normalizedP === botLid);
            });
            
            const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
            const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

            console.log(`📊 [isAdmin] Résultats:`);
            console.log(`   - Bot trouvé: ${!!bot} | ID: ${bot?.id || 'none'} | Admin status: ${bot?.admin || 'none'} | isBotAdmin: ${isBotAdmin}`);
            console.log(`   - Sender trouvé: ${!!participant} | Admin status: ${participant?.admin || 'none'} | isSenderAdmin: ${isSenderAdmin}`);
            
            // Si on ne trouve pas le bot dans les participants, on considère qu'il n'est pas admin
            if (!bot) {
                console.warn('⚠️ [isAdmin] Bot non trouvé dans les participants du groupe');
                return { isSenderAdmin, isBotAdmin: false };
            }

            return { isSenderAdmin, isBotAdmin };
        } catch (error) {
            console.error('❌ [isAdmin] Erreur:', error);
            return { isSenderAdmin: false, isBotAdmin: false };
        }
    }

    module.exports = isAdmin;
