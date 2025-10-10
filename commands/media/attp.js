const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const temp = require('../../lib/temp');
const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');

async function attpCommand(sock, chatId, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    const userMessage = message.message.conversation || message.message.extendedTextMessage?.text || '';
    const text = userMessage.split(' ').slice(1).join(' ');

    if (!text) {
        const errorMsg = i18n.t(senderId, 'messages.attp_provide_text');
        await sock.sendMessage(chatId, { text: errorMsg });
        return;
    }

    const width = 512;
    const height = 512;
    const stickerPath = temp.getTempPath({ ext: '.png', prefix: 'attp_sticker' });

    try {
        // Utiliser une approche plus simple avec Sharp pour éviter les erreurs Jimp
        const textSvg = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="white"/>
            <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
                  text-anchor="middle" dominant-baseline="middle" fill="black">${text}</text>
        </svg>`;
        
        const svgBuffer = Buffer.from(textSvg);
        const imageBuffer = await sharp(svgBuffer)
            .resize(512, 512)
            .png()
            .toBuffer();
        
        fs.writeFileSync(stickerPath, imageBuffer);

        const stickerBuffer = await sharp(stickerPath)
            .resize(512, 512, { fit: 'cover' })
            .webp()
            .toBuffer();

        // Envoyer le sticker animé
        await sock.sendMessage(chatId, {
            sticker: stickerBuffer,
            mimetype: 'image/webp',
            packname: '🤖 wabot Stickers', 
            author: '⚙️ CodeCraft', 
        });
        
        // Message de succès
        const successMsg = i18n.t(senderId, 'messages.attp_success');
        await sock.sendMessage(chatId, { text: successMsg });

        temp.cleanup(stickerPath);
    } catch (error) {
        console.error('Error generating ATTP sticker:', error);
        const errorMsg = i18n.t(senderId, 'messages.attp_failed');
        await sock.sendMessage(chatId, { text: errorMsg });
        // Nettoyer le fichier temporaire en cas d'erreur
        if (fs.existsSync(stickerPath)) {
            temp.cleanup(stickerPath);
        }
    }
}

module.exports = attpCommand;
