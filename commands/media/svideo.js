const fs = require('fs');
const fsPromises = require('fs/promises');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getText, getUserLanguage } = require('../../lib/languages');

const os = require('os');
const tempDir = process.env.WABOT_TEMP_DIR || require('path').join(os.tmpdir(), 'wabot-tmp');
try { if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true }); } catch (_) {}

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

// Meilleure fonction pour vérifier si un sticker WebP est animé
const isAnimatedWebP = (buffer) => {
    // Vérifier signature WebP
    if (!buffer.slice(0, 4).equals(Buffer.from('RIFF'))) return false;
    if (!buffer.slice(8, 12).equals(Buffer.from('WEBP'))) return false;
    
    // Chercher les chunks d'animation
    const animMarker = Buffer.from('ANIM');
    const anmfMarker = Buffer.from('ANMF');
    const vp8xMarker = Buffer.from('VP8X');
    
    return buffer.includes(animMarker) || buffer.includes(anmfMarker) || buffer.includes(vp8xMarker);
};

const convertStickerToVideo = async (sock, quotedMessage, chatId, message) => {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const stickerMessage = quotedMessage.stickerMessage;
        if (!stickerMessage) {
            const errorMsg = getText(senderId, 'SVIDEO_REPLY_TO_STICKER');
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
        
        if (!isAnimated) {
            const errorMsg = getText(senderId, 'SVIDEO_NOT_ANIMATED');
            await sock.sendMessage(chatId, { text: `❌ ${errorMsg}` });
            scheduleFileDeletion(stickerFilePath);
            return;
        }

        // Convertir le sticker animé en vidéo MP4 avec méthode améliorée
        const outputVideoPath = path.join(tempDir, `converted_video_${Date.now()}.mp4`);
        
        // NOUVELLE APPROCHE : Utiliser un outil spécialisé pour WebP animés
        console.log('Converting animated sticker to video...');
        
        // Essayer plusieurs méthodes de conversion améliorées
        const conversionMethods = [
            // Méthode 1: Conversion directe simple avec installation ffmpeg
            `/nix/store/15alrig3q4xjwfc3rbnsgj4bj29zn6ww-ffmpeg-7.1.1-bin/bin/ffmpeg -y -i "${stickerFilePath}" -vf "scale=512:512:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -r 15 -movflags +faststart "${outputVideoPath}"`,
            
            // Méthode 2: Avec paramètres d'animation
            `ffmpeg -y -i "${stickerFilePath}" -vf "scale=512:512" -c:v libx264 -pix_fmt yuv420p -r 12 -crf 25 -preset fast "${outputVideoPath}"`,
            
            // Méthode 3: Extraction forcée des frames
            `ffmpeg -y -i "${stickerFilePath}" -vf "scale=512:512,fps=10" -c:v libx264 -pix_fmt yuv420p -t 5 "${outputVideoPath}"`,
            
            // Méthode 4: Conversion avec loop (pour stickers courts)
            `ffmpeg -y -stream_loop 2 -i "${stickerFilePath}" -vf "scale=512:512" -c:v libx264 -pix_fmt yuv420p -t 4 "${outputVideoPath}"`
        ];
        
        let conversionSuccess = false;
        
        for (let i = 0; i < conversionMethods.length && !conversionSuccess; i++) {
            try {
                console.log(`Trying conversion method ${i + 1}...`);
                
                await new Promise((resolve, reject) => {
                    exec(conversionMethods[i], { timeout: 30000 }, (error, stdout, stderr) => {
                        setTimeout(() => {
                            if (fs.existsSync(outputVideoPath) && fs.statSync(outputVideoPath).size > 1000) {
                                console.log(`✅ Method ${i + 1} successful`);
                                conversionSuccess = true;
                                resolve();
                            } else {
                                reject(new Error(`Method ${i + 1} failed`));
                            }
                        }, 1500);
                    });
                });
                
                if (conversionSuccess) break;
                
            } catch (e) {
                console.log(`Method ${i + 1} failed: ${e.message}`);
                // Clean up failed attempt
                if (fs.existsSync(outputVideoPath)) {
                    fs.unlinkSync(outputVideoPath);
                }
            }
        }
        
        // Si toutes les méthodes échouent, essayer une dernière fois avec frame statique
        if (!conversionSuccess) {
            console.log('All animated methods failed, creating static video...');
            try {
                const tempFrame = path.join(tempDir, `frame_${Date.now()}.png`);
                const staticCommand = `ffmpeg -y -i "${stickerFilePath}" -vframes 1 "${tempFrame}" && ffmpeg -y -loop 1 -i "${tempFrame}" -c:v libx264 -t 3 -pix_fmt yuv420p -r 10 "${outputVideoPath}"`;
                
                await new Promise((resolve, reject) => {
                    exec(staticCommand, { timeout: 20000 }, (error) => {
                        setTimeout(() => {
                            if (fs.existsSync(outputVideoPath) && fs.statSync(outputVideoPath).size > 1000) {
                                console.log('✅ Static video created successfully');
                                conversionSuccess = true;
                                resolve();
                            } else {
                                reject(new Error('Static video creation failed'));
                            }
                        }, 1000);
                    });
                });
                
                // Cleanup temp frame
                if (fs.existsSync(tempFrame)) {
                    fs.unlinkSync(tempFrame);
                }
            } catch (staticError) {
                console.log('Even static video creation failed:', staticError.message);
            }
        }

        // Vérifier si le fichier vidéo a été créé
        if (!fs.existsSync(outputVideoPath)) {
            const errorMsg = getText(senderId, 'SVIDEO_CONVERSION_FAILED');
            await sock.sendMessage(chatId, { text: `❌ ${errorMsg}` });
            scheduleFileDeletion(stickerFilePath);
            return;
        }

        const videoBuffer = await fsPromises.readFile(outputVideoPath);
        const videoSizeKB = Math.round(videoBuffer.length / 1024);
        
        console.log(`Vidéo créée: ${videoSizeKB}KB`);

        const successMsg = getText(senderId, 'SVIDEO_SUCCESS');
        await sock.sendMessage(chatId, { 
            video: videoBuffer, 
            caption: `🎥 ${successMsg} (${videoSizeKB}KB)`,
            mimetype: 'video/mp4'
        });

        scheduleFileDeletion(stickerFilePath);
        scheduleFileDeletion(outputVideoPath);

    } catch (error) {
        console.error('Error converting sticker to video:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid || 'unknown';
        const errorMsg = getText(senderId, 'SVIDEO_ERROR');
        await sock.sendMessage(chatId, { text: `❌ ${errorMsg}` });
    }
};

module.exports = convertStickerToVideo;