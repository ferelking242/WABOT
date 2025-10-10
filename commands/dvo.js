const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { db } = require('../lib/database');
const fs = require('fs');
const path = require('path');

// Cache global pour partager les médias view-once entre le bot principal et les companions
const globalViewOnceCache = new Map();

// Fonction pour ajouter un média au cache global
function cacheViewOnceMedia(messageId, mediaData) {
    try {
        globalViewOnceCache.set(messageId, {
            mediaData: mediaData,
            timestamp: Date.now(),
            ttl: 10 * 60 * 1000 // 10 minutes TTL
        });
        
        // Nettoyer les anciennes entrées
        cleanupExpiredCache();
    } catch (error) {
        console.error('Erreur cache média view-once:', error);
    }
}

// Nettoyer les entrées expirées du cache
function cleanupExpiredCache() {
    const now = Date.now();
    for (const [messageId, data] of globalViewOnceCache.entries()) {
        if (now - data.timestamp > data.ttl) {
            globalViewOnceCache.delete(messageId);
        }
    }
}

// Récupérer un média depuis le cache
function getCachedViewOnceMedia(messageId) {
    const cached = globalViewOnceCache.get(messageId);
    if (cached && (Date.now() - cached.timestamp < cached.ttl)) {
        return cached.mediaData;
    }
    return null;
}

// Résolveur de nom compatible avec tous les types de sockets (principal + companions)
const resolveDisplayName = async (sock, jid) => {
    if (typeof sock.getName === 'function') {
        try {
            return await sock.getName(jid);
        } catch (e) {
            // Fallback si getName échoue
        }
    }
    
    // Fallback pour les companions et erreurs
    if (jid?.endsWith('@g.us')) {
        try {
            const md = await sock.groupMetadata(jid);
            return md?.subject || 'Groupe';
        } catch {
            return 'Groupe';
        }
    }
    
    // Pour les utilisateurs individuels
    const id = (jid || '').split('@')[0];
    return id || 'Inconnu';
};

// Fonction d'aide pour détecter et extraire les messages vue unique
function unwrapViewOnce(message) {
    if (!message) return { isViewOnce: false };
    
    // Logging conditionnel pour le débogage
    if (process.env.DVO_DEBUG === '1') {
        console.log('📧 Structure du message:', JSON.stringify(message, (key, value) => {
            // Filtrer les données binaires pour éviter le spam dans les logs
            if (key === 'jpegThumbnail' || key === 'fileEncSha256' || key === 'fileSha256' || key === 'mediaKey') {
                return '[BINARY_DATA]';
            }
            return value;
        }, 2));
    }
    
    // Méthode 1: Messages view-once encapsulés dans viewOnceMessage (force la détection)
    if (message.viewOnceMessage?.message) {
        const innerMessage = message.viewOnceMessage.message;
        const result = extractMediaFromMessage(innerMessage, 'viewOnceMessage', true);
        if (process.env.DVO_DEBUG === '1') {
            console.log('🔍 Détection viewOnceMessage:', result.isViewOnce);
        }
        return result;
    }
    
    // Méthode 2: Messages view-once V2 (force la détection)
    if (message.viewOnceMessageV2?.message) {
        const innerMessage = message.viewOnceMessageV2.message;
        const result = extractMediaFromMessage(innerMessage, 'viewOnceMessageV2', true);
        if (process.env.DVO_DEBUG === '1') {
            console.log('🔍 Détection viewOnceMessageV2:', result.isViewOnce);
        }
        return result;
    }
    
    // Méthode 3: Messages view-once V2 Extension (force la détection)
    if (message.viewOnceMessageV2Extension?.message) {
        const innerMessage = message.viewOnceMessageV2Extension.message;
        const result = extractMediaFromMessage(innerMessage, 'viewOnceMessageV2Extension', true);
        if (process.env.DVO_DEBUG === '1') {
            console.log('🔍 Détection viewOnceMessageV2Extension:', result.isViewOnce);
        }
        return result;
    }
    
    // Méthode 4: Messages éphémères contenant des view-once
    if (message.ephemeralMessage?.message) {
        const ephemeralMsg = message.ephemeralMessage.message;
        
        // Essayer de détecter un viewOnce imbriqué dans l'éphémère
        const nestedResult = unwrapViewOnce(ephemeralMsg);
        if (nestedResult.isViewOnce) {
            return nestedResult;
        }
        
        // Sinon, vérifier si le message éphémère lui-même a un flag viewOnce
        // Forcer la détection si l'éphémère contient potentiellement du contenu vue unique
        const hasWrapperIndicators = ephemeralMsg.viewOnceMessage || ephemeralMsg.viewOnceMessageV2 || ephemeralMsg.viewOnceMessageV2Extension;
        return extractMediaFromMessage(ephemeralMsg, 'ephemeralMessage', hasWrapperIndicators);
    }
    
    // Méthode 5: Messages avec flag viewOnce direct sur le média
    return extractMediaFromMessage(message, 'direct');
}

// Fonction d'aide pour extraire le média d'un message avec détection viewOnce
function extractMediaFromMessage(message, source, force = false) {
    if (!message) return { isViewOnce: false };
    
    // Vérifier chaque type de média
    if (message.imageMessage && (force || message.imageMessage.viewOnce)) {
        return {
            isViewOnce: true,
            mediaType: 'image',
            mediaMessage: message.imageMessage,
            caption: message.imageMessage.caption || '',
            source: source
        };
    }
    
    if (message.videoMessage && (force || message.videoMessage.viewOnce)) {
        return {
            isViewOnce: true,
            mediaType: 'video',
            mediaMessage: message.videoMessage,
            caption: message.videoMessage.caption || '',
            source: source
        };
    }
    
    if (message.audioMessage && (force || message.audioMessage.viewOnce)) {
        return {
            isViewOnce: true,
            mediaType: 'audio',
            mediaMessage: message.audioMessage,
            caption: message.audioMessage.caption || '',
            source: source
        };
    }
    
    return { isViewOnce: false };
}

// Gestion de la configuration DVO via Supabase (plus de JSON)
async function getDvoConfig() {
    try {
        const config = await db.getBotConfig('dvo_settings');
        return config || {};
    } catch (error) {
        console.error('Erreur lecture config dvo:', error);
        return {};
    }
}

async function saveDvoConfig(config) {
    try {
        await db.setBotConfig('dvo_settings', config);
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde config dvo:', error);
        return false;
    }
}

async function dvoCommand(sock, chatId, message, userMessage) {
    const params = userMessage.toLowerCase().split(' ').slice(1);
    const senderId = message.key.participant || message.key.remoteJid;
    
    // Gestion des commandes on/off
    if (params.length > 0 && (params[0] === 'on' || params[0] === 'off')) {
        const config = await getDvoConfig();
        const newState = params[0] === 'on';
        config[senderId] = newState;
        await saveDvoConfig(config);
        
        const statusText = newState ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ❌';
        const modeText = newState ? 
            'Les médias vue unique seront automatiquement transférés au bot en privé.' :
            'Le transfert automatique est désactivé.';
            
        await sock.sendMessage(chatId, { 
            text: `*🔄 MODE DVO ${statusText}*\n\n${modeText}` 
        });
        return;
    }
    
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    // Si pas de réponse à un message, afficher le tutoriel
    if (!quotedMessage) {
        const config = await getDvoConfig();
        const userAutoMode = config[senderId] ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ❌';
        
        const tutorial = `*📥 COMMANDE DVO - TÉLÉCHARGEUR VUE UNIQUE*

*Utilisation :*
• *.dvo* - Télécharge et renvoie le fichier vue unique
• *.dvo h* - Télécharge et envoie ici même
• *.dvo +242056621477* - Télécharge et envoie au numéro
• *.dvo save* - Sauvegarde dans le stockage du bot
• *.dvo on* - Active le transfert automatique
• *.dvo off* - Désactive le transfert automatique

*Mode automatique :* ${userAutoMode}

*Formats supportés :*
• Images vue unique
• Vidéos vue unique
• Audio/Messages vocaux vue unique

*Exemples :*
• Répondre à une photo vue unique avec *.dvo*
• Répondre à une vidéo vue unique avec *.dvo h*
• Répondre avec *.dvo +242056621477* pour envoyer ailleurs
• Taper *.dvo on* pour activer le mode automatique

*Note :* Cette commande ne fonctionne qu'en réponse à un message vue unique.`;

        await sock.sendMessage(chatId, { text: tutorial });
        return;
    }

    // Utiliser la fonction d'aide pour détecter le message vue unique
    const viewOnceResult = unwrapViewOnce(quotedMessage);
    
    if (process.env.DVO_DEBUG === '1') {
        console.log('🔍 Résultat détection:', viewOnceResult);
    }
    
    const { isViewOnce, mediaType, mediaMessage, caption } = viewOnceResult;

    if (!isViewOnce) {
        await sock.sendMessage(chatId, { 
            text: '❌ Ce message n\'est pas un message vue unique!\n\n💡 *Astuce*: Répondez directement au message vue unique avec *.dvo*' 
        });
        return;
    }

    try {
        let mediaBuffer = null;
        // Utiliser la même logique d'ID que dans autoTransferViewOnce pour la cohérence
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo;
        const quotedMessageId = quotedMsg?.stanzaId || 
                              (quotedMsg ? `${quotedMsg.remoteJid || message.key.remoteJid}_${quotedMsg.quotedMessage?.messageTimestamp || Date.now()}` : 'unknown');
        
        // Essayer d'abord de télécharger avec le socket actuel
        try {
            console.log(`📥 [DVO] Tentative de téléchargement direct pour ${mediaType}`);
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const buffer = [];
            
            for await (const chunk of stream) {
                buffer.push(chunk);
            }
            
            mediaBuffer = Buffer.concat(buffer);
            console.log(`✅ [DVO] Téléchargement direct réussi (${mediaBuffer.length} bytes)`);
            
            // Populer le cache après un téléchargement réussi pour partager avec les companions
            cacheViewOnceMedia(quotedMessageId, mediaBuffer);
            console.log(`💾 [DVO] Média mis en cache pour les companions (ID: ${quotedMessageId})`);
            
        } catch (downloadError) {
            console.log(`⚠️  [DVO] Téléchargement direct échoué: ${downloadError.message}`);
            
            // Fallback: vérifier le cache global (pour les companions)
            const cachedMedia = getCachedViewOnceMedia(quotedMessageId);
            if (cachedMedia) {
                mediaBuffer = cachedMedia;
                console.log(`🔄 [DVO] Média récupéré depuis le cache (${mediaBuffer.length} bytes)`);
            } else {
                console.log(`❌ [DVO] Média introuvable dans le cache pour message ${quotedMessageId}`);
                throw new Error('Média view-once non accessible par ce socket et absent du cache');
            }
        }
        
        if (!mediaBuffer) {
            throw new Error('Impossible de récupérer le média view-once');
        }
        
        // Réutiliser les paramètres déjà analysés (pas besoin de les recalculer)
        let targetChat = senderId; // Par défaut, envoyer en privé à l'utilisateur qui a tapé la commande
        let sendHere = false;

        if (params.length > 0) {
            const param = params[0];
            
            if (param === 'h') {
                sendHere = true;
                targetChat = chatId; // Envoyer dans le chat actuel
            } else if (param.startsWith('+') || param.startsWith('242')) {
                // Numéro de téléphone détecté
                let phoneNumber = param.replace(/[^0-9]/g, '');
                if (!phoneNumber.startsWith('242')) {
                    phoneNumber = phoneNumber.startsWith('0') ? '242' + phoneNumber.slice(1) : '242' + phoneNumber;
                }
                targetChat = phoneNumber + '@s.whatsapp.net';
            } else if (param === 'save') {
                // Sauvegarder le fichier localement
                const fileName = `viewonce_${Date.now()}.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'ogg'}`;
                const filePath = path.join('./downloads', fileName);
                
                // Créer le dossier s'il n'existe pas
                if (!fs.existsSync('./downloads')) {
                    fs.mkdirSync('./downloads', { recursive: true });
                }
                
                fs.writeFileSync(filePath, mediaBuffer);
                await sock.sendMessage(chatId, { 
                    text: `✅ Fichier sauvegardé: *${fileName}*` 
                });
                return;
            }
        }

        // Obtenir les informations détaillées
        const senderJid = message.key.participant || message.key.remoteJid;
        const senderName = await resolveDisplayName(sock, senderJid);
        const timestamp = new Date(message.messageTimestamp * 1000);
        const dateStr = timestamp.toLocaleDateString('fr-FR');
        const timeStr = timestamp.toLocaleTimeString('fr-FR');
        
        // Obtenir le nom du groupe si c'est dans un groupe
        let groupName = '';
        if (chatId.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(chatId);
                groupName = groupMetadata.subject;
            } catch (e) {
                groupName = 'Groupe inconnu';
            }
        }

        // Construire le message avec informations
        let finalCaption = '';
        if (caption) {
            finalCaption += `${caption}\n\n`;
        }
        
        finalCaption += '--------------Info--------------\n';
        finalCaption += `👤 *Expéditeur*: ${senderName}\n`;
        finalCaption += `📅 *Date*: ${dateStr}\n`;
        finalCaption += `🕒 *Heure*: ${timeStr}\n`;
        if (groupName) {
            finalCaption += `👥 *Groupe*: ${groupName}\n`;
        }
        finalCaption += `📱 *Type*: Message vue unique\n`;
        finalCaption += `🤖 *Récupéré par*: 🤖 *wabot*`;

        // Envoyer le média téléchargé avec gestion d'erreur pour les companions
        let mediaObject = {};
        
        if (mediaType === 'image') {
            mediaObject = {
                image: mediaBuffer,
                caption: finalCaption
            };
        } else if (mediaType === 'video') {
            mediaObject = {
                video: mediaBuffer,
                caption: finalCaption
            };
        } else if (mediaType === 'audio') {
            mediaObject = {
                audio: mediaBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            };
            // Pour l'audio, on envoie les infos séparément d'abord
            try {
                await sock.sendMessage(targetChat, { text: finalCaption });
            } catch (sendError) {
                console.error(`❌ [DVO] Erreur envoi caption audio à ${targetChat}:`, sendError.message);
                
                // Sécurité: Ne pas exposer le contenu sensible au groupe
                if (targetChat !== chatId) {
                    const isPhone = targetChat.includes('@s.whatsapp.net') && !targetChat.includes('@g.us');
                    const phoneDisplay = isPhone ? targetChat.replace('@s.whatsapp.net', '') : targetChat;
                    
                    const errorMsg = `❌ *Envoi audio en privé échoué*\n\n` +
                                   `📱 *Destination:* ${phoneDisplay}\n` +
                                   `⚠️ *Raison:* Permissions insuffisantes ou destination non accessible\n\n` +
                                   `💡 *Solutions:*\n` +
                                   `• Ouvre une conversation privée avec le bot et relance la commande\n` +
                                   `• Utilise \`.dvo h\` pour recevoir le média ici\n\n` +
                                   `🔒 *Le contenu view-once n'a pas été exposé par sécurité*`;
                    
                    await sock.sendMessage(chatId, { text: errorMsg });
                    return;
                } else {
                    // Si on devait déjà envoyer dans le chat actuel, re-throw l'erreur
                    throw sendError;
                }
            }
        }

        // Tentative d'envoi du média
        try {
            await sock.sendMessage(targetChat, { ...mediaObject });
            console.log(`✅ [DVO] Média envoyé avec succès à ${targetChat}`);
        } catch (sendError) {
            console.error(`❌ [DVO] Erreur envoi média à ${targetChat}:`, sendError.message);
            
            // Sécurité: Ne jamais exposer du contenu sensible dans un groupe
            if (targetChat !== chatId) {
                const isPhone = targetChat.includes('@s.whatsapp.net') && !targetChat.includes('@g.us');
                
                if (isPhone) {
                    // Échec d'envoi privé - seulement notifier l'échec, ne pas exposer le contenu
                    const phoneDisplay = targetChat.replace('@s.whatsapp.net', '');
                    const errorMsg = `❌ *Envoi en privé échoué*\n\n` +
                                   `📱 *Numéro:* ${phoneDisplay}\n` +
                                   `⚠️ *Raison:* Permissions insuffisantes ou numéro non accessible\n\n` +
                                   `💡 *Solutions:*\n` +
                                   `• Ouvre une conversation privée avec le bot et relance la commande\n` +
                                   `• Vérifie que le numéro est correct\n` +
                                   `• Utilise \`.dvo h\` pour recevoir le média ici\n\n` +
                                   `🔒 *Le contenu view-once n'a pas été exposé par sécurité*`;
                    
                    await sock.sendMessage(chatId, { text: errorMsg });
                } else {
                    // Autre type de destination échouée
                    const errorMsg = `❌ *Envoi échoué vers ${targetChat}*\n\n` +
                                   `⚠️ Impossible d'accéder à cette destination\n\n` +
                                   `💡 Utilise \`.dvo h\` pour recevoir le média dans ce chat`;
                    
                    await sock.sendMessage(chatId, { text: errorMsg });
                }
            } else {
                // Si on devait déjà envoyer dans le chat actuel, re-throw l'erreur
                throw sendError;
            }
        }
        
        // Pas de message de confirmation - envoi silencieux

    } catch (error) {
        console.error('Erreur lors du téléchargement:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Erreur lors du téléchargement du fichier vue unique.' 
        });
    }
}

// Fonction pour le transfert automatique des médias vue unique
async function autoTransferViewOnce(sock, message) {
    try {
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Éviter de transférer les propres messages du bot
        if (message.key.fromMe) {
            return; // Ne pas transférer les messages du bot lui-même
        }
        
        // Vérifier si l'utilisateur a activé le mode auto
        const config = await getDvoConfig();
        if (!config[senderId]) {
            return; // Mode auto désactivé pour cet utilisateur
        }
        
        // Utiliser la même fonction de détection que dvoCommand pour la cohérence
        const viewOnceResult = unwrapViewOnce(message.message);
        
        if (!viewOnceResult.isViewOnce) {
            return; // Pas un message vue unique
        }
        
        const { mediaType, mediaMessage, caption } = viewOnceResult;
        
        // Télécharger le contenu
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const buffer = [];
        
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        
        const mediaBuffer = Buffer.concat(buffer);
        
        // Mettre le média en cache pour que les companions puissent y accéder
        const messageId = message.key.id || `${message.key.remoteJid}_${message.messageTimestamp}`;
        cacheViewOnceMedia(messageId, mediaBuffer);
        console.log(`💾 [CACHE] Média view-once mis en cache: ${messageId} (${mediaBuffer.length} bytes)`);
        
        // Obtenir les informations
        const senderName = await sock.getName(senderId);
        const timestamp = new Date(message.messageTimestamp * 1000);
        const dateStr = timestamp.toLocaleDateString('fr-FR');
        const timeStr = timestamp.toLocaleTimeString('fr-FR');
        
        // Obtenir le nom du groupe si c'est dans un groupe
        let groupName = '';
        if (chatId.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(chatId);
                groupName = groupMetadata.subject;
            } catch (e) {
                groupName = 'Groupe inconnu';
            }
        }
        
        // Obtenir l'ID du propriétaire du bot (depuis owner.json)
        let ownerJid = (process.env.OWNER_NUMBER || '242065491040') + '@s.whatsapp.net'; // fallback
        try {
            const ownerData = JSON.parse(fs.readFileSync('./data/owner.json'));
            if (typeof ownerData === 'string') {
                ownerJid = ownerData.includes('@') ? ownerData : ownerData + '@s.whatsapp.net';
            } else if (Array.isArray(ownerData) && ownerData.length > 0) {
                ownerJid = ownerData[0];
            }
        } catch (e) {
            console.error('Erreur lecture owner.json:', e);
        }
        
        // Construire le message avec informations
        let finalCaption = '';
        if (caption) {
            finalCaption += `${caption}\n\n`;
        }
        
        finalCaption += '--------------Info--------------\n';
        finalCaption += `👤 *Expéditeur*: ${senderName}\n`;
        finalCaption += `📅 *Date*: ${dateStr}\n`;
        finalCaption += `🕒 *Heure*: ${timeStr}\n`;
        if (groupName) {
            finalCaption += `👥 *Groupe*: ${groupName}\n`;
        }
        finalCaption += `📱 *Type*: Message vue unique (Auto)\n`;
        finalCaption += `🤖 *Transféré par*: 🤖 *wabot*`;
        
        // Envoyer le média au propriétaire du bot (transfert silencieux)
        let mediaObject = {};
        
        if (mediaType === 'image') {
            mediaObject = {
                image: mediaBuffer,
                caption: finalCaption
            };
        } else if (mediaType === 'video') {
            mediaObject = {
                video: mediaBuffer,
                caption: finalCaption
            };
        } else if (mediaType === 'audio') {
            mediaObject = {
                audio: mediaBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            };
            // Pour l'audio, on envoie les infos séparément
            await sock.sendMessage(ownerJid, { text: finalCaption });
        }
        
        await sock.sendMessage(ownerJid, { ...mediaObject });
        
        // Transfert silencieux - pas de notification à l'utilisateur
        
    } catch (error) {
        console.error('Erreur transfert automatique dvo:', error);
        // Erreur silencieuse - ne pas déranger l'utilisateur
    }
}

module.exports = { dvoCommand, autoTransferViewOnce, getDvoConfig, unwrapViewOnce, cacheViewOnceMedia, getCachedViewOnceMedia };