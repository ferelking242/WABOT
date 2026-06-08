const fetch = require('node-fetch');

async function handleSsCommand(sock, chatId, message, match) {
    // Get user language at function start to ensure it's always available
    const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
    const { getUserLanguage } = require('../../lib/languages');
    const userLang = getUserLanguage(senderId);
    
    if (!match) {
        
        const helpMsg = userLang === 'fr' ?
            `*OUTIL DE CAPTURE D'ÉCRAN*\n\n*.ss <url>*\n*.ssweb <url>*\n*.screenshot <url>*\n\nPrendre une capture d'écran de n'importe quel site web\n\nExemple:\n.ss https://google.com\n.ssweb https://google.com\n.screenshot https://google.com` :
            `*SCREENSHOT TOOL*\n\n*.ss <url>*\n*.ssweb <url>*\n*.screenshot <url>*\n\nTake a screenshot of any website\n\nExample:\n.ss https://google.com\n.ssweb https://google.com\n.screenshot https://google.com`;
        
        await sock.sendMessage(chatId, {
            text: helpMsg,
            quoted: message
        });
        return;
    }

    try {
        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        // Extract URL from command
        let url = match.trim();
        
        // Auto-fix URL format - add https:// if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            // Check if it looks like a URL (contains domain)
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                const errorMsg = userLang === 'fr' ?
                    '❌ Veuillez fournir une URL valide\n\nExemples:\n• .ss google.com\n• .ss https://google.com\n• .ss www.example.com' :
                    '❌ Please provide a valid URL\n\nExamples:\n• .ss google.com\n• .ss https://google.com\n• .ss www.example.com';
                
                return sock.sendMessage(chatId, {
                    text: errorMsg,
                    quoted: message
                });
            }
        }
        
        // Additional URL validation
        try {
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                throw new Error('Invalid protocol');
            }
        } catch (e) {
            const errorMsg = userLang === 'fr' ?
                '❌ Format d\'URL invalide\n\nExemples:\n• .ss google.com\n• .ss https://google.com\n• .ss www.example.com' :
                '❌ Invalid URL format\n\nExamples:\n• .ss google.com\n• .ss https://google.com\n• .ss www.example.com';
            
            return sock.sendMessage(chatId, {
                text: errorMsg,
                quoted: message
            });
        }

        // Use user language for browser locale (already defined at function start)
        
        // Map language codes to locale
        const localeMap = {
            'fr': 'fr-FR',
            'en': 'en-US', 
            'es': 'es-ES'
        };
        const locale = localeMap[userLang] || 'en-US';

        // Multiple screenshot providers for better reliability
        const screenshotProviders = [
            {
                name: 'Page2Images',
                url: `https://api.page2images.com/directlink?p2i_url=${encodeURIComponent(url)}&p2i_device=6&p2i_size=1280x720&p2i_key=demo`,
                headers: { 'accept': 'image/*' }
            },
            {
                name: 'Thum.io',
                url: `https://image.thum.io/get/width/1200/crop/675/allowJPG/wait/10/${encodeURIComponent(url)}`,
                headers: { 
                    'accept': 'image/*', 
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
                }
            },
            {
                name: 'ScreenshotAPI.net',
                url: `https://screenshotapi.net/api/v1/screenshot?url=${encodeURIComponent(url)}&width=1280&height=720&output=image`,
                headers: { 'accept': 'image/*' }
            },
            {
                name: 'WebScreenshot',
                url: `https://mini.s-shot.ru/1280x720/JPEG/1024/Z100/?${encodeURIComponent(url)}`,
                headers: { 'accept': 'image/*' }
            }
        ];
        
        let screenshot = null;
        let usedProvider = null;
        
        // Try providers sequentially
        for (const provider of screenshotProviders) {
            try {
                console.log(`Trying screenshot provider: ${provider.name}`);
                const response = await fetch(provider.url, { 
                    headers: provider.headers,
                    timeout: 30000,
                    redirect: 'follow'
                });
                
                if (response.ok) {
                    const imageBuffer = await response.buffer();
                    console.log(`Provider ${provider.name} returned ${imageBuffer.length} bytes`);
                    
                    // Check if we got a valid image (more than 1KB and looks like image data)
                    if (imageBuffer && imageBuffer.length > 1000) {
                        // Check if it's actually an image by looking at the first few bytes
                        const isValidImage = (
                            imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 || // JPEG
                            imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 || // PNG
                            imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49    // GIF
                        );
                        
                        if (isValidImage) {
                            console.log(`✅ Screenshot successful using ${provider.name}`);
                            // Send screenshot with localized caption
                            const caption = userLang === 'fr' ? `📸 Capture d'écran de: ${url}` : `📸 Screenshot of: ${url}`;
                            await sock.sendMessage(chatId, {
                                image: imageBuffer,
                                caption: caption
                            }, {
                                quoted: message
                            });
                            return;
                        } else {
                            console.log(`❌ ${provider.name} returned invalid image data`);
                        }
                    } else {
                        console.log(`❌ ${provider.name} returned insufficient data: ${imageBuffer?.length || 0} bytes`);
                    }
                } else {
                    console.log(`❌ ${provider.name} HTTP error: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                console.log(`❌ ${provider.name} failed:`, error.message);
                continue;
            }
        }
        
        // If all providers failed, show error
        const errorMsg = userLang === 'fr' ? 
            '❌ Échec de la capture d\'écran. Réessayez dans quelques minutes.\n\nRaisons possibles:\n• URL invalide\n• Le site bloque les captures\n• Le site est hors ligne\n• Service temporairement indisponible' :
            '❌ Failed to take screenshot. Please try again in a few minutes.\n\nPossible reasons:\n• Invalid URL\n• Website is blocking screenshots\n• Website is down\n• API service is temporarily unavailable';
        
        await sock.sendMessage(chatId, {
            text: errorMsg,
            quoted: message
        });
        

    } catch (error) {
        console.error('❌ Error in ss command:', error);
        const errorMsg = userLang === 'fr' ? 
            '❌ Erreur lors de la capture d\'écran. Réessayez plus tard.\n\nRaisons possibles:\n• URL invalide\n• Le site bloque les captures\n• Le site est hors ligne\n• Service temporairement indisponible' :
            '❌ Failed to take screenshot. Please try again in a few minutes.\n\nPossible reasons:\n• Invalid URL\n• Website is blocking screenshots\n• Website is down\n• API service is temporarily unavailable';
        
        await sock.sendMessage(chatId, {
            text: errorMsg,
            quoted: message
        });
    }
}

module.exports = {
    handleSsCommand
}; 