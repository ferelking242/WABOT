/**
 * Commande Changelog - Affichage des changelogs par version
 */

const versionManager = require('../lib/versionManager');
const settings = require('../config/settings');

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

async function showCurrentChangelog(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: 'Récupération du changelog de la version actuelle...' 
        }, { quoted: message });

        const currentVersion = settings.version;
        const releaseInfo = await versionManager.getReleaseInfo(currentVersion);
        
        const changelog = versionManager.formatChangelog(releaseInfo.body, releaseInfo.version);
        const fullText = changelog + '\n\nDate de publication: ' + formatDate(releaseInfo.publishedAt) + '\nVoir sur GitHub: ' + releaseInfo.htmlUrl;

        await sock.sendMessage(chatId, { 
            text: fullText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Impossible de récupérer le changelog: ' + error.message
        }, { quoted: message });
    }
}

async function showVersionChangelog(sock, chatId, message, version) {
    try {
        await sock.sendMessage(chatId, { 
            text: 'Récupération du changelog pour ' + version + '...'
        }, { quoted: message });

        const releaseInfo = await versionManager.getReleaseInfo(version);
        const changelog = versionManager.formatChangelog(releaseInfo.body, releaseInfo.version);
        
        const fullText = changelog + '\n\nDate de publication: ' + formatDate(releaseInfo.publishedAt) + '\nVoir sur GitHub: ' + releaseInfo.htmlUrl;

        await sock.sendMessage(chatId, { 
            text: fullText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Changelog pour ' + version + ' introuvable: ' + error.message
        }, { quoted: message });
    }
}

async function showChangelogList(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: 'Récupération de l\'historique des versions...'
        }, { quoted: message });

        const releases = await versionManager.getAllReleases();
        const currentVersion = settings.version;

        let listText = 'Historique des Changelogs\n\n';
        
        releases.slice(0, 8).forEach((release, index) => {
            const isCurrent = release.version.replace(/^v/, '') === currentVersion.replace(/^v/, '');
            const status = isCurrent ? ' ⭐' : '';
            const prerelease = release.isPrerelease ? ' 🧪' : '';
            
            listText += (index + 1) + '. ' + release.version + status + prerelease + '\n';
            listText += '   📅 ' + formatDate(release.publishedAt) + '\n';
            
            if (release.name && release.name !== release.version) {
                listText += '   📝 ' + release.name + '\n';
            }

            if (release.body) {
                const firstLine = release.body.split('\n')[0].replace(/[#*`]/g, '').trim();
                if (firstLine && firstLine.length > 0) {
                    const preview = firstLine.substring(0, 60);
                    listText += '   💬 ' + preview + (firstLine.length > 60 ? '...' : '') + '\n';
                }
            }
            listText += '\n';
        });

        if (releases.length > 8) {
            listText += '... et ' + (releases.length - 8) + ' autres versions\n\n';
        }

        listText += 'Utilisation:\n';
        listText += '• .changelog <version> - Changelog détaillé\n';
        listText += '• .update info <version> - Infos complètes';

        await sock.sendMessage(chatId, { 
            text: listText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Impossible de récupérer l\'historique: ' + error.message
        }, { quoted: message });
    }
}

async function showLatestChangelog(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { 
            text: 'Récupération du changelog de la dernière version...'
        }, { quoted: message });

        const updateInfo = await versionManager.checkForUpdates();
        const releaseInfo = updateInfo.releaseInfo;
        
        const changelog = versionManager.formatChangelog(releaseInfo.body, releaseInfo.name);
        const isNewer = updateInfo.hasUpdate;
        
        let fullText = changelog + '\n\nDate de publication: ' + formatDate(releaseInfo.publishedAt) + '\nVoir sur GitHub: ' + releaseInfo.htmlUrl;

        if (isNewer) {
            fullText += '\n\nCette version est plus récente que la vôtre !\nVotre version: ' + updateInfo.currentVersion + '\nDernière version: ' + updateInfo.latestVersion + '\n\nUtilisez .update now pour mettre à jour';
        } else {
            fullText += '\n\nVous utilisez déjà cette version !';
        }

        await sock.sendMessage(chatId, { 
            text: fullText 
        }, { quoted: message });

    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: 'Impossible de récupérer le dernier changelog: ' + error.message
        }, { quoted: message });
    }
}

async function showChangelogHelp(sock, chatId, message) {
    const helpText = 'COMMANDE CHANGELOG\n\nUtilisation :\n• .changelog - Changelog de la version actuelle\n• .changelog <version> - Changelog d\'une version spécifique\n• .changelog latest - Changelog de la dernière version\n• .changelog list - Liste de tous les changelogs\n\nExemples :\n• .changelog - Changelog actuel\n• .changelog v3.1.0 - Changelog de la v3.1.0\n• .changelog latest - Dernier changelog\n• .changelog list - Historique complet';

    await sock.sendMessage(chatId, { 
        text: helpText 
    }, { quoted: message });
}

async function changelogCommand(sock, chatId, message, args = []) {
    try {
        const subCommand = args[0] ? args[0].toLowerCase() : undefined;

        switch (subCommand) {
            case undefined:
            case 'current':
                await showCurrentChangelog(sock, chatId, message);
                break;

            case 'latest':
            case 'last':
                await showLatestChangelog(sock, chatId, message);
                break;

            case 'list':
            case 'all':
                await showChangelogList(sock, chatId, message);
                break;

            case 'help':
                await showChangelogHelp(sock, chatId, message);
                break;

            default:
                await showVersionChangelog(sock, chatId, message, subCommand);
                break;
        }

    } catch (error) {
        console.error('Changelog command error:', error);
        await sock.sendMessage(chatId, { 
            text: 'Erreur interne: ' + error.message
        }, { quoted: message });
    }
}

module.exports = changelogCommand;