const { db } = require('./database');

async function isBanned(userId) {
    try {
        return await db.isBanned(userId);
    } catch (error) {
        console.error('Error checking banned status:', error);
        return false;
    }
}

module.exports = { isBanned }; 