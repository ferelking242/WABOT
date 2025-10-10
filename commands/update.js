/**
 * Commande Update Avancée - Système de gestion des versions
 * Supporte: .update check, .update info, .update now, .update rollback
 */

const versionManager = require('../lib/versionManager');
const isOwner = require('../lib/isOwner');
const settings = require('../config/settings');

/**
 * Formate une date pour l'affichage
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Affiche le menu d'aide de la commande update
 */
async function showUpdateHelp(sock, chatId, message) {
    const helpText = `🔄 *COMMANDE UPDATE AVANCÉE*

*Utilisation :*
• \`.update\` - Vérifier les mises à jour
• \`.update check\` - Vérifier s'il y a une MAJ
• \`.update info [version]\` - Infos sur une version
• \`.update now\` - Installer la dernière version
• \`.update rollback <version>\` - Revenir à une version
• \`.update list\` - Lister toutes les versions

*Exemples :*
• \`.update check\` - Vérifier les MAJ
• \`.update info v3.1.0\` - Infos version 3.1.0
• \`.update now\` - Mettre à jour maintenant
• \`.update rollback v2.1.5\` - Rollback

⚠️ *Seuls les propriétaires peuvent utiliser cette commande*`;

    await sock.sendMessage(chatId, { 
        text: helpText 
    }, { quoted: message });
}

/**
 * Affiche les informations de version actuelle
 */
async function showCurrentVersion(sock, chatId, message) {
    try {
        const currentVersion = settings.version;
        let statusText = `🤖 *wabot ${currentVersion}*\n\n`;
        
        // Vérifier s'il y a des mises à jour disponibles
        try {
            const updateInfo = await versionManager.checkForUpdates();
            
            if (updateInfo.hasUpdate) {
                statusText += `🆕 *Nouvelle version disponible !*\n`;
                statusText += `📦 Version actuelle: \`${updateInfo.currentVersion}\`\n`;
                statusText += `🚀 Dernière version: \`${updateInfo.latestVersion}\`\n\n`;
                statusText += `📋 *${updateInfo.releaseInfo.name}*\n`;
                statusText += `📅 Publiée le: ${formatDate(updateInfo.releaseInfo.publishedAt)}\n\n`;
                statusText += `💡 Utilisez \`.update info\` pour voir le changelog\n`;
                statusText += `⚡ Utilisez \`.update now\` pour installer`;
            } else {
                statusText += `✅ *Vous êtes à jour !*\n`;
                statusText += `📦 Version: \`${currentVersion}\`\n`;
                statusText += `🔍 Dernière vérification: maintenant`;
            }
        } catch (error) {
            statusText += `📦 Version actuelle: \`${currentVersion}\`\n`;
            statusText += `⚠️ Impossible de vérifier les MAJ: ${error.message}\n\n`;
            statusText += `💡 Vérifiez votre connexion internet`;
        }

        await sock.sendMessage(chatId, { 
            text: statusText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Erreur: ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Vérifie les mises à jour disponibles
 */
async function checkUpdates(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: '🔍 Vérification des mises à jour...' 
        }, { quoted: message });

        const updateInfo = await versionManager.checkForUpdates();

        let responseText;
        if (updateInfo.hasUpdate) {
            responseText = `🆕 *Mise à jour disponible !*

📦 *Version actuelle:* \`${updateInfo.currentVersion}\`
🚀 *Nouvelle version:* \`${updateInfo.latestVersion}\`

📋 *${updateInfo.releaseInfo.name}*
📅 *Publiée le:* ${formatDate(updateInfo.releaseInfo.publishedAt)}

🔗 [Voir sur GitHub](${updateInfo.releaseInfo.htmlUrl})

💡 *Commandes utiles:*
• \`.update info\` - Voir le changelog détaillé  
• \`.update now\` - Installer la mise à jour`;
        } else {
            responseText = `✅ *Vous êtes déjà à jour !*

📦 *Version actuelle:* \`${updateInfo.currentVersion}\`
🔍 *Dernière version:* \`${updateInfo.latestVersion}\`

🎉 Aucune mise à jour nécessaire pour le moment.`;
        }

        await sock.sendMessage(chatId, { 
            text: responseText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Erreur lors de la vérification: ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Affiche les informations détaillées d'une version
 */
async function showVersionInfo(sock, chatId, message, version) {
    try {
        await sock.sendMessage(chatId, { 
            text: `🔍 Récupération des informations${version ? ` pour ${version}` : ''}...` 
        }, { quoted: message });

        let releaseInfo;
        if (version) {
            releaseInfo = await versionManager.getReleaseInfo(version);
        } else {
            const updateInfo = await versionManager.checkForUpdates();
            releaseInfo = updateInfo.releaseInfo;
        }

        const changelog = versionManager.formatChangelog(releaseInfo.body, releaseInfo.version);
        const infoText = `${changelog}

📅 *Date de publication:* ${formatDate(releaseInfo.publishedAt)}
🔗 [Voir sur GitHub](${releaseInfo.htmlUrl})

💡 *Commandes utiles:*
• \`.update now\` - Installer cette version
• \`.update list\` - Voir toutes les versions`;

        await sock.sendMessage(chatId, { 
            text: infoText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Lance la mise à jour
 */
async function performUpdate(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: '🔄 Démarrage de la mise à jour...' 
        }, { quoted: message });

        // Vérifier s'il y a vraiment une mise à jour
        const updateInfo = await versionManager.checkForUpdates();
        if (!updateInfo.hasUpdate) {
            await sock.sendMessage(chatId, { 
                text: '✅ Vous êtes déjà à jour ! Aucune action nécessaire.' 
            }, { quoted: message });
            return;
        }

        // Créer une sauvegarde avant mise à jour
        const backup = await versionManager.createBackup();
        if (backup) {
            await sock.sendMessage(chatId, { 
                text: `💾 Sauvegarde créée: ${backup.backupBranch}` 
            }, { quoted: message });
        }

        // Effectuer la mise à jour
        await sock.sendMessage(chatId, { 
            text: `🔄 Installation de ${updateInfo.latestVersion}...` 
        }, { quoted: message });

        const result = await versionManager.updateViaGit();

        if (result.alreadyUpToDate) {
            await sock.sendMessage(chatId, { 
                text: `✅ Déjà à jour (${result.version})` 
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { 
                text: `✅ Mise à jour terminée !

🔄 ${result.oldRev} → ${result.newRev}
📦 Version: ${updateInfo.latestVersion}

🔄 Redémarrage en cours...` 
            }, { quoted: message });

            // Redémarrer le bot
            await restartBot(sock, chatId, message);
        }

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Échec de la mise à jour: ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Liste toutes les versions disponibles
 */
async function listVersions(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: '📋 Récupération de la liste des versions...' 
        }, { quoted: message });

        const releases = await versionManager.getAllReleases();
        const currentVersion = settings.version;

        let listText = `📋 *Versions disponibles*\n\n`;
        
        releases.slice(0, 10).forEach((release, index) => {
            const isCurrent = release.version.replace(/^v/, '') === currentVersion.replace(/^v/, '');
            const status = isCurrent ? ' ⭐ *actuelle*' : '';
            const prerelease = release.isPrerelease ? ' 🧪 *beta*' : '';
            
            listText += `${index + 1}. \`${release.version}\`${status}${prerelease}\n`;
            listText += `   📅 ${formatDate(release.publishedAt)}\n`;
            if (release.name && release.name !== release.version) {
                listText += `   📝 ${release.name.substring(0, 50)}${release.name.length > 50 ? '...' : ''}\n`;
            }
            listText += '\n';
        });

        if (releases.length > 10) {
            listText += `\n... et ${releases.length - 10} autres versions\n`;
        }

        listText += `\n💡 *Utilisez:*\n`;
        listText += `• \`.update info <version>\` - Détails d'une version\n`;
        listText += `• \`.update rollback <version>\` - Revenir à une version`;

        await sock.sendMessage(chatId, { 
            text: listText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Impossible de récupérer la liste: ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Effectue un rollback vers une version antérieure
 */
async function performRollback(sock, chatId, message, targetVersion) {
    try {
        if (!targetVersion) {
            await sock.sendMessage(chatId, { 
                text: '❌ Veuillez spécifier une version.\nExemple: `.update rollback v2.1.5`' 
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: `🔄 Rollback vers ${targetVersion}...` 
        }, { quoted: message });

        // Vérifier que la version existe
        try {
            await versionManager.getReleaseInfo(targetVersion);
        } catch (error) {
            await sock.sendMessage(chatId, { 
                text: `❌ Version ${targetVersion} introuvable. Utilisez \`.update list\` pour voir les versions disponibles.` 
            }, { quoted: message });
            return;
        }

        // Effectuer le rollback
        const result = await versionManager.rollbackToVersion(targetVersion);

        await sock.sendMessage(chatId, { 
            text: `✅ ${result.message}

🔄 ${result.previousVersion} → ${result.newVersion}

🔄 Redémarrage en cours...` 
        }, { quoted: message });

        // Redémarrer le bot
        await restartBot(sock, chatId, message);

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Échec du rollback: ${error.message}` 
        }, { quoted: message });
    }
}

/**
 * Redémarre le bot
 */
async function restartBot(sock, chatId, message) {
    try {
        const { exec } = require('child_process');
        
        // Essayer PM2 en premier
        exec('pm2 restart all', (error) => {
            if (error) {
                // Fallback: redémarrage via exit
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            }
        });
    } catch (error) {
        // Fallback final
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
}

/**
 * Commande principale
 */
async function updateCommand(sock, chatId, message, senderId, args = []) {
    try {
        // Vérifier les permissions
        const hasPermission = await isOwner(senderId);
        if (!hasPermission) {
            await sock.sendMessage(chatId, { 
                text: '❌ Seuls les propriétaires peuvent utiliser cette commande.' 
            }, { quoted: message });
            return;
        }

        const subCommand = args[0]?.toLowerCase();
        const parameter = args[1];

        switch (subCommand) {
            case 'help':
            case undefined:
                if (!parameter) {
                    await showCurrentVersion(sock, chatId, message);
                } else {
                    await showUpdateHelp(sock, chatId, message);
                }
                break;

            case 'check':
                await checkUpdates(sock, chatId, message);
                break;

            case 'info':
                await showVersionInfo(sock, chatId, message, parameter);
                break;

            case 'now':
            case 'install':
                await performUpdate(sock, chatId, message);
                break;

            case 'list':
            case 'versions':
                await listVersions(sock, chatId, message);
                break;

            case 'rollback':
                await performRollback(sock, chatId, message, parameter);
                break;

            default:
                await showUpdateHelp(sock, chatId, message);
                break;
        }

    } catch (error) {
        console.error('Update command error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Erreur interne: ${error.message}` 
        }, { quoted: message });
    }
}

module.exports = updateCommand;