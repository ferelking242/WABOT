const settings = require('../../config/settings');
const fs = require('fs');
const path = require('path');
const { i18n, getText, getUserLanguage, getLocalizedCommand } = require('../../lib/i18n');
const { getAliasManager } = require('../../lib/aliasManager');
// Configuration de bouton WhatsApp sécurisée (selon bonnes pratiques Baileys 2025)
function createSafeChannelButton() {
    return {};
}

// Fonction d'envoi avec fallback automatique
async function sendWithChannelButton(sock, chatId, content, options = {}) {
    try {
        console.log('🔗 [CHANNEL] Tentative d\'envoi avec bouton de chaîne...');
        
        const messageWithButton = {
            ...content,
            ...createSafeChannelButton()
        };
        
        const result = await sock.sendMessage(chatId, messageWithButton, options);
        console.log('✅ [CHANNEL] Message avec bouton envoyé avec succès');
        return result;
        
    } catch (error) {
        console.warn('⚠️ [CHANNEL] Échec du bouton, envoi en mode simple...', error.message);
        
        // Fallback : envoyer le message simple sans bouton
        const fallbackResult = await sock.sendMessage(chatId, content, options);
        console.log('✅ [CHANNEL] Message simple envoyé (fallback)');
        return fallbackResult;
    }
}

// Function to get localized command names for display using AliasManager
function getLocalizedCommands(userLang) {
    const aliasManager = getAliasManager();
    const commands = {};
    
    // Liste des commandes de base à afficher
    const baseCommands = [
        'help', 'joke', 'fact', 'quote', 'weather', 'news', 
        'play', 'song', 'video', 'sticker', 'ban', 'kick', 'mute', 'warn',
        'translate', 'alive', 'owner', 'ping'
    ];
    
    baseCommands.forEach(baseCommand => {
        const primaryCommand = aliasManager.getPrimaryCommand(baseCommand, userLang);
        if (primaryCommand) {
            commands[baseCommand] = primaryCommand;
        } else {
            // Fallback vers l'anglais si la commande n'existe pas dans la langue demandée
            commands[baseCommand] = aliasManager.getPrimaryCommand(baseCommand, 'en') || baseCommand;
        }
    });
    
    return commands;
}

function getSpecificCommandHelp(commandName) {
    const commandHelp = {
        'play': `🎵 *COMMANDE .PLAY*

*Description :* Recherche et télécharge de la musique depuis YouTube

*Utilisation :*
• \`.play <titre de chanson>\`
• \`.play <artiste - titre>\`

*Exemples :*
• \`.play Shape of You\`
• \`.play Ed Sheeran - Perfect\`
• \`.play Imagine Dragons Believer\`

*Note :* Le bot trouvera automatiquement la meilleure qualité audio disponible`,

        'lang': `🌐 *COMMANDE .LANG*

*Description :* Change la langue du bot

*Utilisation :*
• \`.lang\` - Affiche la langue actuelle
• \`.lang <code>\` - Change la langue

*Langues disponibles :*
• \`.lang fr\` - Français 🇫🇷
• \`.lang en\` - English 🇺🇸
• \`.lang es\` - Español 🇪🇸

*Exemple :*
• \`.lang en\` pour passer en anglais`,

        'sticker': `🎨 *COMMANDE .STICKER*

*Description :* Convertit images/vidéos en stickers

*Utilisation :*
• \`.sticker\` (répondre à une image/vidéo)
• \`.s\` (raccourci)

*Options pour vidéos :*
• \`.sticker pack:nom\` - Nom du pack
• \`.sticker author:nom\` - Auteur
• \`.sticker duration:6\` - Durée max 6s

*Exemple :*
Répondre à une vidéo avec : \`.sticker pack:Memes duration:4\``,

        'help': `📋 *COMMANDE .HELP*

*Description :* Affiche l'aide du bot

*Utilisation :*
• \`.help\` - Menu général
• \`.help <commande>\` - Aide spécifique

*Exemples :*
• \`.help play\` - Aide pour la commande play
• \`.help sticker\` - Aide pour les stickers
• \`.help lang\` - Aide pour changer la langue

*Alias :* \`.menu\`, \`.bot\`, \`.list\``,

        'tts': `🔊 *COMMANDE .TTS*

*Description :* Convertit le texte en audio (Text-to-Speech)

*Utilisation :*
• \`.tts <texte>\` - Convertit le texte en voix

*Exemples :*
• \`.tts Bonjour tout le monde\`
• \`.tts Hello this is a test\`

*Note :* Le bot génèrera un fichier audio de votre texte`,

        'fact': `📚 *COMMANDE .FACT*

*Description :* Affiche un fait aléatoire intéressant

*Utilisation :*
• \`.fact\` - Obtient un fait aléatoire

*Exemple :*
• \`.fact\`

*Note :* Parfait pour apprendre quelque chose de nouveau !`,

        'quote': `💭 *COMMANDE .QUOTE*

*Description :* Affiche une citation inspirante aléatoire

*Utilisation :*
• \`.quote\` - Obtient une citation aléatoire

*Exemple :*
• \`.quote\`

*Note :* Pour un peu d'inspiration au quotidien`,

        'joke': `😄 *COMMANDE .JOKE*

*Description :* Raconte une blague aléatoire

*Utilisation :*
• \`.joke\` - Obtient une blague aléatoire

*Exemple :*
• \`.joke\`

*Note :* Pour égayer votre journée avec de l'humour`
    };

    return commandHelp[commandName] || null;
}

async function helpCommand(sock, chatId, message, channelLink, args = [], botIdentity = null) {
    console.log('📋 Help command called with args:', args);
    console.log('🔍 [HELP DEBUG] Parameters:', { chatId, channelLink, botIdentity });
    
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        console.log('🔍 [HELP DEBUG] SenderId:', senderId);
        
        const userLang = getUserLanguage(senderId);
        console.log('🔍 [HELP DEBUG] UserLang:', userLang);
    
    // Check if user wants help in specific language
    let displayLang = userLang;
    if (args.length === 1 && ['fr', 'en', 'es'].includes(args[0])) {
        displayLang = args[0]; // Use specified language for help display only
    }

    // Déterminer le rôle de l'utilisateur
    const isGroup = chatId.endsWith('@g.us');
    let userRole = 'user'; // Par défaut: utilisateur normal
    
    // Détecter si c'est un companion
    const isCompanion = botIdentity === 'companion' || 
                       sock._companionName || 
                       sock.companionIdentity ||
                       (sock.user && sock.user.name && sock.user.name.includes('companion'));
    
    if (isCompanion) {
        userRole = 'companion';
    } else {
        // Vérifier si c'est l'owner/sudo
        const isOwner = require('../../lib/isOwner');
        const isOwnerOrSudo = await isOwner(senderId);
        if (isOwnerOrSudo) {
            userRole = 'owner';
        } else if (isGroup) {
            // Vérifier si c'est un admin de groupe
            const isAdmin = require('../../lib/isAdmin');
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (isSenderAdmin) {
                userRole = 'admin';
            }
        }
    }

    // Si une commande spécifique est demandée (but not language codes)
    if (args.length > 0 && !['fr', 'en', 'es'].includes(args[0])) {
        const commandName = args[0].replace('.', '');
        const specificHelp = getSpecificCommandHelp(commandName);
        if (specificHelp) {
            await sendWithChannelButton(sock, chatId, { 
                text: specificHelp
            }, { quoted: message });
            return;
        }
    }

    const localizedCmds = getLocalizedCommands(displayLang);
    
    // Construire le message d'aide filtré par rôle
    let helpMessage = `
╔═══════════════════╗
   🤖 *${settings.botName || 'wabot'}* v${settings.version}
   📱 Cliquez sur le bouton ci-dessous pour voir notre chaîne
╚═══════════════════╝

🌟 *Commandes disponibles*`;
    
    // Ajouter un indicateur de rôle
    const roleIndicators = {
        'owner': ' (👑 OWNER)',
        'admin': ' (👤 ADMIN)',
        'companion': ' (🤖 COMPANION)',
        'user': ' (👥 USER)'
    };
    helpMessage += roleIndicators[userRole] || '';

    // Commandes générales (accessibles à tous)
    helpMessage += `

╔═══════════════════╗
📱 *COMMANDES GÉNÉRALES*:
║ ➤ .help or .menu - Menu d'aide
║ ➤ .ping - Latence du bot  
║ ➤ .alive - Vérifier si en ligne
║ ➤ .owner - Info propriétaire
║ ➤ .${localizedCmds.joke} - Blague aléatoire
║ ➤ .${localizedCmds.quote} - Citation inspirante
║ ➤ .${localizedCmds.fact} - Fait intéressant
║ ➤ .${localizedCmds.weather} <ville> - Météo
║ ➤ .${localizedCmds.news} - Actualités
║ ➤ .attp <texte> - Sticker texte animé
║ ➤ .lyrics <titre> - Paroles chanson
║ ➤ .8ball <question> - Boule magique
║ ➤ .groupinfo - Info du groupe
║ ➤ .staff - Liste admins
║ ➤ .vv - Voir médias "une fois"
║ ➤ .trt <texte> <langue> - Traduire
║ ➤ .ss <lien> - Screenshot web
║ ➤ .jid - ID du chat
║ ➤ .lang <fr/en/es> - Changer langue
║ ➤ .cmd <commande> - Aide détaillée
╚═══════════════════╝`;

    // Commandes pour companions seulement (restrictions appliquées)
    if (userRole === 'companion') {
        helpMessage += `

╔═══════════════════╗
🤖 *COMMANDES COMPANION*:
║ ➤ .${localizedCmds.sticker}/.s - Créer sticker
║ ➤ .play <nom> - Jouer musique
║ ➤ .song <nom> - Télécharger audio
║ ➤ .video <nom> - Télécharger vidéo
║ ➤ .meme - Mème aléatoire
║ ➤ .emojimix <😀😍> - Mélanger emojis
║ ➤ .dare - Action défi
║ ➤ .truth - Action vérité
║ ➤ .compliment @user - Compliment
║ ➤ .flirt - Draguer
║ ➤ .8ball <question> - Boule magique
╚═══════════════════╝`;
    } else {
        // Commandes pour utilisateurs normaux, admins et owners
        helpMessage += `

╔═══════════════════╗
🎨 *IMAGES & STICKERS*:
║ ➤ .${localizedCmds.sticker}/.s - Créer sticker
║ ➤ .simage - Sticker vers image
║ ➤ .blur <image> - Flouter image
║ ➤ .removebg - Supprimer fond
║ ➤ .remini - Améliorer qualité
║ ➤ .crop <image> - Recadrer
║ ➤ .tgsticker <lien> - Sticker Telegram
║ ➤ .meme - Mème aléatoire
║ ➤ .take <nom> - Voler sticker
║ ➤ .emojimix <😀😍> - Mélanger emojis
║ ➤ .wasted <image> - Effet "Wasted"
║ ➤ .textmaker <texte> - Texte stylisé
╚═══════════════════╝

╔═══════════════════╗
🎮 *JEUX*:
║ ➤ .tictactoe @user - Morpion
║ ➤ .hangman - Jeu du pendu
║ ➤ .guess <lettre> - Deviner lettre
║ ➤ .trivia - Quiz culture générale  
║ ➤ .answer <réponse> - Répondre quiz
║ ➤ .truth - Action vérité
║ ➤ .dare - Action défi
║ ➤ .roulette - Roulette russe
║ ➤ .riddle - Énigme à résoudre
║ ➤ .coinflip - Pile ou face
║ ➤ .rps <choix> - Pierre-papier-ciseaux
║ ➤ .dice - Lancer de dés
║ ➤ .ship @user1 @user2 - Compatibilité
║ ➤ .blackjack - Jeu de cartes
║ ➤ .memory - Jeu mémoire
║ ➤ .wordhunt - Chasse aux mots
║ ➤ .mathquiz - Quiz mathématiques
║ ➤ .slot - Machine à sous
╚═══════════════════╝

╔═══════════════════╗
🤖 *INTELLIGENCE ARTIFICIELLE*:
║ ➤ .gpt <question> - ChatGPT
║ ➤ .gemini <question> - Google Gemini
║ ➤ .claude <question> - Anthropic Claude
║ ➤ .imagine <prompt> - Générer image IA
║ ➤ .dalle <prompt> - DALL-E image
║ ➤ .ts <audio> - Transcription IA
╚═══════════════════╝

╔═══════════════════╗
🎉 *DIVERTISSEMENT*:
║ ➤ .dare
║ ➤ .truth 
║ ➤ .compliment @user
║ ➤ .insult @user
║ ➤ .flirt
║ ➤ .simp <@user>
║ ➤ .stupid <@user>
║ ➤ .character <name>
║ ➤ .wasted <reply to image>
║ ➤ .ship <@user> <@user>
║ ➤ .shayari
║ ➤ .roseday
║ ➤ .goodnight
║ ➤ .heart
╚═══════════════════╝

╔═══════════════════╗
📥 *TÉLÉCHARGEMENTS*:
║ ➤ .play <nom> - Jouer musique
║ ➤ .song <nom> - Télécharger audio
║ ➤ .video <nom> - Télécharger vidéo
║ ➤ .ytv <lien> - YouTube vidéo
║ ➤ .yta <lien> - YouTube audio
║ ➤ .facebook <lien> - Facebook média
║ ➤ .instagram <lien> - Instagram post
║ ➤ .tiktok <lien> - TikTok vidéo
║ ➤ .ytsearch <termes> - Recherche YouTube
╚═══════════════════╝

╔═══════════════════╗
✨ *EFFETS TEXTE*:
║ ➤ .fire <text>
║ ➤ .metallic <text>
║ ➤ .ice <text>
║ ➤ .neon <text>
║ ➤ .thunder <text>
║ ➤ .glitch <text>
║ ➤ .retro <text>
║ ➤ .christmas <text>
║ ➤ .cyber <text>
║ ➤ .graffiti <text>
║ ➤ .water <text>
║ ➤ .electric <text>
║ ➤ .lava <text>
║ ➤ .glass <text>
║ ➤ .comic <text>
╚═══════════════════╝`;

    }
    
    // Commandes admin (pour admin et owner seulement)
    if (userRole === 'admin' || userRole === 'owner') {
        helpMessage += `

╔═══════════════════╗
👑 *COMMANDES ADMIN*:
║ ➤ .ban @user - Bannir utilisateur
║ ➤ .kick @user - Expulser utilisateur  
║ ➤ .promote @user - Promouvoir admin
║ ➤ .demote @user - Rétrograder admin
║ ➤ .mute <minutes> - Couper chat
║ ➤ .unmute - Réactiver chat
║ ➤ .delete/.del - Supprimer message
║ ➤ .warn @user - Avertir membre
║ ➤ .warnings @user - Voir avertissements
║ ➤ .antilink - Anti-lien (on/off)
║ ➤ .antibadword - Anti-gros mots
║ ➤ .antitag - Anti-mention (on/off)
║ ➤ .clear - Messages éphémères 24h
║ ➤ .tag <msg> - Mentionner membres
║ ➤ .tagall - Mentionner tous
║ ➤ .chatbot - Chatbot IA (on/off)
║ ➤ .resetlink - Nouveau lien groupe
║ ➤ .welcome <on/off> - Message bienvenue
║ ➤ .goodbye <on/off> - Message adieu
║ ➤ .slowmode <sec> - Mode lent
║ ➤ .tempban @user <h> - Ban temporaire
║ ➤ .antiraid - Protection anti-raid
║ ➤ .groupstats - Statistiques groupe
║ ➤ .poll <question> - Créer sondage
║ ➤ .anonymous <msg> - Message anonyme
║ ➤ .confession <msg> - Confession
╚═══════════════════╝`;
    }

    // Commandes owner (pour owner seulement)
    if (userRole === 'owner') {
        helpMessage += `

╔═══════════════════╗
🔧 *COMMANDES PROPRIÉTAIRE*:
║ ➤ .mode - Mode bot (public/privé)
║ ➤ .autostatus - Auto-voir statuts
║ ➤ .clearsession - Nettoyer session
║ ➤ .antidelete - Anti-suppression
║ ➤ .cleartmp - Nettoyer temp
║ ➤ .update - Mettre à jour bot
║ ➤ .setpp <image> - Photo profil
║ ➤ .autoreact - Auto-réactions
║ ➤ .autotyping - Auto-frappe
║ ➤ .autoread - Auto-lecture
║ ➤ .sudo - Gérer utilisateurs sudo
║ ➤ .pair - Code appairage
║ ➤ .unban @user - Débannir
║ ➤ .broadcast <msg> - Diffusion
║ ➤ .companion - Gérer companions
╚═══════════════════╝`;
    }

    helpMessage += `

💡 *Tapez .cmd <commande> pour plus de détails*

📱 *Cliquez sur le bouton ci-dessus pour voir notre chaîne*`;

    // Envoyer le message texte avec limite de 63k caractères
    const maxLength = 63000;
    
    console.log('🔍 [HELP DEBUG] About to send message, length:', helpMessage.length);
    
    if (helpMessage.length <= maxLength) {
        console.log('🔍 [HELP DEBUG] Sending single message');
        console.log('🔍 [HELP DEBUG] Socket state:', {
            user: sock.user ? 'connected' : 'not connected',
            state: sock.ws ? sock.ws.readyState : 'no ws',
            chatId: chatId
        });
        
        try {
            const result = await sendWithChannelButton(sock, chatId, { 
                text: helpMessage
            }, { quoted: message });
            console.log('🔍 [HELP DEBUG] SendMessage result:', result);
            console.log('🔍 [HELP DEBUG] Single message sent successfully (WITH safe channel button)');
        } catch (sendError) {
            console.error('❌ [HELP DEBUG] SendMessage failed:', sendError);
            throw sendError;
        }
    } else {
        // Diviser en plusieurs messages si trop long
        const parts = [];
        let currentPart = "";
        const lines = helpMessage.split('\n');
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
                // Premier message avec bouton
                await sendWithChannelButton(sock, chatId, { 
                    text: part
                }, { quoted: message });
            } else {
                // Messages suivants sans bouton
                await sock.sendMessage(chatId, { 
                    text: part
                });
            }
            
            if (i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }
    
    } catch (error) {
        console.error('❌ [HELP DEBUG] Error in helpCommand:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Erreur dans la commande help: ${error.message}` 
        }, { quoted: message });
    }
}

module.exports = helpCommand;