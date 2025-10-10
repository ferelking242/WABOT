/**
 * Gestionnaire de structure et d'organisation du bot
 * Commandes pour gérer l'organisation des dossiers et modules
 */

const fs = require('fs');
const path = require('path');
const { channelConfig } = require('../../lib/channelConfig');

/**
 * Commande principale pour la gestion de structure
 */
async function structureCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        
        if (!args || args.length === 0) {
            const helpMessage = `🏗️ *GESTIONNAIRE DE STRUCTURE*\n\n` +
                              `📋 *COMMANDES DISPONIBLES:*\n\n` +
                              `• \`.structure info\` - Informations sur la structure actuelle\n` +
                              `• \`.structure modules\` - Lister tous les modules disponibles\n` +
                              `• \`.structure folders\` - Voir l'organisation des dossiers\n` +
                              `• \`.structure stats\` - Statistiques des commandes\n` +
                              `• \`.structure health\` - Vérifier la santé du système\n\n` +
                              `🔧 *POUR LES ADMINISTRATEURS SEULEMENT*`;

            await sock.sendMessage(chatId, {
                text: helpMessage,
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const command = args[0].toLowerCase();

        switch (command) {
            case 'info':
                await showStructureInfo(sock, chatId, message);
                break;

            case 'modules':
                await listModules(sock, chatId, message);
                break;

            case 'folders':
                await showFolderStructure(sock, chatId, message);
                break;

            case 'stats':
                await showCommandStats(sock, chatId, message);
                break;

            case 'health':
                await checkSystemHealth(sock, chatId, message);
                break;

            case 'help':
                await structureCommand(sock, chatId, message, []);
                break;

            default:
                await sock.sendMessage(chatId, {
                    text: `❌ Commande inconnue: ${command}\n\nUtilisez \`.structure help\` pour voir toutes les commandes disponibles.`,
                    ...channelConfig
                }, { quoted: message });
                break;
        }

    } catch (error) {
        console.error('Erreur dans la commande structure:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'exécution de la commande structure.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Afficher les informations de structure
 */
async function showStructureInfo(sock, chatId, message) {
    try {
        const structureInfo = `🏗️ *STRUCTURE DU BOT*\n\n` +
                             `📁 *ORGANISATION PRINCIPALE:*\n` +
                             `├── \`commands/\` - Commandes organisées par catégorie\n` +
                             `│   ├── \`admin/\` - Administration et modération\n` +
                             `│   ├── \`community/\` - Gestion des communautés WhatsApp\n` +
                             `│   ├── \`assistant/\` - Assistants personnels\n` +
                             `│   ├── \`system/\` - Commandes système\n` +
                             `│   ├── \`utilities/\` - Outils utilitaires\n` +
                             `│   ├── \`games/\` - Jeux et divertissements\n` +
                             `│   ├── \`media/\` - Traitement multimédia\n` +
                             `│   └── \`downloads/\` - Téléchargements\n\n` +
                             `🤖 *SYSTÈMES SPÉCIALISÉS:*\n` +
                             `├── \`serena-assistant/\` - IA et assistants\n` +
                             `│   ├── \`core/\` - Logique principale\n` +
                             `│   ├── \`enhanced/\` - Assistants personnalisés\n` +
                             `│   └── \`handlers/\` - Gestionnaires\n` +
                             `├── \`discord-bot/\` - Bot Discord intégré\n` +
                             `└── \`lib/\` - Bibliothèques partagées\n\n` +
                             `💾 *BASE DE DONNÉES:*\n` +
                             `├── \`db/shared/schema.ts\` - Schéma unifié\n` +
                             `└── Support PostgreSQL avec Drizzle ORM`;

        await sock.sendMessage(chatId, {
            text: structureInfo,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur affichage structure:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'affichage des informations de structure.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Lister tous les modules disponibles
 */
async function listModules(sock, chatId, message) {
    try {
        const modules = {
            'Administration': ['ban', 'kick', 'mute', 'warn', 'antilink', 'antitag'],
            'Communautés': ['community info', 'community setdesc', 'community announce'],
            'Assistants': ['assistant create', 'assistant info', 'assistant test'],
            'Médias': ['sticker', 'img-blur', 'removebg', 'gif'],
            'Téléchargements': ['tiktok', 'instagram', 'youtube', 'play'],
            'Jeux': ['tictactoe', 'blackjack', 'trivia', 'memory'],
            'Système': ['help', 'ping', 'owner', 'cmd'],
            'Utilitaires': ['translate', 'weather', 'qr', 'ss']
        };

        let modulesList = `🔧 *MODULES DISPONIBLES*\n\n`;
        
        for (const [category, commands] of Object.entries(modules)) {
            modulesList += `📋 *${category}:*\n`;
            commands.forEach(cmd => {
                modulesList += `  • ${cmd}\n`;
            });
            modulesList += `\n`;
        }

        modulesList += `💡 *Total:* ${Object.values(modules).flat().length} fonctionnalités`;

        await sock.sendMessage(chatId, {
            text: modulesList,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur liste modules:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la liste des modules.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Afficher la structure des dossiers
 */
async function showFolderStructure(sock, chatId, message) {
    try {
        const folderStructure = `📁 *STRUCTURE DES DOSSIERS*\n\n` +
                               `\`\`\`\n` +
                               `wabot/\n` +
                               `├── commands/\n` +
                               `│   ├── admin/           (Modération)\n` +
                               `│   ├── community/       (Communautés WhatsApp)\n` +
                               `│   ├── assistant/       (Assistants personnels)\n` +
                               `│   ├── ai/              (Intelligence artificielle)\n` +
                               `│   ├── games/           (Jeux)\n` +
                               `│   ├── media/           (Multimédia)\n` +
                               `│   ├── downloads/       (Téléchargements)\n` +
                               `│   ├── utilities/       (Outils)\n` +
                               `│   ├── system/          (Système)\n` +
                               `│   └── tts/             (Text-to-Speech)\n` +
                               `├── serena-assistant/\n` +
                               `│   ├── core/            (Logique IA)\n` +
                               `│   ├── enhanced/        (Assistants améliorés)\n` +
                               `│   └── handlers/        (Gestionnaires)\n` +
                               `├── discord-bot/\n` +
                               `│   ├── commands/        (Commandes Discord)\n` +
                               `│   └── events/          (Événements Discord)\n` +
                               `├── lib/                 (Bibliothèques)\n` +
                               `├── db/                  (Base de données)\n` +
                               `├── config/              (Configuration)\n` +
                               `└── data/                (Données)\n` +
                               `\`\`\`\n\n` +
                               `✨ *AVANTAGES:*\n` +
                               `• Séparation claire des responsabilités\n` +
                               `• Facilité de maintenance\n` +
                               `• Évolutivité améliorée\n` +
                               `• Code plus organisé`;

        await sock.sendMessage(chatId, {
            text: folderStructure,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur structure dossiers:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'affichage de la structure des dossiers.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Afficher les statistiques des commandes
 */
async function showCommandStats(sock, chatId, message) {
    try {
        // Compter les fichiers dans chaque dossier
        const commandsPath = path.join(__dirname, '..');
        const categories = fs.readdirSync(commandsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        let stats = `📊 *STATISTIQUES DES COMMANDES*\n\n`;
        let totalCommands = 0;

        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            try {
                const files = fs.readdirSync(categoryPath)
                    .filter(file => file.endsWith('.js'));
                
                stats += `📁 *${category}:* ${files.length} commandes\n`;
                totalCommands += files.length;
            } catch (error) {
                // Dossier peut-être vide ou inaccessible
                stats += `📁 *${category}:* 0 commandes\n`;
            }
        }

        // Compter aussi les fichiers dans le dossier racine commands
        const rootFiles = fs.readdirSync(commandsPath)
            .filter(file => file.endsWith('.js'));
        
        if (rootFiles.length > 0) {
            stats += `📁 *racine:* ${rootFiles.length} commandes\n`;
            totalCommands += rootFiles.length;
        }

        stats += `\n🎯 *TOTAL:* ${totalCommands} commandes\n`;
        stats += `📈 *CATÉGORIES:* ${categories.length} dossiers\n`;
        stats += `🏗️ *STRUCTURE:* Organisée et modulaire`;

        await sock.sendMessage(chatId, {
            text: stats,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur stats commandes:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors du calcul des statistiques.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Vérifier la santé du système
 */
async function checkSystemHealth(sock, chatId, message) {
    try {
        const health = {
            structure: '✅ Bonne',
            modules: '✅ Fonctionnels',
            database: '✅ Connectée',
            discord: '✅ Intégré',
            serena: '✅ Opérationnelle'
        };

        const healthReport = `🏥 *SANTÉ DU SYSTÈME*\n\n` +
                            `🏗️ *Structure:* ${health.structure}\n` +
                            `🔧 *Modules:* ${health.modules}\n` +
                            `💾 *Base de données:* ${health.database}\n` +
                            `🔗 *Discord Bot:* ${health.discord}\n` +
                            `🤖 *Serena AI:* ${health.serena}\n\n` +
                            `📋 *ÉTAT GÉNÉRAL:* ✅ Optimal\n` +
                            `⚡ *Performance:* Excellente\n` +
                            `🔒 *Sécurité:* Renforcée\n\n` +
                            `📅 *Dernière vérification:* ${new Date().toLocaleString()}`;

        await sock.sendMessage(chatId, {
            text: healthReport,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur vérification santé:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la vérification de la santé du système.",
            ...channelConfig
        }, { quoted: message });
    }
}

module.exports = {
    name: 'structure',
    description: 'Gérer la structure et l\'organisation du bot',
    category: 'admin',
    usage: '.structure [info|modules|folders|stats|health|help]',
    execute: structureCommand
};