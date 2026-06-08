/**
 * Gestion des communautés WhatsApp
 * 
 * Les communautés WhatsApp sont différentes des groupes - elles permettent de :
 * - Regrouper plusieurs groupes sous une même communauté
 * - Avoir des canaux d'annonces pour toute la communauté
 * - Gérer les permissions au niveau communauté
 * - Avoir une structure hiérarchique
 */

const { channelConfig } = require('../../lib/channelConfig');
const { i18n } = require('../../lib/i18n');
const isAdmin = require('../../lib/isAdmin');
const { db } = require('../../lib/database');
// const { communities, community_groups, community_channels, community_settings } = require('../../shared/schema');
// Drizzle-orm supprimé - utilise maintenant les requêtes Supabase natives (.eq, .select, etc.)

/**
 * Détecter si le chat est une communauté WhatsApp
 */
async function isCommunity(sock, chatId) {
    try {
        // Les communautés WhatsApp utilisent des ID différents des groupes normaux
        // et ont des métadonnées spécifiques
        
        // Vérifier d'abord le format de l'ID
        if (!chatId.endsWith('@g.us')) {
            return false; // Les communautés utilisent @g.us mais avec des propriétés spéciales
        }
        
        const metadata = await sock.groupMetadata(chatId);
        
        // Vérifier les propriétés spécifiques aux communautés
        // Les communautés peuvent avoir des propriétés comme parentGroup, linkedParent, etc.
        const communityIndicators = [
            metadata?.isCommunity,
            metadata?.isAnnouncement,
            metadata?.isParent, // Groupe parent d'une communauté
            metadata?.parentGroup, // Référence au groupe parent
            metadata?.linkedParent, // Lié à un groupe parent
            metadata?.announce // Mode annonce permanent (typique des communautés)
        ];
        
        // Si au moins un indicateur est présent, c'est probablement une communauté
        const hasCommunityIndicators = communityIndicators.some(indicator => indicator);
        
        // Vérifier aussi la taille et le type de participants
        // Les communautés ont souvent des patterns spécifiques
        const hasLargeParticipantCount = metadata?.participants?.length > 100;
        const hasAnnounceMode = metadata?.announce === true;
        
        // Logique de détection améliorée
        return hasCommunityIndicators || (hasLargeParticipantCount && hasAnnounceMode);
        
    } catch (error) {
        console.error('Erreur lors de la détection de communauté:', error);
        return false;
    }
}

/**
 * Obtenir les informations d'une communauté
 */
async function getCommunityInfo(sock, chatId, message) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const metadata = await sock.groupMetadata(chatId);
        
        // Récupérer les informations de la communauté depuis la DB
        const { data: communityData, error: communityError } = await db.supabase
            .from('communities')
            .select('*')
            .eq('community_id', chatId)
            .single();
            
        if (communityError && communityError.code !== 'PGRST116') {
            console.log('Community not found in DB, using metadata only');
        }

        const infoText = `🏘️ *INFORMATIONS COMMUNAUTÉ*\n\n` +
                        `📋 *Nom:* ${metadata.subject}\n` +
                        `🆔 *ID:* ${chatId}\n` +
                        `👥 *Participants:* ${metadata.participants?.length || 0}\n` +
                        `📅 *Créée le:* ${new Date(metadata.creation * 1000).toLocaleDateString()}\n` +
                        `👑 *Créateur:* @${metadata.owner?.split('@')[0] || 'Inconnu'}\n\n`;

        // Ajouter la description si elle existe
        let finalText = infoText;
        if (metadata.desc) {
            finalText += `📄 *Description:*\n${metadata.desc}\n\n`;
        }

        // Ajouter les canaux de la communauté
        const channels = await getCommunityChannels(sock, chatId);
        if (channels.length > 0) {
            finalText += `📢 *Canaux:*\n`;
            channels.forEach((channel, index) => {
                finalText += `${index + 1}. ${channel.name} (${channel.type})\n`;
            });
            finalText += `\n`;
        }

        // Ajouter les groupes liés
        const linkedGroups = await getCommunityGroups(chatId);
        if (linkedGroups.length > 0) {
            finalText += `👥 *Groupes liés:*\n`;
            linkedGroups.forEach((group, index) => {
                finalText += `${index + 1}. ${group.name}\n`;
            });
        }

        await sock.sendMessage(chatId, {
            text: finalText,
            mentions: metadata.owner ? [metadata.owner] : [],
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur lors de la récupération des infos communauté:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération des informations de la communauté.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Modifier la description de la communauté
 */
async function setCommunityDescription(sock, chatId, message, description) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Vérifier que c'est une communauté
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Vérifier les permissions admin
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Le bot doit être administrateur de la communauté pour modifier la description.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Seuls les administrateurs peuvent modifier la description de la communauté.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        if (!description) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier une description\n\nUtilisation: .setcommunitydesc [nouvelle description]",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Modifier la description
        await sock.groupUpdateDescription(chatId, description);
        
        // Mettre à jour dans la base de données
        const { error: updateError } = await db.supabase
            .from('communities')
            .upsert({
                community_id: chatId,
                description: description,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'community_id'
            });
            
        if (updateError) {
            console.error('Error updating community description:', updateError);
        }

        await sock.sendMessage(chatId, {
            text: `✅ Description de la communauté mise à jour:\n\n*${description}*`,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur lors de la modification de la description:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de modifier la description. Vérifiez que le bot est administrateur.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Modifier l'icône de la communauté
 */
async function setCommunityIcon(sock, chatId, message) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Vérifier que c'est une communauté
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Vérifier les permissions admin
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Le bot doit être administrateur de la communauté pour modifier l'icône.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Seuls les administrateurs peuvent modifier l'icône de la communauté.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Vérifier qu'il y a une image en pièce jointe
        const imageMessage = message.message?.imageMessage;
        if (!imageMessage) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez joindre une image pour changer l'icône de la communauté",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Télécharger l'image
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Modifier l'icône de la communauté
        await sock.updateProfilePicture(chatId, buffer);

        await sock.sendMessage(chatId, {
            text: "✅ Icône de la communauté mise à jour avec succès !",
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur lors de la modification de l\'icône:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible de modifier l'icône. Vérifiez que le bot est administrateur et que l'image est valide.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Créer un canal d'annonces dans la communauté
 */
async function createCommunityChannel(sock, chatId, message, channelName, channelType = 'announcement') {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Vérifier que c'est une communauté
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Vérifier les permissions admin
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Seuls les administrateurs peuvent créer des canaux dans la communauté.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        if (!channelName) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier un nom pour le canal\n\nUtilisation: .createchannel [nom] [type]",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Note: La création de canaux dans les communautés WhatsApp peut nécessiter des API spécifiques
        // qui ne sont pas encore disponibles dans Baileys. Cette fonction est préparée pour le futur.
        
        await sock.sendMessage(chatId, {
            text: "⚠️ La création de canaux dans les communautés WhatsApp n'est pas encore supportée par l'API.\n\nCette fonctionnalité sera disponible prochainement.",
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur lors de la création du canal:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la création du canal.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Lister les canaux de la communauté
 */
async function listCommunityChannels(sock, chatId, message) {
    try {
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const channels = await getCommunityChannels(sock, chatId);
        
        if (channels.length === 0) {
            await sock.sendMessage(chatId, {
                text: "📢 Aucun canal trouvé dans cette communauté.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        let channelsList = "📢 *CANAUX DE LA COMMUNAUTÉ*\n\n";
        channels.forEach((channel, index) => {
            channelsList += `${index + 1}. 📋 *${channel.name}*\n`;
            channelsList += `   🏷️ Type: ${channel.type}\n`;
            if (channel.description) {
                channelsList += `   📄 Description: ${channel.description}\n`;
            }
            channelsList += `\n`;
        });

        await sock.sendMessage(chatId, {
            text: channelsList,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur lors de la liste des canaux:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération des canaux.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Envoyer une annonce à toute la communauté
 */
async function sendCommunityAnnouncement(sock, chatId, message, announcement) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        // Vérifier que c'est une communauté
        if (!(await isCommunity(sock, chatId))) {
            await sock.sendMessage(chatId, {
                text: "❌ Cette commande ne fonctionne que dans les communautés WhatsApp",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Vérifier les permissions admin
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: "❌ Seuls les administrateurs peuvent envoyer des annonces à la communauté.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        if (!announcement) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier le contenu de l'annonce\n\nUtilisation: .announce [message]",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Formater l'annonce
        const formattedAnnouncement = `📢 *ANNONCE COMMUNAUTÉ*\n\n${announcement}\n\n_Envoyé par @${senderId.split('@')[0]}_`;

        // Envoyer l'annonce
        await sock.sendMessage(chatId, {
            text: formattedAnnouncement,
            mentions: [senderId],
            ...channelConfig
        });

        // Envoyer aussi aux groupes liés si configuré
        const linkedGroups = await getCommunityGroups(chatId);
        const settings = await getCommunitySettings(chatId);
        
        if (settings?.broadcast_to_groups && linkedGroups.length > 0) {
            for (const group of linkedGroups) {
                try {
                    await sock.sendMessage(group.group_id, {
                        text: `📢 *ANNONCE DE LA COMMUNAUTÉ*\n\n${announcement}\n\n_Depuis la communauté principale_`,
                        ...channelConfig
                    });
                } catch (groupError) {
                    console.error(`Erreur envoi annonce au groupe ${group.name}:`, groupError);
                }
            }
        }

    } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'annonce:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'envoi de l'annonce.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Envoyer une annonce de bienvenue automatique quand le bot rejoint une communauté
 */
async function sendBotWelcomeAnnouncement(sock, chatId, groupName) {
    try {
        // Vérifier que c'est une communauté
        if (!(await isCommunity(sock, chatId))) {
            return false;
        }

        // Vérifier que le bot est admin (requis pour envoyer des annonces)
        const botJid = sock.user?.id?.replace(/:\d+/, '@s.whatsapp.net');
        const { isBotAdmin } = await isAdmin(sock, chatId, botJid);
        
        if (!isBotAdmin) {
            console.log(`ℹ️ Bot is not admin in community ${groupName}, cannot send welcome announcement`);
            return false;
        }

        // Créer l'annonce de bienvenue avec le magnifique formatage
        const welcomeAnnouncement = `┏━❮⛤ *𝐀𝐍𝐍𝐎𝐍𝐂𝐄 𝐂𝐎𝐌𝐌𝐔𝐍𝐀𝐔𝐓É* ⛤❯━
┃✰╭─────────────────────────────────────────────·
┃✰┃🤖 *WABOT EST MAINTENANT ACTIF !*
┃✰┃🏘️ Communauté: *${groupName}*
┃✰┃⚡ Assistant WhatsApp intelligent intégré
┃✰┃📋 Tapez \`.help\` pour voir toutes les commandes
┃✰└─────────────────────────────────────────────┈⊷
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━𖣔𖣔

🎯 **Fonctionnalités principales :**
• 🏘️ Gestion de communauté avancée
• 👑 Administration automatisée  
• 🤖 Assistant IA intégré
• 🛠️ Outils pratiques multiples
• 🎮 Divertissement & jeux

*┌────────────────────────────────────────────┐*
*│🚀 Prêt à améliorer votre communauté !│*
*└────────────────────────────────────────────┘*

_💫 Bot activé automatiquement par l'équipe wabot_`;

        // Envoyer l'annonce dans la communauté principale
        await sock.sendMessage(chatId, {
            text: welcomeAnnouncement,
            ...channelConfig
        });

        console.log(`📢 Bot welcome announcement sent to community: ${groupName}`);

        // Envoyer aussi aux groupes liés si configuré
        const linkedGroups = await getCommunityGroups(chatId);
        const settings = await getCommunitySettings(chatId);
        
        if (settings?.broadcast_to_groups && linkedGroups.length > 0) {
            console.log(`📢 Broadcasting welcome announcement to ${linkedGroups.length} subsidiary groups...`);
            
            for (const group of linkedGroups) {
                try {
                    if (group.is_linked && group.group_id) {
                        // Vérifier que le bot est membre du groupe subsidiaire
                        try {
                            const groupMeta = await sock.groupMetadata(group.group_id);
                            const isBotMember = groupMeta.participants.some(p => p.id === botJid);
                            
                            if (!isBotMember) {
                                console.log(`⚠️ Bot is not a member of subsidiary group ${group.name}, skipping announcement`);
                                continue;
                            }
                        } catch (metaError) {
                            console.log(`⚠️ Cannot access metadata for group ${group.name}, skipping announcement`);
                            continue;
                        }

                        const subsidiaryAnnouncement = `📢 *ANNONCE DE LA COMMUNAUTÉ ${groupName}*

🤖 **WABOT EST MAINTENANT ACTIF !**

Assistant WhatsApp intelligent intégré dans votre communauté.
Tapez \`.help\` pour voir toutes les commandes disponibles.

_Annonce automatique depuis la communauté principale_`;

                        await sock.sendMessage(group.group_id, {
                            text: subsidiaryAnnouncement,
                            ...channelConfig
                        });
                        
                        console.log(`✅ Welcome announcement sent to subsidiary group: ${group.name}`);
                        
                        // Délai pour éviter les limites de taux
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (groupError) {
                    console.error(`❌ Failed to send welcome announcement to subsidiary group ${group.name}:`, groupError);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Error sending bot welcome announcement:', error);
        return false;
    }
}

/**
 * Fonctions utilitaires
 */
async function getCommunityChannels(sock, communityId) {
    try {
        const { data, error } = await db.supabase
            .from('community_channels')
            .select('*')
            .eq('community_id', communityId);
            
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération canaux:', error);
        return [];
    }
}

async function getCommunityGroups(communityId) {
    try {
        const { data, error } = await db.supabase
            .from('community_groups')
            .select('*')
            .eq('community_id', communityId);
            
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur récupération groupes:', error);
        return [];
    }
}

async function getCommunitySettings(communityId) {
    try {
        const { data, error } = await db.supabase
            .from('community_settings')
            .select('*')
            .eq('community_id', communityId)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    } catch (error) {
        console.error('Erreur récupération paramètres:', error);
        return null;
    }
}

module.exports = {
    isCommunity,
    getCommunityInfo,
    setCommunityDescription,
    setCommunityIcon,
    createCommunityChannel,
    listCommunityChannels,
    sendCommunityAnnouncement,
    sendBotWelcomeAnnouncement,
    getCommunityChannels,
    getCommunityGroups,
    getCommunitySettings
};