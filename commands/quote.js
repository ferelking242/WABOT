const axios = require('axios');
const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

// API externe pour les citations multilingues
const QUOTABLE_API = 'https://quotable.io/random';
const MYMEMORY_TRANSLATE_API = 'https://api.mymemory.translated.net/get';

// Fonction pour traduire du texte avec MyMemory API (gratuit)
async function translateText(text, fromLang, toLang) {
    try {
        if (fromLang === toLang) return text;
        
        const response = await axios.get(MYMEMORY_TRANSLATE_API, {
            params: {
                q: text,
                langpair: `${fromLang}|${toLang}`
            },
            timeout: 8000
        });
        
        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            return response.data.responseData.translatedText;
        }
        
        return text; // Retourner le texte original si la traduction échoue
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.log('Translation failed:', error.message);
        return text; // Retourner le texte original si la traduction échoue
    }
}

// Citations statiques par type et par langue
const staticQuotes = {
    fr: {
        motivant: [
            "🔥 \"Le succès, c'est tomber sept fois et se relever huit fois.\" - Proverbe japonais",
            "✨ \"La seule façon d'échouer, c'est d'abandonner.\" - Napoleon Hill",
            "🎯 \"Vos seules limites sont celles que vous acceptez.\" - Wayne Dyer",
            "🚀 \"L'avenir appartient à ceux qui croient à la beauté de leurs rêves.\" - Eleanor Roosevelt",
            "🏆 \"Le talent gagne des matchs, mais le travail d'équipe gagne des championnats.\" - Michael Jordan"
        ],
        biblique: [
            "🙏 \"Je peux tout par celui qui me fortifie.\" - Philippiens 4:13",
            "❤️ \"Car Dieu a tant aimé le monde qu'il a donné son Fils unique.\" - Jean 3:16",
            "🌅 \"Cherchez d'abord le royaume de Dieu et sa justice.\" - Matthieu 6:33",
            "🙌 \"L'Éternel combattra pour vous; vous, gardez le silence.\" - Exode 14:14",
            "🕯️ \"Ta parole est une lampe à mes pieds et une lumière sur mon sentier.\" - Psaume 119:105"
        ],
        philosophique: [
            "🤔 \"Je pense, donc je suis.\" - René Descartes",
            "🌍 \"Soyez le changement que vous voulez voir dans le monde.\" - Gandhi",
            "📚 \"La seule vraie sagesse est de savoir que vous ne savez rien.\" - Socrate",
            "🥰 \"Le bonheur n'est pas quelque chose de tout fait. Il vient de vos propres actions.\" - Dalaï Lama",
            "🌱 \"Hier est histoire, demain est un mystère, aujourd'hui est un cadeau.\" - Eleanor Roosevelt"
        ],
        amour: [
            "💕 \"Aimer, ce n'est pas se regarder l'un l'autre, c'est regarder ensemble dans la même direction.\" - Antoine de Saint-Exupéry",
            "❤️ \"L'amour ne consiste pas à se regarder l'un l'autre, mais à regarder ensemble vers la même direction.\" - Antoine de Saint-Exupéry",
            "🌹 \"Aime et fais ce que tu veux.\" - Saint Augustin",
            "💖 \"L'amour est la poésie des sens.\" - Honoré de Balzac",
            "💘 \"On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.\" - Antoine de Saint-Exupéry"
        ],
        sagesse: [
            "🧿 \"La sagesse, c'est d'avoir des rêves suffisamment grands pour ne pas les perdre de vue.\" - Oscar Wilde",
            "🌿 \"La patience est un arbre dont la racine est amère, mais dont les fruits sont très doux.\" - Proverbe persan",
            "💫 \"Il vaut mieux allumer une chandelle que de maudire l'obscurité.\" - Proverbe chinois",
            "🌊 \"Soyez comme l'eau : fluide, adaptable, mais d'une force redoutable.\" - Bruce Lee",
            "🌺 \"Dans le jardin de la mémoire, dans le palais du rêve, c'est là que tu me trouveras.\" - Alice au pays des merveilles"
        ],
        succes: [
            "🏆 \"Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme.\" - Winston Churchill",
            "🚀 \"Le succès n'est pas final, l'échec n'est pas fatal : c'est le courage de continuer qui compte.\" - Winston Churchill",
            "✨ \"Les opportunités ne se présentent pas. Vous les créez.\" - Chris Grosser",
            "🎯 \"Ne laissez pas ce que vous ne pouvez pas faire interférer avec ce que vous pouvez faire.\" - John Wooden",
            "💪 \"La discipline est le pont entre les objectifs et l'accomplissement.\" - Jim Rohn"
        ]
    },
    en: {
        motivational: [
            "🔥 \"Success is falling seven times and getting up eight times.\" - Japanese Proverb",
            "✨ \"The only way to fail is to quit.\" - Napoleon Hill",
            "🎯 \"Your only limits are the ones you accept.\" - Wayne Dyer",
            "🚀 \"The future belongs to those who believe in the beauty of their dreams.\" - Eleanor Roosevelt",
            "🏆 \"Talent wins games, but teamwork wins championships.\" - Michael Jordan"
        ],
        biblical: [
            "🙏 \"I can do all things through Christ who strengthens me.\" - Philippians 4:13",
            "❤️ \"For God so loved the world that he gave his one and only Son.\" - John 3:16",
            "🌅 \"But seek first his kingdom and his righteousness.\" - Matthew 6:33",
            "🙌 \"The Lord will fight for you; you need only to be still.\" - Exodus 14:14",
            "🕯️ \"Your word is a lamp for my feet, a light on my path.\" - Psalm 119:105"
        ],
        philosophical: [
            "🤔 \"I think, therefore I am.\" - René Descartes",
            "🌍 \"Be the change you wish to see in the world.\" - Gandhi",
            "📚 \"The only true wisdom is knowing you know nothing.\" - Socrates",
            "🥰 \"Happiness is not something ready made. It comes from your own actions.\" - Dalai Lama",
            "🌱 \"Yesterday is history, tomorrow is a mystery, today is a gift.\" - Eleanor Roosevelt"
        ],
        love: [
            "💕 \"Being deeply loved by someone gives you strength, while loving someone deeply gives you courage.\" - Lao Tzu",
            "❤️ \"Love is not about how many days, months, or years you have been together.\" - Unknown",
            "🌹 \"The best thing to hold onto in life is each other.\" - Audrey Hepburn",
            "💖 \"Love is the poetry of the senses.\" - Honoré de Balzac",
            "💘 \"You know you're in love when you can't fall asleep because reality is finally better than your dreams.\" - Dr. Seuss"
        ],
        wisdom: [
            "🧿 \"Wisdom is having dreams big enough not to lose sight of them.\" - Oscar Wilde",
            "🌿 \"Patience is a tree whose root is bitter, but whose fruit is very sweet.\" - Persian Proverb",
            "💫 \"It is better to light a candle than to curse the darkness.\" - Chinese Proverb",
            "🌊 \"Be like water: fluid, adaptable, but tremendously powerful.\" - Bruce Lee",
            "🌺 \"In the garden of memory, in the palace of dreams, that is where you will find me.\" - Alice in Wonderland"
        ],
        success: [
            "🏆 \"Success is going from failure to failure without losing your enthusiasm.\" - Winston Churchill",
            "🚀 \"Success is not final, failure is not fatal: it is the courage to continue that counts.\" - Winston Churchill",
            "✨ \"Opportunities don't happen. You create them.\" - Chris Grosser",
            "🎯 \"Don't let what you cannot do interfere with what you can do.\" - John Wooden",
            "💪 \"Discipline is the bridge between goals and accomplishment.\" - Jim Rohn"
        ]
    }
};

module.exports = async function quoteCommand(sock, chatId, senderId, args, message) {
    const userLang = getUserLanguage(senderId);
    const quoteType = args?.trim()?.toLowerCase() || '';
    
    // Si aucun type spécifié, afficher l'aide
    if (!quoteType || quoteType === 'help' || quoteType === 'aide') {
        const usageMsg = userLang === 'fr' 
            ? `📜 **Commande .quote**\n\n*Usage:*\n• \`.quote motivant\` - Citations motivantes\n• \`.quote biblique\` - Citations bibliques\n• \`.quote philosophique\` - Citations philosophiques\n• \`.quote amour\` - Citations sur l'amour\n• \`.quote sagesse\` - Citations de sagesse\n• \`.quote succes\` - Citations sur le succès\n• \`.quote random\` - Citation aléatoire\n\n*Langues supportées:* Français, Anglais, Espagnol\n\n*Exemple:* \`.quote motivant\``
            : `📜 **Quote Command**\n\n*Usage:*\n• \`.quote motivational\` - Motivational quotes\n• \`.quote biblical\` - Biblical quotes\n• \`.quote philosophical\` - Philosophical quotes\n• \`.quote love\` - Love quotes\n• \`.quote wisdom\` - Wisdom quotes\n• \`.quote success\` - Success quotes\n• \`.quote random\` - Random quote\n\n*Languages supported:* French, English, Spanish\n\n*Example:* \`.quote motivational\``;
        await sock.sendMessage(chatId, { text: usageMsg });
        return;
    }
    
    try {
        let quote = null;
        
        // Essayer d'abord l'API externe pour plus de variété avec traduction automatique
        if (quoteType === 'random' || quoteType === 'aléatoire') {
            try {
                // Utiliser différentes APIs selon la catégorie recherchée
                let apiParams = {
                    minLength: 20,
                    maxLength: 150
                };
                
                // Ajouter des tags spécifiques pour améliorer les résultats
                const categoryTags = {
                    'motivational': 'inspirational,motivational',
                    'motivant': 'inspirational,motivational', 
                    'wisdom': 'wisdom,life',
                    'sagesse': 'wisdom,life',
                    'success': 'success,business',
                    'succes': 'success,business',
                    'love': 'love,relationship',
                    'amour': 'love,relationship'
                };
                
                if (categoryTags[quoteType]) {
                    apiParams.tags = categoryTags[quoteType];
                }

                const response = await axios.get(QUOTABLE_API, {
                    timeout: 10000,
                    params: apiParams
                });
                
                if (response.data && response.data.content) {
                    let quoteContent = response.data.content;
                    let quoteAuthor = response.data.author;
                    
                    // Traduire la citation si l'utilisateur n'est pas anglophone
                    if (userLang !== 'en') {
                        const langMapping = { fr: 'fr', es: 'es', de: 'de', pt: 'pt' };
                        const targetLang = langMapping[userLang] || 'fr';
                        
                        try {
                            quoteContent = await translateText(quoteContent, 'en', targetLang);
                            // L'auteur reste en version originale pour préserver l'authenticité
                        } catch (translateError) {
                            console.log('Translation failed, using original quote:', translateError.message);
                        }
                    }
                    
                    const apiQuote = `✨ "${quoteContent}" - ${quoteAuthor}`;
                    await sock.sendMessage(chatId, { text: apiQuote });
                    return;
                }
            } catch (apiError) {
                console.log('External quote API failed, using static quotes:', apiError.message);
            }
        }
        
        const langQuotes = staticQuotes[userLang] || staticQuotes['en'];
        
        // Mapper les types selon la langue
        let typeKey = quoteType;
        if (userLang === 'fr') {
            const typeMapping = {
                'motivant': 'motivant',
                'motivante': 'motivant',
                'motivational': 'motivant',
                'biblique': 'biblique',
                'biblical': 'biblique',
                'philosophique': 'philosophique',
                'philosophical': 'philosophique',
                'amour': 'amour',
                'love': 'amour',
                'sagesse': 'sagesse',
                'wisdom': 'sagesse',
                'succes': 'succes',
                'success': 'succes',
                'succès': 'succes'
            };
            typeKey = typeMapping[quoteType] || quoteType;
        } else {
            const typeMapping = {
                'motivational': 'motivational',
                'biblical': 'biblical',
                'philosophical': 'philosophical',
                'love': 'love',
                'wisdom': 'wisdom',
                'success': 'success'
            };
            typeKey = typeMapping[quoteType] || quoteType;
        }
        
        // Essayer d'abord l'API avec la catégorie spécifiée et traduction
        try {
            const categoryTags = {
                'motivational': 'inspirational,motivational',
                'motivant': 'inspirational,motivational', 
                'wisdom': 'wisdom,life',
                'sagesse': 'wisdom,life',
                'success': 'success,business',
                'succes': 'success,business',
                'love': 'love,relationship',
                'amour': 'love,relationship',
                'philosophical': 'philosophy,wisdom',
                'philosophique': 'philosophy,wisdom'
            };
            
            if (categoryTags[quoteType] || categoryTags[typeKey]) {
                const tags = categoryTags[quoteType] || categoryTags[typeKey];
                
                const response = await axios.get(QUOTABLE_API, {
                    timeout: 10000,
                    params: {
                        tags: tags,
                        minLength: 20,
                        maxLength: 150
                    }
                });
                
                if (response.data && response.data.content) {
                    let quoteContent = response.data.content;
                    let quoteAuthor = response.data.author;
                    
                    // Traduire la citation si l'utilisateur n'est pas anglophone
                    if (userLang !== 'en') {
                        const langMapping = { fr: 'fr', es: 'es', de: 'de', pt: 'pt' };
                        const targetLang = langMapping[userLang] || 'fr';
                        
                        try {
                            quoteContent = await translateText(quoteContent, 'en', targetLang);
                        } catch (translateError) {
                            console.log('Translation failed, using original quote:', translateError.message);
                        }
                    }
                    
                    const apiQuote = `✨ "${quoteContent}" - ${quoteAuthor}`;
                    await sock.sendMessage(chatId, { text: apiQuote });
                    return;
                }
            }
        } catch (apiError) {
            console.log('Categorized quote API failed, using static quotes:', apiError.message);
        }
        
        // Récupérer la citation selon le type (fallback vers les citations statiques)
        const quotesOfType = langQuotes[typeKey];
        
        if (quotesOfType && quotesOfType.length > 0) {
            quote = quotesOfType[Math.floor(Math.random() * quotesOfType.length)];
        } else {
            // Fallback: utiliser une citation aléatoire de n'importe quel type
            const allQuotes = Object.values(langQuotes).flat();
            if (allQuotes.length > 0) {
                quote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
            } else {
                throw new Error('No quotes available');
            }
        }
        
        if (quote) {
            await sock.sendMessage(chatId, { text: quote });
        } else {
            throw new Error('No quote found');
        }
        
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error in quote command:', error);
        const errorMsg = i18n.t(senderId, 'responses.quote_failed');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
};
