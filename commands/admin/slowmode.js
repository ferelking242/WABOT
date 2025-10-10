const isAdmin = require('../../lib/isAdmin');
const { channelConfig } = require('../../lib/channelConfig');
const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../../config/supabase.config');

// Supabase client
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

// Get slowmode settings for a group
async function getSlowmodeSettings(groupId) {
    try {
        const { data, error } = await supabase
            .from('slowmode_settings')
            .select('*')
            .eq('group_id', groupId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error getting slowmode settings:', error);
            return null;
        }

        return data || null;
    } catch (err) {
        console.error('Error in getSlowmodeSettings:', err);
        return null;
    }
}

// Create or update slowmode settings
async function upsertSlowmodeSettings(groupId, enabled, intervalSeconds, lastMessages = {}) {
    try {
        const { data, error } = await supabase
            .from('slowmode_settings')
            .upsert({
                group_id: groupId,
                enabled: enabled,
                interval_seconds: intervalSeconds,
                last_messages: lastMessages
            }, {
                onConflict: 'group_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Error upserting slowmode settings:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Error in upsertSlowmodeSettings:', err);
        return null;
    }
}

// Update last messages for slowmode
async function updateLastMessages(groupId, lastMessages) {
    try {
        const { error } = await supabase
            .from('slowmode_settings')
            .update({ last_messages: lastMessages })
            .eq('group_id', groupId);

        if (error) {
            console.error('Error updating last messages:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error in updateLastMessages:', err);
        return false;
    }
}

// Main slowmode command
async function slowmodeCommand(sock, chatId, senderId, message, args) {
    try {
        // Check if in group
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        // Check admin permissions
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Le bot doit être admin pour utiliser cette fonction !',
                ...channelConfig
            });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Seuls les admins peuvent utiliser cette commande !',
                ...channelConfig
            });
            return;
        }

        const slowmodeSettings = await getSlowmodeSettings(chatId);
        
        // Show current status if no args
        if (!args[0]) {
            const currentMode = slowmodeSettings;
            if (currentMode?.enabled) {
                await sock.sendMessage(chatId, {
                    text: `🐌 *MODE LENT ACTIF*\n\n⏱️ Intervalle: ${currentMode.interval_seconds} secondes\n💬 Messages autorisés par utilisateur toutes les ${currentMode.interval_seconds}s\n\n*Utilisation:*\n• \`.slowmode off\` - Désactiver\n• \`.slowmode [secondes]\` - Modifier l'intervalle`,
                    ...channelConfig
                });
            } else {
                await sock.sendMessage(chatId, {
                    text: `🐌 *MODE LENT DÉSACTIVÉ*\n\n*Utilisation:*\n• \`.slowmode 30\` - Activer avec 30 secondes\n• \`.slowmode off\` - Désactiver`,
                    ...channelConfig
                });
            }
            return;
        }

        const action = args[0].toLowerCase();

        if (action === 'off' || action === 'disable') {
            // Disable slowmode
            if (slowmodeSettings) {
                await upsertSlowmodeSettings(chatId, false, slowmodeSettings.interval_seconds, {});
            }
            
            await sock.sendMessage(chatId, {
                text: '✅ *Mode lent désactivé !*\n\nTous les membres peuvent maintenant envoyer des messages normalement.',
                ...channelConfig
            });
            return;
        }

        // Set slowmode interval
        const interval = parseInt(action);
        if (isNaN(interval) || interval < 1 || interval > 3600) {
            await sock.sendMessage(chatId, {
                text: '❌ Intervalle invalide !\n\n📝 *Format:* `.slowmode [secondes]`\n⏱️ *Limite:* 1-3600 secondes (1 heure max)\n\n*Exemples:*\n• `.slowmode 30` - 30 secondes\n• `.slowmode 120` - 2 minutes\n• `.slowmode off` - Désactiver',
                ...channelConfig
            });
            return;
        }

        // Update settings
        const result = await upsertSlowmodeSettings(chatId, true, interval, {});
        if (!result) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la sauvegarde des paramètres !',
                ...channelConfig
            });
            return;
        }

        const minutes = Math.floor(interval / 60);
        const seconds = interval % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        await sock.sendMessage(chatId, {
            text: `✅ *Mode lent activé !*\n\n⏱️ *Intervalle:* ${timeStr}\n📝 Les membres ne peuvent envoyer qu'un message toutes les ${timeStr}\n\n💡 *Astuce:* Les admins ne sont pas affectés par cette limite`,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in slowmode command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la configuration du mode lent !',
            ...channelConfig
        });
    }
}

// Check if user can send message (middleware function)
async function checkSlowmode(sock, chatId, senderId) {
    try {
        const slowmodeSettings = await getSlowmodeSettings(chatId);
        
        if (!slowmodeSettings || !slowmodeSettings.enabled) {
            return true; // No slowmode active
        }

        // Check if user is admin (admins bypass slowmode)
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
        if (isSenderAdmin) {
            return true; // Admins bypass slowmode
        }

        const now = Date.now();
        const lastMessages = slowmodeSettings.last_messages || {};
        const lastMessage = lastMessages[senderId];
        
        if (!lastMessage) {
            // First message, allow and record
            lastMessages[senderId] = now;
            await updateLastMessages(chatId, lastMessages);
            return true;
        }

        const timeDiff = (now - lastMessage) / 1000; // Convert to seconds
        
        if (timeDiff < slowmodeSettings.interval_seconds) {
            // Too fast, deny message
            const remainingTime = Math.ceil(slowmodeSettings.interval_seconds - timeDiff);
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            
            await sock.sendMessage(chatId, {
                text: `🐌 *Mode lent actif !*\n\n⏱️ Vous devez attendre encore *${timeStr}* avant d'envoyer un autre message.\n\n💡 Intervalle configuré: ${slowmodeSettings.interval_seconds} secondes`,
                ...channelConfig
            }, { quoted: { key: { remoteJid: chatId, participant: senderId } } });
            
            return false;
        }

        // Enough time passed, allow and update
        lastMessages[senderId] = now;
        await updateLastMessages(chatId, lastMessages);
        return true;

    } catch (error) {
        console.error('Error checking slowmode:', error);
        return true; // Allow on error
    }
}

module.exports = {
    slowmodeCommand,
    checkSlowmode
};