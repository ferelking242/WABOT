const settings = require('./config/settings');
require('./config/config');
const { isBanned } = require('./lib/isBanned');
const { db } = require('./lib/database');
const yts = require('yt-search');
const { fetchBuffer } = require('./lib/myfunc');
const fs = require('fs');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

// 🚀 OPTIMIZATION SYSTEMS - Import optimization manager
const { optimizationManager, executeApiCallOptimized, executeDatabaseOptimized } = require('./lib/optimizationManager');
const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn, isSudo } = require('./lib/index');
const { autotypingCommand, isAutotypingEnabled, handleAutotypingForMessage, handleAutotypingForCommand, showTypingAfterCommand } = require('./commands/autotyping');
const { autoreadCommand, isAutoreadEnabled, handleAutoread } = require('./commands/autoread');
const { i18n } = require('./lib/i18n');
const { logger } = require('./lib/logger');

// Command imports
const tagAllCommand = require('./commands/tagall');
const helpCommand = require('./commands/system/help');
const { isCommunity, getCommunityGroups, getCommunitySettings } = require('./commands/community/whatsapp-community');
const banCommand = require('./commands/admin/ban');
const companionCommand = require('./commands/companion');
const { promoteCommand } = require('./commands/promote');
const { demoteCommand } = require('./commands/demote');
const muteCommand = require('./commands/admin/mute');
const unmuteCommand = require('./commands/admin/unmute');
const stickerCommand = require('./commands/media/sticker');
const transcribeCommand = require('./commands/tts/transcribe');
const tsCommand = require('./commands/tts/ts');
const isAdmin = require('./lib/isAdmin');
const warnCommand = require('./commands/admin/warn');
const warningsCommand = require('./commands/admin/warnings');
const ttsCommand = require('./commands/tts/tts');
const { tictactoeCommand, handleTicTacToeMove, tictactoeMove } = require('./commands/games/tictactoe');
const { incrementMessageCount, topMembers } = require('./commands/topmembers');
const ownerCommand = require('./commands/system/owner');
const deleteCommand = require('./commands/admin/delete');
const { handleAntilinkCommand, handleLinkDetection } = require('./commands/admin/antilink');
const { handleAntitagCommand, handleTagDetection } = require('./commands/admin/antitag');
const { Antilink } = require('./lib/antilink');
const memeCommand = require('./commands/meme');
const tagCommand = require('./commands/tag');
const jokeCommand = require('./commands/joke');
const quoteCommand = require('./commands/quote');
const factCommand = require('./commands/fact');
const weatherCommand = require('./commands/weather');
const newsCommand = require('./commands/news');
const kickCommand = require('./commands/admin/kick');
const simageCommand = require('./commands/media/simage');
const svideoCommand = require('./commands/media/svideo');
const attpCommand = require('./commands/media/attp');
const { startHangman, guessLetter } = require('./commands/games/hangman');
const { startTrivia, answerTrivia } = require('./commands/games/trivia');
const { complimentCommand } = require('./commands/compliment');
const { insultCommand } = require('./commands/insult');
const { eightBallCommand } = require('./commands/eightball');
const { lyricsCommand } = require('./commands/utilities/lyrics');
const { dareCommand } = require('./commands/dare');
const { truthCommand } = require('./commands/truth');
const { clearCommand } = require('./commands/clear');
const pingCommand = require('./commands/system/ping');
const aliveCommand = require('./commands/system/alive');
const testCommand = require('./commands/system/test');
const connectCommand = require('./commands/system/connect');
const blurCommand = require('./commands/media/img-blur');
const welcomeCommand = require('./commands/welcome');
const goodbyeCommand = require('./commands/goodbye');
const githubCommand = require('./commands/utilities/github');
const { handleAntiBadwordCommand, handleBadwordDetection } = require('./lib/antibadword');
const antibadwordCommand = require('./commands/admin/antibadword');
const { handleChatbotCommand, handleChatbotResponse } = require('./commands/admin/chatbot');
const takeCommand = require('./commands/take');
const { flirtCommand } = require('./commands/flirt');
const characterCommand = require('./commands/character');
const wastedCommand = require('./commands/wasted');
const shipCommand = require('./commands/ship');
const groupInfoCommand = require('./commands/groupinfo');
const resetlinkCommand = require('./commands/resetlink');
const staffCommand = require('./commands/staff');
const companion = require('./commands/companion');
const unbanCommand = require('./commands/admin/unban');
const emojimixCommand = require('./commands/utilities/emojimix');
const { handlePromotionEvent } = require('./commands/promote');
const { handleDemotionEvent } = require('./commands/demote');
const cmdCommand = require('./commands/system/cmd');
const aliasCommand = require('./commands/system/alias');
const viewOnceCommand = require('./commands/viewonce');
const clearSessionCommand = require('./commands/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('./commands/autostatus');
const { simpCommand } = require('./commands/simp');
const { stupidCommand } = require('./commands/stupid');
const stickerTelegramCommand = require('./commands/media/stickertelegram');
const textmakerCommand = require('./commands/media/textmaker');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./commands/antidelete');
const { handlePhantomDeleteCommand, storeMessage: storePhantomMessage, handlePhantomMessageRevocation, handlePhantomButtonAction, loadPhantomDeleteConfig } = require('./commands/phantomdelete');
const clearTmpCommand = require('./commands/cleartmp');
const setProfilePicture = require('./commands/setpp');
const instagramCommand = require('./commands/downloads/instagram');
const facebookCommand = require('./commands/downloads/facebook');
const playCommand = require('./commands/downloads/play');
const tiktokCommand = require('./commands/downloads/tiktok');
const songCommand = require('./commands/downloads/song');
const aiCommand = require('./commands/ai/ai');
const { handleTranslateCommand } = require('./commands/utilities/translate');
const { handleSsCommand } = require('./commands/utilities/ss');
const { addCommandReaction, handleAreactCommand } = require('./lib/reactions');
const { goodnightCommand } = require('./commands/goodnight');
const { shayariCommand } = require('./commands/shayari');
const { rosedayCommand } = require('./commands/roseday');
const imagineCommand = require('./commands/media/imagine');
const videoCommand = require('./commands/downloads/video');
const likeCommand = require('./commands/like');
const dllikedCommand = require('./commands/downloads/dlliked');
const sudoCommand = require('./commands/sudo');
const { miscCommand, handleHeart } = require('./commands/misc');
const { animeCommand } = require('./commands/anime');
const { piesCommand, piesAlias } = require('./commands/pies');
const stickercropCommand = require('./commands/media/stickercrop');
const updateCommand = require('./commands/update');
const removebgCommand = require('./commands/media/removebg');
const { reminiCommand } = require('./commands/media/remini');
const { dvoCommand } = require('./commands/dvo');
const { languageCommand } = require('./commands/system/language');
const { getText, getUserLanguage, getEnglishCommand } = require('./lib/i18n');
const { rouletteCommand } = require('./commands/games/roulette');
const { riddleCommand } = require('./commands/games/riddle');
const { coinflipCommand } = require('./commands/games/coinflip');
const { rockpaperscissorsCommand } = require('./commands/games/rockpaperscissors');
const ytsearchCommand = require('./commands/downloads/ytsearch');
const { setGroupName, setGroupDescription, setGroupSettings, setGroupIcon, getGroupInfo, leaveGroup } = require('./commands/groupmanage');
const { buildMessageHandler } = require('./lib/commandHandler');
// ❌ Ancien système lourd supprimé - remplacé par LightweightGroupDetection

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029VbBQXGg1HspxA6qQAK1S";
global.ytch = "Mr Unique Hacker";

// ❌ Ancien système groupDetectionSystem supprimé - remplacé par LightweightGroupDetection

// Add this near the top of main.js with other global configurations
const channelInfo = {};

// Create main bot message handler using the shared command factory
const handleMessages = buildMessageHandler({
    prefix: '.',
    isOwner: require('./lib/isOwner'),
    botIdentity: 'main',
    featureFlags: {
        enableAutomations: true
    },
    channelInfo
});

// Keeping the old function signature for compatibility
async function handleMessagesOld(sock, messageUpdate, printLog) {
    let chatId = null; // Define chatId at the start for error handling
    let msg = null; // Define message variable for catch block
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        msg = messages?.[0] || null;
        if (!msg?.message) return;
        
        // Extract chatId from message
        chatId = msg.key.remoteJid || null;
        if (!chatId) return;
        
        // Use msg instead of message for consistency
        const message = msg;
        
        const textContent = message.message?.conversation || message.message?.extendedTextMessage?.text || 'no text';

        // Handle autoread functionality
        await handleAutoread(sock, message);

        // Store message for antidelete/phantom delete features (conditional)
        if (message.message) {
            // Vérifier si phantom delete est activé
            try {
                const phantomConfig = await loadPhantomDeleteConfig();
                
                if (phantomConfig.enabled) {
                    // Si phantom est activé, utiliser phantom uniquement
                    storePhantomMessage(message);
                } else {
                    // Sinon, utiliser antidelete classique
                    storeMessage(message);
                }
            } catch (err) {
                // En cas d'erreur, fallback vers antidelete
                console.error('Erreur chargement config phantom, fallback antidelete:', err);
                storeMessage(message);
            }
        }

        // Handle message revocation (conditional)
        if (message.message?.protocolMessage?.type === 0) {
            try {
                const phantomConfig = await loadPhantomDeleteConfig();
                
                if (phantomConfig.enabled) {
                    // Si phantom est activé, utiliser phantom uniquement
                    await handlePhantomMessageRevocation(sock, message);
                } else {
                    // Sinon, utiliser antidelete classique
                    await handleMessageRevocation(sock, message);
                }
            } catch (err) {
                // En cas d'erreur, fallback vers antidelete
                console.error('Erreur chargement config phantom pour révocation, fallback antidelete:', err);
                await handleMessageRevocation(sock, message);
            }
            return;
        }

        // Handle button clicks
        let selectedButtonId = null;
        
        if (message.message?.buttonsResponseMessage?.selectedButtonId) {
            selectedButtonId = message.message.buttonsResponseMessage.selectedButtonId;
            logger.info('Button clicked', { buttonId: selectedButtonId }, 'MESSAGES');
        } else if (message.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
            selectedButtonId = message.message.listResponseMessage.singleSelectReply.selectedRowId;
            logger.info('List item selected', { buttonId: selectedButtonId }, 'MESSAGES');
        } else if (message.message?.listResponseMessage?.title) {
            selectedButtonId = message.message.listResponseMessage.title;
            logger.info('List response', { buttonId: selectedButtonId }, 'MESSAGES');
        } else if (message.message?.templateButtonReplyMessage?.selectedId) {
            selectedButtonId = message.message.templateButtonReplyMessage.selectedId;
            logger.info('Template button clicked', { buttonId: selectedButtonId }, 'MESSAGES');
        }
        
        if (selectedButtonId) {
            // chatId already defined above
            
            // Handle phantom delete button actions
            if (await handlePhantomButtonAction(sock, message)) {
                return; // Button was handled by phantom system
            }
            
            if (selectedButtonId === 'channel_link') {
                await sock.sendMessage(chatId, {
                    text: '🔗 *Lien de notre chaîne WhatsApp :*\nhttps://whatsapp.com/channel/0029VbBQXGg1HspxA6qQAK1S\n\n📱 Cliquez sur le lien ci-dessus pour rejoindre notre chaîne et recevoir les dernières mises à jour du bot !'
                }, { quoted: message });
                return;
            }
        }

        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const isOwnerOrSudoFunction = require('./lib/isOwner');
        const senderIsSudo = await isOwnerOrSudoFunction(senderId);

        let userMessage = (
            message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            ''
        ).toLowerCase().replace(/\.\s+/g, '.').trim();
        
        // Convert localized commands to English commands for processing
        if (userMessage.startsWith('.')) {
            const commandPart = userMessage.split(' ')[0];
            const args = userMessage.slice(commandPart.length).trim();
            const englishCommand = getEnglishCommand(senderId, commandPart.slice(1));
            userMessage = '.' + englishCommand + (args ? ' ' + args : '');
        }

        // Preserve raw message for commands like .tag that need original casing
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        // Only log command usage
        if (userMessage.startsWith('.')) {
            logger.command(`Command used in ${isGroup ? 'group' : 'private'}: ${userMessage}`);
        }

        // Check if user is banned (skip ban check for unban command)
        try {
            const userIsBanned = await isBanned(senderId);
            if (userIsBanned && !userMessage.startsWith('.unban')) {
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
            logger.error('Error checking ban status', { error: error.message, stack: error.stack });
            // Continue if ban check fails
        }

        // First check if it's a game move
        if (/^[1-9]$/.test(userMessage) || userMessage.toLowerCase() === 'surrender') {
            await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            return;
        }

        /*  // Basic message response in private chat
          if (!isGroup && (userMessage === 'hi' || userMessage === 'hello' || userMessage === 'bot' || userMessage === 'hlo' || userMessage === 'hey' || userMessage === 'bro')) {
              await sock.sendMessage(chatId, {
                  text: 'Hi, How can I help you?\nYou can use .menu for more info and commands.',
                  ...channelInfo
              });
              return;
          } */

        if (!message.key.fromMe) incrementMessageCount(chatId, senderId);

        // Check for bad words FIRST, before ANY other processing
        if (isGroup && userMessage) {
            await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
        }

        // Then check for command prefix
        if (!userMessage.startsWith('.')) {
            // Show typing indicator if autotyping is enabled
            await handleAutotypingForMessage(sock, chatId, userMessage);

            if (isGroup) {
                // Process non-command messages first
                await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                await Antilink(message, sock);
                await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                await handleTagDetection(sock, chatId, message, senderId);
            }
            return;
        }

        // List of admin commands
        const adminCommands = ['.mute', '.unmute', '.ban', '.unban', '.promote', '.demote', '.kick', '.tagall', '.antilink', '.antitag'];
        const isAdminCommand = adminCommands.some(cmd => userMessage.startsWith(cmd));

        // List of owner commands - CENTRALIZED SYSTEM
        // REMOVED .companion - it has its own permission system via ensureCompanionAccess
        const ownerCommands = ['.mode', '.autostatus', '.antidelete', '.phantomdelete', '.cleartmp', '.setpp', '.clearsession', '.areact', '.autoreact', '.autotyping', '.autoread', '.tts'];
        const isOwnerCommand = ownerCommands.some(cmd => userMessage.startsWith(cmd));

        let isSenderAdmin = false;
        let isBotAdmin = false;

        // Check admin status only for admin commands in groups
        if (isGroup && isAdminCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId, message);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                const errorMsg = i18n.t(senderId, 'messages.bot_admin_required');
                await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo }, { quoted: message });
                return;
            }

            if (
                userMessage.startsWith('.mute') ||
                userMessage === '.unmute' ||
                userMessage.startsWith('.ban') ||
                userMessage.startsWith('.unban') ||
                userMessage.startsWith('.promote') ||
                userMessage.startsWith('.demote')
            ) {
                if (!isSenderAdmin && !senderIsSudo) {
                    const errorMsg = i18n.t(senderId, 'messages.admin_only');
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
                const errorMsg = i18n.t(senderId, 'messages.owner_only');
                await sock.sendMessage(chatId, { text: errorMsg });
                return;
            }
        }

        // Bot is now in public mode by default (migration complete)
        // Previously checked JSON files but now using database/Supabase
        // For now, allowing all commands to proceed

        // Command handlers - Execute commands immediately without waiting for typing indicator
        // We'll show typing indicator after command execution if needed
        let commandExecuted = false;

        switch (true) {
            case userMessage === '.simage': {
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
            case userMessage === '.svideo': {
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
            case userMessage.startsWith('.kick'):
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                break;
            case userMessage.startsWith('.mute'):
                const muteDuration = parseInt(userMessage.split(' ')[1]);
                if (isNaN(muteDuration)) {
                    const errorMsg = i18n.t(senderId, 'messages.provide_minutes');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                } else {
                    await muteCommand(sock, chatId, senderId, muteDuration);
                }
                break;
            case userMessage === '.unmute':
                await unmuteCommand(sock, chatId, senderId);
                break;
            case userMessage.startsWith('.ban'):
                await banCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.unban'):
                await unbanCommand(sock, chatId, message);
                break;
            case userMessage === '.help' || userMessage === '.menu' || userMessage === '.bot' || userMessage === '.list' || userMessage.startsWith('.help '):
                const helpArgs = userMessage.startsWith('.help ') ? userMessage.split(' ').slice(1) : [];
                try {
                    await helpCommand(sock, chatId, message, global.channelLink, helpArgs, 'main');
                } catch (error) {
                    logger.error('Help command error', { error: error.message, stack: error.stack }, 'COMMANDS');
                    await sock.sendMessage(chatId, { text: `❌ Erreur aide: ${error.message}` });
                }
                commandExecuted = true;
                break;
            case userMessage === '.cmd' || userMessage.startsWith('.cmd '):
                const cmdArgs = userMessage.startsWith('.cmd ') ? userMessage.split(' ').slice(1) : [];
                try {
                    await cmdCommand(sock, chatId, message, cmdArgs, 'main');
                } catch (error) {
                    logger.error('Cmd command error', { error: error.message, stack: error.stack }, 'COMMANDS');
                    await sock.sendMessage(chatId, { text: `❌ Erreur cmd: ${error.message}` });
                }
                commandExecuted = true;
                break;
            case userMessage === '.alias' || userMessage.startsWith('.alias '):
                const aliasArgs = userMessage.startsWith('.alias ') ? userMessage.split(' ').slice(1) : [];
                try {
                    await aliasCommand(sock, chatId, message, aliasArgs, 'main');
                } catch (error) {
                    logger.error('Alias command error', { error: error.message, stack: error.stack }, 'COMMANDS');
                    await sock.sendMessage(chatId, { text: `❌ Erreur alias: ${error.message}` });
                }
                commandExecuted = true;
                break;
            case userMessage.startsWith('.lang'):
                const langArgs = userMessage.split(' ').slice(1);
                try {
                    await languageCommand(sock, chatId, message, langArgs);
                } catch (error) {
                    logger.error('Language command error', { error: error.message, stack: error.stack }, 'COMMANDS');
                    await sock.sendMessage(chatId, { text: `❌ Erreur langue: ${error.message}` });
                }
                commandExecuted = true;
                break;
            case userMessage === '.sticker' || userMessage === '.s' || userMessage.startsWith('.sticker ') || userMessage.startsWith('#sticker'):
                await stickerCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.dvo'):
                await dvoCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.companion'):
                const companionArgs = userMessage.split(' ').slice(1);
                try {
                    await companionCommand.execute(sock, message, companionArgs);
                } catch (error) {
                    logger.error('Companion command error', { error: error.message, stack: error.stack }, 'COMMANDS');
                    await sock.sendMessage(chatId, { text: `❌ CompanionBot Error: ${error.message}` });
                }
                commandExecuted = true;
                break;
            case userMessage.startsWith('.warnings'):
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warningsCommand(sock, chatId, mentionedJidListWarnings, message);
                break;
            case userMessage.startsWith('.warn'):
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            case userMessage.startsWith('.tts'):
                let text = userMessage.slice(4).trim();
                await ttsCommand(sock, chatId, text, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.ttsgroq'):
                text = 'groq ' + userMessage.slice(8).trim();
                await ttsCommand(sock, chatId, text, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.ttsgtts'):
                text = 'gtts ' + userMessage.slice(8).trim();
                await ttsCommand(sock, chatId, text, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.ttselevenlabs'):
                text = 'elevenlabs ' + userMessage.slice(14).trim();
                await ttsCommand(sock, chatId, text, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.ttsauto'):
                text = 'auto ' + userMessage.slice(8).trim();
                await ttsCommand(sock, chatId, text, message);
                commandExecuted = true;
                break;
            case userMessage === '.delete' || userMessage === '.del':
                await deleteCommand(sock, chatId, message, senderId);
                break;
            case userMessage.startsWith('.attp'):
                await attpCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.mode'):
                // Check if sender is the owner
                if (!senderIsSudo) {
                    const errorMsg = i18n.t(senderId, 'messages.owner_only');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    return;
                }
                // Read current data first
                let data;
                try {
                    data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                } catch (error) {
                    console.error('Error reading access mode:', error);
                    const errorMsg = i18n.t(senderId, 'messages.bot_mode_read_failed');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    return;
                }

                const action = userMessage.split(' ')[1]?.toLowerCase();
                // If no argument provided, show current status
                if (!action) {
                    const currentMode = data.isPublic ? 'public' : 'private';
                    await sock.sendMessage(chatId, {
                        text: `Current bot mode: *${currentMode}*\n\nUsage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only`,
                        ...channelInfo
                    });
                    return;
                }

                if (action !== 'public' && action !== 'private') {
                    await sock.sendMessage(chatId, {
                        text: 'Usage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only',
                        ...channelInfo
                    });
                    return;
                }

                try {
                    // Update access mode
                    data.isPublic = action === 'public';

                    // Save updated data
                    fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));

                    await sock.sendMessage(chatId, { text: `Bot is now in *${action}* mode`, ...channelInfo });
                } catch (error) {
                    console.error('Error updating access mode:', error);
                    const errorMsg = i18n.t(senderId, 'messages.bot_mode_update_failed');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                }
                break;
            case userMessage === '.owner':
                await ownerCommand(sock, chatId);
                break;
            case userMessage === '.ping':
                await pingCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.connect':
                await connectCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.alive':
                await aliveCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.test'):
                await testCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage === '.tagall':
                if (isSenderAdmin || senderIsSudo) {
                    await tagAllCommand(sock, chatId, senderId, message);
                } else {
                    const errorMsg = i18n.t(senderId, 'messages.tagall_admin_only');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo }, { quoted: message });
                }
                break;
            case userMessage.startsWith('.tag'):
                const messageText = rawText.slice(4).trim();  // use rawText here, not userMessage
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                await tagCommand(sock, chatId, senderId, messageText, replyMessage);
                break;
            case userMessage.startsWith('.antilink'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: i18n.t(senderId, 'messages.group_only'),
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
            case userMessage.startsWith('.antitag'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: i18n.t(senderId, 'messages.group_only'),
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
            case userMessage === '.meme':
                await memeCommand(sock, chatId, message);
                break;
            case userMessage === '.joke':
                await jokeCommand(sock, chatId, senderId);
                break;
            case userMessage === '.quote':
                await quoteCommand(sock, chatId, senderId);
                break;
            case userMessage === '.fact':
                await factCommand(sock, chatId, senderId);
                break;
            case userMessage.startsWith('.weather'):
                const city = userMessage.slice(9).trim();
                if (city) {
                    await weatherCommand(sock, chatId, city);
                } else {
                    const errorMsg = i18n.t(senderId, 'messages.provide_city');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                }
                break;
            case userMessage === '.news':
                await newsCommand(sock, chatId);
                break;
            case userMessage.startsWith('.jouer') || userMessage.startsWith('.tictac'):
                const tttText = userMessage.replace(/^\.(jouer|tictac)\s*/, '').trim();
                await tictactoeCommand(sock, chatId, senderId, tttText, message);
                break;
            case userMessage.startsWith('.move'):
                const position = parseInt(userMessage.split(' ')[1]);
                if (isNaN(position)) {
                    const errorMsg = i18n.t(senderId, 'messages.provide_position');
                    await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                } else {
                    tictactoeMove(sock, chatId, senderId, position);
                }
                break;
            case userMessage === '.topmembers':
                topMembers(sock, chatId, isGroup);
                break;
            case userMessage.startsWith('.hangman'):
                startHangman(sock, chatId);
                break;
            case userMessage.startsWith('.guess'):
                const guessedLetter = userMessage.split(' ')[1];
                if (guessedLetter) {
                    guessLetter(sock, chatId, guessedLetter);
                } else {
                    const errorMsg = i18n.t(senderId, 'messages.guess_letter');
                    sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                }
                break;
            case userMessage.startsWith('.trivia'):
                startTrivia(sock, chatId);
                break;
            case userMessage.startsWith('.answer'):
                const answer = userMessage.split(' ').slice(1).join(' ');
                if (answer) {
                    answerTrivia(sock, chatId, answer);
                } else {
                    const errorMsg = i18n.t(senderId, 'messages.provide_answer');
                    sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                }
                break;
            case userMessage.startsWith('.compliment'):
                await complimentCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.insult'):
                await insultCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.8ball'):
                const question = userMessage.split(' ').slice(1).join(' ');
                await eightBallCommand(sock, chatId, question);
                break;
            case userMessage.startsWith('.lyrics'):
                const songTitle = userMessage.split(' ').slice(1).join(' ');
                await lyricsCommand(sock, chatId, songTitle, message);
                break;
            case userMessage.startsWith('.simp'):
                const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await simpCommand(sock, chatId, quotedMsg, mentionedJid, senderId);
                break;
            case userMessage.startsWith('.stupid') || userMessage.startsWith('.itssostupid') || userMessage.startsWith('.iss'):
                const stupidQuotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const stupidMentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const stupidArgs = userMessage.split(' ').slice(1);
                await stupidCommand(sock, chatId, stupidQuotedMsg, stupidMentionedJid, senderId, stupidArgs);
                break;
            case userMessage === '.dare':
                await dareCommand(sock, chatId, message);
                break;
            case userMessage === '.truth':
                await truthCommand(sock, chatId, message);
                break;
            case userMessage === '.clear':
                if (isGroup) await clearCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.promote'):
                const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await promoteCommand(sock, chatId, mentionedJidListPromote, message);
                break;
            case userMessage.startsWith('.demote'):
                const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await demoteCommand(sock, chatId, mentionedJidListDemote, message);
                break;
            case userMessage === '.ping':
                await pingCommand(sock, chatId, message);
                break;
            case userMessage === '.connect':
                await connectCommand(sock, chatId, message);
                break;
            case userMessage === '.alive':
                await aliveCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.test'):
                await testCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.blur'):
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                await blurCommand(sock, chatId, message, quotedMessage);
                break;
            case userMessage.startsWith('.welcome'):
                if (isGroup) {
                    // Check admin status if not already checked
                    if (!isSenderAdmin) {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = adminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || senderIsSudo) {
                        await welcomeCommand(sock, chatId, message);
                    } else {
                        const errorMsg = i18n.t(senderId, 'messages.admin_only');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    }
                } else {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                }
                break;
            case userMessage.startsWith('.goodbye'):
                if (isGroup) {
                    // Check admin status if not already checked
                    if (!isSenderAdmin) {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = adminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || senderIsSudo) {
                        await goodbyeCommand(sock, chatId, message);
                    } else {
                        const errorMsg = i18n.t(senderId, 'messages.admin_only');
                        await sock.sendMessage(chatId, { text: errorMsg, ...channelInfo });
                    }
                } else {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                }
                break;
            case userMessage === '.git':
            case userMessage === '.github':
            case userMessage === '.sc':
            case userMessage === '.script':
            case userMessage === '.repo':
                await githubCommand(sock, chatId);
                break;
            case userMessage.startsWith('.antibadword'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
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
            case userMessage.startsWith('.chatbot'):
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    return;
                }

                // Check if sender is owner/sudo or group admin
                const isOwnerOrSudoFunction = require('./lib/isOwner');
                const hasOwnerPermission = await isOwnerOrSudoFunction(senderId);
                
                if (!hasOwnerPermission) {
                    const chatbotAdminStatus = await isAdmin(sock, chatId, senderId);
                    if (!chatbotAdminStatus.isSenderAdmin) {
                        await sock.sendMessage(chatId, { text: '*Only admins or bot owner can use this command*', ...channelInfo });
                        return;
                    }
                }

                const match = userMessage.slice(8).trim();
                await handleChatbotCommand(sock, chatId, message, match);
                break;
            case userMessage.startsWith('.take'):
                const takeArgs = rawText.slice(5).trim().split(' ');
                await takeCommand(sock, chatId, message, takeArgs);
                break;
            case userMessage === '.flirt':
                await flirtCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.character'):
                await characterCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.waste'):
                await wastedCommand(sock, chatId, message);
                break;
            case userMessage === '.ship':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    return;
                }
                await shipCommand(sock, chatId, message);
                break;
            case userMessage === '.groupinfo' || userMessage === '.infogp' || userMessage === '.infogrupo':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    return;
                }
                await groupInfoCommand(sock, chatId, message);
                break;
            case userMessage === '.resetlink' || userMessage === '.revoke' || userMessage === '.anularlink':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    return;
                }
                await resetlinkCommand(sock, chatId, senderId);
                break;
            case userMessage === '.staff' || userMessage === '.admins' || userMessage === '.listadmin':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: i18n.t(senderId, 'messages.group_only'), ...channelInfo });
                    return;
                }
                await staffCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.emojimix') || userMessage.startsWith('.emix'):
                await emojimixCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.tg') || userMessage.startsWith('.stickertelegram') || userMessage.startsWith('.tgsticker') || userMessage.startsWith('.telesticker'):
                await stickerTelegramCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.transcribe') || userMessage.startsWith('.transc'):
                await transcribeCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.tss'):
                let tssText = userMessage.slice(4).trim();
                await ttsCommand(sock, chatId, tssText, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.ts') && !userMessage.startsWith('.tss'):
                const tsArgs = userMessage.split(' ').slice(1);
                await tsCommand(sock, chatId, message, tsArgs);
                commandExecuted = true;
                break;

            case userMessage === '.vv':
                await dvoCommand(sock, chatId, message, userMessage);
                break;
            case userMessage === '.clearsession' || userMessage === '.clearsesi':
                await clearSessionCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.autostatus'):
                const autoStatusArgs = userMessage.split(' ').slice(1);
                await autoStatusCommand(sock, chatId, message, autoStatusArgs);
                break;
            case userMessage.startsWith('.simp'):
                await simpCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.metallic'):
                await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
                break;
            case userMessage.startsWith('.ice'):
                await textmakerCommand(sock, chatId, message, userMessage, 'ice');
                break;
            case userMessage.startsWith('.snow'):
                await textmakerCommand(sock, chatId, message, userMessage, 'snow');
                break;
            case userMessage.startsWith('.impressive'):
                await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
                break;
            case userMessage.startsWith('.matrix'):
                await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
                break;
            case userMessage.startsWith('.light'):
                await textmakerCommand(sock, chatId, message, userMessage, 'light');
                break;
            case userMessage.startsWith('.neon'):
                await textmakerCommand(sock, chatId, message, userMessage, 'neon');
                break;
            case userMessage.startsWith('.devil'):
                await textmakerCommand(sock, chatId, message, userMessage, 'devil');
                break;
            case userMessage.startsWith('.purple'):
                await textmakerCommand(sock, chatId, message, userMessage, 'purple');
                break;
            case userMessage.startsWith('.thunder'):
                await textmakerCommand(sock, chatId, message, userMessage, 'thunder');
                break;
            case userMessage.startsWith('.leaves'):
                await textmakerCommand(sock, chatId, message, userMessage, 'leaves');
                break;
            case userMessage.startsWith('.1917'):
                await textmakerCommand(sock, chatId, message, userMessage, '1917');
                break;
            case userMessage.startsWith('.arena'):
                await textmakerCommand(sock, chatId, message, userMessage, 'arena');
                break;
            case userMessage.startsWith('.hacker'):
                await textmakerCommand(sock, chatId, message, userMessage, 'hacker');
                break;
            case userMessage.startsWith('.sand'):
                await textmakerCommand(sock, chatId, message, userMessage, 'sand');
                break;
            case userMessage.startsWith('.blackpink'):
                await textmakerCommand(sock, chatId, message, userMessage, 'blackpink');
                break;
            case userMessage.startsWith('.glitch'):
                await textmakerCommand(sock, chatId, message, userMessage, 'glitch');
                break;
            case userMessage.startsWith('.fire'):
                await textmakerCommand(sock, chatId, message, userMessage, 'fire');
                break;
            case userMessage.startsWith('.retro'):
                await textmakerCommand(sock, chatId, message, userMessage, 'retro');
                break;
            case userMessage.startsWith('.christmas'):
                await textmakerCommand(sock, chatId, message, userMessage, 'christmas');
                break;
            case userMessage.startsWith('.cyber'):
                await textmakerCommand(sock, chatId, message, userMessage, 'cyber');
                break;
            case userMessage.startsWith('.graffiti'):
                await textmakerCommand(sock, chatId, message, userMessage, 'graffiti');
                break;
            case userMessage.startsWith('.water'):
                await textmakerCommand(sock, chatId, message, userMessage, 'water');
                break;
            case userMessage.startsWith('.electric'):
                await textmakerCommand(sock, chatId, message, userMessage, 'electric');
                break;
            case userMessage.startsWith('.lava'):
                await textmakerCommand(sock, chatId, message, userMessage, 'lava');
                break;
            case userMessage.startsWith('.wooden'):
                await textmakerCommand(sock, chatId, message, userMessage, 'wooden');
                break;
            case userMessage.startsWith('.glass'):
                await textmakerCommand(sock, chatId, message, userMessage, 'glass');
                break;
            case userMessage.startsWith('.comic'):
                await textmakerCommand(sock, chatId, message, userMessage, 'comic');
                break;
            case userMessage === '.roulette':
                const rouletteArgs = userMessage.split(' ').slice(1);
                await rouletteCommand(sock, chatId, message, rouletteArgs);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.riddle'):
                const riddleArgs = userMessage.split(' ').slice(1);
                await riddleCommand(sock, chatId, message, riddleArgs);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.coinflip'):
                const coinflipArgs = userMessage.split(' ').slice(1);
                await coinflipCommand(sock, chatId, message, coinflipArgs);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.rps'):
                const rpsArgs = userMessage.split(' ').slice(1);
                await rockpaperscissorsCommand(sock, chatId, message, rpsArgs);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.antidelete'):
                const antideleteMatch = userMessage.slice(11).trim();
                await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                break;
            case userMessage.startsWith('.phantomdelete'):
                console.log('🔍 [DEBUG] .phantomdelete case triggered');
                const phantomMatch = userMessage.slice(14).trim();
                console.log('🔍 [DEBUG] phantomMatch:', phantomMatch);
                console.log('🔍 [DEBUG] About to call handlePhantomDeleteCommand');
                await handlePhantomDeleteCommand(sock, chatId, message, phantomMatch);
                console.log('🔍 [DEBUG] handlePhantomDeleteCommand completed');
                break;
            case userMessage === '.surrender':
                // Handle surrender command for tictactoe game
                await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
                break;
            case userMessage === '.cleartmp':
                await clearTmpCommand(sock, chatId, message);
                break;
            case userMessage === '.setpp':
                await setProfilePicture(sock, chatId, message);
                break;
            case userMessage.startsWith('.instagram') || userMessage.startsWith('.insta') || userMessage.startsWith('.ig'):
                await instagramCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.fb') || userMessage.startsWith('.facebook'):
                await facebookCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.music'):
                await playCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.play') || userMessage.startsWith('.mp3') || userMessage.startsWith('.song'):
                await songCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.video') || userMessage.startsWith('.ytmp4') || userMessage.startsWith('.ytv'):
                await videoCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.yta') || userMessage.startsWith('.ytmp3'):
                await songCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.ytsearch') || userMessage.startsWith('.yts'):
                await ytsearchCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.setname'):
                const newName = userMessage.slice(8).trim();
                await setGroupName(sock, chatId, message, newName);
                break;
            case userMessage.startsWith('.setdesc'):
                const newDesc = userMessage.slice(8).trim();
                await setGroupDescription(sock, chatId, message, newDesc);
                break;
            case userMessage.startsWith('.groupsetting'):
                const settingValue = userMessage.slice(13).trim();
                await setGroupSettings(sock, chatId, message, settingValue);
                break;
            case userMessage === '.seticon':
                await setGroupIcon(sock, chatId, message);
                break;
            case userMessage === '.groupinfo' || userMessage === '.ginfo':
                await getGroupInfo(sock, chatId, message);
                break;
            case userMessage === '.leave':
                await leaveGroup(sock, chatId, message);
                break;
            case userMessage.startsWith('.tiktok') || userMessage.startsWith('.tt'):
                await tiktokCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.like'):
                await likeCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.dlliked') || userMessage.startsWith('.downloadliked') || userMessage.startsWith('.getliked'):
                await dllikedCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.gpt') || userMessage.startsWith('.gemini'):
                await aiCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.translate') || userMessage.startsWith('.trt'):
                const commandLength = userMessage.startsWith('.translate') ? 10 : 4;
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                return;
            case userMessage.startsWith('.ss') || userMessage.startsWith('.ssweb') || userMessage.startsWith('.screenshot'):
                const ssCommandLength = userMessage.startsWith('.screenshot') ? 11 : (userMessage.startsWith('.ssweb') ? 6 : 3);
                await handleSsCommand(sock, chatId, message, userMessage.slice(ssCommandLength).trim());
                break;
            case userMessage.startsWith('.areact') || userMessage.startsWith('.autoreact') || userMessage.startsWith('.autoreaction'):
                const isOwnerOrSudo = senderIsSudo;
                await handleAreactCommand(sock, chatId, message, isOwnerOrSudo);
                break;
            case userMessage.startsWith('.sudo'):
                await sudoCommand(sock, chatId, message);
                break;
            case userMessage === '.goodnight' || userMessage === '.lovenight' || userMessage === '.gn':
                await goodnightCommand(sock, chatId, message);
                break;
            case userMessage === '.shayari' || userMessage === '.shayri':
                await shayariCommand(sock, chatId, message);
                break;
            case userMessage === '.roseday':
                await rosedayCommand(sock, chatId, message);
                break;
            case userMessage.startsWith('.imagine') || userMessage.startsWith('.flux') || userMessage.startsWith('.dalle'): await imagineCommand(sock, chatId, message);
                break;
            case userMessage === '.jid': 
                await groupJidCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.autotyping'):
                await autotypingCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.autoread'):
                await autoreadCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.heart'):
                await handleHeart(sock, chatId, message);
                break;
            case userMessage.startsWith('.horny'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['horny', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.circle'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['circle', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.lgbt'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lgbt', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.lolice'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lolice', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.simpcard'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['simpcard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.tonikawa'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['tonikawa', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.its-so-stupid'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['its-so-stupid', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.namecard'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['namecard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;

            case userMessage.startsWith('.oogway2'):
            case userMessage.startsWith('.oogway'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.startsWith('.oogway2') ? 'oogway2' : 'oogway';
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.tweet'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['tweet', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.ytcomment'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['youtube-comment', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.comrade'):
            case userMessage.startsWith('.gay'):
            case userMessage.startsWith('.glass'):
            case userMessage.startsWith('.jail'):
            case userMessage.startsWith('.passed'):
            case userMessage.startsWith('.triggered'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.slice(1).split(/\s+/)[0];
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.animu'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = parts.slice(1);
                    await animeCommand(sock, chatId, message, args);
                }
                break;
            // animu aliases
            case userMessage.startsWith('.nom'):
            case userMessage.startsWith('.poke'):
            case userMessage.startsWith('.cry'):
            case userMessage.startsWith('.kiss'):
            case userMessage.startsWith('.pat'):
            case userMessage.startsWith('.hug'):
            case userMessage.startsWith('.wink'):
            case userMessage.startsWith('.facepalm'):
            case userMessage.startsWith('.face-palm'):
            case userMessage.startsWith('.animuquote'):
            case userMessage.startsWith('.quote'):
            case userMessage.startsWith('.neko'):
            case userMessage.startsWith('.waifu'):
            case userMessage.startsWith('.loli'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    let sub = parts[0].slice(1);
                    if (sub === 'facepalm') sub = 'face-palm';
                    if (sub === 'quote' || sub === 'animuquote') sub = 'quote';
                    await animeCommand(sock, chatId, message, [sub]);
                }
                break;
            case userMessage === '.crop':
                await stickercropCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith('.pies'):
                {
                    const parts = rawText.trim().split(/\s+/);
                    const args = parts.slice(1);
                    await piesCommand(sock, chatId, message, args);
                    commandExecuted = true;
                }
                break;
            case userMessage === '.china':
                await piesAlias(sock, chatId, message, 'china');
                commandExecuted = true;
                break;
            case userMessage === '.indonesia':
                await piesAlias(sock, chatId, message, 'indonesia');
                commandExecuted = true;
                break;
            case userMessage === '.japan':
                await piesAlias(sock, chatId, message, 'japan');
                commandExecuted = true;
                break;
            case userMessage === '.korea':
                await piesAlias(sock, chatId, message, 'korea');
                commandExecuted = true;
                break;
            case userMessage === '.hijab':
                await piesAlias(sock, chatId, message, 'hijab');
                commandExecuted = true;
                break;
            case userMessage.startsWith('.update'):
                {
                    const parts = rawText.trim().split(/\s+/);
                    const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
                    await updateCommand(sock, chatId, message, senderIsSudo, zipArg);
                }
                commandExecuted = true;
                break;
            case userMessage.startsWith('.removebg') || userMessage.startsWith('.rmbg') || userMessage.startsWith('.nobg'):
                await removebgCommand.exec(sock, message, userMessage.split(' ').slice(1));
                break;
            case userMessage.startsWith('.remini') || userMessage.startsWith('.enhance') || userMessage.startsWith('.upscale'):
                await reminiCommand(sock, chatId, message, userMessage.split(' ').slice(1));
                break;
            // Handle automatic tictac moves (numbers 1-9 and abandon)
            case /^[1-9]$/.test(userMessage) || /^(abandon|surrender)$/i.test(userMessage):
                await handleTicTacToeMove(sock, chatId, senderId, userMessage);
                commandExecuted = true;
                break;
            default:
                if (isGroup) {
                    // Handle non-command group messages
                    if (userMessage) {  // Make sure there's a message
                        await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                    }
                    await Antilink(message, sock);
                    await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                    await handleTagDetection(sock, chatId, message, senderId);
                }
                commandExecuted = false;
                break;
        }

        // If a command was executed, show typing status after command execution
        if (commandExecuted !== false) {
            // Command was executed, now show typing status after command execution
            await showTypingAfterCommand(sock, chatId);
        }

        // Function to handle .jid command
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

        if (userMessage.startsWith('.')) {
            // After command is processed successfully
            await addCommandReaction(sock, message);
        }
    } catch (error) {
        console.error('❌ Error in message handler:', error);
        // Only try to send error message if we have a valid chatId and message
        if (chatId && message && message.key) {
            try {
                const senderId = message.key.participant || message.key.remoteJid;
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
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;
        const settings = require('./config/settings');

        // Check if it's a group
        if (!id.endsWith('@g.us')) return;

        // Initialize group detection system if not already done
        // ❌ Ancien système GroupDetectionSystem supprimé - remplacé par LightweightGroupDetection

        // Process group participant update with our OPTIMIZED detection system
        // ❌ Ancien système groupDetectionSystem supprimé - remplacé par LightweightGroupDetection
        // Les mises à jour de participants sont maintenant gérées automatiquement par le nouveau système

        // Handle promotion events
        if (action === 'promote') {
            await handlePromotionEvent(sock, id, participants, author);
            return;
        }

        // Handle demotion events
        if (action === 'demote') {
            await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        // Handle join events
        if (action === 'add') {
            const botNumber = settings.botPhoneNumber + '@s.whatsapp.net';
            
            // Check if the BOT itself is being added to the group
            if (participants.includes(botNumber)) {
                console.log('🎉 Bot detected as added via participant update event:', id);
                await enhancedBotJoinDetection(sock, id, true); // true = confirmed bot join
                return;
            }
            
            // Regular welcome messages for other participants
            const isWelcomeEnabled = await isWelcomeOn(id);
            if (!isWelcomeEnabled) return;

            // Get group metadata
            const groupMetadata = await sock.groupMetadata(id);
            const groupName = groupMetadata.subject;
            const groupDesc = groupMetadata.desc || 'No description available';

            // Use simple default welcome message
            const welcomeMessage = 'Welcome {user} to {group}! 🎉';

            // Send welcome message for each new participant
            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = welcomeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName)
                    .replace('{description}', groupDesc);

                await sock.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant]
                });
            }
        }

        // Handle leave events
        if (action === 'remove') {
            // Check if goodbye is enabled for this group
            const isGoodbyeEnabled = await isGoodByeOn(id);
            if (!isGoodbyeEnabled) return;

            // Get group metadata
            const groupMetadata = await sock.groupMetadata(id);
            const groupName = groupMetadata.subject;

            // Use simple default goodbye message
            const goodbyeMessage = 'Goodbye {user} 👋';

            // Send goodbye message for each leaving participant
            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = goodbyeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName);

                await sock.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant]
                });
            }
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

/**
 * Send a beautiful welcome message when the bot joins a group or community
 */
async function sendBotWelcomeMessage(sock, chatId) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const groupName = groupMetadata.subject || 'ce groupe';
        
        // Detect if it's a community or regular group
        const isGroupCommunity = await isCommunity(sock, chatId);
        const groupType = isGroupCommunity ? '🏘️ communauté' : '👥 groupe';
        
        // ATOMIC IDEMPOTENCE: Claim the right to send welcome message atomically
        const canSendWelcome = await atomicClaimWelcomeSend(chatId, groupName, isGroupCommunity);
        if (!canSendWelcome) {
            console.log(`ℹ️ Welcome message already claimed/sent to group ${groupName}, skipping duplicate`);
            return; // Exit early - welcome already claimed or sent
        }
        
        // Create beautiful welcome message in .cmd style format
        const welcomeMessage = `┏━❮⛤ *𝐖𝐀𝐁𝐎𝐓 𝐄𝐒𝐓 𝐌𝐀𝐈𝐍𝐓𝐄𝐍𝐀𝐍𝐓 𝐀𝐂𝐓𝐈𝐅* ⛤❯━
┃✰╭─────────────────────────────────────────────·
┃✰┃🎉 *Bienvenue dans ${groupName}!*
┃✰┃🤖 Assistant WhatsApp intelligent activé
┃✰┃${isGroupCommunity ? '🏘️' : '👥'} Type: ${groupType}
┃✰└─────────────────────────────────────────────┈⊷
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━𖣔𖣔

┏━❮⛤ *𝐅𝐎𝐍𝐂𝐓𝐈𝐎𝐍𝐍𝐀𝐋𝐈𝐓É𝐒 𝐏𝐑𝐈𝐍𝐂𝐈𝐏𝐀𝐋𝐄𝐒* ⛤❯━
┃✰╭─────────────────────────────────────────────·

${isGroupCommunity ? `
🏘️ *GESTION DE COMMUNAUTÉ:*
• \`.community info\` - Informations de la communauté
• \`.community settings\` - Configuration avancée
• \`.community photo\` - Changer la photo de communauté
• \`.community desc\` - Modifier la description
• \`.community channels\` - Gérer les canaux
• \`.community perms\` - Gestion des permissions

👑 *ADMINISTRATION COMMUNAUTÉ:*
• \`.promote\` / \`.demote\` - Gérer les admins
• \`.ban\` / \`.unban\` - Bannir/débannir des membres
• \`.announce\` - Mode annonce
• \`.link\` - Générer lien d'invitation
` : `
👥 *GESTION DE GROUPE:*
• \`.group info\` - Informations du groupe
• \`.group settings\` - Configuration
• \`.group photo\` - Changer la photo
• \`.group desc\` - Modifier la description
• \`.group link\` - Lien d'invitation

👑 *ADMINISTRATION GROUPE:*
• \`.promote\` / \`.demote\` - Gérer les admins
• \`.kick\` / \`.add\` - Retirer/ajouter membres
• \`.tagall\` - Mentionner tous les membres
• \`.hidetag\` - Message anonyme à tous
`}

┃✰┃
┃✰┃🤖 ➣ *ASSISTANT INTELLIGENT*
┃✰┃   ↳ \`.companion create\` - Assistant personnel
┃✰┃   ↳ \`.gpt\` - ChatGPT & IA avancée
┃✰┃   ↳ \`.dalle\` - Génération d'images IA
┃✰┃
┃✰┃🛠️ ➣ *OUTILS PRATIQUES*
┃✰┃   ↳ \`.sticker\` - Créer des stickers
┃✰┃   ↳ \`.weather\` - Météo en temps réel
┃✰┃   ↳ \`.translate\` - Traduction instantanée
┃✰┃   ↳ \`.play\` - Musique & vidéos YouTube
┃✰┃
┃✰┃🎮 ➣ *DIVERTISSEMENT*
┃✰┃   ↳ \`.blague\` - Blagues aléatoires
┃✰┃   ↳ \`.meme\` - Mèmes du moment
┃✰┃   ↳ \`.trivia\` - Quiz culture générale

┃✰└─────────────────────────────────────────────┈⊷
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━𖣔𖣔

┏━❮⛤ *𝐂𝐎𝐌𝐌𝐄𝐍𝐓 𝐂𝐎𝐌𝐌𝐄𝐍𝐂𝐄𝐑* ⛤❯━
┃✰╭─────────────────────────────────────────────·
┃✰┃📖 ➣ *Guide détaillé:* \`.help\`
┃✰┃📱 ➣ *Toutes les commandes:* \`.cmd\`
┃✰┃⚙️ ➣ *Configuration:* Admins uniquement
┃✰┃🎯 ➣ *Permissions:* 👤 Tous | 👑 Admins | 🔧 Propriétaire
┃✰└─────────────────────────────────────────────┈⊷
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━𖣔𖣔

*┌────────────────────────────────────────────┐*
*│🎉 BIENVENUE DANS ${groupType.toUpperCase()} !*
*│Tapez .help pour commencer 🚀│*
*└────────────────────────────────────────────┘*

_💫 Développé avec ❤️ par l'équipe wabot v4.3_`;

        // Send the welcome message to the main group/community
        await sock.sendMessage(chatId, {
            text: welcomeMessage
        });
        
        console.log(`🎉 Bot welcome message sent to ${isGroupCommunity ? 'community' : 'group'}: ${groupName}`);
        
        // Handle community broadcasting to subsidiary groups (if it's a community and bot is admin)
        if (isGroupCommunity) {
            await handleCommunityBroadcasting(sock, chatId, groupName);
        }
        
    } catch (error) {
        console.error('Error sending bot welcome message:', error);
        // Send a simple fallback message if the fancy one fails
        try {
            await sock.sendMessage(chatId, {
                text: `🤖 *Wabot activé !*\n\nSalut ! Je suis maintenant actif dans ce groupe.\nUtilisez .help pour voir mes commandes ! 🚀`
            });
        } catch (fallbackError) {
            console.error('Error sending fallback welcome message:', fallbackError);
        }
    }
}

/**
 * Atomically claim the right to send a welcome message to a group
 * Returns true if this instance has claimed the right to send, false if already sent/claimed
 */
async function atomicClaimWelcomeSend(chatId, groupName, isGroupCommunity) {
    try {
        const now = new Date().toISOString();
        
        // First, try to UPDATE existing record setting welcome_sent=true only if currently false
        const { data: updateResult, error: updateError, count } = await db.supabase
            .from('bot_groups')
            .update({
                welcome_sent: true,
                last_activity: now
            })
            .eq('group_id', chatId)
            .eq('welcome_sent', false)
            .select('group_id', { count: 'exact' });
            
        // If update succeeded (count > 0), we claimed it
        if (updateError) {
            console.error('❌ Error in atomic update claim:', updateError);
        } else if (count > 0) {
            console.log(`✅ Atomic claim successful for group ${groupName}`);
            return true; // Successfully claimed
        }
        
        // If no rows were updated, either:
        // 1. Row doesn't exist yet - try INSERT
        // 2. welcome_sent was already true - already claimed
        
        // Try INSERT with welcome_sent=true, ON CONFLICT DO NOTHING
        const { data: insertResult, error: insertError } = await db.supabase
            .from('bot_groups')
            .insert({
                group_id: chatId,
                group_name: groupName,
                group_type: isGroupCommunity ? 'community' : 'group',
                community_id: isGroupCommunity ? chatId : null,
                welcome_sent: true,
                last_activity: now,
                joined_at: now
            }, { 
                onConflict: 'group_id',
                ignoreDuplicates: true 
            })
            .select('group_id');
            
        if (insertError) {
            if (insertError.code === '23505') { // Unique constraint violation
                console.log(`ℹ️ Group ${groupName} already exists, welcome was already claimed`);
                return false; // Someone else already claimed it
            } else {
                console.error('❌ Error in atomic insert claim:', insertError);
                return false; // Fail closed on uncertainty
            }
        } else if (insertResult && insertResult.length === 1) {
            console.log(`✅ Atomic claim successful via INSERT for new group ${groupName}`);
            return true; // Successfully claimed via insert
        }
        
        // If we get here, something unexpected happened
        console.log(`⚠️ Unexpected state in atomic claim for group ${groupName}, failing closed`);
        return false;
        
    } catch (error) {
        console.error('❌ Error in atomicClaimWelcomeSend:', error);
        return false; // Fail closed on any error
    }
}

/**
 * Handle broadcasting welcome announcement to community subsidiary groups
 */
async function handleCommunityBroadcasting(sock, communityId, communityName) {
    try {
        const botJid = sock.user?.id?.replace(/:\d+/, '@s.whatsapp.net');
        if (!botJid) return;

        // Check if bot is admin (required for community announcements)
        const { isBotAdmin } = await isAdmin(sock, communityId, botJid);
        if (!isBotAdmin) {
            console.log(`ℹ️ Bot is not admin in community ${communityName}, skipping subsidiary group broadcasting`);
            return;
        }

        const { getCommunityGroups, getCommunitySettings } = require('./commands/community/whatsapp-community');
        const { channelConfig } = require('./lib/channelConfig');
        
        // Get linked groups and settings
        const linkedGroups = await getCommunityGroups(communityId);
        const settings = await getCommunitySettings(communityId);
        
        if (settings?.broadcast_to_groups && linkedGroups.length > 0) {
            console.log(`📢 Broadcasting welcome announcement to ${linkedGroups.length} subsidiary groups...`);
            
            for (const group of linkedGroups) {
                try {
                    if (group.is_linked && group.group_id) {
                        // Atomically claim subsidiary group welcome send
                        const canSendToSubsidiary = await atomicClaimWelcomeSend(group.group_id, group.name, false);
                        if (!canSendToSubsidiary) {
                            console.log(`ℹ️ Welcome already claimed/sent to subsidiary group ${group.name}, skipping`);
                            continue;
                        }
                        
                        // Verify bot is member of subsidiary group
                        try {
                            const groupMeta = await sock.groupMetadata(group.group_id);
                            const isBotMember = groupMeta.participants.some(p => p.id === botJid);
                            
                            if (!isBotMember) {
                                console.log(`⚠️ Bot is not a member of subsidiary group ${group.name}, skipping announcement`);
                                continue;
                            }
                        } catch (metaError) {
                            console.log(`⚠️ Cannot access metadata for group ${group.name}, skipping announcement`);
                            continue;
                        }

                        const subsidiaryAnnouncement = `📢 *ANNONCE DE LA COMMUNAUTÉ ${communityName}*

🤖 **WABOT EST MAINTENANT ACTIF !**

Assistant WhatsApp intelligent intégré dans votre communauté.
Tapez \`.help\` pour voir toutes les commandes disponibles.

_Annonce automatique depuis la communauté principale_`;

                        await sock.sendMessage(group.group_id, {
                            text: subsidiaryAnnouncement,
                            ...(channelConfig || {})
                        });
                        
                        console.log(`✅ Welcome announcement sent to subsidiary group: ${group.name}`);
                        
                        // Delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (groupError) {
                    console.error(`❌ Failed to send welcome announcement to subsidiary group ${group.name}:`, groupError);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error handling community broadcasting:', error);
    }
}

/**
 * Send welcome message when bot joins a group - using command trigger
 */

/**
 * Enhanced bot detection system - multiple detection methods for reliability
 */
async function checkBotJoinOnMessage(sock, messageUpdate) {
    try {
        if (!messageUpdate.messages || !messageUpdate.messages[0]) return;
        
        const message = messageUpdate.messages[0];
        const chatId = message.key.remoteJid;
        
        // Only check group messages
        if (!chatId || !chatId.endsWith('@g.us')) return;
        
        // Use enhanced detection method
        await enhancedBotJoinDetection(sock, chatId);
    } catch (error) {
        console.error('Error checking bot join on message:', error);
    }
}

/**
 * 🚀 CREATE WABOT CENTER - Automated admin group creation for community management
 * Creates a dedicated admin group when bot is added to a community and promoted to admin
 */
async function createWabotCenter(sock, communityId, communityName, botJid) {
    try {
        console.log(`🏗️ Creating Wabot Center for community: ${communityName}`);
        
        // ATOMIC IDEMPOTENCE: Check and claim creation right atomically
        const existingCenter = await atomicClaimWabotCenterCreation(communityId, communityName);
        if (existingCenter === false) {
            console.log(`ℹ️ Wabot Center creation already claimed/exists for ${communityName}, skipping`);
            return null;
        } else if (existingCenter && existingCenter.wabot_center_id) {
            console.log(`ℹ️ Wabot Center already exists for ${communityName}: ${existingCenter.wabot_center_id}`);
            return existingCenter.wabot_center_id;
        }
        
        // Get community metadata with retries for robustness
        let communityMeta;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                communityMeta = await sock.groupMetadata(communityId);
                break;
            } catch (metaError) {
                attempts++;
                console.log(`❌ Community metadata attempt ${attempts}/${maxAttempts} failed:`, metaError.message);
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, attempts * 2000));
                } else {
                    throw new Error(`Failed to get community metadata after ${maxAttempts} attempts`);
                }
            }
        }
        
        // Get REAL community admins from the announcement group (most authoritative)
        const communityAdmins = communityMeta.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
            
        if (communityAdmins.length === 0) {
            console.log(`⚠️ No admins found in community ${communityName}, cannot create Wabot Center`);
            // Mark creation as failed to prevent retries
            await markWabotCenterCreationFailed(communityId, 'No admins found');
            return null;
        }
        
        console.log(`👥 Found ${communityAdmins.length} admins in community ${communityName}`);
        
        // Create Wabot Center group name
        const wabotCenterName = `🤖 Wabot Center - ${communityName}`;
        
        // Create the group using Baileys groupCreate with proper error handling
        let createdGroup;
        try {
            createdGroup = await sock.groupCreate(wabotCenterName, communityAdmins);
        } catch (createError) {
            console.error(`❌ Failed to create Wabot Center group:`, createError);
            await markWabotCenterCreationFailed(communityId, createError.message);
            return null;
        }
        
        const wabotCenterId = createdGroup.id;
        console.log(`✅ Wabot Center created successfully: ${wabotCenterId}`);
        
        // Handle per-participant add failures and send invite links if needed
        await handleWabotCenterMembershipIssues(sock, wabotCenterId, communityAdmins, wabotCenterName);
        
        // Save to database with proper error handling
        const saveSuccess = await saveWabotCenterToDatabase(communityId, wabotCenterId, communityName, wabotCenterName);
        if (!saveSuccess) {
            console.error(`❌ Failed to save Wabot Center to database, but group was created: ${wabotCenterId}`);
            // Continue with setup since group exists
        }
        
        // Send welcome message to the new Wabot Center
        await sendWabotCenterWelcomeMessage(sock, wabotCenterId, communityName);
        
        // Update group settings for better management
        await setupWabotCenterSettings(sock, wabotCenterId);
        
        console.log(`🎉 Wabot Center setup completed for community: ${communityName}`);
        return wabotCenterId;
        
    } catch (error) {
        console.error(`❌ Error creating Wabot Center for ${communityName}:`, error);
        await markWabotCenterCreationFailed(communityId, error.message);
        return null;
    }
}

/**
 * Check if a Wabot Center already exists for this community
 */
async function checkWabotCenterExists(communityId) {
    try {
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .select('*')
            .eq('community_id', communityId)
            .single();
            
        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('❌ Error checking Wabot Center existence:', error);
        return null;
    }
}

/**
 * ATOMIC: Claim the right to create a Wabot Center atomically
 */
async function atomicClaimWabotCenterCreation(communityId, communityName) {
    try {
        const now = new Date().toISOString();
        
        // Try to INSERT with onConflict handling - atomic creation claim
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .upsert({
                community_id: communityId,
                community_name: communityName,
                is_active: false, // Mark as "being created"
                created_at: now,
                updated_at: now
            }, { 
                onConflict: 'community_id',
                ignoreDuplicates: false // We want to update if exists
            })
            .select('*')
            .single();
            
        if (error) {
            console.error('❌ Error in atomic Wabot Center creation claim:', error);
            return false; // Fail closed on uncertainty
        }
        
        // If existing record has wabot_center_id, it already exists
        if (data.wabot_center_id) {
            return data; // Return existing center
        }
        
        // If no wabot_center_id, we claimed the creation right
        console.log(`✅ Atomic creation claim successful for community ${communityName}`);
        return true; // We can proceed with creation
        
    } catch (error) {
        console.error('❌ Error in atomicClaimWabotCenterCreation:', error);
        return false; // Fail closed on any error
    }
}

/**
 * Mark Wabot Center creation as failed to prevent infinite retries
 */
async function markWabotCenterCreationFailed(communityId, errorMessage) {
    try {
        const { error } = await db.supabase
            .from('wabot_centers')
            .update({
                is_active: false,
                wabot_center_name: `FAILED: ${errorMessage}`,
                updated_at: new Date().toISOString()
            })
            .eq('community_id', communityId);
            
        if (error) {
            console.error('❌ Error marking Wabot Center creation as failed:', error);
        }
    } catch (error) {
        console.error('❌ Error in markWabotCenterCreationFailed:', error);
    }
}

/**
 * Handle membership issues and send invite links to failed participants
 */
async function handleWabotCenterMembershipIssues(sock, wabotCenterId, communityAdmins, wabotCenterName) {
    try {
        // Check current group members
        const groupMeta = await sock.groupMetadata(wabotCenterId);
        const currentMembers = groupMeta.participants.map(p => p.id);
        
        // Find admins who couldn't be added
        const failedAdmins = communityAdmins.filter(admin => !currentMembers.includes(admin));
        
        if (failedAdmins.length > 0) {
            console.log(`⚠️ ${failedAdmins.length} admins couldn't be added to ${wabotCenterName}`);
            
            // Generate invite link
            try {
                const inviteCode = await sock.groupInviteCode(wabotCenterId);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                // Send invite link to failed admins
                for (const adminJid of failedAdmins) {
                    try {
                        await sock.sendMessage(adminJid, {
                            text: `🤖 *Invitation au Wabot Center*\n\nVous êtes administrateur de la communauté mais n'avez pas pu être ajouté automatiquement au Wabot Center.\n\n🔗 Rejoignez ici: ${inviteLink}\n\n*${wabotCenterName}*`
                        });
                        console.log(`📩 Invite sent to admin: ${adminJid}`);
                    } catch (sendError) {
                        console.log(`❌ Failed to send invite to ${adminJid}:`, sendError.message);
                    }
                }
            } catch (inviteError) {
                console.error(`❌ Failed to generate invite link for ${wabotCenterName}:`, inviteError);
            }
        } else {
            console.log(`✅ All ${communityAdmins.length} admins successfully added to ${wabotCenterName}`);
        }
    } catch (error) {
        console.error('❌ Error handling Wabot Center membership issues:', error);
    }
}

/**
 * Save Wabot Center information to database with proper UPSERT
 */
async function saveWabotCenterToDatabase(communityId, wabotCenterId, communityName, wabotCenterName) {
    try {
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .upsert({
                community_id: communityId,
                wabot_center_id: wabotCenterId,
                community_name: communityName,
                wabot_center_name: wabotCenterName,
                is_active: true,
                admin_count: 0, // Will be updated later
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'community_id',
                ignoreDuplicates: false
            })
            .select('*');

        if (error) {
            console.error('❌ Error saving Wabot Center to database:', error);
            return false;
        }
        
        console.log('✅ Wabot Center saved to database successfully');
        return true;
    } catch (error) {
        console.error('❌ Error in saveWabotCenterToDatabase:', error);
        return false;
    }
}

/**
 * Send welcome message to the newly created Wabot Center
 */
async function sendWabotCenterWelcomeMessage(sock, wabotCenterId, communityName) {
    try {
        const welcomeMessage = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃🤖 *BIENVENUE DANS VOTRE WABOT CENTER* 🤖
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏘️ *Communauté:* ${communityName}
👑 *Admins:* Vous êtes les administrateurs de cette communauté

🎯 *OBJECTIF DE CE GROUPE:*
Ce groupe privé a été créé automatiquement pour faciliter la gestion de votre communauté via Wabot.

⚡ *COMMANDES AVANCÉES DISPONIBLES ICI:*
┌────────────────────────────────────────────────┐
│ 🏗️ *GESTION COMMUNAUTÉ*                        │
├────────────────────────────────────────────────┤
│ • \`.community info\` - Infos de la communauté    │
│ • \`.community settings\` - Configuration globale │
│ • \`.community broadcast\` - Message groupé       │
│ • \`.community stats\` - Statistiques            │
├────────────────────────────────────────────────┤
│ 🛡️ *MODÉRATION AVANCÉE*                        │
├────────────────────────────────────────────────┤
│ • \`.ban global\` - Ban dans toute la communauté │
│ • \`.mute community\` - Mute dans tous les groupes│
│ • \`.warn escalate\` - Avertissement escaladé    │
├────────────────────────────────────────────────┤
│ 📊 *ANALYTICS & RAPPORTS*                      │
├────────────────────────────────────────────────┤
│ • \`.analytics daily\` - Rapport quotidien       │
│ • \`.topmembers community\` - Top membres        │
│ • \`.activity report\` - Rapport d'activité     │
└────────────────────────────────────────────────┘

🚀 *AVANTAGES DU WABOT CENTER:*
✅ Commandes administratives centralisées
✅ Gestion de communauté simplifiée  
✅ Rapports et statistiques détaillés
✅ Actions groupées sur tous les canaux
✅ Configuration avancée du bot

💡 *CONSEIL:* Utilisez \`.help admin\` pour voir toutes les commandes disponibles dans ce groupe !

_🤖 Wabot Center créé automatiquement par Wabot v4.3_`;

        await sock.sendMessage(wabotCenterId, {
            text: welcomeMessage
        });
        
        console.log('✅ Welcome message sent to Wabot Center');
    } catch (error) {
        console.error('❌ Error sending Wabot Center welcome message:', error);
    }
}

/**
 * Setup optimal settings for the Wabot Center group
 */
async function setupWabotCenterSettings(sock, wabotCenterId) {
    try {
        // Set group description
        const description = `🤖 Centre de contrôle Wabot pour la gestion de communauté\n⚡ Commandes administratives avancées disponibles\n🛡️ Groupe privé pour les admins uniquement`;
        await sock.groupUpdateDescription(wabotCenterId, description);
        
        // Optionally restrict who can edit group info (admins only)
        await sock.groupSettingUpdate(wabotCenterId, 'locked');
        
        console.log('✅ Wabot Center settings configured');
    } catch (error) {
        console.error('❌ Error setting up Wabot Center settings:', error);
    }
}

/**
 * Enhanced multi-method bot join detection with fallbacks
 * Uses admin status, database checks, and metadata verification
 */
async function enhancedBotJoinDetection(sock, chatId, isConfirmedBotJoin = false) {
    try {
        // Check if bot is already processed in this group
        const existingGroup = await checkGroupInDatabase(chatId);
        
        // If group exists and welcome was sent, skip (unless forced)
        if (existingGroup && existingGroup.welcome_sent && !isConfirmedBotJoin) {
            return false;
        }
        
        // Get group metadata with retries
        let groupMetadata;
        let metadataAttempts = 0;
        const maxAttempts = 3;
        
        while (metadataAttempts < maxAttempts) {
            try {
                groupMetadata = await sock.groupMetadata(chatId);
                break;
            } catch (metaError) {
                metadataAttempts++;
                console.log(`❌ Metadata attempt ${metadataAttempts}/${maxAttempts} failed for:`, chatId);
                
                if (metadataAttempts < maxAttempts) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, metadataAttempts * 2000));
                } else {
                    // If confirmed join but metadata fails, send basic welcome anyway
                    if (isConfirmedBotJoin) {
                        console.log('🔧 Metadata failed but bot join confirmed, sending basic welcome');
                        await sendBotWelcomeMessage(sock, chatId);
                        await markWelcomeSentInDB(chatId, null);
                        return true;
                    }
                    console.log('❌ All metadata attempts failed for:', chatId);
                    return false;
                }
            }
        }
        
        const botJid = sock.user?.id?.replace(/:\d+/, '@s.whatsapp.net');
        if (!botJid) return false;
        
        // Check if bot is actually a member of this group
        const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
        if (!botParticipant) {
            console.log('🔍 Bot is not a member of group:', groupMetadata.subject);
            return false;
        }
        
        // Enhanced decision logic (not requiring admin status)
        const isBotAdmin = botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin';
        const isNewGroup = !existingGroup;
        const welcomeNotSent = !existingGroup?.welcome_sent;
        
        console.log(`🔍 Bot Detection for ${groupMetadata.subject}:`, {
            isAdmin: isBotAdmin,
            isNewGroup: isNewGroup,
            welcomeNotSent: welcomeNotSent,
            confirmedJoin: isConfirmedBotJoin
        });
        
        // Improved decision logic: Send welcome if bot is member AND any of these conditions
        const shouldSendWelcome = isConfirmedBotJoin ||           // Direct evidence of bot join
                                 (isNewGroup) ||                  // First time seeing this group
                                 (welcomeNotSent && isBotAdmin);  // Not sent and bot has admin (strong signal)
        
        if (shouldSendWelcome) {
            console.log('🎉 SENDING WELCOME MESSAGE for:', groupMetadata.subject);
            
            // Use unified welcome function for both groups and communities
            await sendBotWelcomeMessage(sock, chatId);
            
            // Mark welcome as sent in database
            await markWelcomeSentInDB(chatId, groupMetadata.subject);
            
            // 🚀 NEW: Create Wabot Center if it's a community and bot is admin
            const { triggerWabotCenterOnBotJoin } = require('./services/wabotCenter');
            await triggerWabotCenterOnBotJoin(sock, chatId, groupMetadata.subject, botJid);
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error in enhanced bot join detection:', error);
        // Fallback: if confirmed join, try basic welcome
        if (isConfirmedBotJoin) {
            try {
                await sendBotWelcomeMessage(sock, chatId);
                await markWelcomeSentInDB(chatId, null);
                return true;
            } catch (fallbackError) {
                console.error('❌ Fallback welcome also failed:', fallbackError);
            }
        }
        return false;
    }
}

/**
 * Helper function to check group in database
 */
async function checkGroupInDatabase(chatId) {
    try {
        const { data, error } = await db.supabase
            .from('bot_groups')
            .select('*')
            .eq('group_id', chatId)
            .single();
            
        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw error;
        }
        
        return data;
    } catch (dbError) {
        console.error('❌ Error checking group in database:', dbError);
        return null;
    }
}

/**
 * Helper function to mark welcome as sent in database
 */
async function markWelcomeSentInDB(chatId, groupName) {
    try {
        const { data, error } = await db.supabase
            .from('bot_groups')
            .upsert({
                group_id: chatId,
                group_name: groupName || 'Unknown Group',
                welcome_sent: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'group_id',
                returning: 'minimal'
            });

        if (error) {
            console.error('❌ Error marking welcome as sent:', error);
            return false;
        }
        
        console.log('✅ Welcome marked as sent for:', groupName || chatId);
        return true;
    } catch (dbError) {
        console.error('❌ Error in markWelcomeSentInDB:', dbError);
        return false;
    }
}

// Instead, export the handlers along with handleMessages
module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        await handleStatusUpdate(sock, status);
    }
};

// Export the function for index.js
global.checkBotJoinOnMessage = checkBotJoinOnMessage;