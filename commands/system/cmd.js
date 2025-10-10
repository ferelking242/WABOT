const { i18n, getText, getUserLanguage } = require('../../lib/i18n');
const fs = require('fs');
const path = require('path');

// Configuration de bouton WhatsApp sécurisée (selon bonnes pratiques Baileys 2025)
function createSafeChannelButton() {
    return {
        contextInfo: {
            externalAdReply: {
                title: '🤖 wabot v4.3',
                body: 'Rejoignez notre chaîne officielle pour les mises à jour',
                sourceUrl: 'https://whatsapp.com/channel/0029VbBQXGg1HspxA6qQAK1S',
                mediaType: 1,
                renderLargerThumbnail: true,
                showAdAttribution: false, // Évite les rejets pour comptes non-business
                containsAutoReply: false
            },
            forwardingScore: 0,
            isForwarded: false
        }
    };
}

// Fonction d'envoi avec fallback automatique
async function sendWithChannelButton(sock, chatId, content, options = {}) {
    try {
        
        const messageWithButton = {
            ...content,
            ...createSafeChannelButton()
        };
        
        const result = await sock.sendMessage(chatId, messageWithButton, options);
        return result;
        
    } catch (error) {
        
        // Fallback : envoyer le message simple sans bouton
        const fallbackResult = await sock.sendMessage(chatId, content, options);
        return fallbackResult;
    }
}

async function cmdCommand(sock, chatId, message, args, botIdentity = null) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // ✅ FILTRAGE DES COMMANDES PAR RÔLE - Déterminer le rôle de l'utilisateur
        const isGroup = chatId.endsWith('@g.us');
        let userRole = 'user'; // Par défaut: utilisateur normal
        
        // ✅ MEILLEURE DÉTECTION DES COMPANIONS
        const isCompanion = botIdentity === 'companion' || 
                           sock._companionName || 
                           sock.companionIdentity ||
                           (sock.user && sock.user.name && sock.user.name.includes('companion'));
        
        if (isCompanion) {
            userRole = 'companion'; // Rôle spécial pour les companions
        }
        
        if (!isCompanion) {
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
        
        // ✅ FONCTION DE FILTRAGE DES COMMANDES PAR RÔLE
        function filterCommandsByRole(commands, userRole) {
            return commands.filter(cmd => {
                // Traiter les commandes sans permission comme des commandes owner seulement
                if (!cmd.perm) return userRole === 'owner'; // Commandes sans perm visibles aux owners seulement
                
                switch (userRole) {
                    case 'owner':
                        return true; // Owner voit tout
                    case 'admin': 
                        return cmd.perm === '👤' || cmd.perm === '👑'; // Admin voit user + admin
                    case 'companion':
                        // ✅ COMPANIONS : Seulement commandes de base (pas d'admin ni owner)
                        // Exclure aussi certaines commandes spécifiques que les companions ne peuvent pas utiliser
                        const companionBlockedCommands = ['companion', 'clearsession', 'setpp', 'autostatus', 'sudo'];
                        return cmd.perm === '👤' && !companionBlockedCommands.includes(cmd.name);
                    case 'user':
                    default:
                        return cmd.perm === '👤'; // User voit seulement user
                }
            });
        }
        
        function filterSectionsByRole(section, userRole) {
            return {
                ...section,
                commands: filterCommandsByRole(section.commands, userRole)
            };
        }
        
        // Commandes selon la langue de l'utilisateur
        const commandsData = {
            fr: {
                title: '📚 *MENU DES COMMANDES DISPONIBLES*',
                subtitle: 'Voici toutes les commandes que vous pouvez utiliser',
                searchTip: '💡 Tapez *.cmd nomcommande* pour plus de détails sur une commande spécifique',
                permissionLegend: '🔰 *LÉGENDE DES PERMISSIONS :*\n👤 Tous les utilisateurs\n👑 Administrateurs du groupe uniquement\n🔧 Propriétaire du bot uniquement',
                
                // Commandes Utilisateurs Normaux
                generalCommands: {
                    title: '📱 *COMMANDES GÉNÉRALES*',
                    commands: [
                        { name: 'help', alt: 'menu', desc: 'Menu d\'aide principal', example: '.help', perm: '👤' },
                        { name: 'ping', desc: 'Vérifier la latence du bot', example: '.ping', perm: '👤' },
                        { name: 'vivant', alt: 'alive', desc: 'Vérifier si le bot est en ligne', example: '.vivant', perm: '👤' },
                        { name: 'propriétaire', alt: 'owner', desc: 'Informations sur le propriétaire', example: '.propriétaire', perm: '👤' },
                        { name: 'jid', desc: 'Obtenir l\'ID du groupe/chat (envoyé en privé)', example: '.jid', perm: '👤' },
                        { name: 'langue', alt: 'lang', desc: 'Changer votre langue personnelle', example: '.langue fr', perm: '👤' }
                    ]
                },
                
                infoCommands: {
                    title: '🎯 *INFORMATIONS*',
                    commands: [
                        { name: 'infogroupe', alt: 'groupinfo', desc: 'Informations sur le groupe', example: '.infogroupe', perm: '👤' },
                        { name: 'staff', alt: 'admins', desc: 'Liste des administrateurs du groupe', example: '.staff', perm: '👤' },
                        { name: 'météo', desc: 'Météo d\'une ville', example: '.météo Paris', perm: '👤' },
                        { name: 'actualités', alt: 'news', desc: 'Dernières actualités', example: '.actualités', perm: '👤' }
                    ]
                },
                
                funCommands: {
                    title: '🎉 *DIVERTISSEMENT*',
                    commands: [
                        { name: 'blague', desc: 'Blague aléatoire', example: '.blague', perm: '👤' },
                        { name: 'fait', desc: 'Fait intéressant aléatoire', example: '.fait', perm: '👤' },
                        { name: 'citation', desc: 'Citation inspirante', example: '.citation', perm: '👤' },
                        { name: '8ball', desc: 'Boule magique 8', example: '.8ball Vais-je réussir ?', perm: '👤' },
                        { name: 'meme', desc: 'Mème aléatoire', example: '.meme', perm: '👤' },
                        { name: 'compliment', desc: 'Recevoir un compliment', example: '.compliment @utilisateur', perm: '👤' },
                        { name: 'insulte', alt: 'insult', desc: 'Insulte humoristique', example: '.insulte @utilisateur', perm: '👤' },
                        { name: 'flirt', desc: 'Message de drague', example: '.flirt @utilisateur', perm: '👤' },
                        { name: 'character', desc: 'Analyser la personnalité', example: '.character @utilisateur', perm: '👤' },
                        { name: 'simp', desc: 'Calculer le niveau simp', example: '.simp @utilisateur', perm: '👤' },
                        { name: 'stupid', desc: 'Calculer le niveau de stupidité', example: '.stupid @utilisateur', perm: '👤' },
                        { name: 'dare', desc: 'Défi aléatoire', example: '.dare', perm: '👤' },
                        { name: 'truth', desc: 'Vérité aléatoire', example: '.truth', perm: '👤' },
                        { name: 'anime', desc: 'Image anime aléatoire', example: '.anime neko', perm: '👤' },
                        { name: 'shayari', desc: 'Poésie romantique', example: '.shayari', perm: '👤' },
                        { name: 'roseday', desc: 'Message Saint-Valentin', example: '.roseday', perm: '👤' },
                        { name: 'goodnight', desc: 'Message bonne nuit', example: '.goodnight', perm: '👤' },
                        { name: 'heart', desc: 'Cœur artistique', example: '.heart', perm: '👤' }
                    ]
                },
                
                utilityCommands: {
                    title: '🔧 *UTILITAIRES*',
                    commands: [
                        { name: 'trt', alt: 'translate', desc: 'Traduire du texte', example: '.trt Bonjour en', perm: '👤' },
                        { name: 'ss', alt: 'ssweb', desc: 'Capture d\'écran d\'un site web', example: '.ss google.com', perm: '👤' },
                        { name: 'paroles', alt: 'lyrics', desc: 'Paroles d\'une chanson', example: '.paroles Shape of You', perm: '👤' },
                        { name: 'vv', desc: 'Afficher les médias "voir une fois"', example: '.vv', perm: '👤' },
                        { name: 'emojimix', desc: 'Mélanger deux emojis en sticker', example: '.emojimix 😀😍', perm: '👤' },
                        { name: 'github', desc: 'Informations sur un dépôt GitHub', example: '.github user/repo', perm: '👤' },
                        { name: 'gif', desc: 'Rechercher un GIF sur Giphy', example: '.gif chat drôle', perm: '👤' },
                        { name: 'ytsearch', alt: 'yts', desc: 'Rechercher sur YouTube', example: '.ytsearch music video', perm: '👤' }
                    ]
                },
                
                imageCommands: {
                    title: '🎨 *IMAGES ET STICKERS*',
                    commands: [
                        { name: 'autocollant', alt: 's', desc: 'Créer un sticker', example: '.autocollant (répondre à image)', perm: '👤' },
                        { name: 'simage', desc: 'Convertir sticker en image', example: '.simage', perm: '👤' },
                        { name: 'attp', desc: 'Créer un sticker texte animé', example: '.attp Salut !', perm: '👤' },
                        { name: 'flou', alt: 'blur', desc: 'Flouter une image', example: '.flou (répondre à image)', perm: '👤' },
                        { name: 'supprimerfd', alt: 'removebg', desc: 'Supprimer l\'arrière-plan', example: '.supprimerfd (répondre à image)', perm: '👤' },
                        { name: 'remini', desc: 'Améliorer la qualité d\'image', example: '.remini (répondre à image)', perm: '👤' },
                        { name: 'stickertelegram', desc: 'Télécharger sticker Telegram', example: '.stickertelegram https://t.me/...', perm: '👤' },
                        { name: 'stickercrop', desc: 'Recadrer un sticker', example: '.stickercrop (répondre à sticker)', perm: '👤' },
                        { name: 'take', desc: 'Voler un sticker avec nouveau nom', example: '.take MonNom | MonAuteur', perm: '👤' },
                        { name: 'wasted', desc: 'Effet "Wasted" sur image', example: '.wasted (répondre à image)', perm: '👤' },
                        { name: 'textmaker', desc: 'Créer du texte artistique', example: '.textmaker MonTexte', perm: '👤' },
                        { name: 'imagine', desc: 'Générer image avec IA', example: '.imagine chat dans jardin', perm: '👤' }
                    ]
                },
                
                gameCommands: {
                    title: '🎮 *JEUX*',
                    commands: [
                        { name: 'morpion', alt: 'tictactoe', desc: 'Jouer au morpion', example: '.morpion @ami', perm: '👤' },
                        { name: 'pfpc', alt: 'rps', desc: 'Pierre-papier-ciseaux', example: '.pfpc pierre', perm: '👤' },
                        { name: 'slot', desc: 'Machine à sous', example: '.slot', perm: '👤' },
                        { name: 'dés', alt: 'dice', desc: 'Lancer de dés', example: '.dés', perm: '👤' },
                        { name: 'pileface', alt: 'coinflip', desc: 'Pile ou face', example: '.pileface', perm: '👤' },
                        { name: 'pendu', alt: 'hangman', desc: 'Jouer au pendu', example: '.pendu', perm: '👤' },
                        { name: 'roulette', desc: 'Roulette russe (jeu)', example: '.roulette', perm: '👤' },
                        { name: 'énigme', alt: 'riddle', desc: 'Résoudre une énigme', example: '.énigme', perm: '👤' },
                        { name: 'trivia', desc: 'Quiz de culture générale', example: '.trivia', perm: '👤' },
                        { name: 'ship', desc: 'Calculer compatibilité amoureuse', example: '.ship @user1 @user2', perm: '👤' },
                        { name: 'blackjack', desc: 'Jeu de cartes 21', example: '.blackjack', perm: '👤' },
                        { name: 'memory', desc: 'Jeu de mémoire', example: '.memory', perm: '👤' },
                        { name: 'wordhunt', desc: 'Chasse aux mots', example: '.wordhunt', perm: '👤' },
                        { name: 'mathquiz', desc: 'Quiz mathématiques', example: '.mathquiz', perm: '👤' }
                    ]
                },
                
                aiCommands: {
                    title: '🤖 *INTELLIGENCE ARTIFICIELLE*',
                    commands: [
                        { name: 'gpt', desc: 'Poser une question à ChatGPT', example: '.gpt Explique la photosynthèse', perm: '👤' },
                        { name: 'gemini', desc: 'Utiliser Google Gemini', example: '.gemini Écris un poème', perm: '👤' },
                        { name: 'claude', desc: 'Utiliser Anthropic Claude', example: '.claude Aide-moi à coder', perm: '👤' },
                        { name: 'dalle', desc: 'Générer une image avec IA', example: '.dalle chat mignon dans jardin', perm: '👤' },
                        { name: 'flux', desc: 'Générer image avec Flux AI', example: '.flux paysage futuriste', perm: '👤' },
                        { name: 'ts', desc: 'Transcription audio/vidéo avec IA', example: '.ts (répondre à audio)', perm: '👤' },
                        { name: 'imagine', desc: 'Création d\'image IA générique', example: '.imagine robot dans espace', perm: '👤' }
                    ]
                },
                
                ttsCommands: {
                    title: '🎤 *SYNTHÈSE VOCALE (TTS)*',
                    commands: [
                        { name: 'tts', desc: 'Synthèse vocale automatique', example: '.tts Bonjour le monde', perm: '👤' },
                        { name: 'ttsgroq', desc: 'TTS avec Groq (haute qualité)', example: '.ttsgroq Mon message', perm: '👤' },
                        { name: 'ttsgtts', desc: 'TTS avec Google TTS', example: '.ttsgtts Hello world', perm: '👤' },
                        { name: 'ttselevenlabs', desc: 'TTS avec ElevenLabs (premium)', example: '.ttselevenlabs Texte premium', perm: '👤' },
                        { name: 'ttsauto', desc: 'TTS automatique intelligent', example: '.ttsauto Message à dire', perm: '👤' }
                    ]
                },
                
                downloadCommands: {
                    title: '📥 *TÉLÉCHARGEMENTS*',
                    commands: [
                        { name: 'play', desc: 'Jouer/télécharger musique', example: '.play Shape of You', perm: '👤' },
                        { name: 'song', desc: 'Télécharger chanson', example: '.song https://youtube.com/...', perm: '👤' },
                        { name: 'video', desc: 'Télécharger vidéo', example: '.video https://youtube.com/...', perm: '👤' },
                        { name: 'ytv', desc: 'Télécharger vidéo YouTube', example: '.ytv https://youtube.com/watch?v=...', perm: '👤' },
                        { name: 'yta', desc: 'Télécharger audio YouTube', example: '.yta https://youtube.com/watch?v=...', perm: '👤' },
                        { name: 'ytsearch', alt: 'yts', desc: 'Rechercher sur YouTube', example: '.ytsearch music video', perm: '👤' },
                        { name: 'instagram', desc: 'Télécharger d\'Instagram', example: '.instagram https://instagram.com/...', perm: '👤' },
                        { name: 'tiktok', desc: 'Télécharger de TikTok', example: '.tiktok https://tiktok.com/...', perm: '👤' },
                        { name: 'facebook', desc: 'Télécharger de Facebook', example: '.facebook https://facebook.com/...', perm: '👤' },
                        { name: 'svideo', desc: 'Télécharger vidéo courte', example: '.svideo https://youtube.com/shorts/...', perm: '👤' }
                    ]
                },
                
                // Commandes Admin
                adminCommands: {
                    title: '👑 *COMMANDES ADMINISTRATEURS*',
                    subtitle: '(Disponibles uniquement pour les admins du groupe)',
                    commands: [
                        { name: 'bannir', alt: 'ban', desc: 'Bannir un utilisateur', example: '.bannir @utilisateur', perm: '👑' },
                        { name: 'virer', alt: 'kick', desc: 'Expulser un utilisateur', example: '.virer @utilisateur', perm: '👑' },
                        { name: 'promouvoir', alt: 'promote', desc: 'Promouvoir en admin', example: '.promouvoir @utilisateur', perm: '👑' },
                        { name: 'rétrograder', alt: 'demote', desc: 'Rétrograder d\'admin', example: '.rétrograder @utilisateur', perm: '👑' },
                        { name: 'couper', alt: 'mute', desc: 'Couper le chat du groupe', example: '.couper 30', perm: '👑' },
                        { name: 'supprimer', alt: 'del', desc: 'Supprimer un message', example: '.supprimer (répondre au message)', perm: '👑' },
                        { name: 'réactiver', alt: 'unmute', desc: 'Réactiver le chat du groupe', example: '.réactiver', perm: '👑' },
                        { name: 'nettoyer', alt: 'clear', desc: 'Activer messages éphémères (24h)', example: '.nettoyer', perm: '👑' },
                        { name: 'marquer', alt: 'tag', desc: 'Marquer des utilisateurs', example: '.marquer @user1 @user2', perm: '👑' },
                        { name: 'marquertous', alt: 'tagall', desc: 'Marquer tous les membres', example: '.marquertous Bonjour !', perm: '👑' },
                        { name: 'avertir', alt: 'warn', desc: 'Avertir un utilisateur', example: '.avertir @utilisateur spam', perm: '👑' },
                        { name: 'avertissements', alt: 'warnings', desc: 'Voir les avertissements', example: '.avertissements @utilisateur', perm: '👑' },
                        { name: 'resetlien', alt: 'resetlink', desc: 'Régénérer le lien du groupe', example: '.resetlien', perm: '👑' },
                        { name: 'antilink', desc: 'Activer/désactiver anti-lien', example: '.antilink on', perm: '👑' },
                        { name: 'antibadword', desc: 'Activer/désactiver anti-gros mots', example: '.antibadword on', perm: '👑' },
                        { name: 'antitag', desc: 'Activer/désactiver anti-mention', example: '.antitag on', perm: '👑' },
                        { name: 'welcome', desc: 'Configurer message de bienvenue', example: '.welcome on', perm: '👑' },
                        { name: 'goodbye', desc: 'Configurer message d\'adieu', example: '.goodbye on', perm: '👑' },
                        { name: 'chatbot', desc: 'Activer/désactiver chatbot groupe', example: '.chatbot on', perm: '👑' },
                        { name: 'slowmode', desc: 'Mode lent (limite messages)', example: '.slowmode 5', perm: '👑' },
                        { name: 'tempban', desc: 'Bannissement temporaire', example: '.tempban @user 24', perm: '👑' },
                        { name: 'antiraid', desc: 'Protection anti-raid', example: '.antiraid on', perm: '👑' },
                        { name: 'groupstats', desc: 'Statistiques du groupe', example: '.groupstats', perm: '👑' },
                        { name: 'poll', desc: 'Créer un sondage', example: '.poll Question ?', perm: '👑' },
                        { name: 'anonymous', desc: 'Message anonyme', example: '.anonymous Salut !', perm: '👑' },
                        { name: 'confession', desc: 'Confession anonyme', example: '.confession Secret...', perm: '👑' },
                        { name: 'leaderboard', desc: 'Classement activité', example: '.leaderboard', perm: '👑' },
                        { name: 'rank', desc: 'Rang d\'un membre', example: '.rank @user', perm: '👑' }
                    ]
                },
                
                // Commandes Propriétaire
                ownerCommands: {
                    title: '🔧 *COMMANDES PROPRIÉTAIRE*',
                    subtitle: '(Disponibles uniquement pour le propriétaire du bot)',
                    commands: [
                        { name: 'mode', desc: 'Changer le mode du bot (public/privé)', example: '.mode public', perm: '🔧' },
                        { name: 'tts', desc: 'Synthèse vocale avancée', example: '.tts groq Bonjour !', perm: '🔧' },
                        { name: 'sudo', desc: 'Gérer les utilisateurs sudo', example: '.sudo add @utilisateur', perm: '🔧' },
                        { name: 'autoread', desc: 'Lecture automatique des messages', example: '.autoread on', perm: '🔧' },
                        { name: 'autoreact', desc: 'Réactions automatiques', example: '.autoreact on', perm: '🔧' },
                        { name: 'clearsession', desc: 'Nettoyer les données de session', example: '.clearsession', perm: '🔧' },
                        { name: 'autostatus', desc: 'Visualisation automatique des statuts', example: '.autostatus on', perm: '🔧' },
                        { name: 'autotyping', desc: 'Indicateur de frappe automatique', example: '.autotyping on', perm: '🔧' },
                        { name: 'antidelete', desc: 'Anti-suppression de messages', example: '.antidelete on', perm: '🔧' },
                        { name: 'cleartmp', desc: 'Nettoyer fichiers temporaires', example: '.cleartmp', perm: '🔧' },
                        { name: 'setpp', desc: 'Changer photo de profil du bot', example: '.setpp (répondre à image)', perm: '🔧' },
                        { name: 'update', desc: 'Mettre à jour le bot', example: '.update', perm: '🔧' },
                        { name: 'pair', desc: 'Générer code d\'appairage', example: '.pair', perm: '🔧' },
                        { name: 'unban', desc: 'Débannir un utilisateur', example: '.unban @utilisateur', perm: '🔧' },
                        { name: 'companion', desc: 'Gérer le système companion', example: '.companion start', perm: '🔧' },
                        { name: 'dvo', desc: 'Voir médias à vue unique', example: '.dvo', perm: '🔧' }
                    ]
                }
            },
            
            en: {
                title: '📚 *AVAILABLE COMMANDS MENU*',
                subtitle: 'Here are all the commands you can use',
                searchTip: '💡 Type *.cmd commandname* for more details about a specific command',
                permissionLegend: '🔰 *PERMISSION LEGEND:*\n👤 All users\n👑 Group administrators only\n🔧 Bot owner only',
                
                generalCommands: {
                    title: '📱 *GENERAL COMMANDS*',
                    commands: [
                        { name: 'help', alt: 'menu', desc: 'Main help menu', example: '.help', perm: '👤' },
                        { name: 'ping', desc: 'Check bot latency', example: '.ping', perm: '👤' },
                        { name: 'alive', desc: 'Check if bot is online', example: '.alive', perm: '👤' },
                        { name: 'owner', desc: 'Owner information', example: '.owner', perm: '👤' },
                        { name: 'jid', desc: 'Get group/chat ID', example: '.jid', perm: '👤' },
                        { name: 'lang', desc: 'Change your personal language', example: '.lang en', perm: '👤' }
                    ]
                },
                
                infoCommands: {
                    title: '🎯 *INFORMATION*',
                    commands: [
                        { name: 'groupinfo', desc: 'Group information', example: '.groupinfo', perm: '👤' },
                        { name: 'staff', alt: 'admins', desc: 'List of group administrators', example: '.staff', perm: '👤' },
                        { name: 'weather', desc: 'Weather of a city', example: '.weather London', perm: '👤' },
                        { name: 'news', desc: 'Latest news', example: '.news', perm: '👤' }
                    ]
                },
                
                funCommands: {
                    title: '🎉 *ENTERTAINMENT*',
                    commands: [
                        { name: 'joke', desc: 'Random joke', example: '.joke', perm: '👤' },
                        { name: 'fact', desc: 'Random interesting fact', example: '.fact', perm: '👤' },
                        { name: 'quote', desc: 'Inspiring quote', example: '.quote', perm: '👤' },
                        { name: '8ball', desc: 'Magic 8 ball', example: '.8ball Will I succeed?', perm: '👤' },
                        { name: 'meme', desc: 'Random meme', example: '.meme', perm: '👤' }
                    ]
                },
                
                utilityCommands: {
                    title: '🔧 *UTILITIES*',
                    commands: [
                        { name: 'trt', alt: 'translate', desc: 'Translate text', example: '.trt Hello fr', perm: '👤' },
                        { name: 'ss', alt: 'ssweb', desc: 'Website screenshot', example: '.ss google.com', perm: '👤' },
                        { name: 'lyrics', desc: 'Song lyrics', example: '.lyrics Shape of You', perm: '👤' },
                        { name: 'vv', desc: 'Show "view once" media', example: '.vv', perm: '👤' }
                    ]
                },
                
                imageCommands: {
                    title: '🎨 *IMAGES AND STICKERS*',
                    commands: [
                        { name: 'sticker', alt: 's', desc: 'Create a sticker', example: '.sticker (reply to image)', perm: '👤' },
                        { name: 'simage', desc: 'Convert sticker to image', example: '.simage', perm: '👤' },
                        { name: 'attp', desc: 'Create animated text sticker', example: '.attp Hello!', perm: '👤' },
                        { name: 'blur', desc: 'Blur an image', example: '.blur (reply to image)', perm: '👤' },
                        { name: 'removebg', desc: 'Remove background', example: '.removebg (reply to image)', perm: '👤' },
                        { name: 'remini', desc: 'Improve image quality', example: '.remini (reply to image)', perm: '👤' }
                    ]
                },
                
                gameCommands: {
                    title: '🎮 *GAMES*',
                    commands: [
                        { name: 'tictactoe', desc: 'Play tic-tac-toe', example: '.tictactoe @friend', perm: '👤' },
                        { name: 'rps', desc: 'Rock-paper-scissors', example: '.rps rock', perm: '👤' },
                        { name: 'slot', desc: 'Slot machine', example: '.slot', perm: '👤' },
                        { name: 'dice', desc: 'Roll dice', example: '.dice', perm: '👤' },
                        { name: 'coinflip', desc: 'Flip coin', example: '.coinflip', perm: '👤' }
                    ]
                },
                
                aiCommands: {
                    title: '🤖 *ARTIFICIAL INTELLIGENCE*',
                    commands: [
                        { name: 'gpt', desc: 'Ask ChatGPT a question', example: '.gpt Explain photosynthesis', perm: '👤' },
                        { name: 'gemini', desc: 'Use Google Gemini', example: '.gemini Write a poem', perm: '👤' },
                        { name: 'claude', desc: 'Use Anthropic Claude', example: '.claude Help me code', perm: '👤' },
                        { name: 'dalle', desc: 'Generate image with AI', example: '.dalle cute cat in garden', perm: '👤' },
                        { name: 'ts', desc: 'Audio/video transcription with AI', example: '.ts (reply to audio)', perm: '👤' }
                    ]
                },
                
                downloadCommands: {
                    title: '📥 *DOWNLOADS*',
                    commands: [
                        { name: 'ytv', desc: 'Download YouTube video', example: '.ytv https://youtube.com/watch?v=...', perm: '👤' },
                        { name: 'yta', desc: 'Download YouTube audio', example: '.yta https://youtube.com/watch?v=...', perm: '👤' },
                        { name: 'spotify', desc: 'Download from Spotify', example: '.spotify https://open.spotify.com/...', perm: '👤' },
                        { name: 'instagram', desc: 'Download from Instagram', example: '.instagram https://instagram.com/...', perm: '👤' },
                        { name: 'tiktok', desc: 'Download from TikTok', example: '.tiktok https://tiktok.com/...', perm: '👤' }
                    ]
                },
                
                adminCommands: {
                    title: '👑 *ADMIN COMMANDS*',
                    subtitle: '(Available only for group admins)',
                    commands: [
                        { name: 'ban', desc: 'Ban a user', example: '.ban @user', perm: '👑' },
                        { name: 'kick', desc: 'Kick a user', example: '.kick @user', perm: '👑' },
                        { name: 'promote', desc: 'Promote to admin', example: '.promote @user', perm: '👑' },
                        { name: 'demote', desc: 'Demote from admin', example: '.demote @user', perm: '👑' },
                        { name: 'mute', desc: 'Mute group chat', example: '.mute 30', perm: '👑' },
                        { name: 'delete', alt: 'del', desc: 'Delete a message', example: '.delete (reply to message)', perm: '👑' }
                    ]
                }
            }
        };
        
        // Si une commande spécifique est demandée
        if (args.length > 0) {
            const requestedCmd = args[0].toLowerCase();
            const data = commandsData[userLang] || commandsData['en'];
            
            // Chercher la commande dans toutes les catégories
            let foundCommand = null;
            Object.values(data).forEach(category => {
                if (category.commands) {
                    category.commands.forEach(cmd => {
                        if (cmd.name === requestedCmd || cmd.alt === requestedCmd) {
                            foundCommand = cmd;
                        }
                    });
                }
            });
            
            if (foundCommand) {
                const response = `📋 *${foundCommand.name.toUpperCase()}*

> *Description :*
_${foundCommand.desc}_

> *Exemple d'utilisation :*
\`${foundCommand.example}\`

${foundCommand.alt ? `> *Alias :* _.${foundCommand.alt}_` : ''}

${foundCommand.perm ? `${foundCommand.perm} *Permission requise*` : ''}`;
                
                await sock.sendMessage(chatId, { 
                    text: response, 
                    ...directChannelButton 
                }, { quoted: message });
                return;
            } else {
                const errorMsg = userLang === 'fr' ? 
                    `❌ Commande "${requestedCmd}" non trouvée. Tapez .cmd pour voir toutes les commandes.` :
                    `❌ Command "${requestedCmd}" not found. Type .cmd to see all commands.`;
                
                await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
                return;
            }
        }
        
        // ✨ AFFICHER LE MENU STYLISTÉ MODERNE ✨
        const data = commandsData[userLang] || commandsData['en'];
        
        // ✅ APPLIQUER LE FILTRAGE PAR RÔLE À TOUTES LES SECTIONS
        const filteredData = {
            ...data,
            generalCommands: data.generalCommands ? filterSectionsByRole(data.generalCommands, userRole) : { commands: [] },
            infoCommands: data.infoCommands ? filterSectionsByRole(data.infoCommands, userRole) : { commands: [] },
            funCommands: data.funCommands ? filterSectionsByRole(data.funCommands, userRole) : { commands: [] },
            utilityCommands: data.utilityCommands ? filterSectionsByRole(data.utilityCommands, userRole) : { commands: [] },
            imageCommands: data.imageCommands ? filterSectionsByRole(data.imageCommands, userRole) : { commands: [] },
            gameCommands: data.gameCommands ? filterSectionsByRole(data.gameCommands, userRole) : { commands: [] },
            aiCommands: data.aiCommands ? filterSectionsByRole(data.aiCommands, userRole) : { commands: [] },
            ttsCommands: data.ttsCommands ? filterSectionsByRole(data.ttsCommands, userRole) : { commands: [] },
            downloadCommands: data.downloadCommands ? filterSectionsByRole(data.downloadCommands, userRole) : { commands: [] },
            adminCommands: data.adminCommands ? filterSectionsByRole(data.adminCommands, userRole) : { commands: [] },
            ownerCommands: data.ownerCommands ? filterSectionsByRole(data.ownerCommands, userRole) : { commands: [] }
        };
        
        // 🎨 CRÉER LE HEADER STYLISÉ MODERNE
        const aliasManager = require('../../lib/aliasManager').getAliasManager();
        const currentTime = new Date().toLocaleString();
        
        const roleDisplay = userRole === 'owner' ? '🔧 𝐎𝐖𝐍𝐄𝐑' : 
                          userRole === 'admin' ? '👑 𝐀𝐃𝐌𝐈𝐍' : 
                          userRole === 'companion' ? '🤖 𝐂𝐎𝐌𝐏𝐀𝐍𝐈𝐎𝐍' : '👤 𝐔𝐒𝐄𝐑';

        let response = userLang === 'fr' ? 
            `🌹⃝━❮ 𝐖𝐚𝐛𝐨𝐭 𝐂𝐦𝐝 𝐌𝐞𝐧𝐮 ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝙼𝚎𝚗𝚞 𝙸𝚗𝚝𝚎𝚛𝚊𝚌𝚝𝚒𝚏* 🌤️
┊ *${currentTime}*
✧

┏━❮ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧𝐬 ❯━
┃⛤┃🎭 *𝚁ô𝚕𝚎:* ${roleDisplay}
┃⛤┃🌐 *𝙻𝚊𝚗𝚐𝚞𝚎:* ${userLang.toUpperCase()} 🇫🇷
┃⛤┃⚡ *𝙰𝚕𝚒𝚊𝚜:* ${aliasManager ? 'Système Moderne ✨' : 'Legacy 🔄'}
┃⛤┃📱 *𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* 4.3.0 - Menu Stylé
┃⛤┗━━━━━━━━━━━━━━𖣔𖣔
╰──────────────┈⊷

` :
            `🌹⃝━❮ 𝐖𝐚𝐛𝐨𝐭 𝐂𝐦𝐝 𝐌𝐞𝐧𝐮 ❯━
┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆
┊ ┊ ✫ ˚♡ ⋆｡ ✧
⊹ ☪︎⋆ *𝙸𝚗𝚝𝚎𝚛𝚊𝚌𝚝𝚒𝚟𝚎 𝙼𝚎𝚗𝚞* 🌤️
┊ *${currentTime}*
✧

┏━❮ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧 ❯━
┃⛤┃🎭 *𝚁𝚘𝚕𝚎:* ${roleDisplay}
┃⛤┃🌐 *𝙻𝚊𝚗𝚐:* ${userLang.toUpperCase()} 🇺🇸
┃⛤┃⚡ *𝙰𝚕𝚒𝚊𝚜:* ${aliasManager ? 'Modern System ✨' : 'Legacy 🔄'}
┃⛤┃📱 *𝚅𝚎𝚛𝚜𝚒𝚘𝚗:* 4.3.0 - Styled Menu
┃⛤┗━━━━━━━━━━━━━━𖣔𖣔
╰──────────────┈⊷

`;

        // 🎨 SECTIONS STYLISÉES AVEC ALIAS
        const sections = [
            { data: filteredData.generalCommands, icon: '📱', name: userLang === 'fr' ? '𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐆é𝐧é𝐫𝐚𝐥𝐞𝐬' : '𝐆𝐞𝐧𝐞𝐫𝐚𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬' },
            { data: filteredData.infoCommands, icon: '🎯', name: userLang === 'fr' ? '𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧𝐬' : '𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧' },
            { data: filteredData.funCommands, icon: '🎉', name: userLang === 'fr' ? '𝐃𝐢𝐯𝐞𝐫𝐭𝐢𝐬𝐬𝐞𝐦𝐞𝐧𝐭' : '𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭' },
            { data: filteredData.utilityCommands, icon: '🔧', name: userLang === 'fr' ? '𝐎𝐮𝐭𝐢𝐥𝐬' : '𝐔𝐭𝐢𝐥𝐢𝐭𝐢𝐞𝐬' },
            { data: filteredData.imageCommands, icon: '🎨', name: userLang === 'fr' ? '𝐈𝐦𝐚𝐠𝐞𝐬 & 𝐒𝐭𝐢𝐜𝐤𝐞𝐫𝐬' : '𝐈𝐦𝐚𝐠𝐞𝐬 & 𝐒𝐭𝐢𝐜𝐤𝐞𝐫𝐬' },
            { data: filteredData.gameCommands, icon: '🎮', name: userLang === 'fr' ? '𝐉𝐞𝐮𝐱' : '𝐆𝐚𝐦𝐞𝐬' },
            { data: filteredData.aiCommands, icon: '🤖', name: userLang === 'fr' ? '𝐈𝐧𝐭𝐞𝐥𝐥𝐢𝐠𝐞𝐧𝐜𝐞 𝐀𝐈' : '𝐀𝐈 𝐀𝐬𝐬𝐢𝐬𝐭𝐚𝐧𝐭' },
            { data: filteredData.ttsCommands, icon: '🎤', name: userLang === 'fr' ? '𝐒𝐲𝐧𝐭𝐡è𝐬𝐞 𝐕𝐨𝐜𝐚𝐥𝐞' : '𝐓𝐞𝐱𝐭 𝐭𝐨 𝐒𝐩𝐞𝐞𝐜𝐡' },
            { data: filteredData.downloadCommands, icon: '📥', name: userLang === 'fr' ? '𝐓é𝐥é𝐜𝐡𝐚𝐫𝐠𝐞𝐦𝐞𝐧𝐭𝐬' : '𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐬' }
        ];
        
        // Ajouter sections admin/owner selon permissions
        if (userRole === 'admin' || userRole === 'owner') {
            sections.push({ data: filteredData.adminCommands, icon: '👑', name: userLang === 'fr' ? '𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐀𝐝𝐦𝐢𝐧' : '𝐀𝐝𝐦𝐢𝐧 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬' });
        }
        if (userRole === 'owner') {
            sections.push({ data: filteredData.ownerCommands, icon: '🔧', name: userLang === 'fr' ? '𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐏𝐫𝐨𝐩𝐫𝐢é𝐭𝐚𝐢𝐫𝐞' : '𝐎𝐰𝐧𝐞𝐫 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬' });
        }
        
        // Générer chaque section avec style élégant
        sections.forEach(section => {
            if (section.data && section.data.commands && section.data.commands.length > 0) {
                response += `┏━❮⛤ *${section.name}* ${section.icon} ⛤❯━\n`;
                response += `┃✰╭─────────────·\n`;
                
                section.data.commands.forEach((cmd, index) => {
                    let commandLine = `┃✰┃➣${index === 0 ? '⓿' : '➊➋➌➍➎➏➐➑➒'[index] || '●'} || *.${cmd.name}* ${cmd.perm || '👤'}`;
                    
                    // Ajouter les alias avec le système moderne
                    let aliasInfo = '';
                    if (aliasManager) {
                        const aliases = aliasManager.getAllAliases(cmd.name.split(' ')[0]);
                        if (aliases[userLang] && aliases[userLang].aliases.length > 0) {
                            const aliasText = aliases[userLang].aliases.slice(0, 3).map(a => `*.${a}*`).join(', ');
                            aliasInfo = ` | ${aliasText}`;
                        }
                    } else if (cmd.alt) {
                        aliasInfo = ` | *.${cmd.alt}*`;
                    }
                    
                    commandLine += aliasInfo;
                    response += commandLine + '\n';
                    
                    // Ajouter la description sous la commande
                    if (cmd.desc) {
                        response += `┃✰┃   ↳ _${cmd.desc}_\n`;
                    }
                    
                    // Ajouter l'exemple si présent
                    if (cmd.example) {
                        response += `┃✰┃   ⤷ \`${cmd.example}\`\n`;
                    }
                });
                
                response += `┃✰└───────────┈⊷\n`;
                response += `┗━━━━━━━━━━━━━━𖣔𖣔\n\n`;
            }
        });
        
        // Ajouter la légende des symboles et alias
        response += userLang === 'fr' ?
            `┏━❮⛤ *𝐋é𝐠𝐞𝐧𝐝𝐞 𝐝𝐞𝐬 𝐒𝐲𝐦𝐛𝐨𝐥𝐞𝐬* ⛤❯━
┃✰╭─────────────·
┃✰┃➣ || *Nom de commande* | *alias*, *.raccourci*
┃✰┃↳ || _Description de la commande_  
┃✰┃⤷ || \`Exemple d'utilisation\`
┃✰┃👤 || Tous les utilisateurs
┃✰┃👑 || Administrateurs uniquement
┃✰┃🔧 || Propriétaire uniquement
┃✰└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

┏━❮⛤ *𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧𝐬 𝐔𝐭𝐢𝐥𝐞𝐬* ⛤❯━
┃✰╭─────────────·
┃✰┃📖 || *Aide détaillée:* .cmd [commande]
┃✰┃🌐 || *Changer langue:* .lang fr/en/es  
┃✰┃⚡ || *Système alias:* ${aliasManager ? 'Centralisé ✨' : 'Legacy 🔄'}
┃✰┃🎯 || *Votre rôle:* ${roleDisplay}
┃✰┃📱 || *Alias courts:* ${aliasManager ? 
                    (() => {
                        const examples = [];
                        const commands = ['weather', 'joke', 'fact', 'quote', 'help'];
                        commands.forEach(cmd => {
                            const aliases = aliasManager.getAllAliases(cmd);
                            if (aliases[userLang] && aliases[userLang].aliases.length > 0) {
                                const shortAlias = aliases[userLang].aliases.find(a => a.length <= 2);
                                if (shortAlias) examples.push('.' + shortAlias);
                            }
                        });
                        return examples.slice(0, 5).join(', ') || '.wt, .mt, .j, .f, .q';
                    })() : '.wt, .mt, .j, .f, .q'}
┃✰└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

*┌───────────────┐*
*│© 𝚠𝚊𝚋𝚘𝚝 𝚟𝟺.𝟹 - 𝙼𝚎𝚗𝚞 𝙼𝚘𝚍𝚎𝚛𝚗𝚎 │*   
*└───────────────┘*` :
            `┏━❮⛤ *𝐋𝐞𝐠𝐞𝐧𝐝 𝐨𝐟 𝐒𝐲𝐦𝐛𝐨𝐥𝐬* ⛤❯━
┃✰╭─────────────·
┃✰┃➣ || *Command name* | *alias*, *.shortcut*
┃✰┃↳ || _Command description_
┃✰┃⤷ || \`Usage example\`
┃✰┃👤 || All users
┃✰┃👑 || Administrators only
┃✰┃🔧 || Owner only
┃✰└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

┏━❮⛤ *𝐇𝐞𝐥𝐩𝐟𝐮𝐥 𝐈𝐧𝐟𝐨* ⛤❯━
┃✰╭─────────────·
┃✰┃📖 || *Detailed help:* .cmd [command]
┃✰┃🌐 || *Change language:* .lang fr/en/es
┃✰┃⚡ || *Alias system:* ${aliasManager ? 'Centralized ✨' : 'Legacy 🔄'}
┃✰┃🎯 || *Your role:* ${roleDisplay}
┃✰┃📱 || *Short aliases:* ${aliasManager ? 
                    (() => {
                        const examples = [];
                        const commands = ['weather', 'joke', 'fact', 'quote', 'help'];
                        commands.forEach(cmd => {
                            const aliases = aliasManager.getAllAliases(cmd);
                            if (aliases[userLang] && aliases[userLang].aliases.length > 0) {
                                const shortAlias = aliases[userLang].aliases.find(a => a.length <= 2);
                                if (shortAlias) examples.push('.' + shortAlias);
                            }
                        });
                        return examples.slice(0, 5).join(', ') || '.wt, .mt, .j, .f, .q';
                    })() : '.wt, .mt, .j, .f, .q'}
┃✰└───────────┈⊷
┗━━━━━━━━━━━━━━𖣔𖣔

*┌───────────────┐*
*│© 𝚠𝚊𝚋𝚘𝚝 𝚟𝟺.𝟹 - 𝙼𝚘𝚍𝚎𝚛𝚗 𝙼𝚎𝚗𝚞 │*   
*└───────────────┘*`;
        

        // Filtrage terminé

        // Envoyer le message texte avec limite de 63k caractères
        const maxLength = 63000;
        
        
        if (response.length <= maxLength) {
            try {
                const result = await sendWithChannelButton(sock, chatId, { 
                    text: response
                }, { quoted: message });
            } catch (sendError) {
                console.error('❌ SendMessage failed:', sendError);
                throw sendError;
            }
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
        console.error('Erreur dans la commande cmd:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        const errorMsg = userLang === 'fr' ? 
            '❌ Erreur lors de l\'affichage des commandes.' :
            '❌ Error displaying commands.';
        
        await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
    }
}

module.exports = cmdCommand;