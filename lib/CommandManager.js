/**
 * COMMAND MANAGER - Système centralisé de gestion des commandes
 * 
 * Fonctionnalités:
 * - Chargement dynamique de toutes les commandes depuis le dossier commands/
 * - Vérification rapide des permissions (owner/admin/user)
 * - Activation/désactivation des commandes par groupe
 * - Cache ultra-rapide pour éviter les requêtes DB répétées
 * - Intégration avec le système d'alias existant
 * 
 * Architecture:
 * 1. Au démarrage: Scan des commandes + Build du cache
 * 2. À chaque message: Vérification ultra-rapide (< 1ms)
 * 3. Configuration: Via API ou commandes admin
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Singleton pour éviter les multiples instances
let instance = null;

class CommandManager {
    constructor() {
        if (instance) {
            return instance;
        }

        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Cache ultra-rapide
        this.commandsCache = new Map(); // commandName -> metadata
        this.groupConfigCache = new Map(); // groupId -> Set<disabledCommands>
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.lastCacheUpdate = new Map();

        // Répertoire des commandes
        this.commandsDir = path.join(__dirname, '../commands');

        instance = this;
    }

    /**
     * Initialise le système de gestion de commandes
     */
    async initialize() {
        console.log('🔧 [CommandManager] Initialisation...');
        
        try {
            // 1. Créer la table si elle n'existe pas
            await this.ensureTableExists();
            
            // 2. Scanner toutes les commandes
            await this.scanAllCommands();
            
            // 3. Précharger les configurations des groupes actifs
            await this.preloadGroupConfigs();
            
            console.log(`✅ [CommandManager] Initialisé: ${this.commandsCache.size} commandes disponibles`);
        } catch (error) {
            console.error('❌ [CommandManager] Erreur initialisation:', error.message);
            throw error;
        }
    }

    /**
     * Crée la table group_commands_config si elle n'existe pas
     */
    async ensureTableExists() {
        try {
            // Vérifier si la table existe via une requête simple
            const { error } = await this.supabase
                .from('group_commands_config')
                .select('id')
                .limit(1);

            if (error && error.code === '42P01') {
                // Table n'existe pas, la créer via la fonction SQL
                console.log('📋 [CommandManager] Création de la table group_commands_config...');
                
                const { error: createError } = await this.supabase.rpc('exec_sql', {
                    query: `
                        CREATE TABLE IF NOT EXISTS group_commands_config (
                            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                            group_id TEXT NOT NULL,
                            command_name TEXT NOT NULL,
                            is_enabled BOOLEAN NOT NULL DEFAULT true,
                            disabled_by TEXT,
                            disabled_at TIMESTAMPTZ,
                            disabled_reason TEXT,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(group_id, command_name)
                        );
                        
                        CREATE INDEX IF NOT EXISTS idx_group_commands_group_id ON group_commands_config(group_id);
                        CREATE INDEX IF NOT EXISTS idx_group_commands_command_name ON group_commands_config(command_name);
                        CREATE INDEX IF NOT EXISTS idx_group_commands_enabled ON group_commands_config(is_enabled);
                    `
                });

                if (createError) {
                    console.warn('⚠️ [CommandManager] Impossible de créer la table automatiquement. Veuillez la créer manuellement.');
                } else {
                    console.log('✅ [CommandManager] Table créée avec succès');
                }
            }
        } catch (error) {
            console.warn('⚠️ [CommandManager] Table check failed, continuons quand même:', error.message);
        }
    }

    /**
     * Scanne récursivement toutes les commandes dans le dossier commands/
     */
    async scanAllCommands() {
        const commands = [];
        
        const scanDir = (dir, category = '') => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory() && !['data', 'temp', 'assets', 'node_modules'].includes(item.name)) {
                    // Récursion dans les sous-dossiers
                    scanDir(fullPath, item.name);
                } else if (item.isFile() && item.name.endsWith('.js')) {
                    const commandName = path.basename(item.name, '.js');
                    
                    // Extraire la catégorie du chemin
                    const relativePath = path.relative(this.commandsDir, dir);
                    const commandCategory = relativePath || 'root';
                    
                    commands.push({
                        name: commandName,
                        category: commandCategory,
                        filePath: fullPath,
                        permission: this.detectPermissionLevel(commandCategory, commandName)
                    });
                }
            }
        };

        scanDir(this.commandsDir);
        
        // Stocker dans le cache
        commands.forEach(cmd => {
            this.commandsCache.set(cmd.name, cmd);
        });

        console.log(`📊 [CommandManager] ${commands.length} commandes scannées`);
        return commands;
    }

    /**
     * Détecte le niveau de permission requis pour une commande
     */
    detectPermissionLevel(category, commandName) {
        // Commandes owner
        const ownerCommands = ['sudo', 'setpp', 'clearsession', 'autostatus', 'autodelete', 
                              'autoread', 'autotyping', 'cleartmp', 'pair', 'update'];
        if (ownerCommands.includes(commandName) || category === 'system') {
            return 'owner';
        }

        // Commandes admin
        if (category === 'admin' || 
            ['ban', 'unban', 'kick', 'mute', 'unmute', 'promote', 'demote', 'warn', 
             'antilink', 'antitag', 'antibadword', 'tagall', 'delete'].includes(commandName)) {
            return 'admin';
        }

        // Commandes user (par défaut)
        return 'user';
    }

    /**
     * Précharge les configurations de tous les groupes actifs
     */
    async preloadGroupConfigs() {
        try {
            const { data: groups, error } = await this.supabase
                .from('bot_groups')
                .select('group_id')
                .eq('is_active', true);

            if (error) throw error;

            // Charger les configs pour chaque groupe
            for (const group of groups || []) {
                await this.getGroupConfig(group.group_id);
            }

            console.log(`📦 [CommandManager] Configurations préchargées pour ${groups?.length || 0} groupes`);
        } catch (error) {
            console.error('❌ [CommandManager] Erreur preload:', error.message);
        }
    }

    /**
     * Récupère la configuration d'un groupe (avec cache)
     */
    async getGroupConfig(groupId) {
        // Vérifier le cache d'abord
        const lastUpdate = this.lastCacheUpdate.get(groupId);
        if (lastUpdate && (Date.now() - lastUpdate) < this.cacheTimeout) {
            return this.groupConfigCache.get(groupId) || new Set();
        }

        try {
            // Récupérer depuis la DB
            const { data, error } = await this.supabase
                .from('group_commands_config')
                .select('command_name, is_enabled')
                .eq('group_id', groupId);

            if (error) throw error;

            // Construire le Set des commandes désactivées
            const disabledCommands = new Set();
            (data || []).forEach(row => {
                if (!row.is_enabled) {
                    disabledCommands.add(row.command_name);
                }
            });

            // Mettre en cache
            this.groupConfigCache.set(groupId, disabledCommands);
            this.lastCacheUpdate.set(groupId, Date.now());

            return disabledCommands;
        } catch (error) {
            console.error(`❌ [CommandManager] Erreur getGroupConfig ${groupId}:`, error.message);
            return new Set(); // Fallback: toutes les commandes activées
        }
    }

    /**
     * VÉRIFICATION ULTRA-RAPIDE: Est-ce qu'une commande est autorisée ?
     * Cette fonction doit être TRÈS rapide (< 1ms) car appelée à chaque message
     * 
     * @param {string} groupId - ID du groupe WhatsApp
     * @param {string} commandName - Nom de la commande (sans préfixe)
     * @param {string} userRole - Rôle de l'utilisateur ('owner', 'admin', 'user')
     * @returns {Object} { allowed: boolean, reason: string }
     */
    async canExecuteCommand(groupId, commandName, userRole = 'user') {
        // 1. Vérifier si la commande existe
        const commandMeta = this.commandsCache.get(commandName);
        if (!commandMeta) {
            return { 
                allowed: false, 
                reason: 'COMMAND_NOT_FOUND',
                message: `❌ Commande "${commandName}" introuvable.`
            };
        }

        // 2. Vérifier les permissions de rôle
        const requiredPermission = commandMeta.permission;
        if (requiredPermission === 'owner' && userRole !== 'owner') {
            return { 
                allowed: false, 
                reason: 'INSUFFICIENT_PERMISSION',
                message: '❌ Cette commande est réservée au propriétaire du bot.'
            };
        }
        if (requiredPermission === 'admin' && !['admin', 'owner'].includes(userRole)) {
            return { 
                allowed: false, 
                reason: 'INSUFFICIENT_PERMISSION',
                message: '❌ Cette commande est réservée aux administrateurs du groupe.'
            };
        }

        // 3. Vérifier si la commande est désactivée pour ce groupe
        const disabledCommands = await this.getGroupConfig(groupId);
        if (disabledCommands.has(commandName)) {
            return { 
                allowed: false, 
                reason: 'COMMAND_DISABLED',
                message: `❌ La commande "${commandName}" a été désactivée par les administrateurs de ce groupe.`
            };
        }

        // ✅ Tout est OK
        return { allowed: true, reason: 'OK' };
    }

    /**
     * Active ou désactive une commande pour un groupe
     */
    async setCommandEnabled(groupId, commandName, enabled, disabledBy = null, reason = null) {
        try {
            // Vérifier si la commande existe
            if (!this.commandsCache.has(commandName)) {
                throw new Error(`Commande "${commandName}" introuvable`);
            }

            const dataToSave = {
                group_id: groupId,
                command_name: commandName,
                is_enabled: enabled,
                disabled_by: enabled ? null : disabledBy,
                disabled_at: enabled ? null : new Date().toISOString(),
                disabled_reason: enabled ? null : reason,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('group_commands_config')
                .upsert(dataToSave, { 
                    onConflict: 'group_id,command_name',
                    ignoreDuplicates: false 
                })
                .select()
                .single();

            if (error) throw error;

            // Invalider le cache pour ce groupe
            this.groupConfigCache.delete(groupId);
            this.lastCacheUpdate.delete(groupId);

            console.log(`✅ [CommandManager] Commande "${commandName}" ${enabled ? 'activée' : 'désactivée'} pour ${groupId}`);
            return data;
        } catch (error) {
            console.error(`❌ [CommandManager] Erreur setCommandEnabled:`, error.message);
            throw error;
        }
    }

    /**
     * Obtient la liste de toutes les commandes disponibles
     */
    getAllCommands() {
        return Array.from(this.commandsCache.values());
    }

    /**
     * Obtient les commandes par catégorie
     */
    getCommandsByCategory() {
        const byCategory = {};
        
        this.commandsCache.forEach((cmd, name) => {
            if (!byCategory[cmd.category]) {
                byCategory[cmd.category] = [];
            }
            byCategory[cmd.category].push({
                name: name,
                permission: cmd.permission
            });
        });

        return byCategory;
    }

    /**
     * Invalide le cache d'un groupe (utile après modifications)
     */
    invalidateGroupCache(groupId) {
        this.groupConfigCache.delete(groupId);
        this.lastCacheUpdate.delete(groupId);
    }

    /**
     * Rafraîchit complètement le système (scan + cache)
     */
    async refresh() {
        console.log('🔄 [CommandManager] Rafraîchissement complet...');
        this.commandsCache.clear();
        this.groupConfigCache.clear();
        this.lastCacheUpdate.clear();
        await this.initialize();
    }
}

/**
 * Fonction helper pour obtenir l'instance singleton
 */
function getCommandManager() {
    if (!instance) {
        instance = new CommandManager();
    }
    return instance;
}

module.exports = { CommandManager, getCommandManager };
