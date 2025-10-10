const { channelConfig } = require('../../lib/channelConfig');
const fs = require('fs');
const path = require('path');

// File to store group statistics
const STATS_FILE = path.join(__dirname, '../data/groupstats.json');

// Initialize stats file
function initStatsFile() {
    const dataDir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(STATS_FILE)) {
        fs.writeFileSync(STATS_FILE, JSON.stringify({}));
    }
}

// Get stats data
function getStatsData() {
    try {
        initStatsFile();
        return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

// Save stats data
function saveStatsData(data) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving stats data:', err);
    }
}

// Record message for statistics
function recordMessage(chatId, senderId, messageType = 'text') {
    try {
        const statsData = getStatsData();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const hour = now.getHours();

        // Initialize group data
        if (!statsData[chatId]) {
            statsData[chatId] = {
                totalMessages: 0,
                dailyStats: {},
                hourlyStats: {},
                userStats: {},
                messageTypes: {},
                joinDate: Date.now(),
                lastActivity: Date.now()
            };
        }

        const groupStats = statsData[chatId];

        // Update totals
        groupStats.totalMessages++;
        groupStats.lastActivity = Date.now();

        // Daily stats
        if (!groupStats.dailyStats[today]) {
            groupStats.dailyStats[today] = 0;
        }
        groupStats.dailyStats[today]++;

        // Hourly stats
        if (!groupStats.hourlyStats[hour]) {
            groupStats.hourlyStats[hour] = 0;
        }
        groupStats.hourlyStats[hour]++;

        // User stats
        if (!groupStats.userStats[senderId]) {
            groupStats.userStats[senderId] = {
                messages: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now()
            };
        }
        groupStats.userStats[senderId].messages++;
        groupStats.userStats[senderId].lastSeen = Date.now();

        // Message type stats
        if (!groupStats.messageTypes[messageType]) {
            groupStats.messageTypes[messageType] = 0;
        }
        groupStats.messageTypes[messageType]++;

        saveStatsData(statsData);
    } catch (error) {
        console.error('Error recording message stats:', error);
    }
}

// Group statistics command
async function groupstatsCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        const statsData = getStatsData();
        const groupStats = statsData[chatId];

        if (!groupStats || groupStats.totalMessages === 0) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUNE STATISTIQUE DISPONIBLE*\n\nLes statistiques seront collectées à partir de maintenant.',
                ...channelConfig
            });
            return;
        }

        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const totalMembers = groupMetadata.participants.length;

        // Calculate periods
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const thisWeek = getWeekDays();
        const thisMonth = getMonthDays();

        // Calculate stats for different periods
        const todayMessages = groupStats.dailyStats[today] || 0;
        const yesterdayMessages = groupStats.dailyStats[yesterday] || 0;
        const weekMessages = thisWeek.reduce((sum, day) => sum + (groupStats.dailyStats[day] || 0), 0);
        const monthMessages = thisMonth.reduce((sum, day) => sum + (groupStats.dailyStats[day] || 0), 0);

        // Most active hour
        const hourlyEntries = Object.entries(groupStats.hourlyStats);
        const mostActiveHour = hourlyEntries.length > 0 
            ? hourlyEntries.reduce((max, current) => current[1] > max[1] ? current : max)[0]
            : 'N/A';

        // Most active users (top 5)
        const activeUsers = Object.entries(groupStats.userStats)
            .sort(([,a], [,b]) => b.messages - a.messages)
            .slice(0, 5);

        // Group age
        const groupAge = Math.floor((Date.now() - (groupStats.joinDate || Date.now())) / (24 * 60 * 60 * 1000));
        const lastActivityDays = Math.floor((Date.now() - groupStats.lastActivity) / (24 * 60 * 60 * 1000));

        // Average messages per day
        const avgPerDay = groupAge > 0 ? Math.round(groupStats.totalMessages / groupAge) : groupStats.totalMessages;

        let statsText = `📊 *STATISTIQUES DU GROUPE*\n\n`;
        statsText += `📈 *Vue d'ensemble:*\n`;
        statsText += `• Total messages: ${groupStats.totalMessages.toLocaleString()}\n`;
        statsText += `• Membres actifs: ${Object.keys(groupStats.userStats).length}\n`;
        statsText += `• Total membres: ${totalMembers}\n`;
        statsText += `• Moyenne/jour: ${avgPerDay} messages\n\n`;

        statsText += `📅 *Activité récente:*\n`;
        statsText += `• Aujourd'hui: ${todayMessages} messages\n`;
        statsText += `• Hier: ${yesterdayMessages} messages\n`;
        statsText += `• Cette semaine: ${weekMessages} messages\n`;
        statsText += `• Ce mois: ${monthMessages} messages\n\n`;

        statsText += `🕐 *Heure la plus active:* ${mostActiveHour}h\n\n`;

        if (activeUsers.length > 0) {
            statsText += `🏆 *Top contributeurs:*\n`;
            activeUsers.forEach(([userId, userData], index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
                const username = userId.split('@')[0];
                const percentage = ((userData.messages / groupStats.totalMessages) * 100).toFixed(1);
                statsText += `${emoji} @${username}: ${userData.messages} (${percentage}%)\n`;
            });
            statsText += '\n';
        }

        // Message types
        if (Object.keys(groupStats.messageTypes).length > 0) {
            statsText += `📱 *Types de messages:*\n`;
            Object.entries(groupStats.messageTypes)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([type, count]) => {
                    const percentage = ((count / groupStats.totalMessages) * 100).toFixed(1);
                    const emoji = getMessageTypeEmoji(type);
                    statsText += `${emoji} ${type}: ${count} (${percentage}%)\n`;
                });
            statsText += '\n';
        }

        statsText += `⏰ *Informations:*\n`;
        statsText += `• Suivi depuis: ${groupAge} jours\n`;
        if (lastActivityDays === 0) {
            statsText += `• Dernière activité: Aujourd'hui\n`;
        } else {
            statsText += `• Dernière activité: Il y a ${lastActivityDays} jour(s)\n`;
        }

        const mentions = activeUsers.map(([userId]) => userId);

        await sock.sendMessage(chatId, {
            text: statsText,
            mentions: mentions,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in groupstats command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la récupération des statistiques !',
            ...channelConfig
        });
    }
}

// Get emoji for message type
function getMessageTypeEmoji(type) {
    const emojis = {
        'text': '💬',
        'image': '🖼️',
        'video': '🎥',
        'audio': '🎵',
        'document': '📄',
        'sticker': '😀',
        'location': '📍',
        'contact': '👤',
        'poll': '📊',
        'other': '❓'
    };
    return emojis[type] || '❓';
}

// Get days of current week
function getWeekDays() {
    const now = new Date();
    const days = [];
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date.toISOString().split('T')[0]);
    }
    return days;
}

// Get days of current month
function getMonthDays() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        days.push(date.toISOString().split('T')[0]);
    }
    return days;
}

// Generate activity heatmap
async function activityHeatmapCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        const statsData = getStatsData();
        const groupStats = statsData[chatId];

        if (!groupStats || !groupStats.hourlyStats) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUNE DONNÉE D\'ACTIVITÉ*\n\nLes données seront collectées à partir de maintenant.',
                ...channelConfig
            });
            return;
        }

        // Generate heatmap
        let heatmapText = `🔥 *CARTE DE CHALEUR D'ACTIVITÉ*\n\n`;
        heatmapText += `📅 Activité par heure de la journée\n\n`;

        // Find max messages for scaling
        const maxMessages = Math.max(...Object.values(groupStats.hourlyStats));
        
        for (let hour = 0; hour < 24; hour++) {
            const messages = groupStats.hourlyStats[hour] || 0;
            const intensity = maxMessages > 0 ? Math.floor((messages / maxMessages) * 5) : 0;
            const bar = '█'.repeat(intensity) + '░'.repeat(5 - intensity);
            const timeStr = hour.toString().padStart(2, '0') + ':00';
            
            heatmapText += `${timeStr} ${bar} ${messages}\n`;
        }

        heatmapText += `\n📊 *Légende:*\n`;
        heatmapText += `█████ Très actif\n`;
        heatmapText += `███░░ Actif\n`;
        heatmapText += `█░░░░ Peu actif\n`;
        heatmapText += `░░░░░ Inactif\n\n`;
        heatmapText += `🕐 *Pic d'activité:* ${Object.entries(groupStats.hourlyStats).reduce((max, current) => current[1] > max[1] ? current : max)[0]}h`;

        await sock.sendMessage(chatId, {
            text: heatmapText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in activity heatmap command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la génération de la carte d\'activité !',
            ...channelConfig
        });
    }
}

module.exports = {
    groupstatsCommand,
    activityHeatmapCommand,
    recordMessage
};