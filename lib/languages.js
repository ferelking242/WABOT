/**
 * wabot - A WhatsApp Bot
 * Copyright (c) 2024 wabot team
 * 
 * Multi-language support system for wabot
 */

const { db } = require('./database');

// Command mappings by language
const commandMappings = {
    fr: {
        // Fun commands
        'joke': 'blague',
        'fact': 'fait',
        'quote': 'citation',
        'dare': 'défis',
        'truth': 'vérité',
        'flirt': 'draguer',
        'compliment': 'compliment',
        'insult': 'insulte',
        
        // Game commands
        'tictactoe': 'morpion',
        'hangman': 'pendu',
        'trivia': 'quizz',
        
        // Text commands
        'translate': 'traduire',
        'weather': 'météo',
        'news': 'actualités',
        
        // Media commands
        'play': 'jouer',
        'song': 'chanson',
        'video': 'vidéo',
        'sticker': 'autocollant',
        
        // Admin commands
        'ban': 'bannir',
        'kick': 'virer',
        'mute': 'muet',
        'warn': 'avertir',
        
        // AI commands
        'imagine': 'imaginer',
        
        // System commands
        'compagnon': 'companion',
        
        // Help commands
        'help': 'aide',
        'cmd': 'cmd'
    },
    en: {
        // English commands (default)
        'blague': 'joke',
        'fait': 'fact',
        'citation': 'quote',
        'défis': 'dare',
        'vérité': 'truth',
        'draguer': 'flirt',
        'morpion': 'tictactoe',
        'pendu': 'hangman',
        'quizz': 'trivia',
        'traduire': 'translate',
        'météo': 'weather',
        'actualités': 'news',
        'jouer': 'play',
        'chanson': 'song',
        'vidéo': 'video',
        'autocollant': 'sticker',
        'bannir': 'ban',
        'virer': 'kick',
        'muet': 'mute',
        'avertir': 'warn',
        'imaginer': 'imagine'
    },
    es: {
        // Spanish commands
        'joke': 'chiste',
        'fact': 'dato',
        'quote': 'cita',
        'dare': 'reto',
        'truth': 'verdad',
        'flirt': 'coquetear',
        'tictactoe': 'tresenraya',
        'hangman': 'ahorcado',
        'trivia': 'trivia',
        'translate': 'traducir',
        'weather': 'clima',
        'news': 'noticias',
        'play': 'reproducir',
        'song': 'canción',
        'video': 'video',
        'sticker': 'pegatina',
        'ban': 'banear',
        'kick': 'expulsar',
        'mute': 'silenciar',
        'warn': 'advertir',
        'imagine': 'imaginar',
        
        // Help commands
        'help': 'ayuda',
        'cmd': 'cmd'
    }
};

const languages = {
    fr: {
        // Bot Info
        BOT_NAME: "wabot",
        VERSION: "Version",
        CHANNEL: "Chaîne",
        BY_AUTHOR: "par",
        
        // Help Menu
        HELP_TITLE: "🤖 Menu d'aide - wabot",
        HELP_DESC: "💡 Tapez .help <commande> pour plus d'infos\n📋 Total des commandes: 100+\n\n🔗 Rejoignez notre chaîne WhatsApp pour les mises à jour",
        
        // Command Categories
        CAT_GENERAL: "🌐 Commandes Générales",
        CAT_ADMIN: "👮‍♂️ Commandes Admin",
        CAT_OWNER: "🔒 Commandes Propriétaire",
        CAT_IMAGE: "🎨 Images/Stickers",
        CAT_GAMES: "🎮 Jeux",
        CAT_AI: "🤖 Intelligence Artificielle",
        CAT_FUN: "🎯 Amusement",
        CAT_TEXT: "🔤 Générateur de Texte",
        CAT_DOWNLOAD: "📥 Téléchargements",
        CAT_MISC: "🧩 Divers",
        CAT_ANIME: "🖼️ Anime",
        CAT_GITHUB: "💻 GitHub",
        
        // Common Messages
        SUCCESS: "✅ Succès",
        ERROR: "❌ Erreur",
        PROCESSING: "⏳ Traitement en cours...",
        BOT_CONNECTED: "🤖 Bot connecté avec succès!",
        COMMAND_NOT_FOUND: "❌ Commande non trouvée",
        PERMISSION_DENIED: "❌ Permission refusée",
        ADMIN_ONLY: "❌ Cette commande est réservée aux administrateurs du groupe",
        OWNER_ONLY: "❌ Cette commande est réservée au propriétaire du bot",
        BOT_ADMIN_REQUIRED: "❌ Le bot doit être administrateur pour utiliser cette commande",
        USER_NOT_FOUND: "❌ Utilisateur non trouvé. Mentionnez un utilisateur ou répondez à son message",
        PROVIDE_TEXT: "❌ Veuillez fournir du texte après la commande",
        REPLY_TO_MESSAGE: "❌ Veuillez répondre à un message",
        REPLY_TO_MEDIA: "❌ Veuillez répondre à une image ou vidéo",
        FAILED_TO_FETCH: "❌ Impossible de récupérer les données. Réessayez plus tard",
        INVALID_URL: "❌ URL invalide",
        
        // Status Messages
        ONLINE: "En ligne",
        OFFLINE: "Hors ligne",
        READY: "Prêt",
        ENABLED: "Activé",
        DISABLED: "Désactivé",
        
        // Bot Features
        BOT_ALIVE_MESSAGE: "🤖 wabot est actif!\n\n*Version:* {version}\n*Statut:* En ligne\n*Mode:* Public\n\n*🌟 Fonctionnalités:*\n• Gestion de groupe\n• Protection anti-lien\n• Commandes amusantes\n• Et plus encore!\n\nTapez *.menu* pour la liste complète des commandes",
        
        // Command specific messages
        AI_PROVIDE_QUESTION: "Veuillez fournir une question après .gpt ou .gemini\n\nExemple: .gpt écris un code HTML basique",
        AI_ERROR_RESPONSE: "❌ Désolé, j'ai du mal à traiter votre demande en ce moment. Veuillez réessayer plus tard.",
        JOKE_FAILED: "Désolé, je n'ai pas pu récupérer une blague pour le moment.",
        STICKER_REPLY_TO_MEDIA: "Veuillez répondre à une image ou vidéo avec la commande .sticker pour la convertir",
        
        // Simage/Svideo Messages
        SIMAGE_REPLY_TO_STICKER: "Répondez à un sticker avec .simage pour le convertir en image",
        SIMAGE_ANIMATED_USE_SVIDEO: "Ce sticker est animé! Utilisez .svideo pour le convertir en vidéo",
        SIMAGE_SUCCESS: "Voici votre image extraite du sticker!",
        SIMAGE_ERROR: "Une erreur s'est produite lors de la conversion en image",
        SVIDEO_REPLY_TO_STICKER: "Répondez à un sticker animé avec .svideo pour le convertir en vidéo",
        SVIDEO_NOT_ANIMATED: "Ce sticker n'est pas animé. Utilisez .simage pour les stickers statiques",
        SVIDEO_SUCCESS: "Voici votre vidéo extraite du sticker animé!",
        SVIDEO_ERROR: "Une erreur s'est produite lors de la conversion en vidéo",
        SVIDEO_CONVERSION_FAILED: "Échec de la conversion en vidéo",
        
        // Chatbot Messages
        CHATBOT_TITLE: "🤖 *CONFIGURATION CHATBOT*",
        CHATBOT_BASIC_COMMANDS: "*Commandes de base:*",
        CHATBOT_ON: "• .chatbot on - Activer le chatbot",
        CHATBOT_OFF: "• .chatbot off - Désactiver le chatbot dans ce groupe",
        CHATBOT_PERSONALITIES: "*Personnalités disponibles:*",
        CHATBOT_FRIENDLY: "• .chatbot personnalité amical - Amical et serviable 😊",
        CHATBOT_SAVAGE: "• .chatbot personnalité sauvage - Sarcastique et brutal 😏",
        CHATBOT_FUNNY: "• .chatbot personnalité drôle - Blagues et humour 😂",
        CHATBOT_SMART: "• .chatbot personnalité intelligent - Intelligent et sérieux 🤓",
        CHATBOT_FLIRTY: "• .chatbot personnalité charmeur - Charmeur et coquin 😉",
        CHATBOT_MYSTERIOUS: "• .chatbot personnalité mystérieux - Énigmatique et intriguant 🔮",
        CHATBOT_ENERGETIC: "• .chatbot personnalité énergique - Hyperactif et motivant ⚡",
        CHATBOT_OTHER_OPTIONS: "*Autres options:*",
        CHATBOT_STATUS: "• .chatbot statut - Afficher les paramètres actuels",
        CHATBOT_RESET: "• .chatbot reset - Réinitialiser à la personnalité par défaut",
        CHATBOT_LANGUAGE_NOTE: "*Langue:* Le bot s'adapte automatiquement à votre langue (Français/Anglais/Espagnol)",
        CHATBOT_ENABLED: "*Le chatbot a été activé pour ce groupe* ✅",
        CHATBOT_DISABLED: "*Le chatbot a été désactivé pour ce groupe* ❌",
        CHATBOT_ALREADY_ENABLED: "*Le chatbot est déjà activé pour ce groupe* ℹ️",
        CHATBOT_ALREADY_DISABLED: "*Le chatbot est déjà désactivé pour ce groupe* ℹ️",
        
        // Roulette Messages
        ROULETTE_TITLE: "*Roulette Russe*",
        ROULETTE_TRIGGER: "tire le pistolet...",
        ROULETTE_SAFE_1: "Clic... Tu es en sécurité !",
        ROULETTE_SAFE_2: "Clic... Rien ne se passe !",
        ROULETTE_SAFE_3: "Clic... Tu as de la chance !",
        ROULETTE_SAFE_4: "Clic... Chambre vide !",
        ROULETTE_SAFE_5: "Clic... Tu survies !",
        ROULETTE_DEATH: "BANG! 💀 Tu es mort(e) !",
        ROULETTE_RIP: "⚰️ Repose en paix...",
        MENTION_USER_TO_BAN: "Veuillez mentionner l'utilisateur ou répondre à son message pour le bannir!",
        MENTION_USER_TO_ANALYZE: "Veuillez mentionner quelqu'un ou répondre à son message pour analyser son caractère!",
        MENTION_USER_TO_COMPLIMENT: "Veuillez mentionner quelqu'un ou répondre à son message pour le complimenter!",
        ASK_QUESTION_8BALL: "Veuillez poser une question!",
        PROVIDE_SONG_NAME: "🔍 Veuillez entrer le nom de la chanson pour obtenir les paroles! Usage: *lyrics <nom de chanson>*",
        
        // TikTok Messages
        TIKTOK_PROVIDE_LINK: "Veuillez fournir un lien TikTok pour la vidéo.",
        TIKTOK_INVALID_LINK: "Ce n'est pas un lien TikTok valide. Veuillez fournir un lien vidéo TikTok valide.",
        
        // Sticker Tutorial
        STICKER_TUTORIAL_TITLE: "*🎯 COMMANDE STICKER OPTIMISÉE*",
        STICKER_TUTORIAL_BASIC: "*Utilisation de base :*\n• *.sticker* - Convertit image/vidéo en sticker\n• *.s* - Raccourci pour sticker",
        STICKER_TUTORIAL_VIDEO: "*Options pour vidéos :*\n• *.sticker pack:nom* - Change le nom du pack (défaut: wabot)\n• *.sticker author:nom* - Change l'auteur\n• *.sticker duration:6* - Limite à 6 secondes (max 8s pour WhatsApp)\n• *.sticker time:5-10* - Prend de 5s à 10s de la vidéo\n• *.sticker fps:12* - Change les FPS (défaut: 12, max 15)",
        STICKER_TUTORIAL_SPECS: "*Spécifications WhatsApp :*\n• Taille: 512x512px exactement\n• Images: ≤100KB, Vidéos: ≤500KB\n• Vidéos: max 8 secondes, min 8ms par frame\n• Format: WebP uniquement",
        STICKER_TUTORIAL_EXAMPLE: "*Exemple :*\n*.sticker pack:Memes duration:4 fps:10*",
        
        // Help Menu Content
        HELP_AVAILABLE_COMMANDS: "*Commandes disponibles:*",
        HELP_GENERAL_SECTION: "🌐 *Commandes Générales*",
        HELP_ADMIN_SECTION: "👮‍♂️ *Commandes Admin*",
        HELP_OWNER_SECTION: "🔒 *Commandes Propriétaire*",
        HELP_IMAGE_SECTION: "🎨 *Commandes Images/Stickers*",
        HELP_GAMES_SECTION: "🎮 *Commandes Jeux*",
        HELP_AI_SECTION: "🤖 *Commandes IA*",
        HELP_FUN_SECTION: "🎯 *Commandes Amusement*",
        HELP_DOWNLOAD_SECTION: "📥 *Commandes Téléchargement*",
        HELP_TEXT_SECTION: "🔤 *Générateur de Texte*",
        HELP_FOOTER: "Utilisez '.help <commande>' pour une aide spécifique.\nExemple: .help play, .help sticker",
        HELP_CHANNEL: "Rejoignez notre chaîne",
        
        // TTS Messages
        TTS_USAGE: "🎆 *✨ TEXTE-VERS-PAROLE AVANCÉ ✨*\n\n🔥 *UTILISATION RAPIDE:*\n• *.tts <votre texte>* - Groq AI (par défaut)\n• *.tts<fournisseur> <votre texte>* - Choisir le fournisseur\n\n🌐 *FOURNISSEURS DISPONIBLES:*\n\n🤖 *GROQ AI* *(recommandé - par défaut)*\n   • Syntaxe: *.ttsgroq <texte>* ou *.tts <texte>*\n   • Qualité: 🌟 EXCELLENTE\n   • Vitesse: ⚡ ULTRA RAPIDE\n   • Voix: alloy, echo, fable, onyx, nova, shimmer\n\n🌎 *GOOGLE TTS* *(fiable)*\n   • Syntaxe: *.ttsgtts <texte>*\n   • Qualité: 👍 BONNE\n   • Langues: 16+ langues supportées\n\n📎 *ELEVENLABS* *(premium)*\n   • Syntaxe: *.ttselevenlabs <texte>*\n   • Qualité: 💯 PREMIUM\n   • Voix: rachel, domi, bella, antoni, elli, josh\n\n🔄 *MODE AUTO* *(essaie tous)*\n   • Syntaxe: *.ttsauto <texte>*\n   • Teste automatiquement tous les fournisseurs\n\n🌍 *LANGUES SUPPORTÉES:*\nfr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n📝 *EXEMPLES CONCRETS:*\n• .tts Salut tout le monde !\n• .ttsgroq-nova Bonjour avec voix Nova\n• .ttsgtts-fr-slow Parlez lentement\n• .ttselevenlabs-rachel Hello premium voice\n• .ttsauto Teste tous les fournisseurs\n\n💡 *ASTUCE:* Par défaut, Groq AI est utilisé pour la meilleure expérience !",
        TTS_NO_TEXT: "❌ Veuillez fournir du texte à convertir en audio.",
        TTS_TEXT_TOO_LONG: "❌ Texte trop long. Maximum 4000 caractères.",
        TTS_PROCESSING: "🔊 Génération audio en cours...",
        TTS_TRYING_PROVIDER: "🔊 Essai avec {provider}...",
        TTS_SUCCESS: "✅ Audio généré avec {provider}",
        TTS_ALL_FAILED: "❌ Tous les fournisseurs TTS ont échoué. Réessayez plus tard.",
        TTS_ERROR: "❌ Erreur lors de la génération audio. Réessayez.",
        
        // Transcription Messages
        TRANSCRIBE_USAGE: "🎤 *Transcription Audio/Vidéo*\n\nRépondez à un message audio ou vidéo avec *.transcribe* pour le convertir en texte\n\nFormats supportés:\n• Messages audio\n• Messages vocaux\n• Vidéos avec audio\n\nExemple:\n*Répondre à audio* --> .transcribe",
        TRANSCRIBE_NO_MEDIA: "❌ Veuillez répondre à un message audio ou vidéo pour le transcrire.",
        TRANSCRIBE_PROCESSING: "🔄 Transcription audio en cours... Patientez s'il vous plaît.",
        TRANSCRIBE_SUCCESS: "🎤 *Transcription Audio:*",
        TRANSCRIBE_ERROR: "❌ Désolé, impossible de transcrire l'audio. L'audio pourrait être peu clair ou le service temporairement indisponible.\n\n💡 Essayez avec un enregistrement audio plus clair.",
        
        // Terminal Messages - French
        TERMINAL_PHONE_PROMPT: "Veuillez saisir votre numéro WhatsApp 😍\nFormat: 242065491040730 (sans + ou espaces) : ",
        TERMINAL_PAIRING_CODE: "Votre Code d'Appariement : ",
        TERMINAL_PAIRING_INSTRUCTIONS: "\nVeuillez entrer ce code dans votre application WhatsApp :\n1. Ouvrez WhatsApp\n2. Allez dans Paramètres > Appareils Liés\n3. Appuyez sur \"Lier un Appareil\"\n4. Entrez le code affiché ci-dessus",
        TERMINAL_CONNECTED: "Connecté à =>",
        TERMINAL_BOT_CONNECTED: "Bot Connecté avec Succès!",
        TERMINAL_YT_CHANNEL: "CHAÎNE YT: équipe wabot",
        TERMINAL_GITHUB: "GITHUB: wabot",
        TERMINAL_WA_NUMBER: "NUMÉRO WA",
        TERMINAL_CREDIT: "CRÉDIT: équipe wabot",
        TERMINAL_SESSION_LOGGED_OUT: "Session déconnectée. Veuillez vous ré-authentifier.",
        TERMINAL_INVALID_PHONE: "Numéro de téléphone invalide. Veuillez entrer votre numéro international complet (ex: 15551234567 pour US, 447911123456 pour UK, etc.) sans + ou espaces.",
        TERMINAL_PAIRING_ERROR: "Erreur lors de la demande du code d'appariement:",
        TERMINAL_PAIRING_FAILED: "Échec de l'obtention du code d'appariement. Veuillez vérifier votre numéro de téléphone et réessayer.",
        TERMINAL_MESSAGE_ERROR: "❌ Une erreur s'est produite lors du traitement de votre message.",
        TERMINAL_GARBAGE_COLLECTION: "🧹 Nettoyage de mémoire terminé",
        TERMINAL_HIGH_RAM: "⚠️ RAM trop élevée (>800MB), redémarrage du bot...",
        TERMINAL_UPDATE_FILE: "Mise à jour",
        
        // Clear Commands
        CLEAR_MESSAGES: "Nettoyage des messages du bot...",
        CLEAR_ERROR: "Une erreur s'est produite lors du nettoyage des messages.",
        
        // Clear Session Commands  
        CLEARSESSION_OWNER_ONLY: "❌ Cette commande ne peut être utilisée que par le propriétaire !",
        CLEARSESSION_NOT_FOUND: "❌ Répertoire de session non trouvé !",
        CLEARSESSION_OPTIMIZING: "🔍 Optimisation des fichiers de session pour une meilleure performance...",
        CLEARSESSION_SUCCESS: "✅ Fichiers de session nettoyés avec succès !",
        CLEARSESSION_STATS: "📊 Statistiques :",
        CLEARSESSION_FILES_CLEARED: "• Total des fichiers nettoyés : {count}",
        CLEARSESSION_APP_STATE: "• Fichiers de synchronisation d'état d'app : {count}",
        CLEARSESSION_PRE_KEYS: "• Fichiers de pré-clés : {count}",
        CLEARSESSION_ERRORS: "⚠️ Erreurs rencontrées : {count}",
        
        // Delete Commands
        DELETE_NEED_ADMIN: "J'ai besoin d'être administrateur pour supprimer des messages.",
        DELETE_ADMIN_ONLY: "Seuls les administrateurs peuvent utiliser la commande .delete.",
        DELETE_REPLY_TO_MESSAGE: "Veuillez répondre à un message que vous voulez supprimer.",
        
        // TS (Transcription) Commands
        TS_TITLE: "🎤 *TRANSCRIPTION AUDIO/VIDÉO*",
        TS_USAGE: "Utilisation: .ts [service] (en répondant à un audio/vidéo)",
        TS_SERVICES: "Services disponibles:",
        TS_SERVICE_GROQ: "• groq - Service Groq AI (Recommandé) ⭐",
        TS_SERVICE_WHISPER: "• whisper - OpenAI Whisper",
        TS_SERVICE_HF: "• hf - Hugging Face",
        TS_SERVICE_AUTO: "• auto - Détection automatique",
        TS_EXAMPLES: "Exemples:",
        TS_EXAMPLE_1: ".ts (service automatique)",
        TS_EXAMPLE_2: ".ts groq (utilise Groq AI)",
        TS_EXAMPLE_3: ".ts whisper (utilise Whisper)",
        TS_NO_MEDIA: "❌ Répondez à un message audio ou vidéo pour le transcrire.",
        TS_PROCESSING: "🔄 Transcription en cours avec {service}...",
        TS_SUCCESS: "🎤 *Transcription ({service}):*",
        TS_ERROR: "❌ Échec de la transcription avec {service}. Tentative avec un autre service...",
        TS_ALL_FAILED: "❌ Tous les services de transcription ont échoué. Essayez avec un audio plus clair.",
        TS_INVALID_SERVICE: "❌ Service invalide. Utilisez: groq, whisper, hf, ou auto"
    },
    
    en: {
        // Bot Info
        BOT_NAME: "wabot",
        VERSION: "Version",
        CHANNEL: "Channel",
        BY_AUTHOR: "by",
        
        // Help Menu
        HELP_TITLE: "🤖 Help Menu - wabot",
        HELP_DESC: "💡 Type .help <command> for more info\n📋 Total commands: 100+\n\n🔗 Join our WhatsApp channel for updates",
        
        // Command Categories
        CAT_GENERAL: "🌐 General Commands",
        CAT_ADMIN: "👮‍♂️ Admin Commands",
        CAT_OWNER: "🔒 Owner Commands",
        CAT_IMAGE: "🎨 Image/Sticker Commands",
        CAT_GAMES: "🎮 Game Commands",
        CAT_AI: "🤖 AI Commands",
        CAT_FUN: "🎯 Fun Commands",
        CAT_TEXT: "🔤 Text Maker",
        CAT_DOWNLOAD: "📥 Downloader",
        CAT_MISC: "🧩 Miscellaneous",
        CAT_ANIME: "🖼️ Anime",
        CAT_GITHUB: "💻 GitHub Commands",
        
        // Common Messages
        SUCCESS: "✅ Success",
        ERROR: "❌ Error",
        PROCESSING: "⏳ Processing...",
        BOT_CONNECTED: "🤖 Bot connected successfully!",
        COMMAND_NOT_FOUND: "❌ Command not found",
        PERMISSION_DENIED: "❌ Permission denied",
        ADMIN_ONLY: "❌ This command is only for group admins",
        OWNER_ONLY: "❌ This command is only for the bot owner",
        BOT_ADMIN_REQUIRED: "❌ Bot must be admin to use this command",
        USER_NOT_FOUND: "❌ User not found. Please mention a user or reply to their message",
        PROVIDE_TEXT: "❌ Please provide text after the command",
        REPLY_TO_MESSAGE: "❌ Please reply to a message",
        REPLY_TO_MEDIA: "❌ Please reply to an image or video",
        FAILED_TO_FETCH: "❌ Failed to fetch data. Please try again later",
        INVALID_URL: "❌ Invalid URL",
        
        // Status Messages
        ONLINE: "Online",
        OFFLINE: "Offline",
        READY: "Ready",
        ENABLED: "Enabled",
        DISABLED: "Disabled",
        
        // Bot Features
        BOT_ALIVE_MESSAGE: "🤖 wabot is Active!\n\n*Version:* {version}\n*Status:* Online\n*Mode:* Public\n\n*🌟 Features:*\n• Group Management\n• Antilink Protection\n• Fun Commands\n• And more!\n\nType *.menu* for full command list",
        
        // Command specific messages
        AI_PROVIDE_QUESTION: "Please provide a question after .gpt or .gemini\n\nExample: .gpt write a basic html code",
        AI_ERROR_RESPONSE: "❌ Sorry, I'm having trouble processing your request right now. Please try again later.",
        JOKE_FAILED: "Sorry, I could not fetch a joke right now.",
        STICKER_REPLY_TO_MEDIA: "Please reply to an image or video with the .sticker command to convert it",
        
        // Simage/Svideo Messages
        SIMAGE_REPLY_TO_STICKER: "Reply to a sticker with .simage to convert it to image",
        SIMAGE_ANIMATED_USE_SVIDEO: "This sticker is animated! Use .svideo to convert it to video",
        SIMAGE_SUCCESS: "Here is your image extracted from the sticker!",
        SIMAGE_ERROR: "An error occurred while converting to image",
        SVIDEO_REPLY_TO_STICKER: "Reply to an animated sticker with .svideo to convert it to video",
        SVIDEO_NOT_ANIMATED: "This sticker is not animated. Use .simage for static stickers",
        SVIDEO_SUCCESS: "Here is your video extracted from the animated sticker!",
        SVIDEO_ERROR: "An error occurred while converting to video",
        SVIDEO_CONVERSION_FAILED: "Video conversion failed",
        
        // Roulette Messages
        ROULETTE_TITLE: "*Russian Roulette*",
        ROULETTE_TRIGGER: "pulls the trigger...",
        ROULETTE_SAFE_1: "Click... You are safe!",
        ROULETTE_SAFE_2: "Click... Nothing happens!",
        ROULETTE_SAFE_3: "Click... You are lucky!",
        ROULETTE_SAFE_4: "Click... Empty chamber!",
        ROULETTE_SAFE_5: "Click... You survive!",
        ROULETTE_DEATH: "BANG! 💀 You are dead!",
        ROULETTE_RIP: "⚰️ Rest in peace...",
        MENTION_USER_TO_BAN: "Please mention the user or reply to their message to ban!",
        MENTION_USER_TO_ANALYZE: "Please mention someone or reply to their message to analyze their character!",
        MENTION_USER_TO_COMPLIMENT: "Please mention someone or reply to their message to compliment them!",
        ASK_QUESTION_8BALL: "Please ask a question!",
        PROVIDE_SONG_NAME: "🔍 Please enter the song name to get the lyrics! Usage: *lyrics <song name>*",
        
        // TikTok Messages
        TIKTOK_PROVIDE_LINK: "Please provide a TikTok link for the video.",
        TIKTOK_INVALID_LINK: "That is not a valid TikTok link. Please provide a valid TikTok video link.",
        
        // Sticker Tutorial
        STICKER_TUTORIAL_TITLE: "*🎯 OPTIMIZED STICKER COMMAND*",
        STICKER_TUTORIAL_BASIC: "*Basic usage:*\n• *.sticker* - Convert image/video to sticker\n• *.s* - Shortcut for sticker",
        STICKER_TUTORIAL_VIDEO: "*Video options:*\n• *.sticker pack:name* - Change pack name (default: wabot)\n• *.sticker author:name* - Change author\n• *.sticker duration:6* - Limit to 6 seconds (max 8s for WhatsApp)\n• *.sticker time:5-10* - Take from 5s to 10s of video\n• *.sticker fps:12* - Change FPS (default: 12, max 15)",
        STICKER_TUTORIAL_SPECS: "*WhatsApp specifications:*\n• Size: exactly 512x512px\n• Images: ≤100KB, Videos: ≤500KB\n• Videos: max 8 seconds, min 8ms per frame\n• Format: WebP only",
        STICKER_TUTORIAL_EXAMPLE: "*Example:*\n*.sticker pack:Memes duration:4 fps:10*",
        
        // Help Menu Content
        HELP_AVAILABLE_COMMANDS: "*Available Commands:*",
        HELP_GENERAL_SECTION: "🌐 *General Commands*",
        HELP_ADMIN_SECTION: "👮‍♂️ *Admin Commands*",
        HELP_OWNER_SECTION: "🔒 *Owner Commands*",
        HELP_IMAGE_SECTION: "🎨 *Image/Sticker Commands*",
        HELP_GAMES_SECTION: "🎮 *Game Commands*",
        HELP_AI_SECTION: "🤖 *AI Commands*",
        HELP_FUN_SECTION: "🎯 *Fun Commands*",
        HELP_DOWNLOAD_SECTION: "📥 *Download Commands*",
        HELP_TEXT_SECTION: "🔤 *Text Generator*",
        HELP_FOOTER: "Use '.help <command>' for specific help.\nExample: .help play, .help sticker",
        HELP_CHANNEL: "Join our channel",
        
        // TTS Messages
        TTS_USAGE: "🎆 *✨ ADVANCED TEXT-TO-SPEECH ✨*\n\n🔥 *QUICK USAGE:*\n• *.tts <your text>* - Groq AI (default)\n• *.tts<provider> <your text>* - Choose provider\n\n🌐 *AVAILABLE PROVIDERS:*\n\n🤖 *GROQ AI* *(recommended - default)*\n   • Syntax: *.ttsgroq <text>* or *.tts <text>*\n   • Quality: 🌟 EXCELLENT\n   • Speed: ⚡ ULTRA FAST\n   • Voices: alloy, echo, fable, onyx, nova, shimmer\n\n🌎 *GOOGLE TTS* *(reliable)*\n   • Syntax: *.ttsgtts <text>*\n   • Quality: 👍 GOOD\n   • Languages: 16+ languages supported\n\n📎 *ELEVENLABS* *(premium)*\n   • Syntax: *.ttselevenlabs <text>*\n   • Quality: 💯 PREMIUM\n   • Voices: rachel, domi, bella, antoni, elli, josh\n\n🔄 *AUTO MODE* *(tries all)*\n   • Syntax: *.ttsauto <text>*\n   • Automatically tests all providers\n\n🌍 *SUPPORTED LANGUAGES:*\nfr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n📝 *CONCRETE EXAMPLES:*\n• .tts Hello everyone!\n• .ttsgroq-nova Hello with Nova voice\n• .ttsgtts-en-slow Speak slowly\n• .ttselevenlabs-rachel Hello premium voice\n• .ttsauto Test all providers\n\n💡 *TIP:* By default, Groq AI is used for the best experience!",
        TTS_NO_TEXT: "❌ Please provide text to convert to audio.",
        TTS_TEXT_TOO_LONG: "❌ Text too long. Maximum 4000 characters.",
        TTS_PROCESSING: "🔊 Generating audio...",
        TTS_TRYING_PROVIDER: "🔊 Trying {provider}...",
        TTS_SUCCESS: "✅ Audio generated with {provider}",
        TTS_ALL_FAILED: "❌ All TTS providers failed. Try again later.",
        TTS_ERROR: "❌ Error generating audio. Please try again.",
        
        // Transcription Messages
        TRANSCRIBE_USAGE: "🎤 *Audio/Video Transcription*\n\nReply to an audio message or video with *.transcribe* to convert it to text\n\nSupported formats:\n• Audio messages\n• Voice notes\n• Videos with audio\n\nExample:\n*Reply to audio* --> .transcribe",
        TRANSCRIBE_NO_MEDIA: "❌ Please reply to an audio message or video to transcribe it.",
        TRANSCRIBE_PROCESSING: "🔄 Transcribing audio to text... Please wait.",
        TRANSCRIBE_SUCCESS: "🎤 *Audio Transcription:*",
        TRANSCRIBE_ERROR: "❌ Sorry, I couldn't transcribe the audio. The audio might be unclear or the service is temporarily unavailable.\n\n💡 Try with a clearer audio recording.",
        
        // Terminal Messages - English
        TERMINAL_PHONE_PROMPT: "Please type your WhatsApp number 😍\nFormat: 242065491040730 (without + or spaces) : ",
        TERMINAL_PAIRING_CODE: "Your Pairing Code : ",
        TERMINAL_PAIRING_INSTRUCTIONS: "\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap \"Link a Device\"\n4. Enter the code shown above",
        TERMINAL_CONNECTED: "Connected to =>",
        TERMINAL_BOT_CONNECTED: "Bot Connected Successfully!",
        TERMINAL_YT_CHANNEL: "YT CHANNEL: wabot team",
        TERMINAL_GITHUB: "GITHUB: wabot",
        TERMINAL_WA_NUMBER: "WA NUMBER",
        TERMINAL_CREDIT: "CREDIT: wabot team",
        TERMINAL_SESSION_LOGGED_OUT: "Session logged out. Please re-authenticate.",
        TERMINAL_INVALID_PHONE: "Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.",
        TERMINAL_PAIRING_ERROR: "Error requesting pairing code:",
        TERMINAL_PAIRING_FAILED: "Failed to get pairing code. Please check your phone number and try again.",
        TERMINAL_MESSAGE_ERROR: "❌ An error occurred while processing your message.",
        TERMINAL_GARBAGE_COLLECTION: "🧹 Garbage collection completed",
        TERMINAL_HIGH_RAM: "⚠️ RAM too high (>800MB), restarting bot...",
        TERMINAL_UPDATE_FILE: "Update",
        
        // Clear Commands
        CLEAR_MESSAGES: "Clearing bot messages...",
        CLEAR_ERROR: "An error occurred while clearing messages.",
        
        // Clear Session Commands  
        CLEARSESSION_OWNER_ONLY: "❌ This command can only be used by the owner!",
        CLEARSESSION_NOT_FOUND: "❌ Session directory not found!",
        CLEARSESSION_OPTIMIZING: "🔍 Optimizing session files for better performance...",
        CLEARSESSION_SUCCESS: "✅ Session files cleared successfully!",
        CLEARSESSION_STATS: "📊 Statistics:",
        CLEARSESSION_FILES_CLEARED: "• Total files cleared: {count}",
        CLEARSESSION_APP_STATE: "• App state sync files: {count}",
        CLEARSESSION_PRE_KEYS: "• Pre-key files: {count}",
        CLEARSESSION_ERRORS: "⚠️ Errors encountered: {count}",
        
        // Delete Commands
        DELETE_NEED_ADMIN: "I need to be an admin to delete messages.",
        DELETE_ADMIN_ONLY: "Only admins can use the .delete command.",
        DELETE_REPLY_TO_MESSAGE: "Please reply to a message you want to delete.",
        
        // TS (Transcription) Commands
        TS_TITLE: "🎤 *AUDIO/VIDEO TRANSCRIPTION*",
        TS_USAGE: "Usage: .ts [service] (reply to audio/video)",
        TS_SERVICES: "Available services:",
        TS_SERVICE_GROQ: "• groq - Groq AI Service (Recommended) ⭐",
        TS_SERVICE_WHISPER: "• whisper - OpenAI Whisper",
        TS_SERVICE_HF: "• hf - Hugging Face",
        TS_SERVICE_AUTO: "• auto - Automatic detection",
        TS_EXAMPLES: "Examples:",
        TS_EXAMPLE_1: ".ts (automatic service)",
        TS_EXAMPLE_2: ".ts groq (use Groq AI)",
        TS_EXAMPLE_3: ".ts whisper (use Whisper)",
        TS_NO_MEDIA: "❌ Reply to an audio or video message to transcribe it.",
        TS_PROCESSING: "🔄 Transcribing with {service}...",
        TS_SUCCESS: "🎤 *Transcription ({service}):*",
        TS_ERROR: "❌ Transcription failed with {service}. Trying another service...",
        TS_ALL_FAILED: "❌ All transcription services failed. Try with clearer audio.",
        TS_INVALID_SERVICE: "❌ Invalid service. Use: groq, whisper, hf, or auto",
        
        // Chatbot Messages
        CHATBOT_TITLE: "🤖 *CHATBOT CONFIGURATION*",
        CHATBOT_BASIC_COMMANDS: "*Basic Commands:*",
        CHATBOT_ON: "• .chatbot on - Enable chatbot",
        CHATBOT_OFF: "• .chatbot off - Disable chatbot in this group",
        CHATBOT_PERSONALITIES: "*Available Personalities:*",
        CHATBOT_FRIENDLY: "• .chatbot personality friendly - Friendly & helpful 😊",
        CHATBOT_SAVAGE: "• .chatbot personality savage - Sarcastic & brutal 😏",
        CHATBOT_FUNNY: "• .chatbot personality funny - Jokes & humor 😂",
        CHATBOT_SMART: "• .chatbot personality smart - Intelligent & serious 🤓",
        CHATBOT_FLIRTY: "• .chatbot personality flirty - Flirty & playful 😉",
        CHATBOT_MYSTERIOUS: "• .chatbot personality mysterious - Enigmatic & intriguing 🔮",
        CHATBOT_ENERGETIC: "• .chatbot personality energetic - Hyperactive & motivating ⚡",
        CHATBOT_OTHER_OPTIONS: "*Other Options:*",
        CHATBOT_STATUS: "• .chatbot status - Show current settings",
        CHATBOT_RESET: "• .chatbot reset - Reset to default personality",
        CHATBOT_LANGUAGE_NOTE: "*Language:* The bot adapts to your language automatically (French/English/Spanish)",
        CHATBOT_ENABLED: "*Chatbot has been enabled for this group* ✅",
        CHATBOT_DISABLED: "*Chatbot has been disabled for this group* ❌",
        CHATBOT_ALREADY_ENABLED: "*Chatbot is already enabled for this group* ℹ️",
        CHATBOT_ALREADY_DISABLED: "*Chatbot is already disabled for this group* ℹ️"
    },
    
    es: {
        // Bot Info
        BOT_NAME: "wabot",
        VERSION: "Versión",
        CHANNEL: "Canal",
        BY_AUTHOR: "por",
        
        // Help Menu
        HELP_TITLE: "🤖 Menú de Ayuda - wabot",
        HELP_DESC: "💡 Escribe .help <comando> para más información\n📋 Total de comandos: 100+\n\n🔗 Únete a nuestro canal de WhatsApp para actualizaciones",
        
        // Command Categories
        CAT_GENERAL: "🌐 Comandos Generales",
        CAT_ADMIN: "👮‍♂️ Comandos de Admin",
        CAT_OWNER: "🔒 Comandos de Propietario",
        CAT_IMAGE: "🎨 Comandos de Imagen/Sticker",
        CAT_GAMES: "🎮 Comandos de Juegos",
        CAT_AI: "🤖 Comandos de IA",
        CAT_FUN: "🎯 Comandos Divertidos",
        CAT_TEXT: "🔤 Generador de Texto",
        CAT_DOWNLOAD: "📥 Descargador",
        CAT_MISC: "🧩 Varios",
        CAT_ANIME: "🖼️ Anime",
        CAT_GITHUB: "💻 Comandos de GitHub",
        
        // Common Messages
        SUCCESS: "✅ Éxito",
        ERROR: "❌ Error",
        PROCESSING: "⏳ Procesando...",
        BOT_CONNECTED: "🤖 Bot conectado exitosamente!",
        COMMAND_NOT_FOUND: "❌ Comando no encontrado",
        PERMISSION_DENIED: "❌ Permiso denegado",
        ADMIN_ONLY: "❌ Este comando es solo para administradores del grupo",
        OWNER_ONLY: "❌ Este comando es solo para el propietario del bot",
        BOT_ADMIN_REQUIRED: "❌ El bot debe ser administrador para usar este comando",
        USER_NOT_FOUND: "❌ Usuario no encontrado. Menciona a un usuario o responde a su mensaje",
        PROVIDE_TEXT: "❌ Por favor proporciona texto después del comando",
        REPLY_TO_MESSAGE: "❌ Por favor responde a un mensaje",
        REPLY_TO_MEDIA: "❌ Por favor responde a una imagen o video",
        FAILED_TO_FETCH: "❌ No se pudo obtener datos. Inténtalo de nuevo más tarde",
        INVALID_URL: "❌ URL inválida",
        
        // Status Messages
        ONLINE: "En línea",
        OFFLINE: "Sin conexión",
        READY: "Listo",
        ENABLED: "Habilitado",
        DISABLED: "Deshabilitado",
        
        // Bot Features
        BOT_ALIVE_MESSAGE: "🤖 wabot está activo!\n\n*Versión:* {version}\n*Estado:* En línea\n*Modo:* Público\n\n*🌟 Características:*\n• Gestión de grupos\n• Protección anti-enlace\n• Comandos divertidos\n• ¡Y más!\n\nEscribe *.menu* para la lista completa de comandos",
        
        // Command specific messages
        AI_PROVIDE_QUESTION: "Por favor proporciona una pregunta después de .gpt o .gemini\n\nEjemplo: .gpt escribe un código HTML básico",
        JOKE_FAILED: "Lo siento, no pude obtener un chiste ahora mismo.",
        STICKER_REPLY_TO_MEDIA: "Por favor responde a una imagen o video con el comando .sticker para convertirlo",
        
        // Simage/Svideo Messages
        SIMAGE_REPLY_TO_STICKER: "Responde a un sticker con .simage para convertirlo a imagen",
        SIMAGE_ANIMATED_USE_SVIDEO: "¡Este sticker está animado! Usa .svideo para convertirlo a video",
        SIMAGE_SUCCESS: "¡Aquí está tu imagen extraída del sticker!",
        SIMAGE_ERROR: "Ocurrió un error al convertir a imagen",
        SVIDEO_REPLY_TO_STICKER: "Responde a un sticker animado con .svideo para convertirlo a video",
        SVIDEO_NOT_ANIMATED: "Este sticker no está animado. Usa .simage para stickers estáticos",
        SVIDEO_SUCCESS: "¡Aquí está tu video extraído del sticker animado!",
        SVIDEO_ERROR: "Ocurrió un error al convertir a video",
        SVIDEO_CONVERSION_FAILED: "Falló la conversión a video",
        
        // Roulette Messages
        ROULETTE_TITLE: "*Ruleta Rusa*",
        ROULETTE_TRIGGER: "dispara la pistola...",
        ROULETTE_SAFE_1: "¡Clic... Estás a salvo!",
        ROULETTE_SAFE_2: "¡Clic... No pasa nada!",
        ROULETTE_SAFE_3: "¡Clic... Tienes suerte!",
        ROULETTE_SAFE_4: "¡Clic... Cámara vacía!",
        ROULETTE_SAFE_5: "¡Clic... Sobrevives!",
        ROULETTE_DEATH: "¡BANG! 💀 Estás muerto!",
        ROULETTE_RIP: "⚰️ Descansa en paz...",
        MENTION_USER_TO_BAN: "¡Por favor menciona al usuario o responde a su mensaje para banearlo!",
        MENTION_USER_TO_ANALYZE: "¡Por favor menciona a alguien o responde a su mensaje para analizar su carácter!",
        
        // Chatbot Messages
        CHATBOT_TITLE: "🤖 *CONFIGURACIÓN CHATBOT*",
        CHATBOT_BASIC_COMMANDS: "*Comandos básicos:*",
        CHATBOT_ON: "• .chatbot on - Activar chatbot",
        CHATBOT_OFF: "• .chatbot off - Desactivar chatbot en este grupo",
        CHATBOT_PERSONALITIES: "*Personalidades disponibles:*",
        CHATBOT_FRIENDLY: "• .chatbot personality amistoso - Amistoso y servicial 😊",
        CHATBOT_SAVAGE: "• .chatbot personality salvaje - Sarcástico y brutal 😏",
        CHATBOT_FUNNY: "• .chatbot personality gracioso - Chistes y humor 😂",
        CHATBOT_SMART: "• .chatbot personality inteligente - Inteligente y serio 🤓",
        CHATBOT_FLIRTY: "• .chatbot personality coqueto - Coqueto y juguetón 😉",
        CHATBOT_MYSTERIOUS: "• .chatbot personality misterioso - Enigmático e intrigante 🔮",
        CHATBOT_ENERGETIC: "• .chatbot personality energético - Hiperactivo y motivador ⚡",
        CHATBOT_OTHER_OPTIONS: "*Otras opciones:*",
        CHATBOT_STATUS: "• .chatbot status - Mostrar configuración actual",
        CHATBOT_RESET: "• .chatbot reset - Restablecer a personalidad predeterminada",
        CHATBOT_LANGUAGE_NOTE: "*Idioma:* El bot se adapta automáticamente a tu idioma (Francés/Inglés/Español)",
        CHATBOT_ENABLED: "*El chatbot ha sido activado para este grupo* ✅",
        CHATBOT_DISABLED: "*El chatbot ha sido desactivado para este grupo* ❌",
        CHATBOT_ALREADY_ENABLED: "*El chatbot ya está activado para este grupo* ℹ️",
        CHATBOT_ALREADY_DISABLED: "*El chatbot ya está desactivado para este grupo* ℹ️",
        MENTION_USER_TO_COMPLIMENT: "¡Por favor menciona a alguien o responde a su mensaje para elogiarlo!",
        ASK_QUESTION_8BALL: "¡Por favor haz una pregunta!",
        PROVIDE_SONG_NAME: "🔍 ¡Por favor ingresa el nombre de la canción para obtener la letra! Uso: *lyrics <nombre de canción>*",
        
        // TikTok Messages
        TIKTOK_PROVIDE_LINK: "Por favor proporciona un enlace de TikTok para el video.",
        TIKTOK_INVALID_LINK: "Ese no es un enlace válido de TikTok. Por favor proporciona un enlace válido de video de TikTok.",
        
        // Sticker Tutorial
        STICKER_TUTORIAL_TITLE: "*🎯 COMANDO STICKER OPTIMIZADO*",
        STICKER_TUTORIAL_BASIC: "*Uso básico:*\n• *.sticker* - Convierte imagen/video a sticker\n• *.s* - Atajo para sticker",
        STICKER_TUTORIAL_VIDEO: "*Opciones para videos:*\n• *.sticker pack:nombre* - Cambiar nombre del pack (predeterminado: wabot)\n• *.sticker author:nombre* - Cambiar autor\n• *.sticker duration:6* - Limitar a 6 segundos (máx 8s para WhatsApp)\n• *.sticker time:5-10* - Tomar de 5s a 10s del video\n• *.sticker fps:12* - Cambiar FPS (predeterminado: 12, máx 15)",
        STICKER_TUTORIAL_SPECS: "*Especificaciones de WhatsApp:*\n• Tamaño: exactamente 512x512px\n• Imágenes: ≤100KB, Videos: ≤500KB\n• Videos: máx 8 segundos, mín 8ms por frame\n• Formato: solo WebP",
        STICKER_TUTORIAL_EXAMPLE: "*Ejemplo:*\n*.sticker pack:Memes duration:4 fps:10*",
        
        // Help Menu Content
        HELP_AVAILABLE_COMMANDS: "*Comandos Disponibles:*",
        HELP_GENERAL_SECTION: "🌐 *Comandos Generales*",
        HELP_ADMIN_SECTION: "👮‍♂️ *Comandos de Admin*",
        HELP_OWNER_SECTION: "🔒 *Comandos de Propietario*",
        HELP_IMAGE_SECTION: "🎨 *Comandos de Imagen/Sticker*",
        HELP_GAMES_SECTION: "🎮 *Comandos de Juegos*",
        HELP_AI_SECTION: "🤖 *Comandos de IA*",
        HELP_FUN_SECTION: "🎯 *Comandos Divertidos*",
        HELP_DOWNLOAD_SECTION: "📥 *Comandos de Descarga*",
        HELP_TEXT_SECTION: "🔤 *Generador de Texto*",
        HELP_FOOTER: "Usa '.help <comando>' para ayuda específica.\nEjemplo: .help play, .help sticker",
        HELP_CHANNEL: "Únete a nuestro canal",
        
        // TTS Messages
        TTS_USAGE: "╭─────────────────────────────╮\n│ 🎆 ✨ TEXT-TO-SPEECH PRO ✨ │\n╰─────────────────────────────╯\n\n🚀 *UTILISATION RAPIDE:*\n┌─ *.tts votre texte* - Groq (défaut)\n└─ *.tts fournisseur langue voix texte* - Complet\n\n════════════════════════════════\n🎯 *FOURNISSEURS DISPONIBLES* 🎯\n════════════════════════════════\n\n🔥 *GROQ AI* *(DÉFAUT - RECOMMANDÉ)*\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n┃ ⚡ VITESSE: Ultra rapide        ┃\n┃ 🌟 QUALITÉ: Excellente          ┃\n┃ 💰 COÛT: Gratuit                ┃\n┃ 🎭 VOIX: 6 voix naturelles      ┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n🌍 *GOOGLE TTS* *(FIABLE)*\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🌐 LANGUES: 16+ langues         ┃\n┃ 👍 QUALITÉ: Bonne               ┃\n┃ ⚙️ OPTIONS: Voix lente/rapide   ┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n💎 *ELEVENLABS* *(PREMIUM)*\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🏆 QUALITÉ: Professionnelle     ┃\n┃ 🎨 VOIX: 9 voix ultra-réalistes ┃\n┃ 🔊 SON: Haute définition        ┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n🔄 *MODE AUTO* *(INTELLIGENT)*\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🤖 ESSAIE: Tous les fournisseurs┃\n┃ ✅ GARANTIE: Toujours un résultat┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n═══════════════════════════════════\n📖 *TUTORIEL GROQ (DÉTAILLÉ)* 📖\n═══════════════════════════════════\n\n🎯 *SYNTAXE GROQ:*\n• *.tts texte* - Voix par défaut (Fritz-PlayAI)\n• *.tts groq texte* - Explicite\n• *.tts groq fr Celeste-PlayAI texte* - Complet\n\n🎭 *VOIX DISPONIBLES:*\n┌─ 🔸 Fritz-PlayAI - Voix équilibrée (défaut)\n├─ 🔹 Atlas-PlayAI - Voix masculine énergique\n├─ 🔸 Calum-PlayAI - Voix douce et claire\n├─ 🔹 Celeste-PlayAI - Voix féminine élégante\n├─ 🔸 Cheyenne-PlayAI - Voix moderne\n└─ 🔹 Deedee-PlayAI - Voix expressive\n\n🎨 *EXEMPLES GROQ:*\n• .tts Bonjour le monde!\n• .tts groq fr nova Salut, ça va ?\n• .tts groq en echo Voix masculine profonde\n• .tts groq fr fable Voix féminine douce\n\n═════════════════════════════════\n🌐 *OPTIONS PAR FOURNISSEUR* 🌐\n═════════════════════════════════\n\n🤖 *GROQ OPTIONS:*\n• Syntaxe: .tts groq [langue] [voix] texte\n• Voix: alloy, echo, fable, onyx, nova, shimmer\n• Qualité: HD automatique\n• Vitesse: Optimale\n\n🌎 *GOOGLE TTS OPTIONS:*\n• Syntaxe: .tts gtts [langue] [option] texte\n• Options: slow (lent), fast (rapide)\n• Langues: fr, en, es, de, it, pt, ru, ja, ko, zh\n• Exemple: .tts gtts fr slow Parlez lentement\n\n💎 *ELEVENLABS OPTIONS:*\n• Syntaxe: .tts elevenlabs [langue] [voix] texte\n• Voix premium: rachel, domi, bella, antoni\n• Voix standard: elli, josh, arnold, adam, sam\n• Exemple: .tts elevenlabs en rachel Voix premium\n\n🔄 *MODE AUTO:*\n• Syntaxe: .tts auto [langue] texte\n• Ordre: Groq --> Google --> ElevenLabs\n• Idéal pour garantir un résultat\n\n═══════════════════════════════\n🌍 *LANGUES SUPPORTÉES* 🌍\n═══════════════════════════════\nfr 🇫🇷 | en 🇺🇸 | es 🇪🇸 | de 🇩🇪 | it 🇮🇹 | pt 🇵🇹\nru 🇷🇺 | ja 🇯🇵 | ko 🇰🇷 | zh 🇨🇳 | ar 🇸🇦 | hi 🇮🇳\ntr 🇹🇷 | nl 🇳🇱 | pl 🇵🇱 | sv 🇸🇪\n\n════════════════════════════════\n📚 *EXEMPLES PRATIQUES* 📚\n════════════════════════════════\n\n🎯 *Usage simple:*\n.tts Bienvenue sur WhatsApp!\n\n🎯 *Groq avec voix:*\n.tts groq fr nova Salut, comment allez-vous?\n\n🎯 *Google TTS lent:*\n.tts gtts fr slow Prononciation claire\n\n🎯 *ElevenLabs premium:*\n.tts elevenlabs en rachel Message professionnel\n\n🎯 *Mode automatique:*\n.tts auto fr Test de tous les fournisseurs\n\n💡 *ASTUCE PRINCIPALE:*\n🔥 Groq est sélectionné par défaut pour sa rapidité et sa qualité exceptionnelle!",
        TTS_NO_TEXT: "❌ Por favor proporciona texto para convertir a audio.",
        TTS_TEXT_TOO_LONG: "❌ Texto demasiado largo. Máximo 4000 caracteres.",
        TTS_PROCESSING: "🔊 Generando audio...",
        TTS_TRYING_PROVIDER: "🔊 Probando {provider}...",
        TTS_SUCCESS: "✅ Audio generado con {provider}",
        TTS_ALL_FAILED: "❌ Todos los proveedores TTS fallaron. Inténtalo más tarde.",
        TTS_ERROR: "❌ Error al generar audio. Inténtalo de nuevo.",
        
        // Transcription Messages
        TRANSCRIBE_USAGE: "🎤 *Transcripción de Audio/Video*\n\nResponde a un mensaje de audio o video con *.transcribe* para convertirlo a texto\n\nFormatos soportados:\n• Mensajes de audio\n• Notas de voz\n• Videos con audio\n\nEjemplo:\n*Responder a audio* --> .transcribe",
        TRANSCRIBE_NO_MEDIA: "❌ Por favor responde a un mensaje de audio o video para transcribirlo.",
        TRANSCRIBE_PROCESSING: "🔄 Transcribiendo audio a texto... Por favor espera.",
        TRANSCRIBE_SUCCESS: "🎤 *Transcripción de Audio:*",
        TRANSCRIBE_ERROR: "❌ Lo siento, no pude transcribir el audio. El audio podría no estar claro o el servicio temporalmente no disponible.\n\n💡 Intenta con una grabación de audio más clara.",
        
        // Terminal Messages - Spanish
        TERMINAL_PHONE_PROMPT: "Por favor escribe tu número de WhatsApp 😍\nFormato: 242065491040730 (sin + o espacios) : ",
        TERMINAL_PAIRING_CODE: "Tu Código de Emparejamiento : ",
        TERMINAL_PAIRING_INSTRUCTIONS: "\nPor favor ingresa este código en tu aplicación de WhatsApp:\n1. Abre WhatsApp\n2. Ve a Configuración > Dispositivos Vinculados\n3. Toca \"Vincular un Dispositivo\"\n4. Ingresa el código mostrado arriba",
        TERMINAL_CONNECTED: "Conectado a =>",
        TERMINAL_BOT_CONNECTED: "¡Bot Conectado Exitosamente!",
        TERMINAL_YT_CHANNEL: "CANAL YT: equipo wabot",
        TERMINAL_GITHUB: "GITHUB: wabot",
        TERMINAL_WA_NUMBER: "NÚMERO WA",
        TERMINAL_CREDIT: "CRÉDITO: equipo wabot",
        TERMINAL_SESSION_LOGGED_OUT: "Sesión cerrada. Por favor reautentícate.",
        TERMINAL_INVALID_PHONE: "Número de teléfono inválido. Por favor ingresa tu número internacional completo (ej: 15551234567 para US, 447911123456 para UK, etc.) sin + o espacios.",
        TERMINAL_PAIRING_ERROR: "Error solicitando código de emparejamiento:",
        TERMINAL_PAIRING_FAILED: "Fallo al obtener código de emparejamiento. Por favor verifica tu número de teléfono y trata de nuevo.",
        TERMINAL_MESSAGE_ERROR: "❌ Ocurrió un error al procesar tu mensaje.",
        TERMINAL_GARBAGE_COLLECTION: "🧹 Recolección de basura completada",
        TERMINAL_HIGH_RAM: "⚠️ RAM muy alta (>800MB), reiniciando bot...",
        TERMINAL_UPDATE_FILE: "Actualización",
        
        // Clear Commands
        CLEAR_MESSAGES: "Limpiando mensajes del bot...",
        CLEAR_ERROR: "Ocurrió un error al limpiar mensajes.",
        
        // Clear Session Commands  
        CLEARSESSION_OWNER_ONLY: "❌ ¡Este comando solo puede ser usado por el propietario!",
        CLEARSESSION_NOT_FOUND: "❌ ¡Directorio de sesión no encontrado!",
        CLEARSESSION_OPTIMIZING: "🔍 Optimizando archivos de sesión para mejor rendimiento...",
        CLEARSESSION_SUCCESS: "✅ ¡Archivos de sesión limpiados exitosamente!",
        CLEARSESSION_STATS: "📊 Estadísticas:",
        CLEARSESSION_FILES_CLEARED: "• Total de archivos limpiados: {count}",
        CLEARSESSION_APP_STATE: "• Archivos de sincronización de estado de app: {count}",
        CLEARSESSION_PRE_KEYS: "• Archivos de pre-claves: {count}",
        CLEARSESSION_ERRORS: "⚠️ Errores encontrados: {count}",
        
        // Delete Commands
        DELETE_NEED_ADMIN: "Necesito ser administrador para eliminar mensajes.",
        DELETE_ADMIN_ONLY: "Solo los administradores pueden usar el comando .delete.",
        DELETE_REPLY_TO_MESSAGE: "Por favor responde a un mensaje que quieras eliminar.",
        
        // TS (Transcription) Commands
        TS_TITLE: "🎤 *TRANSCRIPCIÓN AUDIO/VIDEO*",
        TS_USAGE: "Uso: .ts [servicio] (responder a audio/video)",
        TS_SERVICES: "Servicios disponibles:",
        TS_SERVICE_GROQ: "• groq - Servicio Groq AI (Recomendado) ⭐",
        TS_SERVICE_WHISPER: "• whisper - OpenAI Whisper",
        TS_SERVICE_HF: "• hf - Hugging Face",
        TS_SERVICE_AUTO: "• auto - Detección automática",
        TS_EXAMPLES: "Ejemplos:",
        TS_EXAMPLE_1: ".ts (servicio automático)",
        TS_EXAMPLE_2: ".ts groq (usar Groq AI)",
        TS_EXAMPLE_3: ".ts whisper (usar Whisper)",
        TS_NO_MEDIA: "❌ Responde a un mensaje de audio o video para transcribirlo.",
        TS_PROCESSING: "🔄 Transcribiendo con {service}...",
        TS_SUCCESS: "🎤 *Transcripción ({service}):*",
        TS_ERROR: "❌ Transcripción falló con {service}. Intentando otro servicio...",
        TS_ALL_FAILED: "❌ Todos los servicios de transcripción fallaron. Intenta con audio más claro.",
        TS_INVALID_SERVICE: "❌ Servicio inválido. Usa: groq, whisper, hf, o auto"
    }
};

// Default language
const DEFAULT_LANGUAGE = 'fr';


// Cache local pour getUserLanguage (éviter DB calls répétés)
const userLanguageCache = new Map();

/**
 * Get text in user's language - SYNCHRONE pour éviter [object Promise]
 * @param {string} userId - User ID
 * @param {string} key - Translation key
 * @param {string} fallbackLang - Fallback language
 * @param {Object} replacements - Object with replacements for placeholders
 * @returns {string} Translated text
 */
function getText(userId, key, fallbackLang = DEFAULT_LANGUAGE, replacements = {}) {
    // Utiliser cache local ou fallback direct pour être synchrone
    let userLang = userLanguageCache.get(userId) || fallbackLang;
    
    let text = null;
    
    // Try user language first
    if (languages[userLang] && languages[userLang][key]) {
        text = languages[userLang][key];
    }
    // Try fallback language
    else if (languages[fallbackLang] && languages[fallbackLang][key]) {
        text = languages[fallbackLang][key];
    }
    // Return key if no translation found
    else {
        text = key;
    }
    
    // Replace placeholders with actual values
    if (text && replacements) {
        Object.keys(replacements).forEach(placeholder => {
            text = text.replace(`{${placeholder}}`, replacements[placeholder]);
        });
    }
    
    return text;
}

/**
 * Set user language
 * @param {string} userId - User ID
 * @param {string} language - Language code
 */
async function setUserLanguage(userId, language) {
    if (languages[language]) {
        try {
            const success = await db.setUserLanguage(userId, language);
            if (success) {
                console.log(`🌐 User ${userId} language set to: ${language}`);
                return true;
            }
        } catch (error) {
            console.error('Error setting user language:', error);
        }
    }
    return false;
}

/**
 * Get user language - VERSION SYNCHRONE avec cache
 * @param {string} userId - User ID
 * @returns {string} Language code
 */
function getUserLanguage(userId) {
    // Retourner depuis cache local ou default
    return userLanguageCache.get(userId) || DEFAULT_LANGUAGE;
}

/**
 * Get user language - VERSION ASYNCHRONE pour mise à jour cache
 * @param {string} userId - User ID
 * @returns {Promise<string>} Language code
 */
async function getUserLanguageAsync(userId) {
    try {
        const language = await db.getUserLanguage(userId);
        const finalLang = language || DEFAULT_LANGUAGE;
        // Mettre à jour le cache
        userLanguageCache.set(userId, finalLang);
        return finalLang;
    } catch (error) {
        console.error('Error getting user language:', error);
        const defaultLang = DEFAULT_LANGUAGE;
        userLanguageCache.set(userId, defaultLang);
        return defaultLang;
    }
}

/**
 * Get available languages
 * @returns {Array} Array of available language codes
 */
function getAvailableLanguages() {
    return Object.keys(languages);
}

/**
 * Get command mapping for user's language
 * @param {string} userId - User ID
 * @param {string} command - Original command
 * @returns {string} Mapped command for user's language
 */
async function getLocalizedCommand(userId, command) {
    const userLang = await getUserLanguage(userId);
    
    // Remove the dot prefix if present
    const cleanCommand = command.startsWith('.') ? command.slice(1) : command;
    
    // Check if the command exists in the mapping for the user's language
    if (commandMappings[userLang] && commandMappings[userLang][cleanCommand]) {
        return commandMappings[userLang][cleanCommand];
    }
    
    // Return original command if no mapping found
    return cleanCommand;
}

/**
 * Get reverse command mapping (from localized to English)
 * @param {string} userId - User ID
 * @param {string} localCommand - Localized command
 * @returns {string} English command
 */
async function getEnglishCommand(userId, localCommand) {
    const userLang = await getUserLanguage(userId);
    
    // Remove the dot prefix if present
    const cleanCommand = localCommand.startsWith('.') ? localCommand.slice(1) : localCommand;
    
    // For English users, return as is
    if (userLang === 'en') {
        return cleanCommand;
    }
    
    // Look for the reverse mapping
    const englishMappings = commandMappings.en;
    if (englishMappings && englishMappings[cleanCommand]) {
        return englishMappings[cleanCommand];
    }
    
    // Return original if no mapping found
    return cleanCommand;
}

/**
 * Auto-detect language from text (simple implementation)
 * @param {string} text - Text to analyze
 * @returns {string} Detected language code
 */
function detectLanguage(text) {
    if (!text) return DEFAULT_LANGUAGE;
    
    // Simple detection based on common words
    const frenchWords = ['bonjour', 'salut', 'merci', 'oui', 'non', 'comment', 'quoi', 'qui', 'où', 'pourquoi', 'blague', 'fait', 'citation'];
    const englishWords = ['hello', 'hi', 'thanks', 'yes', 'no', 'how', 'what', 'who', 'where', 'why', 'joke', 'fact', 'quote'];
    const spanishWords = ['hola', 'gracias', 'sí', 'no', 'cómo', 'qué', 'quién', 'dónde', 'por qué', 'chiste', 'dato', 'cita'];
    
    const lowerText = text.toLowerCase();
    
    let frenchScore = 0;
    let englishScore = 0;
    let spanishScore = 0;
    
    frenchWords.forEach(word => {
        if (lowerText.includes(word)) frenchScore++;
    });
    
    englishWords.forEach(word => {
        if (lowerText.includes(word)) englishScore++;
    });
    
    spanishWords.forEach(word => {
        if (lowerText.includes(word)) spanishScore++;
    });
    
    if (frenchScore > englishScore && frenchScore > spanishScore) return 'fr';
    if (spanishScore > englishScore && spanishScore > frenchScore) return 'es';
    return 'en'; // Default to English
}

module.exports = {
    languages,
    commandMappings,
    DEFAULT_LANGUAGE,
    getText,
    setUserLanguage,
    getUserLanguage,
    getUserLanguageAsync, // Version async pour mise à jour cache
    getAvailableLanguages,
    detectLanguage,
    getLocalizedCommand,
    getEnglishCommand,
    userLanguageCache // Pour debug et initialisation
};