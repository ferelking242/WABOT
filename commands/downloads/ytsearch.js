const yts = require('yt-search');

async function ytsearchCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: "🔍 *Recherche YouTube*\n\nUtilisation: .ytsearch [terme de recherche]\nExemple: .ytsearch music video"
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { 
            text: "🔍 Recherche en cours..." 
        }, { quoted: message });

        const { videos } = await yts(searchQuery);
        
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "❌ Aucune vidéo trouvée pour cette recherche."
            }, { quoted: message });
        }

        // Limit to top 5 results
        const results = videos.slice(0, 5);
        let responseText = `🔍 *Résultats de recherche pour:* ${searchQuery}\n\n`;
        
        results.forEach((video, index) => {
            const duration = video.duration || 'N/A';
            const views = video.views || 0;
            const channel = video.author?.name || video.channel?.name || 'Inconnu';
            
            responseText += `*${index + 1}.* ${video.title}\n`;
            responseText += `📺 ${channel}\n`;
            responseText += `⏱️ ${duration} | 👁️ ${views.toLocaleString()} vues\n`;
            responseText += `🔗 ${video.url}\n\n`;
        });

        responseText += `💡 *Astuce:* Utilisez .ytv [lien] pour télécharger la vidéo ou .yta [lien] pour l'audio`;

        await sock.sendMessage(chatId, { 
            text: responseText 
        }, { quoted: message });

    } catch (error) {
        console.error('Error in YouTube search:', error);
        await sock.sendMessage(chatId, { 
            text: "❌ Erreur lors de la recherche. Veuillez réessayer."
        }, { quoted: message });
    }
}

module.exports = ytsearchCommand;