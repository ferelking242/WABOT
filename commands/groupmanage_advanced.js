const { channelConfig } = require('../lib/channelConfig');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');

// Commandes avancées de gestion de groupe

async function setGroupRules(sock, chatId, message, rules) {
    try {
        if (!rules) {
            return await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier les règles\n\nUtilisation: .setrules [règles du groupe]",
                ...channelConfig
            }, { quoted: message });
        }

        // Sauvegarder les règles du groupe
        const groupRulesData = {};
        if (fs.existsSync('./data/groupRules.json')) {
            const data = fs.readFileSync('./data/groupRules.json', 'utf8');
            Object.assign(groupRulesData, JSON.parse(data));
        }
        
        groupRulesData[chatId] = {
            rules: rules,
            setBy: message.key.participantAlt || message.key.participant || message.key.remoteJid,
            timestamp: Date.now()
        };
        
        fs.writeFileSync('./data/groupRules.json', JSON.stringify(groupRulesData, null, 2));

        await sock.sendMessage(chatId, {
            text: `✅ *Règles du groupe mises à jour:*\n\n${rules}\n\n📝 *Tapez .rules pour voir les règles*`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error setting group rules:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la définition des règles.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function getGroupRules(sock, chatId, message) {
    try {
        if (!fs.existsSync('./data/groupRules.json')) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucune règle n'a été définie pour ce groupe.\n\n💡 Les admins peuvent utiliser .setrules pour en définir.",
                ...channelConfig
            }, { quoted: message });
        }

        const groupRulesData = JSON.parse(fs.readFileSync('./data/groupRules.json', 'utf8'));
        const rules = groupRulesData[chatId];

        if (!rules) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucune règle n'a été définie pour ce groupe.\n\n💡 Les admins peuvent utiliser .setrules pour en définir.",
                ...channelConfig
            }, { quoted: message });
        }

        const setDate = new Date(rules.timestamp).toLocaleDateString();
        await sock.sendMessage(chatId, {
            text: `📋 *RÈGLES DU GROUPE*\n\n${rules.rules}\n\n📅 *Définies le:* ${setDate}`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error getting group rules:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération des règles.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function setGroupLink(sock, chatId, message, customLink) {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        
        if (customLink) {
            // Créer un nouveau lien personnalisé (si possible)
            await sock.sendMessage(chatId, {
                text: "⚠️ Les liens personnalisés ne sont pas supportés par WhatsApp.\nUtilisez .resetlink pour générer un nouveau lien.",
                ...channelConfig
            }, { quoted: message });
        } else {
            // Obtenir le lien actuel
            const inviteCode = await sock.groupInviteCode(chatId);
            const link = `https://chat.whatsapp.com/${inviteCode}`;
            
            await sock.sendMessage(chatId, {
                text: `🔗 *LIEN DU GROUPE*\n\n${link}\n\n⚠️ Partagez ce lien avec précaution !`,
                ...channelConfig
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error with group link:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Impossible d'obtenir le lien du groupe. Vérifiez que le bot est admin.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function setWelcomeMessage(sock, chatId, message, welcomeMsg) {
    try {
        if (!welcomeMsg) {
            return await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier le message de bienvenue\n\nUtilisation: .setwelcome [votre message]\n\n💡 Utilisez @user pour mentionner le nouveau membre",
                ...channelConfig
            }, { quoted: message });
        }

        const welcomeData = {};
        if (fs.existsSync('./data/welcomeMessages.json')) {
            const data = fs.readFileSync('./data/welcomeMessages.json', 'utf8');
            Object.assign(welcomeData, JSON.parse(data));
        }
        
        welcomeData[chatId] = {
            message: welcomeMsg,
            setBy: message.key.participantAlt || message.key.participant || message.key.remoteJid,
            timestamp: Date.now(),
            enabled: true
        };
        
        fs.writeFileSync('./data/welcomeMessages.json', JSON.stringify(welcomeData, null, 2));

        await sock.sendMessage(chatId, {
            text: `✅ *Message de bienvenue personnalisé défini:*\n\n${welcomeMsg}\n\n💡 Les nouveaux membres verront ce message`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error setting welcome message:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la définition du message de bienvenue.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function memberActivity(sock, chatId, message) {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        
        // Lire les données d'activité (simulées pour l'exemple)
        let activityData = {};
        if (fs.existsSync('./data/memberActivity.json')) {
            activityData = JSON.parse(fs.readFileSync('./data/memberActivity.json', 'utf8'));
        }
        
        const groupActivity = activityData[chatId] || {};
        
        let activityReport = '*📊 ACTIVITÉ DES MEMBRES (7 derniers jours)*\n\n';
        
        const sortedMembers = Object.entries(groupActivity)
            .sort(([,a], [,b]) => (b.messages || 0) - (a.messages || 0))
            .slice(0, 10);
        
        if (sortedMembers.length === 0) {
            activityReport += '📝 Aucune donnée d\'activité disponible.\n\n💡 Les données seront collectées à partir de maintenant.';
        } else {
            sortedMembers.forEach(([memberId, data], index) => {
                const contact = groupMetadata.participants.find(p => p.id === memberId);
                const name = contact ? (contact.notify || memberId.split('@')[0]) : 'Membre inconnu';
                const messageCount = data.messages || 0;
                
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
                activityReport += `${emoji} *${name}*: ${messageCount} messages\n`;
            });
        }
        
        await sock.sendMessage(chatId, {
            text: activityReport,
            ...channelConfig
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error getting member activity:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération de l'activité des membres.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function pinMessage(sock, chatId, message) {
    try {
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage) {
            return await sock.sendMessage(chatId, {
                text: "❌ Répondez à un message avec .pin pour l'épingler",
                ...channelConfig
            }, { quoted: message });
        }

        // Sauvegarder le message épinglé
        const pinnedData = {};
        if (fs.existsSync('./data/pinnedMessages.json')) {
            const data = fs.readFileSync('./data/pinnedMessages.json', 'utf8');
            Object.assign(pinnedData, JSON.parse(data));
        }
        
        pinnedData[chatId] = {
            message: quotedMessage,
            pinnedBy: message.key.participantAlt || message.key.participant || message.key.remoteJid,
            timestamp: Date.now()
        };
        
        fs.writeFileSync('./data/pinnedMessages.json', JSON.stringify(pinnedData, null, 2));

        await sock.sendMessage(chatId, {
            text: "📌 *Message épinglé !*\n\n💡 Utilisez .pinned pour voir le message épinglé",
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error pinning message:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'épinglage du message.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function showPinnedMessage(sock, chatId, message) {
    try {
        if (!fs.existsSync('./data/pinnedMessages.json')) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucun message épinglé dans ce groupe.",
                ...channelConfig
            }, { quoted: message });
        }

        const pinnedData = JSON.parse(fs.readFileSync('./data/pinnedMessages.json', 'utf8'));
        const pinned = pinnedData[chatId];

        if (!pinned) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucun message épinglé dans ce groupe.",
                ...channelConfig
            }, { quoted: message });
        }

        const pinnedDate = new Date(pinned.timestamp).toLocaleDateString();
        
        // Reconstituer le message épinglé
        let pinnedContent = "📌 *MESSAGE ÉPINGLÉ*\n\n";
        
        if (pinned.message.conversation) {
            pinnedContent += pinned.message.conversation;
        } else if (pinned.message.extendedTextMessage?.text) {
            pinnedContent += pinned.message.extendedTextMessage.text;
        } else {
            pinnedContent += "[Message média ou autre type]";
        }
        
        pinnedContent += `\n\n📅 *Épinglé le:* ${pinnedDate}`;

        await sock.sendMessage(chatId, {
            text: pinnedContent,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error showing pinned message:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'affichage du message épinglé.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function scheduleMessage(sock, chatId, message, args) {
    try {
        if (args.length < 3) {
            return await sock.sendMessage(chatId, {
                text: "❌ Utilisation incorrecte\n\n*Format:* .schedule [heure] [date] [message]\n*Exemple:* .schedule 14:30 2024-12-25 Joyeux Noël !",
                ...channelConfig
            }, { quoted: message });
        }

        const time = args[0];
        const date = args[1];
        const messageText = args.slice(2).join(' ');

        // Valider le format
        const dateTimeStr = `${date} ${time}`;
        const scheduleTime = new Date(dateTimeStr);

        if (isNaN(scheduleTime.getTime()) || scheduleTime <= new Date()) {
            return await sock.sendMessage(chatId, {
                text: "❌ Date/heure invalide ou dans le passé\n\n*Format:* YYYY-MM-DD HH:MM\n*Exemple:* 2024-12-25 14:30",
                ...channelConfig
            }, { quoted: message });
        }

        // Sauvegarder le message programmé
        const scheduledData = {};
        if (fs.existsSync('./data/scheduledMessages.json')) {
            const data = fs.readFileSync('./data/scheduledMessages.json', 'utf8');
            Object.assign(scheduledData, JSON.parse(data));
        }
        
        if (!scheduledData[chatId]) scheduledData[chatId] = [];
        
        scheduledData[chatId].push({
            message: messageText,
            scheduleTime: scheduleTime.getTime(),
            scheduledBy: message.key.participantAlt || message.key.participant || message.key.remoteJid,
            id: Date.now().toString()
        });
        
        fs.writeFileSync('./data/scheduledMessages.json', JSON.stringify(scheduledData, null, 2));

        await sock.sendMessage(chatId, {
            text: `⏰ *Message programmé avec succès !*\n\n📅 *Date:* ${date}\n🕐 *Heure:* ${time}\n💬 *Message:* ${messageText}\n\n💡 Le message sera envoyé automatiquement`,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error scheduling message:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la programmation du message.",
            ...channelConfig
        }, { quoted: message });
    }
}

async function listScheduledMessages(sock, chatId, message) {
    try {
        if (!fs.existsSync('./data/scheduledMessages.json')) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucun message programmé pour ce groupe.",
                ...channelConfig
            }, { quoted: message });
        }

        const scheduledData = JSON.parse(fs.readFileSync('./data/scheduledMessages.json', 'utf8'));
        const scheduled = scheduledData[chatId] || [];

        if (scheduled.length === 0) {
            return await sock.sendMessage(chatId, {
                text: "❌ Aucun message programmé pour ce groupe.",
                ...channelConfig
            }, { quoted: message });
        }

        let listText = '⏰ *MESSAGES PROGRAMMÉS*\n\n';
        
        scheduled.forEach((msg, index) => {
            const scheduleDate = new Date(msg.scheduleTime);
            listText += `${index + 1}. *${scheduleDate.toLocaleDateString()} ${scheduleDate.toLocaleTimeString()}*\n`;
            listText += `💬 ${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}\n`;
            listText += `🆔 ID: ${msg.id}\n\n`;
        });
        
        listText += '💡 Utilisez .cancelschedule [ID] pour annuler un message';

        await sock.sendMessage(chatId, {
            text: listText,
            ...channelConfig
        }, { quoted: message });
    } catch (error) {
        console.error('Error listing scheduled messages:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération des messages programmés.",
            ...channelConfig
        }, { quoted: message });
    }
}

module.exports = {
    setGroupRules,
    getGroupRules,
    setGroupLink,
    setWelcomeMessage,
    memberActivity,
    pinMessage,
    showPinnedMessage,
    scheduleMessage,
    listScheduledMessages
};