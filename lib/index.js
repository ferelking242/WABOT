/**
 * wabot - Database Interface (Migrated to Supabase)
 * Nouvelle version utilisant PostgreSQL au lieu des fichiers JSON
 * Migration: septembre 2025
 */

const { db } = require('./database');

// ===== ANTILINK FUNCTIONS =====

async function setAntilink(groupId, type, action) {
    try {
        const enabled = type === 'on';
        const config = { action: action || 'delete' };
        return await db.setGroupSetting(groupId, 'antilink', enabled, config);
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const setting = await db.getGroupSetting(groupId, 'antilink');
        return type === 'on' && setting.enabled ? setting : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId, type) {
    try {
        return await db.setGroupSetting(groupId, 'antilink', false, {});
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

// ===== ANTITAG FUNCTIONS =====

async function setAntitag(groupId, type, action) {
    try {
        const enabled = type === 'on';
        const config = { action: action || 'delete' };
        return await db.setGroupSetting(groupId, 'antitag', enabled, config);
    } catch (error) {
        console.error('Error setting antitag:', error);
        return false;
    }
}

async function getAntitag(groupId, type) {
    try {
        const setting = await db.getGroupSetting(groupId, 'antitag');
        return type === 'on' && setting.enabled ? setting : null;
    } catch (error) {
        console.error('Error getting antitag:', error);
        return null;
    }
}

async function removeAntitag(groupId, type) {
    try {
        return await db.setGroupSetting(groupId, 'antitag', false, {});
    } catch (error) {
        console.error('Error removing antitag:', error);
        return false;
    }
}

// ===== WARNING SYSTEM =====

async function incrementWarningCount(groupId, userId) {
    try {
        return await db.addWarning(groupId, userId, 'Warning added');
    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId) {
    try {
        // Reset warnings by setting count to 0
        await db.upsertUser({ user_id: userId });
        await db.upsertGroup({ group_id: groupId });

        const { error } = await db.supabase
            .from('user_warnings')
            .upsert({
                group_id: groupId,
                user_id: userId,
                warning_count: 0
            }, { 
                onConflict: 'group_id,user_id',
                returning: 'minimal'
            });

        return !error;
    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

async function getWarningCount(groupId, userId) {
    try {
        return await db.getUserWarnings(groupId, userId);
    } catch (error) {
        console.error('Error getting warning count:', error);
        return 0;
    }
}

// ===== SUDO SYSTEM =====

async function isSudo(userId) {
    try {
        const user = await db.getUser(userId);
        return user ? user.is_sudo : false;
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

async function addSudo(userJid) {
    try {
        await db.upsertUser({
            user_id: userJid,
            is_sudo: true
        });
        return true;
    } catch (error) {
        console.error('Error adding sudo:', error);
        return false;
    }
}

async function removeSudo(userJid) {
    try {
        await db.upsertUser({
            user_id: userJid,
            is_sudo: false
        });
        return true;
    } catch (error) {
        console.error('Error removing sudo:', error);
        return false;
    }
}

async function getSudoList() {
    try {
        const { data, error } = await db.supabase
            .from('users')
            .select('user_id')
            .eq('is_sudo', true);

        if (error) throw error;
        return data ? data.map(user => user.user_id) : [];
    } catch (error) {
        console.error('Error getting sudo list:', error);
        return [];
    }
}

// ===== WELCOME SYSTEM =====

async function addWelcome(jid, enabled, message) {
    try {
        const config = {
            message: message || '╔═⚔️ WELCOME ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ 📜 Message:\n║ {description}\n╚═══════════════╝',
            channelId: '120363032683343181@newsletter'
        };
        return await db.setGroupSetting(jid, 'welcome', enabled, config);
    } catch (error) {
        console.error('Error in addWelcome:', error);
        return false;
    }
}

async function delWelcome(jid) {
    try {
        return await db.setGroupSetting(jid, 'welcome', false, {});
    } catch (error) {
        console.error('Error in delWelcome:', error);
        return false;
    }
}

async function isWelcomeOn(jid) {
    try {
        const setting = await db.getGroupSetting(jid, 'welcome');
        return setting.enabled;
    } catch (error) {
        console.error('Error in isWelcomeOn:', error);
        return false;
    }
}

async function getWelcomeMessage(jid) {
    try {
        const setting = await db.getGroupSetting(jid, 'welcome');
        return setting.enabled ? setting.config.message : null;
    } catch (error) {
        console.error('Error getting welcome message:', error);
        return null;
    }
}

// ===== GOODBYE SYSTEM =====

async function addGoodbye(jid, enabled, message) {
    try {
        const config = {
            message: message || '╔═⚔️ GOODBYE ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ ⚰️ We will never miss you!\n╚═══════════════╝',
            channelId: '120363161513685998@newsletter'
        };
        return await db.setGroupSetting(jid, 'goodbye', enabled, config);
    } catch (error) {
        console.error('Error in addGoodbye:', error);
        return false;
    }
}

async function delGoodBye(jid) {
    try {
        return await db.setGroupSetting(jid, 'goodbye', false, {});
    } catch (error) {
        console.error('Error in delGoodBye:', error);
        return false;
    }
}

async function isGoodByeOn(jid) {
    try {
        const setting = await db.getGroupSetting(jid, 'goodbye');
        return setting.enabled;
    } catch (error) {
        console.error('Error in isGoodByeOn:', error);
        return false;
    }
}

async function getGoodbyeMessage(jid) {
    try {
        const setting = await db.getGroupSetting(jid, 'goodbye');
        return setting.enabled ? setting.config.message : null;
    } catch (error) {
        console.error('Error getting goodbye message:', error);
        return null;
    }
}

// ===== ANTIBADWORD SYSTEM =====

async function setAntiBadword(groupId, type, action) {
    try {
        const enabled = type === 'on';
        const config = { action: action || 'delete' };
        return await db.setGroupSetting(groupId, 'antibadword', enabled, config);
    } catch (error) {
        console.error('Error setting antibadword:', error);
        return false;
    }
}

async function getAntiBadword(groupId, type) {
    try {
        const setting = await db.getGroupSetting(groupId, 'antibadword');
        return type === 'on' && setting.enabled ? setting : null;
    } catch (error) {
        console.error('Error getting antibadword:', error);
        return null;
    }
}

async function removeAntiBadword(groupId, type) {
    try {
        return await db.setGroupSetting(groupId, 'antibadword', false, {});
    } catch (error) {
        console.error('Error removing antibadword:', error);
        return false;
    }
}

// ===== CHATBOT SYSTEM =====

async function setChatbot(groupId, enabled) {
    try {
        return await db.setGroupSetting(groupId, 'chatbot', enabled, {});
    } catch (error) {
        console.error('Error setting chatbot:', error);
        return false;
    }
}

async function getChatbot(groupId) {
    try {
        const setting = await db.getGroupSetting(groupId, 'chatbot');
        return setting.enabled ? { enabled: true } : null;
    } catch (error) {
        console.error('Error getting chatbot:', error);
        return null;
    }
}

async function removeChatbot(groupId) {
    try {
        return await db.setGroupSetting(groupId, 'chatbot', false, {});
    } catch (error) {
        console.error('Error removing chatbot:', error);
        return false;
    }
}

// ===== ADDITIONAL UTILITY FUNCTIONS =====

// Fonction pour récupérer toutes les configurations d'un groupe (compatibilité)
async function loadUserGroupData() {
    try {
        // Cette fonction est conservée pour compatibilité mais n'est plus utilisée
        // Le code migré utilise directement les fonctions spécialisées
        console.warn('loadUserGroupData() is deprecated - use specific functions instead');
        return {
            antibadword: {},
            antilink: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            warnings: {},
            sudo: []
        };
    } catch (error) {
        console.error('Error in loadUserGroupData:', error);
        return {
            antibadword: {},
            antilink: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            warnings: {},
            sudo: []
        };
    }
}

// Fonction pour sauvegarder (compatibilité)
async function saveUserGroupData(data) {
    try {
        // Cette fonction est conservée pour compatibilité mais n'est plus utilisée
        console.warn('saveUserGroupData() is deprecated - use specific functions instead');
        return true;
    } catch (error) {
        console.error('Error in saveUserGroupData:', error);
        return false;
    }
}

// Fonction pour vérifier si le bot est public
async function isPublic() {
    try {
        const config = await db.getBotConfig('isPublic');
        return config === true || config === 'true';
    } catch (error) {
        console.error('Error checking if bot is public:', error);
        return true; // Valeur par défaut
    }
}

// Fonction pour définir si le bot est public
async function setPublic(isPublicValue) {
    try {
        return await db.setBotConfig('isPublic', isPublicValue);
    } catch (error) {
        console.error('Error setting public status:', error);
        return false;
    }
}

module.exports = {
    // Antilink
    setAntilink,
    getAntilink,
    removeAntilink,
    
    // Antitag
    setAntitag,
    getAntitag,
    removeAntitag,
    
    // Warning system
    incrementWarningCount,
    resetWarningCount,
    getWarningCount,
    
    // Sudo system
    isSudo,
    addSudo,
    removeSudo,
    getSudoList,
    
    // Welcome system
    addWelcome,
    delWelcome,
    isWelcomeOn,
    getWelcomeMessage,
    
    // Goodbye system
    addGoodbye,
    delGoodBye,
    isGoodByeOn,
    getGoodbyeMessage,
    
    // Antibadword system
    setAntiBadword,
    getAntiBadword,
    removeAntiBadword,
    
    // Chatbot system
    setChatbot,
    getChatbot,
    removeChatbot,
    
    // Compatibility functions (deprecated)
    loadUserGroupData,
    saveUserGroupData,
    
    // Utility functions
    isPublic,
    setPublic,
    
    // Database instance for direct access
    db
};