const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { getUserLanguage, getText } = require('../../lib/languages');

// TTS Providers configuration
const TTS_PROVIDERS = {
    edge: {
        name: 'Edge TTS',
        priority: 1,
        languages: ['fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv'],
        voices: {
            fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
            en: ['en-US-AriaNeural', 'en-US-JennyNeural', 'en-US-GuyNeural'],
            es: ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
            de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural']
        }
    },
    groq: {
        name: 'Groq AI',
        priority: 2,
        models: ['playai-tts'],
        voices: ['Fritz-PlayAI', 'Atlas-PlayAI', 'Calum-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Deedee-PlayAI']
    },
    gtts: {
        name: 'Google TTS',
        priority: 3,
        languages: ['fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv']
    },
    elevenlabs: {
        name: 'ElevenLabs',
        priority: 4,
        voices: ['rachel', 'domi', 'bella', 'antoni', 'elli', 'josh', 'arnold', 'adam', 'sam']
    }
};

async function tryGroqTTS(text, voice = 'Fritz-PlayAI', model = 'playai-tts') {
    try {
        if (!global.GROQ_API_KEY) return null;
        
        const response = await axios.post(`${global.GROQ_API_URL}/audio/speech`, {
            model: model,
            input: text,
            voice: voice,
            response_format: 'mp3'
        }, {
            headers: {
                'Authorization': `Bearer ${global.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        if (response.status === 200) {
            return Buffer.from(response.data);
        }
    } catch (error) {
        console.log('Groq TTS failed:', error.message);
        if (error.response?.data?.error?.message?.includes('terms acceptance')) {
            console.log('⚠️  Groq TTS requires terms acceptance at https://console.groq.com/playground?model=playai-tts');
        } else if (error.response?.data?.error?.code === 'model_terms_required') {
            console.log('⚠️  Groq TTS model terms must be accepted by admin at https://console.groq.com/playground?model=playai-tts');
        } else {
            console.log('Groq TTS error details:', error.response?.data || 'No response data');
            console.log('Groq TTS request payload:', { model, input: text, voice, response_format: 'mp3' });
        }
    }
    return null;
}

async function tryEdgeTTS(text, voice = 'fr-FR-DeniseNeural') {
    try {
        const { execFile } = require('child_process');
        const util = require('util');
        const execFileAsync = util.promisify(execFile);
        
        // Check if edge-tts is available
        try {
            await execFileAsync('edge-tts', ['--help'], { timeout: 5000 });
        } catch (checkError) {
            console.log('Edge TTS CLI not available, skipping...');
            return null;
        }
        
        const tempFile = path.join(__dirname, '..', 'temp', `edge-tts-${Date.now()}.mp3`);
        
        // Ensure temp directory exists
        const tempDir = path.dirname(tempFile);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Use execFile with arguments array (safer than shell execution)
        await execFileAsync('edge-tts', [
            '--voice', voice,
            '--text', text,
            '--write-media', tempFile,
            '--format', 'mp3'
        ], { timeout: 30000 });
        
        if (fs.existsSync(tempFile)) {
            const audioBuffer = fs.readFileSync(tempFile);
            fs.unlinkSync(tempFile); // Clean up
            return audioBuffer;
        }
    } catch (error) {
        console.log('Edge TTS failed:', error.message);
    }
    return null;
}

async function tryElevenLabsTTS(text, voice = 'rachel') {
    try {
        if (!process.env.ELEVENLABS_API_KEY) return null;
        
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
            text: text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5
            }
        }, {
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        if (response.status === 200) {
            return Buffer.from(response.data);
        }
    } catch (error) {
        console.log('ElevenLabs TTS failed:', error.message);
    }
    return null;
}

async function tryGoogleTTS(text, language = 'en', options = {}) {
    return new Promise((resolve) => {
        try {
            const ttsOptions = {
                lang: language,
                slow: options.slow || false
            };
            
            const gtts = new gTTS(text, ttsOptions.lang);
            gtts.slow = ttsOptions.slow;
            
            const fileName = `temp-tts-${Date.now()}.mp3`;
            const filePath = path.join(__dirname, '..', 'temp', fileName);
            
            // Ensure temp directory exists
            const tempDir = path.dirname(filePath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            gtts.save(filePath, (err) => {
                if (err) {
                    console.log('Google TTS failed:', err.message);
                    resolve(null);
                    return;
                }
                
                try {
                    const audioBuffer = fs.readFileSync(filePath);
                    fs.unlinkSync(filePath); // Clean up temp file
                    resolve(audioBuffer);
                } catch (readErr) {
                    console.log('Google TTS file read failed:', readErr.message);
                    resolve(null);
                }
            });
        } catch (error) {
            console.log('Google TTS setup failed:', error.message);
            resolve(null);
        }
    });
}

async function ttsCommand(sock, chatId, input, message, defaultLang) {
    const senderId = message.key.participant || message.key.remoteJid;
    const userLang = getUserLanguage(senderId);
    
    
    if (!input) {
        const helpMsg = getText(senderId, 'TTS_USAGE', userLang) || 
            `🔊 *Text-to-Speech Usage:*\n\n*.tts <text>* - Uses Edge TTS (${userLang})\n*.tts <provider> <text>* - Specify provider\n*.tts <provider> <lang> <voice> <text>* - Full control\n\n🤖 *Providers (with auto-fallback):*\n• edge - Edge TTS (gratuit, haute qualité, par défaut)\n• groq - Groq AI (excellente qualité)\n• gtts - Google TTS (fiable)\n• elevenlabs - ElevenLabs (premium)\n• auto - Essayer tous les fournisseurs\n\n🌍 *Languages:* fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n🎭 *Edge Voices:* fr-FR-DeniseNeural, en-US-AriaNeural, es-ES-ElviraNeural, de-DE-KatjaNeural\n🎭 *Groq Voices:* Fritz-PlayAI, Atlas-PlayAI, Celeste-PlayAI, Cheyenne-PlayAI, Deedee-PlayAI\n🎭 *ElevenLabs Voices:* rachel, domi, bella, antoni, elli, josh\n🎭 *Google Options:* slow, fast, male, female\n\n📝 *Examples:*\n.tts Hello world\n.tts edge Bonjour le monde\n.tts groq fr Fritz-PlayAI Salut tout le monde\n.tts elevenlabs en rachel Hello there\n.tts gtts fr slow Parlez lentement\n.tts auto Test all providers\n\n💡 *Pour aide spécifique:* .tts edge, .tts groq, .tts gtts, .tts elevenlabs, .tts auto`;
        
        await sock.sendMessage(chatId, { text: helpMsg, quoted: message });
        return;
    }

    let provider = 'edge'; // Default to Edge TTS (free and good quality)
    let language = userLang;
    let text = input.trim();
    let voice = null; // Will be set based on provider
    let voiceOptions = { slow: false, male: false };
    
    // Parse new syntax: .tts [fournisseur] [langue] [voix] texte
    const parts = input.trim().split(' ');
    const supportedLangs = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'nl', 'pl', 'sv'];
    const providers = ['edge', 'groq', 'gtts', 'elevenlabs', 'auto'];
    const groqVoices = ['Fritz-PlayAI', 'Atlas-PlayAI', 'Calum-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Deedee-PlayAI'];
    const elevenVoices = ['rachel', 'domi', 'bella', 'antoni', 'elli', 'josh', 'arnold', 'adam', 'sam'];
    const edgeVoices = Object.values(TTS_PROVIDERS.edge.voices).flat();
    const gttOptions = ['slow', 'fast', 'male', 'female', 'm', 'f'];
    
    let startIndex = 0;
    
    // Parse provider (first parameter)
    if (parts.length > 0 && providers.includes(parts[0].toLowerCase())) {
        provider = parts[0].toLowerCase();
        startIndex = 1;
        
        // Check if user wants tutorial for this provider (e.g., ".tts groq")
        if (parts.length === 1) {
            let providerHelpMsg = '';
            
            switch(provider) {
                case 'edge':
                    providerHelpMsg = `⚡ *Edge TTS - Tutoriel*\n\n*Edge TTS* est un service gratuit et de haute qualité de Microsoft avec des voix naturelles.\n\n📋 *Syntaxe:*\n• .tts edge <texte>\n• .tts edge <langue> <voix> <texte>\n\n🎭 *Voix disponibles:*\n• Français: fr-FR-DeniseNeural, fr-FR-HenriNeural\n• Anglais: en-US-AriaNeural, en-US-JennyNeural, en-US-GuyNeural\n• Espagnol: es-ES-ElviraNeural, es-ES-AlvaroNeural\n• Allemand: de-DE-KatjaNeural, de-DE-ConradNeural\n\n🌍 *Langues supportées:* fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n📝 *Exemples:*\n.tts edge Bonjour le monde\n.tts edge fr fr-FR-DeniseNeural Salut tout le monde\n.tts edge en en-US-AriaNeural Hello everyone\n\n✅ *Avantages:*\n• Gratuit et sans limite\n• Qualité vocale excellente\n• Voix naturelles et expressives\n• Disponible immédiatement`;
                    break;
                case 'groq':
                    providerHelpMsg = `🤖 *Groq AI TTS - Tutoriel*\n\n*Groq AI* offre une synthèse vocale de haute qualité avec plusieurs voix disponibles.\n\n📋 *Syntaxe:*\n• .tts groq <texte>\n• .tts groq <langue> <voix> <texte>\n\n🎭 *Voix disponibles:*\n• Fritz-PlayAI (par défaut)\n• Atlas-PlayAI\n• Celeste-PlayAI\n• Cheyenne-PlayAI\n• Deedee-PlayAI\n\n🌍 *Langues supportées:* fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n📝 *Exemples:*\n.tts groq Bonjour le monde\n.tts groq fr Fritz-PlayAI Salut tout le monde\n.tts groq en Celeste-PlayAI Hello everyone\n\n⚠️ *Prérequis:*\n1. Clé API Groq valide\n2. Accepter les termes à: https://console.groq.com/playground?model=playai-tts\n\n💡 *Si erreur:* Vérifiez que les termes du modèle TTS sont acceptés`;
                    break;
                case 'gtts':
                    providerHelpMsg = `🔊 *Google TTS - Tutoriel*\n\n*Google TTS* est le service le plus fiable avec support multi-langues.\n\n📋 *Syntaxe:*\n• .tts gtts <texte>\n• .tts gtts <langue> <option> <texte>\n\n⚙️ *Options disponibles:*\n• slow (parole lente)\n• fast (parole rapide)\n• male (voix masculine)\n• female (voix féminine)\n\n🌍 *Langues supportées:* fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n📝 *Exemples:*\n.tts gtts Bonjour le monde\n.tts gtts fr slow Parlez lentement\n.tts gtts en female Hello world`;
                    break;
                case 'elevenlabs':
                    providerHelpMsg = `🎤 *ElevenLabs TTS - Tutoriel*\n\n*ElevenLabs* offre la meilleure qualité vocale premium.\n\n📋 *Syntaxe:*\n• .tts elevenlabs <texte>\n• .tts elevenlabs <langue> <voix> <texte>\n\n🎭 *Voix premium:*\n• rachel (par défaut)\n• domi\n• bella\n• antoni\n• elli\n• josh\n• arnold\n• adam\n• sam\n\n📝 *Exemples:*\n.tts elevenlabs Hello world\n.tts elevenlabs en rachel Welcome\n.tts elevenlabs fr bella Bonjour\n\n⚠️ *Note:* Nécessite une clé API ElevenLabs (premium)`;
                    break;
                case 'auto':
                    providerHelpMsg = `🔄 *Mode Auto - Tutoriel*\n\n*Mode Auto* essaie tous les fournisseurs disponibles jusqu'à ce qu'un fonctionne.\n\n📋 *Syntaxe:*\n• .tts auto <texte>\n\n🔄 *Ordre d'essai:*\n1. Edge TTS (gratuit et de qualité)\n2. Google TTS (toujours disponible)\n3. Groq AI (si clé disponible)\n4. ElevenLabs (si clé disponible)\n\n📝 *Exemple:*\n.tts auto Test all providers\n\n✅ *Avantage:* Garantit qu'un service fonctionne`;
                    break;
            }
            
            await sock.sendMessage(chatId, { text: providerHelpMsg, quoted: message });
            return;
        }
    }
    
    // Parse language (second parameter)
    if (parts.length > startIndex && supportedLangs.includes(parts[startIndex].toLowerCase())) {
        language = parts[startIndex].toLowerCase();
        startIndex++;
    }
    
    // Parse voice/options (third parameter)
    if (parts.length > startIndex) {
        const voiceParam = parts[startIndex];
        const voiceParamLower = voiceParam.toLowerCase();
        
        // Convert voice arrays to lowercase for case-insensitive comparison
        const edgeVoicesLower = edgeVoices.map(v => v.toLowerCase());
        const groqVoicesLower = groqVoices.map(v => v.toLowerCase());
        const elevenVoicesLower = elevenVoices.map(v => v.toLowerCase());
        
        if (provider === 'edge' && edgeVoicesLower.includes(voiceParamLower)) {
            // Find original case voice
            voice = edgeVoices.find(v => v.toLowerCase() === voiceParamLower);
            startIndex++;
        } else if (provider === 'groq' && groqVoicesLower.includes(voiceParamLower)) {
            // Find original case voice
            voice = groqVoices.find(v => v.toLowerCase() === voiceParamLower);
            startIndex++;
        } else if (provider === 'elevenlabs' && elevenVoicesLower.includes(voiceParamLower)) {
            // Find original case voice
            voice = elevenVoices.find(v => v.toLowerCase() === voiceParamLower);
            startIndex++;
        } else if ((provider === 'gtts' || provider === 'auto') && gttOptions.includes(voiceParamLower)) {
            switch(voiceParamLower) {
                case 'slow':
                    voiceOptions.slow = true;
                    break;
                case 'fast':
                    voiceOptions.slow = false;
                    break;
                case 'm':
                case 'male':
                    voiceOptions.male = true;
                    break;
                case 'f':
                case 'female':
                    voiceOptions.male = false;
                    break;
            }
            startIndex++;
        }
    }
    
    // Extract text from remaining parts
    text = parts.slice(startIndex).join(' ').trim();
    
    // Set default voice based on provider if not already set
    if (!voice) {
        switch (provider) {
            case 'edge':
                voice = TTS_PROVIDERS.edge.voices[language]?.[0] || 'fr-FR-DeniseNeural';
                break;
            case 'groq':
                voice = 'Fritz-PlayAI';
                break;
            case 'elevenlabs':
                voice = 'rachel';
                break;
            case 'gtts':
            case 'auto':
                // No voice needed for Google TTS
                break;
        }
    }

    if (!text) {
        // If no text provided, show general help menu
        const helpMsg = getText(senderId, 'TTS_USAGE', userLang) || 
            `🔊 *Text-to-Speech Usage:*\n\n*.tts <text>* - Uses Edge TTS (${userLang})\n*.tts <provider> <text>* - Specify provider\n*.tts <provider> <lang> <voice> <text>* - Full control\n\n🤖 *Providers (with auto-fallback):*\n• edge - Edge TTS (gratuit, haute qualité, par défaut)\n• groq - Groq AI (excellente qualité)\n• gtts - Google TTS (fiable)\n• elevenlabs - ElevenLabs (premium)\n• auto - Essayer tous les fournisseurs\n\n🌍 *Languages:* fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi, tr, nl, pl, sv\n\n🎭 *Edge Voices:* fr-FR-DeniseNeural, en-US-AriaNeural, es-ES-ElviraNeural, de-DE-KatjaNeural\n🎭 *Groq Voices:* Fritz-PlayAI, Atlas-PlayAI, Celeste-PlayAI, Cheyenne-PlayAI, Deedee-PlayAI\n🎭 *ElevenLabs Voices:* rachel, domi, bella, antoni, elli, josh\n🎭 *Google Options:* slow, fast, male, female\n\n📝 *Examples:*\n.tts Hello world\n.tts edge Bonjour le monde\n.tts groq fr Fritz-PlayAI Salut tout le monde\n.tts elevenlabs en rachel Hello there\n.tts gtts fr slow Parlez lentement\n.tts auto Test all providers\n\n💡 *Pour aide spécifique:* .tts edge, .tts groq, .tts gtts, .tts elevenlabs, .tts auto`;
        
        await sock.sendMessage(chatId, { text: helpMsg, quoted: message });
        return;
    }
    
    // Text length validation
    if (text.length > 4000) {
        await sock.sendMessage(chatId, { 
            text: getText(senderId, 'TTS_TEXT_TOO_LONG', userLang) || '❌ Texte trop long. Maximum 4000 caractères.',
            quoted: message 
        });
        return;
    }

    try {
        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        
        // Send initial progress message
        const progressMsg = await sock.sendMessage(chatId, { 
            text: getText(senderId, 'TTS_PROCESSING', userLang) || '🔊 Génération audio en cours...',
            quoted: message 
        });
        
        let audioBuffer = null;
        let usedProvider = null;
        // If specific provider is requested but fails, fall back to working providers
        const providersToTry = provider === 'auto' ? ['edge', 'gtts', 'groq', 'elevenlabs'] : 
                              provider === 'edge' ? ['edge', 'gtts'] : // Edge fallback to Google TTS
                              provider === 'groq' ? ['groq', 'gtts'] : // Groq fallback to Google TTS
                              provider === 'elevenlabs' ? ['elevenlabs', 'gtts'] : // ElevenLabs fallback to Google TTS
                              [provider];
        
        // Try providers in order with fallback (silently, no progress updates for each attempt)
        for (const currentProvider of providersToTry) {
            const providerName = TTS_PROVIDERS[currentProvider]?.name || currentProvider;
            
            try {
                switch (currentProvider) {
                    case 'edge':
                        // Use appropriate Edge TTS voice - respect user choice or use default
                        let edgeVoice = voice;
                        if (provider === 'auto') {
                            // For auto mode, use language-appropriate default
                            edgeVoice = TTS_PROVIDERS.edge.voices[language]?.[0] || voice;
                        }
                        // For explicit edge provider, use the voice as set (either user-selected or default)
                        audioBuffer = await tryEdgeTTS(text, edgeVoice);
                        break;
                    case 'groq':
                        // For Groq, ensure we have a valid voice or use default
                        const groqVoice = groqVoices.includes(voice) ? voice : 'Fritz-PlayAI';
                        audioBuffer = await tryGroqTTS(text, groqVoice);
                        break;
                    case 'gtts':
                        // Adjust language for Google TTS
                        let gLang = language;
                        if (voiceOptions.male && ['en', 'fr', 'es'].includes(language)) {
                            switch(language) {
                                case 'en': gLang = voiceOptions.male ? 'en-uk' : 'en-us'; break;
                                case 'fr': gLang = voiceOptions.male ? 'fr-ca' : 'fr-fr'; break;
                                case 'es': gLang = voiceOptions.male ? 'es-mx' : 'es-es'; break;
                            }
                        }
                        audioBuffer = await tryGoogleTTS(text, gLang, voiceOptions);
                        break;
                    case 'elevenlabs':
                        // For ElevenLabs, ensure we have a valid voice or use default
                        const elevenVoice = elevenVoices.includes(voice) ? voice : 'rachel';
                        audioBuffer = await tryElevenLabsTTS(text, elevenVoice);
                        break;
                }
                
                if (audioBuffer) {
                    usedProvider = providerName;
                    break;
                }
            } catch (error) {
                console.log(`${currentProvider} TTS failed:`, error.message);
                continue;
            }
        }
        
        if (!audioBuffer) {
            // Edit progress message to show failure
            try {
                await sock.sendMessage(chatId, {
                    text: getText(senderId, 'TTS_ALL_FAILED', userLang) || '❌ Tous les fournisseurs TTS ont échoué. Réessayez plus tard.',
                    edit: progressMsg.key
                });
            } catch (e) {
                console.log('Could not edit progress message for failure');
            }
            return;
        }
        
        // Save audio buffer to file
        const fileName = `tts-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, '..', 'assets', fileName);
        
        // Ensure assets directory exists
        const assetsDir = path.dirname(filePath);
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, audioBuffer);
        
        // Edit progress message to show success
        const successMsg = getText(senderId, 'TTS_SUCCESS', userLang)?.replace('{provider}', usedProvider) || `✅ Audio généré avec ${usedProvider}`;
        const promptText = text.length > 50 ? text.substring(0, 50) + '...' : text;
        const finalMsg = `${successMsg}\n🗣️ "${promptText}"`;
        
        try {
            await sock.sendMessage(chatId, {
                text: finalMsg,
                edit: progressMsg.key
            });
        } catch (e) {
            console.log('Could not edit progress message for success');
        }
        
        // Send audio directly as audio (no caption, no document)
        try {
            await sock.sendMessage(chatId, {
                audio: fs.readFileSync(filePath),
                mimetype: 'audio/mpeg'
            }, { quoted: message });
            console.log(`✅ TTS sent as audio using ${usedProvider}`);
        } catch (audioError) {
            console.error('Audio sending failed:', audioError);
            throw audioError;
        }
        
        // Clean up file after sending
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                console.error('Error cleaning up TTS file:', e);
            }
        }, 5000);
        
    } catch (error) {
        console.error('TTS Command Error:', error);
        await sock.sendMessage(chatId, { 
            text: getText(senderId, 'TTS_ERROR', userLang) || '❌ Erreur lors de la génération audio. Réessayez.',
            quoted: message 
        });
    }
}

module.exports = ttsCommand;
