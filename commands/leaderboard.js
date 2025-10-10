const { channelConfig } = require('../lib/channelConfig');
const fs = require('fs');
const path = require('path');

// File to store leaderboard data
const LEADERBOARD_FILE = path.join(__dirname, '../data/leaderboard.json');

// Initialize leaderboard file
function initLeaderboardFile() {
    const dataDir = path.dirname(LEADERBOARD_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({}));
    }
}

// Get leaderboard data
function getLeaderboardData() {
    try {
        initLeaderboardFile();
        return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    } catch {
        return {};
    }
}

// Save leaderboard data
function saveLeaderboardData(data) {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving leaderboard data:', err);
    }
}

// Record user activity for leaderboard
function recordActivity(chatId, senderId, activityType = 'message', points = 1) {
    try {
        const leaderboardData = getLeaderboardData();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const thisWeek = getWeekKey(now);
        const thisMonth = getMonthKey(now);

        // Initialize group data
        if (!leaderboardData[chatId]) {
            leaderboardData[chatId] = {
                allTime: {},
                daily: {},
                weekly: {},
                monthly: {}
            };
        }

        const groupData = leaderboardData[chatId];

        // Initialize user data for all periods
        ['allTime', 'daily', 'weekly', 'monthly'].forEach(period => {
            if (!groupData[period]) groupData[period] = {};
        });

        // All-time stats
        if (!groupData.allTime[senderId]) {
            groupData.allTime[senderId] = {
                points: 0,
                messages: 0,
                commands: 0,
                reactions: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now()
            };
        }

        // Daily stats
        if (!groupData.daily[today]) groupData.daily[today] = {};
        if (!groupData.daily[today][senderId]) {
            groupData.daily[today][senderId] = {
                points: 0,
                messages: 0,
                commands: 0,
                reactions: 0
            };
        }

        // Weekly stats
        if (!groupData.weekly[thisWeek]) groupData.weekly[thisWeek] = {};
        if (!groupData.weekly[thisWeek][senderId]) {
            groupData.weekly[thisWeek][senderId] = {
                points: 0,
                messages: 0,
                commands: 0,
                reactions: 0
            };
        }

        // Monthly stats
        if (!groupData.monthly[thisMonth]) groupData.monthly[thisMonth] = {};
        if (!groupData.monthly[thisMonth][senderId]) {
            groupData.monthly[thisMonth][senderId] = {
                points: 0,
                messages: 0,
                commands: 0,
                reactions: 0
            };
        }

        // Update stats for all periods
        const periods = [
            { data: groupData.allTime[senderId], key: 'allTime' },
            { data: groupData.daily[today][senderId], key: 'daily' },
            { data: groupData.weekly[thisWeek][senderId], key: 'weekly' },
            { data: groupData.monthly[thisMonth][senderId], key: 'monthly' }
        ];

        periods.forEach(period => {
            period.data.points += points;
            period.data[activityType]++;
            if (period.key === 'allTime') {
                period.data.lastSeen = Date.now();
            }
        });

        // Clean old data (keep last 30 days for daily, 12 weeks for weekly, 12 months for monthly)
        cleanOldLeaderboardData(groupData);

        saveLeaderboardData(leaderboardData);
    } catch (error) {
        console.error('Error recording leaderboard activity:', error);
    }
}

// Clean old leaderboard data
function cleanOldLeaderboardData(groupData) {
    const now = new Date();
    
    // Clean daily data (keep last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    Object.keys(groupData.daily).forEach(dateKey => {
        if (new Date(dateKey) < thirtyDaysAgo) {
            delete groupData.daily[dateKey];
        }
    });

    // Clean weekly data (keep last 12 weeks)
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    Object.keys(groupData.weekly).forEach(weekKey => {
        const [year, week] = weekKey.split('-W');
        const weekDate = getDateFromWeek(parseInt(year), parseInt(week));
        if (weekDate < twelveWeeksAgo) {
            delete groupData.weekly[weekKey];
        }
    });

    // Clean monthly data (keep last 12 months)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    Object.keys(groupData.monthly).forEach(monthKey => {
        const [year, month] = monthKey.split('-');
        const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        if (monthDate < twelveMonthsAgo) {
            delete groupData.monthly[monthKey];
        }
    });
}

// Leaderboard command
async function leaderboardCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        const period = args[0]?.toLowerCase() || 'weekly';
        const validPeriods = ['daily', 'weekly', 'monthly', 'alltime'];
        
        if (!validPeriods.includes(period)) {
            await sock.sendMessage(chatId, {
                text: `🏆 *CLASSEMENT DU GROUPE*\n\n*Périodes disponibles:*\n• \`.leaderboard daily\` - Aujourd'hui\n• \`.leaderboard weekly\` - Cette semaine\n• \`.leaderboard monthly\` - Ce mois\n• \`.leaderboard alltime\` - Tous les temps\n\n💡 Par défaut: hebdomadaire`,
                ...channelConfig
            });
            return;
        }

        const leaderboardData = getLeaderboardData();
        const groupData = leaderboardData[chatId];

        if (!groupData) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUNE DONNÉE DISPONIBLE*\n\nLe classement sera généré dès que les membres commenceront à être actifs !',
                ...channelConfig
            });
            return;
        }

        // Get the appropriate period data
        let periodData;
        let periodTitle;
        const now = new Date();

        switch (period) {
            case 'daily':
                const today = now.toISOString().split('T')[0];
                periodData = groupData.daily[today] || {};
                periodTitle = 'AUJOURD\'HUI';
                break;
            case 'weekly':
                const thisWeek = getWeekKey(now);
                periodData = groupData.weekly[thisWeek] || {};
                periodTitle = 'CETTE SEMAINE';
                break;
            case 'monthly':
                const thisMonth = getMonthKey(now);
                periodData = groupData.monthly[thisMonth] || {};
                periodTitle = 'CE MOIS';
                break;
            case 'alltime':
                periodData = groupData.allTime || {};
                periodTitle = 'TOUS LES TEMPS';
                break;
        }

        // Sort users by points
        const sortedUsers = Object.entries(periodData)
            .sort(([,a], [,b]) => b.points - a.points)
            .slice(0, 10); // Top 10

        if (sortedUsers.length === 0) {
            await sock.sendMessage(chatId, {
                text: `🏆 *CLASSEMENT - ${periodTitle}*\n\n📊 Aucune activité enregistrée pour cette période.\n\n💡 Soyez actifs pour apparaître dans le classement !`,
                ...channelConfig
            });
            return;
        }

        // Get group metadata for user names
        const groupMetadata = await sock.groupMetadata(chatId);
        
        let leaderboardText = `🏆 *CLASSEMENT - ${periodTitle}*\n\n`;
        
        sortedUsers.forEach(([userId, userData], index) => {
            const participant = groupMetadata.participants.find(p => p.id === userId);
            const userName = participant?.notify || userId.split('@')[0];
            
            let medal = '';
            switch (index) {
                case 0: medal = '🥇'; break;
                case 1: medal = '🥈'; break;
                case 2: medal = '🥉'; break;
                default: medal = `${index + 1}.`; break;
            }

            const points = userData.points || 0;
            const messages = userData.messages || 0;
            const commands = userData.commands || 0;
            
            leaderboardText += `${medal} *${userName}*\n`;
            leaderboardText += `   🔢 ${points} points`;
            if (messages > 0) leaderboardText += ` • 💬 ${messages} msg`;
            if (commands > 0) leaderboardText += ` • ⚡ ${commands} cmd`;
            leaderboardText += '\n\n';
        });

        // Add user's position if not in top 10
        const userPosition = Object.keys(periodData)
            .sort((a, b) => periodData[b].points - periodData[a].points)
            .indexOf(senderId) + 1;

        if (userPosition > 10 && userPosition <= Object.keys(periodData).length) {
            const userData = periodData[senderId];
            leaderboardText += `📍 *Votre position: #${userPosition}*\n`;
            leaderboardText += `   🔢 ${userData.points} points • 💬 ${userData.messages} messages\n\n`;
        }

        // Add activity summary
        const totalUsers = Object.keys(periodData).length;
        const totalPoints = Object.values(periodData).reduce((sum, user) => sum + user.points, 0);
        const totalMessages = Object.values(periodData).reduce((sum, user) => sum + (user.messages || 0), 0);

        leaderboardText += `📊 *Résumé:*\n`;
        leaderboardText += `• ${totalUsers} participants actifs\n`;
        leaderboardText += `• ${totalPoints.toLocaleString()} points au total\n`;
        leaderboardText += `• ${totalMessages.toLocaleString()} messages\n\n`;

        leaderboardText += `💡 *Gagnez des points:*\n`;
        leaderboardText += `• 💬 Messages: 1 point\n`;
        leaderboardText += `• ⚡ Commandes: 2 points\n`;
        leaderboardText += `• 😀 Réactions: 1 point`;

        const mentions = sortedUsers.slice(0, 5).map(([userId]) => userId);

        await sock.sendMessage(chatId, {
            text: leaderboardText,
            mentions: mentions,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in leaderboard command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la génération du classement !',
            ...channelConfig
        });
    }
}

// User rank command
async function rankCommand(sock, chatId, senderId, message, args) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Cette commande ne fonctionne que dans les groupes !',
                ...channelConfig
            });
            return;
        }

        const leaderboardData = getLeaderboardData();
        const groupData = leaderboardData[chatId];

        if (!groupData || !groupData.allTime[senderId]) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUNE STATISTIQUE*\n\nVous n\'avez pas encore d\'activité enregistrée.\n\n💡 Envoyez des messages pour commencer à gagner des points !',
                ...channelConfig
            });
            return;
        }

        const userData = groupData.allTime[senderId];
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const thisWeek = getWeekKey(now);
        const thisMonth = getMonthKey(now);

        // Calculate positions for all periods
        const allTimeUsers = Object.keys(groupData.allTime).sort((a, b) => 
            groupData.allTime[b].points - groupData.allTime[a].points
        );
        const allTimePosition = allTimeUsers.indexOf(senderId) + 1;

        const dailyUsers = Object.keys(groupData.daily[today] || {}).sort((a, b) => 
            (groupData.daily[today][b]?.points || 0) - (groupData.daily[today][a]?.points || 0)
        );
        const dailyPosition = dailyUsers.indexOf(senderId) + 1;

        const weeklyUsers = Object.keys(groupData.weekly[thisWeek] || {}).sort((a, b) => 
            (groupData.weekly[thisWeek][b]?.points || 0) - (groupData.weekly[thisWeek][a]?.points || 0)
        );
        const weeklyPosition = weeklyUsers.indexOf(senderId) + 1;

        const monthlyUsers = Object.keys(groupData.monthly[thisMonth] || {}).sort((a, b) => 
            (groupData.monthly[thisMonth][b]?.points || 0) - (groupData.monthly[thisMonth][a]?.points || 0)
        );
        const monthlyPosition = monthlyUsers.indexOf(senderId) + 1;

        // Get current period stats
        const dailyStats = groupData.daily[today]?.[senderId] || { points: 0, messages: 0, commands: 0 };
        const weeklyStats = groupData.weekly[thisWeek]?.[senderId] || { points: 0, messages: 0, commands: 0 };
        const monthlyStats = groupData.monthly[thisMonth]?.[senderId] || { points: 0, messages: 0, commands: 0 };

        const memberSince = new Date(userData.firstSeen).toLocaleDateString();
        const lastActive = new Date(userData.lastSeen).toLocaleDateString();

        let rankText = `👤 *VOTRE PROFIL D'ACTIVITÉ*\n\n`;
        rankText += `📊 *Statistiques générales:*\n`;
        rankText += `• 🔢 Total points: ${userData.points.toLocaleString()}\n`;
        rankText += `• 💬 Messages: ${userData.messages.toLocaleString()}\n`;
        rankText += `• ⚡ Commandes: ${userData.commands.toLocaleString()}\n`;
        rankText += `• 😀 Réactions: ${userData.reactions.toLocaleString()}\n\n`;

        rankText += `🏆 *Classements:*\n`;
        rankText += `• Tous les temps: #${allTimePosition}/${allTimeUsers.length}\n`;
        if (dailyPosition > 0) rankText += `• Aujourd'hui: #${dailyPosition}/${dailyUsers.length}\n`;
        if (weeklyPosition > 0) rankText += `• Cette semaine: #${weeklyPosition}/${weeklyUsers.length}\n`;
        if (monthlyPosition > 0) rankText += `• Ce mois: #${monthlyPosition}/${monthlyUsers.length}\n`;
        rankText += '\n';

        rankText += `📅 *Activité récente:*\n`;
        rankText += `• Aujourd'hui: ${dailyStats.points} pts (${dailyStats.messages} msg)\n`;
        rankText += `• Cette semaine: ${weeklyStats.points} pts (${weeklyStats.messages} msg)\n`;
        rankText += `• Ce mois: ${monthlyStats.points} pts (${monthlyStats.messages} msg)\n\n`;

        rankText += `⏰ *Historique:*\n`;
        rankText += `• Membre depuis: ${memberSince}\n`;
        rankText += `• Dernière activité: ${lastActive}`;

        await sock.sendMessage(chatId, {
            text: rankText,
            mentions: [senderId],
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in rank command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la récupération de votre rang !',
            ...channelConfig
        });
    }
}

// Helper functions
function getWeekKey(date) {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${month.toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateFromWeek(year, week) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    return ISOweekStart;
}

module.exports = {
    leaderboardCommand,
    rankCommand,
    recordActivity
};