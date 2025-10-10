/**
 * Shared Command Handler Factory
 * Allows both main bot and companions to use the same command logic with different prefixes
 */

const fs = require('fs');
const { handleAutoread, autoreadCommand } = require('../commands/autoread');
const { handleAutotypingForMessage, autotypingCommand, showTypingAfterCommand } = require('../commands/autotyping');
const { handleChatbotResponse, handleChatbotCommand } = require('../commands/admin/chatbot');
const { handleBadwordDetection, antibadwordCommand } = require('./antibadword');
const { handleSerenaIntegration } = require('./serenaIntegration');
const { isBanned } = require('./isBanned');
const helpCommand = require('../commands/system/help');
const banCommand = require('../commands/admin/ban');
const companionCommand = require('../commands/companion');
const { promoteCommand } = require('../commands/promote');
const { demoteCommand } = require('../commands/demote');
const muteCommand = require('../commands/admin/mute');
const unmuteCommand = require('../commands/admin/unmute');
const stickerCommand = require('../commands/media/sticker');
const transcribeCommand = require('../commands/tts/transcribe');
const tsCommand = require('../commands/tts/ts');
const isAdmin = require('./isAdmin');
const warnCommand = require('../commands/admin/warn');
const warningsCommand = require('../commands/admin/warnings');
const ttsCommand = require('../commands/tts/tts');
const { tictactoeCommand, handleTicTacToeMove } = require('../commands/games/tictactoe');
const { incrementMessageCount, topMembers } = require('../commands/topmembers');
const ownerCommand = require('../commands/system/owner');
const deleteCommand = require('../commands/admin/delete');
const { handleAntilinkCommand, handleLinkDetection } = require('../commands/admin/antilink');
const { handleAntitagCommand, handleTagDetection } = require('../commands/admin/antitag');
const { Antilink } = require('./antilink');
const memeCommand = require('../commands/meme');
const tagCommand = require('../commands/tag');
const jokeCommand = require('../commands/joke');
const quoteCommand = require('../commands/quote');
const factCommand = require('../commands/fact');
const weatherCommand = require('../commands/weather');
const newsCommand = require('../commands/news');
const kickCommand = require('../commands/admin/kick');
const simageCommand = require('../commands/media/simage');
const svideoCommand = require('../commands/media/svideo');
const attpCommand = require('../commands/media/attp');
const { startHangman, guessLetter } = require('../commands/games/hangman');
const { startTrivia, answerTrivia } = require('../commands/games/trivia');
const { complimentCommand } = require('../commands/compliment');
const { insultCommand } = require('../commands/insult');
const { eightBallCommand } = require('../commands/eightball');
const { lyricsCommand } = require('../commands/utilities/lyrics');
const { dareCommand } = require('../commands/dare');
const { truthCommand } = require('../commands/truth');
const { clearCommand } = require('../commands/clear');
const pingCommand = require('../commands/system/ping');
const aliveCommand = require('../commands/system/alive');
const testCommand = require('../commands/system/test');
const connectCommand = require('../commands/system/connect');
const blurCommand = require('../commands/media/img-blur');
const welcomeCommand = require('../commands/welcome');
const goodbyeCommand = require('../commands/goodbye');
const githubCommand = require('../commands/utilities/github');
const tagAllCommand = require('../commands/tagall');
const takeCommand = require('../commands/take');
const flirtCommand = require('../commands/flirt');
const characterCommand = require('../commands/character');
const wastedCommand = require('../commands/wasted');
const shipCommand = require('../commands/ship');
const groupInfoCommand = require('../commands/groupinfo');
const resetlinkCommand = require('../commands/resetlink');
const staffCommand = require('../commands/staff');
const unbanCommand = require('../commands/admin/unban');
const emojimixCommand = require('../commands/utilities/emojimix');
const { handlePromotionEvent } = require('../commands/promote');
const { handleDemotionEvent } = require('../commands/demote');
const cmdCommand = require('../commands/system/cmd');
const aliasCommand = require('../commands/system/alias');
const viewOnceCommand = require('../commands/viewonce');
const clearSessionCommand = require('../commands/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('../commands/autostatus');
const { simpCommand } = require('../commands/simp');
const { stupidCommand } = require('../commands/stupid');
const stickerTelegramCommand = require('../commands/media/stickertelegram');
const textmakerCommand = require('../commands/media/textmaker');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('../commands/antidelete');
const clearTmpCommand = require('../commands/cleartmp');
const setProfilePicture = require('../commands/setpp');
const instagramCommand = require('../commands/downloads/instagram');
const facebookCommand = require('../commands/downloads/facebook');
const playCommand = require('../commands/downloads/play');
const tiktokCommand = require('../commands/downloads/tiktok');
const songCommand = require('../commands/downloads/song');
const aiCommand = require('../commands/ai/ai');
const { handleTranslateCommand } = require('../commands/utilities/translate');
const { handleSsCommand } = require('../commands/utilities/ss');
const { addCommandReaction, handleAreactCommand } = require('./reactions');
const { goodnightCommand } = require('../commands/goodnight');
const { shayariCommand } = require('../commands/shayari');
const { rosedayCommand } = require('../commands/roseday');
const imagineCommand = require('../commands/media/imagine');
const videoCommand = require('../commands/downloads/video');
const sudoCommand = require('../commands/sudo');
const { miscCommand, handleHeart } = require('../commands/misc');
const { animeCommand } = require('../commands/anime');
const { piesCommand, piesAlias } = require('../commands/pies');
const stickercropCommand = require('../commands/media/stickercrop');
const updateCommand = require('../commands/update');
const changelogCommand = require('../commands/changelog');
const notifyCommand = require('../commands/notify');
const removebgCommand = require('../commands/media/removebg');
const { reminiCommand } = require('../commands/media/remini');
const { dvoCommand } = require('../commands/dvo');
const { languageCommand } = require('../commands/system/language');
const { getText, getUserLanguage, getEnglishCommand } = require('./i18n');
const { getCommandManager } = require('./CommandManager');
const { pollCommand, voteCommand, pollResultsCommand, listPollsCommand, endPollCommand } = require('../commands/admin/poll');
const { rouletteCommand } = require('../commands/games/roulette');
const { riddleCommand } = require('../commands/games/riddle');
const { coinflipCommand } = require('../commands/games/coinflip');
const { rockpaperscissorsCommand } = require('../commands/games/rockpaperscissors');
const ytsearchCommand = require('../commands/downloads/ytsearch');
const { setGroupName, setGroupDescription, setGroupSettings, setGroupIcon, getGroupInfo, leaveGroup } = require('../commands/groupmanage');
const bugCommand = require('../commands/system/bug');
const suggestCommand = require('../commands/system/suggest');

/**
 * Factory function to build a message handler with customizable options
 * @param {Object} options Configuration options
 * @param {string} options.prefix Command prefix (e.g., '.' for main bot, '#' for companions)
 * @param {Function} options.isOwner Async function to check if user is owner/sudo
 * @param {string} options.botIdentity Bot identity ('main' or 'companion')
 * @param {Object} options.featureFlags Feature flags to enable/disable certain features
 * @param {Object} options.channelInfo Channel info object for bot branding
 * @returns {Function} Message handler function
 */
function buildMessageHandler(options) {
    const {
        prefix = '.',
        isOwner,
        botIdentity = 'main',
        featureFlags = {},
        channelInfo = {}
    } = options;

    // Build command lists with the configured prefix
    const adminCommands = [`${prefix}mute`, `${prefix}unmute`, `${prefix}ban`, `${prefix}unban`, `${prefix}promote`, `${prefix}demote`, `${prefix}kick`, `${prefix}tagall`, `${prefix}antilink`, `${prefix}antitag`];
    const ownerCommands = [`${prefix}mode`, `${prefix}autostatus`, `${prefix}antidelete`, `${prefix}cleartmp`, `${prefix}setpp`, `${prefix}clearsession`, `${prefix}areact`, `${prefix}autoreact`, `${prefix}autotyping`, `${prefix}autoread`, `${prefix}tts`];

    return async function handleMessages(sock, messageUpdate, printLog) {
        let chatId = null;
        let msg = null;
        try {
            const { messages, type } = messageUpdate;
            
            // Add debugging log to understand message types
            console.log(`📥 [${botIdentity.toUpperCase()}] Message update type: ${type}`);
            
            // Process notify, append, and history types instead of only 'notify'
            if (!['notify', 'append', 'history'].includes(type)) {
                console.log(`⚠️ [${botIdentity.toUpperCase()}] Skipping message type: ${type}`);
                return;
            }

            msg = messages?.[0] || null;
            if (!msg?.message) return;
            
            chatId = msg.key.remoteJid || null;
            if (!chatId) return;
            
            const message = msg;
            
            const textContent = message.message?.conversation || message.message?.extendedTextMessage?.text || 'no text';

            // Handle autoread functionality (only for main bot)
            if (featureFlags.enableAutomations && botIdentity === 'main') {
                await handleAutoread(sock, message);
            }

            // Store message for antidelete feature (only for main bot)
            if (featureFlags.enableAutomations && botIdentity === 'main' && message.message) {
                storeMessage(message);
            }

            // Handle message revocation (only for main bot)
            if (featureFlags.enableAutomations && botIdentity === 'main' && message.message?.protocolMessage?.type === 0) {
                await handleMessageRevocation(sock, message);
                return;
            }

            // Handle button clicks
            let selectedButtonId = null;
            
            if (message.message?.buttonsResponseMessage?.selectedButtonId) {
                selectedButtonId = message.message.buttonsResponseMessage.selectedButtonId;
                console.log('🔘 Button clicked:', selectedButtonId);
            } else if (message.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
                selectedButtonId = message.message.listResponseMessage.singleSelectReply.selectedRowId;
                console.log('📋 List item selected:', selectedButtonId);
            } else if (message.message?.listResponseMessage?.title) {
                selectedButtonId = message.message.listResponseMessage.title;
                console.log('📋 List response:', selectedButtonId);
            } else if (message.message?.templateButtonReplyMessage?.selectedId) {
                selectedButtonId = message.message.templateButtonReplyMessage.selectedId;
                console.log('📋 Template button clicked:', selectedButtonId);
            }
            
            if (selectedButtonId) {
                if (selectedButtonId === 'channel_link') {
                    await sock.sendMessage(chatId, {
                        text: '🔗 *Lien de notre chaîne WhatsApp :*\nhttps://whatsapp.com/channel/0029VbBQXGg1HspxA6qQAK1S\n\n📱 Cliquez sur le lien ci-dessus pour rejoindre notre chaîne et recevoir les dernières mises à jour du bot !'
                    }, { quoted: message });
                    return;
                }
            }

            const senderId = message.key.participant || message.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');
            const senderIsSudo = await isOwner(senderId);

            let userMessage = (
                message.message?.conversation?.trim() ||
                message.message?.extendedTextMessage?.text?.trim() ||
                message.message?.imageMessage?.caption?.trim() ||
                message.message?.videoMessage?.caption?.trim() ||
                ''
            ).toLowerCase().replace(/\.\s+/g, '.').trim();
            
            // Convert localized commands to English commands for processing
            if (userMessage.startsWith(prefix)) {
                const commandPart = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ')[0];
                const args = userMessage.slice(commandPart.length).trim();
                
                try {
                    const englishCommand = getEnglishCommand(senderId, commandPart.slice(prefix.length));
                    userMessage = prefix + englishCommand + (args ? ' ' + args : '');
                } catch (i18nError) {
                    console.error(`⚠️ [${botIdentity.toUpperCase()}] i18n mapping failed:`, i18nError.message);
                    // Continue with original command if i18n fails
                    console.log(`📝 [${botIdentity.toUpperCase()}] Using original command: ${commandPart}`);
                }
            }

            // Preserve raw message for commands like .tag that need original casing
            const rawText = message.message?.conversation?.trim() ||
                message.message?.extendedTextMessage?.text?.trim() ||
                message.message?.imageMessage?.caption?.trim() ||
                message.message?.videoMessage?.caption?.trim() ||
                '';
            
            // ✅ SKIP COMPANION COMMANDS: Si c'est un message '#' et que nous sommes le bot principal,
            // laisser les companions le traiter naturellement (ils reçoivent déjà les messages via leurs sockets)
            if (botIdentity === 'main' && userMessage.startsWith('#')) {
                console.log(`🔀 [COMPANION] Detected '#' command, skipping main bot handler: ${userMessage.substring(0, 30)}...`);
                return; // Les companions traiteront ce message via leurs propres handlers
            }

            // Only allow commands from 'notify' messages, not from 'append' or 'history'
            const isCommandMessage = userMessage.startsWith(prefix);
            if (isCommandMessage && type !== 'notify') {
                console.log(`⏩ [${botIdentity.toUpperCase()}] Skipping command from type '${type}': ${userMessage}`);
                return;
            }

            // Only log command usage
            if (isCommandMessage) {
                console.log(`📝 [${botIdentity.toUpperCase()}] Command used in ${isGroup ? 'group' : 'private'}: ${userMessage}`);
            }

            // Check if user is banned (skip ban check for unban command)
            try {
                const userIsBanned = await isBanned(senderId);
                if (userIsBanned && !userMessage.startsWith(`${prefix}unban`)) {
                    // Only respond occasionally to avoid spam
                    if (Math.random() < 0.1) {
                        await sock.sendMessage(chatId, {
                            text: '❌ You are banned from using the bot. Contact an admin to get unbanned.',
                            ...channelInfo
                        });
                    }
                    return;
                }
            } catch (error) {
                console.error('Error checking ban status:', error);
                // Continue if ban check fails
            }

            // First check if it's a game move
            if (/^[1-9]$/.test(userMessage) || /^(surrender|abandon|give up)$/i.test(userMessage)) {
                await handleTicTacToeMove(sock, chatId, senderId, userMessage);
                return;
            }

            // Check for non-command messages
            if (!userMessage.startsWith(prefix)) {
                // Show typing indicator if autotyping is enabled (only for main bot)
                if (featureFlags.enableAutomations && botIdentity === 'main') {
                    await handleAutotypingForMessage(sock, chatId, userMessage);
                }

                if (isGroup && featureFlags.enableAutomations && botIdentity === 'main') {
                    // Process non-command messages first
                    await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                    await Antilink(message, sock);
                    await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                    await handleTagDetection(sock, chatId, message, senderId);
                }
                return;
            }

            const isAdminCommand = adminCommands.some(cmd => userMessage.startsWith(cmd));
            const isOwnerCommand = ownerCommands.some(cmd => userMessage.startsWith(cmd));

            let isSenderAdmin = false;
            let isBotAdmin = false;

            // Check admin status only for admin commands in groups
            if (isGroup && isAdminCommand) {
                const adminStatus = await isAdmin(sock, chatId, senderId, message);
                isSenderAdmin = adminStatus.isSenderAdmin;
                isBotAdmin = adminStatus.isBotAdmin;

                if (!isBotAdmin) {
                    const errorMsg = require('./i18n').i18n.t(senderId, 'messages.bot_admin_required');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo }, { quoted: message });
                    return;
                }

                if (
                    userMessage.startsWith(`${prefix}mute`) ||
                    userMessage === `${prefix}unmute` ||
                    userMessage.startsWith(`${prefix}ban`) ||
                    userMessage.startsWith(`${prefix}unban`) ||
                    userMessage.startsWith(`${prefix}promote`) ||
                    userMessage.startsWith(`${prefix}demote`)
                ) {
                    if (!isSenderAdmin && !senderIsSudo) {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.admin_only');
                        await sock.sendMessage(chatId, {
                            text: errorMsg,
                            ...channelInfo
                        });
                        return;
                    }
                }
            }

            // Check owner status for owner commands
            if (isOwnerCommand) {
                if (!senderIsSudo) {
                    const errorMsg = require('./i18n').i18n.t(senderId, 'messages.owner_only');
                    await sock.sendMessage(chatId, { text: errorMsg });
                    return;
                }
            }

            // ✅ COMMAND MANAGER: Vérification centralisée des commandes
            // Extraire le nom de la commande (sans préfixe)
            const commandName = userMessage.split(' ')[0].substring(prefix.length);
            
            // Déterminer le rôle de l'utilisateur pour CommandManager
            let userRole = 'user';
            if (senderIsSudo) {
                userRole = 'owner';
            } else if (isGroup && isSenderAdmin) {
                userRole = 'admin';
            }
            
            // Vérifier si la commande peut être exécutée (seulement pour les groupes)
            if (isGroup && commandName) {
                try {
                    const commandManager = getCommandManager();
                    const permission = await commandManager.canExecuteCommand(chatId, commandName, userRole);
                    
                    if (!permission.allowed) {
                        // Commande désactivée ou autre raison
                        await sock.sendMessage(chatId, { 
                            text: permission.message || '❌ Cette commande n\'est pas disponible.',
                            ...channelInfo 
                        });
                        return;
                    }
                } catch (error) {
                    // Si CommandManager échoue, on continue quand même (fallback gracieux)
                    console.warn(`⚠️ [CommandManager] Erreur vérification commande: ${error.message}`);
                }
            }

            // Command handlers
            let commandExecuted = false;

            switch (true) {
                case userMessage === `${prefix}simage`: {
                    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMessage?.stickerMessage) {
                        await simageCommand(sock, quotedMessage, chatId, message);
                    } else {
                        const errorMsg = getText(senderId, 'SIMAGE_REPLY_TO_STICKER');
                        await sock.sendMessage(chatId, { text: `❌ ${errorMsg}`, ...channelInfo });
                    }
                    commandExecuted = true;
                    break;
                }
                case userMessage === `${prefix}svideo`: {
                    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMessage?.stickerMessage) {
                        await svideoCommand(sock, quotedMessage, chatId, message);
                    } else {
                        const errorMsg = getText(senderId, 'SVIDEO_REPLY_TO_STICKER');
                        await sock.sendMessage(chatId, { text: `❌ ${errorMsg}`, ...channelInfo });
                    }
                    commandExecuted = true;
                    break;
                }
                case userMessage.startsWith(`${prefix}kick`):
                    const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                    break;
                case userMessage.startsWith(`${prefix}mute`):
                    const muteDuration = parseInt((typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ')[1]);
                    if (isNaN(muteDuration)) {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.provide_minutes');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    } else {
                        await muteCommand(sock, chatId, senderId, muteDuration);
                    }
                    break;
                case userMessage === `${prefix}unmute`:
                    await unmuteCommand(sock, chatId, senderId);
                    break;
                case userMessage.startsWith(`${prefix}ban`):
                    await banCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}unban`):
                    await unbanCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}help` || userMessage === `${prefix}menu` || userMessage === `${prefix}bot` || userMessage === `${prefix}list` || userMessage.startsWith(`${prefix}help `):
                    console.log('🔍 [HANDLER DEBUG] HELP command matched, userMessage:', userMessage, 'prefix:', prefix);
                    const helpArgs = userMessage.startsWith(`${prefix}help `) ? (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1) : [];
                    console.log('🔍 [HANDLER DEBUG] HELP args:', helpArgs);
                    try {
                        await helpCommand(sock, chatId, message, global.channelLink, helpArgs, botIdentity);
                        console.log('🔍 [HANDLER DEBUG] HELP command executed successfully');
                    } catch (error) {
                        console.error('Help command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ Erreur aide: ${error.message}` });
                    }
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}cmd` || userMessage.startsWith(`${prefix}cmd `):
                    console.log('🔍 [HANDLER DEBUG] CMD command matched, userMessage:', userMessage, 'prefix:', prefix);
                    const cmdArgs = userMessage.startsWith(`${prefix}cmd `) ? (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1) : [];
                    console.log('🔍 [HANDLER DEBUG] CMD args:', cmdArgs);
                    try {
                        await cmdCommand(sock, chatId, message, cmdArgs, botIdentity);
                        console.log('🔍 [HANDLER DEBUG] CMD command executed successfully');
                    } catch (error) {
                        console.error('Cmd command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ Erreur cmd: ${error.message}` });
                    }
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}alias` || userMessage.startsWith(`${prefix}alias `):
                    console.log('🔍 [HANDLER DEBUG] ALIAS command matched, userMessage:', userMessage, 'prefix:', prefix);
                    const aliasArgs = userMessage.startsWith(`${prefix}alias `) ? (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1) : [];
                    console.log('🔍 [HANDLER DEBUG] ALIAS args:', aliasArgs);
                    try {
                        await aliasCommand(sock, chatId, message, aliasArgs, botIdentity);
                        console.log('🔍 [HANDLER DEBUG] ALIAS command executed successfully');
                    } catch (error) {
                        console.error('Alias command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ Erreur alias: ${error.message}` });
                    }
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}lang`):
                    const langArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    try {
                        await languageCommand(sock, chatId, message, langArgs);
                    } catch (error) {
                        console.error('Language command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ Erreur langue: ${error.message}` });
                    }
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}sticker` || userMessage === `${prefix}s` || userMessage.startsWith(`${prefix}sticker `) || userMessage.startsWith('#sticker'):
                    await stickerCommand(sock, chatId, message, userMessage);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}dvo`):
                    await dvoCommand(sock, chatId, message, userMessage);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}companion`):
                    const companionArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    try {
                        await companionCommand.execute(sock, message, companionArgs);
                    } catch (error) {
                        console.error('Companion command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ CompanionBot Error: ${error.message}` });
                    }
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}warnings`):
                    const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    await warningsCommand(sock, chatId, mentionedJidListWarnings, message);
                    break;
                case userMessage.startsWith(`${prefix}warn`):
                    const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                    break;
                case userMessage.startsWith(`${prefix}tts`):
                    let text = userMessage.slice(prefix.length + 3).trim();
                    await ttsCommand(sock, chatId, text, message);
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}delete` || userMessage === `${prefix}del`:
                    await deleteCommand(sock, chatId, message, senderId);
                    break;
                case userMessage.startsWith(`${prefix}attp`):
                    await attpCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}owner`:
                    await ownerCommand(sock, chatId);
                    break;
                case userMessage === `${prefix}ping`:
                    await pingCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}alive`:
                    await aliveCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}test`):
                    await testCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}connect`):
                    console.log('🔗 [CONNECT] Command detected:', userMessage);
                    try {
                        await connectCommand(sock, chatId, message);
                        console.log('✅ [CONNECT] Command executed successfully');
                        commandExecuted = true;
                    } catch (error) {
                        console.error('❌ [CONNECT] Command error:', error);
                        await sock.sendMessage(chatId, { text: `❌ Erreur connect: ${error.message}` });
                    }
                    break;
                case userMessage === `${prefix}tagall`:
                    if (isSenderAdmin || senderIsSudo) {
                        await tagAllCommand(sock, chatId, senderId, message);
                    } else {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.tagall_admin_only');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo }, { quoted: message });
                    }
                    break;
                case userMessage.startsWith(`${prefix}tag`):
                    const messageText = rawText.slice(prefix.length + 3).trim();
                    const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await tagCommand(sock, chatId, senderId, messageText, replyMessage);
                    break;
                case userMessage.startsWith(`${prefix}antilink`):
                    if (!isGroup) {
                        await sock.sendMessage(chatId, {
                            text: require('./i18n').i18n.t(senderId, 'messages.group_only'),
                            ...channelInfo
                        });
                        return;
                    }
                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, {
                            text: 'Please make the bot an admin first.',
                            ...channelInfo
                        });
                        return;
                    }
                    await handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin);
                    break;
                case userMessage.startsWith(`${prefix}antitag`):
                    if (!isGroup) {
                        await sock.sendMessage(chatId, {
                            text: require('./i18n').i18n.t(senderId, 'messages.group_only'),
                            ...channelInfo
                        });
                        return;
                    }
                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, {
                            text: 'Please make the bot an admin first.',
                            ...channelInfo
                        });
                        return;
                    }
                    await handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin);
                    break;
                case userMessage === `${prefix}meme`:
                    await memeCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}joke`:
                    await jokeCommand(sock, chatId, senderId);
                    break;
                case userMessage === `${prefix}quote`:
                    await quoteCommand(sock, chatId, senderId);
                    break;
                case userMessage === `${prefix}fact`:
                    await factCommand(sock, chatId, senderId);
                    break;
                case userMessage.startsWith(`${prefix}bug`):
                    const bugArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await bugCommand(sock, chatId, message, bugArgs);
                    break;
                case userMessage.startsWith(`${prefix}suggest`):
                    const suggestArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await suggestCommand(sock, chatId, message, suggestArgs);
                    break;
                case userMessage.startsWith(`${prefix}weather`):
                    const city = userMessage.slice(prefix.length + 7).trim();
                    if (city) {
                        await weatherCommand(sock, chatId, city);
                    } else {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.provide_city');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    }
                    break;
                case userMessage === `${prefix}news`:
                    await newsCommand(sock, chatId);
                    break;
                case userMessage.startsWith(`${prefix}ttt`) || userMessage.startsWith(`${prefix}tictactoe`) || userMessage.startsWith(`${prefix}tictac`):
                    const tttText = userMessage.replace(new RegExp(`^\\${prefix}(ttt|tictactoe|tictac)\\s*`), '').trim();
                    await tictactoeCommand(sock, chatId, senderId, tttText);
                    break;
                case userMessage.startsWith(`${prefix}move`):
                    const position = parseInt((typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ')[1]);
                    if (isNaN(position)) {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.provide_position');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    } else {
                        tictactoeMove(sock, chatId, senderId, position);
                    }
                    break;
                case userMessage === `${prefix}topmembers`:
                    topMembers(sock, chatId, isGroup);
                    break;
                case userMessage.startsWith(`${prefix}hangman`):
                    startHangman(sock, chatId);
                    break;
                case userMessage.startsWith(`${prefix}guess`):
                    const guessedLetter = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ')[1];
                    if (guessedLetter) {
                        guessLetter(sock, chatId, guessedLetter);
                    } else {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.guess_letter');
                        sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    }
                    break;
                case userMessage.startsWith(`${prefix}trivia`):
                    startTrivia(sock, chatId);
                    break;
                case userMessage.startsWith(`${prefix}answer`):
                    const answer = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1).join(' ');
                    if (answer) {
                        answerTrivia(sock, chatId, answer);
                    } else {
                        const errorMsg = require('./i18n').i18n.t(senderId, 'messages.provide_answer');
                        sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    }
                    break;
                case userMessage.startsWith(`${prefix}compliment`):
                    await complimentCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}insult`):
                    await insultCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}8ball`):
                    const question = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1).join(' ');
                    await eightBallCommand(sock, chatId, question);
                    break;
                case userMessage.startsWith(`${prefix}lyrics`):
                    const songTitle = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1).join(' ');
                    await lyricsCommand(sock, chatId, songTitle, message);
                    break;
                case userMessage === `${prefix}dare`:
                    await dareCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}truth`:
                    await truthCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}clear`:
                    if (isGroup) await clearCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}promote`):
                    const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    await promoteCommand(sock, chatId, mentionedJidListPromote, message);
                    break;
                case userMessage.startsWith(`${prefix}demote`):
                    const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    await demoteCommand(sock, chatId, mentionedJidListDemote, message);
                    break;
                case userMessage.startsWith(`${prefix}blur`):
                    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    await blurCommand(sock, chatId, message, quotedMessage);
                    break;
                case userMessage.startsWith(`${prefix}welcome`):
                    if (isGroup) {
                        if (!isSenderAdmin) {
                            const adminStatus = await isAdmin(sock, chatId, senderId);
                            isSenderAdmin = adminStatus.isSenderAdmin;
                        }
                        if (isSenderAdmin || senderIsSudo) {
                            await welcomeCommand(sock, chatId, message);
                        } else {
                            const errorMsg = require('./i18n').i18n.t(senderId, 'messages.admin_only');
                            await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                        }
                    } else {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    }
                    break;
                case userMessage.startsWith(`${prefix}goodbye`):
                    if (isGroup) {
                        if (!isSenderAdmin) {
                            const adminStatus = await isAdmin(sock, chatId, senderId);
                            isSenderAdmin = adminStatus.isSenderAdmin;
                        }
                        if (isSenderAdmin || senderIsSudo) {
                            await goodbyeCommand(sock, chatId, message);
                        } else {
                            const errorMsg = require('./i18n').i18n.t(senderId, 'messages.admin_only');
                            await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                        }
                    } else {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    }
                    break;
                case userMessage === `${prefix}git` || userMessage === `${prefix}github` || userMessage === `${prefix}sc` || userMessage === `${prefix}script` || userMessage === `${prefix}repo`:
                    await githubCommand(sock, chatId);
                    break;
                case userMessage.startsWith(`${prefix}antibadword`):
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    const adminStatus = await isAdmin(sock, chatId, senderId);
                    isSenderAdmin = adminStatus.isSenderAdmin;
                    isBotAdmin = adminStatus.isBotAdmin;
                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '*Bot must be admin to use this feature*', ...channelInfo });
                        return;
                    }
                    await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                    break;
                case userMessage.startsWith(`${prefix}chatbot`):
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    const hasOwnerPermission = await isOwner(senderId);
                    if (!hasOwnerPermission) {
                        const chatbotAdminStatus = await isAdmin(sock, chatId, senderId);
                        if (!chatbotAdminStatus.isSenderAdmin) {
                            await sock.sendMessage(chatId, { text: '*Only admins or bot owner can use this command*', ...channelInfo });
                            return;
                        }
                    }
                    const match = userMessage.slice(prefix.length + 7).trim();
                    await handleChatbotCommand(sock, chatId, message, match);
                    break;
                case userMessage.startsWith(`${prefix}take`):
                    const takeArgs = rawText.slice(prefix.length + 4).trim().split(' ');
                    await takeCommand(sock, chatId, message, takeArgs);
                    break;
                case userMessage === `${prefix}flirt`:
                    await flirtCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}character`):
                    await characterCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}waste`):
                    await wastedCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}ship`:
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    await shipCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}groupinfo` || userMessage === `${prefix}infogp` || userMessage === `${prefix}infogrupo`:
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    await groupInfoCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}resetlink` || userMessage === `${prefix}revoke` || userMessage === `${prefix}anularlink`:
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    await resetlinkCommand(sock, chatId, senderId);
                    break;
                case userMessage === `${prefix}staff` || userMessage === `${prefix}admins` || userMessage === `${prefix}listadmin`:
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: require('./i18n').i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                        return;
                    }
                    await staffCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}emojimix`) || userMessage.startsWith(`${prefix}emix`):
                    await emojimixCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}tg`) || userMessage.startsWith(`${prefix}stickertelegram`) || userMessage.startsWith(`${prefix}tgsticker`) || userMessage.startsWith(`${prefix}telesticker`):
                    await stickerTelegramCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}transcribe`) || userMessage.startsWith(`${prefix}transc`):
                    await transcribeCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}tss`):
                    let tssText = userMessage.slice(prefix.length + 3).trim();
                    await ttsCommand(sock, chatId, tssText, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}ts`) && !userMessage.startsWith(`${prefix}tss`):
                    const tsArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await tsCommand(sock, chatId, message, tsArgs);
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}vv`:
                    await dvoCommand(sock, chatId, message, userMessage);
                    break;
                case userMessage === `${prefix}clearsession` || userMessage === `${prefix}clearsesi`:
                    await clearSessionCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}autostatus`):
                    const autoStatusArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await autoStatusCommand(sock, chatId, message, autoStatusArgs);
                    break;
                case userMessage.startsWith(`${prefix}simp`):
                    await simpCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}metallic`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
                    break;
                case userMessage.startsWith(`${prefix}ice`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'ice');
                    break;
                case userMessage.startsWith(`${prefix}impressive`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
                    break;
                case userMessage.startsWith(`${prefix}matrix`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
                    break;
                case userMessage.startsWith(`${prefix}christmas`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'christmas');
                    break;
                case userMessage.startsWith(`${prefix}cyber`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'cyber');
                    break;
                case userMessage.startsWith(`${prefix}graffiti`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'graffiti');
                    break;
                case userMessage.startsWith(`${prefix}water`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'water');
                    break;
                case userMessage.startsWith(`${prefix}electric`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'electric');
                    break;
                case userMessage.startsWith(`${prefix}lava`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'lava');
                    break;
                case userMessage.startsWith(`${prefix}wooden`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'wooden');
                    break;
                case userMessage.startsWith(`${prefix}glass`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'glass');
                    break;
                case userMessage.startsWith(`${prefix}comic`):
                    await textmakerCommand(sock, chatId, message, userMessage, 'comic');
                    break;
                case userMessage === `${prefix}roulette`:
                    const rouletteArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await rouletteCommand(sock, chatId, message, rouletteArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}riddle`):
                    const riddleArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await riddleCommand(sock, chatId, message, riddleArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}coinflip`):
                    const coinflipArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await coinflipCommand(sock, chatId, message, coinflipArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}rps`):
                    const rpsArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await rockpaperscissorsCommand(sock, chatId, message, rpsArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}antidelete`):
                    const antideleteMatch = userMessage.slice(prefix.length + 10).trim();
                    await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                    break;
                case userMessage === `${prefix}surrender`:
                case userMessage === `${prefix}abandon`:
                case userMessage === `${prefix}give up`:
                    await handleTicTacToeMove(sock, chatId, senderId, userMessage.replace(prefix, ''));
                    break;
                case userMessage === `${prefix}cleartmp`:
                    await clearTmpCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}setpp`:
                    await setProfilePicture(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}instagram`) || userMessage.startsWith(`${prefix}insta`) || userMessage.startsWith(`${prefix}ig`):
                    await instagramCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}fb`) || userMessage.startsWith(`${prefix}facebook`):
                    await facebookCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}music`):
                    await playCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}play`) || userMessage.startsWith(`${prefix}mp3`) || userMessage.startsWith(`${prefix}song`):
                    await songCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}video`) || userMessage.startsWith(`${prefix}ytmp4`) || userMessage.startsWith(`${prefix}ytv`):
                    await videoCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}yta`) || userMessage.startsWith(`${prefix}ytmp3`):
                    await songCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}ytsearch`) || userMessage.startsWith(`${prefix}yts`):
                    await ytsearchCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}setname`):
                    const newName = userMessage.slice(prefix.length + 7).trim();
                    await setGroupName(sock, chatId, message, newName);
                    break;
                case userMessage.startsWith(`${prefix}setdesc`):
                    const newDesc = userMessage.slice(prefix.length + 7).trim();
                    await setGroupDescription(sock, chatId, message, newDesc);
                    break;
                case userMessage.startsWith(`${prefix}groupsetting`):
                    const settingValue = userMessage.slice(prefix.length + 12).trim();
                    await setGroupSettings(sock, chatId, message, settingValue);
                    break;
                case userMessage === `${prefix}seticon`:
                    await setGroupIcon(sock, chatId, message);
                    break;
                case userMessage === `${prefix}groupinfo` || userMessage === `${prefix}ginfo`:
                    await getGroupInfo(sock, chatId, message);
                    break;
                case userMessage === `${prefix}leave`:
                    await leaveGroup(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}tiktok`) || userMessage.startsWith(`${prefix}tt`):
                    await tiktokCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}gpt`) || userMessage.startsWith(`${prefix}gemini`):
                    await aiCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}translate`) || userMessage.startsWith(`${prefix}trt`):
                    const commandLength = userMessage.startsWith(`${prefix}translate`) ? prefix.length + 9 : prefix.length + 3;
                    await handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                    return;
                case userMessage.startsWith(`${prefix}ss`) || userMessage.startsWith(`${prefix}ssweb`) || userMessage.startsWith(`${prefix}screenshot`):
                    const ssCommandLength = userMessage.startsWith(`${prefix}screenshot`) ? prefix.length + 10 : (userMessage.startsWith(`${prefix}ssweb`) ? prefix.length + 5 : prefix.length + 2);
                    await handleSsCommand(sock, chatId, message, userMessage.slice(ssCommandLength).trim());
                    break;
                case userMessage.startsWith(`${prefix}areact`) || userMessage.startsWith(`${prefix}autoreact`) || userMessage.startsWith(`${prefix}autoreaction`):
                    const isOwnerOrSudo = senderIsSudo;
                    await handleAreactCommand(sock, chatId, message, isOwnerOrSudo);
                    break;
                case userMessage.startsWith(`${prefix}sudo`):
                    await sudoCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}goodnight` || userMessage === `${prefix}lovenight` || userMessage === `${prefix}gn`:
                    await goodnightCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}shayari` || userMessage === `${prefix}shayri`:
                    await shayariCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}roseday`:
                    await rosedayCommand(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}imagine`) || userMessage.startsWith(`${prefix}flux`) || userMessage.startsWith(`${prefix}dalle`):
                    await imagineCommand(sock, chatId, message);
                    break;
                case userMessage === `${prefix}jid`:
                    await groupJidCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}autotyping`):
                    await autotypingCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}autoread`):
                    await autoreadCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}heart`):
                    await handleHeart(sock, chatId, message);
                    break;
                case userMessage.startsWith(`${prefix}horny`):
                    const hornyParts = userMessage.trim().split(/\s+/);
                    const hornyArgs = ['horny', ...hornyParts.slice(1)];
                    await miscCommand(sock, chatId, message, hornyArgs);
                    break;
                case userMessage.startsWith(`${prefix}circle`):
                    const circleParts = userMessage.trim().split(/\s+/);
                    const circleArgs = ['circle', ...circleParts.slice(1)];
                    await miscCommand(sock, chatId, message, circleArgs);
                    break;
                case userMessage.startsWith(`${prefix}lgbt`):
                    const lgbtParts = userMessage.trim().split(/\s+/);
                    const lgbtArgs = ['lgbt', ...lgbtParts.slice(1)];
                    await miscCommand(sock, chatId, message, lgbtArgs);
                    break;
                case userMessage.startsWith(`${prefix}lolice`):
                    const loliceParts = userMessage.trim().split(/\s+/);
                    const loliceArgs = ['lolice', ...loliceParts.slice(1)];
                    await miscCommand(sock, chatId, message, loliceArgs);
                    break;
                case userMessage.startsWith(`${prefix}simpcard`):
                    const simpcardParts = userMessage.trim().split(/\s+/);
                    const simpcardArgs = ['simpcard', ...simpcardParts.slice(1)];
                    await miscCommand(sock, chatId, message, simpcardArgs);
                    break;
                case userMessage.startsWith(`${prefix}tonikawa`):
                    const tonikawaParts = userMessage.trim().split(/\s+/);
                    const tonikawaArgs = ['tonikawa', ...tonikawaParts.slice(1)];
                    await miscCommand(sock, chatId, message, tonikawaArgs);
                    break;
                case userMessage.startsWith(`${prefix}its-so-stupid`):
                    const stupidParts = userMessage.trim().split(/\s+/);
                    const stupidMiscArgs = ['its-so-stupid', ...stupidParts.slice(1)];
                    await miscCommand(sock, chatId, message, stupidMiscArgs);
                    break;
                case userMessage.startsWith(`${prefix}namecard`):
                    const namecardParts = userMessage.trim().split(/\s+/);
                    const namecardArgs = ['namecard', ...namecardParts.slice(1)];
                    await miscCommand(sock, chatId, message, namecardArgs);
                    break;
                case userMessage.startsWith(`${prefix}oogway2`) || userMessage.startsWith(`${prefix}oogway`):
                    const oogwayParts = userMessage.trim().split(/\s+/);
                    const oogwaySub = userMessage.startsWith(`${prefix}oogway2`) ? 'oogway2' : 'oogway';
                    const oogwayArgs = [oogwaySub, ...oogwayParts.slice(1)];
                    await miscCommand(sock, chatId, message, oogwayArgs);
                    break;
                case userMessage.startsWith(`${prefix}tweet`):
                    const tweetParts = userMessage.trim().split(/\s+/);
                    const tweetArgs = ['tweet', ...tweetParts.slice(1)];
                    await miscCommand(sock, chatId, message, tweetArgs);
                    break;
                case userMessage.startsWith(`${prefix}ytcomment`):
                    const ytcommentParts = userMessage.trim().split(/\s+/);
                    const ytcommentArgs = ['youtube-comment', ...ytcommentParts.slice(1)];
                    await miscCommand(sock, chatId, message, ytcommentArgs);
                    break;
                case userMessage.startsWith(`${prefix}comrade`) || userMessage.startsWith(`${prefix}gay`) || userMessage.startsWith(`${prefix}glass`) || userMessage.startsWith(`${prefix}jail`) || userMessage.startsWith(`${prefix}passed`) || userMessage.startsWith(`${prefix}triggered`):
                    const miscParts = userMessage.trim().split(/\s+/);
                    const miscSub = userMessage.slice(prefix.length).split(/\s+/)[0];
                    const miscGenericArgs = [miscSub, ...miscParts.slice(1)];
                    await miscCommand(sock, chatId, message, miscGenericArgs);
                    break;
                case userMessage.startsWith(`${prefix}animu`):
                    const animuParts = userMessage.trim().split(/\s+/);
                    const animuArgs = animuParts.slice(1);
                    await animeCommand(sock, chatId, message, animuArgs);
                    break;
                case userMessage.startsWith(`${prefix}nom`) || userMessage.startsWith(`${prefix}poke`) || userMessage.startsWith(`${prefix}cry`) || userMessage.startsWith(`${prefix}kiss`) || userMessage.startsWith(`${prefix}pat`) || userMessage.startsWith(`${prefix}hug`) || userMessage.startsWith(`${prefix}wink`) || userMessage.startsWith(`${prefix}facepalm`) || userMessage.startsWith(`${prefix}face-palm`) || userMessage.startsWith(`${prefix}animuquote`) || userMessage.startsWith(`${prefix}quote`) || userMessage.startsWith(`${prefix}neko`) || userMessage.startsWith(`${prefix}waifu`) || userMessage.startsWith(`${prefix}loli`):
                    const animeParts = userMessage.trim().split(/\s+/);
                    let animeSub = animeParts[0].slice(prefix.length);
                    if (animeSub === 'facepalm') animeSub = 'face-palm';
                    if (animeSub === 'quote' || animeSub === 'animuquote') animeSub = 'quote';
                    await animeCommand(sock, chatId, message, [animeSub]);
                    break;
                case userMessage === `${prefix}crop`:
                    await stickercropCommand(sock, chatId, message);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}pies`):
                    const piesParts = rawText.trim().split(/\s+/);
                    const piesArgs = piesParts.slice(1);
                    await piesCommand(sock, chatId, message, piesArgs);
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}china`:
                    await piesAlias(sock, chatId, message, 'china');
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}indonesia`:
                    await piesAlias(sock, chatId, message, 'indonesia');
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}japan`:
                    await piesAlias(sock, chatId, message, 'japan');
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}korea`:
                    await piesAlias(sock, chatId, message, 'korea');
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}hijab`:
                    await piesAlias(sock, chatId, message, 'hijab');
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}update`):
                    const updateParts = rawText.trim().split(/\s+/);
                    const updateArgs = updateParts.slice(1);
                    await updateCommand(sock, chatId, message, senderId, updateArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}changelog`):
                    const changelogParts = rawText.trim().split(/\s+/);
                    const changelogArgs = changelogParts.slice(1);
                    await changelogCommand(sock, chatId, message, changelogArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}notify`):
                    const notifyParts = rawText.trim().split(/\s+/);
                    const notifyArgs = notifyParts.slice(1);
                    await notifyCommand(sock, chatId, message, senderId, notifyArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}removebg`) || userMessage.startsWith(`${prefix}rmbg`) || userMessage.startsWith(`${prefix}nobg`):
                    await removebgCommand.exec(sock, message, (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1));
                    break;
                case userMessage.startsWith(`${prefix}remini`) || userMessage.startsWith(`${prefix}enhance`) || userMessage.startsWith(`${prefix}upscale`):
                    await reminiCommand(sock, chatId, message, (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1));
                    break;
                case userMessage.startsWith(`${prefix}poll`):
                    const pollArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await pollCommand(sock, chatId, senderId, message, pollArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}vote`):
                    const voteArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await voteCommand(sock, chatId, senderId, message, voteArgs);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}pollresults`):
                    const resultsArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await pollResultsCommand(sock, chatId, senderId, message, resultsArgs);
                    commandExecuted = true;
                    break;
                case userMessage === `${prefix}polls`:
                    await listPollsCommand(sock, chatId, senderId, message, []);
                    commandExecuted = true;
                    break;
                case userMessage.startsWith(`${prefix}endpoll`):
                    // Vérifier permissions admin
                    if (isGroup) {
                        const adminStatus = await isAdmin(sock, chatId, senderId, message);
                        const isSenderAdminLocal = adminStatus.isSenderAdmin;
                        const senderIsSudoLocal = await isOwner(senderId);
                        
                        if (!isSenderAdminLocal && !senderIsSudoLocal) {
                            await sock.sendMessage(chatId, {
                                text: '❌ Seuls les administrateurs peuvent terminer un sondage.',
                                ...channelInfo
                            });
                            break;
                        }
                    }
                    
                    const endPollArgs = (typeof userMessage === 'string' ? userMessage : String(userMessage)).split(' ').slice(1);
                    await endPollCommand(sock, chatId, senderId, message, endPollArgs);
                    commandExecuted = true;
                    break;
                default:
                    // For groups, handle non-command automations (only for main bot)
                    if (isGroup && featureFlags.enableAutomations && botIdentity === 'main') {
                        if (userMessage) {
                            await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                        }
                        await Antilink(message, sock);
                        await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                        await handleTagDetection(sock, chatId, message, senderId);
                    }

                    // Handle Serena AI integration for companions (both group and private)
                    if (featureFlags.enableAutomations && botIdentity === 'main') {
                        try {
                            // Vérifier si c'est un companion avec Serena activée
                            const { supabase } = require('../lib/supabase');
                            
                            // Rechercher le companion par context de chat
                            const { data: companions } = await supabase
                                .from('companions')
                                .select('*')
                                .or(`user_id.eq.${chatId},owner_jid.eq.${senderId}`)
                                .limit(1);
                            const companion = companions?.[0];

                            if (companion && companion.status === 'connected') {
                                // Essayer de traiter avec Serena
                                const handled = await handleSerenaIntegration(
                                    sock, message, chatId, isGroup, companion
                                );

                                if (handled) {
                                    console.log(`🤖 [SERENA] Message traité automatiquement pour ${companion.companion_name}`);
                                    commandExecuted = true; // Marquer comme traité pour éviter d'autres traitements
                                }
                            }
                        } catch (serenaError) {
                            console.error('❌ [SERENA] Erreur dans l\'intégration Serena:', serenaError);
                            // Ne pas bloquer les autres traitements en cas d'erreur Serena
                        }
                    }

                    commandExecuted = false;
                    break;
            }

            // If a command was executed, show typing status after command execution
            if (commandExecuted !== false) {
                await showTypingAfterCommand(sock, chatId);
            }

            if (userMessage.startsWith(prefix)) {
                // After command is processed successfully
                await addCommandReaction(sock, message);
            }

        } catch (error) {
            console.error(`❌ Error in ${botIdentity} message handler:`, error);
            // Only try to send error message if we have a valid chatId and message
            if (chatId && msg && msg.key) {
                try {
                    const senderId = msg.key.participant || msg.key.remoteJid;
                    const userLanguage = getUserLanguage(senderId);
                    const errorMsg = getText(userLanguage, 'processing_error');
                    await sock.sendMessage(chatId, {
                        text: errorMsg,
                        ...channelInfo
                    });
                } catch (sendError) {
                    console.error('Failed to send error message:', sendError);
                }
            }
        }

        // Function to handle .jid command (internal utility)
        async function groupJidCommand(sock, chatId, message) {
            const userJid = message.key.participant || message.key.remoteJid;
            const chatJid = message.key.remoteJid;
            const senderId = message.key.participant || message.key.remoteJid;
            const userLanguage = getUserLanguage(senderId) || 'fr';
            
            let responseText = '';
            
            // Si c'est un groupe
            if (chatJid.endsWith('@g.us')) {
                responseText = `🔗 *${getText(userLanguage, 'jid_info')}*\n\n` +
                              `👥 *${getText(userLanguage, 'group_jid')}:*\n\`${chatJid}\`\n\n` +
                              `👤 *${getText(userLanguage, 'your_jid')}:*\n\`${userJid}\``;
            } else {
                // Si c'est un chat privé
                responseText = `🔗 *${getText(userLanguage, 'jid_info')}*\n\n` +
                              `👤 *${getText(userLanguage, 'your_jid')}:*\n\`${userJid}\``;
            }
            
            // TOUJOURS envoyer en privé
            await sock.sendMessage(userJid, {
                text: responseText
            });
        }
    };
}

module.exports = { buildMessageHandler };