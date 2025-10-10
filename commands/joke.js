const axios = require('axios');
const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

// JokeAPI supporte le multilinguisme (fr, en, es)
const JOKEAPI_URL = 'https://v2.jokeapi.dev/joke';

// Blagues statiques par langue en cas d'échec d'API
const staticJokes = {
    fr: [
        "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ? Parce que sinon, ils tombent dans le bateau ! 😂",
        "Qu'est-ce qui est jaune et qui attend ? Jonathan ! 🍌",
        "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-mallow ! 😸",
        "Que dit un escargot quand il croise une limace ? Regarde le nudiste ! 🐌",
        "Pourquoi les poissons n'aiment pas jouer au tennis ? Parce qu'ils ont peur du filet ! 🎾",
        "Comment appelle-t-on un boomerang qui ne revient pas ? Un bâton ! 🪃",
        "Qu'est-ce qui est transparent et qui sent la carotte ? Un pet de lapin ! 🐰",
        "Pourquoi les plongeurs ne plongent jamais en avant ? Parce que sinon ils tombent dans le bateau ! 🚤"
    ],
    en: [
        "Why don't scientists trust atoms? Because they make up everything! ⚙️",
        "Why did the scarecrow win an award? Because he was outstanding in his field! 🌾",
        "What do you call a fake noodle? An impasta! 🍝",
        "Why don't eggs tell jokes? They'd crack each other up! 🥚",
        "What's the best thing about Switzerland? I don't know, but the flag is a big plus! 🇨🇭",
        "Why did the math book look so sad? Because it had too many problems! 📚",
        "What do you call a sleeping bull? A bulldozer! 😴",
        "Why don't skeletons fight each other? They don't have the guts! 💀"
    ],
    es: [
        "¿Por qué los buzos siempre se tiran hacia atrás? Porque si se tiran hacia adelante, caen en el bote! 😂",
        "¿Cómo se llama el campeón de buceo japonés? Tokofondo! 🏌️",
        "¿Qué le dijo una iguana a su hermana gemela? Somos iguanitas! 🦎",
        "¿Por qué los peces no pagan impuestos? Porque viven en cardumen! 🐠",
        "¿Cómo se despiden los químicos? Ácido un placer! 🧪",
        "¿Qué hace una abeja en el gimnasio? Zum-ba! 🐝",
        "¿Cómo se llama el primo vegetariano de Bruce Lee? Broco-Lee! 🥦",
        "¿Por qué los pájaros vuelan hacia el sur en invierno? Porque caminando tardarían mucho! 🐦"
    ]
};

module.exports = async function (sock, chatId, senderId, args = []) {
    try {
        const userLang = getUserLanguage(senderId);
        const category = args[0]?.toLowerCase() || 'any';
        let joke = null;

        // Usage message if help requested
        if (category === 'help' || category === 'aide') {
            const usageMsg = userLang === 'fr' 
                ? `🎭 **Commande .joke**\n\n*Usage:*\n• \`.joke\` - Blague aléatoire\n• \`.joke dark\` - Humour noir\n• \`.joke programming\` - Blagues de programmation\n• \`.joke divers\` - Blagues diverses\n• \`.joke pun\` - Jeux de mots\n• \`.joke christmas\` - Blagues de Noël\n\n*Langues supportées:* Français, Anglais, Espagnol, Allemand, Portugais, Tchèque\n\n*Exemple:* \`.joke dark\``
                : `🎭 **Joke Command**\n\n*Usage:*\n• \`.joke\` - Random joke\n• \`.joke dark\` - Dark humor\n• \`.joke programming\` - Programming jokes\n• \`.joke miscellaneous\` - Various jokes\n• \`.joke pun\` - Puns and wordplay\n• \`.joke christmas\` - Christmas jokes\n\n*Languages supported:* French, English, Spanish, German, Portuguese, Czech\n\n*Example:* \`.joke dark\``;
            
            await sock.sendMessage(chatId, { text: usageMsg });
            return;
        }

        // Paramètres de blagues selon la demande utilisateur (étendu)
        const categoryMapping = {
            'humour-noir': 'Dark',
            'noir': 'Dark', 
            'dark': 'Dark',
            'sombre': 'Dark',
            'programmation': 'Programming',
            'programming': 'Programming',
            'code': 'Programming',
            'informatique': 'Programming',
            'miscellaneous': 'Misc',
            'divers': 'Misc',
            'various': 'Misc',
            'pun': 'Pun',
            'jeux-de-mots': 'Pun',
            'wordplay': 'Pun',
            'christmas': 'Christmas',
            'noel': 'Christmas',
            'noël': 'Christmas',
            'spooky': 'Spooky',
            'effrayant': 'Spooky',
            'any': 'Any',
            'tous': 'Any',
            'all': 'Any'
        };

        const jokeCategory = categoryMapping[category] || 'Any';
        // Support pour plus de langues via JokeAPI v2
        const langMapping = {
            'fr': 'fr',
            'es': 'es', 
            'de': 'de',
            'pt': 'pt',
            'cs': 'cs',
            'en': 'en'
        };
        const langCode = langMapping[userLang] || 'en';

        // Essayer JokeAPI d'abord (supporte multilingue)
        try {
            let apiUrl = `${JOKEAPI_URL}/${jokeCategory}?lang=${langCode}&type=single,twopart`;
            
            // Filtres de sécurité selon les préférences
            if (!['humour-noir', 'noir', 'dark', 'sombre'].includes(category)) {
                apiUrl += '&blacklistFlags=nsfw,religious,political,racist,sexist,explicit';
            }

            const response = await axios.get(apiUrl, {
                timeout: 8000,
                headers: {
                    'User-Agent': 'wabot/4.3 (WhatsApp Bot)'
                }
            });

            if (response.data && !response.data.error) {
                if (response.data.type === 'single') {
                    joke = response.data.joke;
                } else {
                    joke = `${response.data.setup}\n\n${response.data.delivery}`;
                }
            }
        } catch (apiError) {
            console.log('JokeAPI failed, using static jokes:', apiError.message);
        }

        // Fallback vers les blagues statiques si l'API échoue
        if (!joke) {
            const langJokes = staticJokes[userLang] || staticJokes.en;
            joke = langJokes[Math.floor(Math.random() * langJokes.length)];
        }

        if (joke) {
            // Ajouter un émoji selon la catégorie
            const categoryEmojis = {
                'Dark': '🖤',
                'Programming': '💻', 
                'Misc': '🎭',
                'Pun': '🎯',
                'Christmas': '🎄',
                'Spooky': '👻',
                'Any': '😂'
            };
            const emoji = categoryEmojis[jokeCategory] || '😂';
            
            const formattedJoke = `${emoji} ${joke}`;
            await sock.sendMessage(chatId, { text: formattedJoke });
        } else {
            throw new Error('No joke available');
        }
    } catch (error) {
        console.error('Error in joke command:', error);
        const errorMsg = i18n.t(senderId, 'responses.joke_failed') || 'Error getting joke, please try again.';
        await sock.sendMessage(chatId, { text: errorMsg });
    }
};