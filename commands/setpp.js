const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function setProfilePicture(sock, chatId, msg) {
    try {
        // ✅ VÉRIFICATION PERMISSIONS - Propriétaire principal OU propriétaire de companion
        const senderId = msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;
        const { isOwnerOrSudo, hasExtendedPermissions } = require('../lib/isOwner');
        const isMainOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        let targetSocket = sock; // Par défaut, utiliser le socket principal
        let targetName = 'bot principal';
        
        if (!isMainOwner) {
            // Vérifier si c'est un propriétaire de companion
            const permissions = await hasExtendedPermissions(senderId, sock, chatId);
            if (!permissions.hasPermission || permissions.type !== 'companion_owner') {
                await sock.sendMessage(chatId, {
                    text: '❌ *Permission refusée*\n\nSeuls le propriétaire du bot et les propriétaires de companions peuvent changer les photos de profil.'
                });
                return;
            }
            
            // Trouver le companion actif de cet utilisateur
            const companionManager = require('../commands/companion').initCompanionManager();
            const userCompanions = permissions.companions || [];
            
            if (userCompanions.length === 0) {
                await sock.sendMessage(chatId, {
                    text: '❌ *Aucun companion trouvé*\n\nVous n\'avez aucun companion créé.'
                });
                return;
            }
            
            // ✅ CORRECTION: Utiliser la méthode findSessionByName du manager
            let activeCompanion = null;
            for (const companion of userCompanions) {
                const sessionResult = companionManager.findSessionByName(companion.companion_name, { includeInactive: false });
                if (sessionResult && sessionResult.type === 'active') {
                    const companionSocket = companionManager.activeSessions.get(sessionResult.sessionId);
                    if (companionSocket && companionSocket.user) {
                        activeCompanion = { companion, socket: companionSocket };
                        break;
                    }
                }
            }
            
            if (!activeCompanion) {
                await sock.sendMessage(chatId, {
                    text: '❌ *Companion non connecté*\n\nAucun de vos companions n\'est actuellement connecté.\n\n💡 Utilisez `.companion wake [nom]` pour réveiller votre companion.'
                });
                return;
            }
            
            targetSocket = activeCompanion.socket;
            targetName = `companion "${activeCompanion.companion.companion_name}"`;
        }

        // Check if message is a reply
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMessage) {
            await sock.sendMessage(chatId, { 
                text: `⚠️ *Répondez à une image avec .setpp !*\n\n📸 Pour changer la photo de profil de **${targetName}**, répondez à une image avec cette commande.` 
            });
            return;
        }

        // Check if quoted message contains an image
        const imageMessage = quotedMessage.imageMessage || quotedMessage.stickerMessage;
        if (!imageMessage) {
            await sock.sendMessage(chatId, { 
                text: `❌ *Message invalide*\n\nLe message cité doit contenir une image pour changer la photo de profil de **${targetName}**.` 
            });
            return;
        }

        // Create tmp directory if it doesn't exist
        const tmpDir = path.join(process.cwd(), 'data/tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Download the image
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const imagePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);
        
        // Save the image
        fs.writeFileSync(imagePath, buffer);

        // Set the profile picture using the appropriate socket
        await targetSocket.updateProfilePicture(targetSocket.user.id, { url: imagePath });

        // Clean up the temporary file
        fs.unlinkSync(imagePath);

        await sock.sendMessage(chatId, { 
            text: `✅ *Photo de profil mise à jour avec succès !*\n\n🤖 **Target:** ${targetName}` 
        });

    } catch (error) {
        console.error('Error in setpp command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Échec de la mise à jour de la photo de profil !*\n\nUne erreur s\'est produite lors du changement de la photo de profil.' 
        });
    }
}

module.exports = setProfilePicture; 