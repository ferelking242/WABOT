const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getText, getUserLanguage } = require('../../lib/languages');

async function tsCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Parse service argument
        const service = args[0] || 'auto';
        const validServices = ['groq', 'whisper', 'hf', 'auto'];
        
        if (!validServices.includes(service)) {
            const errorMsg = getText(senderId, 'TS_INVALID_SERVICE', userLang);
            await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
            return;
        }
        
        // Check if replying to a message with audio/video
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage) {
            const helpMsg = `${getText(senderId, 'TS_TITLE', userLang)}

${getText(senderId, 'TS_USAGE', userLang)}

${getText(senderId, 'TS_SERVICES', userLang)}
${getText(senderId, 'TS_SERVICE_GROQ', userLang)}
${getText(senderId, 'TS_SERVICE_WHISPER', userLang)}
${getText(senderId, 'TS_SERVICE_HF', userLang)}
${getText(senderId, 'TS_SERVICE_AUTO', userLang)}

${getText(senderId, 'TS_EXAMPLES', userLang)}
${getText(senderId, 'TS_EXAMPLE_1', userLang)}
${getText(senderId, 'TS_EXAMPLE_2', userLang)}
${getText(senderId, 'TS_EXAMPLE_3', userLang)}`;
            
            await sock.sendMessage(chatId, { text: helpMsg, quoted: message });
            return;
        }

        // Check if the quoted message contains audio or video
        const audioMessage = quotedMessage.audioMessage;
        const videoMessage = quotedMessage.videoMessage;
        
        if (!audioMessage && !videoMessage) {
            const errorMsg = getText(senderId, 'TS_NO_MEDIA', userLang);
            await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
            return;
        }

        // Send processing message
        const processingMsg = getText(senderId, 'TS_PROCESSING', userLang, { service: service.toUpperCase() });
        const processingMsgSent = await sock.sendMessage(chatId, { text: processingMsg, quoted: message });

        // Download media
        const mediaType = audioMessage ? 'audio' : 'video';
        const mediaMessage = audioMessage || videoMessage;
        const tempDir = './data/tmp';
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filePath = path.join(tempDir, `ts_${Date.now()}.${mediaType === 'audio' ? 'm4a' : 'mp4'}`);
        
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        fs.writeFileSync(filePath, buffer);

        let transcription = null;
        let usedService = service;

        // Try transcription with selected service
        if (service === 'groq' || service === 'auto') {
            transcription = await tryGroqTranscription(filePath);
            if (transcription) usedService = 'Groq AI';
        }
        
        if (!transcription && (service === 'whisper' || service === 'auto')) {
            transcription = await tryWhisperTranscription(filePath);
            if (transcription) usedService = 'Whisper';
        }
        
        if (!transcription && (service === 'hf' || service === 'auto')) {
            transcription = await tryHuggingFaceTranscription(filePath);
            if (transcription) usedService = 'Hugging Face';
        }

        // Clean up temp file
        try {
            fs.unlinkSync(filePath);
        } catch (e) {}

        // Delete processing message
        await sock.sendMessage(chatId, { delete: processingMsgSent.key });

        if (!transcription) {
            const errorMsg = getText(senderId, 'TS_ALL_FAILED', userLang);
            await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
            return;
        }

        // Send transcription result
        const successMsg = getText(senderId, 'TS_SUCCESS', userLang, { service: usedService });
        await sock.sendMessage(chatId, { 
            text: `${successMsg}\n\n"${transcription.trim()}"`,
            quoted: message 
        });

    } catch (error) {
        console.error('Error in ts command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid;
        const userLang = getUserLanguage(senderId);
        const errorMsg = getText(senderId, 'TS_ALL_FAILED', userLang);
        
        await sock.sendMessage(chatId, { text: errorMsg, quoted: message });
    }
}

async function tryGroqTranscription(filePath) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', fs.createReadStream(filePath));
        form.append('model', 'whisper-large-v3');
        form.append('response_format', 'json');
        
        const response = await fetch(`${global.GROQ_API_URL}/audio/transcriptions`, {
            method: 'POST',
            body: form,
            headers: {
                'Authorization': `Bearer ${global.GROQ_API_KEY}`,
                ...form.getHeaders()
            },
            timeout: 60000
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.text;
        }
    } catch (error) {
        console.log('Groq transcription failed:', error.message);
    }
    return null;
}

async function tryWhisperTranscription(filePath) {
    try {
        // Try OpenAI Whisper API (if available)
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', fs.createReadStream(filePath));
        form.append('model', 'whisper-1');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            body: form,
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'dummy'}`,
                ...form.getHeaders()
            },
            timeout: 60000
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.text;
        }
    } catch (error) {
        console.log('Whisper transcription failed:', error.message);
    }
    return null;
}

async function tryHuggingFaceTranscription(filePath) {
    try {
        const audioBuffer = fs.readFileSync(filePath);
        
        const response = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
            body: audioBuffer,
            timeout: 120000
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.text;
        }
    } catch (error) {
        console.log('Hugging Face transcription failed:', error.message);
    }
    return null;
}

module.exports = tsCommand;