const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getUserLanguage, getText } = require('../../lib/languages');

async function transcribeCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Check if replying to a message with audio/video
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage) {
            const helpMsg = getText(senderId, 'TRANSCRIBE_USAGE', userLang) || 
                "🎤 *Audio/Video Transcription*\n\nReply to an audio message or video with *.transcribe* to convert it to text\n\nSupported formats:\n• Audio messages\n• Voice notes\n• Videos with audio\n\nExample:\n*Reply to audio* --> .transcribe";
            
            await sock.sendMessage(chatId, { text: helpMsg, quoted: message });
            return;
        }

        // Check if the quoted message contains audio or video
        const audioMessage = quotedMessage.audioMessage;
        const videoMessage = quotedMessage.videoMessage;
        
        if (!audioMessage && !videoMessage) {
            const errorMsg = getText(senderId, 'TRANSCRIBE_NO_MEDIA', userLang) || 
                "❌ Please reply to an audio message or video to transcribe it.";
            
            await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
            return;
        }

        // Show processing message
        await sock.sendMessage(chatId, { 
            text: getText(senderId, 'TRANSCRIBE_PROCESSING', userLang) || "🔄 Transcribing audio to text... Please wait.",
            quoted: message 
        });

        // Download the media
        const mediaType = audioMessage ? 'audio' : 'video';
        const mediaMessage = audioMessage || videoMessage;
        const tempDir = process.env.WABOT_TEMP_DIR || require('path').join(require('os').tmpdir(), 'wabot-tmp');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filePath = path.join(tempDir, `transcribe_${Date.now()}.${mediaType === 'audio' ? 'm4a' : 'mp4'}`);
        
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        fs.writeFileSync(filePath, buffer);
        console.log(`📁 Fichier audio téléchargé: ${filePath} (${buffer.length} bytes)`);
        
        // Try multiple transcription APIs
        const transcriptionAPIs = [
            {
                url: `https://api.assemblyai.com/v2/upload`,
                uploadUrl: `https://api.assemblyai.com/v2/transcript`,
                headers: { 'authorization': process.env.ASSEMBLYAI_KEY || 'free-trial-key' }
            },
            {
                url: `https://api.wit.ai/speech`,
                headers: { 'Authorization': `Bearer ${process.env.WIT_AI_TOKEN || 'demo-token'}` }
            },
            {
                url: `https://api.openai.com/v1/audio/transcriptions`,
                headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-demo'}` }
            }
        ];
        
        let transcription = null;
        
        for (let i = 0; i < transcriptionAPIs.length; i++) {
            const api = transcriptionAPIs[i];
            console.log(`🔄 Tentative API ${i + 1}:`, api.url);
            try {
                const FormData = require('form-data');
                const form = new FormData();
                
                if (i === 0) { // AssemblyAI-style API
                    form.append('audio_file', fs.createReadStream(filePath));
                    form.append('speech_model', 'nano');
                } else if (i === 1) { // Wit.ai style
                    form.append('audio', fs.createReadStream(filePath));
                } else { // OpenAI Whisper style
                    form.append('file', fs.createReadStream(filePath));
                    form.append('model', 'whisper-1');
                }
                
                const response = await fetch(api.url, {
                    method: 'POST',
                    body: form,
                    headers: api.headers,
                    timeout: 90000
                });
                
                console.log(`📊 API ${i + 1} response status:`, response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`📋 API ${i + 1} response data:`, JSON.stringify(data).slice(0, 200));
                    transcription = data.text || data.transcription || data.transcript || data.result;
                    if (transcription && transcription.trim().length > 0) {
                        console.log(`✅ Transcription successful with API ${i + 1}`);
                        break;
                    }
                } else {
                    const errorText = await response.text();
                    console.log(`❌ API ${i + 1} error:`, response.status, errorText.slice(0, 200));
                }
            } catch (e) {
                console.log(`❌ Transcription API ${i + 1} failed:`, e.message);
                continue;
            }
        }
        
        // Fallback to working free services
        if (!transcription) {
            console.log('🔄 Tentative des services gratuits qui fonctionnent...');
            
            // 1. Hugging Face Inference API - Whisper Large V3 (LE MEILLEUR!)
            try {
                console.log('🤖 Tentative Hugging Face Whisper...');
                const audioBuffer = fs.readFileSync(filePath);
                
                const response = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                    },
                    body: audioBuffer,
                    timeout: 120000
                });
                
                console.log(`📊 Hugging Face status:`, response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`📋 Hugging Face response:`, JSON.stringify(data).slice(0, 200));
                    transcription = data.text || data.transcript;
                    if (transcription && transcription.trim().length > 0) {
                        console.log(`✅ Transcription réussie avec Hugging Face!`);
                    }
                } else {
                    const errorText = await response.text();
                    console.log(`❌ Hugging Face error:`, response.status, errorText.slice(0, 200));
                }
            } catch (e) {
                console.log(`❌ Hugging Face failed:`, e.message);
            }
            
            // 2. Services alternatifs gratuits qui marchent
            if (!transcription) {
                const workingAPIs = [
                    'https://api.replicate.com/v1/predictions',
                    'https://api.deepgram.com/v1/listen',
                    'https://transcribe.glasp.co/api/transcribe'
                ];
                
                for (const apiUrl of workingAPIs) {
                    console.log(`🔄 Tentative service alternatif:`, apiUrl);
                    try {
                        const FormData = require('form-data');
                        const form = new FormData();
                        form.append('audio', fs.createReadStream(filePath));
                        
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            body: form,
                            timeout: 60000
                        });
                        
                        console.log(`📊 Service ${apiUrl} status:`, response.status);
                        
                        if (response.ok) {
                            const data = await response.json();
                            console.log(`📋 Service response:`, JSON.stringify(data).slice(0, 200));
                            transcription = data.text || data.result || data.transcription || data.transcript;
                            if (transcription && transcription.trim().length > 0) {
                                console.log(`✅ Transcription réussie avec:`, apiUrl);
                                break;
                            }
                        }
                    } catch (e) {
                        console.log(`❌ Service ${apiUrl} failed:`, e.message);
                        continue;
                    }
                }
            }
        }
        
        // Clean up temp file
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error('Error cleaning up temp file:', e);
        }
        
        if (!transcription) {
            // Fallback message
            const errorMsg = getText(senderId, 'TRANSCRIBE_ERROR', userLang) || 
                "❌ Sorry, I couldn't transcribe the audio. The audio might be unclear or the service is temporarily unavailable.\n\n💡 Try with a clearer audio recording.";
            
            await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
            return;
        }
        
        // Send transcription result
        const successMsg = getText(senderId, 'TRANSCRIBE_SUCCESS', userLang) || "🎤 *Audio Transcription:*";
        await sock.sendMessage(chatId, { 
            text: `${successMsg}\n\n"${transcription.trim()}"`,
            quoted: message 
        });
        
    } catch (error) {
        console.error('Error in transcribe command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = getText(senderId, 'TRANSCRIBE_ERROR', userLang) || 
            "❌ An error occurred while transcribing. Please try again.";
        
        await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
    }
}

module.exports = transcribeCommand;