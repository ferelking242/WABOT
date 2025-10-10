/**
 * Commande Companion - Version moderne avec wa-multi-session
 * 
 * Usage: .companion create [phone] [name]
 * 
 * Fonctionnalités :
 * - Génération de codes de jumelage
 * - Messages clairs et formatés
 * - Support multi-utilisateur concurrent
 * - Notifications de connexion
 */

const CompanionSessionManager = require('../lib/CompanionSessionManager');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { i18n, getUserLanguage } = require('../lib/i18n');
const chalk = require('chalk');

/**
 * Utility function to serialize errors safely for user display
 * Prevents '[object Object]' errors in messages
 */
function serializeErrorForCommand(error) {
    if (!error) return 'Unknown error occurred';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (typeof error === 'object') {
        try {
            return JSON.stringify(error, Object.getOwnPropertyNames(error));
        } catch {
            return error.toString();
        }
    }
    return String(error);
}

// Instance globale du gestionnaire
let companionManager = null;

// Initialiser le gestionnaire
function initCompanionManager() {
    if (!companionManager) {
        companionManager = new CompanionSessionManager();
    }
    return companionManager;
}

/**
 * Helper pour vérifier les permissions sur un companion (default-deny)
 * @param {string} requesterJid - JID de l'utilisateur qui fait la demande
 * @param {string} companionName - Nom du companion
 * @returns {Promise<{authorized: boolean, message?: string}>}
 */
async function ensureCompanionAccess(requesterJid, companionName) {
    try {
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const normalizedRequesterJid = jidNormalizedUser(requesterJid);
        
        const manager = initCompanionManager();
        
        // Récupérer les informations du companion depuis la DB
        const companionInfo = await manager.getCompanionConfigFromDB(companionName);
        
        // DEFAULT-DENY: Si pas trouvé en DB, refuser l'accès
        if (!companionInfo) {
            return {
                authorized: false,
                message: `❌ *Companion '${companionName}' introuvable*\n\n` +
                        `Ce companion n'est pas enregistré dans la base de données.\n` +
                        `💡 Utilise \`.companion list\` pour voir tous les companions disponibles.`
            };
        }
        
        // Vérifier les permissions: owner global OU propriétaire du companion
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(normalizedRequesterJid, null, null);
        const normalizedCompanionOwnerJid = jidNormalizedUser(companionInfo.owner_jid);
        const isCompanionOwner = normalizedCompanionOwnerJid === normalizedRequesterJid;
        
        if (!isGlobalOwner && !isCompanionOwner) {
            return {
                authorized: false,
                message: `❌ *Permission refusée*\n\n` +
                        `Tu ne peux gérer que les companions que tu as créés.\n\n` +
                        `💡 Ce companion appartient à un autre utilisateur.`
            };
        }
        
        return { authorized: true };
        
    } catch (error) {
        console.error('Error checking companion access:', error);
        return {
            authorized: false,
            message: `❌ *Erreur de vérification des permissions*\n\n${serializeErrorForCommand(error)}`
        };
    }
}

module.exports = {
    name: 'companion',
    description: 'Créer et gérer des bots companion WhatsApp',
    category: 'utility',
    usage: '.companion create [phone] [name]',
    
    // ✅ ADDED: Export function for external use (fix for singleton access)
    initCompanionManager: initCompanionManager,
    
    async execute(XeonBotInc, m, args) {
        try {
            const chatId = m.key.remoteJid;
            
            if (!args[0]) {
                const helpMessage = `🤖 *COMPANION BOT COMMANDS*\n\n` +
                                  `📋 *AVAILABLE COMMANDS:*\n` +
                                  `• \`.companion create [phone] [name]\` - Create companion (pairing code)\n` +
                                  `• \`.companion create [phone] [name] qr\` - Create companion (QR code)\n` +
                                  `• \`.companion list\` - List all companions\n` +
                                  `• \`.companion status\` - Show status of companions\n` +
                                  `• \`.companion wake [name]\` - Wake up companion\n` +
                                  `• \`.companion wake all\` - Wake up all companions\n` +
                                  `• \`.companion sleep [name]\` - Put companion to sleep\n` +
                                  `• \`.companion close [name]\` - Close companion\n` +
                                  `• \`.companion close all\` - Close all companions\n` +
                                  `• \`.companion remove [name]\` - Remove companion permanently\n` +
                                  `• \`.companion cleanup\` - Clean orphaned sessions\n` +
                                  `• \`.companion clear all\` - Delete all companions (owner only)\n\n` +
                                  `📝 *EXAMPLES:*\n` +
                                  `• \`.companion create 242065491040 john\`\n` +
                                  `• \`.companion create 242065491040 marie qr\`\n` +
                                  `• \`.companion remove bobo\`\n\n` +
                                  `✨ *FEATURES:*\n` +
                                  `• Multi-user companion support\n` +
                                  `• Pairing codes and QR codes\n` +
                                  `• Automatic reconnection\n` +
                                  `• Session persistence`;
                
                await XeonBotInc.sendMessage(chatId, { text: helpMessage });
                return;
            }

            if (args[0] === 'create') {
                await handleCreateCompanion(XeonBotInc, m, args, chatId);
            } else if (args[0] === 'list') {
                await handleListAllCompanions(XeonBotInc, m, chatId);
            } else if (args[0] === 'status') {
                await handleCompanionStatus(XeonBotInc, m, chatId);
            } else if (args[0] === 'wake' && args[1] === 'all') {
                await handleWakeAllCompanions(XeonBotInc, m, chatId);
            } else if (args[0] === 'wake') {
                await handleWakeCompanion(XeonBotInc, m, args, chatId);
            } else if (args[0] === 'sleep') {
                await handleSleepCompanion(XeonBotInc, m, args, chatId);
            } else if (args[0] === 'close' && args[1] === 'all') {
                await handleCloseAllCompanions(XeonBotInc, m, chatId);
            } else if (args[0] === 'close') {
                await handleCloseCompanion(XeonBotInc, m, args, chatId);
            } else if (args[0] === 'remove') {
                await handleRemoveCompanion(XeonBotInc, m, args, chatId);
            } else if (args[0] === 'cleanup') {
                await handleCleanupSessions(XeonBotInc, m, chatId);
            } else if (args[0] === 'cleanorphans') {
                await handleCleanOrphans(XeonBotInc, m, chatId);
            } else if (args[0] === 'clear' && args[1] === 'all') {
                await handleClearAll(XeonBotInc, m, args, chatId);
            } else {
                await XeonBotInc.sendMessage(chatId, { 
                    text: `❌ *Commande inconnue*\n\nUtilise: \`.companion\` pour voir toutes les commandes disponibles` 
                });
            }

        } catch (error) {
            console.error('❌ Companion command error:', error);
            const chatId = m.key.remoteJid;
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Error executing companion command*\n\n${serializeErrorForCommand(error)}`
            });
        }
    }
};

/**
 * Gère la création d'un nouveau companion
 */
async function handleCreateCompanion(XeonBotInc, m, args, chatId) {
    // ✅ VÉRIFICATION PERMISSIONS - Seul le propriétaire principal peut créer des companions
    const createRequesterJid = m?.key?.participant || m?.key?.remoteJid;
    const { isOwnerOrSudo, hasExtendedPermissions } = require('../lib/isOwner');
    const isMainOwner = await isOwnerOrSudo(createRequesterJid, XeonBotInc, chatId);
    
    if (!isMainOwner) {
        // Vérifier si c'est un propriétaire de companion (pour refuser l'accès)
        const permissions = await hasExtendedPermissions(createRequesterJid, XeonBotInc, chatId);
        if (permissions.type === 'companion_owner') {
            await XeonBotInc.sendMessage(chatId, {
                text: '❌ *Accès refusé*\n\nSeul le propriétaire principal peut créer des companions.\n\n💡 En tant que propriétaire de companion, vous ne pouvez pas créer d\'autres companions.'
            });
            return;
        }
        
        // Accès refusé pour tous les autres
        await XeonBotInc.sendMessage(chatId, {
            text: '❌ *Permissions insuffisantes*\n\nSeul le propriétaire du bot peut créer des companions.'
        });
        return;
    }
    
    const phoneNumber = args[1];
    const companionName = args[2];
    const useQR = args[3]?.toLowerCase() === 'qr';

    // Validation des arguments
    if (!phoneNumber || !companionName) {
        const errorMessage = `❌ *Missing parameters*\n\n` +
                           `*Usage:*\n` +
                           `• \`.companion create [phone] [name]\` (code)\n` +
                           `• \`.companion create [phone] [name] qr\` (QR)\n\n` +
                           `*Examples:*\n` +
                           `• \`.companion create 242065491040 john\`\n` +
                           `• \`.companion create 242065491040 marie qr\``;
        
        await XeonBotInc.sendMessage(chatId, { text: errorMessage });
        return;
    }

    // Validation du numéro de téléphone
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Invalid phone number*\n\nPlease provide a valid international phone number\n\n*Example:* 242065491040`
        });
        return;
    }

    // Validation du nom
    if (!/^[a-zA-Z0-9_-]+$/.test(companionName)) {
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Invalid companion name*\n\nName must contain only letters, numbers, _ and -\n\n*Example:* john, user1, assistant_bot`
        });
        return;
    }

    // Obtenir le JID du créateur (requester) - seulement utilisateur valide
    const requesterJid = m?.key?.participant || m?.key?.remoteJid;
    if (!requesterJid) {
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur d'identification*\n\nImpossible d'identifier le créateur du companion.\nVeuillez réessayer.`
        });
        return;
    }
    console.log(`📱 Creating companion: ${companionName} for phone: ${phoneNumber} (requester: ${requesterJid})`);

    try {
        // Initialiser le gestionnaire
        const manager = initCompanionManager();

        // Message de démarrage avec i18n stylé
        const senderId = m?.key?.participant || m?.key?.remoteJid;
        const initialMessage = i18n.t(senderId, 'companion.creating', {
            companionName: companionName,
            phoneNumber: phoneNumber
        });
        
        // Envoyer le message initial et stocker son ID pour édition ultérieure
        const sentMessage = await XeonBotInc.sendMessage(chatId, {
            text: initialMessage
        });
        
        // Stocker l'ID du message pour édition
        const initialMessageKey = sentMessage.key;
        console.log(`📝 Initial message sent with key:`, initialMessageKey);

        // Créer la session avec callback et requesterJid, en passant l'ID du message
        await manager.createCompanionSession(phoneNumber, companionName, async (result) => {
            await handleCompanionCallback(XeonBotInc, chatId, result, phoneNumber, companionName, m, initialMessageKey);
        }, useQR, requesterJid);

    } catch (error) {
        console.error('❌ Create companion error:', error);
        
        const errorText = serializeErrorForCommand(error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Failed to create companion*\n\n` +
                  `Error: ${errorText}\n\n` +
                  `Please try again or contact support.`
        });
    }
}

/**
 * Gère les callbacks des événements companion
 */
async function handleCompanionCallback(XeonBotInc, chatId, result, phoneNumber, companionName, m = null, initialMessageKey = null) {
    try {
        // Logs sécurisés pour production - gate stricté pour éviter fuites accidentelles
        const isDebug = process.env.NODE_ENV !== 'production' && process.env.LOG_SENSITIVE === 'true';
        if (isDebug) {
            console.log('📞 Companion callback received:', result);
        } else {
            // Log sécurisé sans exposer les codes
            const safeResult = {
                success: result.success,
                mode: result.mode,
                companionName: result.companionName,
                connected: result.connected,
                error: result.error
            };
            console.log('📞 Companion callback received:', safeResult);
        }
        
        // Formater le numéro de téléphone en JID WhatsApp
        const cleanedPhone = phoneNumber.replace(/[^0-9]/g, '');
        const targetPhoneJid = jidNormalizedUser(`${cleanedPhone}@s.whatsapp.net`);
        const creatorJid = m?.key?.participant || m?.key?.remoteJid;
        
        console.log(`📱 Sending to target phone: ${targetPhoneJid} (for companion: ${companionName})`);

        // Définir isGroup une seule fois au début pour éviter la redéclaration
        const isGroup = chatId.endsWith('@g.us');

        if (result.success) {
            if (result.qrCode) {
                // QR Code généré - vérifier si c'est un groupe pour éviter exposition
                
                if (isGroup) {
                    // Groupe : envoyer QR en privé et notification publique
                    const privateQrMessage = `✅ *Companion ${companionName} Ready*\n\n` +
                                            `📱 *Scan QR Code below:*\n\n` +
                                            `📲 *How to connect:*\n` +
                                            `1. Open WhatsApp on your phone\n` +
                                            `2. Go to Settings --> Linked Devices\n` +
                                            `3. Tap "Link a Device"\n` +
                                            `4. Scan the QR code below\n\n` +
                                            `🎯 Ready to connect!`;
                    
                    // Envoyer QR en privé au créateur (méthode sécurisée)
                    const creatorJid = m.key.participant || m.key.remoteJid;
                    
                    await XeonBotInc.sendMessage(creatorJid, { text: privateQrMessage });
                    await XeonBotInc.sendMessage(creatorJid, {
                        image: result.qrCode,
                        caption: `🔗 QR Code for ${companionName}\n\nScan this with WhatsApp to connect your companion bot!`
                    });
                    
                    // Notification publique dans le groupe
                    const groupNotice = `✅ *Companion ${companionName} Ready!*\n\n` +
                                      `🔒 *QR code sent privately for security*\n` +
                                      `📬 Check your private messages to get the QR code\n\n` +
                                      `📱 Scan to connect your companion!`;
                    
                    await XeonBotInc.sendMessage(chatId, { text: groupNotice });
                } else {
                    // Conversation privée : envoyer normalement
                    const qrMessage = `✅ *Companion ${companionName} Ready*\n\n` +
                                    `📱 *Scan QR Code below:*\n\n` +
                                    `📲 *How to connect:*\n` +
                                    `1. Open WhatsApp on your phone\n` +
                                    `2. Go to Settings --> Linked Devices\n` +
                                    `3. Tap "Link a Device"\n` +
                                    `4. Scan the QR code below\n\n` +
                                    `🎯 Ready to connect!`;

                    await XeonBotInc.sendMessage(chatId, { text: qrMessage });
                    
                    // Envoyer l'image QR
                    await XeonBotInc.sendMessage(chatId, {
                        image: result.qrCode,
                        caption: `🔗 QR Code for ${companionName}\n\nScan this with WhatsApp to connect your companion bot!`
                    });
                }

            } else if (result.code) {
                // Code de jumelage généré - envoyer au numéro de téléphone fourni
                const senderId = m?.key?.participant || m?.key?.remoteJid;
                const userLang = getUserLanguage(senderId);
                
                // Utiliser i18n pour le message de code de jumelage avec le nouveau format stylé
                const codeMessage = i18n.t(senderId, 'companion.code_ready', {
                    companionName: companionName,
                    code: result.code
                });
                
                // MODIFICATION: Éditer le message initial CORRECTEMENT pour éviter les doublons
                // En privé: éditer le message initial avec le statut de pairing
                // En groupe: message minimal de statut seulement (code envoyé en privé pour sécurité)
                
                // ÉTAPE 1: Essayer d'envoyer au numéro de téléphone fourni en PRIORITÉ (PRIVÉ)
                let codeSentSuccessfully = false;
                const targetPhoneJid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
                const creatorJid = m?.key?.participant || m?.key?.remoteJid;
                const isGroup = chatId.endsWith('@g.us');
                
                console.log(`🔄 Attempting to send pairing code to: ${targetPhoneJid}`);
                
                try {
                    await XeonBotInc.sendMessage(targetPhoneJid, { text: codeMessage });
                    codeSentSuccessfully = true;
                    console.log(`✅ Pairing code sent DIRECTLY to target phone: ${targetPhoneJid}`);
                    
                    // Succès - Éditer le message initial OU envoyer notification selon le contexte
                    const successNotification = `✅ *Code envoyé avec succès !*\n\n📱 Le code pour "${companionName}" a été envoyé DIRECTEMENT au +${phoneNumber}\n\n💬 La personne peut maintenant configurer son companion\n⏰ Code valide pendant 5 minutes`;
                    
                    if (isGroup) {
                        // En groupe : notification en privé + message public minimal
                        await XeonBotInc.sendMessage(creatorJid, { text: successNotification });
                        
                        // Éditer le message initial dans le groupe avec un statut simple
                        const groupSuccessMsg = `✅ *Companion ${companionName} Ready!*\n\n📤 Code de pairing envoyé en privé au +${phoneNumber}\n⚡ Configuration en cours...`;
                        
                        if (initialMessageKey) {
                            try {
                                await XeonBotInc.sendMessage(chatId, { text: groupSuccessMsg }, { edit: initialMessageKey });
                                console.log(`✅ Initial group message edited successfully`);
                            } catch (editError) {
                                console.log(`⚠️ Could not edit group message, sending new:`, editError.message);
                                await XeonBotInc.sendMessage(chatId, { text: groupSuccessMsg });
                            }
                        } else {
                            await XeonBotInc.sendMessage(chatId, { text: groupSuccessMsg });
                        }
                    } else {
                        // En privé : éditer le message initial avec la notification complète
                        if (initialMessageKey) {
                            try {
                                await XeonBotInc.sendMessage(chatId, { text: successNotification }, { edit: initialMessageKey });
                                console.log(`✅ Initial private message edited successfully`);
                            } catch (editError) {
                                console.log(`⚠️ Could not edit private message, sending new:`, editError.message);
                                await XeonBotInc.sendMessage(chatId, { text: successNotification });
                            }
                        } else {
                            await XeonBotInc.sendMessage(chatId, { text: successNotification });
                        }
                    }
                    
                } catch (sendError) {
                    console.log(`❌ Could not send to target phone ${targetPhoneJid}:`, sendError.message);
                    codeSentSuccessfully = false;
                    
                    // ÉTAPE 2: FALLBACK - Envoyer au créateur en privé avec le code
                    console.log(`🔄 FALLBACK: Sending code to creator instead`);
                    
                    const fallbackMessage = `⚠️ *Envoi direct impossible*\n\nLe code pour "${companionName}" n'a pas pu être envoyé directement au +${phoneNumber}.\n\n🔒 *Code de pairing sécurisé:*\n${codeMessage}\n\n📤 *Transmettez ce code au propriétaire du +${phoneNumber}*\n⏰ Code valide pendant 5 minutes`;
                    
                    try {
                        await XeonBotInc.sendMessage(creatorJid, { text: fallbackMessage });
                        console.log(`✅ Fallback: Code sent to creator ${creatorJid}`);
                        
                        // ÉTAPE 3: Éditer le message initial ou envoyer fallback selon le contexte
                        if (isGroup) {
                            const groupFallbackMsg = `⚠️ *Code de pairing pour ${companionName}*\n\n📱 Envoi direct au +${phoneNumber} impossible\n🔒 Code envoyé en privé au créateur pour sécurité\n\n📤 @${creatorJid.split('@')[0]}, transmettez le code au propriétaire du numéro\n⚡ Code valide pendant 5 minutes`;
                            
                            // Éditer le message initial dans le groupe
                            if (initialMessageKey) {
                                try {
                                    await XeonBotInc.sendMessage(chatId, { text: groupFallbackMsg }, { edit: initialMessageKey });
                                    console.log(`✅ Initial group message edited with fallback info`);
                                } catch (editError) {
                                    console.log(`⚠️ Could not edit group fallback message, sending new:`, editError.message);
                                    await XeonBotInc.sendMessage(chatId, { text: groupFallbackMsg });
                                }
                            } else {
                                await XeonBotInc.sendMessage(chatId, { text: groupFallbackMsg });
                            }
                        } else {
                            // En privé : éditer le message initial avec l'info de fallback
                            const privateFallbackMsg = `⚠️ *Problème d'envoi direct*\n\nLe code pour "${companionName}" n'a pas pu être envoyé directement au +${phoneNumber}.\n\n${codeMessage}\n\n📤 *Transmettez ce code au propriétaire du numéro*\n⏰ Code valide pendant 5 minutes`;
                            
                            if (initialMessageKey) {
                                try {
                                    await XeonBotInc.sendMessage(chatId, { text: privateFallbackMsg }, { edit: initialMessageKey });
                                    console.log(`✅ Initial private message edited with fallback code`);
                                } catch (editError) {
                                    console.log(`⚠️ Could not edit private fallback message, sending new:`, editError.message);
                                    await XeonBotInc.sendMessage(chatId, { text: privateFallbackMsg });
                                }
                            } else {
                                await XeonBotInc.sendMessage(chatId, { text: privateFallbackMsg });
                            }
                        }
                        
                    } catch (creatorError) {
                        console.log(`❌ Could not send to creator either:`, creatorError.message);
                        
                        // ÉTAPE 4: FALLBACK FINAL DE DERNIERS RECOURS - Afficher dans le chat actuel
                        if (isGroup) {
                            // En groupe : NE JAMAIS exposer le code, juste indiquer l'échec
                            const finalFallbackMsg = `❌ *Échec d'envoi du code*\n\nImpossible d'envoyer le code pour "${companionName}" à +${phoneNumber}\n\n🔒 Pour des raisons de sécurité, contactez directement le propriétaire\n💡 Réessayez la création du companion plus tard`;
                            await XeonBotInc.sendMessage(chatId, { text: finalFallbackMsg });
                        } else {
                            // En privé : on peut afficher le code
                            const privateFallbackMsg = `❌ *Problème d'envoi*\n\nCode de pairing pour "${companionName}":\n${codeMessage}\n\n📤 Transmettez ce code au +${phoneNumber}`;
                            await XeonBotInc.sendMessage(chatId, { text: privateFallbackMsg });
                        }
                    }
                }

            } else if (result.connected || result.user) {
                // Companion connecté avec succès
                const senderId = m?.key?.participant || m?.key?.remoteJid;
                const userLang = getUserLanguage(senderId);
                
                // Message de succès utilisant i18n avec le nouveau format stylé
                const welcomeMessage = i18n.t(senderId, 'companion.connected', {
                    companionName: companionName
                });

                // MODIFICATION: Éditer CORRECTEMENT le message initial au lieu d'envoyer un nouveau message
                if (initialMessageKey) {
                    try {
                        // CORRECTION: Utiliser la bonne API Baileys pour éditer un message
                        await XeonBotInc.sendMessage(chatId, { 
                            text: welcomeMessage
                        }, { 
                            edit: initialMessageKey 
                        });
                        console.log(`✅ Initial message edited successfully`);
                    } catch (editError) {
                        console.log(`⚠️ Message editing not supported or failed, using new message:`, editError.message);
                        // Fallback: envoyer un nouveau message si l'édition échoue
                        await XeonBotInc.sendMessage(chatId, { text: welcomeMessage });
                    }
                } else {
                    // Envoyer un nouveau message si pas d'ID de message initial
                    await XeonBotInc.sendMessage(chatId, { text: welcomeMessage });
                }
                
                // CORRECTION: Envoyer aussi un message de confirmation au numéro créé
                try {
                    const targetSuccessMessage = `🎊⃝━❮ 𝐕𝐨𝐭𝐫𝐞 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧 𝐄𝐬𝐭 𝐀𝐜𝐭𝐢𝐟 ! ❯━\n┊ ┊ ┊ ┊ ┊ ⋆｡ 🎉⋆｡ ☪︎⋆\n┊ ┊ ✫ ˚♡ ⋆｡ ✧\n⊹ ☪︎⋆ *${companionName} Connecté* 🌤️\n┊ *Prêt à utiliser*\n✧\n\n┏━❮ 𝐂𝐨𝐧𝐧𝐞𝐱𝐢𝐨𝐧 𝐑é𝐮𝐬𝐬𝐢𝐞 ❯━\n┃⛤┃✅ *Statut:* Connecté et actif\n┃⛤┃🤖 *Nom:* ${companionName}\n┃⛤┃⏰ *Heure:* ${new Date().toLocaleString()}\n┃⛤┗━━━━━━━━━━━━━━𖣔𖣔\n╰──────────────┈⊷\n*┌───────────────┐*\n*│🎊 Votre CompanionBot est prêt ! 🎊│*\n*└───────────────┘*`;
                    
                    await XeonBotInc.sendMessage(targetPhoneJid, { text: targetSuccessMessage });
                    console.log(`✅ Success notification sent to target phone: ${targetPhoneJid}`);
                    
                    // Notifier le créateur que le message de succès a aussi été envoyé au numéro
                    const creatorNotification = `✅ *Confirmation envoyée !*\n\n📤 Message de succès envoyé au numéro +${phoneNumber}\n\n💬 La personne est maintenant notifiée que son companion "${companionName}" est actif et fonctionnel.`;
                    
                    await XeonBotInc.sendMessage(creatorJid, { text: creatorNotification });
                    
                } catch (targetError) {
                    console.log(`⚠️ Could not send success notification to target phone ${targetPhoneJid}:`, targetError.message);
                    
                    // Fallback: informer le créateur que la notification n'a pas pu être envoyée
                    const failureNotification = `⚠️ *Notification non envoyée*\n\n📱 Impossible d'envoyer la confirmation de succès au +${phoneNumber}.\n\n💡 *Action suggérée:* Informez manuellement le propriétaire du numéro que son companion "${companionName}" est maintenant actif et fonctionnel.`;
                    
                    try {
                        await XeonBotInc.sendMessage(creatorJid, { text: failureNotification });
                    } catch (creatorError) {
                        console.log(`⚠️ Could not send failure notification to creator:`, creatorError.message);
                    }
                }
                
            } else if (result.reconnected) {
                // Companion reconnecté après erreur de stream
                const reconnectMessage = `🔄 *Companion ${companionName} Reconnected!*\n\n` +
                                        `✅ Auto-reconnection successful!\n` +
                                        `🔧 Stream error resolved\n` +
                                        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                                        `🤖 Your companion bot is *ACTIVE* again!\n` +
                                        `💬 All commands working normally.`;

                await XeonBotInc.sendMessage(chatId, { text: reconnectMessage });
            }
            
        } else {
            // Erreur - améliorer l'affichage des erreurs
            const errorText = serializeErrorForCommand(result.error);
            const errorMessage = `❌ *Companion ${companionName} Failed*\n\n` +
                                `Error: ${errorText}\n\n` +
                                `Please try again with a different name or phone number.`;

            await XeonBotInc.sendMessage(chatId, { text: errorMessage });
        }

    } catch (error) {
        console.error('❌ Callback handling error:', error);
        
        // Send proper error message to user instead of [object Object]
        const errorText = serializeErrorForCommand(error);
        const fallbackMessage = `❌ *Erreur lors du traitement du companion ${companionName}*\n\n` +
                              `Error: ${errorText}\n\n` +
                              `Veuillez réessayer ou contacter le support.`;
        
        try {
            await XeonBotInc.sendMessage(chatId, { text: fallbackMessage });
        } catch (sendError) {
            console.error('❌ Failed to send error message:', serializeErrorForCommand(sendError));
        }
    }
}


/**
 * Affiche le statut détaillé des companions
 */
async function handleCompanionStatus(XeonBotInc, m, chatId) {
    try {
        const manager = initCompanionManager();
        const activeSessions = manager.getActiveSessions();
        
        if (activeSessions.length === 0) {
            await XeonBotInc.sendMessage(chatId, {
                text: `📊 *Statut des Companions*\n\n❌ Aucun companion actif`
            });
            return;
        }
        
        let statusMessage = `📊 *Statut des Companions*\n\n`;
        statusMessage += `🟢 *Companions Actifs:* ${activeSessions.length}\n\n`;
        
        for (const sessionId of activeSessions) {
            // Ensure sessionId is a string before using split
            const sessionIdStr = typeof sessionId === 'string' ? sessionId : String(sessionId);
            const parts = sessionIdStr.split('-');
            const companionName = parts.length >= 2 ? parts[1] : 'Unknown';
            const session = manager.activeSessions.get(sessionId);
            
            statusMessage += `🤖 *${companionName}*\n`;
            statusMessage += `   📶 Statut: ${session ? '🟢 Connecté' : '🔴 Déconnecté'}\n`;
            
            if (session?.user) {
                statusMessage += `   📱 WhatsApp: ${session.user.name || session.user.id}\n`;
            }
            
            statusMessage += `   🆔 Session ID: ${sessionId}\n\n`;
        }
        
        await XeonBotInc.sendMessage(chatId, { text: statusMessage });
        
    } catch (error) {
        console.error('❌ Status companions error:', error);
        const errorText = error?.message || error || 'Unknown error occurred';
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la vérification du statut*\n\n${errorText}`
        });
    }
}

/**
 * Ferme un companion spécifique
 */
async function handleCloseCompanion(XeonBotInc, m, args, chatId) {
    try {
        const companionName = args[1];
        
        if (!companionName) {
            const senderId = m?.key?.participant || m?.key?.remoteJid;
            const userLang = getUserLanguage(senderId);
            
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Nom du companion requis*\n\nUtilise: \`.companion close [name]\`\n\nExemple: \`.companion close john\``
            });
            return;
        }

        // Vérifier les permissions avant de procéder (avec logique default-deny)
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const accessCheck = await ensureCompanionAccess(requesterJid, companionName);
        
        if (!accessCheck.authorized) {
            await XeonBotInc.sendMessage(chatId, { text: accessCheck.message });
            return;
        }
        
        const manager = initCompanionManager();
        
        // D'abord chercher dans les sessions actives
        const activeSessions = manager.getActiveSessions();
        let foundSessionId = null;
        
        for (const sessionId of activeSessions) {
            const parts = (typeof sessionId === 'string' ? sessionId : String(sessionId)).split('-');
            const sessionName = parts.length >= 2 ? parts[1] : '';
            if (sessionName.toLowerCase() === companionName.toLowerCase()) {
                foundSessionId = sessionId;
                break;
            }
        }
        
        if (foundSessionId) {
            // Fermer la session active
            await manager.closeSession(foundSessionId);
            // Utiliser le format stylé cohérent
            const successMessage = `✅⃝━❮ 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧 𝐅𝐞𝐫𝐦é ❯━\n┊ ┊ ┊ ┊ ┊ ⋆｡ 🔌⋆｡ ☪︎⋆\n┊ ┊ ✫ ˚♡ ⋆｡ ✧\n⊹ ☪︎⋆ *${companionName} Fermé* 🌤️\n┊ *Session terminée*\n✧\n\n┏━❮ 𝐅𝐞𝐫𝐦𝐞𝐭𝐮𝐫𝐞 𝐑é𝐮𝐬𝐬𝐢𝐞 ❯━\n┃⛤┃🔌 *Session:* Terminée\n┃⛤┃📁 *Fichiers:* Supprimés\n┃⛤┃🤖 *Nom:* ${companionName}\n┃⛤┗━━━━━━━━━━━━━━𖣔𖣔\n╰──────────────┈⊷`;
            
            await XeonBotInc.sendMessage(chatId, { text: successMessage });
            return;
        }
        
        // Si pas trouvé dans les actives, chercher dans la DB (companions orphelins)
        const companionFromDB = await manager.getCompanionConfigFromDB(companionName);
        if (companionFromDB) {
            // Supprimer de la DB par nom (corrige le bug)
            await manager.removeCompanionFromDBByName(companionName);
            
            // Nettoyer les fichiers de session s'ils existent
            try {
                const { sessionPath } = manager.createSecureSessionPath(companionName);
                const fs = require('fs');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                console.log(`Warning: Could not cleanup session files: ${cleanupError.message}`);
            }
            
            await XeonBotInc.sendMessage(chatId, {
                text: `✅ *Companion orphelin '${companionName}' supprimé avec succès*\n\n🧹 Supprimé de la base de données\n📁 Fichiers de session nettoyés`
            });
            return;
        }
        
        // Pas trouvé du tout
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Companion '${companionName}' introuvable*\n\nUtilise \`.companion list\` pour voir tous les companions disponibles.`
        });
        
    } catch (error) {
        console.error('❌ Close companion error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la fermeture du companion*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Supprime un companion spécifique (alias pour close)
 */
async function handleRemoveCompanion(XeonBotInc, m, args, chatId) {
    try {
        const companionName = args[1];
        
        if (!companionName) {
            const senderId = m?.key?.participant || m?.key?.remoteJid;
            
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Nom du companion requis*\n\nUtilise: \`.companion remove [name]\`\n\nExemple: \`.companion remove bobo\`\n\n💡 Utilise \`.companion list\` pour voir tous les companions disponibles.`
            });
            return;
        }

        // Vérifier les permissions avant de procéder (avec logique default-deny)
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const normalizedRequesterJid = jidNormalizedUser(requesterJid);
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(normalizedRequesterJid, null, null);
        
        const manager = initCompanionManager();
        
        // NOUVELLE LOGIQUE: Chercher le companion par nom OU par propriétaire
        let foundCompanion = null;
        let foundSessionId = null;
        
        // 1. Chercher dans les sessions actives par nom
        const activeSessions = manager.getActiveSessions();
        for (const sessionId of activeSessions) {
            const parts = (typeof sessionId === 'string' ? sessionId : String(sessionId)).split('-');
            const sessionName = parts.length >= 2 ? parts[1] : '';
            if (sessionName.toLowerCase() === companionName.toLowerCase()) {
                foundSessionId = sessionId;
                foundCompanion = { source: 'active', sessionId, name: sessionName };
                break;
            }
        }
        
        // 2. Chercher dans la DB par nom exact
        if (!foundCompanion) {
            const companionFromDB = await manager.getCompanionConfigFromDB(companionName);
            if (companionFromDB) {
                foundCompanion = { source: 'database', data: companionFromDB, name: companionFromDB.companion_name };
            }
        }
        
        // 3. Si pas trouvé par nom exact ET l'utilisateur n'est pas owner global, chercher ses companions
        if (!foundCompanion && !isGlobalOwner) {
            try {
                const { data: userCompanions, error } = await manager.db.supabase
                    .from('companions')
                    .select('*')
                    .eq('owner_jid', normalizedRequesterJid);
                    
                if (!error && userCompanions && userCompanions.length > 0) {
                    // Proposer une liste des companions de l'utilisateur
                    let companionsList = userCompanions.map(c => `• ${c.companion_name}`).join('\n');
                    
                    await XeonBotInc.sendMessage(chatId, {
                        text: `❌ *Companion '${companionName}' introuvable*\n\n🔍 *Tes companions disponibles:*\n${companionsList}\n\n💡 Utilise le nom exact pour supprimer un companion.`
                    });
                    return;
                }
            } catch (dbError) {
                console.error('Error querying user companions:', dbError);
            }
        }
        
        // 4. Si toujours pas trouvé, lister TOUS les companions pour l'owner global
        if (!foundCompanion) {
            if (isGlobalOwner) {
                try {
                    const { data: allCompanions, error } = await manager.db.supabase
                        .from('companions')
                        .select('companion_name, phone_number, status')
                        .order('created_at', { ascending: false })
                        .limit(10);
                        
                    if (!error && allCompanions && allCompanions.length > 0) {
                        let companionsList = allCompanions.map(c => `• ${c.companion_name} (${c.phone_number}) - ${c.status}`).join('\n');
                        
                        await XeonBotInc.sendMessage(chatId, {
                            text: `❌ *Companion '${companionName}' introuvable*\n\n🔍 *Tous les companions:*\n${companionsList}\n\n💡 Utilise le nom exact pour supprimer un companion.`
                        });
                        return;
                    }
                } catch (dbError) {
                    console.error('Error querying all companions:', dbError);
                }
            }
            
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Companion '${companionName}' introuvable*\n\nUtilise \`.companion list\` pour voir tous les companions disponibles.`
            });
            return;
        }
        
        // 5. Vérifier les permissions sur le companion trouvé
        if (foundCompanion.source === 'database') {
            const isCompanionOwner = jidNormalizedUser(foundCompanion.data.owner_jid) === normalizedRequesterJid;
            if (!isGlobalOwner && !isCompanionOwner) {
                await XeonBotInc.sendMessage(chatId, {
                    text: `❌ *Permission refusée*\n\nTu ne peux supprimer que les companions que tu as créés.\n\n💡 Ce companion appartient à un autre utilisateur.`
                });
                return;
            }
        }
        
        // 6. Procéder à la suppression
        if (foundCompanion.source === 'active') {
            // Fermer la session active
            await manager.closeSession(foundSessionId);
            await XeonBotInc.sendMessage(chatId, {
                text: `✅ *Companion '${foundCompanion.name}' supprimé avec succès*\n\n🔌 Session active terminée\n📁 Fichiers de session supprimés`
            });
        } else if (foundCompanion.source === 'database') {
            // Supprimer de la DB
            await manager.removeCompanionFromDBByName(foundCompanion.name);
            
            // Nettoyer les fichiers de session s'ils existent
            try {
                const { sessionPath } = manager.createSecureSessionPath(foundCompanion.name);
                const fs = require('fs');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                console.log(`Warning: Could not cleanup session files: ${cleanupError.message}`);
            }
            
            await XeonBotInc.sendMessage(chatId, {
                text: `✅ *Companion '${foundCompanion.name}' supprimé avec succès*\n\n🧹 Supprimé de la base de données\n📁 Fichiers de session nettoyés`
            });
        }
        
    } catch (error) {
        console.error('❌ Remove companion error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la suppression du companion*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Ferme tous les companions
 */
async function handleCloseAllCompanions(XeonBotInc, m, chatId) {
    try {
        // Vérifier les permissions - doit être owner global OU filtrer par propriétaire
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const normalizedRequesterJid = jidNormalizedUser(requesterJid);
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(normalizedRequesterJid, null, null);
        
        const manager = initCompanionManager();
        const activeSessions = manager.getActiveSessions();
        
        if (activeSessions.length === 0) {
            await XeonBotInc.sendMessage(chatId, {
                text: `📋 *Fermeture de tous les companions*\n\n❌ Aucun companion actif à fermer`
            });
            return;
        }
        
        // Filtrer les sessions accessibles selon les permissions
        let accessibleSessions = [];
        
        for (const sessionId of activeSessions) {
            if (isGlobalOwner) {
                accessibleSessions.push(sessionId);
            } else {
                // Extraire le nom du companion depuis l'ID de session
                const parts = (typeof sessionId === 'string' ? sessionId : String(sessionId)).split('-');
                const companionName = parts.length >= 2 ? parts[1] : '';
                
                if (companionName) {
                    // Vérifier si l'utilisateur est le propriétaire via DB
                    const companionInfo = await manager.getCompanionConfigFromDB(companionName);
                    if (companionInfo && jidNormalizedUser(companionInfo.owner_jid) === normalizedRequesterJid) {
                        accessibleSessions.push(sessionId);
                    }
                }
            }
        }
        
        if (accessibleSessions.length === 0) {
            await XeonBotInc.sendMessage(chatId, {
                text: `📋 *Fermeture de tous les companions*\n\n❌ Aucun companion accessible\n\n${isGlobalOwner ? 'Aucun companion actif.' : 'Tu ne peux fermer que les companions que tu as créés.'}`
            });
            return;
        }
        
        const totalActive = activeSessions.length;
        const totalAccessible = accessibleSessions.length;
        let closedCount = 0;
        
        await XeonBotInc.sendMessage(chatId, {
            text: `📋 *Fermeture de tous les companions*\n\n⏳ Companions à fermer: ${totalAccessible}${isGlobalOwner ? '' : '/' + totalActive + ' (tes companions)'}\n🔌 Fermeture en cours...`
        });
        
        // Fermer toutes les sessions accessibles
        for (const sessionId of accessibleSessions) {
            try {
                await manager.closeSession(sessionId);
                closedCount++;
            } catch (error) {
                console.error(`Error closing session ${sessionId}:`, error);
            }
        }
        
        const resultMessage = `✅ *Fermeture terminée*\n\n` +
                            `📊 *Résultats:*\n` +
                            `• Companions fermés: ${closedCount}/${totalAccessible}\n` +
                            `• Sessions nettoyées: ${closedCount}\n\n` +
                            `🔌 ${isGlobalOwner ? 'Tous les companions ont été déconnectés' : 'Tes companions ont été déconnectés'}`;
        
        await XeonBotInc.sendMessage(chatId, { text: resultMessage });
        
    } catch (error) {
        console.error('❌ Close all companions error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la fermeture des companions*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Nettoie les sessions orphelines
 */
async function handleCleanupSessions(XeonBotInc, m, chatId) {
    // ✅ VÉRIFICATION PERMISSIONS - Seul le propriétaire principal peut nettoyer les sessions
    const cleanupRequesterJid = m?.key?.participant || m?.key?.remoteJid;
    const { isOwnerOrSudo, hasExtendedPermissions } = require('../lib/isOwner');
    const isMainOwner = await isOwnerOrSudo(cleanupRequesterJid, XeonBotInc, chatId);
    
    if (!isMainOwner) {
        // Vérifier si c'est un propriétaire de companion (pour refuser l'accès)
        const permissions = await hasExtendedPermissions(cleanupRequesterJid, XeonBotInc, chatId);
        if (permissions.type === 'companion_owner') {
            await XeonBotInc.sendMessage(chatId, {
                text: '❌ *Accès refusé*\n\nSeul le propriétaire principal peut nettoyer les sessions système.\n\n💡 En tant que propriétaire de companion, vous ne pouvez pas effectuer de maintenance système.'
            });
            return;
        }
        
        // Accès refusé pour tous les autres
        await XeonBotInc.sendMessage(chatId, {
            text: '❌ *Permissions insuffisantes*\n\nSeul le propriétaire du bot peut nettoyer les sessions.'
        });
        return;
    }
    
    try {
        const manager = initCompanionManager();
        
        await XeonBotInc.sendMessage(chatId, {
            text: `🧹 *Nettoyage des sessions orphelines*\n\n⏳ Analyse des sessions en cours...`
        });
        
        const result = await manager.cleanupOrphanedSessions();
        
        let resultMessage = `🧹 *Nettoyage terminé*\n\n`;
        
        if (result.cleaned === 0) {
            resultMessage += `✅ *Aucune session orpheline trouvée*\n\n`;
            resultMessage += `📊 Toutes les sessions sont propres`;
        } else {
            resultMessage += `🗑️ *Sessions nettoyées:* ${result.cleaned}\n\n`;
            resultMessage += `📊 Sessions supprimées car incomplètes:\n`;
            resultMessage += `• Sessions non enregistrées sur WhatsApp\n`;
            resultMessage += `• Sessions avec authentification échouée\n`;
            resultMessage += `• Fichiers de session corrompus`;
        }
        
        if (result.errors && result.errors.length > 0) {
            resultMessage += `\n\n⚠️ *Erreurs:* ${result.errors.length}`;
        }
        
        await XeonBotInc.sendMessage(chatId, { text: resultMessage });
        
    } catch (error) {
        console.error('❌ Cleanup sessions error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors du nettoyage*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Liste TOUS les companions (actifs + endormis)
 */
async function handleListAllCompanions(XeonBotInc, m, chatId) {
    try {
        // Vérifier les permissions - cette commande peut exposer des données sensibles
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const normalizedRequesterJid = jidNormalizedUser(requesterJid);
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(normalizedRequesterJid, null, null);
        
        const manager = initCompanionManager();
        
        // ✅ NOUVELLE LOGIQUE SIMPLIFIÉE: Lire uniquement depuis la base de données comme source unique de vérité
        console.log(chalk.cyan(`[DATABASE] Fetching all companions from database...`));
        
        let allDbCompanions = [];
        try {
            const { data: dbCompanions, error } = await manager.db.supabase
                .from('companions')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('Error fetching companions from DB:', error.message);
                throw error;
            } else {
                allDbCompanions = dbCompanions || [];
                console.log(chalk.green(`[DATABASE] Found ${allDbCompanions.length} companions in database`));
            }
        } catch (dbError) {
            console.error('Database query error:', dbError.message);
            // Fallback en cas d'erreur de base de données
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Erreur de base de données*\n\n${serializeErrorForCommand(dbError)}\n\nEssaie à nouveau dans quelques instants.`
            });
            return;
        }
        
        // Filtrer les companions selon les permissions
        const visibleCompanions = [];
        
        for (const dbCompanion of allDbCompanions) {
            // Si global owner, voir tous les companions
            if (isGlobalOwner) {
                // Enrichir avec des informations de statut
                const ageInMinutes = (Date.now() - new Date(dbCompanion.created_at).getTime()) / (1000 * 60);
                const isOrphaned = dbCompanion.status === 'initializing' && ageInMinutes > 10;
                
                visibleCompanions.push({
                    name: dbCompanion.companion_name,
                    phone: dbCompanion.phone_number,
                    status: isOrphaned ? `⚠️ orphelin (${ageInMinutes.toFixed(1)}min)` : dbCompanion.status,
                    userId: dbCompanion.user_id,
                    createdAt: dbCompanion.created_at,
                    lastActivity: dbCompanion.last_activity,
                    isOrphaned: isOrphaned,
                    showPhone: true
                });
            } else {
                // Vérifier si l'utilisateur est le propriétaire de ce companion
                const isOwnerOfCompanion = jidNormalizedUser(dbCompanion.owner_jid) === normalizedRequesterJid;
                
                if (isOwnerOfCompanion) {
                    const ageInMinutes = (Date.now() - new Date(dbCompanion.created_at).getTime()) / (1000 * 60);
                    const isOrphaned = dbCompanion.status === 'initializing' && ageInMinutes > 10;
                    
                    visibleCompanions.push({
                        name: dbCompanion.companion_name,
                        phone: dbCompanion.phone_number,
                        status: isOrphaned ? `⚠️ orphelin (${ageInMinutes.toFixed(1)}min)` : dbCompanion.status,
                        userId: dbCompanion.user_id,
                        createdAt: dbCompanion.created_at,
                        lastActivity: dbCompanion.last_activity,
                        isOrphaned: isOrphaned,
                        showPhone: true
                    });
                }
            }
        }
        
        // Grouper par statut pour un affichage plus clair
        const companionsByStatus = {
            connected: visibleCompanions.filter(c => c.status === 'connected'),
            sleeping: visibleCompanions.filter(c => c.status === 'sleeping'),
            disconnected: visibleCompanions.filter(c => c.status === 'disconnected'),
            initializing: visibleCompanions.filter(c => c.status === 'initializing' && !c.isOrphaned),
            orphaned: visibleCompanions.filter(c => c.isOrphaned)
        };
        
        const totalCompanions = visibleCompanions.length;
        
        if (totalCompanions === 0) {
            await XeonBotInc.sendMessage(chatId, {
                text: `📋 *Liste Complète des Companions*\n\n❌ Aucun companion trouvé\n\nUtilise \`.companion create [phone] [name]\` pour créer un companion.`
            });
            return;
        }
        
        // ✅ NOUVEAU SYSTÈME D'AFFICHAGE ÉLÉGANT AVEC DESIGN AVANCÉ
        const currentTime = new Date().toLocaleString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        let companionsList = `🌹⃝━❮ 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧 𝐌𝐚𝐧𝐚𝐠𝐞𝐫 ❯━\n`;
        companionsList += `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n`;
        companionsList += `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n`;
        companionsList += `⊹ ☪︎⋆ 𝘊𝘰𝘮𝘱𝘢𝘯𝘪𝘰𝘯 𝘓𝘪𝘴𝘵 ✨\n`;
        companionsList += `┊ ${currentTime}\n`;
        companionsList += `✧\n\n`;
        
        companionsList += `┏━❮ 📊 𝐒𝐭𝐚𝐭𝐢𝐬𝐭𝐢𝐪𝐮𝐞𝐬 ❯━\n`;
        companionsList += `┃⛤┃📈 Total: ${totalCompanions} companion(s)\n`;
        companionsList += `┃⛤┃🟢 Connectés: ${companionsByStatus.connected.length}\n`;
        companionsList += `┃⛤┃😴 Endormis: ${companionsByStatus.sleeping.length}\n`;
        companionsList += `┃⛤┃📴 Déconnectés: ${companionsByStatus.disconnected.length}\n`;
        if (companionsByStatus.initializing.length > 0) {
            companionsList += `┃⛤┃⏳ Initialisation: ${companionsByStatus.initializing.length}\n`;
        }
        if (companionsByStatus.orphaned.length > 0) {
            companionsList += `┃⛤┃⚠️ Orphelins: ${companionsByStatus.orphaned.length}\n`;
        }
        companionsList += `┃⛤┗━━━━━━━━━━━━━━𖣔𖣔\n`;
        companionsList += `╰──────────────┈⊷\n\n`;
        
        // Companions connectés
        if (companionsByStatus.connected.length > 0) {
            companionsList += `┏━❮⛤ ᴄᴏᴍᴘᴀɴɪᴏɴꜱ ᴄᴏɴɴᴇᴄᴛᴇꜱ ⛤❯━\n`;
            companionsByStatus.connected.forEach((companion, i) => {
                companionsList += `┃✰╭─────────────·\n`;
                companionsList += `┃✰┃🟢 ${companion.name} ✅\n`;
                companionsList += `┃✰┃📱 ${companion.phone}\n`;
                companionsList += `┃✰┃🆔 ${companion.userId}\n`;
                if (companion.lastActivity) {
                    const lastActivity = new Date(companion.lastActivity).toLocaleString('fr-FR');
                    companionsList += `┃✰┃⏰ ${lastActivity}\n`;
                }
                companionsList += `┃✰└───────────┈⊷\n`;
            });
            companionsList += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
        }
        
        // Companions endormis
        if (companionsByStatus.sleeping.length > 0) {
            companionsList += `┏━❮⛤ ᴄᴏᴍᴘᴀɴɪᴏɴꜱ ᴇɴᴅᴏʀᴍɪꜱ ⛤❯━\n`;
            companionsByStatus.sleeping.forEach((companion, i) => {
                companionsList += `┃✰╭─────────────·\n`;
                companionsList += `┃✰┃😴 ${companion.name} 💤\n`;
                companionsList += `┃✰┃📱 ${companion.phone}\n`;
                companionsList += `┃✰┃🆔 ${companion.userId}\n`;
                if (companion.lastActivity) {
                    const lastActivity = new Date(companion.lastActivity).toLocaleString('fr-FR');
                    companionsList += `┃✰┃⏰ ${lastActivity}\n`;
                }
                companionsList += `┃✰└───────────┈⊷\n`;
            });
            companionsList += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
        }
        
        // Companions déconnectés  
        if (companionsByStatus.disconnected.length > 0) {
            companionsList += `┏━❮⛤ ᴄᴏᴍᴘᴀɴɪᴏɴꜱ ᴅᴇᴄᴏɴɴᴇᴄᴛᴇꜱ ⛤❯━\n`;
            companionsByStatus.disconnected.forEach((companion, i) => {
                companionsList += `┃✰╭─────────────·\n`;
                companionsList += `┃✰┃📴 ${companion.name} 🔌\n`;
                companionsList += `┃✰┃📱 ${companion.phone}\n`;
                companionsList += `┃✰┃🆔 ${companion.userId}\n`;
                companionsList += `┃✰└───────────┈⊷\n`;
            });
            companionsList += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
        }
        
        // Companions en initialisation
        if (companionsByStatus.initializing.length > 0) {
            companionsList += `⏳ *COMPANIONS EN INITIALISATION:*\n`;
            companionsByStatus.initializing.forEach((companion, i) => {
                companionsList += `${i + 1}. *${companion.name}* ⏳\n`;
                companionsList += `   📱 ${companion.phone}\n`;
                companionsList += `   🆔 ${companion.userId}\n`;
                const createdAt = new Date(companion.createdAt).toLocaleString('fr-FR');
                companionsList += `   📅 Créé: ${createdAt}\n`;
                companionsList += '\n';
            });
        }
        
        // Companions orphelins (plus de 10min en initializing)
        if (companionsByStatus.orphaned.length > 0) {
            companionsList += `┏━❮⛤ ᴄᴏᴍᴘᴀɴɪᴏɴꜱ ᴏʀᴘʜᴇʟɪɴꜱ ⛤❯━\n`;
            companionsByStatus.orphaned.forEach((companion, i) => {
                companionsList += `┃✰╭─────────────·\n`;
                companionsList += `┃✰┃⚠️ ${companion.name} 🧹\n`;
                companionsList += `┃✰┃📱 ${companion.phone}\n`;
                companionsList += `┃✰┃📊 ${companion.status}\n`;
                companionsList += `┃✰┃💡 Utilise .companion cleanup\n`;
                companionsList += `┃✰└───────────┈⊷\n`;
            });
            companionsList += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
        }
        
        companionsList += `┏━❮⛤ ᴄᴏᴍᴍᴀɴᴅᴇꜱ ᴅɪꜱᴘᴏɴɪʙʟᴇꜱ ⛤❯━\n`;
        companionsList += `┃✰╭─────────────·\n`;
        companionsList += `┃✰┃💡 || wake [name] - Réveiller\n`;
        companionsList += `┃✰┃💤 || sleep [name] - Endormir\n`;
        companionsList += `┃✰┃📊 || status - Voir le statut\n`;
        companionsList += `┃✰┃🔄 || list - Cette liste\n`;
        if (companionsByStatus.orphaned.length > 0) {
            companionsList += `┃✰┃🧹 || cleanup - Nettoyer orphelins\n`;
        }
        companionsList += `┃✰└───────────┈⊷\n`;
        companionsList += `┗━━━━━━━━━━━━━━𖣔𖣔\n`;
        companionsList += `┌───────────────┐\n`;
        companionsList += `│© ᴄᴏᴍᴘᴀɴɪᴏɴ ᴍᴀɴᴀɢᴇʀ ꜱʏꜱᴛᴇᴍ\n`;
        companionsList += `└───────────────┘`;
        
        await XeonBotInc.sendMessage(chatId, { text: companionsList });
        
    } catch (error) {
        console.error('❌ List all companions error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la récupération de la liste complète*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Réveille un companion endormi
 */
async function handleWakeCompanion(XeonBotInc, m, args, chatId) {
    try {
        const companionName = args[1];
        
        if (!companionName) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Nom du companion requis*\n\nUtilise: \`.companion wake [name]\`\n\nExemple: \`.companion wake john\`\n\nUtilise \`.companion list\` pour voir tous les companions.`
            });
            return;
        }

        // Vérifier les permissions avant de procéder (avec logique default-deny)
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const accessCheck = await ensureCompanionAccess(requesterJid, companionName);
        
        if (!accessCheck.authorized) {
            await XeonBotInc.sendMessage(chatId, { text: accessCheck.message });
            return;
        }
        
        const manager = initCompanionManager();
        
        // Vérifier que le companion existe dans la DB
        const companionInfo = await manager.getCompanionConfigFromDB(companionName);
        if (!companionInfo) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Companion '${companionName}' introuvable*\n\nUtilise \`.companion list\` pour voir tous les companions disponibles.`
            });
            return;
        }

        // Utiliser la nouvelle méthode pour trouver la session
        const match = manager.findSessionByName(companionName);
        
        if (match && match.type === 'active') {
            await XeonBotInc.sendMessage(chatId, {
                text: `⚠️ *Companion '${companionName}' est déjà actif*\n\nUtilise \`.companion status\` pour voir le statut de tous les companions.`
            });
            return;
        }

        if (!match) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Aucune session trouvée pour '${companionName}'*\n\nCrée un nouveau companion avec \`.companion create\`.`
            });
            return;
        }

        await XeonBotInc.sendMessage(chatId, {
            text: `⏰ *Réveil de ${companionName} en cours...*\n\n📱 Phone: ${companionInfo.phone_number}\n⚡ Reconnexion en cours...`
        });

        try {
            await manager.startCompanionBot(
                match.sessionPath, 
                companionInfo.phone_number || '0', 
                companionName, 
                match.sessionId, 
                null, 
                false, 
                true // isRestore = true
            );
            
            await XeonBotInc.sendMessage(chatId, {
                text: `🚀 *Companion '${companionName}' réveillé avec succès*\n\n✅ Connexion rétablie\n💬 Prêt à recevoir des commandes`
            });
            
        } catch (err) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Échec du réveil*\n\n${err.message}`
            });
        }
        
    } catch (error) {
        console.error('❌ Wake companion error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors du réveil du companion*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Endort un companion actif
 */
async function handleSleepCompanion(XeonBotInc, m, args, chatId) {
    try {
        const companionName = args[1];
        
        if (!companionName) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Nom du companion requis*\n\nUtilise: \`.companion sleep [name]\`\n\nExemple: \`.companion sleep john\`\n\nUtilise \`.companion list\` pour voir les companions actifs.`
            });
            return;
        }

        // Vérifier les permissions avant de procéder (avec logique default-deny)
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const accessCheck = await ensureCompanionAccess(requesterJid, companionName);
        
        if (!accessCheck.authorized) {
            await XeonBotInc.sendMessage(chatId, { text: accessCheck.message });
            return;
        }
        
        const manager = initCompanionManager();
        
        // Vérifier que le companion existe dans la DB
        const companionInfo = await manager.getCompanionConfigFromDB(companionName);
        if (!companionInfo) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Companion '${companionName}' introuvable*\n\nUtilise \`.companion list\` pour voir tous les companions disponibles.`
            });
            return;
        }
        
        // Vérifier si le companion est actif
        const activeSessions = manager.getActiveSessions();
        let foundSessionId = null;
        
        // Chercher le sessionId dans les sessions actives (support anciens et nouveaux formats)
        for (const sessionId of activeSessions) {
            if (sessionId === companionInfo.user_id || 
                sessionId.toLowerCase().includes(companionName.toLowerCase())) {
                foundSessionId = sessionId;
                break;
            }
        }
        
        if (!foundSessionId) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Companion '${companionName}' n'est pas actif*\n\nUtilise \`.companion status\` pour voir l'état des companions.`
            });
            return;
        }
        
        // Endormir le companion (fermer la connexion mais garder les fichiers)
        const session = manager.activeSessions.get(foundSessionId);
        if (session) {
            try {
                await session.end();
                console.log(`😴 ${companionName} went to sleep`);
            } catch (e) { /* ignore */ }
            manager.activeSessions.delete(foundSessionId);
        }
        
        await XeonBotInc.sendMessage(chatId, {
            text: `😴 *${companionName} s'est endormi avec succès*\n\n🔌 Connexion fermée\n💾 Session sauvegardée\n\n💡 Utilise \`.companion wake ${companionName}\` pour le réveiller.`
        });
        
    } catch (error) {
        console.error('❌ Sleep companion error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de l'endormissement du companion*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Réveille tous les companions endormis
 */
async function handleWakeAllCompanions(XeonBotInc, m, chatId) {
    try {
        // Vérifier les permissions - doit être owner global OU filtrer par propriétaire
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const normalizedRequesterJid = jidNormalizedUser(requesterJid);
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(normalizedRequesterJid, null, null);
        
        const manager = initCompanionManager();
        
        // Obtenir tous les companions endormis avec filtrage par propriétaire
        const fs = require('fs');
        const path = require('path');
        const sessionsDir = './sessions';
        
        let sleepingCompanions = [];
        let accessibleCompanions = [];
        
        if (fs.existsSync(sessionsDir)) {
            const folders = fs.readdirSync(sessionsDir).filter(f => f.startsWith('companion-'));
            const activeSessions = manager.getActiveSessions();
            
            for (const folder of folders) {
                try {
                    const sessionPath = path.join(sessionsDir, folder);
                    const credsPath = path.join(sessionPath, 'creds.json');
                    
                    if (fs.existsSync(credsPath) && !activeSessions.includes(folder)) {
                        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        
                        if (creds.registered && creds.me?.id) {
                            // Récupérer le nom depuis la base de données au lieu d'utiliser creds.me.name
                            // Extraire le nom de base du sessionId (format: companion-nom-timestamp)
                            // Utiliser lastIndexOf pour supporter les noms avec tirets (ex: john-doe)
                            const sessionWithoutPrefix = folder.startsWith('companion-') ? folder.slice(10) : folder;
                            const baseNameFromSession = sessionWithoutPrefix.slice(0, sessionWithoutPrefix.lastIndexOf('-'));
                            const companionInfo = await manager.getCompanionConfigFromDB(baseNameFromSession);
                            const companionName = companionInfo?.companion_name || baseNameFromSession;
                            
                            const companion = {
                                sessionId: folder,
                                name: companionName,
                                phone: (typeof creds.me.id === 'string' ? creds.me.id : String(creds.me.id)).split('@')[0].replace(/[^0-9]/g, '')
                            };
                            
                            sleepingCompanions.push(companion);
                            
                            // Vérifier l'accès pour ce companion spécifique
                            if (isGlobalOwner) {
                                accessibleCompanions.push(companion);
                            } else {
                                // Vérifier si l'utilisateur est le propriétaire via DB
                                if (companionInfo && jidNormalizedUser(companionInfo.owner_jid) === normalizedRequesterJid) {
                                    accessibleCompanions.push(companion);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error reading companion ${folder}:`, error);
                }
            }
        }
        
        if (accessibleCompanions.length === 0) {
            const message = sleepingCompanions.length === 0 ? 
                `📋 *Réveil de tous les companions*\n\n❌ Aucun companion endormi trouvé\n\nUtilise \`.companion list\` pour voir le statut de tous les companions.` :
                `📋 *Réveil de tous les companions*\n\n❌ Aucun companion accessible\n\n${isGlobalOwner ? 'Aucun companion endormi.' : 'Tu ne peux réveiller que les companions que tu as créés.'}`;
            await XeonBotInc.sendMessage(chatId, { text: message });
            return;
        }
        
        const totalSleeping = sleepingCompanions.length;
        const totalAccessible = accessibleCompanions.length;
        
        await XeonBotInc.sendMessage(chatId, {
            text: `⏰ *Réveil de tous les companions en cours...*\n\n📊 Companions à réveiller: ${totalAccessible}${isGlobalOwner ? '' : '/' + totalSleeping + ' (tes companions)'}\n⚡ Reconnexion en cours...`
        });
        
        let successCount = 0;
        let errorCount = 0;
        
        // Réveiller chaque companion accessible
        for (const companion of accessibleCompanions) {
            try {
                const wakeResult = await restoreExistingCompanion(manager, companion, chatId, XeonBotInc, true); // true = silent mode pour wakeall
                if (wakeResult.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
                
                // Petite pause entre les réveils
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                errorCount++;
                console.error(`❌ Error waking ${companion.name}:`, error);
            }
        }
        
        // Attendre un peu pour que les connexions se stabilisent
        setTimeout(async () => {
            const resultMessage = `🌟 *Réveil terminé!*\n\n` +
                                `📊 *Résultats:*\n` +
                                `• Companions réveillés: ${successCount}/${accessibleCompanions.length}\n` +
                                `• Erreurs: ${errorCount}\n\n` +
                                `🤖 Les companions sont maintenant actifs et prêts!\n\n` +
                                `💡 Teste avec: \`#ping\``;
            
            await XeonBotInc.sendMessage(chatId, { text: resultMessage });
        }, 5000);
        
    } catch (error) {
        console.error('❌ Wake all companions error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors du réveil des companions*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Restaure directement un companion existant en utilisant sa session sauvée
 * Cette fonction utilise directement Baileys pour éviter de créer une nouvelle session
 */
async function restoreExistingCompanion(manager, companion, chatId, XeonBotInc, silentMode = false) {
    try {
        const {
            default: makeWASocket,
            useMultiFileAuthState,
            fetchLatestBaileysVersion,
            makeCacheableSignalKeyStore
        } = require('@whiskeysockets/baileys');
        const pino = require('pino');
        
        console.log(`⏰ Restoring existing companion: ${companion.name} from ${companion.sessionPath || companion.sessionId}`);
        
        // Utiliser le sessionPath existant
        const sessionPath = companion.sessionPath || `./sessions/${companion.sessionId}`;
        
        // Charger l'état d'authentification existant
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        
        // Vérifier que la session est bien enregistrée
        if (!state.creds.registered) {
            console.log(`❌ Session ${companion.name} not registered, cannot restore`);
            if (!silentMode) {
                await XeonBotInc.sendMessage(chatId, {
                    text: `❌ *Session ${companion.name} non enregistrée*\n\nLa session n'est pas complètement configurée. Utilise \`.companion cleanup\` puis recrée le companion.`
                });
            }
            return { success: false, error: 'Session not registered' };
        }
        
        // Créer le socket Baileys avec l'état existant
        const companionSocket = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: [`Companion-${companion.name}`, "Chrome", "1.0.0"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: false,
            defaultQueryTimeoutMs: 30000,
        });
        
        // Sauvegarder les credentials
        companionSocket.ev.on('creds.update', saveCreds);
        
        return new Promise((resolve) => {
            let connectionResolved = false;
            
            // Timeout de 30 secondes pour la connexion
            const connectionTimeout = setTimeout(() => {
                if (!connectionResolved) {
                    connectionResolved = true;
                    console.log(`⏰ Connection timeout for ${companion.name}`);
                    try { companionSocket.end() } catch (e) { /* ignore */ }
                    resolve({ success: false, error: 'Connection timeout' });
                }
            }, 30000);
            
            // Gestionnaire de connexion
            companionSocket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'open' && !connectionResolved) {
                    connectionResolved = true;
                    clearTimeout(connectionTimeout);
                    
                    console.log(`🌟 ${companion.name} restored successfully!`);
                    
                    // Ajouter à la liste des sessions actives
                    const sessionId = companion.sessionId;
                    manager.activeSessions.set(sessionId, companionSocket);
                    
                    // Configure full message handling via CompanionSessionManager
                    companionSocket.ev.on('messages.upsert', async (messageUpdate) => {
                        try {
                            await manager.handleCompanionMessages(companionSocket, messageUpdate, companion.name);
                        } catch (error) {
                            console.error(`❌ Message handling error for ${companion.name}:`, error);
                        }
                    });
                    
                    if (!silentMode) {
                        await XeonBotInc.sendMessage(chatId, {
                            text: `🌟 *${companion.name} s'est réveillé avec succès!* ✅\n\n🤖 Le companion est maintenant actif et prêt à recevoir des messages.\n\n💡 Teste avec: \`#ping\``
                        });
                    }
                    
                    resolve({ success: true });
                }
                
                if (connection === 'close' && !connectionResolved) {
                    connectionResolved = true;
                    clearTimeout(connectionTimeout);
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`❌ ${companion.name} connection failed: ${statusCode}`);
                    
                    if (!silentMode) {
                        await XeonBotInc.sendMessage(chatId, {
                            text: `❌ *Échec du réveil de ${companion.name}*\n\nCode: ${statusCode}\n\nEssaie \`.companion cleanup\` puis retry.`
                        });
                    }
                    
                    resolve({ success: false, error: `Connection failed: ${statusCode}` });
                }
            });
        });
        
    } catch (error) {
        console.error(`❌ Error restoring companion ${companion.name}:`, error);
        if (!silentMode) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Erreur lors du réveil de ${companion.name}*\n\n${serializeErrorForCommand(error)}`
            });
        }
        return { success: false, error: serializeErrorForCommand(error) };
    }
}

/**
 * Nettoie tous les companions orphelins (en base mais sans session)
 */
async function handleCleanOrphans(XeonBotInc, m, chatId) {
    try {
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(requesterJid, null, null);
        
        if (!isGlobalOwner) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Permission refusée*\n\nSeuls les propriétaires du bot peuvent utiliser cette commande.`
            });
            return;
        }
        
        await XeonBotInc.sendMessage(chatId, {
            text: `🧹 *Nettoyage des companions orphelins*\n\n⏳ Recherche des orphelins en cours...`
        });
        
        const manager = initCompanionManager();
        const allCompanions = await manager.getAllCompanionsFromDB();
        const activeSessions = manager.getActiveSessions();
        
        let orphansFound = 0;
        let orphansDeleted = 0;
        let errors = [];
        
        for (const companion of allCompanions) {
            // Vérifier si le companion a une session active
            const hasActiveSession = activeSessions.some(sessionId => {
                const parts = (typeof sessionId === 'string' ? sessionId : String(sessionId)).split('-');
                const sessionName = parts.length >= 2 ? parts[1] : '';
                return sessionName.toLowerCase() === companion.name.toLowerCase();
            });
            
            if (!hasActiveSession) {
                orphansFound++;
                try {
                    // Supprimer de la DB
                    await manager.removeCompanionFromDB(companion.name);
                    
                    // Nettoyer les fichiers de session s'ils existent
                    try {
                        const { sessionPath } = manager.createSecureSessionPath(companion.name);
                        const fs = require('fs');
                        if (fs.existsSync(sessionPath)) {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                        }
                    } catch (cleanupError) {
                        console.log(`Warning: Could not cleanup session files for ${companion.name}: ${cleanupError.message}`);
                    }
                    
                    orphansDeleted++;
                    console.log(`🧹 Deleted orphan companion: ${companion.name}`);
                } catch (error) {
                    errors.push(`${companion.name}: ${serializeErrorForCommand(error)}`);
                    console.error(`❌ Error deleting orphan ${companion.name}:`, error);
                }
            }
        }
        
        let resultMessage = `✅ *Nettoyage terminé*\n\n`;
        resultMessage += `🔍 Orphelins trouvés: ${orphansFound}\n`;
        resultMessage += `🧹 Orphelins supprimés: ${orphansDeleted}\n`;
        
        if (errors.length > 0) {
            resultMessage += `⚠️ Erreurs: ${errors.length}\n\n`;
            resultMessage += `*Erreurs:*\n${errors.slice(0, 3).join('\n')}`;
            if (errors.length > 3) {
                resultMessage += `\n... et ${errors.length - 3} autres`;
            }
        }
        
        if (orphansFound === 0) {
            resultMessage = `✅ *Pas d'orphelins trouvés*\n\nTous les companions sont en ordre !`;
        }
        
        await XeonBotInc.sendMessage(chatId, { text: resultMessage });
        
    } catch (error) {
        console.error('❌ Clean orphans error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors du nettoyage*\n\n${serializeErrorForCommand(error)}`
        });
    }
}

/**
 * Vide complètement la base de données des companions
 */
async function handleClearAll(XeonBotInc, m, args, chatId) {
    try {
        const requesterJid = m?.key?.participant || m?.key?.remoteJid;
        const { isOwnerOrSudo } = require('../lib/isOwner');
        const isGlobalOwner = await isOwnerOrSudo(requesterJid, null, null);
        
        if (!isGlobalOwner) {
            await XeonBotInc.sendMessage(chatId, {
                text: `❌ *Permission refusée*\n\nSeuls les propriétaires du bot peuvent utiliser cette commande.`
            });
            return;
        }
        
        // Suppression directe sans confirmation (comme demandé par l'utilisateur)
        
        await XeonBotInc.sendMessage(chatId, {
            text: `🔥 *Suppression en cours...*\n\n⏳ Fermeture des sessions actives...`
        });
        
        const manager = initCompanionManager();
        let totalDeleted = 0;
        let sessionsTerminated = 0;
        let errors = [];
        
        try {
            // 1. Fermer toutes les sessions actives
            const activeSessions = manager.getActiveSessions();
            for (const sessionId of activeSessions) {
                try {
                    await manager.closeSession(sessionId);
                    sessionsTerminated++;
                } catch (error) {
                    console.error(`Error closing session ${sessionId}:`, error);
                }
            }
            
            // 2. Supprimer tous les companions de la DB
            const allCompanions = await manager.getAllCompanionsFromDB();
            for (const companion of allCompanions) {
                try {
                    await manager.removeCompanionFromDB(companion.name);
                    totalDeleted++;
                } catch (error) {
                    errors.push(`${companion.name}: ${serializeErrorForCommand(error)}`);
                }
            }
            
            // 3. Nettoyer physiquement tous les dossiers de session
            try {
                const fs = require('fs');
                const path = require('path');
                const sessionsDir = './sessions';
                
                if (fs.existsSync(sessionsDir)) {
                    const folders = fs.readdirSync(sessionsDir).filter(f => f.startsWith('companion-'));
                    for (const folder of folders) {
                        try {
                            const sessionPath = path.join(sessionsDir, folder);
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                        } catch (cleanupError) {
                            console.log(`Warning cleanup ${folder}:`, cleanupError.message);
                        }
                    }
                }
            } catch (cleanupError) {
                console.error('Error cleaning session folders:', cleanupError);
            }
            
        } catch (error) {
            errors.push(`Erreur globale: ${serializeErrorForCommand(error)}`);
        }
        
        let resultMessage = `🔥 *SUPPRESSION TERMINÉE*\n\n`;
        resultMessage += `📱 Sessions fermées: ${sessionsTerminated}\n`;
        resultMessage += `🗃️ Companions supprimés: ${totalDeleted}\n`;
        resultMessage += `🧹 Fichiers nettoyés\n`;
        
        if (errors.length > 0) {
            resultMessage += `\n⚠️ Erreurs: ${errors.length}`;
        }
        
        resultMessage += `\n\n✅ *Base de données companions vidée avec succès*`;
        
        await XeonBotInc.sendMessage(chatId, { text: resultMessage });
        
    } catch (error) {
        console.error('❌ Clear all error:', error);
        await XeonBotInc.sendMessage(chatId, {
            text: `❌ *Erreur lors de la suppression*\n\n${serializeErrorForCommand(error)}`
        });
    }
}