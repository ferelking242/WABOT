/**
 * Advanced Rate Limiting System for wabot
 * Supports per-user, per-command, and global rate limits with sliding windows
 * Now with multilingual support and optimized limits
 */

// Import i18n system for multilingual messages
const { i18n } = require('./i18n');
// Import owner check function
const isOwnerOrSudo = require('./isOwner');

class RateLimiter {
    constructor() {
        // Rate limit configurations
        this.config = {
            // Global limits (all users combined)
            global: {
                maxRequests: 1000,     // Max 1000 requests per minute globally
                windowMs: 60 * 1000    // 1 minute window
            },
            
            // Per-user limits
            user: {
                maxRequests: 50,       // Max 50 requests per minute per user (increased from 15)
                windowMs: 60 * 1000,   // 1 minute window
                burstLimit: 15,        // Allow 15 rapid requests in 10 seconds (increased from 5)
                concurrentLimit: 3     // Max 3 commands in parallel per user
            },
            
            // Per-command specific limits (optimized and intelligent)
            commands: {
                // Heavy resource commands - more restrictive
                'companion': { maxRequests: 2, windowMs: 120 * 1000 }, // 2 per 2 minutes
                'imagine': { maxRequests: 3, windowMs: 90 * 1000 },    // Image generation expensive
                'video': { maxRequests: 3, windowMs: 90 * 1000 },     // Heavy processing
                
                // Moderate resource commands
                'play': { maxRequests: 8, windowMs: 60 * 1000 },      // YouTube API
                'gpt': { maxRequests: 10, windowMs: 60 * 1000 },       // AI API limits
                'gemini': { maxRequests: 10, windowMs: 60 * 1000 },    // AI API limits
                'song': { maxRequests: 6, windowMs: 60 * 1000 },       // Download commands
                'tts': { maxRequests: 8, windowMs: 60 * 1000 },        // Text-to-speech
                
                // Light commands - less restrictive (NO LIMITS for basic commands)
                'sticker': { maxRequests: 20, windowMs: 60 * 1000 },   // Medium processing
                'translate': { maxRequests: 25, windowMs: 60 * 1000 },  // Translation API
                'weather': { maxRequests: 15, windowMs: 60 * 1000 }    // Weather API
                // Note: help, ping, alive, menu commands have NO limits (not in this list)
            },
            
            // VIP users (admins/owners) - higher limits
            vip: {
                maxRequests: 50,       // 50 per minute for VIP
                windowMs: 60 * 1000
            }
        };
        
        // Storage for rate limit data
        this.globalStore = new Map();      // Global request tracking
        this.userStore = new Map();        // Per-user request tracking
        this.commandStore = new Map();     // Per-command request tracking
        this.burstStore = new Map();       // Burst detection
        this.vipUsers = new Set();         // VIP user cache
        
        // Command categorization for intelligent limiting
        this.commandCategories = {
            'heavy': ['companion', 'imagine', 'video', 'download'],
            'moderate': ['play', 'gpt', 'gemini', 'song', 'tts', 'instagram', 'tiktok', 'facebook'],
            'light': ['sticker', 'translate', 'weather', 'joke', 'fact', 'quote', 'meme'],
            'unlimited': ['help', 'menu', 'ping', 'alive', 'owner', 'jid', 'lang'], // No rate limits at all
            'admin': ['ban', 'kick', 'mute', 'warn', 'promote', 'demote']
        };
        
        // Concurrent request tracking
        this.concurrentRequests = new Map();
        
        // Cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Clean every 5 minutes
        
        // Rate limiting state
        this.isEnabled = true; // Rate limiting enabled by default
    }

    /**
     * Get translated message for rate limiting
     * @param {string} userId - User ID for language preference (null for default)
     * @param {string} key - Translation key
     * @param {object} variables - Variables to replace in the message
     * @returns {string} - Translated message
     */
    getTranslatedMessage(userId, key, variables = {}) {
        try {
            // Use proper fallback to default language if userId is null
            if (userId) {
                return i18n.t(userId, key, variables);
            } else {
                // Use French as default for rate limiting messages
                const frLocale = i18n.locales.get('fr');
                if (frLocale) {
                    const text = i18n.getNestedValue(frLocale, key);
                    return text ? i18n.replaceVariables(text, variables) : key;
                }
                return key;
            }
        } catch (error) {
            console.error('Error getting translated message:', error);
            // Fallback to English key as last resort
            return key.split('.').pop() + ' - please try again later';
        }
    }

    /**
     * Add VIP user (admin/owner)
     * @param {string} userId - User ID to add as VIP
     */
    addVipUser(userId) {
        this.vipUsers.add(userId);
    }

    /**
     * Remove VIP user
     * @param {string} userId - User ID to remove from VIP
     */
    removeVipUser(userId) {
        this.vipUsers.delete(userId);
    }

    /**
     * Enable rate limiting system
     */
    enable() {
        this.isEnabled = true;
        console.log('✅ Rate limiting system enabled');
    }

    /**
     * Disable rate limiting system  
     */
    disable() {
        this.isEnabled = false;
        console.log('⚠️ Rate limiting system disabled');
    }

    /**
     * Check if rate limiting is enabled
     */
    isRateLimitingEnabled() {
        return this.isEnabled;
    }

    /**
     * Check if request is allowed (main function)
     * @param {string} userId - User ID making the request
     * @param {string} command - Command being executed
     * @param {boolean} isVip - Whether user is VIP (admin/owner)
     * @returns {object} - { allowed: boolean, reason?: string, retryAfter?: number }
     */
    async checkLimit(userId, command = 'general', isVip = false) {
        const now = Date.now();
        
        try {
            // First check: If rate limiting is disabled, allow all requests
            if (!this.isEnabled) {
                this.recordRequest(userId, command, now);
                return {
                    allowed: true,
                    disabled: true, // Flag to indicate rate limiting is disabled
                    remaining: { user: 'disabled', command: 'disabled' }
                };
            }
            
            // Check if user is owner - owners have NO rate limits
            const isOwner = await isOwnerOrSudo(userId);
            if (isOwner) {
                // Record the request for statistics but allow unlimited access
                this.recordRequest(userId, command, now);
                return { 
                    allowed: true,
                    unlimited: true, // Flag to indicate owner privileges
                    remaining: { user: '∞', command: '∞', isOwner: true }
                };
            }
            
            // Check if command is in unlimited category (help, ping, alive, etc.)
            if (this.commandCategories.unlimited.includes(command)) {
                this.recordRequest(userId, command, now);
                return {
                    allowed: true,
                    unlimited: true,
                    remaining: { user: 'unlimited', command: 'unlimited' }
                };
            }
            
            // Add VIP to cache if not already there (owners are automatically VIP)
            if (isVip || isOwner) {
                this.addVipUser(userId);
            }
            
            // 1. Check concurrent request limit first (NEW)
            const concurrentCheck = this.checkConcurrentLimit(userId);
            if (!concurrentCheck.allowed) {
                return concurrentCheck;
            }
            
            // 2. Check global limits
            const globalCheck = this.checkGlobalLimit(now, userId);
            if (!globalCheck.allowed) {
                return globalCheck;
            }
            
            // 3. Check user-specific limits (VIP users get higher limits)
            const userCheck = this.checkUserLimit(userId, now, this.vipUsers.has(userId));
            if (!userCheck.allowed) {
                return userCheck;
            }
            
            // 4. Check command-specific limits
            const commandCheck = this.checkCommandLimit(userId, command, now);
            if (!commandCheck.allowed) {
                return commandCheck;
            }
            
            // 5. Check burst protection (only for non-light commands)
            if (!this.commandCategories.light.includes(command)) {
                const burstCheck = this.checkBurstLimit(userId, now);
                if (!burstCheck.allowed) {
                    return burstCheck;
                }
            }
            
            // All checks passed - record the request and track concurrent
            this.recordRequest(userId, command, now);
            this.trackConcurrentRequest(userId, command);
            
            return { 
                allowed: true,
                remaining: this.getRemainingRequests(userId, command, now)
            };
            
        } catch (error) {
            console.error('Rate limiter error:', error);
            // On error, allow request but log
            return { allowed: true, error: error.message };
        }
    }

    /**
     * Check global rate limits
     */
    checkGlobalLimit(now, userId = null) {
        const windowStart = now - this.config.global.windowMs;
        const globalKey = 'global';
        
        if (!this.globalStore.has(globalKey)) {
            this.globalStore.set(globalKey, []);
        }
        
        const requests = this.globalStore.get(globalKey);
        
        // Clean old requests outside window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.globalStore.set(globalKey, validRequests);
        
        if (validRequests.length >= this.config.global.maxRequests) {
            const oldestRequest = Math.min(...validRequests);
            const retryAfter = Math.ceil((oldestRequest + this.config.global.windowMs - now) / 1000);
            
            return {
                allowed: false,
                reason: this.getTranslatedMessage(userId, 'rate_limiting.global_limit_exceeded', { retryAfter }),
                retryAfter
            };
        }
        
        return { allowed: true };
    }

    /**
     * Check per-user rate limits
     */
    checkUserLimit(userId, now, isVip = false) {
        const config = isVip ? this.config.vip : this.config.user;
        const windowStart = now - config.windowMs;
        
        if (!this.userStore.has(userId)) {
            this.userStore.set(userId, []);
        }
        
        const requests = this.userStore.get(userId);
        
        // Clean old requests outside window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.userStore.set(userId, validRequests);
        
        if (validRequests.length >= config.maxRequests) {
            // FIXED: Calculate retryAfter more intelligently
            // Instead of using oldest request, use a shorter, more reasonable delay
            const retryAfter = Math.min(60, Math.ceil(config.windowMs / 1000 / 4)); // Max 60s, usually 15s
            
            const statusEmoji = isVip ? '👑' : '⚡';
            const userTypeKey = isVip ? 'rate_limiting.user_type_vip' : 'rate_limiting.user_type_normal';
            const userType = this.getTranslatedMessage(userId, userTypeKey);
            
            return {
                allowed: false,
                reason: this.getTranslatedMessage(userId, 'rate_limiting.user_limit_exceeded', { 
                    statusEmoji, 
                    userType, 
                    retryAfter 
                }),
                retryAfter
            };
        }
        
        return { allowed: true };
    }

    /**
     * Check command-specific rate limits
     */
    checkCommandLimit(userId, command, now) {
        if (!this.config.commands[command]) {
            return { allowed: true }; // No specific limit for this command
        }
        
        const config = this.config.commands[command];
        const windowStart = now - config.windowMs;
        const key = `${userId}_${command}`;
        
        if (!this.commandStore.has(key)) {
            this.commandStore.set(key, []);
        }
        
        const requests = this.commandStore.get(key);
        
        // Clean old requests outside window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.commandStore.set(key, validRequests);
        
        if (validRequests.length >= config.maxRequests) {
            // FIXED: More reasonable retry time for command limits
            const retryAfter = Math.min(120, Math.ceil(config.windowMs / 1000 / 2)); // Max 2 minutes
            
            return {
                allowed: false,
                reason: this.getTranslatedMessage(userId, 'rate_limiting.command_limit_exceeded', { 
                    command, 
                    retryAfter,
                    emoji: this.getCommandEmoji(command)
                }),
                retryAfter
            };
        }
        
        return { allowed: true };
    }

    /**
     * Check burst protection (rapid requests in short time)
     */
    checkBurstLimit(userId, now) {
        const burstWindow = 10 * 1000; // 10 seconds
        const windowStart = now - burstWindow;
        
        if (!this.burstStore.has(userId)) {
            this.burstStore.set(userId, []);
        }
        
        const requests = this.burstStore.get(userId);
        
        // Clean old requests outside burst window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.burstStore.set(userId, validRequests);
        
        if (validRequests.length >= this.config.user.burstLimit) {
            return {
                allowed: false,
                reason: this.getTranslatedMessage(userId, 'rate_limiting.burst_limit_exceeded', { retryAfter: 10 }),
                retryAfter: 10
            };
        }
        
        return { allowed: true };
    }

    /**
     * Check concurrent request limit (NEW)
     */
    checkConcurrentLimit(userId) {
        const currentConcurrent = this.concurrentRequests.get(userId) || 0;
        
        if (currentConcurrent >= this.config.user.concurrentLimit) {
            return {
                allowed: false,
                reason: this.getTranslatedMessage(userId, 'rate_limiting.concurrent_limit_exceeded', {
                    limit: this.config.user.concurrentLimit,
                    current: currentConcurrent
                }),
                retryAfter: 5 // Short retry for concurrent limit
            };
        }
        
        return { allowed: true };
    }

    /**
     * Track concurrent request (NEW)
     */
    trackConcurrentRequest(userId, command) {
        const current = this.concurrentRequests.get(userId) || 0;
        this.concurrentRequests.set(userId, current + 1);
        
        // BACKUP: Auto-cleanup concurrent tracking after command completion (estimated time)
        // This is a fallback in case releaseConcurrentRequest is not called
        const backupCleanup = () => {
            const current = this.concurrentRequests.get(userId) || 0;
            if (current > 0) {
                this.concurrentRequests.set(userId, current - 1);
                console.log(`⚠️ [RATE_LIMITER] Backup cleanup for user ${userId}, command ${command}`);
            }
        };
        
        // Different backup cleanup times based on command type
        let backupTime = 30000; // Default 30 seconds backup
        if (this.commandCategories.heavy.includes(command)) {
            backupTime = 120000; // 2 minutes for heavy commands
        } else if (this.commandCategories.moderate.includes(command)) {
            backupTime = 60000; // 1 minute for moderate commands
        }
        
        setTimeout(backupCleanup, backupTime);
    }

    /**
     * Release concurrent request (NEW) - MUST be called when command completes
     */
    releaseConcurrentRequest(userId, command = '') {
        const current = this.concurrentRequests.get(userId) || 0;
        if (current > 0) {
            this.concurrentRequests.set(userId, current - 1);
            // console.log(`✅ [RATE_LIMITER] Released concurrent for user ${userId}, remaining: ${current - 1}`);
        } else {
            console.warn(`⚠️ [RATE_LIMITER] Attempted to release concurrent for user ${userId} but counter was already 0`);
        }
    }

    /**
     * Record a successful request
     */
    recordRequest(userId, command, now) {
        // Record global request
        if (!this.globalStore.has('global')) {
            this.globalStore.set('global', []);
        }
        this.globalStore.get('global').push(now);
        
        // Record user request
        if (!this.userStore.has(userId)) {
            this.userStore.set(userId, []);
        }
        this.userStore.get(userId).push(now);
        
        // Record command request if it has specific limits
        if (this.config.commands[command]) {
            const key = `${userId}_${command}`;
            if (!this.commandStore.has(key)) {
                this.commandStore.set(key, []);
            }
            this.commandStore.get(key).push(now);
        }
        
        // Record burst tracking (only if not unlimited command)
        if (!this.commandCategories.unlimited.includes(command)) {
            if (!this.burstStore.has(userId)) {
                this.burstStore.set(userId, []);
            }
            this.burstStore.get(userId).push(now);
        }
    }

    /**
     * Get remaining requests for user
     */
    getRemainingRequests(userId, command, now) {
        const isVip = this.vipUsers.has(userId);
        const userConfig = isVip ? this.config.vip : this.config.user;
        const windowStart = now - userConfig.windowMs;
        
        // Get current user requests in window
        const userRequests = this.userStore.get(userId) || [];
        const validUserRequests = userRequests.filter(timestamp => timestamp > windowStart);
        
        const userRemaining = Math.max(0, userConfig.maxRequests - validUserRequests.length);
        
        // Check command-specific remaining if applicable
        let commandRemaining = null;
        if (this.config.commands[command]) {
            const config = this.config.commands[command];
            const commandWindowStart = now - config.windowMs;
            const key = `${userId}_${command}`;
            const commandRequests = this.commandStore.get(key) || [];
            const validCommandRequests = commandRequests.filter(timestamp => timestamp > commandWindowStart);
            commandRemaining = Math.max(0, config.maxRequests - validCommandRequests.length);
        }
        
        return {
            user: userRemaining,
            command: commandRemaining,
            isVip
        };
    }

    /**
     * Get command category based on resource usage
     * @param {string} command - Command name
     * @returns {string} - Command category
     */
    getCommandCategory(command) {
        for (const [category, commands] of Object.entries(this.commandCategories)) {
            if (commands.includes(command)) {
                return category;
            }
        }
        return 'light'; // Default to light category
    }

    /**
     * Get smart retry time based on command category and user type
     * @param {string} command - Command name
     * @param {boolean} isVip - Whether user is VIP
     * @returns {number} - Suggested retry time in seconds
     */
    getSmartRetryTime(command, isVip = false) {
        const category = this.getCommandCategory(command);
        const base = {
            'heavy': 90,
            'moderate': 45,
            'light': 15,
            'admin': 30
        }[category] || 30;
        
        return isVip ? Math.floor(base * 0.6) : base; // VIP users get 40% shorter wait times
    }

    /**
     * Get appropriate emoji for command category
     * @param {string} command - Command name
     * @returns {string} - Emoji representing the command category
     */
    getCommandEmoji(command) {
        const category = this.getCommandCategory(command);
        const emojis = {
            'heavy': '🛡️', // Shield for heavy protection
            'moderate': '⚡', // Lightning for moderate
            'light': '🟢', // Green circle for light
            'admin': '👮‍♂️' // Police officer for admin
        };
        return emojis[category] || '🎯';
    }

    /**
     * Get rate limit status for user
     */
    getStatus(userId) {
        const now = Date.now();
        const isVip = this.vipUsers.has(userId);
        const remaining = this.getRemainingRequests(userId, 'general', now);
        
        const userConfig = isVip ? this.config.vip : this.config.user;
        const windowStart = now - userConfig.windowMs;
        const userRequests = this.userStore.get(userId) || [];
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        
        return {
            userId,
            isVip,
            requests: {
                used: validRequests.length,
                limit: userConfig.maxRequests,
                remaining: remaining.user,
                windowMs: userConfig.windowMs
            },
            nextReset: validRequests.length > 0 ? 
                Math.min(...validRequests) + userConfig.windowMs : 
                now + userConfig.windowMs
        };
    }

    /**
     * Get global statistics
     */
    getGlobalStats() {
        const now = Date.now();
        const windowStart = now - this.config.global.windowMs;
        
        const globalRequests = this.globalStore.get('global') || [];
        const validGlobalRequests = globalRequests.filter(timestamp => timestamp > windowStart);
        
        const totalUsers = this.userStore.size;
        const activeUsers = Array.from(this.userStore.entries())
            .filter(([userId, requests]) => {
                const validRequests = requests.filter(timestamp => timestamp > windowStart);
                return validRequests.length > 0;
            }).length;
        
        return {
            global: {
                requests: validGlobalRequests.length,
                limit: this.config.global.maxRequests,
                remaining: Math.max(0, this.config.global.maxRequests - validGlobalRequests.length)
            },
            users: {
                total: totalUsers,
                active: activeUsers,
                vip: this.vipUsers.size
            },
            memory: {
                globalStore: this.globalStore.size,
                userStore: this.userStore.size,
                commandStore: this.commandStore.size,
                burstStore: this.burstStore.size
            }
        };
    }

    /**
     * Reset limits for a user (admin function)
     */
    resetUserLimits(userId) {
        this.userStore.delete(userId);
        this.burstStore.delete(userId);
        
        // Remove command-specific limits
        for (const key of this.commandStore.keys()) {
            if (key.startsWith(`${userId}_`)) {
                this.commandStore.delete(key);
            }
        }
        
        console.log(`🔄 Rate limits reset for user: ${userId}`);
    }

    /**
     * Cleanup old entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        // Cleanup global store
        const globalRequests = this.globalStore.get('global') || [];
        const validGlobal = globalRequests.filter(timestamp => 
            timestamp > now - this.config.global.windowMs
        );
        this.globalStore.set('global', validGlobal);
        cleaned += globalRequests.length - validGlobal.length;
        
        // Cleanup user store
        for (const [userId, requests] of this.userStore.entries()) {
            const validRequests = requests.filter(timestamp => 
                timestamp > now - this.config.user.windowMs * 2 // Keep longer for stats
            );
            
            if (validRequests.length === 0) {
                this.userStore.delete(userId);
                cleaned++;
            } else {
                this.userStore.set(userId, validRequests);
                cleaned += requests.length - validRequests.length;
            }
        }
        
        // Cleanup command store
        for (const [key, requests] of this.commandStore.entries()) {
            const maxWindow = Math.max(...Object.values(this.config.commands).map(c => c.windowMs));
            const validRequests = requests.filter(timestamp => 
                timestamp > now - maxWindow * 2
            );
            
            if (validRequests.length === 0) {
                this.commandStore.delete(key);
                cleaned++;
            } else {
                this.commandStore.set(key, validRequests);
                cleaned += requests.length - validRequests.length;
            }
        }
        
        // Cleanup burst store
        for (const [userId, requests] of this.burstStore.entries()) {
            const validRequests = requests.filter(timestamp => 
                timestamp > now - 60 * 1000 // Keep 1 minute of burst data
            );
            
            if (validRequests.length === 0) {
                this.burstStore.delete(userId);
                cleaned++;
            } else {
                this.burstStore.set(userId, validRequests);
                cleaned += requests.length - validRequests.length;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Rate limiter cleaned ${cleaned} old entries`);
        }
    }

    /**
     * Destroy the rate limiter
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.globalStore.clear();
        this.userStore.clear();
        this.commandStore.clear();
        this.burstStore.clear();
        this.vipUsers.clear();
        this.concurrentRequests.clear(); // Clean new concurrent tracking
        console.log('🗑️ Rate limiter destroyed');
    }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

module.exports = {
    rateLimiter,
    checkLimit: (userId, command, isVip) => rateLimiter.checkLimit(userId, command, isVip),
    getStatus: (userId) => rateLimiter.getStatus(userId),
    getGlobalStats: () => rateLimiter.getGlobalStats(),
    resetUserLimits: (userId) => rateLimiter.resetUserLimits(userId),
    addVipUser: (userId) => rateLimiter.addVipUser(userId),
    removeVipUser: (userId) => rateLimiter.removeVipUser(userId),
    releaseConcurrentRequest: (userId, command) => rateLimiter.releaseConcurrentRequest(userId, command)
};