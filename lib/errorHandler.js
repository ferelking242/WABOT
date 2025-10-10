/**
 * Advanced Error Handling System for wabot
 * Provides structured error handling, logging, and user-friendly messages
 */

const fs = require('fs');
const path = require('path');
const { i18n } = require('./i18n');

class ErrorHandler {
    constructor() {
        this.logFile = path.join(__dirname, '../logs/errors.log');
        this.errorCounts = new Map();
        this.maxErrorsPerHour = 100;
        this.errorCategories = {
            API_ERROR: 'Erreur API',
            NETWORK_ERROR: 'Erreur réseau',
            VALIDATION_ERROR: 'Erreur de validation',
            PERMISSION_ERROR: 'Erreur de permission',
            MEDIA_ERROR: 'Erreur média',
            DATABASE_ERROR: 'Erreur base de données',
            UNKNOWN_ERROR: 'Erreur inconnue'
        };
        
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Log error to file
     * @param {Error} error - Error object
     * @param {object} context - Additional context
     */
    logError(error, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            message: error.message,
            stack: error.stack,
            category: this.categorizeError(error),
            context,
            userId: context.userId || 'unknown',
            command: context.command || 'unknown'
        };

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logFile, logLine);
        } catch (logError) {
            // Use stderr to avoid logger dependency loop in error handler
            process.stderr.write(`❌ [ERROR_HANDLER] Failed to write error log: ${logError.message}\n`);
        }

        // Track error frequency
        this.trackErrorFrequency(error);
    }

    /**
     * Categorize error type
     * @param {Error} error - Error object
     * @returns {string} Error category
     */
    categorizeError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
            return this.errorCategories.NETWORK_ERROR;
        }
        if (message.includes('api') || message.includes('404') || message.includes('500')) {
            return this.errorCategories.API_ERROR;
        }
        if (message.includes('permission') || message.includes('admin') || message.includes('unauthorized')) {
            return this.errorCategories.PERMISSION_ERROR;
        }
        if (message.includes('media') || message.includes('ffmpeg') || message.includes('image')) {
            return this.errorCategories.MEDIA_ERROR;
        }
        if (message.includes('validation') || message.includes('invalid')) {
            return this.errorCategories.VALIDATION_ERROR;
        }
        if (message.includes('database') || message.includes('sql')) {
            return this.errorCategories.DATABASE_ERROR;
        }
        
        return this.errorCategories.UNKNOWN_ERROR;
    }

    /**
     * Track error frequency to detect spam/issues
     * @param {Error} error - Error object
     */
    trackErrorFrequency(error) {
        const errorKey = error.message.substring(0, 100); // First 100 chars
        const now = Date.now();
        const hour = Math.floor(now / (60 * 60 * 1000));
        const key = `${hour}_${errorKey}`;
        
        const count = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, count + 1);
        
        // Clean old entries
        for (const [k, v] of this.errorCounts) {
            const entryHour = parseInt(k.split('_')[0]);
            if (hour - entryHour > 1) { // Remove entries older than 1 hour
                this.errorCounts.delete(k);
            }
        }
        
        // Alert if error frequency is too high
        if (count + 1 > this.maxErrorsPerHour) {
            process.stderr.write(`⚠️ [ERROR_HANDLER] High error frequency detected: ${errorKey} (${count + 1} times this hour)\n`);
        }
    }

    /**
     * Handle error and send user-friendly message
     * @param {object} sock - WhatsApp socket
     * @param {string} chatId - Chat ID
     * @param {object} message - Original message
     * @param {Error} error - Error object
     * @param {object} context - Additional context
     */
    async handleError(sock, chatId, message, error, context = {}) {
        // Log the error
        this.logError(error, {
            ...context,
            chatId,
            userId: message.key.participant || message.key.remoteJid
        });

        // Get user's language for error message
        const userId = message.key.participant || message.key.remoteJid;
        const category = this.categorizeError(error);
        
        // Get localized error message
        let userMessage = this.getUserFriendlyMessage(userId, category, error);
        
        // Add helpful suggestions based on error type
        const suggestions = this.getErrorSuggestions(category);
        if (suggestions) {
            userMessage += '\n\n' + suggestions;
        }

        try {
            await sock.sendMessage(chatId, { 
                text: userMessage 
            }, { quoted: message });
        } catch (sendError) {
            console.error('Failed to send error message:', sendError.message);
        }
    }

    /**
     * Get user-friendly error message
     * @param {string} userId - User ID
     * @param {string} category - Error category
     * @param {Error} error - Error object
     * @returns {string} User-friendly message
     */
    getUserFriendlyMessage(userId, category, error) {
        const baseMessages = {
            [this.errorCategories.API_ERROR]: i18n.t(userId, 'errors.api_error') || 
                '🔧 Service temporairement indisponible. Réessayez dans quelques minutes.',
            [this.errorCategories.NETWORK_ERROR]: i18n.t(userId, 'errors.network_error') || 
                '🌐 Problème de connexion. Vérifiez votre internet et réessayez.',
            [this.errorCategories.VALIDATION_ERROR]: i18n.t(userId, 'errors.validation_error') || 
                '❌ Format de commande incorrect. Tapez .help pour l\'aide.',
            [this.errorCategories.PERMISSION_ERROR]: i18n.t(userId, 'errors.permission_error') || 
                '🚫 Vous n\'avez pas les permissions nécessaires.',
            [this.errorCategories.MEDIA_ERROR]: i18n.t(userId, 'errors.media_error') || 
                '🎬 Erreur de traitement média. Vérifiez le format du fichier.',
            [this.errorCategories.DATABASE_ERROR]: i18n.t(userId, 'errors.database_error') || 
                '💾 Erreur de sauvegarde. Réessayez plus tard.',
            [this.errorCategories.UNKNOWN_ERROR]: i18n.t(userId, 'errors.unknown_error') || 
                '⚠️ Une erreur inattendue s\'est produite.'
        };

        return baseMessages[category] || baseMessages[this.errorCategories.UNKNOWN_ERROR];
    }

    /**
     * Get helpful suggestions based on error type
     * @param {string} category - Error category
     * @returns {string|null} Suggestions
     */
    getErrorSuggestions(category) {
        const suggestions = {
            [this.errorCategories.API_ERROR]: '💡 Essayez une autre commande ou réessayez plus tard.',
            [this.errorCategories.NETWORK_ERROR]: '💡 Vérifiez votre connexion internet.',
            [this.errorCategories.VALIDATION_ERROR]: '💡 Tapez .cmd <commande> pour voir l\'usage correct.',
            [this.errorCategories.PERMISSION_ERROR]: '💡 Contactez un administrateur si nécessaire.',
            [this.errorCategories.MEDIA_ERROR]: '💡 Utilisez des images/vidéos de moins de 16MB.',
            [this.errorCategories.DATABASE_ERROR]: '💡 Si le problème persiste, contactez le support.'
        };

        return suggestions[category] || null;
    }

    /**
     * Get error statistics
     * @returns {object} Error statistics
     */
    getStats() {
        const now = Date.now();
        const currentHour = Math.floor(now / (60 * 60 * 1000));
        
        let totalErrorsThisHour = 0;
        const categoryCounts = {};
        
        for (const [key, count] of this.errorCounts) {
            const hour = parseInt(String(key).split('_')[0]);
            if (hour === currentHour) {
                totalErrorsThisHour += count;
            }
        }

        return {
            totalErrorsThisHour,
            maxErrorsPerHour: this.maxErrorsPerHour,
            logFile: this.logFile,
            categories: Object.keys(this.errorCategories)
        };
    }

    /**
     * Clean old log files
     * @param {number} maxAgeDays - Maximum age in days
     */
    cleanOldLogs(maxAgeDays = 7) {
        try {
            const logDir = path.dirname(this.logFile);
            const files = fs.readdirSync(logDir);
            const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

            for (const file of files) {
                if (file.endsWith('.log')) {
                    const filePath = path.join(logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime.getTime() < cutoff) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Deleted old log file: ${file}`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to clean old logs:', error.message);
        }
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Clean old logs on startup
errorHandler.cleanOldLogs();

module.exports = {
    errorHandler,
    handleError: (sock, chatId, message, error, context) => 
        errorHandler.handleError(sock, chatId, message, error, context),
    logError: (error, context) => errorHandler.logError(error, context),
    getStats: () => errorHandler.getStats()
};