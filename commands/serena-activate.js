const SerenaAI = require('../serena-assistant/core/SerenaAI');
const ProductAnalyzer = require('../serena-assistant/handlers/ProductAnalyzer');
const { isOwner } = require('../lib/isOwner');

module.exports = {
    name: 'serena-activate',
    category: 'companion',
    description: 'Activer l\'assistant IA Serena pour gérer automatiquement votre clientèle',
    usage: '.serena-activate',
    aliases: ['serena-on', 'activate-serena'],
    adminOnly: false,
    ownerOnly: false,
    companionOnly: true,

    async execute(sock, message, args, userJid, isGroupMsg, groupMetadata, user, companion) {
        try {
            if (!companion) {
                return await sock.sendMessage(userJid, {
                    text: '❌ Cette commande n\'est disponible que pour les Companions. Utilisez `.companion` pour créer votre Companion Bot.'
                });
            }

            // Initialiser Serena pour ce companion
            const serena = new SerenaAI(companion.companion_name);
            await serena.initialize();

            if (serena.isEnabled()) {
                return await sock.sendMessage(userJid, {
                    text: `✅ *Serena est déjà active !*\n\n` +
                          `🤖 Votre assistante IA gère automatiquement vos clients.\n` +
                          `📊 Utilisez \`.serena-status\` pour voir les statistiques.\n` +
                          `⚙️ Utilisez \`.serena-config\` pour personnaliser Serena.`
                });
            }

            // Activer Serena
            await serena.enable();

            // Message de confirmation avec instructions
            const activationMessage = `✅ *Serena est maintenant active !* 🎉\n\n` +
                `🤖 **Votre assistante IA personnelle**\n` +
                `Serena va maintenant gérer automatiquement vos conversations clients avec intelligence et professionnalisme.\n\n` +
                
                `🎯 **Ce que Serena peut faire :**\n` +
                `• 💬 Répondre aux clients de manière humaine\n` +
                `• 📋 Répertorier et gérer votre clientèle\n` +
                `• 🛍️ Promouvoir vos produits intelligemment\n` +
                `• 🔗 Analyser des liens de catalogues produits\n` +
                `• 📊 Suivre les interactions et statistiques\n` +
                `• ⏰ Respecter vos heures de travail\n\n` +
                
                `⚙️ **Commandes disponibles :**\n` +
                `• \`.serena-config\` - Personnaliser Serena\n` +
                `• \`.serena-status\` - Voir les statistiques\n` +
                `• \`.serena-products\` - Gérer vos produits\n` +
                `• \`.serena-clients\` - Voir votre clientèle\n` +
                `• \`.serena-analyze [lien]\` - Analyser un catalogue\n` +
                `• \`.serena-pause\` - Désactiver temporairement\n\n` +
                
                `🎨 **Personnalisation recommandée :**\n` +
                `1. Configurez votre business: \`.serena-config business\`\n` +
                `2. Ajoutez vos produits: \`.serena-products add\`\n` +
                `3. Personnalisez sa personnalité: \`.serena-config personality\`\n\n` +
                
                `💡 *Serena apprend de chaque interaction pour mieux servir vos clients !*`;

            await sock.sendMessage(userJid, { text: activationMessage });

            console.log(`✅ [SERENA] Assistant activé pour le companion ${companion.companion_name}`);

        } catch (error) {
            console.error('❌ Erreur lors de l\'activation de Serena:', error);
            await sock.sendMessage(userJid, {
                text: '❌ *Erreur lors de l\'activation de Serena*\n\n' +
                      'Une erreur technique s\'est produite. Veuillez réessayer dans quelques instants.\n\n' +
                      'Si le problème persiste, contactez le support.'
            });
        }
    }
};