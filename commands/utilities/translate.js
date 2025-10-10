const fetch = require('node-fetch');
const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');

// Common language codes for translation (excluding highly ambiguous ones)
const COMMON_LANGUAGE_CODES = [
    'fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi',
    'nl', 'sv', 'da', 'no', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr',
    'sl', 'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'tr', 'el',
    'he', 'ur', 'fa', 'th', 'vi', 'id', 'ms', 'tl', 'sw', 'af', 'sq', 'az', 
    'be', 'bn', 'bs', 'ka', 'gu', 'ht', 'ha', 'jw', 'kn', 'kk', 'km', 'rw',
    'ky', 'lo', 'mk', 'mg', 'ml', 'mr', 'mn', 'my', 'ne', 'ny', 'ps', 'pa',
    'sm', 'gd', 'sr', 'st', 'sn', 'sd', 'si', 'so', 'su', 'ta', 'te', 'tg',
    'ti', 'uk', 'uz', 'xh', 'yi', 'zu'
    // Excluded ambiguous codes: 'to', 'is', 'am', 'la', 'yo', 'or', 'as', 'ab'
];

// Deterministic language detection for direct messages
function detectLanguageFromDirectMessage(args) {
    if (args.length === 0) return { lang: null, text: '' };
    
    // Try last token first (original behavior)
    const lastToken = args[args.length - 1].toLowerCase().trim();
    if (COMMON_LANGUAGE_CODES.includes(lastToken)) {
        const text = args.slice(0, -1).join(' ');
        return { lang: lastToken, text };
    }
    
    // Fallback: try first token 
    const firstToken = args[0].toLowerCase().trim();
    if (COMMON_LANGUAGE_CODES.includes(firstToken)) {
        const text = args.slice(1).join(' ');
        return { lang: firstToken, text };
    }
    
    return { lang: null, text: args.join(' ') };
}

// Generate improved help message using i18n
function generateHelpMessage(userLang, senderId) {
    return i18n.t(senderId, 'commands.translate.help_title') + '\n\n' +
           i18n.t(senderId, 'commands.translate.help_desc') + '\n\n' +
           i18n.t(senderId, 'commands.translate.usage_method1') + '\n' +
           i18n.t(senderId, 'commands.translate.usage_example1') + '\n\n' +
           i18n.t(senderId, 'commands.translate.usage_method2') + '\n' +
           i18n.t(senderId, 'commands.translate.usage_example2') + '\n\n' +
           i18n.t(senderId, 'commands.translate.supported_languages') + '\n' +
           i18n.t(senderId, 'commands.translate.language_list') + '\n\n' +
           i18n.t(senderId, 'commands.translate.aliases');
}

async function handleTranslateCommand(sock, chatId, message, match) {
    try {
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        const userLang = getUserLanguage(senderId);

        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        let textToTranslate = '';
        let lang = '';

        // Check if it's a reply
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
            // Get text from quoted message
            textToTranslate = quotedMessage.conversation || 
                            quotedMessage.extendedTextMessage?.text || 
                            quotedMessage.imageMessage?.caption || 
                            quotedMessage.videoMessage?.caption || 
                            '';

            // For replies, require exactly one token as language
            const args = match.trim().split(/\s+/).filter(arg => arg.length > 0);
            if (args.length !== 1) {
                return sock.sendMessage(chatId, {
                    text: generateHelpMessage(userLang, senderId),
                    quoted: message
                });
            }
            
            lang = args[0].toLowerCase().trim();
            if (!COMMON_LANGUAGE_CODES.includes(lang)) {
                return sock.sendMessage(chatId, {
                    text: i18n.t(senderId, 'commands.translate.invalid_language', { lang: args[0] }),
                    quoted: message
                });
            }
        } else {
            // Parse command arguments for direct message
            const args = match.trim().split(/\s+/).filter(arg => arg.length > 0);
            
            if (args.length < 2) {
                return sock.sendMessage(chatId, {
                    text: generateHelpMessage(userLang, senderId),
                    quoted: message
                });
            }

            // Deterministic language detection
            const result = detectLanguageFromDirectMessage(args);
            lang = result.lang;
            textToTranslate = result.text;
            
            if (!lang) {
                return sock.sendMessage(chatId, {
                    text: generateHelpMessage(userLang, senderId),
                    quoted: message
                });
            }
        }

        if (!textToTranslate || textToTranslate.trim().length === 0) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.translate.no_text_error'),
                quoted: message
            });
        }

        // Try multiple translation APIs in sequence
        let translatedText = null;
        let error = null;

        // Try API 1 (Google Translate API)
        try {
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    translatedText = data[0][0][0];
                }
            }
        } catch (e) {
            error = e;
        }

        // If API 1 fails, try API 2
        if (!translatedText) {
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${lang}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.responseData && data.responseData.translatedText) {
                        translatedText = data.responseData.translatedText;
                    }
                }
            } catch (e) {
                error = e;
            }
        }

        // If API 2 fails, try API 3
        if (!translatedText) {
            try {
                const response = await fetch(`https://api.dreaded.site/api/translate?text=${encodeURIComponent(textToTranslate)}&lang=${lang}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.translated) {
                        translatedText = data.translated;
                    }
                }
            } catch (e) {
                error = e;
            }
        }

        if (!translatedText) {
            throw new Error('All translation APIs failed');
        }

        // Send translation with nice formatting
        const flagEmoji = {
            'fr': '🇫🇷', 'en': '🇺🇸', 'es': '🇪🇸', 'de': '🇩🇪', 'it': '🇮🇹',
            'pt': '🇵🇹', 'ru': '🇷🇺', 'ja': '🇯🇵', 'ko': '🇰🇷', 'zh': '🇨🇳',
            'ar': '🇸🇦', 'hi': '🇮🇳', 'nl': '🇳🇱', 'tr': '🇹🇷', 'th': '🇹🇭'
        };

        const responseText = `🌍 *Translation ${flagEmoji[lang] || '🌐'}*\n\n` +
                           `📝 *Original:* ${textToTranslate}\n\n` +
                           `✨ *Translated (${lang.toUpperCase()}):* ${translatedText}`;

        await sock.sendMessage(chatId, {
            text: responseText,
        }, {
            quoted: message
        });

    } catch (error) {
        console.error('❌ Error in translate command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        await sock.sendMessage(chatId, {
            text: i18n.t(senderId, 'commands.translate.translation_failed'),
            quoted: message
        });
    }
}

module.exports = {
    handleTranslateCommand
};