const { WabotDatabase } = require('../../lib/database');
const { getText, getUserLanguage } = require('../../lib/languages');
const axios = require('axios');
const yts = require('yt-search');
const { igdl } = require("ruhend-scraper");
const { ttdl } = require("ruhend-scraper");
const fs = require('fs');
const path = require('path');

const db = new WabotDatabase();
const processedMessages = new Set();
const tempDir = './data/tmp';

// S'assurer que le dossier temp existe
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Fonctions de téléchargement réutilisées depuis les autres commandes
const downloadHandlers = {
    youtube: async (url, metadata) => {
        try {
            // Utiliser l'API existante pour YouTube
            const videoId = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
            if (!videoId) throw new Error('Invalid YouTube URL');

            // Essayer l'API PrinceTech d'abord
            const response = await axios.get(`https://api.princetechn.com/api/download/ytmp4?apikey=prince&url=${url}`, {
                timeout: 15000
            });

            if (response.data && response.data.status && response.data.result?.downloadUrl) {
                return {
                    url: response.data.result.downloadUrl,
                    title: response.data.result.title || metadata.title,
                    type: 'video'
                };
            }

            // Fallback: Essayer l'autre API
            const fallbackResponse = await axios.get(`https://apis-keith.vercel.app/download/dlmp4?url=${url}`);
            if (fallbackResponse.data?.result?.downloadUrl) {
                return {
                    url: fallbackResponse.data.result.downloadUrl,
                    title: fallbackResponse.data.result.title || metadata.title,
                    type: 'video'
                };
            }

            throw new Error('No download URL found');
        } catch (error) {
            console.error('YouTube download error:', error.message);
            throw error;
        }
    },

    instagram: async (url, metadata) => {
        try {
            const data = await igdl(url);
            if (data && data.length > 0) {
                const media = data[0];
                return {
                    url: media.url,
                    title: metadata.title || 'Instagram Media',
                    type: media.type || 'mixed'
                };
            }
            throw new Error('No Instagram media found');
        } catch (error) {
            console.error('Instagram download error:', error.message);
            throw error;
        }
    },

    tiktok: async (url, metadata) => {
        try {
            const data = await ttdl(url);
            if (data && data.video && data.video.length > 0) {
                return {
                    url: data.video[0],
                    title: data.title || metadata.title || 'TikTok Video',
                    type: 'video'
                };
            }
            throw new Error('No TikTok video found');
        } catch (error) {
            console.error('TikTok download error:', error.message);
            throw error;
        }
    }
};

// Fonction pour télécharger un fichier
async function downloadFile(url, filename) {
    try {
        const response = await axios.get(url, { 
            responseType: 'stream',
            timeout: 30000
        });
        
        const filepath = path.join(tempDir, filename);
        const writer = fs.createWriteStream(filepath);
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filepath));
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

// Fonction pour nettoyer le nom de fichier
function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
}

async function dllikedCommand(sock, chatId, message) {
    try {
        // Vérifier les messages en double
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Réagir pour montrer que le traitement a commencé
        await sock.sendMessage(chatId, {
            react: { text: '📥', key: message.key }
        });

        // Récupérer tous les statuts likés de l'utilisateur
        const likedStatuses = await db.getUserLikedStatuses(senderId, 20); // Limite à 20 pour éviter le spam
        
        if (!likedStatuses || likedStatuses.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "❌ **Aucun statut liké trouvé !**\n\n💡 **Astuce:** Utilisez `.like <URL>` pour ajouter des statuts à vos favoris."
            }, { quoted: message });
        }

        // Message d'information sur le début du téléchargement
        const startMessage = `🚀 **Téléchargement de vos statuts likés**\n\n` +
            `📊 **Total:** ${likedStatuses.length} statut(s) trouvé(s)\n` +
            `⏳ **Statut:** Traitement en cours...\n\n` +
            `⚠️ **Note:** Cela peut prendre plusieurs minutes selon la taille des fichiers.`;

        const statusMsg = await sock.sendMessage(chatId, { 
            text: startMessage 
        }, { quoted: message });

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        // Traiter chaque statut liké
        for (let i = 0; i < likedStatuses.length; i++) {
            const status = likedStatuses[i];
            
            try {
                // Mise à jour du statut
                if (i % 3 === 0) { // Mettre à jour tous les 3 éléments pour éviter le spam
                    const progressMessage = `🚀 **Téléchargement en cours...**\n\n` +
                        `📊 **Progression:** ${i + 1}/${likedStatuses.length}\n` +
                        `✅ **Réussis:** ${successCount}\n` +
                        `❌ **Échecs:** ${failCount}`;
                    
                    await sock.sendMessage(chatId, {
                        edit: statusMsg.key,
                        text: progressMessage
                    });
                }

                const handler = downloadHandlers[status.status_type];
                if (!handler) {
                    failCount++;
                    errors.push(`${status.title || status.status_url}: Plateforme non supportée`);
                    continue;
                }

                // Récupérer les informations de téléchargement
                const downloadInfo = await handler(status.status_url, status);
                
                // Envoyer le média directement (plus rapide que télécharger puis envoyer)
                const caption = `🎯 **${downloadInfo.title}**\n` +
                    `🌐 **Plateforme:** ${status.status_type.toUpperCase()}\n` +
                    `📅 **Liké le:** ${new Date(status.liked_at).toLocaleDateString('fr-FR')}`;

                if (status.media_type === 'video' || downloadInfo.type === 'video') {
                    await sock.sendMessage(chatId, {
                        video: { url: downloadInfo.url },
                        caption: caption,
                        mimetype: "video/mp4"
                    });
                } else if (status.media_type === 'image' || downloadInfo.type === 'image') {
                    await sock.sendMessage(chatId, {
                        image: { url: downloadInfo.url },
                        caption: caption
                    });
                } else {
                    // Pour les autres types, envoyer comme document
                    await sock.sendMessage(chatId, {
                        document: { url: downloadInfo.url },
                        mimetype: "application/octet-stream",
                        fileName: `${sanitizeFilename(downloadInfo.title)}.mp4`,
                        caption: caption
                    });
                }

                successCount++;
                
                // Petite pause pour éviter la limite de taux
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                failCount++;
                const errorMsg = `${status.title || status.status_url}: ${error.message}`;
                errors.push(errorMsg);
                console.error('Download error:', errorMsg);
            }
        }

        // Message final avec les statistiques
        let finalMessage = `✅ **Téléchargement terminé !**\n\n` +
            `📊 **Statistiques:**\n` +
            `• Total traité: ${likedStatuses.length}\n` +
            `• Réussis: ${successCount}\n` +
            `• Échecs: ${failCount}\n\n`;

        if (errors.length > 0 && errors.length <= 5) {
            finalMessage += `❌ **Erreurs:**\n${errors.slice(0, 5).map(e => `• ${e}`).join('\n')}\n\n`;
        } else if (errors.length > 5) {
            finalMessage += `❌ **Erreurs:** ${errors.length} erreur(s) rencontrée(s)\n\n`;
        }

        finalMessage += `💡 **Astuce:** Utilisez \`.like <URL>\` pour ajouter plus de favoris !`;

        await sock.sendMessage(chatId, {
            edit: statusMsg.key,
            text: finalMessage
        });

        // Réaction finale
        await sock.sendMessage(chatId, {
            react: { text: successCount > 0 ? '✅' : '❌', key: message.key }
        });

    } catch (error) {
        console.error('Error in dlliked command:', error);
        await sock.sendMessage(chatId, { 
            text: "❌ **Erreur lors du téléchargement des statuts likés.**\n\nVeuillez réessayer plus tard." 
        }, { quoted: message });
        
        // Réaction d'erreur
        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = dllikedCommand;