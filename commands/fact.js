const axios = require('axios');
const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

// APIs pour faits multilingues
const TRIVIA_API = 'https://the-trivia-api.com/v2/questions';
const NUMBERS_API = 'https://numbersapi.com/random';
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

// Faits statiques par langue en cas d'échec d'API
const staticFacts = {
    fr: [
        "🤯 Saviez-vous que les dauphins se donnent des noms entre eux ? Chaque dauphin a un sifflement unique qui lui sert de 'nom' !",
        "🌍 La Grande Muraille de Chine n'est pas visible depuis l'espace à l'œil nu, contrairement à la croyance populaire !",
        "🧠 Les humains partagent environ 60% de leur ADN avec les bananes ! Nous sommes plus proches qu'on ne le pense.",
        "🍯 Le miel ne périme jamais ! Des archéologues ont trouvé du miel vieux de 3000 ans encore comestible.",
        "🐙 Une pieuvre a 3 cœurs et son sang est bleu ! Et elle meurt après avoir pondu ses œufs.",
        "⚡ Un éclair est 5 fois plus chaud que la surface du soleil ! Il peut atteindre 30 000°C.",
        "🐜 Les abeilles peuvent reconnaître les visages humains et s'en souvenir !",
        "🌌 Les escargots peuvent dormir jusqu'à 3 ans d'affilée lorsque les conditions sont difficiles."
    ],
    en: [
        "🤯 Did you know octopuses have three hearts and blue blood? Two hearts pump blood to the gills!",
        "🍯 Honey never spoils! Archaeologists have found 3000-year-old honey that's still edible.",
        "🧠 Humans share about 60% of their DNA with bananas! We're closer than you think.",
        "🐝 Bees can recognize and remember human faces, just like we remember theirs!",
        "⚡ Lightning is 5 times hotter than the surface of the Sun, reaching up to 30,000°C!",
        "🌍 The Great Wall of China isn't visible from space with the naked eye, despite popular belief!",
        "🐌 Snails can sleep for up to 3 years straight when conditions are tough.",
        "🐙 Dolphins give each other names! Each dolphin has a unique whistle that serves as their 'name'."
    ],
    es: [
        "🤯 ¿Sabías que los pulpos tienen 3 corazones y sangre azul? ¡Dos corazones bombean sangre a las branquias!",
        "🍯 ¡La miel nunca se echa a perder! Los arqueólogos han encontrado miel de 3000 años que aún es comestible.",
        "🧠 Los humanos comparten aproximadamente el 60% de su ADN con los plátanos. ¡Estamos más cerca de lo que piensas!",
        "🐝 ¡Las abejas pueden reconocer y recordar rostros humanos, como nosotros recordamos los suyos!",
        "⚡ ¡Un rayo es 5 veces más caliente que la superficie del Sol, alcanzando hasta 30,000°C!",
        "🌍 ¡La Gran Muralla China no es visible desde el espacio a simple vista, a pesar de la creencia popular!",
        "🐌 Los caracoles pueden dormir hasta 3 años seguidos cuando las condiciones son difíciles.",
        "🐙 ¡Los delfines se dan nombres! Cada delfín tiene un silbido único que sirve como su 'nombre'."
    ]
};

module.exports = async function (sock, chatId, senderId, args) {
    try {
        const userLang = getUserLanguage(senderId);
        const factType = args && args[0] ? args[0].toLowerCase() : 'general';
        let fact = null;

        // Si aide demandée
        if (factType === 'help' || factType === 'aide') {
            const usageMsg = userLang === 'fr' 
                ? `🧠 **Commande .fact**\n\n*Usage:*\n• \`.fact\` - Fait intéressant aléatoire\n• \`.fact science\` - Faits scientifiques\n• \`.fact history\` - Faits historiques\n• \`.fact nature\` - Faits sur la nature\n• \`.fact number\` - Fait sur un nombre aléatoire\n\n*Langues supportées:* Français, Anglais, Espagnol, Allemand, Hindi, Turkish, Dutch\n\n*Exemple:* \`.fact science\``
                : `🧠 **Fact Command**\n\n*Usage:*\n• \`.fact\` - Random interesting fact\n• \`.fact science\` - Science facts\n• \`.fact history\` - History facts\n• \`.fact nature\` - Nature facts\n• \`.fact number\` - Random number fact\n\n*Languages supported:* French, English, Spanish, German, Hindi, Turkish, Dutch\n\n*Example:* \`.fact science\``;
            
            await sock.sendMessage(chatId, { text: usageMsg });
            return;
        }

        // Essayer d'abord les APIs externes multilingues
        try {
            // Utiliser Numbers API pour les faits numériques avec traduction automatique
            if (factType === 'number' || factType === 'nombre') {
                try {
                    const response = await axios.get(NUMBERS_API, {
                        timeout: 8000
                    });
                    if (response.data) {
                        let numberFact = response.data;
                        
                        // Traduire le fait numérique si l'utilisateur n'est pas anglophone
                        if (userLang !== 'en') {
                            const langMapping = { fr: 'fr', es: 'es', de: 'de', pt: 'pt' };
                            const targetLang = langMapping[userLang] || 'fr';
                            
                            try {
                                numberFact = await translateText(numberFact, 'en', targetLang);
                            } catch (translateError) {
                                console.log('Translation failed for number fact, using original:', translateError.message);
                            }
                        }
                        
                        fact = `🔢 ${numberFact}`;
                    }
                } catch (numbersApiError) {
                    console.log('Numbers API failed:', numbersApiError.message);
                }
            }
            
            // Utiliser The Trivia API avec traduction automatique pour vraie prise en charge multilingue
            if (!fact) {
                const categoryMapping = {
                    'science': 'science',
                    'history': 'history',
                    'nature': 'science',
                    'geography': 'geography',
                    'géographie': 'geography',
                    'sports': 'sport_and_leisure',
                    'sport': 'sport_and_leisure',
                    'arts': 'arts_and_literature',
                    'art': 'arts_and_literature',
                    'general': null
                };
                
                let apiUrl = `${TRIVIA_API}?limit=1`;
                const category = categoryMapping[factType];
                if (category) {
                    apiUrl += `&categories=${category}`;
                }
                
                const response = await axios.get(apiUrl, {
                    timeout: 8000
                });
                
                if (response.data && response.data.length > 0) {
                    const triviaData = response.data[0];
                    let questionText = triviaData.question.text || triviaData.question;
                    let correctAnswer = triviaData.correctAnswer;
                    
                    // Traduire la question et la réponse si l'utilisateur n'est pas anglophone
                    if (userLang !== 'en') {
                        const langMapping = { fr: 'fr', es: 'es', de: 'de', pt: 'pt' };
                        const targetLang = langMapping[userLang] || 'fr';
                        
                        try {
                            questionText = await translateText(questionText, 'en', targetLang);
                            correctAnswer = await translateText(correctAnswer, 'en', targetLang);
                        } catch (translateError) {
                            console.log('Translation failed for trivia fact, using original:', translateError.message);
                        }
                    }
                    
                    // Présenter comme un fait plutôt qu'une question
                    fact = `🧠 **${userLang === 'fr' ? 'Fait' : 'Fact'}:** ${questionText}\n\n💡 **${userLang === 'fr' ? 'Réponse' : 'Answer'}:** ${correctAnswer}`;
                }
            }
            
        } catch (apiError) {
            console.log('External APIs failed, using static facts:', apiError.message);
        }

        // Fallback vers les faits statiques si les APIs échouent
        if (!fact) {
            const langFacts = staticFacts[userLang] || staticFacts.en;
            fact = langFacts[Math.floor(Math.random() * langFacts.length)];
        }

        if (fact) {
            await sock.sendMessage(chatId, { text: fact });
        } else {
            throw new Error('No fact available');
        }
    } catch (error) {
    const _errCode = error?.data || error?.output?.statusCode || error?.response?.status;
      if (_errCode === 429 || error?.message?.includes('429')) return;
        console.error('Error in fact command:', error);
        const errorMsg = i18n.t(senderId, 'responses.fact_failed');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
};
