const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

// Nouvelles statiques par langue en cas d'échec de l'API
const staticNews = {
    fr: [
        { title: "🌐 Actualités Mondiales", description: "Les dernières nouvelles du monde entier sont disponibles." },
        { title: "💼 Économie", description: "Les marchés financiers continuent leur progression." },
        { title: "🔬 Sciences", description: "De nouvelles découvertes scientifiques révolutionnent notre compréhension." },
        { title: "🌿 Environnement", description: "Les efforts pour protéger notre planète s'intensifient." },
        { title: "🎮 Technologie", description: "L'innovation technologique continue de progresser rapidement." }
    ],
    en: [
        { title: "🌐 World News", description: "Latest news from around the world is now available." },
        { title: "💼 Economy", description: "Financial markets continue their upward trend." },
        { title: "🔬 Science", description: "New scientific discoveries revolutionize our understanding." },
        { title: "🌿 Environment", description: "Efforts to protect our planet are intensifying." },
        { title: "🎮 Technology", description: "Technological innovation continues to advance rapidly." }
    ],
    es: [
        { title: "🌐 Noticias Mundiales", description: "Las últimas noticias de todo el mundo están disponibles." },
        { title: "💼 Economía", description: "Los mercados financieros continúan su tendencia alcista." },
        { title: "🔬 Ciencia", description: "Nuevos descubrimientos científicos revolucionan nuestro entendimiento." },
        { title: "🌿 Medio Ambiente", description: "Los esfuerzos para proteger nuestro planeta se intensifican." },
        { title: "🎮 Tecnología", description: "La innovación tecnológica continúa avanzando rápidamente." }
    ]
};

module.exports = async function (sock, chatId, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    const userLang = getUserLanguage(senderId);
    
    try {
        // Utiliser les nouvelles statiques pour l'instant (en attendant une clé API valide)
        const articles = staticNews[userLang] || staticNews['en'];
        const newsHeader = i18n.t(senderId, 'messages.news_header');
        
        let newsMessage = `${newsHeader}\n\n`;
        articles.forEach((article, index) => {
            newsMessage += `${index + 1}. *${article.title}*\n${article.description}\n\n`;
        });
        
        await sock.sendMessage(chatId, { text: newsMessage });
    } catch (error) {
        console.error('Error in news command:', error);
        const errorMsg = i18n.t(senderId, 'messages.news_failed');
        await sock.sendMessage(chatId, { text: errorMsg });
    }
};