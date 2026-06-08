const { WabotDatabase } = require('../lib/database');
const { getText, getUserLanguage } = require('../lib/languages');
const axios = require('axios');
const yts = require('yt-search');
const { igdl } = require("ruhend-scraper");
const { ttdl } = require("ruhend-scraper");

const db = new WabotDatabase();
const processedMessages = new Set();

// Fonction pour détecter le type de contenu à partir de l'URL
function detectContentType(url) {
    if (!url || typeof url !== 'string') return null;
    
    // YouTube
    if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i.test(url)) {
        return { platform: 'youtube', type: 'video' };
    }
    
    // Instagram
    if (/(?:instagram\.com\/p\/|instagram\.com\/reel\/|instagram\.com\/tv\/)/i.test(url)) {
        return { platform: 'instagram', type: 'mixed' };
    }
    
    // TikTok
    if (/(?:tiktok\.com\/@|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(url)) {
        return { platform: 'tiktok', type: 'video' };
    }
    
    // Facebook
    if (/facebook\.com/i.test(url)) {
        return { platform: 'facebook', type: 'mixed' };
    }
    
    // Twitter/X
    if (/(?:twitter\.com|x\.com)/i.test(url)) {
        return { platform: 'twitter', type: 'mixed' };
    }
    
    return null;
}

// Fonction pour extraire les métadonnées selon la plateforme
async function extractMetadata(url, contentType) {
    let metadata = { url, title: '', thumbnail: '', author: '', duration: 0 };
    
    try {
        switch (contentType.platform) {
            case 'youtube':
                const searchResult = await yts({ videoId: url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || '' });
                if (searchResult && searchResult.title) {
                    metadata.title = searchResult.title;
                    metadata.thumbnail = searchResult.thumbnail;
                    metadata.author = searchResult.author?.name || '';
                    metadata.duration = searchResult.seconds || 0;
                }
                break;
                
            case 'instagram':
                try {
                    const igData = await igdl(url);
                    if (igData && igData.length > 0) {
                        const media = igData[0];
                        metadata.title = 'Instagram Post';
                        metadata.thumbnail = media.thumbnail || '';
                        metadata.author = 'Instagram User';
                    }
                } catch (error) {
                    console.log('Instagram metadata extraction failed:', error.message);
                }
                break;
                
            case 'tiktok':
                try {
                    const tkData = await ttdl(url);
                    if (tkData && tkData.video && tkData.video.length > 0) {
                        metadata.title = tkData.title || 'TikTok Video';
                        metadata.thumbnail = tkData.cover || '';
                        metadata.author = tkData.author || 'TikTok User';
                        metadata.duration = tkData.duration || 0;
                    }
                } catch (error) {
                    console.log('TikTok metadata extraction failed:', error.message);
                }
                break;
                
            default:
                // Pour les autres plateformes, utiliser des métadonnées basiques
                metadata.title = `${contentType.platform} content`;
                break;
        }
    } catch (error) {
        console.error('Error extracting metadata:', error.message);
    }
    
    return metadata;
}

async function likeCommand(sock, chatId, message) {
    try {
        // Vérifier les messages en double
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: getText('like.provide_url', userLang)
            });
        }

        // Extraire l'URL de la commande
        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (!urlMatch) {
            return await sock.sendMessage(chatId, { 
                text: getText('like.invalid_url', userLang)
            });
        }

        const url = urlMatch[0];
        
        // Détecter le type de contenu
        const contentType = detectContentType(url);
        if (!contentType) {
            return await sock.sendMessage(chatId, { 
                text: getText('like.platform_not_supported', userLang)
            });
        }

        // Réagir pour montrer que le traitement a commencé
        await sock.sendMessage(chatId, {
            react: { text: '❤️', key: message.key }
        });

        // Extraire les métadonnées
        const metadata = await extractMetadata(url, contentType);
        
        try {
            // Préparer les données à sauvegarder
            const likedStatus = {
                user_id: senderId,
                status_url: url,
                status_type: contentType.platform,
                media_type: contentType.type,
                media_url: url,
                title: metadata.title || `${contentType.platform} content`,
                thumbnail_url: metadata.thumbnail || null,
                duration: metadata.duration || null,
                file_size: null,
                metadata: {
                    author: metadata.author || '',
                    platform: contentType.platform,
                    extracted_at: new Date().toISOString()
                }
            };

            // Sauvegarder dans la base de données
            await db.saveLikedStatus(likedStatus);

            // Message de confirmation
            const confirmMessage = getText('like.success', userLang, {
                platform: contentType.platform.toUpperCase(),
                title: metadata.title || 'Sans titre',
                author: metadata.author || 'Inconnu'
            });

            await sock.sendMessage(chatId, { 
                text: confirmMessage 
            }, { quoted: message });

        } catch (error) {
            if (error.message && error.message.includes('duplicate')) {
                await sock.sendMessage(chatId, { 
                    text: getText('like.already_liked', userLang) 
                }, { quoted: message });
            } else {
                console.error('Error saving liked status:', error);
                await sock.sendMessage(chatId, { 
                    text: getText('like.save_error', userLang) 
                }, { quoted: message });
            }
        }

    } catch (error) {
        console.error('Error in like command:', error);
        await sock.sendMessage(chatId, { 
            text: getText('like.processing_error', userLang) 
        }, { quoted: message });
    }
}

module.exports = likeCommand;