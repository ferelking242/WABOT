const { i18n, getText, getUserLanguage } = require('../../lib/i18n');
const { getAliasManager } = require('../../lib/aliasManager');

// Configuration de bouton WhatsApp sécurisée (sans forward/newsletter)
function createSafeChannelButton() {
    return {};
}

// Fonction d'envoi avec fallback automatique
async function sendWithChannelButton(sock, chatId, content, options = {}) {
    try {
        console.log('🔗 [ALIAS] Tentative d\'envoi avec bouton de chaîne...');
        
        const messageWithButton = {
            ...content
        };
        
        const result = await sock.sendMessage(chatId, messageWithButton, options);
        console.log('✅ [ALIAS] Message avec bouton envoyé avec succès');
        return result;
        
    } catch (error) {
        console.warn('⚠️ [ALIAS] Échec du bouton, envoi en mode simple...', error.message);
        
        // Fallback : envoyer le message simple sans bouton
        const fallbackResult = await sock.sendMessage(chatId, content, options);
        console.log('✅ [ALIAS] Message simple envoyé (fallback)');
        return fallbackResult;
    }
}

async function aliasCommand(sock, chatId, message, args, botIdentity = null) {
    try {
        console.log('🔍 [ALIAS DEBUG] Starting aliasCommand with args:', args);
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        console.log('🔍 [ALIAS DEBUG] User lang:', userLang);
        
        // Initialiser l'alias manager
        const aliasManager = getAliasManager();
        if (!aliasManager) {
            const errorMsg = userLang === 'fr' ? 
                '❌ Le système d\'alias moderne n\'est pas disponible.' :
                '❌ Modern alias system is not available.';
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
            return;
        }

        // Déterminer le rôle de l'utilisateur (simplifié pour l'affichage des alias)
        const isGroup = chatId.endsWith('@g.us');
        let userRole = 'user';
        
        const isCompanion = botIdentity === 'companion' || 
                           sock._companionName || 
                           sock.companionIdentity ||
                           (sock.user && sock.user.name && sock.user.name.includes('companion'));
        
        if (isCompanion) {
            userRole = 'companion';
        } else {
            const isOwner = require('../../lib/isOwner');
            const isOwnerOrSudo = await isOwner(senderId);
            if (isOwnerOrSudo) {
                userRole = 'owner';
            } else if (isGroup) {
                const isAdmin = require('../../lib/isAdmin');
                const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
                if (isSenderAdmin) {
                    userRole = 'admin';
                }
            }
        }

        // Obtenir toutes les commandes dynamiquement depuis l'AliasManager
        const allKnownCommands = aliasManager.getAllKnownCommands ? aliasManager.getAllKnownCommands() : [];
        const fallbackCommands = [
            'help', 'ping', 'alive', 'owner', 'language', 'cmd', 'alias',
            'weather', 'news', 'translate', 'quote', 'fact',
            'joke', 'compliment', 'insult', 'flirt', 'dare', 'truth',
            'sticker', 'imagine', 'play', 'song', 'video',
            'tictactoe', 'hangman', 'trivia',
            ...(userRole === 'admin' || userRole === 'owner' ? ['ban', 'kick', 'promote', 'demote', 'warn', 'mute'] : []),
            ...(userRole === 'owner' ? ['companion'] : [])
        ];
        
        // Utiliser les commandes dynamiques si disponibles, sinon fallback
        const availableCommands = allKnownCommands.length > 0 ? allKnownCommands : fallbackCommands;

        // Si une commande spécifique est demandée
        if (args.length > 0) {
            const requestedCmd = args[0].toLowerCase();
            const aliases = aliasManager.getAllAliases(requestedCmd);
            
            if (aliases && Object.keys(aliases).length > 0) {
                const currentLangData = aliases[userLang] || aliases['en'] || {};
                
                let response = userLang === 'fr' ?
                    `🌟⃝━❮ 𝐀𝐋𝐈𝐀𝐒 𝐏𝐎𝐔𝐑 *${requestedCmd.toUpperCase()}* ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝙳é𝚝𝚊𝚒𝚕𝚜 𝙳𝚎𝚜 𝙰𝚕𝚒𝚊𝚜* 🎯
✧

┏━❮⛤ *𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞 𝐏𝐫𝐢𝐧𝐜𝐢𝐩𝐚𝐥𝐞* ⛤❯━
┃✨┃🎯 *.${currentLangData.primary || requestedCmd}* (${userLang.toUpperCase()})
┗━━━━━━━━━━━━━━𖣔𖣔

` :
                    `🌟⃝━❮ 𝐀𝐋𝐈𝐀𝐒𝐄𝐒 𝐅𝐎𝐑 *${requestedCmd.toUpperCase()}* ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝙰𝚕𝚒𝚊𝚜 𝙳𝚎𝚝𝚊𝚒𝚕𝚜* 🎯
✧

┏━❮⛤ *𝐏𝐫𝐢𝐦𝐚𝐫𝐲 𝐂𝐨𝐦𝐦𝐚𝐧𝐝* ⛤❯━
┃✨┃🎯 *.${currentLangData.primary || requestedCmd}* (${userLang.toUpperCase()})
┗━━━━━━━━━━━━━━𖣔𖣔

`;

                // Afficher SEULEMENT les alias dans la langue de l'utilisateur
                if (currentLangData.aliases && currentLangData.aliases.length > 0) {
                    const langFlag = userLang === 'fr' ? '🇫🇷' : userLang === 'en' ? '🇺🇸' : userLang === 'es' ? '🇪🇸' : '🌍';
                    const langName = userLang === 'fr' ? 'Français' : userLang === 'en' ? 'English' : userLang === 'es' ? 'Español' : userLang.toUpperCase();
                    
                    response += `┏━❮⛤ *${langName}* ${langFlag} ⛤❯━
┃✨╭─────────────·
┃✨┃🎯 *${userLang === 'fr' ? 'Principal' : 'Primary'}:* *.${currentLangData.primary}*
┃✨┃🎪 _${userLang === 'fr' ? 'Alias' : 'Aliases'}:_ ↳ || ${currentLangData.aliases.map(a => `*.${a}*`).join(' || ')}
┃✨└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

`;
                }

                // Ajouter les exemples d'utilisation
                response += userLang === 'fr' ?
                    `┏━❮⛤ *𝐄𝐱𝐞𝐦𝐩𝐥𝐞𝐬 𝐝'𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧* ⛤❯━
┃🌟╭─────────────·
┃🌟┃⚡ *.${currentLangData.primary || requestedCmd}* (commande principale)
` :
                    `┏━❮⛤ *𝐔𝐬𝐚𝐠𝐞 𝐄𝐱𝐚𝐦𝐩𝐥𝐞𝐬* ⛤❯━
┃🌟╭─────────────·
┃🌟┃⚡ *.${currentLangData.primary || requestedCmd}* (primary command)
`;

                if (currentLangData.aliases && currentLangData.aliases.length > 0) {
                    currentLangData.aliases.forEach((alias, index) => {
                        response += `┃🌟┃🎯 *.${alias}* (${userLang === 'fr' ? 'alias' : 'alias'} ${index + 1})\n`;
                    });
                }

                response += `┃🌟└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

*┌───────────────┐*
*│🎪 ${userLang === 'fr' ? 'Utilisez n\'importe quel alias' : 'Use any alias'} │*   
*└───────────────┘*`;

                await sendWithChannelButton(sock, chatId, { text: response }, { quoted: message });
                return;
            } else {
                const errorMsg = userLang === 'fr' ? 
                    `❌ Aucun alias trouvé pour "${requestedCmd}". Tapez .alias pour voir tous les alias.` :
                    `❌ No aliases found for "${requestedCmd}". Type .alias to see all aliases.`;
                
                await sendWithChannelButton(sock, chatId, { text: errorMsg }, { quoted: message });
                return;
            }
        }

        // Afficher tous les alias disponibles
        const currentTime = new Date().toLocaleString();
        const roleDisplay = userRole === 'owner' ? '🔧 𝐎𝐖𝐍𝐄𝐑' : 
                          userRole === 'admin' ? '👑 𝐀𝐃𝐌𝐈𝐍' : 
                          userRole === 'companion' ? '🤖 𝐂𝐎𝐌𝐏𝐀𝐍𝐈𝐎𝐍' : '👤 𝐔𝐒𝐄𝐑';

        let response = userLang === 'fr' ? 
            `🎪⃝━❮ 𝐆𝐄𝐒𝐓𝐈𝐎𝐍𝐍𝐀𝐈𝐑𝐄 𝐃'𝐀𝐋𝐈𝐀𝐒 ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝚂𝚢𝚜𝚝è𝚖𝚎 𝙼𝚘𝚍𝚎𝚛𝚗𝚎* 🎯
┊ *${currentTime}*
✧

┏━❮ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧𝐬 ❯━
┃⛤┃🎭 *𝚁ô𝚕𝚎:* ${roleDisplay}
┃⛤┃🌐 *𝙻𝚊𝚗𝚐𝚞𝚎:* ${userLang.toUpperCase()} 🇫🇷
┃⛤┃🎪 *𝙰𝚕𝚒𝚊𝚜 𝙳𝚒𝚜𝚙𝚘:* ${availableCommands.length} commandes
┃⛤┃📱 *𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* 4.3.0 - Manager
┃⛤┗━━━━━━━━━━━━━━𖣔𖣔
╰──────────────┈⊷

` :
            `🎪⃝━❮ 𝐀𝐋𝐈𝐀𝐒 𝐌𝐀𝐍𝐀𝐆𝐄𝐑 ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝙼𝚘𝚍𝚎𝚛𝚗 𝚂𝚢𝚜𝚝𝚎𝚖* 🎯
┊ *${currentTime}*
✧

┏━❮ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧 ❯━
┃⛤┃🎭 *𝚁𝚘𝚕𝚎:* ${roleDisplay}
┃⛤┃🌐 *𝙻𝚊𝚗𝚐:* ${userLang.toUpperCase()} 🇺🇸
┃⛤┃🎪 *𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎:* ${availableCommands.length} commands
┃⛤┃📱 *𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* 4.3.0 - Manager
┃⛤┗━━━━━━━━━━━━━━𖣔𖣔
╰──────────────┈⊷

`;

        // Organiser les commandes par catégories
        const categories = {
            general: {
                name: userLang === 'fr' ? '𝐆é𝐧é𝐫𝐚𝐥' : '𝐆𝐞𝐧𝐞𝐫𝐚𝐥',
                icon: '📱',
                commands: ['help', 'ping', 'alive', 'owner', 'language']
            },
            info: {
                name: userLang === 'fr' ? '𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧' : '𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧',
                icon: '🎯',
                commands: ['weather', 'news', 'translate', 'quote', 'fact']
            },
            fun: {
                name: userLang === 'fr' ? '𝐃𝐢𝐯𝐞𝐫𝐭𝐢𝐬𝐬𝐞𝐦𝐞𝐧𝐭' : '𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭',
                icon: '🎉',
                commands: ['joke', 'compliment', 'insult', 'flirt', 'dare', 'truth']
            },
            media: {
                name: userLang === 'fr' ? '𝐌é𝐝𝐢𝐚' : '𝐌𝐞𝐝𝐢𝐚',
                icon: '🎨',
                commands: ['sticker', 'imagine', 'play', 'song', 'video']
            },
            games: {
                name: userLang === 'fr' ? '𝐉𝐞𝐮𝐱' : '𝐆𝐚𝐦𝐞𝐬',
                icon: '🎮',
                commands: ['tictactoe', 'hangman', 'trivia']
            }
        };

        // Ajouter catégories admin/owner si applicable
        if (userRole === 'admin' || userRole === 'owner') {
            categories.admin = {
                name: userLang === 'fr' ? '𝐀𝐝𝐦𝐢𝐧' : '𝐀𝐝𝐦𝐢𝐧',
                icon: '👑',
                commands: ['ban', 'kick', 'promote', 'demote', 'warn', 'mute']
            };
        }

        if (userRole === 'owner') {
            categories.owner = {
                name: userLang === 'fr' ? '𝐏𝐫𝐨𝐩𝐫𝐢é𝐭𝐚𝐢𝐫𝐞' : '𝐎𝐰𝐧𝐞𝐫',
                icon: '🔧',
                commands: ['companion']
            };
        }

        // Générer chaque catégorie avec ses alias
        Object.entries(categories).forEach(([key, category]) => {
            const validCommands = category.commands.filter(cmd => availableCommands.includes(cmd));
            if (validCommands.length > 0) {
                response += `┏━❮⛤ *${category.name}* ${category.icon} ⛤❯━\n`;
                response += `┃✨╭─────────────·\n`;

                validCommands.forEach((cmd, index) => {
                    const aliases = aliasManager.getAllAliases(cmd);
                    const currentLangData = aliases[userLang] || aliases['en'] || {};
                    const primaryCmd = currentLangData.primary || cmd;
                    
                    // Format compact : commande principale puis alias avec ↳ ||
                    let commandLine = `┃✨┃${index === 0 ? '⓿' : '➊➋➌➍➎➏➐➑➒'[index] || '●'} *.${primaryCmd}*`;
                    
                    // Ajouter les alias dans la langue de l'utilisateur UNIQUEMENT
                    if (currentLangData.aliases && currentLangData.aliases.length > 0) {
                        const aliasesFormatted = currentLangData.aliases.map(a => `*.${a}*`).join(' || ');
                        commandLine += ` ↳ || ${aliasesFormatted}`;
                    }
                    
                    response += commandLine + '\n';
                });
                
                response += `┃✨└───────────┈⊷\n`;
                response += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
            }
        });

        // Ajouter la légende et les informations utiles
        response += userLang === 'fr' ?
            `┏━❮⛤ *𝐆𝐮𝐢𝐝𝐞 𝐝'𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧* ⛤❯━
┃🌟╭─────────────·
┃🌟┃🎯 *Commande principale* ↳ || *alias courts*
┃🌟┃🌍 Support multilingue complet
┃🌟┃📖 *.alias [commande]* = détails alias
┃🌟┃⚡ Utilisez n'importe quel alias disponible
┃🌟┃🎪 Système centralisé ${Object.keys(require('../../config/aliases.json').aliases).length} commandes
┃🌟└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

*┌───────────────┐*
*│🎪 Système Alias v4.3 │*   
*└───────────────┘*` :
            `┏━❮⛤ *𝐔𝐬𝐚𝐠𝐞 𝐆𝐮𝐢𝐝𝐞* ⛤❯━
┃🌟╭─────────────·
┃🌟┃🎯 *Primary command* ↳ || *short aliases*
┃🌟┃🌍 Complete multilingual support
┃🌟┃📖 *.alias [command]* = alias details
┃🌟┃⚡ Use any available alias
┃🌟┃🎪 Centralized system ${Object.keys(require('../../config/aliases.json').aliases).length} commands
┃🌟└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

*┌───────────────┐*
*│🎪 Alias System v4.3 │*   
*└───────────────┘*`;

        console.log('✨ [ALIAS DEBUG] Menu alias stylisé moderne généré avec succès');

        // Envoyer le message avec gestion de la longueur
        const maxLength = 63000;
        
        if (response.length <= maxLength) {
            await sendWithChannelButton(sock, chatId, { text: response }, { quoted: message });
        } else {
            // Diviser en plusieurs messages si trop long
            const parts = [];
            let currentPart = "";
            const lines = response.split('\n');
            const chunkSize = 4000;
            
            for (const line of lines) {
                if ((currentPart + line + '\n').length <= chunkSize) {
                    currentPart += line + '\n';
                } else {
                    if (currentPart) {
                        parts.push(currentPart.trim());
                        currentPart = line + '\n';
                    } else {
                        parts.push(line.substring(0, chunkSize - 3) + '...');
                        currentPart = line.substring(chunkSize - 3) + '\n';
                    }
                }
            }
            if (currentPart) {
                parts.push(currentPart.trim());
            }
            
            // Envoyer chaque partie
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === 0) {
                    await sendWithChannelButton(sock, chatId, { text: part }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: part });
                }
                
                if (i < parts.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        
    } catch (error) {
        console.error('Erreur dans la commande alias:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        const errorMsg = userLang === 'fr' ? 
            '❌ Erreur lors de l\'affichage des alias.' :
            '❌ Error displaying aliases.';
        
        await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
    }
}

module.exports = aliasCommand;