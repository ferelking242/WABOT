/**
 * Commande Notify - Gestion des notifications de mises à jour
 */

const updateNotifier = require('../lib/updateNotifier');
const isOwner = require('../lib/isOwner');

/**
 * Affiche l'aide de la commande notify
 */
async function showNotifyHelp(sock, chatId, message) {
    const helpText = 'COMMANDE NOTIFY\n\nUtilisation :\n• .notify - Statut des notifications\n• .notify on - Activer les notifications\n• .notify off - Désactiver les notifications\n• .notify check - Vérifier maintenant\n• .notify interval <minutes> - Changer l\'intervalle\n• .notify status - Statut détaillé\n• .notify reset - Réinitialiser les notifications\n\nExemples :\n• .notify on - Activer\n• .notify interval 60 - Vérifier toutes les heures\n• .notify check - Forcer la vérification';

    await sock.sendMessage(chatId, { 
        text: helpText 
    }, { quoted: message });
}

/**
 * Affiche le statut des notifications
 */
async function showNotifyStatus(sock, chatId, message) {
    try {
        const status = updateNotifier.getStatus();
        
        let statusText = 'STATUT DES NOTIFICATIONS\n\n';
        statusText += 'État: ' + (status.enabled ? '✅ Activé' : '❌ Désactivé') + '\n';
        statusText += 'Fonctionnement: ' + (status.running ? '🔄 En cours' : '💤 Arrêté') + '\n';
        statusText += 'Intervalle: ' + status.checkIntervalMinutes + ' minutes\n';
        statusText += 'Pré-releases: ' + (status.notifyPreReleases ? '✅ Oui' : '❌ Non') + '\n';
        
        if (status.lastCheck) {
            const lastCheck = new Date(status.lastCheck);
            statusText += 'Dernière vérif: ' + lastCheck.toLocaleString('fr-FR') + '\n';
        }
        
        if (status.lastNotifiedVersion) {
            statusText += 'Dernière notif: ' + status.lastNotifiedVersion + '\n';
        }
        
        if (status.nextCheckIn && status.running) {
            statusText += 'Prochaine vérif: dans ' + status.nextCheckIn + ' minutes\n';
        }
        
        statusText += '\nCommandes:\n• .notify on/off - Activer/Désactiver\n• .notify check - Vérifier maintenant\n• .notify help - Plus d\'options';

        await sock.sendMessage(chatId, { 
            text: statusText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors de la récupération du statut: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Active les notifications
 */
async function enableNotifications(sock, chatId, message) {
    try {
        updateNotifier.configure({ enabled: true });
        
        await sock.sendMessage(chatId, { 
            text: '✅ Notifications de mises à jour activées !\n\nVous recevrez maintenant des notifications lorsque de nouvelles versions seront disponibles.\n\n• Utilisez .notify status pour voir le statut\n• Utilisez .notify off pour désactiver'
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors de l\'activation: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Désactive les notifications
 */
async function disableNotifications(sock, chatId, message) {
    try {
        updateNotifier.configure({ enabled: false });
        
        await sock.sendMessage(chatId, { 
            text: '❌ Notifications de mises à jour désactivées.\n\nVous ne recevrez plus de notifications automatiques.\n\n• Utilisez .notify on pour réactiver\n• Utilisez .update check pour vérifier manuellement'
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors de la désactivation: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Change l'intervalle de vérification
 */
async function setNotifyInterval(sock, chatId, message, intervalMinutes) {
    try {
        const interval = parseInt(intervalMinutes);
        
        if (isNaN(interval) || interval < 15) {
            await sock.sendMessage(chatId, { 
                text: 'Erreur: L\'intervalle doit être un nombre supérieur à 15 minutes.\nExemple: .notify interval 60'
            }, { quoted: message });
            return;
        }
        
        if (interval > 1440) { // 24 heures
            await sock.sendMessage(chatId, { 
                text: 'Erreur: L\'intervalle maximum est de 1440 minutes (24 heures).\nExemple: .notify interval 360'
            }, { quoted: message });
            return;
        }
        
        updateNotifier.configure({ 
            checkIntervalMinutes: interval,
            enabled: true // Activer automatiquement si on configure un intervalle
        });
        
        const hours = Math.floor(interval / 60);
        const minutes = interval % 60;
        let timeText = '';
        
        if (hours > 0) {
            timeText += hours + 'h';
            if (minutes > 0) timeText += minutes + 'min';
        } else {
            timeText = minutes + ' minutes';
        }
        
        await sock.sendMessage(chatId, { 
            text: '✅ Intervalle de vérification changé !\n\nNouveau intervalle: ' + timeText + '\nLes notifications sont maintenant activées.\n\nUtilisez .notify status pour voir le statut'
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors du changement d\'intervalle: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Force une vérification immédiate
 */
async function forceNotifyCheck(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: '🔍 Vérification des mises à jour en cours...'
        }, { quoted: message });

        await updateNotifier.forceCheck(sock);
        
        await sock.sendMessage(chatId, { 
            text: '✅ Vérification terminée !\n\nSi une nouvelle version est disponible, vous devriez recevoir une notification.\n\nUtilisez .update check pour plus de détails'
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors de la vérification: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Réinitialise les notifications
 */
async function resetNotifications(sock, chatId, message) {
    try {
        updateNotifier.resetNotifications();
        
        await sock.sendMessage(chatId, { 
            text: '🔄 Notifications réinitialisées !\n\nLe système va maintenant re-notifier la prochaine version disponible, même si elle a déjà été notifiée.\n\nUtilisez .notify check pour forcer une vérification'
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Erreur lors de la réinitialisation: ' + error.message
        }, { quoted: message });
    }
}

/**
 * Commande principale
 */
async function notifyCommand(sock, chatId, message, senderId, args = []) {
    try {
        // Vérifier les permissions - seuls les propriétaires peuvent gérer les notifications
        const hasPermission = await isOwner(senderId);
        if (!hasPermission) {
            await sock.sendMessage(chatId, { 
                text: 'Seuls les propriétaires peuvent gérer les notifications de mises à jour.'
            }, { quoted: message });
            return;
        }

        const subCommand = args[0] ? args[0].toLowerCase() : undefined;
        const parameter = args[1];

        switch (subCommand) {
            case undefined:
            case 'status':
                await showNotifyStatus(sock, chatId, message);
                break;

            case 'on':
            case 'enable':
            case 'start':
                await enableNotifications(sock, chatId, message);
                break;

            case 'off':
            case 'disable':
            case 'stop':
                await disableNotifications(sock, chatId, message);
                break;

            case 'interval':
            case 'time':
                if (parameter) {
                    await setNotifyInterval(sock, chatId, message, parameter);
                } else {
                    await sock.sendMessage(chatId, { 
                        text: 'Veuillez spécifier un intervalle en minutes.\nExemple: .notify interval 60'
                    }, { quoted: message });
                }
                break;

            case 'check':
            case 'now':
            case 'force':
                await forceNotifyCheck(sock, chatId, message);
                break;

            case 'reset':
            case 'clear':
                await resetNotifications(sock, chatId, message);
                break;

            case 'help':
            default:
                await showNotifyHelp(sock, chatId, message);
                break;
        }

    } catch (error) {
        console.error('Notify command error:', error);
        await sock.sendMessage(chatId, { 
            text: 'Erreur interne: ' + error.message
        }, { quoted: message });
    }
}

module.exports = notifyCommand;