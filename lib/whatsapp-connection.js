/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */

// FIX CRITIQUE : désactiver les modules natifs bufferutil et utf-8-validate
// qui ne sont pas compilés pour ARM Android → crash "bufferUtil.mask is not a function"
// Ces variables DOIVENT être définies avant tout require() de ws/Baileys
process.env.WS_NO_BUFFER_UTIL = '1';
process.env.WS_NO_UTF_8_VALIDATE = '1';

require('../config/settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const PhoneNumber = require('awesome-phonenumber')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')
const path = require('path')

// Import lightweight store
const store = require('../lib/lightweight_store')

// Import lightweight group detection system
const { LightweightGroupDetection } = require('../lib/lightweightGroupDetection')
const { GroupSyncService } = require('../lib/groupSyncService')
const { supabaseBot } = require('../lib/supabase')
const { setWhatsAppInstance } = require('../lib/whatsappInstance')

// Import command handler system to process messages
const { buildMessageHandler } = require('../lib/commandHandler')
const isOwner = require('../lib/isOwner')

// Channel info for command handler
const channelInfo = {}

// Initialize store
store.readFromFile()
const settings = require('../config/settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Global lightweight group detection system (legacy)
let lightweightGroupDetection = null

// Global group sync service (nouveau système)
let groupSyncService = null

// NOTE: GC et surveillance mémoire gérés centralement dans index.js
// Ces setInterval dupliqués ont été supprimés pour éviter les conflits

let phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || process.env.BOT_PHONE_NUMBER || null

// Vérifier que le numéro de téléphone est configuré
if (!phoneNumber) {
    console.error('❌ ERREUR: Aucun numéro de téléphone configuré!');
    console.error('   Veuillez définir WHATSAPP_PHONE_NUMBER ou BOT_PHONE_NUMBER dans votre .env');
    console.error('   Exemple: WHATSAPP_PHONE_NUMBER=242061194809');
    process.exit(1);
}
let owner = [process.env.OWNER_NUMBER + "@s.whatsapp.net" || "242065491040@s.whatsapp.net"]

global.botname = "KNIGHT BOT"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

/**
 * FIX CODE 515 — Purge des clés Signal corrompues
 * Supprime tous les fichiers de session Signal SAUF creds.json
 * Cela force un nouveau handshake Signal sans rescanner le QR code
 */
function clearSignalKeys(sessionDir) {
    try {
        const dir = path.resolve(sessionDir);
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        let cleared = 0;
        for (const file of files) {
            if (file === 'creds.json') continue; // garder les credentials
            try {
                fs.unlinkSync(path.join(dir, file));
                cleared++;
            } catch {}
        }
        console.log(chalk.yellow(`🔑 ${cleared} clé(s) Signal supprimée(s) — creds.json conservé`));
    } catch (e) {
        console.warn(chalk.yellow(`⚠️ Impossible de purger les clés Signal: ${e.message}`));
    }
}

// Compteur d'erreurs de déchiffrement — auto-purge si trop d'échecs consécutifs
let decryptionErrorCount = 0;
let lastDecryptionReset = Date.now();
const MAX_DECRYPT_ERRORS = 10; // seuil avant purge auto

async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            // FIX SessionError : ne pas utiliser makeCacheableSignalKeyStore sur Android
            // Le cache en mémoire peut corrompre les sessions Signal (pre-key messages)
            // → utiliser state.keys directement pour une persistance fiable
            keys: state.keys,
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        // FIX SessionError : retour undefined (pas "") quand message introuvable
        // Baileys utilise cette valeur pour les retransmissions Signal
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || undefined
        },
        msgRetryCounterCache,
        retryRequestDelayMs: 250,
        defaultQueryTimeoutMs: undefined,
    })

    store.bind(XeonBotInc.ev)

    // Create message handler using the shared command factory
    const handleMessages = buildMessageHandler({
        prefix: '.',
        isOwner,
        botIdentity: 'main',
        featureFlags: {
            enableAutomations: true
        },
        channelInfo
    });

    // Add message handler for processing commands
    XeonBotInc.ev.on('messages.upsert', async (messageUpdate) => {
        try {
            // Réinitialiser le compteur d'erreurs toutes les 5 minutes
            if (Date.now() - lastDecryptionReset > 5 * 60 * 1000) {
                decryptionErrorCount = 0;
                lastDecryptionReset = Date.now();
            }

            await handleMessages(XeonBotInc, messageUpdate, true);

            // Message traité avec succès → réinitialiser le compteur
            if (decryptionErrorCount > 0) decryptionErrorCount = 0;

        } catch (error) {
            if (error?.name === 'SessionError' || error?.message?.includes('Session') ||
                error?.message?.includes('decrypt') || error?.message?.includes('Bad MAC')) {
                // Incrémenter le compteur d'erreurs Signal
                decryptionErrorCount++;
                console.warn(`⚠️ Erreur Signal (${decryptionErrorCount}/${MAX_DECRYPT_ERRORS}) — Baileys va reconstruire la session`);

                // Si trop d'erreurs consécutives → purger les clés Signal et redémarrer
                if (decryptionErrorCount >= MAX_DECRYPT_ERRORS) {
                    console.log(chalk.red(`🔑 Trop d'erreurs Signal (${decryptionErrorCount}) — purge automatique des clés...`));
                    clearSignalKeys('./session');
                    decryptionErrorCount = 0;
                    setTimeout(() => {
                        console.log(chalk.yellow('🔄 Redémarrage après purge Signal...'));
                        startXeonBotInc();
                    }, 3000);
                }
            } else {
                console.error('❌ Error in message handler:', error);
            }
        }
    });

    // Add smart group participant handler for bot join/leave detection
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        try {
            const { id: groupId, participants, action } = update;
            const botJid = XeonBotInc.user?.id;
            
            if (!botJid || !participants.includes(botJid)) {
                // Ce n'est pas le bot, mais on synchronise quand même pour mettre à jour le compte de participants
                if (groupSyncService) {
                    await groupSyncService.onParticipantsUpdate(update);
                }
                return;
            }

            // Initialiser le service de sync si pas encore fait
            if (!groupSyncService) {
                groupSyncService = new GroupSyncService(XeonBotInc);
            }

            // Handle bot events
            if (action === 'add') {
                console.log(chalk.green(`🆕 Bot ajouté au groupe: ${groupId}`));
                await groupSyncService.onGroupJoined(groupId);
            } else if (action === 'remove') {
                console.log(chalk.yellow(`👋 Bot retiré du groupe: ${groupId}`));
                await groupSyncService.onGroupLeft(groupId);
            }

        } catch (error) {
            console.error('❌ Erreur handler participants:', error);
        }
    });

    // Handler pour les mises à jour de groupe (nom, description, etc.)
    XeonBotInc.ev.on('groups.update', async (updates) => {
        if (groupSyncService) {
            await groupSyncService.onGroupUpdate(updates);
        }
    });

    // Connection management only - message handling removed
    XeonBotInc.public = true

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😊\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

    let isConnecting = false;
    let lastConnectionAttempt = 0;
    const MIN_RECONNECT_DELAY = 5000; // 5 seconds minimum between reconnection attempts

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            // Connexion établie → réinitialiser tous les compteurs d'erreurs
            decryptionErrorCount = 0;
            lastDecryptionReset = Date.now();

            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            // ── FIX "En attente de ce message" après reconnexion ─────────────
            // sendPresenceUpdate('available') force WhatsApp à re-établir les
            // sessions Signal avec les contacts → les messages bot deviennent
            // lisibles immédiatement. Délai 3s pour laisser la connexion stabiliser.
            setTimeout(async () => {
                try {
                    await XeonBotInc.sendPresenceUpdate('available');
                    console.log(chalk.green('✅ Présence "available" envoyée — sessions Signal re-établies'));
                } catch (_) {
                    console.log(chalk.yellow('⚠️ sendPresenceUpdate non critique — ignoré'));
                }
            }, 3000);

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: '*Bot actif !*\n\n Connecte a ' + new Date().toLocaleTimeString('fr-FR') + '\n Numero: ' + (XeonBotInc.user.id.split(':')[0] || '') + '\n\nTape .help pour voir toutes les commandes'
                });
                console.log('✅ Message connexion envoye');
            } catch (msgError) {
                console.log('⚠️ Echec message connexion:', msgError.message);
            }
            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: MR UNIQUE HACKER`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: mrunqiuehacker`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: MR UNIQUE HACKER`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))

            // 🚀 SYNCHRONISATION COMPLÈTE DES GROUPES
            try {
                // Initialiser le service de synchronisation
                if (!groupSyncService) {
                    groupSyncService = new GroupSyncService(XeonBotInc);
                    console.log(chalk.green(`✅ GroupSyncService initialisé`))
                }

                // Enregistrer l'instance WhatsApp globalement
                setWhatsAppInstance(XeonBotInc);

                // Démarrer le gestionnaire de statut du bot
                try {
                    const { getBotStatusManager } = require('../lib/botStatusManager');
                    const statusManager = getBotStatusManager();
                    await statusManager.initialize();
                } catch (statusError) {
                    console.warn(chalk.yellow(`⚠️ Bot status manager warning: ${statusError.message}`));
                }

                // Initialiser le CommandManager (système centralisé de gestion de commandes)
                try {
                    const { getCommandManager } = require('../lib/CommandManager');
                    const commandManager = getCommandManager();
                    await commandManager.initialize();
                    console.log(chalk.green(`✅ CommandManager initialisé`))
                } catch (cmdError) {
                    console.warn(chalk.yellow(`⚠️ CommandManager init warning: ${cmdError.message}`));
                }

                // Démarrer la synchronisation automatique
                setTimeout(async () => {
                    try {
                        console.log(chalk.blue(`\n🔄 Synchronisation complète des groupes...`))
                        const results = await groupSyncService.syncAllGroups();
                        
                        console.log(chalk.green(`✅ Synchronisation terminée !`))
                        console.log(chalk.green(`📊 ${results.synced} groupes synchronisés`))
                        if (results.errors > 0) {
                            console.log(chalk.yellow(`⚠️  ${results.errors} erreurs`))
                        }
                        
                        // Démarrer l'auto-sync toutes les 5 minutes
                        groupSyncService.startAutoSync(5);
                        console.log(chalk.green(`🔄 Auto-synchronisation activée (toutes les 5 minutes)`))
                        
                    } catch (syncError) {
                        console.error(chalk.red(`❌ Erreur synchronisation:`, syncError.message));
                    }
                }, 5000); // Attendre 5 secondes pour stabilité
                
            } catch (initError) {
                console.error(chalk.red(`❌ Erreur initialisation sync:`, initError.message));
            }

            // 🔔 DÉMARRER LE SERVICE DE NOTIFICATIONS DE LIAISON DE GROUPE
            try {
                const { startGroupLinkNotificationService } = require('../lib/groupLinkNotifications');
                startGroupLinkNotificationService(XeonBotInc, 30000); // Vérifier toutes les 30 secondes
                console.log(chalk.green(`✅ Service de notifications de liaison de groupe démarré`));
            } catch (notifError) {
                console.error(chalk.red(`❌ Erreur démarrage service notifications:`, notifError.message));
            }
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            console.log(chalk.red(`❌ Connection closed with status code: ${statusCode}`));

            // FIX CODE 515 — Stream error WhatsApp
            // Code 515 = WhatsApp demande un restart. Les clés Signal du serveur ont changé
            // → purger les clés Signal locales (garder creds.json) avant de reconnecter
            // Sinon tous les messages entrants sont illisibles → zéro commande ne marche
            if (statusCode === 515) {
                console.log(chalk.red('⚠️ Stream error 515 détecté — purge des clés Signal avant reconnexion...'));
                clearSignalKeys('./session');
            }
            
            // Prevent rapid reconnection attempts
            const now = Date.now();
            if (isConnecting || (now - lastConnectionAttempt) < MIN_RECONNECT_DELAY) {
                console.log(chalk.yellow(`⏳ Waiting before reconnection attempt...`));
                setTimeout(() => {
                    isConnecting = false;
                }, MIN_RECONNECT_DELAY);
                return;
            }
            
            isConnecting = true;
            lastConnectionAttempt = now;
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                } catch { }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
                setTimeout(() => {
                    isConnecting = false;
                    startXeonBotInc();
                }, 2000);
            } else {
                console.log(chalk.yellow(`🔄 Attempting to reconnect in 3 seconds...`));
                setTimeout(() => {
                    isConnecting = false;
                    startXeonBotInc();
                }, 3000);
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('creds.update', saveCreds)

    // Register WhatsApp instance globally for API access
    setWhatsAppInstance(XeonBotInc);

    return XeonBotInc
}

// Start the bot with error handling
startXeonBotInc().catch(err => {
    console.error('Fatal error:', err?.message || err)
    process.exit(1)
})

// FIX: Ne pas logger le full objet Boom — extraire seulement le message
// pour éviter le spam {"error":{"data":429,"isBoom":true,...}}
process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err)
    const code = err?.data || err?.output?.statusCode || ''
    console.error(`[whatsapp-connection] uncaughtException: ${msg}${code ? ` (code: ${code})` : ''}`)
})

process.on('unhandledRejection', (err) => {
    const msg = err?.message || String(err)
    const code = err?.data || err?.output?.statusCode || ''
    // Ignorer silencieusement les 429 déjà gérés par le circuit-breaker
    if (code === 429 || msg.includes('429')) return
    console.error(`[whatsapp-connection] unhandledRejection: ${msg}${code ? ` (code: ${code})` : ''}`)
})
