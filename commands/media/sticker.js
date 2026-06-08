const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../../config/settings');
const crypto = require('crypto');
const { getText, getUserLanguage } = require('../../lib/languages');
const store = require('../../lib/lightweight_store');

// Configuration enlevée - plus de tags forward/channel

async function stickerCommand(sock, chatId, message, userMessage = '') {
    const messageToQuote = message;
    let targetMessage = message;

    // Si la commande demande le tutoriel (sans média)
    if ((userMessage === '#sticker' && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage && !message.message?.imageMessage && !message.message?.videoMessage) || (userMessage === '.sticker' && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage && !message.message?.imageMessage && !message.message?.videoMessage)) {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        const tutorial = `${getText(senderId, 'STICKER_TUTORIAL_TITLE', userLang)}\n\n${getText(senderId, 'STICKER_TUTORIAL_BASIC', userLang)}\n\n${getText(senderId, 'STICKER_TUTORIAL_VIDEO', userLang)}\n\n${getText(senderId, 'STICKER_TUTORIAL_SPECS', userLang)}\n\n${getText(senderId, 'STICKER_TUTORIAL_EXAMPLE', userLang)}`;

        await sock.sendMessage(chatId, { text: tutorial });
        return;
    }

    // Si le message est une réponse, récupérer le média de la réponse
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = message.message.extendedTextMessage.contextInfo;
        targetMessage = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
        console.log('Debug - Message quoté détecté pour album/média');
    }

    // Fonction pour unwrapper les messages encapsulés
    function unwrapMessage(msg) {
        if (!msg) return null;
        
        // Unwrap ephemeralMessage
        if (msg.ephemeralMessage?.message) {
            return unwrapMessage(msg.ephemeralMessage.message);
        }
        
        // Unwrap viewOnceMessage et viewOnceMessageV2
        if (msg.viewOnceMessage?.message) {
            return unwrapMessage(msg.viewOnceMessage.message);
        }
        if (msg.viewOnceMessageV2?.message) {
            return unwrapMessage(msg.viewOnceMessageV2.message);
        }
        
        // Unwrap documentWithCaptionMessage
        if (msg.documentWithCaptionMessage?.message) {
            return unwrapMessage(msg.documentWithCaptionMessage.message);
        }
        
        return msg;
    }

    // Détecter tous les médias dans le message (images multiples, vidéos, etc.)
    let mediaMessages = [];
    
    // Unwrapper le message cible d'abord
    const unwrappedMessage = unwrapMessage(targetMessage.message);
    targetMessage.message = unwrappedMessage || targetMessage.message;
    
    console.log('Debug - Recherche de médias dans le message cible...');
    
    // Vérifier s'il y a un média direct
    if (targetMessage.message?.imageMessage) {
        console.log('Détecté imageMessage direct');
        mediaMessages.push({
            media: targetMessage.message.imageMessage,
            type: 'image',
            message: targetMessage
        });
    }
    if (targetMessage.message?.videoMessage) {
        console.log('Détecté videoMessage direct');
        mediaMessages.push({
            media: targetMessage.message.videoMessage,
            type: 'video',
            message: targetMessage
        });
    }
    if (targetMessage.message?.documentMessage) {
        console.log('Détecté documentMessage direct');
        mediaMessages.push({
            media: targetMessage.message.documentMessage,
            type: 'document',
            message: targetMessage
        });
    }

    // Détecter les albums WhatsApp (vraie structure)
    // Dans WhatsApp, les albums sont souvent envoyés comme des messages séparés avec un contextInfo.groupedMessages
    const contextInfo = targetMessage.message?.extendedTextMessage?.contextInfo || 
                        targetMessage.message?.imageMessage?.contextInfo ||
                        targetMessage.message?.videoMessage?.contextInfo;
                        
    if (contextInfo?.groupedMessages && contextInfo.groupedMessages.length > 1) {
        console.log('Détecté groupe de messages via contextInfo.groupedMessages:', contextInfo.groupedMessages.length);
        
        let processedGroupMessages = 0;
        let failedGroupMessages = 0;
        
        // Récupérer tous les messages du groupe
        for (const groupedMsg of contextInfo.groupedMessages) {
            try {
                if (groupedMsg.stanzaId && groupedMsg.stanzaId !== targetMessage.key.id) {
                    // Essayer de charger le message depuis le store Baileys
                    let groupMessage = null;
                    
                    // Tenter différentes méthodes pour récupérer le message
                    if (sock.loadMessage) {
                        try {
                            groupMessage = await sock.loadMessage(chatId, groupedMsg.stanzaId);
                        } catch (loadError) {
                            console.log('Échec loadMessage, tentative store...');
                        }
                    }
                    
                    // Fallback: utiliser le store local
                    if (!groupMessage) {
                        try {
                            groupMessage = await store.loadMessage(chatId, groupedMsg.stanzaId);
                        } catch (storeLoadError) {
                            console.log('Échec store.loadMessage pour stanzaId');
                        }
                    }
                    
                    if (groupMessage && groupMessage.message) {
                        const unwrappedGroupMsg = unwrapMessage(groupMessage.message);
                        if (unwrappedGroupMsg?.imageMessage) {
                            mediaMessages.push({
                                media: unwrappedGroupMsg.imageMessage,
                                type: 'image',
                                message: { ...groupMessage, message: unwrappedGroupMsg },
                                index: processedGroupMessages
                            });
                            processedGroupMessages++;
                        }
                        if (unwrappedGroupMsg?.videoMessage) {
                            mediaMessages.push({
                                media: unwrappedGroupMsg.videoMessage,
                                type: 'video',
                                message: { ...groupMessage, message: unwrappedGroupMsg },
                                index: processedGroupMessages
                            });
                            processedGroupMessages++;
                        }
                    } else {
                        failedGroupMessages++;
                        console.log('Message du groupe non récupérable:', groupedMsg.stanzaId);
                    }
                }
            } catch (error) {
                failedGroupMessages++;
                console.error('Erreur lors de la récupération du message groupé:', error);
            }
        }
        
        console.log(`Groupe traité: ${processedGroupMessages} réussis, ${failedGroupMessages} échecs`);
        
        // Si certains messages du groupe n'ont pas pu être récupérés, informer l'utilisateur
        if (failedGroupMessages > 0 && processedGroupMessages > 0) {
            console.log(`Attention: ${failedGroupMessages} images du groupe n'ont pas pu être récupérées`);
        }
    }

    // Gestion spéciale pour albumMessage (groupes d'images)
    if (targetMessage.message?.albumMessage) {
        console.log('AlbumMessage détecté, extraction des médias...');
        
        // Vérifier si l'albumMessage contient des médias directement
        if (targetMessage.message.albumMessage.imageMessage) {
            console.log('Image trouvée dans albumMessage');
            mediaMessages.push({
                media: targetMessage.message.albumMessage.imageMessage,
                type: 'image',
                message: { 
                    ...targetMessage, 
                    message: { imageMessage: targetMessage.message.albumMessage.imageMessage }
                }
            });
        }
        
        if (targetMessage.message.albumMessage.videoMessage) {
            console.log('Vidéo trouvée dans albumMessage');
            mediaMessages.push({
                media: targetMessage.message.albumMessage.videoMessage,
                type: 'video',
                message: { 
                    ...targetMessage, 
                    message: { videoMessage: targetMessage.message.albumMessage.videoMessage }
                }
            });
        }
        
        // Si l'albumMessage n'a pas de médias directs, rechercher dans les messages récents du store
        const hasDirectMedia = targetMessage.message.albumMessage.imageMessage || 
                              targetMessage.message.albumMessage.videoMessage ||
                              targetMessage.message.albumMessage.documentMessage;
        
        if (!hasDirectMedia) {
            console.log('AlbumMessage vide - recherche des médias dans les messages récents...');
            
            try {
                // Récupérer les messages récents de ce chat depuis le store
                const recentMessages = store.messages[chatId] || [];
                console.log(`DEBUG - Messages dans le store: ${recentMessages.length}`);
                console.log(`DEBUG - ChatId: ${chatId}`);
                console.log(`DEBUG - Participant recherché: ${targetMessage.key.participant}`);
                
                if (recentMessages.length > 0) {
                    // Déboguer ce qu'il y a dans les messages récents
                    console.log(`DEBUG - Types de messages récents:`, recentMessages.slice(-5).map(msg => {
                        if (!msg || !msg.message) return 'null';
                        const unwrapped = unwrapMessage(msg.message);
                        if (!unwrapped) return 'unwrap-fail';
                        return Object.keys(unwrapped).join(',');
                    }));
                    
                    console.log(`DEBUG - Participants récents:`, recentMessages.slice(-5).map(msg => msg?.key?.participant || 'no-participant'));
                    // Chercher les messages avec médias du même participant dans les 5 dernières minutes
                    const albumParticipant = targetMessage.key.participant;
                    const albumTimestamp = targetMessage.messageTimestamp || Date.now() / 1000; // Timestamp en secondes
                    const timeWindow = 10800; // 3 heures - fenêtre large pour détecter les albums anciens
                    
                    console.log(`Recherche médias du participant dans une fenêtre de ${timeWindow}s...`);
                    
                    // Filtrer les messages récents pour trouver ceux du même album
                    const albumMediaMessages = recentMessages.filter(msg => {
                        if (!msg || !msg.key || !msg.message) return false;
                        
                        // Même participant (normaliser les formats @lid et @s.whatsapp.net)
                        const normalize = (id) => id ? id.replace(/@.*$/, '') : '';
                        const msgParticipant = normalize(msg.key.participantAlt || msg.key.participant || msg.key.remoteJid);
                        const targetParticipant = normalize(albumParticipant);
                        
                        if (msgParticipant !== targetParticipant) return false;
                        
                        // Dans la fenêtre de temps (basé sur messageTimestamp)
                        const msgTimestamp = parseInt(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
                        const albumTs = parseInt(albumTimestamp) || Math.floor(Date.now() / 1000);
                        const timeDiff = Math.abs(msgTimestamp - albumTs);
                        
                        console.log(`DEBUG - Comparaison temps: msg=${msgTimestamp}, album=${albumTs}, diff=${timeDiff}s`);
                        
                        if (timeDiff > timeWindow) return false;
                        
                        // Unwrap le message pour vérifier le contenu
                        const unwrapped = unwrapMessage(msg.message);
                        if (!unwrapped) return false;
                        
                        // A du contenu média
                        return unwrapped.imageMessage || unwrapped.videoMessage || unwrapped.documentMessage;
                    }); // Pas de limitation - traiter tous les médias de l'album
                    
                    console.log(`${albumMediaMessages.length} médias trouvés dans l'album`);
                    
                    // Si aucun média trouvé par participant spécifique, essayer TOUS les participants récents
                    if (albumMediaMessages.length === 0) {
                        console.log('Recherche alternative : tous les médias récents (tous participants)...');
                        
                        // Chercher les derniers messages avec médias de N'IMPORTE QUEL participant
                        const fallbackMessages = recentMessages
                            .filter(msg => {
                                if (!msg || !msg.key || !msg.message) return false;
                                
                                const unwrapped = unwrapMessage(msg.message);
                                if (!unwrapped) return false;
                                
                                return unwrapped.imageMessage || unwrapped.videoMessage || unwrapped.documentMessage;
                            })
; // Pas de limitation - traiter tous les médias trouvés
                        
                        console.log(`${fallbackMessages.length} médias trouvés en recherche alternative (tous participants)`);
                        albumMediaMessages.push(...fallbackMessages);
                    }
                    
                    // Ajouter chaque média trouvé
                    albumMediaMessages.forEach((msg, index) => {
                        const unwrapped = unwrapMessage(msg.message);
                        
                        if (unwrapped.imageMessage) {
                            console.log(`Ajout image ${index + 1} de l'album`);
                            mediaMessages.push({
                                media: unwrapped.imageMessage,
                                type: 'image',
                                message: { ...msg, message: unwrapped }
                            });
                        }
                        
                        if (unwrapped.videoMessage) {
                            console.log(`Ajout vidéo ${index + 1} de l'album`);
                            mediaMessages.push({
                                media: unwrapped.videoMessage,
                                type: 'video',
                                message: { ...msg, message: unwrapped }
                            });
                        }
                        
                        if (unwrapped.documentMessage && unwrapped.documentMessage.mimetype?.startsWith('image/')) {
                            console.log(`Ajout document image ${index + 1} de l'album`);
                            mediaMessages.push({
                                media: unwrapped.documentMessage,
                                type: 'document',
                                message: { ...msg, message: unwrapped }
                            });
                        }
                    });
                }
            } catch (storeError) {
                console.error('Erreur lors de la recherche dans le store:', storeError);
                // Continue avec le traitement normal si le store échoue
            }
        }
    }

    console.log(`Debug - Médias détectés: ${mediaMessages.length}`);

    // Pas de limitation globale - traiter tous les médias de l'album
    console.log(`📊 Album détecté: ${mediaMessages.length} médias à traiter`);

    // Si aucun média trouvé, afficher l'erreur
    if (mediaMessages.length === 0) {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = getText(senderId, 'STICKER_REPLY_TO_MEDIA', userLang);
        await sock.sendMessage(chatId, { 
            text: errorMsg
        }, { quoted: messageToQuote });
        return;
    }

    try {
        // Réagir avec emoji pour signaler le début du traitement
        await sock.sendMessage(chatId, {
            react: {
                text: '⏳',
                key: messageToQuote.key
            }
        });

        // Analyser les paramètres de la commande
        const params = userMessage.toLowerCase().split(' ').slice(1);
        let packName = 'wabot';
        let authorName = settings.author || 'wabot team';
        let duration = null;
        let timeRange = null;
        let startTime = 0;
        let fps = 12; // FPS par défaut plus bas pour réduire la taille

        // Parser les paramètres
        for (const param of params) {
            if (param.includes(':')) {
                const [key, value] = param.split(':');
                switch (key) {
                    case 'pack':
                        packName = value;
                        break;
                    case 'author':
                        authorName = value;
                        break;
                    case 'duration':
                        duration = Math.min(parseInt(value), 8); // Max 8 secondes
                        break;
                    case 'time':
                        if (value.includes('-')) {
                            const [start, end] = value.split('-').map(Number);
                            timeRange = { start, end: Math.min(end, start + 8) }; // Max 8 secondes
                        }
                        break;
                    case 'start':
                        startTime = parseInt(value);
                        break;
                    case 'fps':
                        fps = Math.min(Math.max(parseInt(value), 6), 15); // Entre 6 et 15 FPS
                        break;
                }
            }
        }

        // Créer le répertoire temp s'il n'existe pas
        const tmpDir = path.join(process.cwd(), 'data', 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Informer l'utilisateur du nombre de stickers qui vont être créés
        if (mediaMessages.length > 1) {
            await sock.sendMessage(chatId, { 
                text: `🎯 *Création de ${mediaMessages.length} stickers en cours...*`
            }, { quoted: messageToQuote });
        }

        let successCount = 0;
        let errorCount = 0;

        // Traiter chaque média individuellement
        for (let i = 0; i < mediaMessages.length; i++) {
            const mediaItem = mediaMessages[i];
            const currentMessage = mediaItem.message;
            const mediaMessage = mediaItem.media;

            try {
                console.log(`Processing media ${i + 1}/${mediaMessages.length} (type: ${mediaItem.type})`);

                // Télécharger le média
                const mediaBuffer = await downloadMediaMessage(currentMessage, 'buffer', {}, { 
                    logger: undefined, 
                    reuploadRequest: sock.updateMediaMessage 
                });

                if (!mediaBuffer) {
                    console.error(`Failed to download media ${i + 1}`);
                    errorCount++;
                    continue;
                }

                // Générer les chemins des fichiers temporaires uniques pour chaque média
                const tempInput = path.join(tmpDir, `temp_${Date.now()}_${i}`);
                const tempOutput = path.join(tmpDir, `sticker_${Date.now()}_${i}.webp`);

                // Écrire le média dans le fichier temporaire
                fs.writeFileSync(tempInput, mediaBuffer);

                // Vérifier si le média est animé
                const isAnimated = mediaMessage.mimetype?.includes('gif') || 
                                  mediaMessage.mimetype?.includes('video') || 
                                  mediaMessage.seconds > 0 ||
                                  mediaMessage.gifPlayback;

                // Construire la commande ffmpeg optimisée pour WhatsApp
                let timeFilter = '';
                if (timeRange) {
                    const maxDuration = Math.min(timeRange.end - timeRange.start, 8);
                    timeFilter = `-ss ${timeRange.start} -t ${maxDuration}`;
                } else if (startTime > 0 && duration) {
                    const maxDuration = Math.min(duration, 8);
                    timeFilter = `-ss ${startTime} -t ${maxDuration}`;
                } else if (startTime > 0) {
                    timeFilter = `-ss ${startTime} -t 6`; // 6 secondes par défaut
                } else if (duration) {
                    const maxDuration = Math.min(duration, 8);
                    timeFilter = `-t ${maxDuration}`;
                } else if (isAnimated) {
                    timeFilter = `-t 6`; // 6 secondes par défaut pour animations
                }

                // Commande ffmpeg optimisée pour remplir complètement le sticker 512x512
                const ffmpegCommand = isAnimated
                    ? `ffmpeg ${timeFilter} -i "${tempInput}" -vcodec libwebp -vf "fps=${fps},scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -compression_level 6 -quality 70 -method 6 -loop 0 -preset picture -an -vsync 0 -y "${tempOutput}"`
                    : `ffmpeg -i "${tempInput}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -compression_level 6 -quality 80 -method 6 -lossless 0 -y "${tempOutput}"`;

                await new Promise((resolve, reject) => {
                    exec(ffmpegCommand, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`FFmpeg error for media ${i + 1}:`, error);
                            console.error('FFmpeg stderr:', stderr);
                            reject(error);
                        } else {
                            console.log(`FFmpeg success for media ${i + 1} (${isAnimated ? 'animated' : 'static'} sticker)`);
                            resolve();
                        }
                    });
                });

                // Lire le fichier WebP
                const webpBuffer = fs.readFileSync(tempOutput);
                const fileSizeKB = Math.round(webpBuffer.length / 1024);

                // Vérifier la taille du fichier selon les limites WhatsApp
                const maxSize = isAnimated ? 500 : 100; // 500KB pour animé, 100KB pour statique
                if (fileSizeKB > maxSize) {
                    // Si le fichier est trop gros, réessayer avec une qualité plus basse
                    const lowerQuality = isAnimated ? 50 : 60;
                    const retryCommand = isAnimated
                        ? `ffmpeg ${timeFilter} -i "${tempInput}" -vcodec libwebp -vf "fps=${Math.max(fps-2, 6)},scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -compression_level 6 -quality ${lowerQuality} -method 6 -loop 0 -preset picture -an -vsync 0 -y "${tempOutput}"`
                        : `ffmpeg -i "${tempInput}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -compression_level 6 -quality ${lowerQuality} -method 6 -lossless 0 -y "${tempOutput}"`;

                    await new Promise((resolve, reject) => {
                        exec(retryCommand, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`Retry FFmpeg error for media ${i + 1}:`, error);
                                reject(error);
                            } else {
                                console.log(`FFmpeg retry success for media ${i + 1} with lower quality`);
                                resolve();
                            }
                        });
                    });
                }

                // Relire le fichier après optimisation
                const finalBuffer = fs.readFileSync(tempOutput);
                const finalSizeKB = Math.round(finalBuffer.length / 1024);
                
                console.log(`Sticker ${i + 1}/${mediaMessages.length} ${isAnimated ? 'animé' : 'statique'} créé: ${finalSizeKB}KB (limite: ${maxSize}KB)`);

                // Envoyer le sticker
                await sock.sendMessage(chatId, { 
                    sticker: finalBuffer
                }, { quoted: messageToQuote });

                // Nettoyer les fichiers temporaires
                try {
                    fs.unlinkSync(tempInput);
                    fs.unlinkSync(tempOutput);
                } catch (err) {
                    console.error(`Error cleaning up temp files for media ${i + 1}:`, err);
                }

                successCount++;
                
                // Délai entre les stickers pour éviter le spam
                if (i < mediaMessages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (mediaError) {
                console.error(`Error processing media ${i + 1}:`, mediaError);
                errorCount++;
            }
        }

        // Message final avec le résumé
        let finalMessage = '';
        if (successCount > 0 && errorCount === 0) {
            if (successCount === 1) {
                finalMessage = '✅ *Sticker créé avec succès !*';
            } else {
                finalMessage = `✅ *${successCount} stickers créés avec succès !*`;
            }
        } else if (successCount > 0 && errorCount > 0) {
            finalMessage = `⚠️ *${successCount} stickers créés, ${errorCount} échecs*`;
        } else {
            finalMessage = '❌ *Échec de création des stickers*';
        }

        await sock.sendMessage(chatId, { 
            text: finalMessage
        }, { quoted: messageToQuote });

        // Réaction de succès finale
        await sock.sendMessage(chatId, {
            react: {
                text: successCount > 0 ? '✅' : '❌',
                key: messageToQuote.key
            }
        });

    } catch (error) {
        console.error('Error in sticker command:', error);
        
        // Réaction d'erreur
        await sock.sendMessage(chatId, {
            react: {
                text: '❌',
                key: messageToQuote.key
            }
        });
        
        await sock.sendMessage(chatId, { 
            text: '❌ *Échec de création du sticker. Réessayez plus tard.*'
        }, { quoted: messageToQuote });
    }
}

module.exports = stickerCommand;