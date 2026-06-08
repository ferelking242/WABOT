const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const { getText } = require('../lib/i18n');
const { db } = require('../lib/database');

// Helper pour convertir le stream de downloadContentFromMessage en Buffer
async function downloadToBuffer(message, type) {
    try {
        const stream = await downloadContentFromMessage(message, type);
        const buffers = [];
        
        for await (const chunk of stream) {
            buffers.push(chunk);
        }
        
        return Buffer.concat(buffers);
    } catch (err) {
        console.error('Erreur téléchargement média:', err);
        return null;
    }
}

const messageStore = new Map(); // Cache mémoire pour accès rapide
const phantomMessageStore = new Map(); // Stockage des messages fantômes actifs
const TEMP_MEDIA_DIR = path.join(__dirname, '../data/tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Fonction pour nettoyer le stockage temporaire (ASYNC)
const cleanTempFolderIfLarge = async () => {
    try {
        const { readdir, stat, unlink } = require('fs').promises;
        const files = await readdir(TEMP_MEDIA_DIR);
        let totalSize = 0;
        
        // Calculer la taille totale de façon asynchrone
        for (const file of files) {
            const filePath = path.join(TEMP_MEDIA_DIR, file);
            try {
                const stats = await stat(filePath);
                if (stats.isFile()) {
                    totalSize += stats.size;
                }
            } catch (err) {
                // Fichier peut avoir été supprimé entre temps
                continue;
            }
        }
        
        const sizeMB = totalSize / (1024 * 1024);
        if (sizeMB > 100) {
            // Supprimer les fichiers de façon asynchrone
            const deletePromises = files.map(file => 
                unlink(path.join(TEMP_MEDIA_DIR, file)).catch(err => {
                    // Ignore les erreurs de fichiers déjà supprimés
                    if (err.code !== 'ENOENT') {
                        console.error('Erreur suppression fichier:', err);
                    }
                })
            );
            await Promise.all(deletePromises);
            console.log('🧹 Nettoyage du dossier temporaire effectué');
        }
    } catch (err) {
        console.error('Erreur nettoyage temporaire:', err);
    }
};

// Nettoyage périodique toutes les minutes
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Configuration Phantom Delete avec cache
let configCache = null;
let configCacheExpiry = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadPhantomDeleteConfig() {
    try {
        // Vérifier le cache
        if (configCache && Date.now() < configCacheExpiry) {
            return configCache;
        }

        // Charger depuis la DB
        const config = await db.getBotConfig('phantomdelete');
        const finalConfig = config || { 
            enabled: false, 
            autoRestore: false,
            notifyOwner: true,
            storeDuration: 7 // jours
        };

        // Mettre en cache
        configCache = finalConfig;
        configCacheExpiry = Date.now() + CONFIG_CACHE_TTL;

        return finalConfig;
    } catch (error) {
        console.error('Erreur chargement config phantom:', error);
        return { enabled: false };
    }
}

async function savePhantomDeleteConfig(config) {
    try {
        await db.setBotConfig('phantomdelete', config);
        // Invalider le cache après sauvegarde
        configCache = null;
        configCacheExpiry = 0;
    } catch (err) {
        console.error('Erreur sauvegarde config phantom:', err);
    }
}

// Commande de configuration
async function handlePhantomDeleteCommand(sock, chatId, message, match) {
    console.log('🔍 [DEBUG] handlePhantomDeleteCommand called');
    console.log('🔍 [DEBUG] chatId:', chatId);
    console.log('🔍 [DEBUG] match:', match);
    
    const userId = message.key.remoteJid;
    const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    console.log('🔍 [DEBUG] userId:', userId);
    console.log('🔍 [DEBUG] senderId:', senderId);
    
    // Utiliser le système centralisé d'ownership
    console.log('🔍 [DEBUG] Loading isOwner function...');
    const isOwnerOrSudoFunction = require('../lib/isOwner');
    console.log('🔍 [DEBUG] Calling isOwner check...');
    const isOwner = await isOwnerOrSudoFunction(senderId, sock, chatId);
    console.log('🔍 [DEBUG] isOwner result:', isOwner);
    
    if (!isOwner) {
        return sock.sendMessage(chatId, { text: getText(userId, 'messages.owner_only') });
    }

    const config = await loadPhantomDeleteConfig();

    if (!match) {
        const status = config.enabled ? '✅ Activé' : '❌ Désactivé';
        const autoRestore = config.autoRestore ? '✅ Auto' : '❌ Manuel';
        
        return sock.sendMessage(chatId, {
            text: `🔄 *PHANTOM DELETE SYSTEM* 🔄\n\n` +
                  `📊 *Statut:* ${status}\n` +
                  `🤖 *Restauration:* ${autoRestore}\n` +
                  `🔔 *Notifications:* ${config.notifyOwner ? '✅' : '❌'}\n` +
                  `⏰ *Durée stockage:* ${config.storeDuration} jours\n\n` +
                  `*Commandes disponibles:*\n` +
                  `\`.phantomdelete on\` - Activer le système\n` +
                  `\`.phantomdelete off\` - Désactiver le système\n` +
                  `\`.phantomdelete auto on\` - Auto-restauration\n` +
                  `\`.phantomdelete auto off\` - Restauration manuelle\n` +
                  `\`.phantomdelete notify on/off\` - Notifications\n` +
                  `\`.phantomdelete status\` - Statistiques`
        });
    }

    const args = match.split(' ');
    const action = args[0];
    const option = args[1];

    switch(action) {
        case 'on':
            config.enabled = true;
            // Envoyer la réponse immédiatement
            sock.sendMessage(chatId, { 
                text: '✅ *Phantom Delete activé!*\n\nLes messages supprimés seront maintenant convertis en messages fantômes interactifs.' 
            }).catch(() => {});
            // Sauvegarder de manière asynchrone
            savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
            return;

        case 'off':
            config.enabled = false;
            // Envoyer la réponse immédiatement
            sock.sendMessage(chatId, { 
                text: '❌ *Phantom Delete désactivé*\n\nLes messages supprimés ne seront plus traités.' 
            }).catch(() => {});
            // Sauvegarder de manière asynchrone
            savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
            return;

        case 'auto':
            if (option === 'on') {
                config.autoRestore = true;
                // Envoyer la réponse immédiatement
                sock.sendMessage(chatId, { 
                    text: '🤖 *Auto-restauration activée*\n\nLes messages seront automatiquement restaurés après suppression.' 
                }).catch(() => {});
                // Sauvegarder de manière asynchrone
                savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
                return;
            } else if (option === 'off') {
                config.autoRestore = false;
                // Envoyer la réponse immédiatement
                sock.sendMessage(chatId, { 
                    text: '✋ *Restauration manuelle activée*\n\nVous devrez cliquer sur les boutons pour restaurer.' 
                }).catch(() => {});
                // Sauvegarder de manière asynchrone
                savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
                return;
            }
            break;

        case 'notify':
            if (option === 'on') {
                config.notifyOwner = true;
                // Envoyer la réponse immédiatement
                sock.sendMessage(chatId, { 
                    text: '🔔 *Notifications activées*\n\nVous serez notifié des messages supprimés.' 
                }).catch(() => {});
                // Sauvegarder de manière asynchrone
                savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
                return;
            } else if (option === 'off') {
                config.notifyOwner = false;
                // Envoyer la réponse immédiatement
                sock.sendMessage(chatId, { 
                    text: '🔕 *Notifications désactivées*\n\nAucune notification ne sera envoyée.' 
                }).catch(() => {});
                // Sauvegarder de manière asynchrone
                savePhantomDeleteConfig(config).catch(err => console.error('Save phantom config error:', err));
                return;
            }
            break;

        case 'status':
            const totalStored = messageStore.size;
            const activePhantoms = phantomMessageStore.size;
            return sock.sendMessage(chatId, {
                text: `📊 *STATISTIQUES PHANTOM DELETE*\n\n` +
                      `💾 *Messages stockés:* ${totalStored}\n` +
                      `👻 *Messages fantômes actifs:* ${activePhantoms}\n` +
                      `🗄️ *Espace utilisé:* ${Math.round(getFolderSizeInMB() * 100) / 100} MB\n` +
                      `⚡ *Statut système:* ${config.enabled ? 'Opérationnel' : 'Inactif'}`
            });

        default:
            return sock.sendMessage(chatId, { 
                text: '❌ Commande non reconnue. Utilisez .phantomdelete pour voir l aide.' 
            });
    }
}

// Fonction pour obtenir la taille du dossier en MB
function getFolderSizeInMB() {
    try {
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        let totalSize = 0;
        
        for (const file of files) {
            const filePath = path.join(TEMP_MEDIA_DIR, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }
        
        return totalSize / (1024 * 1024);
    } catch (err) {
        console.error('Erreur calcul taille dossier:', err);
        return 0;
    }
}

// Stocker les messages entrants
async function storeMessage(message) {
    try {
        const config = await loadPhantomDeleteConfig();
        if (!config.enabled) return;

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let mediaMimeType = '';
        let contextInfo = {};

        const sender = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const group = message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null;

        // Extraire les informations de contexte
        if (message.message?.extendedTextMessage?.contextInfo) {
            const ctx = message.message.extendedTextMessage.contextInfo;
            contextInfo = {
                mentionedJid: ctx.mentionedJid || [],
                quotedMessage: ctx.quotedMessage ? {
                    id: ctx.stanzaId,
                    participant: ctx.participant,
                    content: ctx.quotedMessage.conversation || ctx.quotedMessage.extendedTextMessage?.text || '[Média]'
                } : null,
                isForwarded: ctx.forwardingScore > 0,
                forwardedNewsletterMessageInfo: ctx.forwardedNewsletterMessageInfo || null
            };
        }

        // Détecter et stocker le contenu
        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            mediaMimeType = message.message.imageMessage.mimetype || 'image/jpeg';
            
            try {
                const buffer = await downloadToBuffer(message.message.imageMessage, 'image');
                if (buffer) {
                    const ext = mediaMimeType.includes('png') ? 'png' : 'jpg';
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                }
            } catch (err) {
                console.error('Erreur téléchargement image:', err);
            }
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            mediaMimeType = message.message.videoMessage.mimetype || 'video/mp4';
            
            try {
                const buffer = await downloadToBuffer(message.message.videoMessage, 'video');
                if (buffer) {
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                    await writeFile(mediaPath, buffer);
                }
            } catch (err) {
                console.error('Erreur téléchargement vidéo:', err);
            }
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            mediaMimeType = message.message.stickerMessage.mimetype || 'image/webp';
            
            try {
                const buffer = await downloadToBuffer(message.message.stickerMessage, 'sticker');
                if (buffer) {
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                    await writeFile(mediaPath, buffer);
                }
            } catch (err) {
                console.error('Erreur téléchargement sticker:', err);
            }
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            mediaMimeType = message.message.audioMessage.mimetype || 'audio/ogg';
            
            try {
                const buffer = await downloadToBuffer(message.message.audioMessage, 'audio');
                if (buffer) {
                    const ext = mediaMimeType.includes('mp3') ? 'mp3' : 'ogg';
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                }
            } catch (err) {
                console.error('Erreur téléchargement audio:', err);
            }
        } else if (message.message?.documentMessage) {
            mediaType = 'document';
            content = message.message.documentMessage.fileName || 'Document';
            mediaMimeType = message.message.documentMessage.mimetype || 'application/octet-stream';
            
            try {
                const buffer = await downloadToBuffer(message.message.documentMessage, 'document');
                if (buffer) {
                    const ext = message.message.documentMessage.fileName?.split('.').pop() || 'bin';
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                }
            } catch (err) {
                console.error('Erreur téléchargement document:', err);
            }
        }

        // Stocker en mémoire pour accès rapide
        messageStore.set(messageId, {
            messageId,
            content,
            mediaType,
            mediaPath,
            mediaMimeType,
            sender,
            group,
            contextInfo,
            timestamp: new Date().toISOString(),
            autoCleanupAt: new Date(Date.now() + (config.storeDuration * 24 * 60 * 60 * 1000)).toISOString()
        });

        console.log(`💾 Message stocké: ${messageId} (${mediaType || 'texte'})`);

    } catch (err) {
        console.error('Erreur stockage message phantom:', err);
    }
}

// Créer un message fantôme interactif
async function createPhantomMessage(deletedMessageData, sock, chatId) {
    try {
        const { messageId, content, mediaType, sender, group, contextInfo, timestamp } = deletedMessageData;
        
        const senderName = sender.split('@')[0];
        const groupName = group ? (await sock.groupMetadata(group).catch(() => ({ subject: 'Groupe' }))).subject : '';
        const messageTime = new Date(timestamp).toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        // Créer le texte du message fantôme
        let phantomText = `🔄 *Message supprimé disponible*\n`;
        phantomText += `┌─────────────────────────────\n`;
        phantomText += `│ 👤 De: @${senderName}\n`;
        if (groupName) phantomText += `│ 👥 Groupe: ${groupName}\n`;
        phantomText += `│ 🕒 Heure: ${messageTime}\n`;
        if (mediaType) phantomText += `│ 📎 Type: ${getMediaEmoji(mediaType)} ${mediaType.toUpperCase()}\n`;
        if (content && content.length > 0) {
            const preview = content.length > 50 ? content.substring(0, 47) + '...' : content;
            phantomText += `│ 💬 Aperçu: ${preview}\n`;
        }
        if (contextInfo?.quotedMessage) {
            phantomText += `│ 💭 En réponse à: ${contextInfo.quotedMessage.content.substring(0, 30)}...\n`;
        }
        phantomText += `│\n`;
        phantomText += `│ 👆 Touchez pour restaurer\n`;
        phantomText += `└─────────────────────────────`;

        // Créer les boutons interactifs
        const buttons = [
            {
                buttonId: `phantom_restore_${messageId}`,
                buttonText: { displayText: '🔄 Restaurer ici' },
                type: 1
            },
            {
                buttonId: `phantom_forward_${messageId}`,
                buttonText: { displayText: '📨 Envoyer privé' },
                type: 1
            },
            {
                buttonId: `phantom_info_${messageId}`,
                buttonText: { displayText: 'ℹ️ Détails' },
                type: 1
            }
        ];

        // Envoyer le message fantôme avec boutons
        const phantomMessage = await sock.sendMessage(chatId, {
            text: phantomText,
            buttons: buttons,
            headerType: 1,
            mentions: [sender]
        });

        // Stocker l'association message fantôme
        if (phantomMessage?.key?.id) {
            phantomMessageStore.set(phantomMessage.key.id, {
                originalMessageId: messageId,
                phantomMessageId: phantomMessage.key.id,
                chatId: chatId,
                createdAt: new Date().toISOString()
            });
            
            console.log(`👻 Message fantôme créé: ${phantomMessage.key.id} pour ${messageId}`);
        }

        return phantomMessage;

    } catch (err) {
        console.error('Erreur création message fantôme:', err);
        return null;
    }
}

function getMediaEmoji(mediaType) {
    switch(mediaType) {
        case 'image': return '🖼️';
        case 'video': return '🎥';
        case 'audio': return '🎵';
        case 'sticker': return '😊';
        case 'document': return '📄';
        default: return '📎';
    }
}

// Gérer la suppression de message et créer le fantôme
async function handlePhantomMessageRevocation(sock, revocationMessage) {
    try {
        const config = await loadPhantomDeleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participantAlt || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const chatId = revocationMessage.key.remoteJid;
        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        // Ne pas traiter nos propres suppressions
        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const originalMessage = messageStore.get(messageId);
        if (!originalMessage) {
            console.log(`❌ Message original non trouvé pour ${messageId}`);
            return;
        }

        console.log(`🗑️ Message supprimé détecté: ${messageId} par ${deletedBy.split('@')[0]}`);

        // Si auto-restauration activée, restaurer directement
        if (config.autoRestore) {
            await restoreMessageDirectly(originalMessage, sock, chatId);
        } else {
            // Créer le message fantôme interactif
            await createPhantomMessage(originalMessage, sock, chatId);
        }

        // Notifier le propriétaire si activé
        if (config.notifyOwner) {
            await notifyOwnerOfDeletion(originalMessage, deletedBy, sock);
        }

    } catch (err) {
        console.error('Erreur gestion phantom revocation:', err);
    }
}

// Restaurer directement le message
async function restoreMessageDirectly(messageData, sock, chatId) {
    try {
        const { content, mediaType, mediaPath, sender, contextInfo } = messageData;
        const senderName = sender.split('@')[0];

        let restorationText = `🔄 *Message restauré automatiquement*\n`;
        restorationText += `👤 *Expéditeur original:* @${senderName}\n\n`;
        
        if (contextInfo?.quotedMessage) {
            restorationText += `💭 *En réponse à:* ${contextInfo.quotedMessage.content}\n\n`;
        }
        
        if (content) {
            restorationText += `💬 *Message:*\n${content}`;
        }

        // Envoyer le texte de restauration
        await sock.sendMessage(chatId, {
            text: restorationText,
            mentions: [sender]
        });

        // Envoyer le média si présent
        if (mediaType && mediaPath && fs.existsSync(mediaPath)) {
            await sendRestoredMedia(sock, chatId, mediaType, mediaPath, sender, senderName);
        }

        console.log(`✅ Message restauré automatiquement: ${messageData.messageId}`);

    } catch (err) {
        console.error('Erreur restauration directe:', err);
    }
}

// Envoyer le média restauré
async function sendRestoredMedia(sock, chatId, mediaType, mediaPath, sender, senderName) {
    const mediaOptions = {
        caption: `🔄 *Média restauré*\n👤 *De:* @${senderName}`,
        mentions: [sender]
    };

    try {
        switch (mediaType) {
            case 'image':
                await sock.sendMessage(chatId, {
                    image: { url: mediaPath },
                    ...mediaOptions
                });
                break;
            case 'video':
                await sock.sendMessage(chatId, {
                    video: { url: mediaPath },
                    ...mediaOptions
                });
                break;
            case 'audio':
                await sock.sendMessage(chatId, {
                    audio: { url: mediaPath },
                    mimetype: 'audio/ogg; codecs=opus',
                    ...mediaOptions
                });
                break;
            case 'sticker':
                await sock.sendMessage(chatId, {
                    sticker: { url: mediaPath }
                });
                break;
            case 'document':
                await sock.sendMessage(chatId, {
                    document: { url: mediaPath },
                    ...mediaOptions
                });
                break;
        }
    } catch (err) {
        console.error(`Erreur envoi média ${mediaType}:`, err);
    }
}

// Notifier le propriétaire
async function notifyOwnerOfDeletion(messageData, deletedBy, sock) {
    try {
        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const { content, mediaType, sender, group } = messageData;
        const senderName = sender.split('@')[0];
        const groupName = group ? (await sock.groupMetadata(group).catch(() => ({ subject: 'Groupe inconnu' }))).subject : 'Chat privé';
        
        let notificationText = `🔰 *PHANTOM DELETE - NOTIFICATION* 🔰\n\n`;
        notificationText += `🗑️ *Supprimé par:* @${deletedBy.split('@')[0]}\n`;
        notificationText += `👤 *Expéditeur:* @${senderName}\n`;
        notificationText += `📍 *Lieu:* ${groupName}\n`;
        notificationText += `🕒 *Heure:* ${new Date().toLocaleString('fr-FR')}\n`;
        if (mediaType) notificationText += `📎 *Type:* ${getMediaEmoji(mediaType)} ${mediaType.toUpperCase()}\n`;
        
        if (content) {
            notificationText += `\n💬 *Contenu supprimé:*\n${content}`;
        }

        await sock.sendMessage(ownerNumber, {
            text: notificationText,
            mentions: [deletedBy, sender]
        });

    } catch (err) {
        console.error('Erreur notification propriétaire:', err);
    }
}

// Gérer les actions sur les boutons des messages fantômes
async function handlePhantomButtonAction(sock, message) {
    try {
        const buttonId = message.message?.buttonsResponseMessage?.selectedButtonId;
        if (!buttonId || !buttonId.startsWith('phantom_')) return false;

        const [, action, messageId] = buttonId.split('_');
        const chatId = message.key.remoteJid;
        const userId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        const originalMessage = messageStore.get(messageId);
        if (!originalMessage) {
            await sock.sendMessage(chatId, {
                text: '❌ Message original introuvable (peut-être trop ancien)'
            });
            return true;
        }

        switch (action) {
            case 'restore':
                await handleRestoreAction(originalMessage, sock, chatId, userId);
                break;
            case 'forward':
                await handleForwardAction(originalMessage, sock, chatId, userId);
                break;
            case 'info':
                await handleInfoAction(originalMessage, sock, chatId, userId);
                break;
        }

        return true;

    } catch (err) {
        console.error('Erreur gestion action bouton phantom:', err);
        return false;
    }
}

// Action de restauration
async function handleRestoreAction(messageData, sock, chatId, userId) {
    try {
        await restoreMessageDirectly(messageData, sock, chatId);
        
        // Confirmer l'action
        await sock.sendMessage(chatId, {
            text: `✅ Message restauré par @${userId.split('@')[0]}`,
            mentions: [userId]
        });
        
        // Marquer comme restauré
        messageData.isRestored = true;
        messageData.restoredAt = new Date().toISOString();
        messageData.restorationMethod = 'restore';
        
        console.log(`✅ Message restauré: ${messageData.messageId}`);

    } catch (err) {
        console.error('Erreur action restauration:', err);
    }
}

// Action de transfert en privé
async function handleForwardAction(messageData, sock, chatId, userId) {
    try {
        const { content, mediaType, mediaPath, sender, contextInfo } = messageData;
        const senderName = sender.split('@')[0];
        
        let privateText = `📨 *Message supprimé reçu*\n\n`;
        privateText += `👤 *Expéditeur original:* @${senderName}\n`;
        privateText += `📍 *Provenance:* ${chatId.endsWith('@g.us') ? 'Groupe' : 'Chat privé'}\n`;
        privateText += `🕒 *Heure originale:* ${new Date(messageData.timestamp).toLocaleString('fr-FR')}\n\n`;
        
        if (contextInfo?.quotedMessage) {
            privateText += `💭 *En réponse à:* ${contextInfo.quotedMessage.content}\n\n`;
        }
        
        if (content) {
            privateText += `💬 *Message:*\n${content}`;
        }

        // Envoyer en privé
        await sock.sendMessage(userId, {
            text: privateText,
            mentions: [sender]
        });

        // Envoyer le média si présent
        if (mediaType && mediaPath && fs.existsSync(mediaPath)) {
            await sendRestoredMedia(sock, userId, mediaType, mediaPath, sender, senderName);
        }

        // Confirmer dans le groupe
        await sock.sendMessage(chatId, {
            text: `📨 Message envoyé en privé à @${userId.split('@')[0]}`,
            mentions: [userId]
        });
        
        // Marquer comme transféré
        messageData.restorationMethod = 'forward';
        
        console.log(`📨 Message transféré en privé: ${messageData.messageId}`);

    } catch (err) {
        console.error('Erreur action transfert:', err);
    }
}

// Action d'information détaillée
async function handleInfoAction(messageData, sock, chatId, userId) {
    try {
        const { messageId, content, mediaType, sender, group, contextInfo, timestamp } = messageData;
        const senderName = sender.split('@')[0];
        const groupName = group ? (await sock.groupMetadata(group).catch(() => ({ subject: 'Groupe inconnu' }))).subject : 'Chat privé';
        
        let infoText = `ℹ️ *DÉTAILS DU MESSAGE SUPPRIMÉ*\n\n`;
        infoText += `🆔 *ID:* \`${messageId}\`\n`;
        infoText += `👤 *Expéditeur:* @${senderName}\n`;
        infoText += `📱 *JID:* \`${sender}\`\n`;
        infoText += `📍 *Lieu:* ${groupName}\n`;
        infoText += `🕒 *Horodatage:* ${new Date(timestamp).toLocaleString('fr-FR')}\n`;
        
        if (mediaType) {
            infoText += `📎 *Type de média:* ${getMediaEmoji(mediaType)} ${mediaType.toUpperCase()}\n`;
            infoText += `💾 *Fichier stocké:* ${fs.existsSync(messageData.mediaPath || '') ? '✅ Oui' : '❌ Non'}\n`;
        }
        
        if (contextInfo?.mentionedJid?.length > 0) {
            infoText += `👥 *Mentions:* ${contextInfo.mentionedJid.length}\n`;
        }
        
        if (contextInfo?.quotedMessage) {
            infoText += `💭 *En réponse à:* Oui\n`;
        }
        
        if (contextInfo?.isForwarded) {
            infoText += `🔄 *Message transféré:* Oui\n`;
        }
        
        infoText += `\n📊 *Statut:*\n`;
        infoText += `• Restauré: ${messageData.isRestored ? '✅ Oui' : '❌ Non'}\n`;
        infoText += `• Méthode: ${messageData.restorationMethod || 'Aucune'}\n`;
        infoText += `• Nettoyage prévu: ${new Date(messageData.autoCleanupAt).toLocaleDateString('fr-FR')}\n`;
        
        if (content && content.length <= 200) {
            infoText += `\n💬 *Contenu complet:*\n${content}`;
        } else if (content) {
            infoText += `\n💬 *Aperçu du contenu:*\n${content.substring(0, 200)}...`;
        }

        await sock.sendMessage(userId, {
            text: infoText,
            mentions: [sender]
        });
        
        console.log(`ℹ️ Informations envoyées: ${messageId}`);

    } catch (err) {
        console.error('Erreur action info:', err);
    }
}

// Nettoyage automatique des anciens messages (ASYNC avec respect de storeDuration)
async function cleanupOldPhantomMessages() {
    try {
        const config = await loadPhantomDeleteConfig();
        const now = new Date();
        const retentionMs = config.storeDuration * 24 * 60 * 60 * 1000; // Conversion jours -> millisecondes
        let cleaned = 0;
        let phantomsCleaned = 0;
        
        // Nettoyer messageStore (messages stockés)
        for (const [messageId, messageData] of messageStore.entries()) {
            const messageAge = now.getTime() - new Date(messageData.timestamp).getTime();
            
            if (messageAge > retentionMs) {
                // Supprimer le fichier média s'il existe (async)
                if (messageData.mediaPath && fs.existsSync(messageData.mediaPath)) {
                    try {
                        const { unlink } = require('fs').promises;
                        await unlink(messageData.mediaPath);
                    } catch (err) {
                        if (err.code !== 'ENOENT') {
                            console.error('Erreur suppression fichier:', err);
                        }
                    }
                }
                
                // Supprimer de la mémoire
                messageStore.delete(messageId);
                cleaned++;
            }
        }
        
        // Nettoyer phantomMessageStore (messages fantômes actifs)
        for (const [phantomId, phantomData] of phantomMessageStore.entries()) {
            const phantomAge = now.getTime() - new Date(phantomData.createdAt).getTime();
            
            if (phantomAge > retentionMs) {
                phantomMessageStore.delete(phantomId);
                phantomsCleaned++;
            }
        }
        
        if (cleaned > 0 || phantomsCleaned > 0) {
            console.log(`🧹 Nettoyage automatique phantom: ${cleaned} messages + ${phantomsCleaned} fantômes supprimés (rétention: ${config.storeDuration} jours)`);
        }
        
    } catch (err) {
        console.error('Erreur nettoyage automatique phantom:', err);
    }
}

// Nettoyage programmé basé sur la rétention (storeDuration)
async function scheduledRetentionCleanup() {
    try {
        const config = await loadPhantomDeleteConfig();
        if (!config.enabled) return; // Skip if phantom is disabled
        
        const now = new Date().getTime();
        const retentionMs = config.storeDuration * 24 * 60 * 60 * 1000; // jours -> ms
        let messagesDeleted = 0;
        let phantomsDeleted = 0;
        
        // Nettoyer messageStore selon autoCleanupAt et storeDuration
        for (const [messageId, messageData] of messageStore.entries()) {
            const messageAge = now - new Date(messageData.timestamp).getTime();
            const autoCleanupTime = new Date(messageData.autoCleanupAt).getTime();
            
            // Supprimer si: âge > retention OU autoCleanupAt dépassé
            if (messageAge > retentionMs || now > autoCleanupTime) {
                // Supprimer le fichier média associé (async)
                if (messageData.mediaPath && fs.existsSync(messageData.mediaPath)) {
                    try {
                        const { unlink } = require('fs').promises;
                        await unlink(messageData.mediaPath);
                    } catch (err) {
                        // Ignorer ENOENT (fichier déjà supprimé)
                        if (err.code !== 'ENOENT') {
                            console.error('Erreur suppression fichier média:', err);
                        }
                    }
                }
                
                // Supprimer de la mémoire
                messageStore.delete(messageId);
                messagesDeleted++;
            }
        }
        
        // Nettoyer phantomMessageStore (messages fantômes plus anciens que 24h par défaut)
        const phantomRetentionMs = 24 * 60 * 60 * 1000; // 24 heures pour les fantômes
        for (const [phantomId, phantomData] of phantomMessageStore.entries()) {
            const phantomAge = now - new Date(phantomData.createdAt).getTime();
            
            if (phantomAge > phantomRetentionMs) {
                phantomMessageStore.delete(phantomId);
                phantomsDeleted++;
            }
        }
        
        // Log du nettoyage effectué
        if (messagesDeleted > 0 || phantomsDeleted > 0) {
            console.log(`🧹 [PHANTOM RETENTION] Nettoyage: ${messagesDeleted} messages + ${phantomsDeleted} fantômes supprimés (rétention: ${config.storeDuration}j)`);
        }
        
    } catch (err) {
        console.error('Erreur nettoyage programmé phantom:', err);
    }
}

// Nettoyage automatique toutes les heures
setInterval(cleanupOldPhantomMessages, 60 * 60 * 1000);

// Nettoyage de rétention toutes les 30 minutes
setInterval(scheduledRetentionCleanup, 30 * 60 * 1000);

module.exports = {
    handlePhantomDeleteCommand,
    storeMessage,
    handlePhantomMessageRevocation,
    handlePhantomButtonAction,
    createPhantomMessage,
    cleanupOldPhantomMessages,
    loadPhantomDeleteConfig
};