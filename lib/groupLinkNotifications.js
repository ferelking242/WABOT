const { supabase } = require('./supabase');
const { i18n } = require('./i18n');

/**
 * Service pour gérer les notifications de liaison de groupes
 * Envoie automatiquement des messages de confirmation dans les groupes WhatsApp
 * après qu'ils ont été liés via le dashboard web
 */

let isProcessing = false;

/**
 * Vérifie et envoie les notifications de liaison en attente
 * @param {Object} sock - Instance Baileys WhatsApp socket
 */
async function processGroupLinkNotifications(sock) {
    // Éviter les exécutions concurrentes
    if (isProcessing) {
        return;
    }

    isProcessing = true;

    try {
        // Récupérer les notifications en attente
        const { data: pendingNotifications, error } = await supabase
            .from('group_link_notifications')
            .select('*')
            .eq('notification_sent', false)
            .limit(10);

        if (error) {
            console.error('❌ [GROUP_LINK_NOTIF] Erreur récupération notifications:', error);
            return;
        }

        if (!pendingNotifications || pendingNotifications.length === 0) {
            return;
        }

        console.log(`📬 [GROUP_LINK_NOTIF] ${pendingNotifications.length} notification(s) en attente`);

        // Traiter chaque notification
        for (const notification of pendingNotifications) {
            try {
                await sendLinkConfirmation(sock, notification);
                
                // Marquer comme envoyée
                await supabase
                    .from('group_link_notifications')
                    .update({ 
                        notification_sent: true,
                        notification_sent_at: new Date().toISOString()
                    })
                    .eq('id', notification.id);

                // Nettoyer après 5 minutes (supprimer l'enregistrement)
                setTimeout(async () => {
                    await supabase
                        .from('group_link_notifications')
                        .delete()
                        .eq('id', notification.id);
                }, 300000);

                console.log(`✅ [GROUP_LINK_NOTIF] Notification envoyée pour ${notification.group_name}`);
                
                // Attendre un peu entre chaque envoi pour éviter le spam
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (notifError) {
                console.error(`❌ [GROUP_LINK_NOTIF] Erreur envoi notification pour ${notification.group_id}:`, notifError);
                
                // Marquer comme erreur pour ne pas retenter indéfiniment
                await supabase
                    .from('group_link_notifications')
                    .update({ 
                        notification_error: notifError.message
                    })
                    .eq('id', notification.id);
            }
        }

    } catch (error) {
        console.error('❌ [GROUP_LINK_NOTIF] Erreur processus notifications:', error);
    } finally {
        isProcessing = false;
    }
}

/**
 * Envoie le message de confirmation de liaison dans le groupe
 * @param {Object} sock - Instance Baileys WhatsApp socket
 * @param {Object} notification - Données de notification
 */
async function sendLinkConfirmation(sock, notification) {
    const groupId = notification.group_id;
    const groupName = notification.group_name;
    const groupType = notification.group_type || 'group';
    
    // Obtenir la langue du groupe (on utilise FR par défaut pour les groupes)
    const lang = 'fr';
    
    const entityEmoji = groupType === 'community' ? '🏢' : '👥';
    const entityLabel = groupType === 'community' ? 'Communauté' : 'Groupe';
    
    const message = `✅ *${entityLabel} lié avec succès !*

${entityEmoji} *${entityLabel}:* ${groupName}
🎉 *Statut:* Liaison confirmée
📅 *Date:* ${new Date().toLocaleDateString('fr-FR')}

*🚀 Prochaines étapes:*
• Accédez au dashboard web pour gérer ce ${entityLabel.toLowerCase()}
• Configurez les paramètres du bot
• Activez les fonctionnalités souhaitées

💡 *Besoin d'aide ?*
Tapez \`.help\` pour voir toutes les commandes disponibles

_🤖 Notification automatique du système Wabot_`;

    try {
        await sock.sendMessage(groupId, { text: message });
        console.log(`📨 [GROUP_LINK_NOTIF] Message de confirmation envoyé à ${groupName}`);
    } catch (sendError) {
        console.error(`❌ [GROUP_LINK_NOTIF] Erreur envoi message à ${groupId}:`, sendError);
        throw sendError;
    }
}

/**
 * Démarre le service de notifications (intervalle de vérification)
 * @param {Object} sock - Instance Baileys WhatsApp socket
 * @param {number} intervalMs - Intervalle de vérification en ms (défaut: 30s)
 */
function startGroupLinkNotificationService(sock, intervalMs = 30000) {
    console.log('🔔 [GROUP_LINK_NOTIF] Service de notifications démarré');
    
    // Vérifier immédiatement au démarrage
    setTimeout(() => {
        processGroupLinkNotifications(sock).catch(err => {
            console.error('❌ [GROUP_LINK_NOTIF] Erreur vérification initiale:', err);
        });
    }, 5000); // Attendre 5s après le démarrage du bot
    
    // Puis vérifier à intervalles réguliers
    const intervalId = setInterval(() => {
        processGroupLinkNotifications(sock).catch(err => {
            console.error('❌ [GROUP_LINK_NOTIF] Erreur vérification périodique:', err);
        });
    }, intervalMs);
    
    return intervalId;
}

module.exports = {
    processGroupLinkNotifications,
    sendLinkConfirmation,
    startGroupLinkNotificationService
};
