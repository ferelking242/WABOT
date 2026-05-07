const { channelConfig } = require('../lib/channelConfig');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const supabaseConfig = require('../config/supabase.config');

// Supabase client
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY,
    { realtime: { transport: ws } }
);

// Get or create anonymous session for group
async function getAnonymousSession(groupId) {
    try {
        // Check for active session
        const { data: activeSession, error } = await supabase
            .from('anonymous_sessions')
            .select('*')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error getting session:', error);
            return null;
        }

        if (activeSession) {
            return activeSession;
        }

        // Create new session if none active
        const { data: newSession, error: createError } = await supabase
            .from('anonymous_sessions')
            .insert({
                group_id: groupId,
                is_active: true
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creating session:', createError);
            return null;
        }

        return newSession;
    } catch (err) {
        console.error('Error in getAnonymousSession:', err);
        return null;
    }
}

// Get or create anonymous alias for user in session
async function getAnonymousAlias(sessionId, groupId, userId) {
    try {
        // Check for existing alias
        const { data: existingAlias, error } = await supabase
            .from('anonymous_aliases')
            .select('*')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error getting alias:', error);
            return null;
        }

        if (existingAlias) {
            return existingAlias;
        }

        // Count existing aliases to assign next number
        const { count, error: countError } = await supabase
            .from('anonymous_aliases')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId);

        if (countError) {
            console.error('Error counting aliases:', countError);
            return null;
        }

        // Retry logic for unique constraint conflicts
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            const aliasNumber = (count || 0) + 1 + attempts;
            const aliasName = `Anonyme #${aliasNumber}`;

            // Create new alias
            const { data: newAlias, error: createError } = await supabase
                .from('anonymous_aliases')
                .insert({
                    session_id: sessionId,
                    group_id: groupId,
                    user_id: userId,
                    alias: aliasName
                })
                .select()
                .single();

            if (!createError) {
                return newAlias;
            }

            // If unique constraint violation, retry
            if (createError.code === '23505') {
                attempts++;
                continue;
            }

            console.error('Error creating alias:', createError);
            return null;
        }

        console.error('Failed to create alias after multiple attempts');
        return null;
    } catch (err) {
        console.error('Error in getAnonymousAlias:', err);
        return null;
    }
}

// Check if anonymous messages are enabled for group
async function isAnonymousEnabled(groupId) {
    try {
        const { data, error } = await supabase
            .from('group_settings')
            .select('enabled')
            .eq('group_id', groupId)
            .eq('setting_type', 'anonymous')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error checking anonymous setting:', error);
            return true; // Default enabled
        }

        return data ? data.enabled : true;
    } catch (err) {
        console.error('Error in isAnonymousEnabled:', err);
        return true;
    }
}

// Set anonymous enabled status for group
async function setAnonymousEnabled(groupId, enabled) {
    try {
        const { error } = await supabase
            .from('group_settings')
            .upsert({
                group_id: groupId,
                setting_type: 'anonymous',
                enabled: enabled
            }, {
                onConflict: 'group_id,setting_type'
            });

        if (error) {
            console.error('Error setting anonymous status:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error in setAnonymousEnabled:', err);
        return false;
    }
}

// Anonymous message command
async function anonymousCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        if (!args.length) {
            await sock.sendMessage(chatId, {
                text: `🕵️ *MESSAGES ANONYMES*\n\n*Utilisation:*\n\`.anonymous [message]\`\n\n*Exemples:*\n• \`.anonymous Je pense que ce groupe est génial !\`\n• \`.anonymous Quelqu'un peut m'aider avec...\`\n\n*Règles:*\n• Pas de contenu offensant ou inapproprié\n• Respect des autres membres\n• Les admins peuvent tracer les messages si nécessaire\n\n*Autres commandes:*\n• \`.anon on/off\` - Activer/désactiver (admins)\n• \`.confession [message]\` - Confession anonyme`,
                ...channelConfig
            });
            return;
        }

        // Check if anonymous messages are enabled
        const enabled = await isAnonymousEnabled(chatId);

        if (!enabled) {
            await sock.sendMessage(chatId, {
                text: '❌ Les messages anonymes sont désactivés dans ce groupe !\n\n💡 Un admin peut les réactiver avec `.anon on`',
                ...channelConfig
            });
            return;
        }

        const messageText = args.join(' ');

        // Content filter for inappropriate content
        const bannedWords = ['spam', 'porn', 'nude', 'xxx']; // Basic filter
        const hasInappropriateContent = bannedWords.some(word => 
            messageText.toLowerCase().includes(word.toLowerCase())
        );

        if (hasInappropriateContent) {
            await sock.sendMessage(chatId, {
                text: '❌ Contenu inapproprié détecté !\n\nLes messages anonymes doivent respecter les règles du groupe.',
                ...channelConfig
            });
            return;
        }

        // Get or create anonymous session and alias
        const session = await getAnonymousSession(chatId);
        if (!session) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la création de la session anonyme !',
                ...channelConfig
            });
            return;
        }

        const alias = await getAnonymousAlias(session.id, chatId, senderId);
        if (!alias) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la création de l\'alias anonyme !',
                ...channelConfig
            });
            return;
        }

        // Record the anonymous message
        const { data: messageRecord, error: messageError } = await supabase
            .from('anonymous_messages')
            .insert({
                session_id: session.id,
                alias_id: alias.id,
                group_id: chatId,
                message_content: messageText,
                message_id: null // Will be set after sending
            })
            .select()
            .single();

        if (messageError) {
            console.error('Error saving message:', messageError);
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de l\'enregistrement du message !',
                ...channelConfig
            });
            return;
        }

        const messageId = `anon_${messageRecord.id}`;
        const anonymousName = alias.alias;

        // Send the anonymous message
        await sock.sendMessage(chatId, {
            text: `🕵️ *MESSAGE ANONYME*\n\n💬 ${messageText}\n\n👤 *De:* ${anonymousName}\n🆔 *ID:* \`${messageId}\`\n\n💡 Répondez avec respect et bienveillance`,
            ...channelConfig
        });

        // Send confirmation to sender privately
        try {
            await sock.sendMessage(senderId, {
                text: `✅ *Message anonyme envoyé !*\n\n📝 Votre message: "${messageText}"\n👤 Votre alias: ${anonymousName}\n🆔 ID: \`${messageId}\`\n⏰ Envoyé le: ${new Date().toLocaleString()}\n\n💡 Votre identité reste confidentielle`
            });
        } catch (dmError) {
            console.log('Could not send confirmation DM:', dmError.message);
        }

    } catch (error) {
        console.error('Error in anonymous command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de l\'envoi du message anonyme !',
            ...channelConfig
        });
    }
}

// Confession command (special type of anonymous message)
async function confessionCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        if (!args.length) {
            await sock.sendMessage(chatId, {
                text: `💭 *CONFESSIONS ANONYMES*\n\n*Utilisation:*\n\`.confession [votre confession]\`\n\n*Exemples:*\n• \`.confession J'ai toujours voulu apprendre la guitare\`\n• \`.confession J'adore regarder des films d'animation\`\n\n*Règles strictes:*\n• Gardez vos confessions appropriées\n• Pas d'informations personnelles sensibles\n• Respect et bienveillance uniquement\n\n💡 Partagez quelque chose de personnel dans un environnement safe !`,
                ...channelConfig
            });
            return;
        }

        const confessionText = args.join(' ');

        // Content filter
        const sensitiveTopics = ['suicide', 'dépression', 'drogue', 'crime'];
        const hasSensitiveContent = sensitiveTopics.some(topic => 
            confessionText.toLowerCase().includes(topic.toLowerCase())
        );

        if (hasSensitiveContent) {
            await sock.sendMessage(chatId, {
                text: '❌ Votre confession contient du contenu sensible.\n\n💡 Pour des sujets sérieux, considérez parler à un professionnel ou un proche de confiance.',
                ...channelConfig
            });
            return;
        }

        // Get or create anonymous session and alias for confession
        const session = await getAnonymousSession(chatId);
        if (!session) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la création de la session anonyme !',
                ...channelConfig
            });
            return;
        }

        const alias = await getAnonymousAlias(session.id, chatId, senderId);
        if (!alias) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la création de l\'alias anonyme !',
                ...channelConfig
            });
            return;
        }

        // Record confession as anonymous message with special prefix
        const { data: confessionRecord, error: confessionError } = await supabase
            .from('anonymous_messages')
            .insert({
                session_id: session.id,
                alias_id: alias.id,
                group_id: chatId,
                message_content: `[CONFESSION] ${confessionText}`,
                message_id: null
            })
            .select()
            .single();

        if (confessionError) {
            console.error('Error saving confession:', confessionError);
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de l\'enregistrement de la confession !',
                ...channelConfig
            });
            return;
        }

        const confessionId = `conf_${confessionRecord.id}`;

        // Send confession with special formatting
        await sock.sendMessage(chatId, {
            text: `💭 *CONFESSION ANONYME*\n\n"${confessionText}"\n\n✨ Merci de partager avec nous\n💚 Réagissez avec bienveillance et respect\n\n🆔 \`${confessionId}\``,
            ...channelConfig
        });

        // Send confirmation to sender
        try {
            await sock.sendMessage(senderId, {
                text: `💭 *Confession partagée anonymement !*\n\n📝 "${confessionText}"\n🆔 ID: \`${confessionId}\`\n⏰ ${new Date().toLocaleString()}\n\n💚 Merci de partager avec le groupe !`
            });
        } catch (dmError) {
            console.log('Could not send confession confirmation:', dmError.message);
        }

    } catch (error) {
        console.error('Error in confession command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de l\'envoi de la confession !',
            ...channelConfig
        });
    }
}

// Admin command to toggle anonymous messages
async function anonToggleCommand(sock, chatId, senderId, message, args) {
    try {
        const isAdmin = require('../lib/isAdmin');
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Seuls les admins peuvent modifier les paramètres de messages anonymes !',
                ...channelConfig
            });
            return;
        }

        const action = args[0]?.toLowerCase();

        if (action === 'on' || action === 'enable') {
            const success = await setAnonymousEnabled(chatId, true);
            if (success) {
                await sock.sendMessage(chatId, {
                    text: '✅ *Messages anonymes activés !*\n\nLes membres peuvent maintenant utiliser:\n• `.anonymous [message]`\n• `.confession [confession]`',
                    ...channelConfig
                });
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Erreur lors de l\'activation des messages anonymes !',
                    ...channelConfig
                });
            }
        } else if (action === 'off' || action === 'disable') {
            const success = await setAnonymousEnabled(chatId, false);
            if (success) {
                await sock.sendMessage(chatId, {
                    text: '❌ *Messages anonymes désactivés !*\n\nLes commandes `.anonymous` et `.confession` ne fonctionneront plus.',
                    ...channelConfig
                });
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Erreur lors de la désactivation des messages anonymes !',
                    ...channelConfig
                });
            }
        } else {
            const enabled = await isAnonymousEnabled(chatId);
            const currentStatus = enabled ? 'Activé' : 'Désactivé';
            await sock.sendMessage(chatId, {
                text: `🕵️ *STATUT MESSAGES ANONYMES*\n\n📊 *Statut actuel:* ${currentStatus}\n\n*Commandes admin:*\n• \`.anon on\` - Activer\n• \`.anon off\` - Désactiver\n• \`.anonlist\` - Messages récents (modération)`,
                ...channelConfig
            });
        }

    } catch (error) {
        console.error('Error in anon toggle command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la modification des paramètres !',
            ...channelConfig
        });
    }
}

// Admin command to list recent anonymous messages (for moderation)
async function anonListCommand(sock, chatId, senderId, message, args) {
    try {
        const isAdmin = require('../lib/isAdmin');
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Seuls les admins peuvent voir la liste de modération !',
                ...channelConfig
            });
            return;
        }

        // Get recent anonymous messages for moderation
        const { data: recentMessages, error } = await supabase
            .from('anonymous_messages')
            .select('*')
            .eq('group_id', chatId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error getting recent messages:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la récupération des messages !',
                ...channelConfig
            });
            return;
        }

        if (!recentMessages || recentMessages.length === 0) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUN MESSAGE ANONYME*\n\nAucun message anonyme récent à modérer.',
                ...channelConfig
            });
            return;
        }

        // Get aliases for these messages
        const aliasIds = [...new Set(recentMessages.map(msg => msg.alias_id))];
        const { data: aliases } = await supabase
            .from('anonymous_aliases')
            .select('*')
            .in('id', aliasIds);

        // Create alias lookup map
        const aliasMap = {};
        if (aliases) {
            aliases.forEach(alias => {
                aliasMap[alias.id] = alias;
            });
        }

        let listText = '🛡️ *MODÉRATION MESSAGES ANONYMES*\n\n';

        const messages = recentMessages.filter(msg => !msg.message_content.startsWith('[CONFESSION]'));
        const confessions = recentMessages.filter(msg => msg.message_content.startsWith('[CONFESSION]'));

        if (messages.length > 0) {
            listText += '💬 *Messages récents:*\n';
            messages.slice(0, 5).forEach((msg, index) => {
                const date = new Date(msg.created_at).toLocaleString();
                const alias = aliasMap[msg.alias_id];
                const sender = alias?.user_id?.split('@')[0] || 'Inconnu';
                const aliasName = alias?.alias || 'Anonyme';
                const content = msg.message_content.substring(0, 50);
                listText += `${index + 1}. "${content}..."\n`;
                listText += `   👤 ${sender} (${aliasName}) • ⏰ ${date}\n`;
                listText += `   🆔 \`anon_${msg.id}\`\n\n`;
            });
        }

        if (confessions.length > 0) {
            listText += '💭 *Confessions récentes:*\n';
            confessions.slice(0, 3).forEach((conf, index) => {
                const date = new Date(conf.created_at).toLocaleString();
                const alias = aliasMap[conf.alias_id];
                const sender = alias?.user_id?.split('@')[0] || 'Inconnu';
                const content = conf.message_content.replace('[CONFESSION] ', '').substring(0, 50);
                listText += `${index + 1}. "${content}..."\n`;
                listText += `   👤 ${sender} • ⏰ ${date}\n\n`;
            });
        }

        listText += '⚠️ *Informations confidentielles - Admins seulement*';

        await sock.sendMessage(chatId, {
            text: listText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in anon list command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la récupération des messages !',
            ...channelConfig
        });
    }
}

module.exports = {
    anonymousCommand,
    confessionCommand,
    anonToggleCommand,
    anonListCommand
};