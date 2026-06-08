/**
 * 🤖 *wabot* - A WhatsApp Bot
 * Autotyping Command - Shows fake typing status
 */

const { db } = require('../lib/database');

// Get configuration from database
async function getConfig() {
    try {
        const config = await db.getBotConfig('autotyping');
        return config || { enabled: false };
    } catch (error) {
        console.error('Error getting autotyping config:', error);
        return { enabled: false };
    }
}

// Save configuration to database
async function saveConfig(config) {
    try {
        return await db.setBotConfig('autotyping', config);
    } catch (error) {
        console.error('Error saving autotyping config:', error);
        return false;
    }
}

// Toggle autotyping feature
async function autotypingCommand(sock, chatId, message) {
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
                    text: '❌ This command is only available for the owner!'
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
                    text: '❌ Invalid option! Use: .autotyping on/off'
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
            text: `✅ Auto-typing has been ${config.enabled ? 'enabled' : 'disabled'}!`
        });
        
    } catch (error) {
        console.error('Error in autotyping command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error processing command!'
        });
    }
}

// Get configuration from database
async function getConfig() {
    try {
        const { db } = require('../lib/database');
        const config = await db.getBotConfig('autotyping');
        return config || { enabled: false };
    } catch (error) {
        console.error('Error getting autotyping config:', error);
        return { enabled: false };
    }
}

// Function to check if autotyping is enabled
async function isAutotypingEnabled() {
    try {
        const config = await getConfig();
        return config.enabled;
    } catch (error) {
        console.error('Error checking autotyping status:', error);
        return false;
    }
}

// Function to handle autotyping for regular messages
async function handleAutotypingForMessage(sock, chatId, userMessage) {
    if (await isAutotypingEnabled()) {
        try {
            // First subscribe to presence updates for this chat
            await sock.presenceSubscribe(chatId);
            
            // Send available status first
            await sock.sendPresenceUpdate('available', chatId);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then send the composing status
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Simulate typing time based on message length with increased minimum time
            const typingDelay = Math.max(3000, Math.min(8000, userMessage.length * 150));
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            // Send composing again to ensure it stays visible
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Finally send paused status
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true; // Indicates typing was shown
        } catch (error) {
            console.error('❌ Error sending typing indicator:', error);
            return false; // Indicates typing failed
        }
    }
    return false; // Autotyping is disabled
}

// Function to handle autotyping for commands - BEFORE command execution (not used anymore)
async function handleAutotypingForCommand(sock, chatId) {
    if (await isAutotypingEnabled()) {
        try {
            // First subscribe to presence updates for this chat
            await sock.presenceSubscribe(chatId);
            
            // Send available status first
            await sock.sendPresenceUpdate('available', chatId);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then send the composing status
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Keep typing indicator active for commands with increased duration
            const commandTypingDelay = 3000;
            await new Promise(resolve => setTimeout(resolve, commandTypingDelay));
            
            // Send composing again to ensure it stays visible
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Finally send paused status
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true; // Indicates typing was shown
        } catch (error) {
            console.error('❌ Error sending command typing indicator:', error);
            return false; // Indicates typing failed
        }
    }
    return false; // Autotyping is disabled
}

// Function to show typing status AFTER command execution
async function showTypingAfterCommand(sock, chatId) {
    if (await isAutotypingEnabled()) {
        try {
            // This function runs after the command has been executed and response sent
            // So we just need to show a brief typing indicator
            
            // Subscribe to presence updates
            await sock.presenceSubscribe(chatId);
            
            // Show typing status briefly
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Keep typing visible for a short time
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Then pause
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true;
        } catch (error) {
            console.error('❌ Error sending post-command typing indicator:', error);
            return false;
        }
    }
    return false; // Autotyping is disabled
}

module.exports = {
    autotypingCommand,
    isAutotypingEnabled,
    handleAutotypingForMessage,
    handleAutotypingForCommand,
    showTypingAfterCommand
};