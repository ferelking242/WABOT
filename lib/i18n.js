/**
 * Modern i18n (Internationalization) System for wabot
 * Replaces the old inefficient language system
 * 
 * Features:
 * - Efficient JSON-based translations
 * - Easy to add new languages
 * - Centralized translation management
 * - Command mapping support
 * - Fallback system
 */

const fs = require('fs');
const path = require('path');
const { getAliasManager } = require('./aliasManager');

class I18n {
    constructor() {
        this.locales = new Map();
        this.userLanguages = new Map();
        this.defaultLanguage = 'fr';
        this.supportedLanguages = [
            'fr', 'en', 'es', // Langues existantes
            'ln', // Lingala
            'wo', // Wolof  
            'mkw', // Mbochi
            'bm', // Bambara
            'ha', // Hausa
            'yo', // Yoruba
            'sw', // Swahili
            'am', // Amharique
            'ar', // Arabe
            'pt', // Portugais (pour l'Angola, Mozambique)
            'zu', // Zulu
            'xh', // Xhosa
            'af', // Afrikaans
            'ig', // Igbo
            'ff', // Peul/Fulfulde
            'sn' // Shona
        ];
        this.commandMappings = new Map();
        this.aliasManager = null;
        
        this.loadLocales();
        this.loadUserLanguages();
        this.initializeAliasManager();
        this.buildCommandMappings();
    }

    /**
     * Load all locale files from locales directory
     */
    loadLocales() {
        const localesDir = path.join(__dirname, '../locales');
        
        if (!fs.existsSync(localesDir)) {
            fs.mkdirSync(localesDir, { recursive: true });
        }

        let loadedCount = 0;
        this.supportedLanguages.forEach(lang => {
            const filePath = path.join(localesDir, `${lang}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const locale = JSON.parse(content);
                    this.locales.set(lang, locale);
                    loadedCount++;
                } catch (error) {
                    process.stderr.write(`❌ [I18N] Error loading locale ${lang}: ${error.message}\n`);
                }
            }
        });
        if (loadedCount > 0) {
            console.log(`✓ Loaded ${loadedCount} locales`);
        }
    }

    /**
     * Load user language preferences
     */
    loadUserLanguages() {
        const userLangFile = path.join(__dirname, '../data/userLanguages.json');
        
        if (fs.existsSync(userLangFile)) {
            try {
                const data = fs.readFileSync(userLangFile, 'utf8');
                const parsed = JSON.parse(data);
                this.userLanguages = new Map(Object.entries(parsed));
                if (this.userLanguages.size > 0) console.log(`✓ Loaded ${this.userLanguages.size} user language preferences`);
            } catch (error) {
                console.error('❌ Error loading user languages:', error.message);
            }
        }
    }

    /**
     * Save user language preferences
     */
    saveUserLanguages() {
        const userLangFile = path.join(__dirname, '../data/userLanguages.json');
        const dataDir = path.dirname(userLangFile);
        
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        try {
            const data = Object.fromEntries(this.userLanguages);
            fs.writeFileSync(userLangFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving user languages:', error.message);
        }
    }

    /**
     * Initialize the modern Alias Manager
     */
    initializeAliasManager() {
        try {
            this.aliasManager = getAliasManager();
            console.log('✅ [I18N] Gestionnaire d\'alias centralisé initialisé');
        } catch (error) {
            console.warn('⚠️ [I18N] Erreur initialisation AliasManager:', error.message);
            console.log('🔄 [I18N] Utilisation du système de mapping legacy');
        }
    }

    /**
     * Build command mappings for all languages (Legacy + Modern)
     */
    buildCommandMappings() {
        // Modern alias system (preferred)
        if (this.aliasManager) {
            // Le mapping moderne est géré par l'AliasManager
            console.log('✓ [I18N] Utilisation du système d\'alias moderne');
        }
        
        // Legacy system (fallback for compatibility)
        this.locales.forEach((locale, lang) => {
            if (locale.commands) {
                Object.entries(locale.commands).forEach(([key, command]) => {
                    const commandName = command.name;
                    if (!this.commandMappings.has(commandName)) {
                        this.commandMappings.set(commandName, key);
                    }
                    // Also map the key to itself for reverse lookup
                    this.commandMappings.set(key, key);
                });
            }
        });
        
        if (this.commandMappings.size > 0) {
            console.log('✓ [I18N] Système de mapping legacy activé pour compatibilité');
        }
    }

    /**
     * Get user's preferred language
     */
    getUserLanguage(userId) {
        return this.userLanguages.get(userId) || this.defaultLanguage;
    }

    /**
     * Set user's preferred language
     */
    setUserLanguage(userId, language) {
        if (this.supportedLanguages.includes(language)) {
            this.userLanguages.set(userId, language);
            this.saveUserLanguages();
            return true;
        }
        return false;
    }

    /**
     * Get translated text
     * @param {string} userId - User ID for language preference
     * @param {string} key - Translation key (supports nested keys like 'bot.status.online')
     * @param {object} variables - Variables to replace in the text
     * @param {string} fallbackLang - Fallback language if user's language doesn't have the key
     */
    t(userId, key, variables = {}, fallbackLang = 'en') {
        const userLang = this.getUserLanguage(userId);
        
        // Try user's preferred language first
        let text = this.getNestedValue(this.locales.get(userLang), key);
        
        // Fallback to fallback language
        if (!text && fallbackLang !== userLang) {
            text = this.getNestedValue(this.locales.get(fallbackLang), key);
        }
        
        // Fallback to default language
        if (!text && this.defaultLanguage !== userLang && this.defaultLanguage !== fallbackLang) {
            text = this.getNestedValue(this.locales.get(this.defaultLanguage), key);
        }
        
        // If still no text, return null (so || fallback works in callers)
        if (!text) {
            return null;
        }

        // Replace variables
        return this.replaceVariables(text, variables);
    }

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, key) {
        if (!obj) return null;
        
        // Ensure key is a string before using split
        const keyStr = typeof key === 'string' ? key : String(key);
        
        return keyStr.split('.').reduce((current, prop) => {
            return current && current[prop] !== undefined ? current[prop] : null;
        }, obj);
    }

    /**
     * Replace variables in text
     */
    replaceVariables(text, variables) {
        if (typeof text !== 'string') return text;
        
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            return variables[key] !== undefined ? variables[key] : match;
        });
    }

    /**
     * Get localized command name (Modern + Legacy)
     */
    getLocalizedCommand(userId, command) {
        const userLang = this.getUserLanguage(userId);
        
        // Modern alias system (preferred)
        if (this.aliasManager) {
            const primaryCommand = this.aliasManager.getPrimaryCommand(command, userLang);
            if (primaryCommand) {
                return primaryCommand;
            }
        }
        
        // Legacy system fallback
        const locale = this.locales.get(userLang);
        if (locale && locale.commands && locale.commands[command]) {
            return locale.commands[command].name;
        }
        
        return command;
    }

    /**
     * Get English command from localized command (Modern + Legacy)
     */
    getEnglishCommand(userId, localizedCommand) {
        // Remove the dot if present
        const cmd = localizedCommand.startsWith('.') ? localizedCommand.slice(1) : localizedCommand;
        
        // Modern alias system (preferred)
        if (this.aliasManager) {
            const baseCommand = this.aliasManager.resolveAlias(cmd);
            if (baseCommand) {
                return baseCommand;
            }
        }
        
        // Legacy system fallback
        const mappedCommand = this.commandMappings.get(cmd);
        if (mappedCommand) {
            return mappedCommand;
        }
        
        // Return original if no mapping found
        return cmd;
    }

    /**
     * Get all available languages
     */
    getAvailableLanguages() {
        return this.supportedLanguages.map(lang => {
            const locale = this.locales.get(lang);
            return {
                code: lang,
                name: locale?.meta?.language || lang,
                flag: locale?.meta?.flag || '',
                completion: locale?.meta?.completion || '0%'
            };
        });
    }

    /**
     * Get command information in user's language
     */
    getCommandInfo(userId, command) {
        const userLang = this.getUserLanguage(userId);
        const locale = this.locales.get(userLang);
        
        if (locale && locale.commands && locale.commands[command]) {
            return locale.commands[command];
        }
        
        // Fallback to English
        const enLocale = this.locales.get('en');
        if (enLocale && enLocale.commands && enLocale.commands[command]) {
            return enLocale.commands[command];
        }
        
        return null;
    }

    /**
     * Check if a language is supported
     */
    isLanguageSupported(language) {
        return this.supportedLanguages.includes(language);
    }

    /**
     * Get all aliases for a command in a specific language
     */
    getCommandAliases(command, language = 'en') {
        if (this.aliasManager) {
            return this.aliasManager.getAllAliases(command)[language] || {};
        }
        return {};
    }

    /**
     * Add a new alias dynamically
     */
    addAlias(baseCommand, language, alias) {
        if (this.aliasManager) {
            return this.aliasManager.addAlias(baseCommand, language, alias);
        }
        return false;
    }

    /**
     * Check if an alias exists
     */
    hasAlias(alias) {
        if (this.aliasManager) {
            return this.aliasManager.hasAlias(alias);
        }
        const cmd = alias.startsWith('.') ? alias.slice(1) : alias;
        return this.commandMappings.has(cmd);
    }

    /**
     * Reload all locales and aliases (useful for development)
     */
    reload() {
        this.locales.clear();
        this.commandMappings.clear();
        
        // Reload alias manager
        if (this.aliasManager) {
            this.aliasManager.reload();
        }
        
        this.loadLocales();
        this.buildCommandMappings();
        console.log('🔄 [I18N] Système i18n + alias rechargé');
    }
}

// Create singleton instance
const i18n = new I18n();

module.exports = {
    i18n,
    // Convenience functions for backward compatibility
    getText: (userId, key, fallbackLang, replacements) => i18n.t(userId, key, replacements, fallbackLang),
    setUserLanguage: (userId, language) => i18n.setUserLanguage(userId, language),
    getUserLanguage: (userId) => i18n.getUserLanguage(userId),
    getLocalizedCommand: (userId, command) => i18n.getLocalizedCommand(userId, command),
    getEnglishCommand: (userId, localizedCommand) => i18n.getEnglishCommand(userId, localizedCommand),
    getAvailableLanguages: () => i18n.getAvailableLanguages(),
    isLanguageSupported: (language) => i18n.isLanguageSupported(language),
    // New alias-related functions
    getCommandAliases: (command, language) => i18n.getCommandAliases(command, language),
    addAlias: (baseCommand, language, alias) => i18n.addAlias(baseCommand, language, alias),
    hasAlias: (alias) => i18n.hasAlias(alias)
};