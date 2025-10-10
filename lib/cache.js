/**
 * Advanced Caching System for wabot
 * Improves performance by caching API responses and computed data
 */

const fs = require('fs');
const path = require('path');

class Cache {
    constructor() {
        this.memory = new Map();
        this.config = {
            maxMemoryItems: 1000,
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            persistFile: path.join(__dirname, '../data/cache.json'),
            cleanupInterval: 10 * 60 * 1000, // 10 minutes
        };
        
        this.ttls = new Map();
        this.loadFromDisk();
        this.startCleanup();
    }

    /**
     * Set cache value with TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, value, ttl = this.config.defaultTTL) {
        // Remove oldest items if cache is full
        if (this.memory.size >= this.config.maxMemoryItems) {
            const firstKey = this.memory.keys().next().value;
            this.delete(firstKey);
        }

        this.memory.set(key, value);
        this.ttls.set(key, Date.now() + ttl);
        
        // Auto-save important cache entries
        if (key.startsWith('user_') || key.startsWith('group_')) {
            this.saveToDisk();
        }
    }

    /**
     * Get cache value
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if expired/not found
     */
    get(key) {
        if (!this.memory.has(key)) {
            return null;
        }

        const expiry = this.ttls.get(key);
        if (expiry && Date.now() > expiry) {
            this.delete(key);
            return null;
        }

        return this.memory.get(key);
    }

    /**
     * Check if key exists and is not expired
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete cache entry
     * @param {string} key - Cache key
     */
    delete(key) {
        this.memory.delete(key);
        this.ttls.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.memory.clear();
        this.ttls.clear();
    }

    /**
     * Get cache stats
     * @returns {object} Cache statistics
     */
    stats() {
        const now = Date.now();
        let expired = 0;
        let valid = 0;

        for (const [key, expiry] of this.ttls) {
            if (expiry && now > expiry) {
                expired++;
            } else {
                valid++;
            }
        }

        return {
            total: this.memory.size,
            valid,
            expired,
            memoryUsage: JSON.stringify([...this.memory]).length,
            maxItems: this.config.maxMemoryItems
        };
    }

    /**
     * Cache API response with automatic key generation
     * @param {string} url - API URL
     * @param {function} apiCall - Function that returns Promise
     * @param {number} ttl - Cache TTL
     * @returns {Promise<any>} Cached or fresh API response
     */
    async cacheApiCall(url, apiCall, ttl = this.config.defaultTTL) {
        const key = `api_${this.hashString(url)}`;
        
        let cached = this.get(key);
        if (cached) {
            return cached;
        }

        try {
            const result = await apiCall();
            this.set(key, result, ttl);
            return result;
        } catch (error) {
            // Cache errors for a short time to prevent spam
            this.set(key, { error: error.message }, 30000);
            throw error;
        }
    }

    /**
     * Cache user data
     * @param {string} userId - User ID
     * @param {string} dataType - Type of data (language, preferences, etc.)
     * @param {any} data - Data to cache
     * @param {number} ttl - Cache TTL
     */
    setUserData(userId, dataType, data, ttl = 60 * 60 * 1000) { // 1 hour default
        const key = `user_${userId}_${dataType}`;
        this.set(key, data, ttl);
    }

    /**
     * Get cached user data
     * @param {string} userId - User ID
     * @param {string} dataType - Type of data
     * @returns {any|null} Cached user data
     */
    getUserData(userId, dataType) {
        const key = `user_${userId}_${dataType}`;
        return this.get(key);
    }

    /**
     * Simple string hash function
     * @param {string} str - String to hash
     * @returns {string} Hash
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Load cache from disk
     */
    loadFromDisk() {
        try {
            if (fs.existsSync(this.config.persistFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.persistFile, 'utf8'));
                
                if (data.memory) {
                    this.memory = new Map(data.memory);
                }
                if (data.ttls) {
                    this.ttls = new Map(data.ttls);
                }
                
                // Clean expired entries
                this.cleanup();
                console.log(`💾 Cache loaded: ${this.memory.size} items`);
            }
        } catch (error) {
            console.error('Failed to load cache from disk:', error.message);
        }
    }

    /**
     * Save cache to disk
     */
    saveToDisk() {
        try {
            const dataDir = path.dirname(this.config.persistFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const data = {
                memory: [...this.memory],
                ttls: [...this.ttls],
                saved: Date.now()
            };

            fs.writeFileSync(this.config.persistFile, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save cache to disk:', error.message);
        }
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, expiry] of this.ttls) {
            if (expiry && now > expiry) {
                this.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cache cleaned: ${cleaned} expired entries`);
        }
    }

    /**
     * Start automatic cleanup
     */
    startCleanup() {
        setInterval(() => {
            this.cleanup();
            this.saveToDisk();
        }, this.config.cleanupInterval);
    }
}

// Create singleton instance
const cache = new Cache();

module.exports = {
    cache,
    // Convenience functions
    set: (key, value, ttl) => cache.set(key, value, ttl),
    get: (key) => cache.get(key),
    has: (key) => cache.has(key),
    delete: (key) => cache.delete(key),
    clear: () => cache.clear(),
    stats: () => cache.stats(),
    cacheApiCall: (url, apiCall, ttl) => cache.cacheApiCall(url, apiCall, ttl),
    setUserData: (userId, dataType, data, ttl) => cache.setUserData(userId, dataType, data, ttl),
    getUserData: (userId, dataType) => cache.getUserData(userId, dataType)
};