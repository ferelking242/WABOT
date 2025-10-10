const sharp = require('sharp');
const fs = require('fs');
const fsPromises = require('fs/promises');
const fse = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getText, getUserLanguage } = require('../../lib/languages');

const tempDir = './data/tmp';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const scheduleFileDeletion = (filePath) => {
    setTimeout(async () => {
        try {
            await fse.remove(filePath);
            console.log(`File deleted: ${filePath}`);
        } catch (error) {
            console.error(`Failed to delete file:`, error);
        }
    }, 10000);
};

// Fonction pour vérifier si un sticker WebP est animé
const isAnimatedWebP = (buffer) => {
    if (!buffer.slice(0, 4).equals(Buffer.from('RIFF'))) return false;
    if (!buffer.slice(8, 12).equals(Buffer.from('WEBP'))) return false;
    
    const animMarker = Buffer.from('ANIM');
    const anmfMarker = Buffer.from('ANMF');
    const vp8xMarker = Buffer.from('VP8X');
    
    return buffer.includes(animMarker) || buffer.includes(anmfMarker) || buffer.includes(vp8xMarker);
};

const convertStickerToImage = async (sock, quotedMessage, chatId, message) => {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const stickerMessage = quotedMessage.stickerMessage;
        if (!stickerMessage) {
            const errorMsg = getText(senderId, 'SIMAGE_REPLY_TO_STICKER');
            await sock.sendMessage(chatId, { text: `❌ ${errorMsg}` });
            return;
        }

        const stickerFilePath = path.join(tempDir, `sticker_${Date.now()}.webp`);
        
        const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await fsPromises.writeFile(stickerFilePath, buffer);

        // Vérifier si le sticker est animé
        const isAnimated = isAnimatedWebP(buffer);
        
        const outputImagePath = path.join(tempDir, `converted_image_${Date.now()}.png`);
        
        if (isAnimated) {
            // Pour les stickers animés, extraire la première frame avec ffmpeg
            console.log('Converting animated sticker to image (first frame)...');
            const { exec } = require('child_process');
            
            try {
                await new Promise((resolve, reject) => {
                    const command = `ffmpeg -y -i "${stickerFilePath}" -vframes 1 -vf "scale=512:512" "${outputImagePath}"`;
                    exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
                        if (error) {
                            console.log('FFmpeg failed, trying sharp fallback...');
                            // Fallback: utiliser sharp pour extraire une frame
                            sharp(stickerFilePath)
                                .toFormat('png')
                                .toFile(outputImagePath)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (e) {
                console.log('Animated conversion failed, trying sharp anyway...');
                await sharp(stickerFilePath).toFormat('png').toFile(outputImagePath);
            }
        } else {
            // Convertir le sticker statique en image PNG avec sharp
            await sharp(stickerFilePath).toFormat('png').toFile(outputImagePath);
        }

        const imageBuffer = await fsPromises.readFile(outputImagePath);
        const imageSizeKB = Math.round(imageBuffer.length / 1024);
        
        const successMsg = getText(senderId, 'SIMAGE_SUCCESS');
        await sock.sendMessage(chatId, { 
            image: imageBuffer, 
            caption: `🖼️ ${successMsg} (${imageSizeKB}KB)`
        });

        scheduleFileDeletion(stickerFilePath);
        scheduleFileDeletion(outputImagePath);

    } catch (error) {
        console.error('Error converting sticker to image:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid || 'unknown';
        const errorMsg = getText(senderId, 'SIMAGE_ERROR');
        await sock.sendMessage(chatId, { text: `❌ ${errorMsg}` });
    }
};

module.exports = convertStickerToImage;
