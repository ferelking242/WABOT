const { i18n, getUserLanguage } = require('../../lib/i18n');
const { runTests, runQuickTest, runCategoryTests, runFullTest } = require('../../../dev/TestRunner');

/**
 * Commande .test - Lance le système d'auto-test des commandes
 * Usage:
 * - .test ou .test full - Test complet de toutes les commandes
 * - .test quick - Test rapide des commandes simples
 * - .test category <nom> - Test d'une catégorie spécifique
 * - .test status - Affiche le statut du système de test
 */
async function testCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    
    // ✅ VÉRIFICATION PERMISSIONS - Seuls le propriétaire principal et sudos peuvent utiliser .test
    const { isOwnerOrSudo, hasExtendedPermissions } = require('../../lib/isOwner');
    const isMainOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!isMainOwnerOrSudo) {
        // Vérifier si c'est un propriétaire de companion (pour refuser l'accès)
        const permissions = await hasExtendedPermissions(senderId, sock, chatId);
        if (permissions.type === 'companion_owner') {
            await sock.sendMessage(chatId, {
                text: '❌ *Accès refusé*\n\nLa commande `.test` est réservée au propriétaire principal et aux sudos.\n\n💡 En tant que propriétaire de companion, vous ne pouvez pas exécuter de tests système.'
            }, { quoted: message });
            return;
        }
        
        // Accès refusé pour tous les autres
        await sock.sendMessage(chatId, {
            text: '❌ *Permissions insuffisantes*\n\nLa commande `.test` est réservée au propriétaire du bot.'
        }, { quoted: message });
        return;
    }
    
    try {
        const userLang = getUserLanguage(senderId);
        // Corriger l'extraction du texte - message.body n'existe pas
        const textContent = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = textContent.split(' ').slice(1) || [];
        const subCommand = args[0]?.toLowerCase() || 'status';

        // Messages multilingues
        const messages = {
            fr: {
                test_starting: '🚀 Démarrage du système d\'auto-test...',
                test_quick_starting: '🏃‍♂️ Test rapide en cours...',
                test_full_starting: '🎯 Test complet en cours (peut prendre plusieurs minutes)...',
                test_category_starting: '📁 Test de catégorie "{category}" en cours...',
                test_completed: '✅ Tests terminés avec succès!\n📊 Taux de réussite: {successRate}%\n⏱️ Durée: {duration}ms\n\n{summary}',
                test_failed: '❌ Tests terminés avec des erreurs:\n{error}',
                test_help: `📋 Commandes de test disponibles:
• .test status - Statut du système
• .test quick - Test rapide (commandes simples)
• .test full - Test complet (toutes les commandes)
• .test category <nom> - Test d'une catégorie`,
                system_status: '🔧 Système d\'auto-test\n✅ Statut: Opérationnel\n📊 Plus de 130+ commandes disponibles\n🔍 Système de découverte automatique actif',
                invalid_category: '❌ Catégorie invalide. Utilisez .test help pour voir les options.',
                system_busy: '⚠️ Système de test déjà en cours, veuillez attendre...'
            },
            en: {
                test_starting: '🚀 Starting auto-test system...',
                test_quick_starting: '🏃‍♂️ Quick test in progress...',
                test_full_starting: '🎯 Full test in progress (may take several minutes)...',
                test_category_starting: '📁 Testing category "{category}"...',
                test_completed: '✅ Tests completed successfully!\n📊 Success rate: {successRate}%\n⏱️ Duration: {duration}ms\n\n{summary}',
                test_failed: '❌ Tests completed with errors:\n{error}',
                test_help: `📋 Available test commands:
• .test status - System status
• .test quick - Quick test (simple commands)
• .test full - Full test (all commands)
• .test category <name> - Test specific category`,
                system_status: '🔧 Auto-test System\n✅ Status: Operational\n📊 130+ commands available\n🔍 Automatic discovery system active',
                invalid_category: '❌ Invalid category. Use .test help for options.',
                system_busy: '⚠️ Test system already running, please wait...'
            }
        };

        const msg = messages[userLang] || messages.en;

        // Vérifier si un test est déjà en cours (simple flag in memory)
        if (testCommand.isRunning) {
            await sock.sendMessage(chatId, {
                text: msg.system_busy
            }, { quoted: message });
            return;
        }

        switch (subCommand) {
            case 'status':
                await sock.sendMessage(chatId, {
                    text: msg.system_status
                }, { quoted: message });
                break;

            case 'help':
                await sock.sendMessage(chatId, {
                    text: msg.test_help
                }, { quoted: message });
                break;

            case 'quick':
                testCommand.isRunning = true;
                await sock.sendMessage(chatId, {
                    text: msg.test_quick_starting
                }, { quoted: message });

                try {
                    const startTime = Date.now();
                    const results = await runQuickTest();
                    const duration = Date.now() - startTime;

                    if (results.success) {
                        const summary = results.summary || 'Test rapide terminé';
                        await sock.sendMessage(chatId, {
                            text: msg.test_completed
                                .replace('{successRate}', results.stats?.successRate || 'N/A')
                                .replace('{duration}', duration)
                                .replace('{summary}', summary)
                        }, { quoted: message });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: msg.test_failed.replace('{error}', results.error || 'Erreur inconnue')
                        }, { quoted: message });
                    }
                } finally {
                    testCommand.isRunning = false;
                }
                break;

            case 'full':
                testCommand.isRunning = true;
                await sock.sendMessage(chatId, {
                    text: msg.test_full_starting
                }, { quoted: message });

                try {
                    const startTime = Date.now();
                    const results = await runFullTest();
                    const duration = Date.now() - startTime;

                    if (results.success) {
                        const summary = results.summary || 'Test complet terminé';
                        await sock.sendMessage(chatId, {
                            text: msg.test_completed
                                .replace('{successRate}', results.stats?.successRate || 'N/A')
                                .replace('{duration}', duration)
                                .replace('{summary}', summary)
                        }, { quoted: message });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: msg.test_failed.replace('{error}', results.error || 'Erreur inconnue')
                        }, { quoted: message });
                    }
                } finally {
                    testCommand.isRunning = false;
                }
                break;

            case 'category':
                const categoryName = args[1];
                if (!categoryName) {
                    await sock.sendMessage(chatId, {
                        text: msg.invalid_category
                    }, { quoted: message });
                    return;
                }

                testCommand.isRunning = true;
                await sock.sendMessage(chatId, {
                    text: msg.test_category_starting.replace('{category}', categoryName)
                }, { quoted: message });

                try {
                    const startTime = Date.now();
                    const results = await runCategoryTests([categoryName]);
                    const duration = Date.now() - startTime;

                    if (results.success) {
                        const summary = results.summary || `Test de catégorie ${categoryName} terminé`;
                        await sock.sendMessage(chatId, {
                            text: msg.test_completed
                                .replace('{successRate}', results.stats?.successRate || 'N/A')
                                .replace('{duration}', duration)
                                .replace('{summary}', summary)
                        }, { quoted: message });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: msg.test_failed.replace('{error}', results.error || 'Erreur inconnue')
                        }, { quoted: message });
                    }
                } finally {
                    testCommand.isRunning = false;
                }
                break;

            default:
                // Par défaut, afficher le statut
                await sock.sendMessage(chatId, {
                    text: msg.system_status + '\n\n' + msg.test_help
                }, { quoted: message });
                break;
        }

    } catch (error) {
        console.error('Error in test command:', error);
        testCommand.isRunning = false;
        
        const errorMsg = i18n.t(senderId, 'messages.command_error', {}, userLang) || 
                        `❌ Erreur lors de l'exécution de la commande de test: ${error.message}`;
        
        await sock.sendMessage(chatId, {
            text: errorMsg
        }, { quoted: message });
    }
}

// Flag pour éviter les tests simultanés
testCommand.isRunning = false;

module.exports = testCommand;