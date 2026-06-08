const { i18n } = require('../../lib/i18n');
const { supabase } = require('../../lib/supabase');
const isAdmin = require('../../lib/isAdmin');

// Fonction pour générer un code aléatoire de 6-8 caractères
function generateCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Normaliser un JID pour comparaison (enlève le device suffix et gère @lid)
function normalizeJid(jid) {
    if (!jid) return '';
    
    // D'abord, remplacer @lid par @s.whatsapp.net
    let normalized = jid.replace('@lid', '@s.whatsapp.net');
    
    // Séparer le numéro et le domaine
    const parts = normalized.split('@');
    if (parts.length < 2) {
        // Pas de domaine, on l'ajoute
        return `${parts[0].split(':')[0]}@s.whatsapp.net`;
    }
    
    // Enlever le device suffix (:X) du numéro en gardant tout avant le premier ':'
    const numberPart = parts[0].split(':')[0];
    const domain = parts[1];
    
    return `${numberPart}@${domain}`;
}

// Fonction pour nettoyer les codes expirés
async function cleanExpiredCodes() {
    try {
        const now = new Date().toISOString();
        
        const { error } = await supabase
            .from('group_links_temp')
            .delete()
            .lt('expires_at', now);
        
        if (error) {
            console.error('❌ Erreur nettoyage codes expirés:', error);
        } else {
            console.log('✅ Codes expirés nettoyés');
        }
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage:', error);
    }
}

// Fonction pour vérifier le rate limiting (5 tentatives/heure)
async function checkRateLimit(userPhone) {
    try {
        const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
        
        const { data, error } = await supabase
            .from('group_links_temp')
            .select('id')
            .eq('user_phone', userPhone)
            .gte('created_at', oneHourAgo);
        
        if (error) {
            console.error('❌ Erreur vérification rate limit:', error);
            return { allowed: true, count: 0 };
        }
        
        const count = data?.length || 0;
        const allowed = count < 5;
        
        console.log(`🔒 [RATE LIMIT] Utilisateur ${userPhone}: ${count}/5 tentatives dans la dernière heure`);
        
        return { allowed, count };
    } catch (error) {
        console.error('❌ Erreur lors de la vérification du rate limit:', error);
        return { allowed: true, count: 0 };
    }
}

// Fonction pour obtenir les textes localisés selon le type
function getLocalizedTexts(senderId, groupType = 'group') {
    const lang = i18n.getUserLanguage(senderId);
    
    const texts = {
        en: {
            group: {
                entity_type: 'group',
                entity_phrase: 'the group', // for "of the group"
                icon: '👥',
                dashboard_section: 'Groups',
                link_text: 'a group'
            },
            community: {
                entity_type: 'community',
                entity_phrase: 'the community',
                icon: '🏢',
                dashboard_section: 'Communities',
                link_text: 'a community'
            }
        },
        fr: {
            group: {
                entity_type: 'groupe',
                entity_phrase: 'du groupe',
                icon: '👥',
                dashboard_section: 'Groupes',
                link_text: 'un groupe'
            },
            community: {
                entity_type: 'communauté',
                entity_phrase: 'de la communauté',
                icon: '🏢',
                dashboard_section: 'Communautés',
                link_text: 'une communauté'
            }
        }
    };
    
    const langTexts = texts[lang] || texts['fr']; // fallback to French
    return langTexts[groupType] || langTexts['group'];
}

async function connectCommand(sock, chatId, msg) {
    console.log('🔗 [CONNECT] Commande .connect démarrée');
    console.log(`🔗 [CONNECT] chatId: ${chatId}`);
    console.log(`🔗 [CONNECT] msg.key:`, JSON.stringify(msg.key, null, 2));
    
    try {
        const senderId = msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;
        console.log(`🔗 [CONNECT] senderId: ${senderId}`);

        // Pour l'instant, restreindre aux groupes WhatsApp uniquement (@g.us)
        // Les communautés et channels (@newsletter) nécessitent une gestion spéciale
        if (!chatId.endsWith('@g.us')) {
            console.log('❌ [CONNECT] Pas un groupe WhatsApp, chatId:', chatId);
            const errorMsg = i18n.t(senderId, 'commands.connect.not_group') || 
                '❌ Cette commande ne peut être utilisée que dans un groupe WhatsApp.';
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
            return;
        }
        
        const groupType = 'group'; // Pour l'instant, seulement des groupes
        console.log(`✅ [CONNECT] Type validé: ${groupType}`);

        // Obtenir les métadonnées du groupe
        const groupMetadata = await sock.groupMetadata(chatId);
        console.log(`✅ [CONNECT] Métadonnées récupérées: ${groupMetadata.subject} (${groupMetadata.participants.length} participants)`);
        
        const participants = groupMetadata.participants;
        
        // Utiliser la fonction isAdmin centralisée pour vérifier les permissions
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        // Vérifier si l'utilisateur est owner (en plus d'admin)
        const normalizedSenderId = normalizeJid(senderId);
        const normalizedOwner = normalizeJid(groupMetadata.owner);
        const isOwner = normalizedOwner === normalizedSenderId;
        
        console.log(`🔑 [CONNECT] Permissions - Sender admin: ${isSenderAdmin}, Owner: ${isOwner}, Bot admin: ${isBotAdmin}`);

        // Get localized texts
        const localTexts = getLocalizedTexts(senderId, groupType);

        // Vérifier que l'utilisateur est admin ou owner
        if (!isSenderAdmin && !isOwner) {
            console.log('❌ [CONNECT] Utilisateur non autorisé');
            const errorMsg = i18n.t(senderId, 'commands.connect.not_admin', {
                entity_phrase: localTexts.entity_phrase
            }) || 
                `❌ *Autorisation requise*\n\nVous devez être administrateur ou propriétaire ${localTexts.entity_phrase} pour utiliser cette commande.`;
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
            return;
        }

        // Vérifier que le bot est admin
        if (!isBotAdmin) {
            console.log('❌ [CONNECT] Bot non admin');
            const errorMsg = i18n.t(senderId, 'commands.connect.bot_not_admin', {
                entity_phrase: localTexts.entity_phrase
            }) || 
                `❌ *Bot non administrateur*\n\nLe bot doit être administrateur ${localTexts.entity_phrase} pour créer un code de liaison.\n\n💡 Veuillez d'abord promouvoir le bot en tant qu'administrateur.`;
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
            return;
        }

        console.log('✅ [CONNECT] Permissions vérifiées - Bot et utilisateur OK');

        // Vérifier le rate limiting (5 tentatives/heure) - après vérification admin
        const userPhone = senderId.split('@')[0];
        const { allowed, count } = await checkRateLimit(userPhone);
        
        if (!allowed) {
            console.log(`❌ [CONNECT] Rate limit dépassé pour ${userPhone}: ${count}/5`);
            const errorMsg = i18n.t(senderId, 'commands.connect.rate_limit') || 
                `❌ *Limite de tentatives atteinte*\n\nVous avez dépassé la limite de 5 tentatives par heure.\nVeuillez réessayer dans quelques minutes.`;
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
            return;
        }

        console.log('✅ [CONNECT] Rate limit OK');

        // Nettoyer les codes expirés en arrière-plan
        cleanExpiredCodes().catch(err => console.error('Erreur nettoyage:', err));

        // Générer un code unique
        console.log('🔄 [CONNECT] Génération d\'un code unique...');
        let code;
        let isUnique = false;
        
        while (!isUnique) {
            code = generateCode(6);
            console.log(`🔄 [CONNECT] Code généré: ${code}, vérification unicité...`);
            
            // Vérifier si le code existe déjà
            const { data: existing } = await supabase
                .from('group_links_temp')
                .select('code')
                .eq('code', code)
                .single();
            
            if (!existing) {
                isUnique = true;
                console.log(`✅ [CONNECT] Code unique trouvé: ${code}`);
            } else {
                console.log(`⚠️ [CONNECT] Code ${code} existe déjà, nouvelle tentative...`);
            }
        }

        // Calculer la date d'expiration (15 minutes)
        const expiresAt = new Date(Date.now() + (15 * 60 * 1000));
        console.log(`⏰ [CONNECT] Expiration définie: ${expiresAt.toISOString()}`);
        
        console.log('💾 [CONNECT] Insertion dans Supabase...');
        // Stocker le code dans Supabase
        const { data: linkData, error: insertError } = await supabase
            .from('group_links_temp')
            .insert({
                code: code,
                group_id: chatId,
                group_name: groupMetadata.subject,
                group_type: groupType,
                participant_count: participants.length,
                is_admin: isSenderAdmin,
                is_owner: isOwner,
                is_bot_admin: isBotAdmin,
                user_phone: userPhone,
                expires_at: expiresAt.toISOString(),
                user_id: null // Sera mis à jour lors de la vérification par l'utilisateur connecté
            })
            .select()
            .single();
        
        if (insertError) {
            console.error('❌ [CONNECT] Erreur insertion code:', insertError);
            const errorMsg = i18n.t(senderId, 'commands.connect.error') || 
                '❌ Une erreur est survenue lors de la génération du code de liaison.';
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
            return;
        }
        
        console.log('✅ [CONNECT] Code stocké avec succès dans Supabase:', linkData);

        // Calculer le temps d'expiration en minutes
        const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000 / 60);

        // Envoyer le message avec le code
        const successMsg = i18n.t(senderId, 'commands.connect.success', {
            code: code,
            group_name: groupMetadata.subject,
            expires_in: expiresIn,
            entity_type: localTexts.entity_type,
            icon: localTexts.icon,
            dashboard_section: localTexts.dashboard_section,
            link_text: localTexts.link_text
        }) || `✅ *Code de liaison généré avec succès !*

📋 *Code :* \`${code}\`
${localTexts.icon} *${localTexts.entity_type.charAt(0).toUpperCase() + localTexts.entity_type.slice(1)} :* ${groupMetadata.subject}
⏰ *Expire dans :* ${expiresIn} minutes

💡 *Instructions :*
1. Connectez-vous au dashboard web
2. Allez dans la section "${localTexts.dashboard_section}"
3. Cliquez sur "Lier ${localTexts.link_text}"
4. Entrez ce code pour lier ${localTexts.link_text} à votre compte

⚠️ *Important :* 
• Ce code expire dans ${expiresIn} minutes
• Il ne peut être utilisé qu'une seule fois
• Le bot doit rester administrateur pour que la liaison fonctionne`;

        await sock.sendMessage(chatId, { text: successMsg }, { quoted: msg });

        console.log(`✅ [CONNECT] Connection code generated: ${code} for ${groupType} ${chatId} by user ${senderId} (expires: ${expiresAt.toISOString()})`);
        console.log(`📨 [CONNECT] Message envoyé avec succès au ${groupType}`);

    } catch (error) {
        console.error('❌ [CONNECT] Error in connect command:', error);
        const senderId = msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;
        const errorMsg = i18n.t(senderId, 'commands.connect.error') || 
            '❌ Une erreur est survenue lors de la génération du code de liaison.';
        await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
    }
}

module.exports = connectCommand;
