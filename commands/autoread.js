/**
 * Wabot - A WhatsApp Bot
 * Autoread Command - Automatically read all messages
 */

const { db } = require('../lib/database');
const { getText } = require('../lib/i18n');

// Get configuration from database
async function getConfig() {
    try {
        const config = await db.getBotConfig('autoread');
        return config || { enabled: false };
    } catch (error) {
        console.error('Error getting autoread config:', error);
        return { enabled: false };
    }
}

// Save configuration to database
async function saveConfig(config) {
    try {
        return await db.setBotConfig('autoread', config);
    } catch (error) {
        console.error('Error saving autoread config:', error);
        return false;
    }
}

// Toggle autoread feature
async function autoreadCommand(sock, chatId, message) {
    const userId = message.key.remoteJid;
    
    try {
        // ✅ VÉRIFICATION PERMISSIONS - Propriétaire principal/sudo OU propriétaire de companion
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const { isOwnerOrSudo, hasExtendedPermissions } = require('../lib/isOwner');
        const isMainOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!isMainOwnerOrSudo) {
            // ✅ CORRECTION: Passer sock et chatId pour les vérifications en groupe
            const permissions = await hasExtendedPermissions(senderId, sock, chatId);
            if (!permissions.hasPermission) {
                await sock.sendMessage(chatId, {
                    text: getText(userId, 'messages.owner_only')
                });
                return;
            }
        }

        // Get command arguments
        const args = message.message?.conversation?.trim().split(' ').slice(1) || 
                    message.message?.extendedTextMessage?.text?.trim().split(' ').slice(1) || 
                    [];
        
        // Get config from database
        const config = await getConfig();
        
        // Toggle based on argument or toggle current state if no argument
        if (args.length > 0) {
            const action = args[0].toLowerCase();
            if (action === 'on' || action === 'enable') {
                config.enabled = true;
            } else if (action === 'off' || action === 'disable') {
                config.enabled = false;
            } else {
                await sock.sendMessage(chatId, {
                    text: getText(userId, 'messages.error') + ' ' + getText(userId, 'autoread.invalid_option')
                });
                return;
            }
        } else {
            // Toggle current state
            config.enabled = !config.enabled;
        }
        
        // Save updated configuration
        await saveConfig(config);
        
        // Send confirmation message
        await sock.sendMessage(chatId, {
            text: `✅ Auto-read has been ${config.enabled ? 'enabled' : 'disabled'}!`
        });
        
    } catch (error) {
        console.error('Error in autoread command:', error);
        await sock.sendMessage(chatId, {
            text: getText(userId, 'messages.processing_error')
        });
    }
}

// Function to check if autoread is enabled
async function isAutoreadEnabled() {
    try {
        const config = await getConfig();
        return config.enabled;
    } catch (error) {
        console.error('Error checking autoread status:', error);
        return false;
    }
}

// Function to check if bot is mentioned in a message
function isBotMentionedInMessage(message, botNumber) {
    if (!message.message) return false;
    
    // Check for mentions in contextInfo (works for all message types)
    const messageTypes = [
        'extendedTextMessage', 'imageMessage', 'videoMessage', 'stickerMessage',
        'documentMessage', 'audioMessage', 'contactMessage', 'locationMessage'
    ];
    
    // Check for explicit mentions in mentionedJid array
    for (const type of messageTypes) {
        if (message.message[type]?.contextInfo?.mentionedJid) {
            const mentionedJid = message.message[type].contextInfo.mentionedJid;
            if (mentionedJid.some(jid => jid === botNumber)) {
                return true;
            }
        }
    }
    
    // Check for text mentions in various message types
    const textContent = 
        message.message.conversation || 
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        message.message.videoMessage?.caption || '';
    
    if (textContent) {
        // Check for @mention format
        const botUsername = botNumber.split('@')[0];
        if (textContent.includes(`@${botUsername}`)) {
            return true;
        }
        
        // Check for bot name mentions (optional, can be customized)
        const botNames = [global.botname?.toLowerCase(), 'bot', 'wabot'];
        const words = textContent.toLowerCase().split(/\s+/);
        if (botNames.some(name => words.includes(name))) {
            return true;
        }
    }
    
    return false;
}

// Function to handle autoread functionality
async function handleAutoread(sock, message) {
    if (isAutoreadEnabled()) {
        // Get bot's ID
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // Check if bot is mentioned
        const isBotMentioned = isBotMentionedInMessage(message, botNumber);
        
        // If bot is mentioned, read the message internally but don't mark as read in UI
        if (isBotMentioned) {
            
            // We don't call sock.readMessages() here, so the message stays unread in the UI
            return false; // Indicates message was not marked as read
        } else {
            // For regular messages, mark as read normally
            const key = { remoteJid: message.key.remoteJid, id: message.key.id, participant: message.key.participant };
            await sock.readMessages([key]);
            //console.log('✅ Marked message as read from ' + (message.key.participantAlt || message.key.participant || message.key.remoteJid).split('@')[0]);
            return true; // Indicates message was marked as read
        }
    }
    return false; // Autoread is disabled
}

module.exports = {
    autoreadCommand,
    isAutoreadEnabled,
    isBotMentionedInMessage,
    handleAutoread
};