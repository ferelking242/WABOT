const ProductAnalyzer = require('../serena-assistant/handlers/ProductAnalyzer');
const { isValidUrl } = require('../lib/myfunc2');

module.exports = {
    name: 'serena-analyze',
    category: 'companion',
    description: 'Analyser un lien pour extraire automatiquement les produits et les ajouter à Serena',
    usage: '.serena-analyze <lien-du-catalogue>',
    aliases: ['analyze-products', 'serena-extract'],
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

            if (!args[0]) {
                const helpMessage = `📋 **Analyse de Catalogues Produits**\n\n` +
                    `🔗 **Usage:** \`.serena-analyze <lien>\`\n\n` +
                    `📊 **Que fait cette commande ?**\n` +
                    `Serena va analyser intelligemment votre lien et extraire automatiquement :\n` +
                    `• 📦 Noms des produits\n` +
                    `• 💰 Prix (si disponibles)\n` +
                    `• 📝 Descriptions\n` +
                    `• 🖼️ Images\n` +
                    `• 🏷️ Catégories\n\n` +
                    
                    `✅ **Sites compatibles :**\n` +
                    `• Shopify, WooCommerce, PrestaShop\n` +
                    `• Sites e-commerce standards\n` +
                    `• Catalogues en ligne\n` +
                    `• Pages produits individuelles\n\n` +
                    
                    `💡 **Exemple :**\n` +
                    `\`.serena-analyze https://monshop.com/catalogue\`\n\n` +
                    `⚡ Une fois analysés, vos produits seront disponibles pour que Serena puisse les promouvoir !`;

                return await sock.sendMessage(userJid, { text: helpMessage });
            }

            const url = args[0];

            // Validation de l'URL
            if (!isValidUrl(url)) {
                return await sock.sendMessage(userJid, {
                    text: `❌ **URL invalide**\n\n` +
                          `L'URL fournie n'est pas valide. Assurez-vous qu'elle commence par http:// ou https://\n\n` +
                          `💡 **Exemple correct :** https://monshop.com/catalogue`
                });
            }

            // Message de début d'analyse
            await sock.sendMessage(userJid, {
                text: `🔍 **Analyse en cours...**\n\n` +
                      `🌐 URL: ${url}\n` +
                      `⏳ Serena analyse le contenu et extrait les produits...\n\n` +
                      `📊 Cette opération peut prendre quelques instants selon la taille du catalogue.`
            });

            // Initialiser l'analyseur de produits
            const analyzer = new ProductAnalyzer(companion.companion_name);
            
            try {
                // Analyser les produits
                const products = await analyzer.analyzeProductLink(url);

                if (products.length === 0) {
                    const noProductsMessage = `😕 **Aucun produit trouvé**\n\n` +
                        `🔍 Serena n'a pas pu extraire de produits depuis ce lien.\n\n` +
                        `💡 **Raisons possibles :**\n` +
                        `• Le site nécessite une connexion\n` +
                        `• Le contenu est généré dynamiquement\n` +
                        `• La page ne contient pas de produits structurés\n` +
                        `• Le site bloque l'accès automatique\n\n` +
                        `📝 **Solution alternative :**\n` +
                        `Ajoutez vos produits manuellement avec \`.serena-products add\``;

                    return await sock.sendMessage(userJid, { text: noProductsMessage });
                }

                // Préparer le message de succès
                const successMessage = `✅ **Analyse terminée avec succès !** 🎉\n\n` +
                    `📊 **Résultats de l'extraction :**\n` +
                    `🔗 URL: ${url}\n` +
                    `📦 Produits trouvés: ${products.length}\n` +
                    `📅 Analysé le: ${new Date().toLocaleDateString('fr-FR')}\n\n`;

                // Afficher un aperçu des premiers produits
                let productPreview = `🛍️ **Aperçu des produits extraits :**\n\n`;
                const previewCount = Math.min(5, products.length);
                
                for (let i = 0; i < previewCount; i++) {
                    const product = products[i];
                    productPreview += `${i + 1}. **${product.name}**\n`;
                    
                    if (product.price) {
                        productPreview += `   💰 ${product.price}\n`;
                    }
                    
                    if (product.category) {
                        productPreview += `   🏷️ ${product.category}\n`;
                    }
                    
                    productPreview += `\n`;
                }

                if (products.length > 5) {
                    productPreview += `... et ${products.length - 5} autres produits\n\n`;
                }

                const finalMessage = successMessage + productPreview +
                    `🤖 **Serena est prête !**\n` +
                    `Votre assistante peut maintenant promouvoir et recommander ces produits à vos clients automatiquement.\n\n` +
                    `📋 **Prochaines étapes :**\n` +
                    `• \`.serena-products list\` - Voir tous vos produits\n` +
                    `• \`.serena-config\` - Personnaliser les réponses\n` +
                    `• \`.serena-status\` - Voir les statistiques\n\n` +
                    `💡 Astuce: Serena mentionnera automatiquement vos produits quand les clients posent des questions pertinentes !`;

                await sock.sendMessage(userJid, { text: finalMessage });

                console.log(`✅ [SERENA] Analyse réussie pour ${companion.companion_name}: ${products.length} produits extraits de ${url}`);

            } catch (analysisError) {
                console.error('❌ Erreur lors de l\'analyse:', analysisError);
                
                const errorMessage = `❌ **Erreur lors de l'analyse**\n\n` +
                    `😞 Serena n'a pas pu analyser ce lien.\n\n` +
                    `🔧 **Problème technique :**\n` +
                    `${analysisError.message}\n\n` +
                    `💡 **Solutions possibles :**\n` +
                    `• Vérifiez que le lien est accessible\n` +
                    `• Réessayez dans quelques minutes\n` +
                    `• Utilisez un lien direct vers une page produit\n` +
                    `• Ajoutez vos produits manuellement avec \`.serena-products add\`\n\n` +
                    `🆘 Si le problème persiste, contactez le support.`;

                await sock.sendMessage(userJid, { text: errorMessage });
            }

        } catch (error) {
            console.error('❌ Erreur dans serena-analyze:', error);
            await sock.sendMessage(userJid, {
                text: '❌ **Erreur système**\n\n' +
                      'Une erreur technique s\'est produite lors de l\'analyse.\n' +
                      'Veuillez réessayer dans quelques instants.'
            });
        }
    }
};