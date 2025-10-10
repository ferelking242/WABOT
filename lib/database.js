/**
 * wabot - Gestionnaire de Base de Données PostgreSQL Direct
 * PHASE 1 FIX: Utiliser PostgreSQL direct au lieu de Supabase (clés manquantes)
 * Migration: septembre 2025 (PostgreSQL Direct via DATABASE_URL)
 */

const { supabase, supabaseBot } = require('./supabase');

class WabotDatabase {
    constructor() {
        // Utiliser Supabase au lieu de PostgreSQL direct
        this.supabase = supabase;
        this.supabaseBot = supabaseBot;
        
        // Tester la connexion Supabase (silencieux)
        this.testSupabaseConnection();
        
        // Cache local pour optimiser les performances
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async testSupabaseConnection() {
        try {
            const isConnected = await this.supabaseBot.testConnection();
            // Only log errors, not success (to reduce verbosity)
            if (!isConnected) {
                console.log('❌ Connexion Supabase échouée pour le bot');
            }
        } catch (error) {
            console.log('❌ Erreur test connexion Supabase:', error.message);
        }
    }

    /**
     * Cache helpers
     */
    _getCacheKey(table, params = {}) {
        return `${table}_${JSON.stringify(params)}`;
    }

    _setCache(key, data) {
        this.cache.set(key, data);
        this.cacheExpiry.set(key, Date.now() + this.cacheTimeout);
    }

    _getCache(key) {
        const expiry = this.cacheExpiry.get(key);
        if (expiry && Date.now() < expiry) {
            return this.cache.get(key);
        }
        // Expired
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
        return null;
    }

    _clearCache(pattern = null) {
        if (pattern) {
            for (const [key] of this.cache) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                    this.cacheExpiry.delete(key);
                }
            }
        } else {
            this.cache.clear();
            this.cacheExpiry.clear();
        }
    }

    // ===== GESTION DES UTILISATEURS =====

    /**
     * Créer ou mettre à jour un utilisateur
     */
    async upsertUser(userData) {
        try {
            // Utilisation Supabase uniquement - utiliser jid comme clé d'unicité
            const { data, error } = await this.supabase
                .from('bot_users')
                .upsert(userData, { 
                    onConflict: 'jid'
                });

            if (error) throw error;
            this._clearCache('bot_users');
            return data;
        } catch (error) {
            console.error('Erreur upsertUser:', error);
            throw error;
        }
    }

    /**
     * Obtenir un utilisateur par son ID
     */
    async getUser(userId) {
        try {
            const cacheKey = this._getCacheKey('bot_users', { userId });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            // Utilisation Supabase uniquement - chercher par jid (champ unique réel dans la base)
            const { data, error } = await this.supabase
                .from('bot_users')
                .select('*')
                .eq('jid', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            
            const result = data || null;
            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Erreur getUser:', error);
            return null;
        }
    }

    /**
     * Vérifier si un utilisateur est banni
     */
    async isBanned(userId) {
        try {
            const user = await this.getUser(userId);
            return user ? user.is_banned : false;
        } catch (error) {
            console.error('Erreur isBanned:', error);
            return false;
        }
    }

    /**
     * Bannir/débannir un utilisateur
     */
    async setBanStatus(userId, isBanned, reason = null) {
        try {
            const updateData = {
                jid: userId,
                is_banned: isBanned,
                ban_reason: reason,
                banned_at: isBanned ? new Date().toISOString() : null
            };

            await this.upsertUser(updateData);
            this._clearCache('bot_users');
            return true;
        } catch (error) {
            console.error('Erreur setBanStatus:', error);
            return false;
        }
    }

    /**
     * Obtenir la langue d'un utilisateur
     */
    async getUserLanguage(userId) {
        try {
            const user = await this.getUser(userId);
            return user ? user.language : 'fr'; // Défaut français
        } catch (error) {
            console.error('Erreur getUserLanguage:', error);
            return 'fr';
        }
    }

    /**
     * Définir la langue d'un utilisateur
     */
    async setUserLanguage(userId, language) {
        try {
            await this.upsertUser({
                jid: userId,
                language: language
            });
            this._clearCache('bot_users');
            return true;
        } catch (error) {
            console.error('Erreur setUserLanguage:', error);
            return false;
        }
    }

    // ===== GESTION DES GROUPES =====

    /**
     * Créer ou mettre à jour un groupe (PostgreSQL direct)
     */
    async upsertGroup(groupData) {
        try {
            // Obtenir le numéro du propriétaire du bot
            const settings = require('../config/settings.js');
            const waOwnerNumber = settings.ownerNumber;

            // PHASE 1 FIX: Stocker les liaisons dans metadata pour compatibilité
            const metadata = {
                waOwnerNumber: waOwnerNumber, // Pour l'API frontend (legacy)
                groupType: groupData.group_type || 'group',
                isBotAdmin: groupData.is_bot_admin || false,
                isBotOwner: groupData.is_bot_owner || false,
                participantCount: groupData.participant_count || 0,
                joinedAt: groupData.joined_at || new Date().toISOString(),
                lastActivity: groupData.last_activity || new Date().toISOString(),
                welcomeSent: groupData.welcome_sent || false,
                communityId: groupData.community_id,
                adminCount: groupData.admin_count || 0,
                ownerCount: groupData.owner_count || 0,
                
                // 🔑 NOUVELLES INFOS DE LIAISON (dans metadata) 
                ownerWhatsappNumber: groupData.owner_whatsapp_number,
                adminWhatsappNumbers: groupData.admin_whatsapp_numbers,
                ...(groupData.metadata || {})
            };

            const additionalInfo = {
                // Aussi dans additional_info pour plus de sécurité
                ownerWhatsappNumber: groupData.owner_whatsapp_number,
                adminWhatsappNumbers: groupData.admin_whatsapp_numbers,
                ...(groupData.additional_info || {})
            };

            // Utiliser Supabase upsert
            const { data, error } = await this.supabase
                .from('bot_groups')
                .upsert({
                    group_id: groupData.group_id,
                    group_name: groupData.group_name || 'Sans nom',
                    is_active: groupData.is_active !== false,
                    group_type: groupData.group_type || 'group',
                    is_bot_admin: groupData.is_bot_admin || false,
                    participant_count: groupData.participant_count || 0,
                    community_id: groupData.community_id || null,
                    is_community: groupData.is_community || false,
                    is_parent: groupData.is_parent || false,
                    admin_count: groupData.admin_count || 0,
                    owner_count: groupData.owner_count || 0,
                    country_code: groupData.country_code || null,
                    country_name: groupData.country_name || null,
                    welcome_sent: groupData.welcome_sent || false,
                    group_description: groupData.group_description || null,
                    bot_is_owner: groupData.bot_is_owner || false,
                    group_creation_date: groupData.group_creation_date || null,
                    owner_whatsapp_number: groupData.owner_whatsapp_number || null,
                    admin_whatsapp_numbers: groupData.admin_whatsapp_numbers || [],
                    metadata: metadata,
                    additional_info: additionalInfo,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'group_id'
                });

            if (error) throw error;
            
            this._clearCache('bot_groups');
            return data;
        } catch (error) {
            console.error('Erreur upsertGroup PostgreSQL:', error);
            throw error;
        }
    }

    /**
     * Créer ou mettre à jour les participants d'un groupe
     * ACTIVÉ - Sauvegarde les participants avec leurs vrais numéros de téléphone
     */
    async upsertGroupParticipants(participantsData) {
        try {
            console.log(`✅ upsertGroupParticipants activé - traitement de ${participantsData.length} participants`);
            
            if (!participantsData || participantsData.length === 0) {
                return [];
            }

            // Utiliser la table bot_users pour sauvegarder les participants
            const results = [];
            
            for (const participant of participantsData) {
                try {
                    // Support pour les différents formats de données: participant.jid ou participant.user_jid
                    const participantJid = participant.jid || participant.user_jid;
                    const participantPhone = participant.phone_number || participant.user_phone;
                    const participantName = participant.name || participant.user_name || 'Inconnu';
                    
                    // Vérifier que le JID est valide avant de continuer
                    if (!participantJid || participantJid === null || participantJid === undefined) {
                        console.error(`❌ Participant ignoré - JID null ou undefined:`, participant);
                        continue;
                    }
                    
                    // Support pour les JID @lid (WhatsApp List IDs) - les convertir en format valide
                    let normalizedJid = participantJid;
                    if (participantJid.includes('@lid') && participantPhone) {
                        // Convertir les @lid en format WhatsApp standard
                        normalizedJid = `${participantPhone}@s.whatsapp.net`;
                        console.log(`🔄 Conversion LID vers JID standard: ${participantJid} → ${normalizedJid}`);
                    }
                    
                    // Extraire le vrai numéro de téléphone
                    const phoneNumber = participantPhone || await this.extractPhoneNumber(normalizedJid);
                    const jidInfo = this.parseJidInfo(normalizedJid);
                    
                    // Créer le mapping JID pour les deux formats
                    if (jidInfo && phoneNumber) {
                        await this.createJidMapping(normalizedJid, normalizedJid, phoneNumber);
                        if (participantJid !== normalizedJid) {
                            // Créer aussi le mapping pour l'ID original
                            await this.createJidMapping(participantJid, normalizedJid, phoneNumber);
                        }
                    }
                    
                    // Sauvegarder dans bot_users avec infos participant
                    const userData = {
                        jid: normalizedJid,
                        phone_number: phoneNumber,
                        role: participant.role || participant.admin_level || 'member',
                        group_id: participant.group_id,
                        is_admin: (participant.role === 'admin' || participant.role === 'superadmin' || participant.is_admin),
                        is_owner: (participant.role === 'superadmin' || participant.is_owner),
                        name: participantName,
                        country_code: participant.country_code,
                        country_name: participant.country_name,
                        updated_at: new Date().toISOString()
                    };
                    
                    const result = await this.upsertUser(userData);
                    results.push(result);
                    
                    console.log(`   📱 Participant sauvegardé: ${phoneNumber} (${userData.role}) - JID: ${normalizedJid}`);
                } catch (error) {
                    console.error(`❌ Erreur participant ${participantJid || 'unknown'}:`, error.message);
                }
            }
            
            console.log(`✅ ${results.length}/${participantsData.length} participants sauvegardés avec succès`);
            return results;
        } catch (error) {
            console.error('Erreur upsertGroupParticipants:', error);
            throw error;
        }
    }

    /**
     * Obtenir les paramètres d'un groupe pour un type donné
     */
    async getGroupSetting(groupId, settingType) {
        try {
            const cacheKey = this._getCacheKey('group_settings', { groupId, settingType });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            // Utilisation Supabase uniquement
            const { data, error } = await this.supabase
                .from('group_settings')
                .select('*')
                .eq('group_id', groupId)
                .eq('setting_type', settingType)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            
            const result = data || { enabled: false, config: {} };
            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Erreur getGroupSetting:', error);
            return { enabled: false, config: {} };
        }
    }

    /**
     * Définir les paramètres d'un groupe
     */
    async setGroupSetting(groupId, settingType, enabled, config = {}) {
        try {
            // S'assurer que le groupe existe dans bot_groups
            await this.upsertGroup({ group_id: groupId, group_name: 'Unknown Group' });

            const { data, error } = await this.supabase
                .from('group_settings')
                .upsert({
                    group_id: groupId,
                    setting_type: settingType,
                    enabled: enabled,
                    config: config
                }, { 
                    onConflict: 'group_id,setting_type',
                    returning: 'minimal'
                });

            if (error) throw error;
            
            this._clearCache('group_settings');
            return true;
        } catch (error) {
            console.error('Erreur setGroupSetting:', error);
            return false;
        }
    }

    // ===== GESTION DES AVERTISSEMENTS =====

    /**
     * Obtenir les avertissements d'un utilisateur dans un groupe
     */
    async getUserWarnings(groupId, userId) {
        try {
            const { data, error } = await this.supabase
                .from('user_warnings')
                .select('warning_count')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.warning_count : 0;
        } catch (error) {
            console.error('Erreur getUserWarnings:', error);
            return 0;
        }
    }

    /**
     * Ajouter un avertissement à un utilisateur
     */
    async addWarning(groupId, userId, reason = null, warnedBy = null) {
        try {
            // S'assurer que l'utilisateur et le groupe existent
            await this.upsertUser({ jid: userId });
            await this.upsertGroup({ group_id: groupId, group_name: 'Unknown Group' });

            const currentWarnings = await this.getUserWarnings(groupId, userId);
            
            const { data, error } = await this.supabase
                .from('user_warnings')
                .upsert({
                    group_id: groupId,
                    user_id: userId,
                    warning_count: currentWarnings + 1,
                    reason: reason,
                    warned_by: warnedBy,
                    last_warning_at: new Date().toISOString()
                }, { 
                    onConflict: 'group_id,user_id',
                    returning: 'minimal'
                });

            if (error) throw error;
            
            return currentWarnings + 1;
        } catch (error) {
            console.error('Erreur addWarning:', error);
            return 0;
        }
    }

    /**
     * Effacer tous les avertissements d'un utilisateur dans un groupe
     */
    async clearUserWarnings(groupId, userId) {
        try {
            const { error } = await this.supabase
                .from('user_warnings')
                .update({
                    warning_count: 0,
                    reason: null,
                    last_warning_at: null
                })
                .eq('group_id', groupId)
                .eq('user_id', userId);

            if (error) throw error;
            
            this._clearCache('user_warnings');
            return true;
        } catch (error) {
            console.error('Erreur clearUserWarnings:', error);
            return false;
        }
    }

    // ===== STATISTIQUES DES MESSAGES =====

    /**
     * Incrémenter le compteur de messages
     */
    async incrementMessageCount(groupId, userId) {
        try {
            // S'assurer que l'utilisateur et le groupe existent
            await this.upsertUser({ jid: userId });
            await this.upsertGroup({ group_id: groupId, group_name: 'Unknown Group' });

            const { data, error } = await this.supabase
                .from('message_stats')
                .select('message_count')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .single();

            const currentCount = (data && !error) ? data.message_count : 0;

            const { error: upsertError } = await this.supabase
                .from('message_stats')
                .upsert({
                    group_id: groupId,
                    user_id: userId,
                    message_count: currentCount + 1,
                    last_message_at: new Date().toISOString()
                }, { 
                    onConflict: 'group_id,user_id',
                    returning: 'minimal'
                });

            if (upsertError) throw upsertError;
            
            this._clearCache('message_stats');
            return currentCount + 1;
        } catch (error) {
            console.error('Erreur incrementMessageCount:', error);
            return 0;
        }
    }

    /**
     * Obtenir le top des membres les plus actifs
     */
    async getTopMembers(groupId, limit = 10) {
        try {
            const cacheKey = this._getCacheKey('top_members', { groupId, limit });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const { data, error } = await this.supabase
                .from('message_stats')
                .select('user_id, message_count')
                .eq('group_id', groupId)
                .order('message_count', { ascending: false })
                .limit(limit);

            if (error) throw error;
            
            this._setCache(cacheKey, data || []);
            return data || [];
        } catch (error) {
            console.error('Erreur getTopMembers:', error);
            return [];
        }
    }

    // ===== CONFIGURATION DU BOT =====

    /**
     * Obtenir une configuration du bot
     */
    async getBotConfig(key) {
        try {
            const cacheKey = this._getCacheKey('bot_config', { key });
            const cached = this._getCache(cacheKey);
            if (cached !== null) return cached;

            let result = null;
            
            // Utilisation Supabase uniquement
            const { data, error } = await this.supabase
                .from('bot_config')
                .select('value')
                .eq('key', key)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            result = data ? data.value : null;
            
            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Erreur getBotConfig:', error);
            return null;
        }
    }

    /**
     * Définir une configuration du bot
     */
    async setBotConfig(key, value) {
        try {
            const { data, error } = await this.supabase
                .from('bot_config')
                .upsert({
                    key: key,
                    value: value
                }, { 
                    onConflict: 'key',
                    returning: 'minimal'
                });

            if (error) throw error;
            
            this._clearCache('bot_config');
            return true;
        } catch (error) {
            console.error('Erreur setBotConfig:', error);
            return false;
        }
    }

    // ===== MÉTHODES UTILITAIRES =====

    /**
     * Vérifier la connexion à la base de données
     */
    async testConnection() {
        try {
            const { data, error } = await this.supabase
                .from('bot_config')
                .select('key')
                .limit(1);

            if (error) throw error;
            
            console.log('✅ Connexion Supabase OK');
            return true;
        } catch (error) {
            console.error('❌ Erreur connexion Supabase:', error);
            return false;
        }
    }

    /**
     * Nettoyer les données expirées
     */
    async cleanup() {
        try {
            // Nettoyer les bannissements temporaires expirés
            await this.supabase
                .from('temp_bans')
                .update({ is_active: false })
                .lt('ban_until', new Date().toISOString())
                .eq('is_active', true);

            // Nettoyer les sondages expirés
            await this.supabase
                .from('polls')
                .update({ is_active: false })
                .lt('expires_at', new Date().toISOString())
                .eq('is_active', true);

            // Nettoyer les défis de vérification expirés
            await this.supabase
                .from('verification_challenges')
                .delete()
                .lt('expires_at', new Date().toISOString())
                .eq('is_completed', false);

            console.log('🧹 Nettoyage base de données effectué');
            return true;
        } catch (error) {
            console.error('Erreur cleanup:', error);
            return false;
        }
    }

    // ===== GESTION DES COMPANIONBOTS =====

    /**
     * Créer ou mettre à jour une configuration companion
     */
    async setCompanionConfig(userId, companionData) {
        try {
            const { data, error } = await this.supabase
                .from('companions')
                .upsert({
                    user_id: userId,
                    phone_number: companionData.phoneNumber,
                    companion_name: companionData.companionName,
                    owner_jid: companionData.owner,
                    status: companionData.status || 'initializing',
                    pairing_code: companionData.pairingCode || null,
                    last_activity: new Date().toISOString(),
                    config: companionData.config || {},
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
            
            this._clearCache('companions');
            return true;
        } catch (error) {
            console.error('Erreur setCompanionConfig:', error);
            return false;
        }
    }

    /**
     * Récupérer la configuration d'un companion
     */
    async getCompanionConfig(userId) {
        try {
            const cacheKey = this._getCacheKey('companions', { userId });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const { data, error } = await this.supabase
                .from('companions')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            
            if (data) {
                // Format data to match companionSystem format
                const config = {
                    userId: data.user_id,
                    phoneNumber: data.phone_number,
                    companionName: data.companion_name,
                    owner: data.owner_jid,
                    status: data.status,
                    pairingCode: data.pairing_code,
                    createdAt: new Date(data.created_at).getTime(),
                    lastActivity: new Date(data.last_activity).getTime(),
                    config: data.config || {}
                };
                
                this._setCache(cacheKey, config);
                return config;
            }
            
            return null;
        } catch (error) {
            console.error('Erreur getCompanionConfig:', error);
            return null;
        }
    }

    /**
     * Récupérer toutes les configurations companion d'un propriétaire
     */
    async getAllCompanionConfigs(ownerJid) {
        try {
            const { data, error } = await this.supabase
                .from('companions')
                .select('*')
                .eq('owner_jid', ownerJid);

            if (error) throw error;
            
            // Format data to match companionSystem format
            return data.map(item => [
                item.user_id,
                {
                    userId: item.user_id,
                    phoneNumber: item.phone_number,
                    companionName: item.companion_name,
                    owner: item.owner_jid,
                    status: item.status,
                    pairingCode: item.pairing_code,
                    createdAt: new Date(item.created_at).getTime(),
                    lastActivity: new Date(item.last_activity).getTime(),
                    config: item.config || {}
                }
            ]);
        } catch (error) {
            console.error('Erreur getAllCompanionConfigs:', error);
            return [];
        }
    }

    /**
     * Supprimer une configuration companion
     */
    async removeCompanionConfig(userId) {
        try {
            const { error } = await this.supabase
                .from('companions')
                .delete()
                .eq('user_id', userId);

            if (error) throw error;
            
            this._clearCache('companions');
            return true;
        } catch (error) {
            console.error('Erreur removeCompanionConfig:', error);
            return false;
        }
    }

    /**
     * Mettre à jour le statut d'un companion
     */
    async updateCompanionStatus(userId, status, pairingCode = null) {
        try {
            const updateData = {
                status: status,
                updated_at: new Date().toISOString()
            };
            
            if (pairingCode) {
                updateData.pairing_code = pairingCode;
            }

            const { error } = await this.supabase
                .from('companions')
                .update(updateData)
                .eq('user_id', userId);

            if (error) throw error;
            
            this._clearCache('companions');
            return true;
        } catch (error) {
            console.error('Erreur updateCompanionStatus:', error);
            return false;
        }
    }

    /**
     * Mettre à jour l'activité d'un companion
     */
    async updateCompanionActivity(userId) {
        try {
            const { error } = await this.supabase
                .from('companions')
                .update({
                    last_activity: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Erreur updateCompanionActivity:', error);
            return false;
        }
    }

    // ===== GESTION DES STATUTS LIKÉS =====

    /**
     * Sauvegarder un statut liké
     */
    async saveLikedStatus(likedStatus) {
        try {
            const { data, error } = await this.supabase
                .from('liked_statuses')
                .upsert(likedStatus, { 
                    onConflict: 'user_id,status_url',
                    returning: 'minimal'
                });

            if (error) throw error;
            this._clearCache('liked_statuses');
            return data;
        } catch (error) {
            console.error('Erreur saveLikedStatus:', error);
            throw error;
        }
    }

    /**
     * Obtenir tous les statuts likés d'un utilisateur
     */
    async getUserLikedStatuses(userId, limit = 50) {
        try {
            const cacheKey = this._getCacheKey('liked_statuses', { userId, limit });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const { data, error } = await this.supabase
                .from('liked_statuses')
                .select('*')
                .eq('user_id', userId)
                .order('liked_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            
            this._setCache(cacheKey, data);
            return data || [];
        } catch (error) {
            console.error('Erreur getUserLikedStatuses:', error);
            return [];
        }
    }

    /**
     * Supprimer un statut liké
     */
    async deleteLikedStatus(userId, statusUrl) {
        try {
            const { error } = await this.supabase
                .from('liked_statuses')
                .delete()
                .eq('user_id', userId)
                .eq('status_url', statusUrl);

            if (error) throw error;
            this._clearCache('liked_statuses');
            return true;
        } catch (error) {
            console.error('Erreur deleteLikedStatus:', error);
            return false;
        }
    }

    /**
     * Obtenir les statistiques des statuts likés par utilisateur
     */
    async getLikedStatusStats(userId) {
        try {
            const { data, error } = await this.supabase
                .from('liked_statuses')
                .select('status_type, media_type')
                .eq('user_id', userId);

            if (error) throw error;

            const stats = {
                total: data.length,
                byPlatform: {},
                byType: {}
            };

            data.forEach(item => {
                stats.byPlatform[item.status_type] = (stats.byPlatform[item.status_type] || 0) + 1;
                stats.byType[item.media_type] = (stats.byType[item.media_type] || 0) + 1;
            });

            return stats;
        } catch (error) {
            console.error('Erreur getLikedStatusStats:', error);
            return { total: 0, byPlatform: {}, byType: {} };
        }
    }

    // ===== GESTION DES RAPPORTS DE BUGS =====

    /**
     * Créer un nouveau rapport de bug
     */
    async createBugReport(bugData) {
        try {
            const { data, error } = await this.supabase
                .from('bug_reports')
                .insert({
                    user_id: bugData.userId,
                    group_id: bugData.groupId || null,
                    title: bugData.title,
                    description: bugData.description,
                    steps_to_reproduce: bugData.stepsToReproduce || null,
                    expected_behavior: bugData.expectedBehavior || null,
                    actual_behavior: bugData.actualBehavior || null,
                    severity: bugData.severity || 'medium',
                    command_used: bugData.commandUsed || null,
                    error_message: bugData.errorMessage || null,
                    device_info: bugData.deviceInfo || {}
                })
                .select()
                .single();

            if (error) {
                if (error.message.includes('does not exist')) {
                    const tableError = new Error('TABLES_NOT_CREATED');
                    tableError.originalError = error;
                    throw tableError;
                }
                throw error;
            }
            
            this._clearCache('bug_reports');
            return data;
        } catch (error) {
            console.error('Erreur createBugReport:', error);
            throw error;
        }
    }

    /**
     * Obtenir tous les rapports de bugs (avec pagination)
     */
    async getBugReports(filters = {}, limit = 20, offset = 0) {
        try {
            let query = this.supabase
                .from('bug_reports')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.severity) {
                query = query.eq('severity', filters.severity);
            }
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Erreur getBugReports:', error);
            return [];
        }
    }

    /**
     * Mettre à jour le statut d'un rapport de bug
     */
    async updateBugReportStatus(bugId, status, assignedTo = null) {
        try {
            const updateData = { 
                status, 
                updated_at: new Date().toISOString() 
            };
            
            if (assignedTo) updateData.assigned_to = assignedTo;
            if (status === 'fixed' || status === 'closed') {
                updateData.resolved_at = new Date().toISOString();
            }

            const { data, error } = await this.supabase
                .from('bug_reports')
                .update(updateData)
                .eq('id', bugId)
                .select()
                .single();

            if (error) throw error;
            this._clearCache('bug_reports');
            return data;
        } catch (error) {
            console.error('Erreur updateBugReportStatus:', error);
            return null;
        }
    }

    // ===== GESTION DES SUGGESTIONS =====

    /**
     * Créer une nouvelle suggestion
     */
    async createSuggestion(suggestionData) {
        try {
            const { data, error } = await this.supabase
                .from('suggestions')
                .insert({
                    user_id: suggestionData.userId,
                    group_id: suggestionData.groupId || null,
                    title: suggestionData.title,
                    description: suggestionData.description,
                    category: suggestionData.category || 'general',
                    priority: suggestionData.priority || 'medium'
                })
                .select()
                .single();

            if (error) {
                if (error.message.includes('does not exist')) {
                    const tableError = new Error('TABLES_NOT_CREATED');
                    tableError.originalError = error;
                    throw tableError;
                }
                throw error;
            }
            
            this._clearCache('suggestions');
            return data;
        } catch (error) {
            console.error('Erreur createSuggestion:', error);
            throw error;
        }
    }

    /**
     * Obtenir toutes les suggestions (avec pagination)
     */
    async getSuggestions(filters = {}, limit = 20, offset = 0) {
        try {
            let query = this.supabase
                .from('suggestions')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.category) {
                query = query.eq('category', filters.category);
            }
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Erreur getSuggestions:', error);
            return [];
        }
    }

    /**
     * Voter pour une suggestion
     */
    async voteSuggestion(suggestionId, userId, voteType) {
        try {
            // Vérifier si l'utilisateur a déjà voté
            const { data: existingVote, error: checkError } = await this.supabase
                .from('suggestion_votes')
                .select('*')
                .eq('suggestion_id', suggestionId)
                .eq('user_id', userId)
                .single();

            if (checkError && checkError.code !== 'PGRST116') throw checkError;

            if (existingVote) {
                // Mettre à jour le vote existant
                const { error: updateError } = await this.supabase
                    .from('suggestion_votes')
                    .update({ vote_type: voteType, updated_at: new Date().toISOString() })
                    .eq('id', existingVote.id);

                if (updateError) throw updateError;
            } else {
                // Créer un nouveau vote
                const { error: insertError } = await this.supabase
                    .from('suggestion_votes')
                    .insert({
                        suggestion_id: suggestionId,
                        user_id: userId,
                        vote_type: voteType
                    });

                if (insertError) throw insertError;
            }

            // Mettre à jour les compteurs de votes dans la suggestion
            await this.updateSuggestionVoteCounts(suggestionId);
            
            this._clearCache('suggestions');
            this._clearCache('suggestion_votes');
            return true;
        } catch (error) {
            console.error('Erreur voteSuggestion:', error);
            return false;
        }
    }

    /**
     * Mettre à jour les compteurs de votes d'une suggestion
     */
    async updateSuggestionVoteCounts(suggestionId) {
        try {
            // Compter les votes positifs et négatifs
            const { data: votes, error } = await this.supabase
                .from('suggestion_votes')
                .select('vote_type')
                .eq('suggestion_id', suggestionId);

            if (error) throw error;

            const upvotes = votes.filter(v => v.vote_type === 'up').length;
            const downvotes = votes.filter(v => v.vote_type === 'down').length;

            // Mettre à jour la suggestion avec les nouveaux compteurs
            const { error: updateError } = await this.supabase
                .from('suggestions')
                .update({ 
                    votes: upvotes, 
                    downvotes: downvotes,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', suggestionId);

            if (updateError) throw updateError;
            return { upvotes, downvotes };
        } catch (error) {
            console.error('Erreur updateSuggestionVoteCounts:', error);
            return { upvotes: 0, downvotes: 0 };
        }
    }

    // ===== GESTION DES MAPPINGS DE JID =====

    /**
     * Créer ou mettre à jour un mapping de JID
     */
    async upsertJidMapping(mappingData) {
        try {
            // Essayer d'abord un insert, puis un update si conflit
            const { data: existingData, error: selectError } = await this.supabase
                .from('user_jid_mapping')
                .select('id')
                .eq('primary_jid', mappingData.primaryJid)
                .eq('group_jid', mappingData.groupJid || '')
                .single();

            let data, error;
            
            if (existingData) {
                // Mise à jour de l'enregistrement existant
                const result = await this.supabase
                    .from('user_jid_mapping')
                    .update({
                        phone_number: mappingData.phoneNumber || null,
                        verified: mappingData.verified || false,
                        verified_by: mappingData.verifiedBy || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingData.id)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            } else {
                // Insertion d'un nouveau mapping
                const result = await this.supabase
                    .from('user_jid_mapping')
                    .insert({
                        primary_jid: mappingData.primaryJid,
                        group_jid: mappingData.groupJid || null,
                        phone_number: mappingData.phoneNumber || null,
                        verified: mappingData.verified || false,
                        verified_by: mappingData.verifiedBy || null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            }

            if (error) throw error;
            this._clearCache('user_jid_mapping');
            return data;
        } catch (error) {
            console.error('Erreur upsertJidMapping:', error);
            throw error;
        }
    }

    /**
     * Utilitaire pour analyser et extraire correctement les JIDs et numéros de téléphone
     */
    parseJidInfo(jid) {
        if (!jid) return null;

        const result = {
            fullJid: jid,
            bareJid: null,
            phoneNumber: null,
            isPrivateJid: false,
            isGroupJid: false,
            jidType: 'unknown'
        };

        // JID privé format: numero@s.whatsapp.net
        if (jid.includes('@s.whatsapp.net')) {
            result.bareJid = jid.replace('@s.whatsapp.net', '');
            result.isPrivateJid = true;
            result.jidType = 'private';
            // Pour les JIDs privés, le bareJid EST le numéro de téléphone
            result.phoneNumber = result.bareJid;
        }
        // JID de groupe format: xxxx@g.us ou xxxx@lid
        else if (jid.includes('@g.us') || jid.includes('@lid')) {
            result.bareJid = jid.split('@')[0];
            result.isGroupJid = true;
            result.jidType = jid.includes('@g.us') ? 'group' : 'group_lid';
            // Pour les JIDs de groupe, il faut utiliser le mapping pour trouver le numéro
            result.phoneNumber = null; // À résoudre via mapping
        }
        // Autres formats
        else {
            result.bareJid = jid.split('@')[0];
            result.jidType = 'other';
        }

        return result;
    }

    /**
     * Extraire le numéro de téléphone réel à partir d'un JID (avec mapping si nécessaire)
     */
    async extractPhoneNumber(jid) {
        try {
            const jidInfo = this.parseJidInfo(jid);
            if (!jidInfo) return null;

            // Si c'est un JID privé, le numéro est directement dans le bareJid
            if (jidInfo.isPrivateJid) {
                return jidInfo.phoneNumber;
            }

            // Si c'est un JID de groupe, essayer de trouver le mapping
            if (jidInfo.isGroupJid) {
                const mapping = await this.findPrimaryJidFromGroup(jid);
                if (mapping && mapping.phone_number) {
                    return mapping.phone_number;
                }
                // Si aucun mapping, essayer de deviner depuis le primary_jid
                if (mapping && mapping.primary_jid) {
                    const primaryInfo = this.parseJidInfo(mapping.primary_jid);
                    if (primaryInfo && primaryInfo.phoneNumber) {
                        return primaryInfo.phoneNumber;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Erreur extractPhoneNumber:', error);
            return null;
        }
    }

    /**
     * Créer un mapping automatique entre JID de groupe et JID privé
     */
    async createJidMapping(groupJid, privateJid, phoneNumber = null) {
        try {
            // Extraire le numéro si non fourni
            if (!phoneNumber && privateJid) {
                const privateInfo = this.parseJidInfo(privateJid);
                phoneNumber = privateInfo?.phoneNumber;
            }

            const mappingData = {
                primaryJid: privateJid,
                groupJid: groupJid,
                phoneNumber: phoneNumber,
                verified: false,
                verifiedBy: 'auto_detection',
                created_at: new Date().toISOString()
            };

            return await this.upsertJidMapping(mappingData);
        } catch (error) {
            console.error('Erreur createJidMapping:', error);
            return null;
        }
    }

    /**
     * Trouver le JID principal à partir d'un JID de groupe
     */
    async findPrimaryJidFromGroup(groupJid) {
        try {
            const cacheKey = this._getCacheKey('user_jid_mapping', { groupJid });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const { data, error } = await this.supabase
                .from('user_jid_mapping')
                .select('*')
                .eq('group_jid', groupJid)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            
            const result = data || null;
            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Erreur findPrimaryJidFromGroup:', error);
            return null;
        }
    }

    /**
     * Trouver tous les JIDs associés à un JID principal
     */
    async findAssociatedJids(primaryJid) {
        try {
            const cacheKey = this._getCacheKey('user_jid_mapping', { primaryJid });
            const cached = this._getCache(cacheKey);
            if (cached) return cached;

            const { data, error } = await this.supabase
                .from('user_jid_mapping')
                .select('*')
                .eq('primary_jid', primaryJid);

            if (error) throw error;
            
            this._setCache(cacheKey, data || []);
            return data || [];
        } catch (error) {
            console.error('Erreur findAssociatedJids:', error);
            return [];
        }
    }

    /**
     * Résoudre un JID vers son JID principal (pour la vérification des permissions)
     */
    async resolveToUserJid(anyJid) {
        try {
            // Si c'est déjà un JID privé (format numéro@s.whatsapp.net), on le retourne tel quel
            if (anyJid.includes('@s.whatsapp.net')) {
                return anyJid;
            }

            // Si c'est un JID de groupe, chercher le mapping
            if (anyJid.includes('@lid') || (!anyJid.includes('@s.whatsapp.net') && !anyJid.includes('@g.us'))) {
                const mapping = await this.findPrimaryJidFromGroup(anyJid);
                if (mapping && mapping.primary_jid) {
                    return mapping.primary_jid;
                }
            }

            // Si aucun mapping trouvé, retourner le JID original
            return anyJid;
        } catch (error) {
            console.error('Erreur resolveToUserJid:', error);
            return anyJid;
        }
    }

    /**
     * S'assurer que les tables existent (tentative de création automatique)
     */
    async ensureTablesExist() {
        try {
            // This method logs table status but doesn't create tables
            // Tables should be created manually via Supabase dashboard or migrations
            const tablesToCheck = ['bug_reports', 'suggestions', 'suggestion_votes', 'user_jid_mapping'];
            
            for (const tableName of tablesToCheck) {
                const { data, error } = await this.supabase
                    .from(tableName)
                    .select('count', { count: 'exact', head: true });
                
                if (error && error.message.includes('does not exist')) {
                    console.log(`⚠️ Table '${tableName}' does not exist. Please create it manually in Supabase dashboard.`);
                    console.log(`📋 Schema for ${tableName} is defined in db/shared/schema.ts`);
                } else if (!error) {
                    console.log(`✅ Table '${tableName}' exists and is accessible`);
                }
            }
            
            return true;
        } catch (error) {
            console.log('⚠️ Error checking tables:', error.message);
            return false;
        }
    }
}

// Singleton instance
const db = new WabotDatabase();

module.exports = {
    db,
    WabotDatabase
};