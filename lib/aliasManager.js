/**
 * Gestionnaire d'alias centralisé pour wabot
 * 
 * Ce module gère tous les alias de commandes de manière centralisée et efficace.
 * Il remplace l'ancien système dispersé par une solution propre et extensible.
 * 
 * Fonctionnalités:
 * - Chargement automatique des alias depuis aliases.json
 * - Résolution bidirectionnelle (alias -> commande principale et vice versa)
 * - Support multilingue complet
 * - Gestion des alias dynamiques
 * - Cache pour optimiser les performances
 */

const fs = require('fs');
const path = require('path');

class AliasManager {
    constructor() {
        this.aliases = new Map();
        this.commandToAliases = new Map();
        this.aliasToCommand = new Map();
        this.supportedLanguages = ['en', 'fr', 'es'];
        this.aliasesFile = path.join(__dirname, '../config/aliases.json');
        
        this.loadAliases();
    }

    /**
     * Charge les alias depuis le fichier aliases.json
     */
    loadAliases() {
        try {
            if (!fs.existsSync(this.aliasesFile)) {
                console.warn('⚠️ [ALIAS] Fichier aliases.json non trouvé, création d\'un fichier par défaut...');
                this.createDefaultAliasFile();
            }

            const rawData = fs.readFileSync(this.aliasesFile, 'utf8');
            const data = JSON.parse(rawData);

            this.aliases.clear();
            this.commandToAliases.clear();
            this.aliasToCommand.clear();

            // Construire les mappings
            Object.entries(data.aliases).forEach(([baseCommand, config]) => {
                // Stocker la configuration complète
                this.aliases.set(baseCommand, config);

                // Mapper chaque commande principale vers le command de base
                this.supportedLanguages.forEach(lang => {
                    const primaryCommand = config.primary[lang];
                    if (primaryCommand) {
                        this.aliasToCommand.set(primaryCommand, baseCommand);
                        
                        // Ajouter les alias pour cette langue
                        const aliases = config.aliases[lang] || [];
                        aliases.forEach(alias => {
                            this.aliasToCommand.set(alias, baseCommand);
                        });

                        // Construire la liste complète des alias pour une commande
                        const allAliases = [primaryCommand, ...aliases];
                        this.commandToAliases.set(baseCommand + '_' + lang, allAliases);
                    }
                });
            });

            console.log(`✅ [ALIAS] ${Object.keys(data.aliases).length} commandes avec alias chargées`);

        } catch (error) {
            console.error('❌ [ALIAS] Erreur lors du chargement des alias:', error.message);
            this.createDefaultAliasFile();
        }
    }

    /**
     * Créer un fichier d'alias par défaut si absent
     */
    createDefaultAliasFile() {
        const defaultConfig = {
            aliases: {},
            meta: {
                version: "1.0.0",
                created: new Date().toISOString().split('T')[0],
                description: "Système d'alias centralisé pour gérer tous les alias multilingues des commandes",
                supportedLanguages: this.supportedLanguages,
                usage: "Ce fichier centralise tous les alias pour une gestion propre et extensible"
            }
        };

        try {
            const configDir = path.dirname(this.aliasesFile);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(this.aliasesFile, JSON.stringify(defaultConfig, null, 2));
            console.log('✅ [ALIAS] Fichier aliases.json par défaut créé');
        } catch (error) {
            console.error('❌ [ALIAS] Impossible de créer le fichier par défaut:', error.message);
        }
    }

    /**
     * Résoudre un alias vers sa commande de base
     * @param {string} alias - L'alias ou commande à résoudre
     * @returns {string|null} - La commande de base ou null si non trouvé
     */
    resolveAlias(alias) {
        if (!alias) return null;
        
        // Nettoyer l'alias (supprimer le préfixe . si présent)
        const cleanAlias = alias.startsWith('.') ? alias.substring(1) : alias;
        
        return this.aliasToCommand.get(cleanAlias) || null;
    }

    /**
     * Obtenir la commande principale pour une langue donnée
     * @param {string} baseCommand - La commande de base
     * @param {string} language - La langue (en, fr, es)
     * @returns {string|null} - La commande principale dans cette langue
     */
    getPrimaryCommand(baseCommand, language = 'en') {
        const config = this.aliases.get(baseCommand);
        if (!config || !config.primary) return null;
        
        return config.primary[language] || config.primary.en || null;
    }

    /**
     * Obtenir tous les alias pour une commande dans une langue
     * @param {string} baseCommand - La commande de base
     * @param {string} language - La langue
     * @returns {string[]} - Liste des alias
     */
    getAliases(baseCommand, language = 'en') {
        const key = baseCommand + '_' + language;
        return this.commandToAliases.get(key) || [];
    }

    /**
     * Obtenir tous les alias pour une commande (toutes langues)
     * @param {string} baseCommand - La commande de base
     * @returns {Object} - Objet avec les alias par langue
     */
    getAllAliases(baseCommand) {
        const config = this.aliases.get(baseCommand);
        if (!config) return {};

        const result = {};
        this.supportedLanguages.forEach(lang => {
            const primary = config.primary[lang];
            const aliases = config.aliases[lang] || [];
            if (primary) {
                result[lang] = {
                    primary: primary,
                    aliases: aliases,
                    all: [primary, ...aliases]
                };
            }
        });

        return result;
    }

    /**
     * Vérifier si un alias existe
     * @param {string} alias - L'alias à vérifier
     * @returns {boolean} - True si l'alias existe
     */
    hasAlias(alias) {
        const cleanAlias = alias.startsWith('.') ? alias.substring(1) : alias;
        return this.aliasToCommand.has(cleanAlias);
    }

    /**
     * Ajouter un nouvel alias de manière dynamique
     * @param {string} baseCommand - La commande de base
     * @param {string} language - La langue
     * @param {string} alias - Le nouvel alias
     * @returns {boolean} - True si ajouté avec succès
     */
    addAlias(baseCommand, language, alias) {
        try {
            // Charger la configuration actuelle
            const rawData = fs.readFileSync(this.aliasesFile, 'utf8');
            const data = JSON.parse(rawData);

            // Initialiser si nécessaire
            if (!data.aliases[baseCommand]) {
                data.aliases[baseCommand] = {
                    primary: {},
                    aliases: {}
                };
            }

            if (!data.aliases[baseCommand].aliases[language]) {
                data.aliases[baseCommand].aliases[language] = [];
            }

            // Vérifier si l'alias n'existe pas déjà
            if (!data.aliases[baseCommand].aliases[language].includes(alias)) {
                data.aliases[baseCommand].aliases[language].push(alias);

                // Sauvegarder
                fs.writeFileSync(this.aliasesFile, JSON.stringify(data, null, 2));
                
                // Recharger les alias
                this.loadAliases();
                
                console.log(`✅ [ALIAS] Nouvel alias ajouté: ${alias} -> ${baseCommand} (${language})`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ [ALIAS] Erreur lors de l\'ajout d\'alias:', error.message);
            return false;
        }
    }

    /**
     * Supprimer un alias
     * @param {string} alias - L'alias à supprimer
     * @returns {boolean} - True si supprimé avec succès
     */
    removeAlias(alias) {
        try {
            // Normaliser l'alias (enlever le point et nettoyer comme resolveAlias)
            const normalizedAlias = alias.startsWith('.') ? alias.slice(1).trim() : alias.trim();
            
            const baseCommand = this.resolveAlias(normalizedAlias);
            if (!baseCommand) return false;

            const rawData = fs.readFileSync(this.aliasesFile, 'utf8');
            const data = JSON.parse(rawData);

            let found = false;
            this.supportedLanguages.forEach(lang => {
                const aliases = data.aliases[baseCommand]?.aliases[lang];
                if (aliases) {
                    // Utiliser l'alias normalisé pour la recherche
                    const index = aliases.indexOf(normalizedAlias);
                    if (index > -1) {
                        aliases.splice(index, 1);
                        found = true;
                    }
                }
            });

            if (found) {
                fs.writeFileSync(this.aliasesFile, JSON.stringify(data, null, 2));
                this.loadAliases();
                console.log(`✅ [ALIAS] Alias supprimé: ${normalizedAlias}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ [ALIAS] Erreur lors de la suppression:', error.message);
            return false;
        }
    }

    /**
     * Recharger les alias depuis le fichier
     */
    reload() {
        console.log('🔄 [ALIAS] Rechargement des alias...');
        this.loadAliases();
    }

    /**
     * Obtenir des statistiques sur les alias
     * @returns {Object} - Statistiques
     */
    getStats() {
        const totalCommands = this.aliases.size;
        let totalAliases = 0;
        const aliasesByLanguage = {};

        this.supportedLanguages.forEach(lang => {
            aliasesByLanguage[lang] = 0;
        });

        this.aliases.forEach((config, baseCommand) => {
            this.supportedLanguages.forEach(lang => {
                const aliases = config.aliases[lang] || [];
                totalAliases += aliases.length + 1; // +1 pour la commande principale
                aliasesByLanguage[lang] += aliases.length + 1;
            });
        });

        return {
            totalCommands,
            totalAliases,
            aliasesByLanguage,
            supportedLanguages: this.supportedLanguages
        };
    }
}

// Singleton instance
let aliasManagerInstance = null;

/**
 * Obtenir l'instance du gestionnaire d'alias (Singleton)
 * @returns {AliasManager}
 */
function getAliasManager() {
    if (!aliasManagerInstance) {
        aliasManagerInstance = new AliasManager();
    }
    return aliasManagerInstance;
}

module.exports = {
    AliasManager,
    getAliasManager
};