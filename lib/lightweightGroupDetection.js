/**
 * Système de détection LÉGER et EFFICACE des groupes WhatsApp
 * 
 * Ce système fait EXACTEMENT ce qu'il faut :
 * - Détecter les types de groupes (communauté/normal/sous-groupe/annonces)
 * - Stocker SEULEMENT les informations essentielles
 * - Se déclencher aux bons moments (join/leave/connexion)
 * - Pas de spam API, pas de données inutiles
 */

const { supabaseBot } = require('./supabase');
// Import direct supabase client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

class LightweightGroupDetection {
    constructor(sock) {
        this.sock = sock;
        this.isDetecting = false;
    }

    /**
     * Détecte le type d'un groupe based sur ses métadonnées
     */
    detectGroupType(groupMetadata) {
        const { id, subject, desc, isCommunity, isCommunityAnnounce, linkedParent } = groupMetadata;

        // 1. Groupe d'annonces de communauté
        if (isCommunityAnnounce || (desc && desc.includes('Announcements'))) {
            return {
                type: 'announcement',
                communityId: linkedParent || null,
                isAnnouncement: true
            };
        }

        // 2. Communauté parente (avec sous-groupes)
        if (isCommunity) {
            return {
                type: 'community_parent',
                communityId: id,
                isAnnouncement: false
            };
        }

        // 3. Sous-groupe de communauté
        if (linkedParent) {
            return {
                type: 'subgroup',
                communityId: linkedParent,
                isAnnouncement: false
            };
        }

        // 4. Groupe normal standalone
        return {
            type: 'normal',
            communityId: null,
            isAnnouncement: false
        };
    }

    /**
     * Vérifie si le bot est admin dans un groupe
     */
    getBotStatus(groupMetadata) {
        const botJid = this.sock.user?.id;
        if (!botJid || !groupMetadata.participants) {
            return { isAdmin: false, isOwner: false };
        }

        const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
        if (!botParticipant) {
            return { isAdmin: false, isOwner: false };
        }

        const isOwner = botParticipant.admin === 'superadmin' || groupMetadata.owner === botJid;
        const isAdmin = botParticipant.admin === 'admin' || isOwner;

        return { isAdmin, isOwner };
    }

    /**
     * Scan initial rapide à la connexion - SEULEMENT les IDs et types
     */
    async quickScanAllGroups() {
        if (this.isDetecting) {
            console.log('🔍 Scan déjà en cours...');
            return;
        }

        try {
            this.isDetecting = true;
            console.log('🚀 [LÉGER] Scan rapide des groupes...');

            // Récupérer SEULEMENT la liste des groupes (pas les participants)
            const participating = await this.sock.groupFetchAllParticipating();
            const groupIds = Object.keys(participating).filter(id => id.endsWith('@g.us'));

            console.log(`📊 ${groupIds.length} groupes détectés`);

            const results = {
                normal: [],
                communities: [],
                announcements: [],
                subgroups: []
            };

            // Traiter chaque groupe de manière optimisée
            for (const groupId of groupIds) {
                try {
                    const groupInfo = participating[groupId];
                    
                    // Utiliser les données déjà disponibles dans participating
                    const basicInfo = {
                        id: groupId,
                        name: groupInfo.subject || 'Sans nom',
                        type: 'normal', // Par défaut
                        communityId: null,
                        isAnnouncement: false,
                        botIsAdmin: false
                    };

                    // Détection rapide du type sans métadonnées complètes
                    if (groupInfo.isCommunityAnnounce) {
                        basicInfo.type = 'announcement';
                        basicInfo.isAnnouncement = true;
                        basicInfo.communityId = groupInfo.linkedParent;
                        results.announcements.push(basicInfo);
                    } else if (groupInfo.isCommunity) {
                        basicInfo.type = 'community_parent';
                        basicInfo.communityId = groupId;
                        results.communities.push(basicInfo);
                    } else if (groupInfo.linkedParent) {
                        basicInfo.type = 'subgroup';
                        basicInfo.communityId = groupInfo.linkedParent;
                        results.subgroups.push(basicInfo);
                    } else {
                        results.normal.push(basicInfo);
                    }

                    // Stocker dans la DB (utilise la table existante pour l'instant)
                    await this.saveGroupMinimal(basicInfo);

                } catch (error) {
                    console.error(`❌ Erreur traitement groupe ${groupId}:`, error.message);
                }
            }

            console.log('✅ [LÉGER] Scan terminé :');
            console.log(`📱 ${results.normal.length} groupes normaux`);
            console.log(`🏘️ ${results.communities.length} communautés`);
            console.log(`📢 ${results.announcements.length} groupes d'annonces`);
            console.log(`🔗 ${results.subgroups.length} sous-groupes`);

            return results;

        } catch (error) {
            console.error('❌ [LÉGER] Erreur scan groupes:', error);
            throw error;
        } finally {
            this.isDetecting = false;
        }
    }

    /**
     * Détection détaillée pour UN groupe spécifique (quand nécessaire)
     */
    async analyzeSpecificGroup(groupId) {
        try {
            console.log(`🔍 [LÉGER] Analyse détaillée: ${groupId}`);

            // Récupérer les métadonnées complètes SEULEMENT pour ce groupe
            const metadata = await this.sock.groupMetadata(groupId);
            
            // Détecter le type avec précision
            const typeInfo = this.detectGroupType(metadata);
            const botStatus = this.getBotStatus(metadata);

            const groupInfo = {
                id: groupId,
                name: metadata.subject || 'Sans nom',
                type: typeInfo.type,
                communityId: typeInfo.communityId,
                isAnnouncement: typeInfo.isAnnouncement,
                botIsAdmin: botStatus.isAdmin,
                botIsOwner: botStatus.isOwner,
                description: metadata.desc || null,
                memberCount: metadata.participants?.length || 0
            };

            // Mise à jour en DB
            await this.saveGroupMinimal(groupInfo);

            return groupInfo;

        } catch (error) {
            console.error(`❌ [LÉGER] Erreur analyse ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Sauvegarde minimale en DB (utilise la table existante pour l'instant)
     */
    async saveGroupMinimal(groupInfo) {
        try {
            const groupData = {
                group_id: groupInfo.id,
                group_name: groupInfo.name,
                group_type: groupInfo.type,
                bot_is_admin: groupInfo.botIsAdmin || false,
                bot_is_owner: groupInfo.botIsOwner || false,
                participant_count: groupInfo.memberCount || 0,
                last_sync_date: new Date().toISOString(),
                // Pour l'instant, stocker dans group_description les infos spéciales
                group_description: `TYPE:${groupInfo.type}|COMM:${groupInfo.communityId || 'none'}|ANN:${groupInfo.isAnnouncement}`
            };

            const { error } = await supabase
                .from('bot_groups')
                .upsert(groupData, { onConflict: 'group_id' });

            if (error) {
                console.error(`❌ Erreur sauvegarde ${groupInfo.id}:`, error);
            } else {
                console.log(`✅ Groupe sauvegardé: ${groupInfo.name} (${groupInfo.type})`);
            }

        } catch (error) {
            console.error(`❌ Erreur sauvegarde DB:`, error);
        }
    }

    /**
     * Handler pour quand le bot rejoint un groupe
     */
    async onBotJoinedGroup(groupId) {
        console.log(`🆕 [LÉGER] Bot ajouté au groupe: ${groupId}`);
        
        // Analyse détaillée du nouveau groupe
        const groupInfo = await this.analyzeSpecificGroup(groupId);
        
        // Si c'est une communauté, identifier le groupe d'annonces
        if (groupInfo.type === 'community_parent') {
            await this.findAnnouncementGroup(groupId);
        }
        
        return groupInfo;
    }

    /**
     * Handler pour quand le bot quitte un groupe
     */
    async onBotLeftGroup(groupId) {
        console.log(`👋 [LÉGER] Bot retiré du groupe: ${groupId}`);
        
        try {
            // Supprimer de la DB
            const { error } = await supabase
                .from('bot_groups')
                .delete()
                .eq('group_id', groupId);

            if (error) {
                console.error(`❌ Erreur suppression ${groupId}:`, error);
            } else {
                console.log(`✅ Groupe supprimé de la DB: ${groupId}`);
            }

        } catch (error) {
            console.error(`❌ Erreur suppression DB:`, error);
        }
    }

    /**
     * Trouve le groupe d'annonces d'une communauté
     */
    async findAnnouncementGroup(communityId) {
        try {
            console.log(`📢 [LÉGER] Recherche groupe d'annonces pour: ${communityId}`);

            // Récupérer tous les groupes de cette communauté
            const { data: communityGroups, error } = await supabase
                .from('bot_groups')
                .select('*')
                .like('group_description', `%COMM:${communityId}%`);

            if (error) {
                console.error(`❌ Erreur recherche groupes communauté:`, error);
                return null;
            }

            // Trouver le groupe d'annonces
            const announcementGroup = communityGroups?.find(g => g.group_description?.includes('ANN:true'));
            
            if (announcementGroup) {
                console.log(`📢 Groupe d'annonces trouvé: ${announcementGroup.group_name}`);
                return announcementGroup.group_id;
            } else {
                console.log(`⚠️ Aucun groupe d'annonces trouvé pour la communauté`);
                return null;
            }

        } catch (error) {
            console.error(`❌ Erreur recherche annonces:`, error);
            return null;
        }
    }

    /**
     * Récupère tous les groupes d'annonces où le bot est admin
     */
    async getAnnouncementGroupsWhereAdmin() {
        try {
            const { data: announcementGroups, error } = await supabase
                .from('bot_groups')
                .select('*')
                .like('group_description', '%ANN:true%')
                .eq('bot_is_admin', true);

            if (error) {
                console.error(`❌ Erreur récupération groupes d'annonces:`, error);
                return [];
            }

            console.log(`📢 ${announcementGroups?.length || 0} groupes d'annonces où le bot est admin`);
            return announcementGroups || [];

        } catch (error) {
            console.error(`❌ Erreur récupération annonces:`, error);
            return [];
        }
    }
}

module.exports = { LightweightGroupDetection };