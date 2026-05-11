/**
 * SERVICE DE SYNCHRONISATION DES GROUPES WHATSAPP
 * 
 * Flux de données:
 * 1. WhatsApp (live) → Récupération des métadonnées complètes
 * 2. Base de données → Sauvegarde des données structurées
 * 3. API → Sert depuis la DB avec fallback WhatsApp si nécessaire
 * 4. Images → Mises en cache dans metadata.profile_picture_url lors de la synchronisation
 * 
 * Gestion des cas:
 * - Bot connecté: Données fraîches depuis WhatsApp
 * - Bot déconnecté: Données depuis DB (avec indicateur obsolète)
 * - Synchronisation automatique toutes les 5 minutes pour les groupes actifs
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { transport: ws }
    })
    : null;

class GroupSyncService {
    constructor(sock) {
        this.sock = sock;
        this.isSyncing = false;
        this.syncInterval = null;
        this.lastSync = new Map(); // groupId -> timestamp
    }

    /**
     * Vérifie si le bot est connecté à WhatsApp
     */
    isConnected() {
        return this.sock && this.sock.user;
    }

    /**
     * Récupère les métadonnées COMPLÈTES d'un groupe depuis WhatsApp
     */
    async fetchGroupMetadataFromWhatsApp(groupId) {
        if (!this.isConnected()) {
            throw new Error('Bot WhatsApp non connecté');
        }

        try {
            const metadata = await this.sock.groupMetadata(groupId);
            
            // Extraire les informations importantes
            const botJid = this.sock.user.id;
            const botParticipant = metadata.participants.find(p => p.id === botJid);
            
            const isAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            const isOwner = botParticipant?.admin === 'superadmin' || metadata.owner === botJid;
            
            // Compter les admins
            const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
            const owners = metadata.participants.filter(p => p.admin === 'superadmin');

            // Identifier le propriétaire du groupe
            const ownerParticipant = metadata.participants.find(p => p.id === metadata.owner);
            const ownerPhone = ownerParticipant ? this.extractPhoneNumber(ownerParticipant.id) : null;

            // Liste des numéros des admins
            const adminPhones = admins.map(a => this.extractPhoneNumber(a.id)).filter(p => p);

            return {
                group_id: groupId,
                group_name: metadata.subject || 'Sans nom',
                group_description: metadata.desc || '',
                participant_count: metadata.participants.length,
                admin_count: admins.length,
                owner_count: owners.length,
                is_bot_admin: isAdmin,
                bot_is_owner: isOwner,
                is_active: true,
                group_creation_date: metadata.creation ? new Date(metadata.creation * 1000).toISOString() : null,
                owner_whatsapp_number: ownerPhone,
                admin_whatsapp_numbers: adminPhones,
                is_community: metadata.isCommunity || false,
                is_parent: metadata.isCommunity || false,
                community_id: metadata.linkedParent || null,
                metadata: {
                    announce: metadata.announce || false,
                    restrict: metadata.restrict || false,
                    ephemeralDuration: metadata.ephemeralDuration || null,
                    isCommunityAnnounce: metadata.isCommunityAnnounce || false,
                    participants: metadata.participants.map(p => ({
                        id: p.id,
                        admin: p.admin || null,
                        phone: this.extractPhoneNumber(p.id)
                    }))
                }
            };
        } catch (error) {
            console.error(`❌ Erreur récupération métadonnées WhatsApp pour ${groupId}:`, error.message);
            throw error;
        }
    }

    /**
     * Extrait le numéro de téléphone depuis un JID WhatsApp
     */
    extractPhoneNumber(jid) {
        if (!jid) return null;
        
        // Format: 1234567890@s.whatsapp.net → 1234567890
        const match = jid.match(/^(\d+)@/);
        if (match) {
            const number = match[1];
            return number.length > 10 ? `+${number}` : number;
        }
        return null;
    }

    /**
     * Sauvegarde ou met à jour un groupe en DB avec toutes les données
     */
    async saveGroupToDB(groupData) {
        try {
            const dataToSave = {
                group_id: groupData.group_id,
                group_name: groupData.group_name,
                group_description: groupData.group_description,
                group_type: 'GROUP',
                participant_count: groupData.participant_count || 0,
                admin_count: groupData.admin_count || 0,
                owner_count: groupData.owner_count || 0,
                is_bot_admin: groupData.is_bot_admin || false,
                bot_is_owner: groupData.bot_is_owner || false,
                is_active: groupData.is_active !== false,
                is_community: groupData.is_community || false,
                is_parent: groupData.is_parent || false,
                community_id: groupData.community_id || null,
                group_creation_date: groupData.group_creation_date,
                owner_whatsapp_number: groupData.owner_whatsapp_number,
                admin_whatsapp_numbers: groupData.admin_whatsapp_numbers || [],
                metadata: {
                    ...(groupData.metadata || {}),
                    last_synced_at: new Date().toISOString(),
                    sync_status: 'synced'
                },
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('bot_groups')
                .upsert(dataToSave, { onConflict: 'group_id' })
                .select()
                .single();

            if (error) {
                console.error(`❌ Erreur sauvegarde groupe ${groupData.group_id}:`, error);
                throw error;
            }

            console.log(`✅ Groupe synchronisé: ${groupData.group_name} (${groupData.participant_count} membres)`);
            this.lastSync.set(groupData.group_id, Date.now());
            
            return data;
        } catch (error) {
            console.error(`❌ Erreur saveGroupToDB:`, error);
            throw error;
        }
    }

    /**
     * Synchronise UN groupe spécifique (WhatsApp → DB)
     */
    async syncGroup(groupId) {
        try {
            console.log(`🔄 Synchronisation du groupe: ${groupId}`);
            
            // 1. Récupérer les données depuis WhatsApp
            const whatsappData = await this.fetchGroupMetadataFromWhatsApp(groupId);
            
            // 2. Sauvegarder en DB
            const savedData = await this.saveGroupToDB(whatsappData);
            
            // 3. Récupérer et mettre en cache l'image du groupe
            try {
                const profilePictureUrl = await this.sock.profilePictureUrl(groupId, 'image');
                
                if (profilePictureUrl && savedData) {
                    const updatedMetadata = {
                        ...(savedData.metadata || {}),
                        profile_picture_url: profilePictureUrl,
                        profile_picture_updated_at: new Date().toISOString()
                    };
                    
                    await supabase
                        .from('bot_groups')
                        .update({ metadata: updatedMetadata })
                        .eq('group_id', groupId);
                    
                    console.log(`📸 Image du groupe mise en cache`);
                }
            } catch (imageError) {
                console.log(`⚠️  Impossible de récupérer l'image du groupe (normal si pas d'image)`);
            }
            
            return savedData;
        } catch (error) {
            console.error(`❌ Erreur syncGroup ${groupId}:`, error.message);
            
            // Si le bot n'est pas membre, marquer le groupe comme inactif
            if (error.message.includes('not-authorized') || error.message.includes('forbidden')) {
                await supabase
                    .from('bot_groups')
                    .update({
                        is_active: false,
                        metadata: {
                            sync_status: 'bot_not_member',
                            last_error: error.message,
                            last_sync_attempt: new Date().toISOString()
                        }
                    })
                    .eq('group_id', groupId);
            }
            
            throw error;
        }
    }

    /**
     * Synchronise TOUS les groupes où le bot est membre
     */
    async syncAllGroups() {
        if (this.isSyncing) {
            console.log('⏳ Synchronisation déjà en cours...');
            return;
        }

        if (!this.isConnected()) {
            console.log('⚠️  Bot WhatsApp non connecté - synchronisation annulée');
            return;
        }

        try {
            this.isSyncing = true;
            console.log('🔄 Début synchronisation de tous les groupes...');

            // Récupérer tous les groupes où le bot est membre
            const participating = await this.sock.groupFetchAllParticipating();
            const groupIds = Object.keys(participating).filter(id => id.endsWith('@g.us'));

            console.log(`📊 ${groupIds.length} groupes détectés`);

            let synced = 0;
            let errors = 0;

            // Synchroniser chaque groupe
            for (const groupId of groupIds) {
                try {
                    await this.syncGroup(groupId);
                    synced++;
                } catch (error) {
                    errors++;
                    console.error(`❌ Échec sync ${groupId}:`, error.message);
                }
            }

            console.log(`✅ Synchronisation terminée: ${synced} réussis, ${errors} échecs`);
            return { synced, errors, total: groupIds.length };

        } catch (error) {
            console.error('❌ Erreur syncAllGroups:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Synchronisation périodique automatique
     */
    startAutoSync(intervalMinutes = 5) {
        if (this.syncInterval) {
            console.log('⚠️  Auto-sync déjà actif');
            return;
        }

        console.log(`🔄 Démarrage auto-sync toutes les ${intervalMinutes} minutes`);

        // Première synchronisation immédiate
        this.syncAllGroups().catch(err => 
            console.error('Erreur sync initial:', err.message)
        );

        // Synchronisation périodique
        this.syncInterval = setInterval(() => {
            if (this.isConnected()) {
                this.syncAllGroups().catch(err => 
                    console.error('Erreur sync périodique:', err.message)
                );
            } else {
                console.log('⏭️  Auto-sync ignoré - bot déconnecté');
            }
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Arrête la synchronisation automatique
     */
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏹️  Auto-sync arrêté');
        }
    }

    /**
     * Récupère les données d'un groupe (DB avec fallback WhatsApp si nécessaire)
     */
    async getGroupData(groupId, forceWhatsApp = false) {
        try {
            // 1. Essayer depuis la DB d'abord (sauf si forceWhatsApp)
            if (!forceWhatsApp) {
                const { data: dbGroup, error } = await supabase
                    .from('bot_groups')
                    .select('*')
                    .eq('group_id', groupId)
                    .single();

                if (!error && dbGroup) {
                    const lastSync = dbGroup.metadata?.last_synced_at;
                    const syncAge = lastSync ? Date.now() - new Date(lastSync).getTime() : null;
                    
                    // Si les données ont moins de 10 minutes, les utiliser
                    if (syncAge && syncAge < 10 * 60 * 1000) {
                        return {
                            ...dbGroup,
                            source: 'database',
                            data_age_minutes: Math.floor(syncAge / 60000)
                        };
                    }
                }
            }

            // 2. Récupérer depuis WhatsApp si nécessaire
            if (this.isConnected()) {
                const whatsappData = await this.fetchGroupMetadataFromWhatsApp(groupId);
                await this.saveGroupToDB(whatsappData);
                
                return {
                    ...whatsappData,
                    source: 'whatsapp',
                    data_age_minutes: 0
                };
            }

            // 3. Fallback sur les données DB même si obsolètes
            const { data: dbGroup } = await supabase
                .from('bot_groups')
                .select('*')
                .eq('group_id', groupId)
                .single();

            if (dbGroup) {
                const lastSync = dbGroup.metadata?.last_synced_at;
                const syncAge = lastSync ? Date.now() - new Date(lastSync).getTime() : null;
                
                return {
                    ...dbGroup,
                    source: 'database_stale',
                    data_age_minutes: syncAge ? Math.floor(syncAge / 60000) : null,
                    warning: 'Bot déconnecté - données potentiellement obsolètes'
                };
            }

            throw new Error('Groupe non trouvé');

        } catch (error) {
            console.error(`❌ Erreur getGroupData ${groupId}:`, error.message);
            throw error;
        }
    }

    /**
     * Handler pour quand le bot rejoint un groupe
     */
    async onGroupJoined(groupId) {
        console.log(`🆕 Bot ajouté au groupe: ${groupId}`);
        
        try {
            // Synchroniser immédiatement
            await this.syncGroup(groupId);
        } catch (error) {
            console.error(`❌ Erreur onGroupJoined:`, error.message);
        }
    }

    /**
     * Handler pour quand le bot quitte un groupe
     */
    async onGroupLeft(groupId) {
        console.log(`👋 Bot retiré du groupe: ${groupId}`);
        
        try {
            // Marquer comme inactif au lieu de supprimer
            await supabase
                .from('bot_groups')
                .update({
                    is_active: false,
                    metadata: {
                        sync_status: 'bot_left',
                        left_at: new Date().toISOString()
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('group_id', groupId);
            
            console.log(`✅ Groupe marqué comme inactif: ${groupId}`);
        } catch (error) {
            console.error(`❌ Erreur onGroupLeft:`, error.message);
        }
    }

    /**
     * Handler pour les mises à jour de groupe (nom, description, etc.)
     */
    async onGroupUpdate(updates) {
        for (const update of updates) {
            try {
                console.log(`🔄 Mise à jour groupe: ${update.id}`);
                
                // Re-synchroniser le groupe
                await this.syncGroup(update.id);
            } catch (error) {
                console.error(`❌ Erreur onGroupUpdate:`, error.message);
            }
        }
    }

    /**
     * Handler pour les changements de participants
     */
    async onParticipantsUpdate(update) {
        try {
            console.log(`👥 Changement participants dans ${update.id}`);
            
            // Re-synchroniser pour mettre à jour le compte
            await this.syncGroup(update.id);
        } catch (error) {
            console.error(`❌ Erreur onParticipantsUpdate:`, error.message);
        }
    }
}

module.exports = { GroupSyncService };
