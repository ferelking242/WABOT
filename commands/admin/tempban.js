const isAdmin = require('../../lib/isAdmin');
const { channelConfig } = require('../../lib/channelConfig');
const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../../config/supabase.config');

// Supabase client
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

// Check if user is already banned
async function isUserTempbanned(groupId, userId) {
    try {
        const { data, error } = await supabase
            .from('tempbans')
            .select('*')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('expires_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error checking tempban:', error);
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    } catch (err) {
        console.error('Error in isUserTempbanned:', err);
        return null;
    }
}

// Create tempban record
async function createTempban(groupId, userId, bannedBy, reason, durationMs) {
    try {
        // First, deactivate any existing active bans for this user in this group
        await supabase
            .from('tempbans')
            .update({ is_active: false })
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true);
        
        const expiresAt = new Date(Date.now() + durationMs);
        
        const { data, error } = await supabase
            .from('tempbans')
            .insert({
                group_id: groupId,
                user_id: userId,
                banned_by: bannedBy,
                reason: reason,
                expires_at: expiresAt.toISOString(),
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating tempban:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Error in createTempban:', err);
        return null;
    }
}

// Remove tempban record by ID
async function removeTempbanById(banId) {
    try {
        const { error } = await supabase
            .from('tempbans')
            .update({ is_active: false })
            .eq('id', banId)
            .eq('is_active', true);

        if (error) {
            console.error('Error removing tempban by ID:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error in removeTempbanById:', err);
        return false;
    }
}

// Remove tempban record (legacy - removes all active bans for user in group)
async function removeTempban(groupId, userId) {
    try {
        const { error } = await supabase
            .from('tempbans')
            .update({ is_active: false })
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) {
            console.error('Error removing tempban:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error in removeTempban:', err);
        return false;
    }
}

// Get active tempbans for group
async function getActiveTempbans(groupId) {
    try {
        const { data, error } = await supabase
            .from('tempbans')
            .select('*')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error getting tempbans:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Error in getActiveTempbans:', err);
        return [];
    }
}

// Parse duration (e.g., "30m", "2h", "1d")
function parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([mhd])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'm': return value * 60 * 1000; // minutes
        case 'h': return value * 60 * 60 * 1000; // hours
        case 'd': return value * 24 * 60 * 60 * 1000; // days
        default: return null;
    }
}

// Format duration for display
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

// Temporary ban command
async function tempbanCommand(sock, chatId, senderId, mentionedJids, message) {
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

        // Get message text and parse arguments
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.split(' ').slice(1); // Remove command

        if (args.length < 1) {
            await sock.sendMessage(chatId, {
                text: `⏰ *BANNISSEMENT TEMPORAIRE*\n\n*Utilisation:*\n\`.tempban @user [durée] [raison]\`\n\n*Durées:*\n• \`30m\` - 30 minutes\n• \`2h\` - 2 heures\n• \`1d\` - 1 jour\n• \`7d\` - 7 jours (max)\n\n*Exemples:*\n• \`.tempban @user 1h Spam\`\n• \`.tempban @user 30m Warning\`\n\n*Autres commandes:*\n• \`.tempbans\` - Liste des bans temporaires\n• \`.untempban @user\` - Lever un ban manuel`,
                ...channelConfig
            });
            return;
        }

        let userToBan;
        let duration = '1h'; // Default duration
        let reason = 'Aucune raison spécifiée';

        // Check for mentioned users
        if (mentionedJids && mentionedJids.length > 0) {
            userToBan = mentionedJids[0];
            if (args.length > 1) duration = args[1];
            if (args.length > 2) reason = args.slice(2).join(' ');
        }
        // Check for replied message
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToBan = message.message.extendedTextMessage.contextInfo.participant;
            if (args.length > 0) duration = args[0];
            if (args.length > 1) reason = args.slice(1).join(' ');
        }

        if (!userToBan) {
            await sock.sendMessage(chatId, {
                text: '❌ Veuillez mentionner l\'utilisateur à bannir temporairement !',
                ...channelConfig
            });
            return;
        }

        // Parse duration
        const durationMs = parseDuration(duration);
        if (!durationMs) {
            await sock.sendMessage(chatId, {
                text: '❌ Durée invalide !\n\n📝 *Format:* `30m`, `2h`, `1d`\n⏱️ *Limite:* Maximum 7 jours',
                ...channelConfig
            });
            return;
        }

        // Check max duration (7 days)
        const maxDuration = 7 * 24 * 60 * 60 * 1000;
        if (durationMs > maxDuration) {
            await sock.sendMessage(chatId, {
                text: '❌ Durée trop longue !\n\n⏱️ Maximum: 7 jours',
                ...channelConfig
            });
            return;
        }

        // Check if user is already banned
        const existingBan = await isUserTempbanned(chatId, userToBan);
        if (existingBan) {
            const remainingTime = formatDuration(new Date(existingBan.expires_at).getTime() - Date.now());
            await sock.sendMessage(chatId, {
                text: `❌ @${userToBan.split('@')[0]} est déjà banni temporairement !\n\n⏰ Temps restant: ${remainingTime}`,
                mentions: [userToBan],
                ...channelConfig
            });
            return;
        }

        // Check if user is admin
        const { isSenderAdmin: isTargetAdmin } = await isAdmin(sock, chatId, userToBan);
        if (isTargetAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Impossible de bannir un administrateur !',
                ...channelConfig
            });
            return;
        }

        // Get bot ID to prevent self-ban
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (userToBan === botId) {
            await sock.sendMessage(chatId, {
                text: '❌ Je ne peux pas me bannir moi-même ! 🤖',
                ...channelConfig
            });
            return;
        }

        try {
            // Ban the user
            await sock.groupParticipantsUpdate(chatId, [userToBan], "remove");
            
            // Record the ban in Supabase
            const tempbanRecord = await createTempban(chatId, userToBan, senderId, reason, durationMs);
            if (!tempbanRecord) {
                await sock.sendMessage(chatId, {
                    text: '❌ Erreur lors de l\'enregistrement du bannissement !',
                    ...channelConfig
                });
                return;
            }

            // Schedule auto-unban with ban ID
            scheduleAutoUnban(sock, chatId, userToBan, tempbanRecord.id, durationMs);

            const formattedDuration = formatDuration(durationMs);
            const expiryDate = new Date(tempbanRecord.expires_at).toLocaleString();

            await sock.sendMessage(chatId, {
                text: `⏰ *BANNISSEMENT TEMPORAIRE*\n\n👤 *Utilisateur:* @${userToBan.split('@')[0]}\n⏱️ *Durée:* ${formattedDuration}\n📅 *Expire le:* ${expiryDate}\n📝 *Raison:* ${reason}\n👑 *Par:* @${senderId.split('@')[0]}\n\n💡 L'utilisateur sera automatiquement réinvité à l'expiration`,
                mentions: [userToBan, senderId],
                ...channelConfig
            });

        } catch (error) {
            console.error('Error banning user:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Impossible de bannir l\'utilisateur ! Vérifiez que le bot a les permissions nécessaires.',
                ...channelConfig
            });
        }

    } catch (error) {
        console.error('Error in tempban command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors du bannissement temporaire !',
            ...channelConfig
        });
    }
}

// Get active ban without date filter (for timer expiry)
async function getActiveBan(groupId, userId) {
    try {
        const { data, error } = await supabase
            .from('tempbans')
            .select('*')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('expires_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error getting active ban:', error);
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    } catch (err) {
        console.error('Error in getActiveBan:', err);
        return null;
    }
}

// Schedule auto-unban
function scheduleAutoUnban(sock, chatId, userId, banId, durationMs) {
    setTimeout(async () => {
        try {
            // Check if this specific ban is still active and expired
            const { data: banInfo, error } = await supabase
                .from('tempbans')
                .select('*')
                .eq('id', banId)
                .eq('is_active', true)
                .lte('expires_at', new Date().toISOString())
                .single();
            
            if (error || !banInfo) {
                // Ban was already removed, cancelled, or not yet expired
                return;
            }

            // Generate invite link
            try {
                const inviteCode = await sock.groupInviteCode(chatId);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                // Send unban message to group
                await sock.sendMessage(chatId, {
                    text: `🔓 *BAN TEMPORAIRE EXPIRÉ*\n\n👤 @${userId.split('@')[0]} peut maintenant rejoindre le groupe\n\n🔗 *Lien d'invitation:* ${inviteLink}\n\n📝 Raison: ${banInfo.reason}`,
                    mentions: [userId],
                    ...channelConfig
                });

                // Try to send private message to user
                try {
                    await sock.sendMessage(userId, {
                        text: `🔓 *BANNISSEMENT TEMPORAIRE EXPIRÉ*\n\nVotre bannissement temporaire du groupe a expiré.\n\n🔗 *Rejoindre le groupe:* ${inviteLink}\n\n📝 Raison: ${banInfo.reason}\n\n💡 Respectez les règles du groupe pour éviter de futurs bannissements.`
                    });
                } catch (dmError) {
                    console.log('Could not send DM to unbanned user:', dmError.message);
                }

                // Mark this specific ban as inactive in Supabase
                await removeTempbanById(banId);

            } catch (inviteError) {
                console.error('Error generating invite for tempban expiry:', inviteError);
                
                // Still mark as inactive even if invite failed
                await removeTempbanById(banId);
            }

        } catch (error) {
            console.error('Error in auto-unban:', error);
        }
    }, durationMs);
}

// List temporary bans
async function listTempbansCommand(sock, chatId, senderId, message) {
    try {
        const activeBans = await getActiveTempbans(chatId);
        
        if (activeBans.length === 0) {
            await sock.sendMessage(chatId, {
                text: '🔓 *AUCUN BANNISSEMENT TEMPORAIRE ACTIF*\n\nTous les membres peuvent rejoindre le groupe librement.',
                ...channelConfig
            });
            return;
        }

        let bansList = `⏰ *BANNISSEMENTS TEMPORAIRES* (${activeBans.length})\n\n`;
        
        activeBans.forEach((ban, index) => {
            const remainingTime = formatDuration(new Date(ban.expires_at).getTime() - Date.now());
            const bannedDate = new Date(ban.created_at).toLocaleDateString();
            
            bansList += `*${index + 1}.* @${ban.user_id.split('@')[0]}\n`;
            bansList += `⏰ Expire dans: ${remainingTime}\n`;
            bansList += `📅 Banni le: ${bannedDate}\n`;
            bansList += `📝 Raison: ${ban.reason}\n`;
            bansList += `👑 Par: @${ban.banned_by.split('@')[0]}\n\n`;
        });

        bansList += `💡 Les utilisateurs seront automatiquement réinvités à l'expiration de leur ban.`;

        const mentions = activeBans.flatMap(ban => [ban.user_id, ban.banned_by]);

        await sock.sendMessage(chatId, {
            text: bansList,
            mentions: mentions,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error listing tempbans:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de l\'affichage des bannissements temporaires !',
            ...channelConfig
        });
    }
}

// Initialize auto-unbans on bot start
async function initializeAutoUnbans(sock) {
    try {
        const currentTime = new Date().toISOString();
        
        // First, handle overdue bans (expired while bot was offline)
        const { data: overdueBans, error: overdueError } = await supabase
            .from('tempbans')
            .select('*')
            .eq('is_active', true)
            .lte('expires_at', currentTime);
        
        if (overdueError) {
            console.error('Error getting overdue bans:', overdueError);
        } else if (overdueBans && overdueBans.length > 0) {
            console.log(`📋 Processing ${overdueBans.length} overdue bans...`);
            
            for (const ban of overdueBans) {
                try {
                    // Send expired notification if possible
                    const inviteCode = await sock.groupInviteCode(ban.group_id);
                    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    
                    await sock.sendMessage(ban.group_id, {
                        text: `🔓 *BAN TEMPORAIRE EXPIRÉ (tardif)*\n\n👤 @${ban.user_id.split('@')[0]} peut maintenant rejoindre le groupe\n\n🔗 *Lien d'invitation:* ${inviteLink}\n\n📝 Raison: ${ban.reason}`,
                        mentions: [ban.user_id],
                        ...channelConfig
                    });
                    
                    // Mark as inactive
                    await removeTempbanById(ban.id);
                } catch (err) {
                    console.error(`Error processing overdue ban for ${ban.user_id}:`, err);
                    // Still mark as inactive even if notification failed
                    await removeTempbanById(ban.id);
                }
            }
        }
        
        // Then, schedule future bans
        const { data: futureBans, error: futureError } = await supabase
            .from('tempbans')
            .select('*')
            .eq('is_active', true)
            .gt('expires_at', currentTime);
        
        if (futureError) {
            console.error('Error getting future bans for initialization:', futureError);
            return;
        }

        const now = Date.now();
        
        if (futureBans) {
            futureBans.forEach(ban => {
                const expiresAt = new Date(ban.expires_at).getTime();
                if (expiresAt > now) {
                    const remainingTime = expiresAt - now;
                    scheduleAutoUnban(sock, ban.group_id, ban.user_id, ban.id, remainingTime);
                }
            });
        }
        
        console.log(`✅ Auto-unban timers initialized: ${overdueBans?.length || 0} overdue processed, ${futureBans?.length || 0} future scheduled`);
    } catch (error) {
        console.error('Error initializing auto-unbans:', error);
    }
}

module.exports = {
    tempbanCommand,
    listTempbansCommand,
    initializeAutoUnbans
};