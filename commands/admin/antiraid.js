const isAdmin = require('../../lib/isAdmin');
const { channelConfig } = require('../../lib/channelConfig');
const fs = require('fs');
const path = require('path');

// File to store antiraid data
const ANTIRAID_FILE = path.join(__dirname, '../data/antiraid.json');

// Initialize antiraid file
function initAntiraidFile() {
    const dataDir = path.dirname(ANTIRAID_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(ANTIRAID_FILE)) {
        fs.writeFileSync(ANTIRAID_FILE, JSON.stringify({}));
    }
}

// Get antiraid data
function getAntiraidData() {
    try {
        initAntiraidFile();
        return JSON.parse(fs.readFileSync(ANTIRAID_FILE, 'utf8'));
    } catch {
        return {};
    }
}

// Save antiraid data
function saveAntiraidData(data) {
    try {
        fs.writeFileSync(ANTIRAID_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving antiraid data:', err);
    }
}

// Antiraid configuration command
async function antiraidCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

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
                text: '❌ Seuls les admins peuvent configurer l\'anti-raid !',
                ...channelConfig
            });
            return;
        }

        if (!args.length) {
            const antiraidData = getAntiraidData();
            const groupSettings = antiraidData[chatId] || {
                enabled: false,
                maxJoinsPerMinute: 5,
                maxJoinsPerHour: 20,
                autoKickSuspicious: true,
                alertAdmins: true,
                lockDuration: 10 // minutes
            };

            await sock.sendMessage(chatId, {
                text: `🛡️ *PROTECTION ANTI-RAID*\n\n📊 *Configuration actuelle:*\n• Statut: ${groupSettings.enabled ? '🟢 Activé' : '🔴 Désactivé'}\n• Max joins/minute: ${groupSettings.maxJoinsPerMinute}\n• Max joins/heure: ${groupSettings.maxJoinsPerHour}\n• Auto-kick suspects: ${groupSettings.autoKickSuspicious ? '✅ Oui' : '❌ Non'}\n• Alertes admins: ${groupSettings.alertAdmins ? '✅ Oui' : '❌ Non'}\n• Durée verrouillage: ${groupSettings.lockDuration} min\n\n*Commandes:*\n• \`.antiraid on\` - Activer\n• \`.antiraid off\` - Désactiver\n• \`.antiraid config\` - Configuration avancée\n• \`.antiraid status\` - Statut détaillé\n• \`.antiraid reset\` - Réinitialiser compteurs`,
                ...channelConfig
            });
            return;
        }

        const action = args[0].toLowerCase();
        const antiraidData = getAntiraidData();

        if (!antiraidData[chatId]) {
            antiraidData[chatId] = {
                enabled: false,
                maxJoinsPerMinute: 5,
                maxJoinsPerHour: 20,
                autoKickSuspicious: true,
                alertAdmins: true,
                lockDuration: 10,
                joinLog: [],
                suspiciousUsers: [],
                lastRaidCheck: Date.now()
            };
        }

        const settings = antiraidData[chatId];

        switch (action) {
            case 'on':
            case 'enable':
                settings.enabled = true;
                saveAntiraidData(antiraidData);
                await sock.sendMessage(chatId, {
                    text: '🛡️ *Anti-raid activé !*\n\n✅ Protection contre les raids de masse\n🚨 Surveillance des arrivées suspectes\n⚡ Réaction automatique en cas de détection\n\n💡 Utilisez `.antiraid config` pour personnaliser',
                    ...channelConfig
                });
                break;

            case 'off':
            case 'disable':
                settings.enabled = false;
                saveAntiraidData(antiraidData);
                await sock.sendMessage(chatId, {
                    text: '🔓 *Anti-raid désactivé !*\n\n⚠️ Le groupe n\'est plus protégé contre les raids\n\n💡 Réactivez avec `.antiraid on`',
                    ...channelConfig
                });
                break;

            case 'status':
                const now = Date.now();
                const lastHour = now - (60 * 60 * 1000);
                const lastMinute = now - (60 * 1000);
                
                const joinsLastHour = settings.joinLog.filter(join => join.timestamp > lastHour).length;
                const joinsLastMinute = settings.joinLog.filter(join => join.timestamp > lastMinute).length;
                const suspiciousCount = settings.suspiciousUsers.length;

                let statusColor = '🟢';
                let statusText = 'Normal';
                
                if (joinsLastMinute >= settings.maxJoinsPerMinute * 0.8) {
                    statusColor = '🟡';
                    statusText = 'Surveillé';
                }
                if (joinsLastMinute >= settings.maxJoinsPerMinute) {
                    statusColor = '🔴';
                    statusText = 'RAID DÉTECTÉ';
                }

                await sock.sendMessage(chatId, {
                    text: `🛡️ *STATUT ANTI-RAID*\n\n${statusColor} *Statut:* ${statusText}\n📊 *Activité récente:*\n• Dernière minute: ${joinsLastMinute}/${settings.maxJoinsPerMinute}\n• Dernière heure: ${joinsLastHour}/${settings.maxJoinsPerHour}\n\n🚨 *Utilisateurs suspects:* ${suspiciousCount}\n⏰ *Dernière vérification:* ${new Date(settings.lastRaidCheck).toLocaleTimeString()}\n\n${settings.enabled ? '✅ Protection active' : '❌ Protection désactivée'}`,
                    ...channelConfig
                });
                break;

            case 'reset':
                settings.joinLog = [];
                settings.suspiciousUsers = [];
                settings.lastRaidCheck = Date.now();
                saveAntiraidData(antiraidData);
                await sock.sendMessage(chatId, {
                    text: '♻️ *Compteurs anti-raid réinitialisés !*\n\n✅ Historique des arrivées effacé\n✅ Liste des suspects vidée\n✅ Horodatage mis à jour',
                    ...channelConfig
                });
                break;

            case 'config':
                await sock.sendMessage(chatId, {
                    text: `⚙️ *CONFIGURATION ANTI-RAID*\n\n*Commandes disponibles:*\n• \`.antiraid setlimit [minute] [heure]\` - Définir limites\n• \`.antiraid autokick on/off\` - Auto-expulsion\n• \`.antiraid alerts on/off\` - Alertes admins\n• \`.antiraid locktime [minutes]\` - Durée verrouillage\n\n*Exemple:*\n\`.antiraid setlimit 3 15\`\n(Max 3 arrivées/minute, 15/heure)\n\n*Valeurs recommandées:*\n• Petit groupe: 2-3/min, 10-15/h\n• Grand groupe: 5-8/min, 20-30/h`,
                    ...channelConfig
                });
                break;

            default:
                await sock.sendMessage(chatId, {
                    text: '❌ Action inconnue !\n\n*Actions disponibles:*\n• `on/off` - Activer/désactiver\n• `status` - Voir le statut\n• `config` - Configuration\n• `reset` - Réinitialiser',
                    ...channelConfig
                });
        }

    } catch (error) {
        console.error('Error in antiraid command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la configuration anti-raid !',
            ...channelConfig
        });
    }
}

// Check for raid activity when someone joins
async function checkRaidActivity(sock, chatId, newMembers) {
    try {
        const antiraidData = getAntiraidData();
        const settings = antiraidData[chatId];

        if (!settings || !settings.enabled) return;

        const now = Date.now();
        
        // Log the new joins
        newMembers.forEach(member => {
            settings.joinLog.push({
                userId: member,
                timestamp: now
            });
        });

        // Clean old entries (older than 1 hour)
        const oneHourAgo = now - (60 * 60 * 1000);
        settings.joinLog = settings.joinLog.filter(join => join.timestamp > oneHourAgo);

        // Check for raid patterns
        const lastMinute = now - (60 * 1000);
        const joinsLastMinute = settings.joinLog.filter(join => join.timestamp > lastMinute).length;
        const joinsLastHour = settings.joinLog.length;

        let raidDetected = false;
        let alertMessage = '';

        // Check minute limit
        if (joinsLastMinute >= settings.maxJoinsPerMinute) {
            raidDetected = true;
            alertMessage = `🚨 *RAID DÉTECTÉ !*\n\n⚡ ${joinsLastMinute} arrivées en 1 minute\n🚫 Limite: ${settings.maxJoinsPerMinute}/minute\n\n`;
        }
        // Check hour limit
        else if (joinsLastHour >= settings.maxJoinsPerHour) {
            raidDetected = true;
            alertMessage = `🚨 *RAID DÉTECTÉ !*\n\n⚡ ${joinsLastHour} arrivées en 1 heure\n🚫 Limite: ${settings.maxJoinsPerHour}/heure\n\n`;
        }

        if (raidDetected) {
            // Auto-kick suspicious users if enabled
            if (settings.autoKickSuspicious) {
                try {
                    // Kick the most recent joiners
                    const recentJoiners = settings.joinLog
                        .filter(join => join.timestamp > lastMinute)
                        .map(join => join.userId)
                        .slice(-Math.min(newMembers.length, 3)); // Kick up to 3 most recent

                    if (recentJoiners.length > 0) {
                        await sock.groupParticipantsUpdate(chatId, recentJoiners, "remove");
                        alertMessage += `⚡ *Actions automatiques:*\n• ${recentJoiners.length} utilisateurs expulsés\n`;
                    }
                } catch (kickError) {
                    console.error('Error auto-kicking raid members:', kickError);
                    alertMessage += `⚠️ Impossible d'expulser automatiquement\n`;
                }
            }

            // Lock group temporarily
            try {
                await sock.groupSettingUpdate(chatId, 'announcement');
                alertMessage += `🔒 Groupe verrouillé temporairement\n`;
                
                // Schedule auto-unlock
                setTimeout(async () => {
                    try {
                        await sock.groupSettingUpdate(chatId, 'not_announcement');
                        await sock.sendMessage(chatId, {
                            text: '🔓 *Groupe déverrouillé automatiquement*\n\nLa période de sécurité anti-raid est terminée.',
                            ...channelConfig
                        });
                    } catch (unlockError) {
                        console.error('Error auto-unlocking group:', unlockError);
                    }
                }, settings.lockDuration * 60 * 1000);
                
            } catch (lockError) {
                console.error('Error locking group:', lockError);
                alertMessage += `⚠️ Impossible de verrouiller le groupe\n`;
            }

            alertMessage += `\n⏰ Déverrouillage automatique dans ${settings.lockDuration} minutes\n`;
            alertMessage += `💡 Admins: utilisez \`.antiraid reset\` pour réinitialiser`;

            // Send alert
            if (settings.alertAdmins) {
                await sock.sendMessage(chatId, {
                    text: alertMessage,
                    ...channelConfig
                });
            }

            // Mark users as suspicious
            newMembers.forEach(member => {
                if (!settings.suspiciousUsers.includes(member)) {
                    settings.suspiciousUsers.push(member);
                }
            });
        }

        settings.lastRaidCheck = now;
        saveAntiraidData(antiraidData);

    } catch (error) {
        console.error('Error checking raid activity:', error);
    }
}

// Configure antiraid settings
async function antiraidConfigCommand(sock, chatId, senderId, message, args) {
    try {
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isSenderAdmin) return;

        const antiraidData = getAntiraidData();
        if (!antiraidData[chatId]) return;

        const settings = antiraidData[chatId];
        const action = args[0]?.toLowerCase();

        switch (action) {
            case 'setlimit':
                const minuteLimit = parseInt(args[1]);
                const hourLimit = parseInt(args[2]);
                
                if (isNaN(minuteLimit) || isNaN(hourLimit) || minuteLimit < 1 || hourLimit < 1) {
                    await sock.sendMessage(chatId, {
                        text: '❌ Limites invalides !\n\n📝 *Format:* `.antiraid setlimit [minute] [heure]`\n💡 *Exemple:* `.antiraid setlimit 5 20`',
                        ...channelConfig
                    });
                    return;
                }

                settings.maxJoinsPerMinute = minuteLimit;
                settings.maxJoinsPerHour = hourLimit;
                saveAntiraidData(antiraidData);
                
                await sock.sendMessage(chatId, {
                    text: `✅ *Limites mises à jour !*\n\n⏱️ Maximum par minute: ${minuteLimit}\n📅 Maximum par heure: ${hourLimit}`,
                    ...channelConfig
                });
                break;

            case 'autokick':
                const autokickAction = args[1]?.toLowerCase();
                if (autokickAction === 'on') {
                    settings.autoKickSuspicious = true;
                    await sock.sendMessage(chatId, {
                        text: '✅ *Auto-expulsion activée !*\n\nLes utilisateurs suspects seront automatiquement expulsés lors d\'un raid.',
                        ...channelConfig
                    });
                } else if (autokickAction === 'off') {
                    settings.autoKickSuspicious = false;
                    await sock.sendMessage(chatId, {
                        text: '❌ *Auto-expulsion désactivée !*\n\nSeule la surveillance sera active lors d\'un raid.',
                        ...channelConfig
                    });
                }
                saveAntiraidData(antiraidData);
                break;

            case 'alerts':
                const alertAction = args[1]?.toLowerCase();
                if (alertAction === 'on') {
                    settings.alertAdmins = true;
                    await sock.sendMessage(chatId, {
                        text: '🚨 *Alertes activées !*\n\nLes admins seront notifiés en cas de détection de raid.',
                        ...channelConfig
                    });
                } else if (alertAction === 'off') {
                    settings.alertAdmins = false;
                    await sock.sendMessage(chatId, {
                        text: '🔇 *Alertes désactivées !*\n\nLa protection fonctionnera en silence.',
                        ...channelConfig
                    });
                }
                saveAntiraidData(antiraidData);
                break;

            case 'locktime':
                const lockMinutes = parseInt(args[1]);
                if (isNaN(lockMinutes) || lockMinutes < 1 || lockMinutes > 60) {
                    await sock.sendMessage(chatId, {
                        text: '❌ Durée invalide !\n\n📝 *Format:* `.antiraid locktime [minutes]`\n⏱️ *Limite:* 1-60 minutes',
                        ...channelConfig
                    });
                    return;
                }
                
                settings.lockDuration = lockMinutes;
                saveAntiraidData(antiraidData);
                
                await sock.sendMessage(chatId, {
                    text: `✅ *Durée de verrouillage mise à jour !*\n\n⏰ Nouveau délai: ${lockMinutes} minutes`,
                    ...channelConfig
                });
                break;
        }

    } catch (error) {
        console.error('Error in antiraid config:', error);
    }
}

module.exports = {
    antiraidCommand,
    antiraidConfigCommand,
    checkRaidActivity
};