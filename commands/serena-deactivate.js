const SerenaAI = require('../serena-assistant/core/SerenaAI');

module.exports = {
    name: 'serena-deactivate',
    category: 'companion',
    description: 'Désactiver temporairement l\'assistant IA Serena',
    usage: '.serena-deactivate',
    aliases: ['serena-off', 'serena-pause', 'deactivate-serena'],
    adminOnly: false,
    ownerOnly: false,
    companionOnly: true,

    async execute(sock, message, args, userJid, isGroupMsg, groupMetadata, user, companion) {
        try {
            if (!companion) {
                return await sock.sendMessage(userJid, {
                    text: '❌ Cette commande n\'est disponible que pour les Companions.'
                });
            }

            const serena = new SerenaAI(companion.companion_name);
            await serena.initialize();

            if (!serena.isEnabled()) {
                return await sock.sendMessage(userJid, {
                    text: `ℹ️ *Serena est déjà désactivée*\n\n` +
                          `🤖 Votre assistante IA n'est pas active actuellement.\n` +
                          `✅ Utilisez \`.serena-activate\` pour la réactiver.`
                });
            }

            // Confirmer la désactivation
            const confirmMessage = `⚠️ **Confirmation requise**\n\n` +
                `Êtes-vous sûr de vouloir désactiver Serena ?\n\n` +
                `❌ **Conséquences :**\n` +
                `• Serena ne répondra plus aux clients automatiquement\n` +
                `• Les conversations ne seront plus enregistrées\n` +
                `• Les statistiques ne seront plus mises à jour\n\n` +
                `📝 Répondez **OUI** pour confirmer ou **NON** pour annuler.`;

            await sock.sendMessage(userJid, { text: confirmMessage });

            // Attendre la réponse de confirmation
            const filter = (msg) => {
                const response = msg.message?.conversation?.toLowerCase().trim() || 
                               msg.message?.extendedTextMessage?.text?.toLowerCase().trim();
                return response === 'oui' || response === 'yes' || response === 'non' || response === 'no';
            };

            try {
                const confirmation = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout'));
                    }, 30000); // 30 secondes timeout

                    const messageHandler = (msg) => {
                        if (msg.key.remoteJid === userJid && filter(msg)) {
                            clearTimeout(timeout);
                            sock.ev.off('messages.upsert', messageHandler);
                            resolve(msg);
                        }
                    };

                    sock.ev.on('messages.upsert', ({ messages }) => {
                        messages.forEach(messageHandler);
                    });
                });

                const response = confirmation.message?.conversation?.toLowerCase().trim() || 
                               confirmation.message?.extendedTextMessage?.text?.toLowerCase().trim();

                if (response === 'oui' || response === 'yes') {
                    await serena.disable();

                    const deactivationMessage = `✅ *Serena a été désactivée*\n\n` +
                        `🤖 Votre assistante IA ne gère plus automatiquement les conversations.\n\n` +
                        `📊 **Les données sont conservées :**\n` +
                        `• Historique des conversations\n` +
                        `• Base de données clients\n` +
                        `• Configuration personnalisée\n` +
                        `• Liste des produits\n\n` +
                        `🔄 Vous pouvez réactiver Serena à tout moment avec \`.serena-activate\``;

                    await sock.sendMessage(userJid, { text: deactivationMessage });
                    console.log(`❌ [SERENA] Assistant désactivé pour ${companion.companion_name}`);
                } else {
                    await sock.sendMessage(userJid, {
                        text: `❌ *Désactivation annulée*\n\nSerena reste active et continue de gérer vos clients.`
                    });
                }

            } catch (timeoutError) {
                await sock.sendMessage(userJid, {
                    text: `⏱️ *Temps d'attente expiré*\n\nDésactivation annulée. Serena reste active.\n\n` +
                          `Utilisez à nouveau \`.serena-deactivate\` si vous souhaitez la désactiver.`
                });
            }

        } catch (error) {
            console.error('❌ Erreur lors de la désactivation de Serena:', error);
            await sock.sendMessage(userJid, {
                text: '❌ *Erreur lors de la désactivation de Serena*\n\n' +
                      'Une erreur technique s\'est produite. Veuillez réessayer.'
            });
        }
    }
};