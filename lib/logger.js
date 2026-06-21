/**
 * Centralized Logging System for wabot
 * Extends the existing error handling system to provide structured logging
 * with categories, colors, and proper organization
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { errorHandler } = require('./errorHandler');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../data/logs');
        this.systemLogDir = path.join(this.logDir, 'system');
        this.errorLogDir = path.join(this.logDir, 'errors');
        this.commandLogDir = path.join(this.logDir, 'commands');
        
        // Fichiers de log dans les sous-dossiers
        this.logFile = path.join(this.systemLogDir, 'system.log');
        this.errorLogFile = path.join(this.errorLogDir, 'errors.log');
        this.commandLogFile = path.join(this.commandLogDir, 'commands.log');
        this.debugMode = process.env.DEBUG_MODE === 'true' || false;
        
        // Log levels
        this.levels = {
            ERROR: { priority: 0, color: chalk.red, prefix: '❌' },
            WARN: { priority: 1, color: chalk.yellow, prefix: '⚠️' },
            SUCCESS: { priority: 2, color: chalk.green, prefix: '✅' },
            INFO: { priority: 3, color: chalk.blue, prefix: 'ℹ️' },
            SYSTEM: { priority: 4, color: chalk.magenta, prefix: '🤖' },
            DEBUG: { priority: 5, color: chalk.gray, prefix: '🔍' },
            NETWORK: { priority: 3, color: chalk.cyan, prefix: '🌐' },
            DATABASE: { priority: 3, color: chalk.yellow, prefix: '🗄️' },
            MEMORY: { priority: 4, color: chalk.orange || chalk.yellow, prefix: '🧹' },
            CONNECTION: { priority: 2, color: chalk.green, prefix: '🌿' }
        };

        // Categories for better organization
        this.categories = {
            STARTUP: 'Startup',
            CONNECTION: 'Connection',
            DATABASE: 'Database',
            COMMANDS: 'Commands',
            MESSAGES: 'Messages',
            ERRORS: 'Errors',
            SYSTEM: 'System',
            MEMORY: 'Memory',
            NETWORK: 'Network'
        };
        
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directories exist
     */
    ensureLogDirectory() {
        // Créer la structure de répertoires /data/logs/
        [this.logDir, this.systemLogDir, this.errorLogDir, this.commandLogDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Format timestamp
     */
    getTimestamp() {
        return new Date().toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Déterminer le fichier de log selon la catégorie
     */
    getLogFileForCategory(category) {
        switch (category) {
            case 'COMMANDS':
            case 'MESSAGES':
                return this.commandLogFile;
            case 'ERRORS':
                return this.errorLogFile;
            case 'SYSTEM':
            case 'STARTUP':
            case 'CONNECTION':
            case 'DATABASE':
            case 'MEMORY':
            case 'NETWORK':
            default:
                return this.logFile;
        }
    }

    /**
     * Write log to appropriate file based on category
     */
    writeToFile(level, category, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data) : data) : null
        };

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            const targetFile = this.getLogFileForCategory(category);
            fs.appendFileSync(targetFile, logLine);
        } catch (err) {
            // Use process.stderr to avoid infinite loop since we're in the logger
            process.stderr.write(`❌ [LOGGER] Failed to write to log file: ${err.message}\n`);
        }
    }

    /**
     * Core logging method
     */
    log(level, category, message, data = null, consoleOnly = false) {
        if (!this.levels[level]) {
            level = 'INFO';
        }

        const timestamp = this.getTimestamp();
        const levelInfo = this.levels[level];
        const coloredLevel = levelInfo.color(`[${level}]`);
        const coloredCategory = chalk.dim(`[${category}]`);
        const formattedMessage = `${timestamp} ${levelInfo.prefix} ${coloredLevel} ${coloredCategory} ${message}`;

        // Always show ERROR, WARN, SUCCESS, and important system messages
        // Show DEBUG only in debug mode
        if (level !== 'DEBUG' || this.debugMode) {
            console.log(formattedMessage);
            
            // PLUS DE JSON POURRI - JUSTE LES INFOS IMPORTANTES
            if (data && typeof data === 'object' && level !== 'DEBUG') {
                let extraInfo = '';
                if (data.error) extraInfo += ` ERROR: ${data.error}`;
                if (data.phoneNumber) extraInfo += ` TEL: ${data.phoneNumber}`;
                if (data.userId) extraInfo += ` USER: ${data.userId}`;
                if (data.companionName) extraInfo += ` BOT: ${data.companionName}`;
                
                if (extraInfo) console.log(chalk.dim(extraInfo.trim()));
            } else if (data && typeof data === 'string' && data.length < 200) {
                console.log(chalk.dim(data));
            }
        }

        // Write to file unless consoleOnly is true
        if (!consoleOnly) {
            this.writeToFile(level, category, message, data);
        }
    }

    /**
     * Format message en style arbre markdown élégant
     */
    formatTreeMessage(level, category, title, details = []) {
        const levelInfo = this.levels[level] || this.levels['INFO'];
        const timestamp = new Date().toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Style arbre élégant comme demandé par l'utilisateur
        let tree = `🌹⃝━❮ ${chalk.bold.cyan('𝐖𝐚𝐛𝐨𝐭')} ${levelInfo.color(category)} ❯━\n`;
        tree += `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n`;
        tree += `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n`;
        tree += `⊹ ☪︎⋆ ${levelInfo.prefix} ${levelInfo.color(title)} 🌤️\n`;
        tree += `┊ ${chalk.dim('*' + timestamp + '*')}\n`;
        
        if (details && details.length > 0) {
            tree += `✧\n`;
            details.forEach((detail, index) => {
                const isLast = index === details.length - 1;
                const connector = isLast ? '└─' : '├─';
                tree += `${connector} ${detail}\n`;
            });
        }
        
        return tree;
    }

    /**
     * Affichage connexion WhatsApp style arbre
     */
    connectionTree(status, details = []) {
        const category = status === 'connecting' ? 'Connection' : 
                        status === 'open' ? 'Connected' : 
                        status === 'close' ? 'Déconnecté' : 'Status';
        
        const level = status === 'open' ? 'SUCCESS' : 
                     status === 'close' ? 'WARN' : 'INFO';
        
        const title = status === 'connecting' ? 'Connexion WhatsApp en cours...' :
                     status === 'open' ? 'Bot WhatsApp Connecté' :
                     status === 'close' ? 'Connexion WhatsApp fermée' :
                     'État de connexion WhatsApp';
        
        console.log(this.formatTreeMessage(level, category, title, details));
    }

    /**
     * Affichage erreur style arbre  
     */
    errorTree(errorType, errorMessage, details = []) {
        const title = `Erreur ${errorType}`;
        const errorDetails = [errorMessage, ...details];
        console.log(this.formatTreeMessage('ERROR', 'Erreur', title, errorDetails));
    }

    /**
     * Affichage système style arbre
     */
    systemTree(title, details = []) {
        console.log(this.formatTreeMessage('SYSTEM', 'Système', title, details));
    }

    /**
     * Convenience methods for different log levels
     *
     * error() inclut une déduplication : si exactement le même message d'erreur
     * a déjà été loggé dans les DEDUP_WINDOW_MS dernières ms, on le supprime
     * en console (on l'écrit quand même en fichier pour l'audit, mais seulement
     * si c'est la 1ère ou toutes les N occurrences).
     */
    error(message, data = null, category = 'ERRORS') {
        const DEDUP_WINDOW_MS = 30_000; // 30 secondes
        const MAX_CONSOLE_REPEATS = 3;  // Afficher max 3× le même message en console

        if (!this._errorDedup) this._errorDedup = new Map();

        const key = message.substring(0, 120);
        const now = Date.now();
        const entry = this._errorDedup.get(key);

        if (entry && now - entry.firstAt < DEDUP_WINDOW_MS) {
            entry.count++;
            // Écrire dans le fichier chaque fois (audit complet)
            this.writeToFile('ERROR', category, message, data);

            // En console : afficher seulement les premières occurrences
            if (entry.count <= MAX_CONSOLE_REPEATS) {
                this.log('ERROR', category, message, data, true); // consoleOnly=true (pas de double écriture fichier)
            } else if (entry.count === MAX_CONSOLE_REPEATS + 1) {
                // Avertissement une seule fois que le message est supprimé
                const levelInfo = this.levels['WARN'];
                console.log(levelInfo.color(`[WARN]`) + ` [${category}] ⏸ Erreur répétée supprimée du console (${entry.count}×): ${key.substring(0, 80)}...`);
            }
            return;
        }

        // Nouveau message — enregistrer et logger normalement
        this._errorDedup.set(key, { firstAt: now, count: 1 });

        // Nettoyage périodique de la map de déduplication (garder < 200 entrées)
        if (this._errorDedup.size > 200) {
            const cutoff = now - DEDUP_WINDOW_MS;
            for (const [k, v] of this._errorDedup.entries()) {
                if (v.firstAt < cutoff) this._errorDedup.delete(k);
            }
        }

        this.log('ERROR', category, message, data);
    }

    warn(message, data = null, category = 'SYSTEM') {
        this.log('WARN', category, message, data);
    }

    success(message, data = null, category = 'SYSTEM') {
        this.log('SUCCESS', category, message, data);
    }

    info(message, data = null, category = 'SYSTEM') {
        this.log('INFO', category, message, data);
    }

    system(message, data = null, category = 'SYSTEM') {
        this.log('SYSTEM', category, message, data);
    }

    debug(message, data = null, category = 'DEBUG') {
        this.log('DEBUG', category, message, data);
    }

    network(message, data = null, category = 'NETWORK') {
        this.log('NETWORK', category, message, data);
    }

    database(message, data = null, category = 'DATABASE') {
        this.log('DATABASE', category, message, data);
    }

    memory(message, data = null, category = 'MEMORY') {
        this.log('MEMORY', category, message, data);
    }

    connection(message, data = null, category = 'CONNECTION') {
        this.log('CONNECTION', category, message, data);
    }

    /**
     * Special methods for common scenarios
     */
    startup(message, data = null) {
        this.log('SYSTEM', 'STARTUP', message, data);
    }

    command(message, data = null) {
        this.log('INFO', 'COMMANDS', message, data);
    }

    messageReceived(message, data = null) {
        this.log('DEBUG', 'MESSAGES', message, data);
    }

    /**
     * Integration with existing error handler
     */
    handleError(sock, chatId, message, error, context = {}) {
        // Log the error using our system
        this.error(`Error in ${context.command || 'unknown command'}: ${error.message}`, {
            userId: context.userId,
            chatId: context.chatId,
            stack: error.stack?.substring(0, 500) + '...' // Truncate stack for readability
        });

        // Use the existing error handler for user messages
        return errorHandler.handleError(sock, chatId, message, error, context);
    }

    /**
     * Clean old log files
     */
    cleanOldLogs(maxAgeDays = 7) {
        try {
            const files = fs.readdirSync(this.logDir);
            const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

            let cleanedCount = 0;
            for (const file of files) {
                if (file.endsWith('.log') && file !== 'system.log' && file !== 'errors.log') {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime.getTime() < cutoff) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                    }
                }
            }

            if (cleanedCount > 0) {
                this.system(`Cleaned ${cleanedCount} old log files`);
            }
        } catch (error) {
            this.error('Failed to clean old logs', { error: error.message });
        }
    }

    /**
     * Get system statistics
     */
    getStats() {
        const memUsage = process.memoryUsage();
        return {
            memoryUsage: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
            },
            uptime: Math.round(process.uptime()) + ' seconds',
            logFile: this.logFile,
            debugMode: this.debugMode
        };
    }

    /**
     * Enable/disable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.info(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Create singleton instance
const logger = new Logger();

// Clean old logs on startup
logger.cleanOldLogs();

// Export both the logger instance and convenience functions
module.exports = {
    logger,
    log: (level, category, message, data) => logger.log(level, category, message, data),
    error: (message, data, category) => logger.error(message, data, category),
    warn: (message, data, category) => logger.warn(message, data, category),
    success: (message, data, category) => logger.success(message, data, category),
    info: (message, data, category) => logger.info(message, data, category),
    system: (message, data, category) => logger.system(message, data, category),
    debug: (message, data, category) => logger.debug(message, data, category),
    network: (message, data, category) => logger.network(message, data, category),
    database: (message, data, category) => logger.database(message, data, category),
    memory: (message, data, category) => logger.memory(message, data, category),
    connection: (message, data, category) => logger.connection(message, data, category),
    startup: (message, data) => logger.startup(message, data),
    command: (message, data) => logger.command(message, data),
    handleError: (sock, chatId, message, error, context) => logger.handleError(sock, chatId, message, error, context),
    getStats: () => logger.getStats(),
    setDebugMode: (enabled) => logger.setDebugMode(enabled),
    // Nouvelles méthodes pour style arbre markdown
    connectionTree: (status, details) => logger.connectionTree(status, details),
    errorTree: (errorType, errorMessage, details) => logger.errorTree(errorType, errorMessage, details),
    systemTree: (title, details) => logger.systemTree(title, details),
    formatTreeMessage: (level, category, title, details) => logger.formatTreeMessage(level, category, title, details)
};