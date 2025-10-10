/**
 * Système de détection automatique des groupes et communautés WhatsApp
 * 
 * Ce système permet de:
 * - Détecter tous les groupes où le bot est présent
 * - Identifier si le bot est admin/owner
 * - Récupérer la liste des participants avec leurs infos
 * - Détecter les communautés WhatsApp
 * - Mettre à jour automatiquement les données
 */

const { db } = require('./database');
const { countryDetector } = require('./countryDetection');
const { UserProfileSystem } = require('./userProfileSystem');

class GroupDetectionSystem {
    constructor(sock) {
        this.sock = sock;
        this.isDetecting = false;
        this.lastDetection = null;
        this.detectionInterval = 30 * 60 * 1000; // 30 minutes (fallback)
        this.lastEventTime = Date.now();
        this.pendingUpdates = new Set();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        
        // Initialiser le système de profils utilisateurs
        this.userProfileSystem = new UserProfileSystem(sock);
    }

    /**
     * Vérifier si la connexion WhatsApp est stable
     */
    async isConnectionStable() {
        try {
            // Vérifier si le socket est connecté
            if (!this.sock.user || !this.sock.user.id) {
                console.log('⚠️ Socket pas connecté - user info manquante');
                return false;
            }

            // Test simple de connectivité
            const testStart = Date.now();
            try {
                await Promise.race([
                    this.sock.presenceSubscribe(this.sock.user.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                ]);
                const testTime = Date.now() - testStart;
                
                if (testTime > 3000) {
                    console.log(`⚠️ Connexion lente: ${testTime}ms`);
                    return false;
                }
                
                return true;
            } catch (error) {
                console.log(`⚠️ Test de connectivité échoué: ${error.message}`);
                return false;
            }
        } catch (error) {
            console.log(`⚠️ Erreur test de connexion: ${error.message}`);
            return false;
        }
    }

    /**
     * Détecte tous les groupes où le bot est présent
     */
    async detectAllGroups() {
        if (this.isDetecting) {
            console.log('⚠️ Détection déjà en cours...');
            return;
        }

        try {
            this.isDetecting = true;
            console.log('🔍 Début de la détection des groupes...');

            // 🔧 NOUVEAU: Vérifier la stabilité de la connexion
            const isStable = await this.isConnectionStable();
            if (!isStable) {
                console.log('⚠️ Connexion instable - report de la détection');
                throw new Error('Connection not stable');
            }

            // 🔧 AMÉLIORATION 1: Multiple méthodes de détection avec retry
            let participating = {};
            let chats = [];
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`📊 Tentative ${attempt}/3: groupFetchAllParticipating()`);
                    
                    // Vérifier la connexion avant chaque tentative
                    if (attempt > 1) {
                        const stillStable = await this.isConnectionStable();
                        if (!stillStable) {
                            console.log(`⚠️ Connexion instable à la tentative ${attempt}`);
                            await this.sleep(5000 * attempt); // Attente progressive
                            continue;
                        }
                    }
                    
                    // Essayer avec timeout
                    participating = await Promise.race([
                        this.sock.groupFetchAllParticipating(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout groupFetchAllParticipating')), 10000)
                        )
                    ]);
                    
                    chats = Object.keys(participating).filter(id => id.endsWith('@g.us'));
                    console.log(`📊 Méthode principale: ${chats.length} groupes détectés`);
                    break; // Succès, sortir de la boucle
                    
                } catch (error) {
                    console.warn(`❌ Tentative ${attempt}/3 échouée:`, error.message);
                    
                    if (attempt === 3) {
                        console.warn('❌ Toutes les tentatives groupFetchAllParticipating ont échoué');
                    } else {
                        await this.sleep(3000 * attempt); // Attente progressive: 3s, 6s
                    }
                }
            }

            // 🔧 AMÉLIORATION 2: Méthode alternative via store
            if (chats.length === 0) {
                try {
                    const storeChats = this.sock.chats || {};
                    const storeChatIds = Object.keys(storeChats).filter(id => id.endsWith('@g.us'));
                    console.log(`📊 Méthode alternative (store): ${storeChatIds.length} groupes détectés`);
                    chats = storeChatIds;
                } catch (error) {
                    console.warn('❌ Méthode store échouée:', error.message);
                }
            }

            // 🔧 AMÉLIORATION 3: Attendre si aucun groupe trouvé (connexion récente)
            if (chats.length === 0) {
                console.log('⏳ Aucun groupe trouvé, attente de synchronisation (30s)...');
                await this.sleep(30000); // Attendre 30 secondes
                
                // Vérifier la connexion après l'attente
                const stillConnected = await this.isConnectionStable();
                if (!stillConnected) {
                    console.log('❌ Connexion perdue pendant l\'attente');
                    throw new Error('Connection lost during wait');
                }
                
                try {
                    participating = await Promise.race([
                        this.sock.groupFetchAllParticipating(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout après attente')), 10000)
                        )
                    ]);
                    chats = Object.keys(participating).filter(id => id.endsWith('@g.us'));
                    console.log(`📊 Après attente: ${chats.length} groupes détectés`);
                } catch (error) {
                    console.warn('❌ Détection après attente échouée:', error.message);
                }
            }

            const results = {
                groups: [],
                communities: [],
                errors: []
            };

            for (const chatId of chats) {
                try {
                    // Utiliser processGroupWithRetry au lieu de processGroup directement
                    await this.processGroupWithRetry(chatId, results);
                    
                    // Créer automatiquement les mappings JID pour ce groupe
                    await this.createGroupJidMappings(chatId);
                    
                    // Délai pour éviter le spam
                    await this.sleep(1000);
                } catch (error) {
                    this.logError(`Erreur traitement groupe ${chatId}`, error);
                    results.errors.push({ chatId, error: error.message });
                }
            }

            // 🔍 NOUVELLE ANALYSE AVANCÉE DES COMMUNAUTÉS
            console.log('🔍 Analyse avancée des communautés...');
            const allGroupsData = [...results.groups, ...results.communities];
            const detectedCommunities = await this.analyzeCommunityStructure(allGroupsData);
            
            // Réassigner les groupes selon la nouvelle analyse
            results.communities = [];
            results.groups = [];
            
            for (const [mainGroupId, communityData] of detectedCommunities) {
                // Marquer le groupe principal comme communauté
                const mainGroup = allGroupsData.find(g => g.group_id === mainGroupId);
                if (mainGroup) {
                    mainGroup.group_type = 'community';
                    mainGroup.is_community_main = true;
                    mainGroup.community_groups_count = communityData.relatedGroups.length;
                    results.communities.push(mainGroup);
                    
                    // Marquer les groupes liés
                    for (const relatedGroup of communityData.relatedGroups) {
                        if (relatedGroup.group_id !== mainGroupId) {
                            relatedGroup.group_type = 'community_linked';
                            relatedGroup.community_main_group = mainGroupId;
                            results.communities.push(relatedGroup);
                        }
                    }
                }
            }
            
            // Les groupes restants sont des groupes normaux
            for (const groupData of allGroupsData) {
                if (!results.communities.find(c => c.group_id === groupData.group_id)) {
                    results.groups.push(groupData);
                }
            }

            this.lastDetection = new Date();
            this.logSuccess(`Détection terminée: ${results.groups.length} groupes, ${results.communities.length} communautés`);
            this.logInfo(`🏘️ ${detectedCommunities.size} structures de communautés identifiées`);
            
            // Reset pending updates après détection réussie
            this.pendingUpdates.clear();
            
            // 📢 PHASE 3: Identification des groupes d'annonces de communautés
            console.log('📢 Phase 3: Identification des groupes d\'annonces...');
            try {
                const announcementGroups = await this.identifyAnnouncementGroups();
                console.log(`📢 ${announcementGroups.length} groupes d'annonces identifiés pour envoi futur`);
                results.announcementGroups = announcementGroups;
            } catch (error) {
                console.error('❌ Erreur identification groupes annonces:', error.message);
                results.announcementGroups = [];
            }
            
            return results;

        } catch (error) {
            console.error('❌ Erreur détection globale:', error);
            throw error;
        } finally {
            this.isDetecting = false;
        }
    }

    /**
     * 🔍 NOUVELLES MÉTHODES POUR ANALYSES DÉTAILLÉES
     */
    
    /**
     * Analyse tous les groupes pour identifier les communautés
     * 🔧 AMÉLIORATION: Analyse plus approfondie pour détecter vraies communautés
     */
    async analyzeCommunityStructure(allGroups) {
        const communities = new Map();
        const announcementGroups = [];
        const regularGroups = [];
        
        console.log(`🔍 Analyse de ${allGroups.length} groupes pour détecter les communautés...`);
        
        for (const group of allGroups) {
            // 🔧 FIX: Identifier les groupes d'annonces avec plus de critères
            const isAnnouncement = (
                group.metadata?.announce === true ||
                group.settings?.announce_mode === true ||
                (group.group_name && (
                    group.group_name.toLowerCase().includes('annonce') ||
                    group.group_name.toLowerCase().includes('announcement') ||
                    group.group_name.toLowerCase().includes('info') ||
                    group.group_name.toLowerCase().includes('règles') ||
                    group.group_name.toLowerCase().includes('rules')
                ))
            );
            
            if (isAnnouncement) {
                announcementGroups.push(group);
                console.log(`📢 Groupe d'annonces détecté: ${group.group_name}`);
            } else {
                regularGroups.push(group);
            }
        }
        
        console.log(`📊 Trouvé ${announcementGroups.length} groupes d'annonces et ${regularGroups.length} groupes réguliers`);
        
        // 🔧 AMÉLIORATION: Analyser même sans groupes d'annonces explicites
        if (announcementGroups.length === 0 && allGroups.length > 2) {
            console.log(`🔍 Aucun groupe d'annonces explicite trouvé - analyse par similarité`);
            
            // Chercher des groupes avec des noms similaires ou admins communs
            const groupSimilarities = await this.calculateGroupSimilarities(allGroups);
            
            for (const similarity of groupSimilarities) {
                if (similarity.relatedGroups.length >= 3) { // 3+ groupes = probable communauté
                    communities.set(similarity.mainGroup.group_id, {
                        mainGroup: similarity.mainGroup,
                        relatedGroups: similarity.relatedGroups,
                        totalParticipants: similarity.relatedGroups.reduce((sum, g) => sum + (g.participant_count || 0), 0),
                        detectionMethod: 'similarity_analysis'
                    });
                    console.log(`🏘️ Communauté détectée par similarité: ${similarity.mainGroup.group_name} avec ${similarity.relatedGroups.length} groupes`);
                }
            }
        } else {
            // Méthode classique : pour chaque groupe d'annonces, chercher les groupes liés
            for (const announcementGroup of announcementGroups) {
                const communityGroups = await this.findRelatedGroups(announcementGroup, allGroups);
                
                if (communityGroups.length > 1) { // Au moins 2 groupes = communauté probable
                    communities.set(announcementGroup.group_id, {
                        mainGroup: announcementGroup,
                        relatedGroups: communityGroups,
                        totalParticipants: communityGroups.reduce((sum, g) => sum + (g.participant_count || 0), 0),
                        detectionMethod: 'announcement_based'
                    });
                    console.log(`🏘️ Communauté détectée (annonces): ${announcementGroup.group_name} avec ${communityGroups.length} groupes`);
                }
            }
        }
        
        console.log(`✅ ${communities.size} structures de communautés identifiées`);
        return communities;
    }
    
    /**
     * Trouve les groupes liés à un groupe d'annonces
     * 🔧 AMÉLIORATION: Critères de liaison plus précis
     */
    async findRelatedGroups(announcementGroup, allGroups) {
        const related = [announcementGroup];
        const announcementName = announcementGroup.group_name?.toLowerCase() || '';
        const announcementAdmins = announcementGroup.admin_whatsapp_numbers || [];
        
        for (const group of allGroups) {
            if (group.group_id === announcementGroup.group_id) continue;
            
            let score = 0;
            const reasons = [];
            
            // 1. Admins en commun (score élevé)
            const commonAdmins = (group.admin_whatsapp_numbers || []).filter(admin => 
                announcementAdmins.includes(admin)
            );
            if (commonAdmins.length >= 2) {
                score += 50;
                reasons.push(`${commonAdmins.length} admins communs`);
            } else if (commonAdmins.length >= 1) {
                score += 25;
                reasons.push(`1 admin commun`);
            }
            
            // 2. Nom similaire ou contient le nom de base
            const groupName = group.group_name?.toLowerCase() || '';
            const nameSimilarity = this.calculateNameSimilarity(announcementName, groupName);
            if (nameSimilarity > 0.6) {
                score += 40;
                reasons.push(`nom très similaire (${Math.round(nameSimilarity * 100)}%)`);
            } else if (nameSimilarity > 0.3) {
                score += 20;
                reasons.push(`nom similaire (${Math.round(nameSimilarity * 100)}%)`);
            }
            
            // 3. Proximité temporelle de création
            const timeDiff = Math.abs(
                new Date(group.group_creation_date || 0) - 
                new Date(announcementGroup.group_creation_date || 0)
            );
            const isCreatedNearSameTime = timeDiff < (30 * 24 * 60 * 60 * 1000); // 30 jours
            if (isCreatedNearSameTime) {
                score += 15;
                reasons.push('créé proche dans le temps');
            }
            
            // 4. 🔧 NOUVEAU: Participants en commun
            const commonParticipants = this.countCommonParticipants(announcementGroup, group);
            if (commonParticipants > 5) {
                score += 30;
                reasons.push(`${commonParticipants} participants communs`);
            } else if (commonParticipants > 2) {
                score += 15;
                reasons.push(`${commonParticipants} participants communs`);
            }
            
            // 🔧 FIX: Seuil d'acceptation à 40 points au lieu de conditions strictes
            if (score >= 40) {
                related.push(group);
                console.log(`🔗 Groupe lié détecté: ${group.group_name} (score: ${score}, raisons: ${reasons.join(', ')})`);
            }
        }
        
        return related;
    }
    
    /**
     * 🔧 NOUVELLE MÉTHODE: Calculer les similarités entre tous les groupes
     */
    async calculateGroupSimilarities(allGroups) {
        const similarities = [];
        
        for (let i = 0; i < allGroups.length; i++) {
            const mainGroup = allGroups[i];
            const relatedGroups = [mainGroup];
            
            for (let j = 0; j < allGroups.length; j++) {
                if (i === j) continue;
                
                const otherGroup = allGroups[j];
                let score = 0;
                
                // Admins en commun
                const commonAdmins = this.getCommonAdmins(mainGroup, otherGroup);
                if (commonAdmins.length >= 2) score += 50;
                else if (commonAdmins.length >= 1) score += 25;
                
                // Nom similaire
                const nameSimilarity = this.calculateNameSimilarity(
                    mainGroup.group_name?.toLowerCase() || '',
                    otherGroup.group_name?.toLowerCase() || ''
                );
                if (nameSimilarity > 0.5) score += 40;
                else if (nameSimilarity > 0.3) score += 20;
                
                // Participants en commun
                const commonParticipants = this.countCommonParticipants(mainGroup, otherGroup);
                if (commonParticipants > 10) score += 30;
                else if (commonParticipants > 5) score += 15;
                
                if (score >= 50) { // Seuil plus élevé pour cette méthode
                    relatedGroups.push(otherGroup);
                }
            }
            
            if (relatedGroups.length > 1) {
                similarities.push({
                    mainGroup: mainGroup,
                    relatedGroups: relatedGroups,
                    score: relatedGroups.length * 10 // Score basé sur le nombre de groupes liés
                });
            }
        }
        
        // Trier par score décroissant et retourner les meilleurs
        return similarities.sort((a, b) => b.score - a.score).slice(0, 3);
    }
    
    /**
     * 🔧 MÉTHODES UTILITAIRES POUR L'ANALYSE COMMUNAUTAIRE
     */
    getCommonAdmins(group1, group2) {
        const admins1 = group1.admin_whatsapp_numbers || [];
        const admins2 = group2.admin_whatsapp_numbers || [];
        return admins1.filter(admin => admins2.includes(admin));
    }
    
    countCommonParticipants(group1, group2) {
        // Pour l'instant, estimation basée sur la taille des groupes
        // TODO: Implémenter comparaison réelle des participants
        const size1 = group1.participant_count || 0;
        const size2 = group2.participant_count || 0;
        
        // Heuristique simple
        if (size1 > 0 && size2 > 0) {
            return Math.min(Math.floor(Math.min(size1, size2) * 0.3), 20);
        }
        return 0;
    }
    
    /**
     * Calcule la similarité entre deux noms de groupes
     */
    calculateNameSimilarity(name1, name2) {
        if (!name1 || !name2) return 0;
        
        const words1 = name1.split(/\\s+/);
        const words2 = name2.split(/\\s+/);
        
        let commonWords = 0;
        for (const word1 of words1) {
            if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
                commonWords++;
            }
        }
        
        return commonWords / Math.max(words1.length, words2.length);
    }
    
    /**
     * Récupère toutes les informations détaillées d'un groupe
     */
    async getCompleteGroupInfo(chatId) {
        try {
            const metadata = await this.sock.groupMetadata(chatId);
            if (!metadata) return null;
            
            const botStatus = this.getBotStatus(metadata);
            const groupType = this.determineGroupType(metadata);
            
            // Informations de base
            const basicInfo = {
                group_id: chatId,
                group_name: metadata.subject || 'Sans nom',
                group_description: metadata.desc || null,
                group_type: groupType,
                participant_count: metadata.participants?.length || 0,
                creation_date: metadata.creation ? new Date(metadata.creation * 1000).toISOString() : null,
                creation_timestamp: metadata.creation || null
            };
            
            // Informations sur le propriétaire
            const ownerInfo = {
                owner_jid: metadata.owner || null,
                owner_number: this.extractOwnerNumber(metadata.participants),
                owner_name: await this.getUserName(metadata.owner)
            };
            
            // Informations sur les administrateurs
            const adminInfo = {
                admin_count: this.countAdmins(metadata.participants),
                admin_numbers: this.extractAdminNumbers(metadata.participants),
                admin_details: await this.getAdminDetails(metadata.participants)
            };
            
            // Informations sur les participants
            const participantInfo = {
                total_participants: metadata.participants?.length || 0,
                regular_members: metadata.participants?.filter(p => !p.admin).length || 0,
                participant_details: await this.getParticipantDetails(metadata.participants)
            };
            
            // Statut du bot
            const botInfo = {
                is_bot_admin: botStatus.isAdmin,
                is_bot_owner: botStatus.isOwner,
                bot_permissions: this.getBotPermissions(botStatus)
            };
            
            // Paramètres du groupe
            const settingsInfo = {
                announce_mode: metadata.announce || false,
                restrict_mode: metadata.restrict || false,
                size_limit: metadata.size || 0,
                ephemeral_duration: metadata.ephemeralDuration || null,
                is_locked: metadata.locked || false
            };
            
            // Métadonnées techniques
            const technicalInfo = {
                parent_group: metadata.parentGroup || null,
                is_community: metadata.isCommunity || false,
                is_parent: metadata.isParent || false,
                linked_parent: metadata.linkedParent || null
            };
            
            return {
                ...basicInfo,
                owner: ownerInfo,
                admins: adminInfo,
                participants: participantInfo,
                bot_status: botInfo,
                settings: settingsInfo,
                technical: technicalInfo,
                raw_metadata: metadata
            };
            
        } catch (error) {
            console.error(`❌ Erreur récupération infos complètes ${chatId}:`, error);
            return null;
        }
    }
    
    /**
     * Récupère les détails des administrateurs
     */
    async getAdminDetails(participants) {
        if (!participants) return [];
        
        const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const adminDetails = [];
        
        for (const admin of admins) {
            // Utiliser les nouvelles fonctions pour analyser le JID correctement
            const jidInfo = db.parseJidInfo(admin.id);
            const phoneNumber = await db.extractPhoneNumber(admin.id);
            
            const adminInfo = {
                jid: admin.id, // JID complet
                jid_bare: jidInfo?.bareJid || null, // JID sans domain
                jid_type: jidInfo?.jidType || 'unknown',
                phone_number: phoneNumber, // Numéro réel extrait correctement
                role: admin.admin === 'superadmin' ? 'owner' : 'admin',
                name: await this.getUserName(admin.id)
            };
            adminDetails.push(adminInfo);
        }
        
        return adminDetails;
    }
    
    /**
     * Récupère les détails des participants
     */
    async getParticipantDetails(participants) {
        if (!participants) return [];
        
        const participantDetails = [];
        
        for (const participant of participants.slice(0, 50)) { // Limite à 50 pour éviter le spam
            // Utiliser les nouvelles fonctions pour analyser le JID correctement
            const jidInfo = db.parseJidInfo(participant.id);
            const phoneNumber = await db.extractPhoneNumber(participant.id);
            
            const participantInfo = {
                jid: participant.id, // JID complet
                jid_bare: jidInfo?.bareJid || null, // JID sans domain
                jid_type: jidInfo?.jidType || 'unknown',
                phone_number: phoneNumber, // Numéro réel extrait correctement
                role: participant.admin || 'member',
                name: await this.getUserName(participant.id)
            };
            participantDetails.push(participantInfo);
        }
        
        return participantDetails;
    }
    
    /**
     * Récupère le nom d'un utilisateur
     */
    async getUserName(jid) {
        try {
            if (!jid) return 'Inconnu';
            
            // Essayer de récupérer le nom depuis le profil
            const profileInfo = await this.sock.getBusinessProfile(jid).catch(() => null);
            if (profileInfo?.business_name) {
                return profileInfo.business_name;
            }
            
            // Essayer de récupérer depuis les contacts
            const contacts = this.sock.store?.contacts || {};
            const contact = contacts[jid];
            if (contact?.name || contact?.notify) {
                return contact.name || contact.notify;
            }
            
            return jid.split('@')[0]; // Fallback sur le numéro
        } catch (error) {
            return 'Inconnu';
        }
    }
    
    /**
     * Obtient les permissions du bot
     */
    getBotPermissions(botStatus) {
        const permissions = [];
        
        if (botStatus.isOwner) {
            permissions.push('owner', 'admin', 'delete_messages', 'change_group_info', 'add_participants', 'remove_participants');
        } else if (botStatus.isAdmin) {
            permissions.push('admin', 'delete_messages', 'change_group_info', 'add_participants', 'remove_participants');
        } else {
            permissions.push('member');
        }
        
        return permissions;
    }
    
    /**
     * 📊 GÉNÈRE UN RAPPORT COMPLET DE TOUTES LES DONNÉES RÉCUPÉRÉES
     */
    async generateCompleteReport() {
        try {
            console.log('📊 Génération du rapport complet...');
            
            // Exécuter la détection complète
            const detectionResults = await this.detectAllGroups();
            
            const report = {
                timestamp: new Date().toISOString(),
                bot_info: {
                    bot_id: this.getBotId(),
                    bot_number: this.getBotId().split('@')[0],
                    owner_number: this.getBotOwnerNumber()
                },
                summary: {
                    total_groups: detectionResults.groups.length,
                    total_communities: detectionResults.communities.length,
                    total_errors: detectionResults.errors.length
                },
                groups: [],
                communities: [],
                detailed_analysis: {
                    announcement_groups: [],
                    large_groups: [],
                    bot_admin_groups: [],
                    bot_owner_groups: []
                },
                errors: detectionResults.errors
            };
            
            // Récupérer les informations détaillées pour chaque groupe
            const allGroupIds = [
                ...detectionResults.groups.map(g => g.group_id),
                ...detectionResults.communities.map(c => c.group_id)
            ];
            
            for (const groupId of allGroupIds) {
                console.log(`🔍 Analyse détaillée du groupe ${groupId}...`);
                const completeInfo = await this.getCompleteGroupInfo(groupId);
                
                if (completeInfo) {
                    // Ajouter aux listes appropriées
                    if (completeInfo.group_type === 'community' || completeInfo.group_type === 'community_linked') {
                        report.communities.push(completeInfo);
                    } else {
                        report.groups.push(completeInfo);
                    }
                    
                    // Analyses spéciales
                    if (completeInfo.settings.announce_mode) {
                        report.detailed_analysis.announcement_groups.push({
                            group_id: completeInfo.group_id,
                            group_name: completeInfo.group_name,
                            participant_count: completeInfo.participant_count,
                            admin_count: completeInfo.admins.admin_count
                        });
                    }
                    
                    if (completeInfo.participant_count > 100) {
                        report.detailed_analysis.large_groups.push({
                            group_id: completeInfo.group_id,
                            group_name: completeInfo.group_name,
                            participant_count: completeInfo.participant_count
                        });
                    }
                    
                    if (completeInfo.bot_status.is_bot_admin) {
                        report.detailed_analysis.bot_admin_groups.push({
                            group_id: completeInfo.group_id,
                            group_name: completeInfo.group_name,
                            is_owner: completeInfo.bot_status.is_bot_owner
                        });
                    }
                    
                    if (completeInfo.bot_status.is_bot_owner) {
                        report.detailed_analysis.bot_owner_groups.push({
                            group_id: completeInfo.group_id,
                            group_name: completeInfo.group_name
                        });
                    }
                }
                
                // Délai pour éviter le spam
                await this.sleep(1000);
            }
            
            console.log('✅ Rapport complet généré avec succès');
            return report;
            
        } catch (error) {
            console.error('❌ Erreur génération rapport:', error);
            throw error;
        }
    }
    
    /**
     * 📄 FORMATE LE RAPPORT POUR AFFICHAGE CONSOLE
     */
    formatReportForConsole(report) {
        let output = '\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '🤖 RAPPORT COMPLET - DÉTECTION GROUPES ET COMMUNAUTÉS WHATSAPP\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        // Informations du bot
        output += `📱 BOT: ${report.bot_info.bot_number}\n`;
        output += `👑 PROPRIÉTAIRE: ${report.bot_info.owner_number}\n`;
        output += `📅 RAPPORT GÉNÉRÉ: ${new Date(report.timestamp).toLocaleString()}\n\n`;
        
        // Résumé
        output += '📊 RÉSUMÉ:\n';
        output += `├─ 👥 Groupes normaux: ${report.summary.total_groups}\n`;
        output += `├─ 🏘️ Communautés: ${report.summary.total_communities}\n`;
        output += `└─ ❌ Erreurs: ${report.summary.total_errors}\n\n`;
        
        // Groupes d'annonces détectés
        if (report.detailed_analysis.announcement_groups.length > 0) {
            output += '📢 GROUPES D\'ANNONCES DÉTECTÉS:\n';
            for (const group of report.detailed_analysis.announcement_groups) {
                output += `├─ ${group.group_name} (${group.participant_count} membres, ${group.admin_count} admins)\n`;
                output += `│  ID: ${group.group_id}\n`;
            }
            output += '\n';
        }
        
        // Communautés détaillées
        if (report.communities.length > 0) {
            output += '🏘️ COMMUNAUTÉS DÉTAILLÉES:\n';
            for (const community of report.communities) {
                output += `\n┌─ ${community.group_name}\n`;
                output += `├─ ID: ${community.group_id}\n`;
                output += `├─ Type: ${community.group_type}\n`;
                output += `├─ Participants: ${community.participant_count}\n`;
                output += `├─ Propriétaire: ${community.owner.owner_name} (${community.owner.owner_number})\n`;
                output += `├─ Admins (${community.admins.admin_count}):\n`;
                
                for (const admin of community.admins.admin_details.slice(0, 5)) {
                    output += `│  ├─ ${admin.name} (${admin.phone_number}) - ${admin.role}\n`;
                }
                if (community.admins.admin_details.length > 5) {
                    output += `│  └─ ... et ${community.admins.admin_details.length - 5} autres\n`;
                }
                
                output += `├─ Bot: ${community.bot_status.is_bot_admin ? '👑 Admin' : '👤 Membre'}\n`;
                output += `├─ Mode annonce: ${community.settings.announce_mode ? '✅' : '❌'}\n`;
                output += `├─ Créé le: ${community.creation_date ? new Date(community.creation_date).toLocaleDateString() : 'Inconnu'}\n`;
                
                if (community.group_description) {
                    output += `└─ Description: ${community.group_description.substring(0, 100)}${community.group_description.length > 100 ? '...' : ''}\n`;
                } else {
                    output += `└─ (Pas de description)\n`;
                }
            }
            output += '\n';
        }
        
        // Groupes détaillés
        if (report.groups.length > 0) {
            output += '👥 GROUPES DÉTAILLÉS:\n';
            for (const group of report.groups) {
                output += `\n┌─ ${group.group_name}\n`;
                output += `├─ ID: ${group.group_id}\n`;
                output += `├─ Participants: ${group.participant_count}\n`;
                output += `├─ Propriétaire: ${group.owner.owner_name} (${group.owner.owner_number})\n`;
                output += `├─ Admins (${group.admins.admin_count}):\n`;
                
                for (const admin of group.admins.admin_details.slice(0, 3)) {
                    output += `│  ├─ ${admin.name} (${admin.phone_number}) - ${admin.role}\n`;
                }
                if (group.admins.admin_details.length > 3) {
                    output += `│  └─ ... et ${group.admins.admin_details.length - 3} autres\n`;
                }
                
                output += `├─ Bot: ${group.bot_status.is_bot_admin ? '👑 Admin' : '👤 Membre'}\n`;
                output += `├─ Créé le: ${group.creation_date ? new Date(group.creation_date).toLocaleDateString() : 'Inconnu'}\n`;
                output += `└─ Type: ${group.group_type}\n`;
            }
            output += '\n';
        }
        
        // Analyses spéciales
        if (report.detailed_analysis.bot_admin_groups.length > 0) {
            output += '👑 GROUPES OÙ LE BOT EST ADMIN:\n';
            for (const group of report.detailed_analysis.bot_admin_groups) {
                output += `├─ ${group.group_name} ${group.is_owner ? '(PROPRIÉTAIRE)' : '(ADMIN)'}\n`;
            }
            output += '\n';
        }
        
        // Erreurs
        if (report.errors.length > 0) {
            output += '❌ ERREURS RENCONTRÉES:\n';
            for (const error of report.errors) {
                output += `├─ ${error.chatId}: ${error.error}\n`;
            }
            output += '\n';
        }
        
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '✅ RAPPORT TERMINÉ\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        
        return output;
    }

    /**
     * Traite un groupe spécifique
     */
    async processGroup(chatId, results) {
        try {
            // Obtenir les métadonnées du groupe
            const metadata = await this.sock.groupMetadata(chatId);
            if (!metadata) return;

            // Déterminer le type de groupe
            const groupType = this.determineGroupType(metadata);
            
            // Obtenir le statut du bot dans le groupe
            const botStatus = this.getBotStatus(metadata);

            // 🔑 PHASE 1 FIX: EXTRAIRE PROPRIÉTAIRES ET ADMINS
            const ownerNumber = this.extractOwnerNumber(metadata.participants);
            const adminNumbers = this.extractAdminNumbers(metadata.participants);

            // Préparer les données du groupe (compatible avec le schéma existant)
            const groupData = {
                group_id: chatId,
                group_name: metadata.subject || 'Sans nom',
                group_type: groupType,
                is_bot_admin: botStatus.isAdmin,
                is_bot_owner: botStatus.isOwner,
                participant_count: metadata.participants?.length || 0,
                joined_at: new Date().toISOString(),
                last_activity: new Date().toISOString(),
                is_active: true,
                welcome_sent: false,
                
                // 🔑 NOUVELLES COLONNES DE LIAISON
                owner_whatsapp_number: ownerNumber,
                admin_whatsapp_numbers: adminNumbers
            };

            // Ajouter les champs optionnels s'ils sont disponibles dans le schéma
            const optionalFields = {
                group_description: metadata.desc || null,
                community_id: metadata.parentGroup || null,
                admin_count: this.countAdmins(metadata.participants),
                owner_count: this.countOwners(metadata.participants),
                group_creation_date: metadata.creation ? new Date(metadata.creation * 1000).toISOString() : null,
                last_participants_update: new Date().toISOString(),
                metadata: {
                    announce: metadata.announce || false,
                    restrict: metadata.restrict || false,
                    size: metadata.size || 0,
                    ephemeralDuration: metadata.ephemeralDuration || null
                }
            };

            // Essayer d'ajouter les champs optionnels, ignorer les erreurs si les colonnes n'existent pas
            try {
                Object.assign(groupData, optionalFields);
            } catch (e) {
                console.log('⚠️ Utilisation du schéma de base (certaines colonnes optionnelles ignorées)');
            }

            // Sauvegarder le groupe en base
            await this.saveGroupToDatabase(groupData);

            // Traiter les participants
            if (metadata.participants && metadata.participants.length > 0) {
                await this.processGroupParticipants(chatId, metadata.participants);
            }

            // Ajouter aux résultats
            if (groupType === 'community') {
                results.communities.push(groupData);
            } else {
                results.groups.push(groupData);
            }

        } catch (error) {
            console.error(`❌ Erreur traitement groupe ${chatId}:`, error);
            throw error;
        }
    }

    /**
     * Détermine le type de groupe (group, community, channel)
     * Logique améliorée pour détecter les communautés WhatsApp
     */
    determineGroupType(metadata) {
        // 🔍 DÉTECTION AMÉLIORÉE DES COMMUNAUTÉS
        
        // 1. Vérification directe des propriétés de communauté
        if (metadata.isCommunity || metadata.isParent || metadata.parentGroup) {
            return 'community';
        }
        
        // 2. Détection par groupe d'annonces (caractéristique principale des communautés)
        const isAnnouncementGroup = metadata.announce === true;
        const hasLargeParticipantCount = metadata.participants?.length > 50;
        const hasRestrictedMessaging = metadata.restrict === true;
        
        // Les groupes d'annonces des communautés ont généralement ces caractéristiques
        if (isAnnouncementGroup && (hasLargeParticipantCount || hasRestrictedMessaging)) {
            return 'community';
        }
        
        // 3. Détection par pattern dans le nom/description
        const groupName = (metadata.subject || '').toLowerCase();
        const groupDesc = (metadata.desc || '').toLowerCase();
        
        const communityKeywords = [
            'community', 'comunidad', 'communauté', 'annonce', 'announcement',
            'info', 'information', 'règles', 'rules', 'reglas', 'canal',
            'channel', 'official', 'officiel', 'principal'
        ];
        
        const hasCommunityKeywords = communityKeywords.some(keyword => 
            groupName.includes(keyword) || groupDesc.includes(keyword)
        );
        
        if (isAnnouncementGroup && hasCommunityKeywords) {
            return 'community';
        }
        
        // 4. Détection par structure du groupe (admins multiples, grande taille)
        const adminCount = this.countAdmins(metadata.participants);
        const ownerCount = this.countOwners(metadata.participants);
        const totalParticipants = metadata.participants?.length || 0;
        
        // Communautés typiques : beaucoup de participants, plusieurs admins
        if (totalParticipants > 100 && adminCount >= 3) {
            return 'community';
        }
        
        // 5. Détection des canaux d'annonces standard
        if (isAnnouncementGroup && totalParticipants > 20) {
            return 'channel';
        }

        return 'group';
    }

    /**
     * Obtient le statut du bot dans le groupe
     */
    getBotStatus(metadata) {
        try {
            const botId = this.getBotId();
            const botParticipant = metadata.participants?.find(p => 
                p.id === botId || 
                p.id === botId.replace('@s.whatsapp.net', '@lid') ||
                p.id === botId.replace('@lid', '@s.whatsapp.net')
            );

            return {
                isAdmin: botParticipant?.admin === 'admin',
                isOwner: botParticipant?.admin === 'superadmin',
                participant: botParticipant
            };
        } catch (error) {
            console.error('❌ Erreur statut bot:', error);
            return { isAdmin: false, isOwner: false, participant: null };
        }
    }

    /**
     * Obtient l'ID du bot
     */
    getBotId() {
        const userId = typeof this.sock.user.id === 'string' ? this.sock.user.id : String(this.sock.user.id);
        return userId.split(':')[0] + '@s.whatsapp.net';
    }

    /**
     * Obtient le numéro du propriétaire du bot
     */
    getBotOwnerNumber() {
        const settings = require('../config/settings');
        return settings.ownerNumber || process.env.OWNER_NUMBER || '242065491040';
    }

    /**
     * Compte le nombre d'administrateurs
     */
    countAdmins(participants) {
        if (!participants) return 0;
        return participants.filter(p => p.admin === 'admin').length;
    }

    /**
     * Compte le nombre de propriétaires
     */
    countOwners(participants) {
        if (!participants) return 0;
        return participants.filter(p => p.admin === 'superadmin').length;
    }

    /**
     * 🔑 PHASE 1 FIX: Extrait le numéro du propriétaire principal du groupe
     */
    extractOwnerNumber(participants) {
        if (!participants) return null;
        
        // Chercher le superadmin (propriétaire)
        const owner = participants.find(p => p.admin === 'superadmin');
        if (owner) {
            // Extraire le numéro du JID et ajouter le "+"
            const phoneNumber = owner.id.replace('@s.whatsapp.net', '').replace('@lid', '');
            return '+' + phoneNumber;
        }
        
        return null;
    }

    /**
     * 🔑 PHASE 1 FIX: Extrait les numéros de tous les admins du groupe
     */
    extractAdminNumbers(participants) {
        if (!participants) return [];
        
        // Chercher tous les admins (admin et superadmin)
        const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        
        return admins.map(admin => {
            // Extraire le numéro du JID et ajouter le "+"
            const phoneNumber = admin.id.replace('@s.whatsapp.net', '').replace('@lid', '');
            return '+' + phoneNumber;
        });
    }

    /**
     * Sauvegarde le groupe en base de données avec gestion flexible du schéma
     */
    async saveGroupToDatabase(groupData) {
        try {
            // Créer la table si elle n'existe pas (Supabase)
            await this.ensureTableExists('bot_groups');

            // PHASE 1 FIX TEMPORAIRE : Stocker les liaisons dans metadata seulement
            const groupDataForDb = {
                group_id: groupData.group_id,
                group_name: groupData.group_name,
                group_type: groupData.group_type || 'group',
                is_bot_admin: groupData.is_bot_admin || false,
                participant_count: groupData.participant_count || 0,
                is_active: groupData.is_active !== false,
                community_id: groupData.community_id || null,
                is_community: groupData.group_type === 'community',
                is_parent: groupData.is_parent || false,
                admin_count: groupData.admin_count || 0,
                owner_count: groupData.owner_count || 0,
                country_code: groupData.country_code || null,
                country_name: groupData.country_name || null,
                
                // 🔑 STOCKER TEMPORAIREMENT LES LIAISONS DANS METADATA
                owner_whatsapp_number: groupData.owner_whatsapp_number,  // Passé à upsertGroup pour metadata
                admin_whatsapp_numbers: groupData.admin_whatsapp_numbers, // Passé à upsertGroup pour metadata
                
                metadata: groupData.metadata || {},
                additional_info: {
                    bot_joined_at: groupData.joined_at || new Date().toISOString(),
                    last_activity: groupData.last_activity || new Date().toISOString(),
                    // Ajouter aussi les infos dans additional_info pour rétrocompatibilité
                    waOwnerNumber: groupData.owner_whatsapp_number,
                    waAdminNumbers: groupData.admin_whatsapp_numbers
                }
            };

            // Utiliser la méthode centralisée upsertGroup du module database
            const data = await db.upsertGroup(groupDataForDb);
            console.log(`💾 Groupe ${groupData.group_name} sauvegardé avec succès`);
            return data;

        } catch (error) {
            console.error('❌ Erreur base de données:', error);
            throw error;
        }
    }

    /**
     * Traite tous les participants d'un groupe
     */
    async processGroupParticipants(groupId, participants) {
        try {
            console.log(`👥 Traitement de ${participants.length} participants pour ${groupId}`);
            
            await this.ensureTableExists('bot_group_participants');
            await this.ensureTableExists('bot_group_admins');

            const participantData = [];
            const adminData = [];

            for (const participant of participants) {
                try {
                    const userData = await this.extractUserData(groupId, participant);
                    participantData.push(userData);

                    // Si c'est un admin ou owner, ajouter aux admins
                    if (participant.admin) {
                        const adminRecord = {
                            group_id: groupId,
                            user_jid: participant.id,
                            user_name: userData.user_name,
                            admin_type: participant.admin === 'superadmin' ? 'owner' : 'admin',
                            granted_at: new Date().toISOString(),
                            is_active: true
                        };
                        adminData.push(adminRecord);
                    }

                } catch (error) {
                    console.error(`❌ Erreur traitement participant ${participant.id}:`, error.message);
                }
            }

            // Utiliser la méthode centralisée upsertGroupParticipants
            if (participantData.length > 0) {
                try {
                    const savedData = await db.upsertGroupParticipants(participantData);
                    console.log(`✅ ${participantData.length} participants sauvegardés via méthode centralisée`);
                } catch (participantError) {
                    console.error(`❌ Erreur sauvegarde participants:`, participantError.message);
                }
            }

            // Sauvegarder les admins un par un pour éviter le problème de contrainte unique
            if (adminData.length > 0) {
                let savedAdmins = 0;
                for (const admin of adminData) {
                    try {
                        // D'abord essayer de récupérer l'existant
                        const { data: existing } = await db.supabase
                            .from('bot_group_admins')
                            .select('id')
                            .eq('group_id', admin.group_id)
                            .eq('user_jid', admin.user_jid)
                            .single();

                        if (existing) {
                            // Mettre à jour l'existant
                            await db.supabase
                                .from('bot_group_admins')
                                .update(admin)
                                .eq('group_id', admin.group_id)
                                .eq('user_jid', admin.user_jid);
                        } else {
                            // Insérer nouveau
                            await db.supabase
                                .from('bot_group_admins')
                                .insert(admin);
                        }
                        savedAdmins++;
                    } catch (adminError) {
                        console.error(`❌ Erreur admin ${admin.user_jid}:`, adminError.message);
                    }
                }
                console.log(`✅ ${savedAdmins}/${adminData.length} admins sauvegardés`);
            }

            console.log(`✅ ${participantData.length} participants et ${adminData.length} admins traités`);

        } catch (error) {
            console.error('❌ Erreur traitement participants:', error);
            throw error;
        }
    }

    /**
     * Extrait les données d'un utilisateur avec détection de pays
     * Remplit correctement tous les champs du schéma bot_group_participants
     * Note: Enrichissement des profils fait séparément pour éviter la récursion et améliorer les performances
     */
    async extractUserData(groupId, participant) {
        // 🔧 FIX: Utiliser la fonction correcte pour extraire le numéro depuis un JID
        const phoneNumber = await db.extractPhoneNumber(participant.id);
        
        // 🔧 FIX: Vérifier que c'est un vrai numéro avant de détecter le pays
        let countryInfo = { code: null, name: null, iso: null, region: null, confidence: 0, detectedPattern: null };
        if (phoneNumber && phoneNumber.match(/^\d{6,15}$/)) { // Numéro valide (6-15 chiffres)
            countryInfo = this.detectCountryFromPhone(phoneNumber);
        }
        
        // Normaliser le pattern pour le formatage du téléphone
        const patternLength = countryInfo.detectedPattern ? countryInfo.detectedPattern.replace('+', '').length : 0;

        return {
            // Champs principaux du schéma
            group_id: groupId,
            user_jid: participant.id,
            user_phone: phoneNumber,
            user_name: participant.name || participant.notify || phoneNumber,
            first_name: this.extractFirstName(participant.name),
            last_name: this.extractLastName(participant.name),
            user_bio: null, // Sera enrichi séparément
            profile_picture_url: null, // Sera enrichi séparément
            
            // Champs de localisation (schéma principal)
            country_code: countryInfo.code,
            country_name: countryInfo.name,
            
            // Champs de rôles
            is_admin: participant.admin === 'admin',
            is_owner: participant.admin === 'superadmin',
            is_super_admin: false,
            
            // Champs temporels
            participant_since: new Date().toISOString(),
            last_seen_in_group: new Date().toISOString(),
            
            // Champs de statistiques
            message_count: 0,
            
            // Champs de validation
            is_verified: false, // Sera enrichi séparément
            is_business: false, // Sera enrichi séparément
            // HOTFIX TEMPORAIRE: is_active supprimé - laisse DB utiliser DEFAULT true
            
            // Informations supplémentaires (JSON)
            additional_info: {
                whatsapp_name: participant.name,
                notify_name: participant.notify,
                admin_level: participant.admin || 'member',
                country_iso: countryInfo.iso,
                country_region: countryInfo.region,
                detection_confidence: countryInfo.confidence,
                phone_formatted: countryInfo.code && phoneNumber ? 
                    `${countryInfo.code} ${phoneNumber.substring(patternLength)}` : phoneNumber,
                profile_enrichment_pending: true // Marquer pour enrichissement futur
            }
        };
    }

    /**
     * Extrait le numéro de téléphone du JID (DEPRECATED - Utiliser db.extractPhoneNumber)
     * @deprecated Cette fonction est remplacée par db.extractPhoneNumber() qui gère mieux les mappings
     */
    extractPhoneNumber(jid) {
        console.warn('⚠️ Utilisation de extractPhoneNumber dépréciée - utiliser db.extractPhoneNumber()');
        try {
            // Utiliser la fonction correcte de la database
            return db.extractPhoneNumber(jid);
        } catch (error) {
            // Fallback simple
            if (jid && jid.includes('@')) {
                return jid.split('@')[0];
            }
            return null;
        }
    }

    /**
     * Détecte le pays à partir du numéro de téléphone
     * Utilise le système de détection avancé avec base de données complète
     */
    detectCountryFromPhone(phoneNumber) {
        if (!phoneNumber) return { 
            code: null, 
            name: null, 
            iso: null, 
            region: null, 
            confidence: 0, 
            detectedPattern: null 
        };

        const detection = countryDetector.detectCountryFromPhone(phoneNumber);
        
        // Retourner dans le format attendu par le reste du système avec tous les champs
        return {
            code: detection.code,
            name: detection.name,
            iso: detection.iso,
            region: detection.region,
            confidence: detection.confidence,
            detectedPattern: detection.detectedPattern
        };
    }

    /**
     * Extrait le prénom du nom complet
     */
    extractFirstName(fullName) {
        if (!fullName) return null;
        const parts = fullName.trim().split(' ');
        return parts[0] || null;
    }

    /**
     * Extrait le nom de famille du nom complet
     */
    extractLastName(fullName) {
        if (!fullName) return null;
        const parts = fullName.trim().split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : null;
    }

    /**
     * S'assure qu'une table existe (pour Supabase)
     */
    async ensureTableExists(tableName) {
        try {
            // Vérifier si la table existe en essayant de la requêter
            const { error } = await db.supabase
                .from(tableName)
                .select('*')
                .limit(1);

            if (error && error.code === 'PGRST204') {
                console.log(`⚠️ Table ${tableName} n'existe pas encore`);
                // Note: Dans un environnement de production, les tables devraient être créées via migrations
                // Ici on laisse Supabase gérer la création automatique
            }

        } catch (error) {
            console.log(`ℹ️ Table ${tableName}: ${error.message}`);
        }
    }

    /**
     * Utilitaire pour ajouter des délais
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Créer automatiquement les mappings JID pour un groupe
     */
    async createGroupJidMappings(groupId) {
        try {
            console.log(`🔗 Création des mappings JID pour le groupe ${groupId}`);
            
            // Récupérer les métadonnées du groupe
            const metadata = await this.sock.groupMetadata(groupId);
            if (!metadata || !metadata.participants) return;

            const mappingsCreated = [];
            
            for (const participant of metadata.participants.slice(0, 20)) { // Limiter pour éviter le spam
                try {
                    const groupJid = participant.id; // JID dans le contexte du groupe
                    
                    // 🔧 FIX: Parser le JID correctement
                    const jidInfo = db.parseJidInfo(groupJid);
                    if (!jidInfo) continue;
                    
                    // Si c'est déjà un JID privé, pas besoin de mapping
                    if (jidInfo.isPrivateJid) {
                        continue;
                    }
                    
                    // 🔧 FIX: Pour les JIDs de groupe (@lid), essayer de deviner le JID privé
                    if (jidInfo.jidType === 'group_lid' && jidInfo.bareJid) {
                        // Vérifier que le bareJid ressemble à un numéro de téléphone
                        if (jidInfo.bareJid.match(/^\d{6,15}$/)) {
                            const possiblePhoneNumber = jidInfo.bareJid;
                            const possiblePrivateJid = possiblePhoneNumber + '@s.whatsapp.net';
                            
                            // 🔧 FIX: Vérifier si le mapping existe déjà pour éviter les doublons
                            const existingMapping = await db.findPrimaryJidFromGroup(groupJid);
                            if (existingMapping) {
                                continue; // Mapping déjà existant
                            }
                            
                            // Créer le mapping
                            const mapping = await db.createJidMapping(groupJid, possiblePrivateJid, possiblePhoneNumber);
                            if (mapping) {
                                mappingsCreated.push({
                                    groupJid: groupJid,
                                    privateJid: possiblePrivateJid,
                                    phoneNumber: possiblePhoneNumber
                                });
                            }
                        }
                    }
                    
                    await this.sleep(100); // Petit délai
                } catch (error) {
                    // 🔧 FIX: Ne pas afficher les erreurs de contraintes comme erreurs importantes
                    if (error.code === '23505' && error.message.includes('duplicate key')) {
                        // C'est normal, le mapping existe déjà
                        continue;
                    }
                    console.warn(`⚠️ Erreur mapping JID ${participant.id}:`, error.message);
                }
            }
            
            console.log(`✅ ${mappingsCreated.length} mappings JID créés pour ${groupId}`);
            return mappingsCreated;
            
        } catch (error) {
            console.error(`❌ Erreur création mappings pour ${groupId}:`, error);
            return [];
        }
    }

    /**
     * Démarre la détection automatique périodique OPTIMISÉE
     */
    startAutoDetection() {
        this.logInfo(`Détection automatique optimisée activée`);
        
        // Première détection immédiate
        this.detectAllGroups().catch(error => {
            this.logError('Erreur détection initiale', error);
        });

        // Détection optimisée avec intervalle adaptatif
        this.scheduleNextDetection();
        
        this.logSuccess(`Détection intelligente démarrée (interval dynamique: ${this.getOptimizedInterval()/60000} min)`);
    }

    /**
     * Enrichit les profils des participants d'un groupe de manière asynchrone
     * Méthode séparée pour éviter les problèmes de performance et de récursion
     */
    async enrichGroupParticipantsProfiles(groupId, maxParticipants = 50) {
        try {
            console.log(`🔍 Enrichissement des profils pour le groupe ${groupId}...`);
            
            // Récupérer les participants sans profil enrichi
            const { data: participants, error } = await db.supabase
                .from('bot_group_participants')
                .select('user_jid, user_name')
                .eq('group_id', groupId)
                .is('user_bio', null)
                .is('profile_picture_url', null)
                .eq('is_active', true)
                .limit(maxParticipants);

            if (error) {
                console.error('❌ Erreur récupération participants:', error);
                return;
            }

            if (!participants || participants.length === 0) {
                console.log('ℹ️ Aucun participant à enrichir trouvé');
                return;
            }

            console.log(`👥 Enrichissement de ${participants.length} participants...`);
            let enriched = 0;
            let errors = 0;

            for (const participant of participants) {
                try {
                    // Respecter le rate limiting (2 secondes entre les requêtes)
                    await this.sleep(2000);
                    
                    // Récupérer le profil de manière sécurisée
                    const profile = await this.safeGetUserProfile(participant.user_jid);
                    
                    if (profile) {
                        // Mettre à jour les données en base
                        await this.updateParticipantProfile(groupId, participant.user_jid, profile);
                        enriched++;
                        console.log(`✅ Profil enrichi: ${participant.user_name || participant.user_jid.substring(0, 15)}`);
                    }
                } catch (error) {
                    errors++;
                    console.log(`⚠️ Erreur enrichissement ${participant.user_jid.substring(0, 15)}...: ${error.message}`);
                    
                    // Arrêter si trop d'erreurs consécutives (probablement un problème de connexion)
                    if (errors > 5) {
                        console.log('⚠️ Trop d\'erreurs, arrêt de l\'enrichissement');
                        break;
                    }
                }
            }

            console.log(`✅ Enrichissement terminé: ${enriched} profils enrichis, ${errors} erreurs`);
            return { enriched, errors, total: participants.length };

        } catch (error) {
            console.error('❌ Erreur enrichissement profils:', error);
            return { enriched: 0, errors: 1, total: 0 };
        }
    }

    /**
     * Récupération sécurisée du profil utilisateur sans récursion
     */
    async safeGetUserProfile(userJid) {
        try {
            // Vérifier le cache du UserProfileSystem
            const cached = this.userProfileSystem.profileCache.get(userJid);
            if (cached && (Date.now() - cached.timestamp) < this.userProfileSystem.cacheTimeout) {
                return cached.data;
            }

            const profile = {
                jid: userJid,
                name: null,
                bio: null,
                profilePicture: null,
                isVerified: false,
                isBusiness: false,
                updatedAt: new Date().toISOString()
            };

            // Récupérer les contacts de base
            try {
                const contactInfo = this.sock.contacts[userJid];
                if (contactInfo) {
                    profile.name = contactInfo.name || contactInfo.notify || null;
                }
            } catch (error) {
                // Ignorer silencieusement
            }

            // Récupérer le statut/bio
            try {
                const status = await this.sock.fetchStatus(userJid);
                if (status) {
                    profile.bio = status.status;
                }
            } catch (error) {
                // Ignorer silencieusement
            }

            // Récupérer la photo de profil
            try {
                const profilePicUrl = await this.sock.profilePictureUrl(userJid, 'image');
                if (profilePicUrl) {
                    profile.profilePicture = profilePicUrl;
                }
            } catch (error) {
                // Ignorer silencieusement
            }

            // Détection simple du type de compte (sans récursion)
            profile.isBusiness = userJid.includes('@s.whatsapp.net') && profile.bio?.includes('business');

            // Mettre en cache
            this.userProfileSystem.profileCache.set(userJid, {
                data: profile,
                timestamp: Date.now()
            });

            return profile;

        } catch (error) {
            console.error(`❌ Erreur profil ${userJid}:`, error.message);
            return null;
        }
    }

    /**
     * Met à jour le profil d'un participant en base
     */
    async updateParticipantProfile(groupId, userJid, profile) {
        try {
            const updateData = {
                user_bio: profile.bio,
                profile_picture_url: profile.profilePicture,
                is_verified: profile.isVerified,
                is_business: profile.isBusiness,
                updated_at: new Date().toISOString()
            };

            // Mettre à jour le nom si on en a un meilleur
            if (profile.name) {
                updateData.user_name = profile.name;
                updateData.first_name = this.extractFirstName(profile.name);
                updateData.last_name = this.extractLastName(profile.name);
            }

            const { error } = await db.supabase
                .from('bot_group_participants')
                .update(updateData)
                .eq('group_id', groupId)
                .eq('user_jid', userJid);

            if (error) {
                console.error('❌ Erreur mise à jour profil:', error);
            }

        } catch (error) {
            console.error('❌ Erreur updateParticipantProfile:', error);
        }
    }

    /**
     * Obtient les statistiques de détection
     */
    async getDetectionStats() {
        try {
            const [groupsResult, participantsResult, adminsResult] = await Promise.all([
                db.supabase.from('bot_groups').select('*', { count: 'exact', head: true }),
                db.supabase.from('bot_group_participants').select('*', { count: 'exact', head: true }),
                db.supabase.from('bot_group_admins').select('*', { count: 'exact', head: true })
            ]);

            return {
                totalGroups: groupsResult.count || 0,
                totalParticipants: participantsResult.count || 0,
                totalAdmins: adminsResult.count || 0,
                lastDetection: this.lastDetection,
                isDetecting: this.isDetecting
            };

        } catch (error) {
            console.error('❌ Erreur statistiques:', error);
            return {
                totalGroups: 0,
                totalParticipants: 0,
                totalAdmins: 0,
                lastDetection: null,
                isDetecting: false
            };
        }
    }

    /**
     * Gère les mises à jour de participants en temps réel (intégration avec le bot principal)
     */
    async handleParticipantUpdate(groupId, participants, action, author) {
        try {
            console.log(`🔄 Traitement événement "${action}" pour ${participants.length} participant(s) dans ${groupId}`);

            // S'assurer que le groupe est déjà dans notre base de données
            // Créer un objet results dummy pour processGroup
            const results = { groups: [], communities: [], errors: [] };
            await this.processGroup(groupId, results);

            switch (action) {
                case 'add':
                    await this.handleParticipantsAdd(groupId, participants);
                    break;
                case 'remove':
                    await this.handleParticipantsRemove(groupId, participants);
                    break;
                case 'promote':
                    await this.handleParticipantsPromote(groupId, participants);
                    break;
                case 'demote':
                    await this.handleParticipantsDemote(groupId, participants);
                    break;
                default:
                    console.log(`ℹ️ Action non gérée: ${action}`);
            }

            // Mettre à jour le nombre de participants
            await this.updateParticipantCount(groupId);

        } catch (error) {
            console.error(`❌ Erreur handleParticipantUpdate:`, error);
        }
    }

    /**
     * Gère l'ajout de nouveaux participants
     */
    async handleParticipantsAdd(groupId, participants) {
        try {
            console.log(`➕ Ajout de ${participants.length} nouveau(x) participant(s)`);
            
            // Récupérer les métadonnées du groupe pour avoir les infos actualisées
            const metadata = await this.sock.groupMetadata(groupId);
            
            // Traiter chaque nouveau participant
            for (const participantJid of participants) {
                const participant = metadata.participants.find(p => p.id === participantJid);
                if (participant) {
                    const userData = await this.extractUserData(groupId, participant);
                    
                    // Upsert le participant avec retry
                    try {
                        await this.upsertParticipantWithRetry(userData);
                        this.logSuccess(`Participant ${userData.user_name} ajouté`);
                    } catch (error) {
                        this.logError(`Erreur ajout participant ${participantJid}`, error);
                    }

                    // Si c'est un admin, l'ajouter aux admins
                    if (participant.admin) {
                        await this.addToAdmins(groupId, participantJid, userData.user_name, participant.admin);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsAdd:', error);
        }
    }

    /**
     * Gère la suppression de participants
     */
    async handleParticipantsRemove(groupId, participants) {
        try {
            console.log(`➖ Suppression de ${participants.length} participant(s)`);
            
            for (const participantJid of participants) {
                // Marquer comme inactif au lieu de supprimer
                const { error } = await db.supabase
                    .from('bot_group_participants')
                    .update({ 
                        is_active: false,
                        left_at: new Date().toISOString()
                    })
                    .eq('group_id', groupId)
                    .eq('user_jid', participantJid);

                if (error) {
                    console.error(`❌ Erreur suppression participant ${participantJid}:`, error);
                } else {
                    console.log(`✅ Participant ${participantJid} marqué comme parti`);
                }

                // Supprimer des admins si applicable
                await this.removeFromAdmins(groupId, participantJid);
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsRemove:', error);
        }
    }

    /**
     * Gère les promotions admin
     */
    async handleParticipantsPromote(groupId, participants) {
        try {
            console.log(`👑 Promotion de ${participants.length} participant(s) comme admin`);
            
            for (const participantJid of participants) {
                // Récupérer le nom de l'utilisateur
                const { data: userData } = await db.supabase
                    .from('bot_group_participants')
                    .select('user_name')
                    .eq('group_id', groupId)
                    .eq('user_jid', participantJid)
                    .single();

                const userName = userData?.user_name || participantJid.split('@')[0];
                
                // Ajouter aux admins
                await this.addToAdmins(groupId, participantJid, userName, 'admin');
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsPromote:', error);
        }
    }

    /**
     * Gère les rétrogradations admin
     */
    async handleParticipantsDemote(groupId, participants) {
        try {
            console.log(`👤 Rétrogradation de ${participants.length} admin(s)`);
            
            for (const participantJid of participants) {
                await this.removeFromAdmins(groupId, participantJid);
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsDemote:', error);
        }
    }

    /**
     * Ajoute un utilisateur aux admins
     */
    async addToAdmins(groupId, userJid, userName, adminType) {
        try {
            const adminRecord = {
                group_id: groupId,
                user_jid: userJid,
                user_name: userName,
                admin_type: adminType === 'superadmin' ? 'owner' : 'admin',
                granted_at: new Date().toISOString(),
                is_active: true
            };

            const { error } = await db.supabase
                .from('bot_group_admins')
                .upsert(adminRecord, { 
                    onConflict: 'group_id,user_jid',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error(`❌ Erreur ajout admin ${userJid}:`, error);
            } else {
                console.log(`✅ ${userName} ajouté comme ${adminRecord.admin_type}`);
            }

        } catch (error) {
            console.error('❌ Erreur addToAdmins:', error);
        }
    }

    /**
     * Supprime un utilisateur des admins
     */
    async removeFromAdmins(groupId, userJid) {
        try {
            const { error } = await db.supabase
                .from('bot_group_admins')
                .update({ 
                    is_active: false,
                    revoked_at: new Date().toISOString()
                })
                .eq('group_id', groupId)
                .eq('user_jid', userJid);

            if (error) {
                console.error(`❌ Erreur suppression admin ${userJid}:`, error);
            } else {
                console.log(`✅ Admin ${userJid} révoqué`);
            }

        } catch (error) {
            console.error('❌ Erreur removeFromAdmins:', error);
        }
    }

    /**
     * Met à jour le nombre de participants d'un groupe
     */
    async updateParticipantCount(groupId) {
        try {
            // Compter les participants actifs
            const { data, error } = await db.supabase
                .from('bot_group_participants')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', groupId)
                .eq('is_active', true);

            if (error) {
                console.error(`❌ Erreur comptage participants ${groupId}:`, error);
                return;
            }

            const participantCount = data || 0;

            // Mettre à jour le groupe
            const { error: updateError } = await db.supabase
                .from('bot_groups')
                .update({ 
                    participant_count: participantCount,
                    updated_at: new Date().toISOString()
                })
                .eq('group_id', groupId);

            if (updateError) {
                console.error(`❌ Erreur mise à jour compteur ${groupId}:`, updateError);
            } else {
                console.log(`✅ Compteur participants mis à jour: ${participantCount} pour ${groupId}`);
            }

        } catch (error) {
            console.error('❌ Erreur updateParticipantCount:', error);
        }
    }

    /**
     * 🔧 SYSTÈME ANNONCES: Identifie et stocke les groupes d'annonces de communautés
     */
    async identifyAnnouncementGroups() {
        console.log('📢 === IDENTIFICATION DES GROUPES D\'ANNONCES ===');
        
        try {
            // Récupérer tous les groupes où le bot est admin
            const { data: adminGroups, error } = await db.supabase
                .from('bot_groups')
                .select('*')
                .eq('is_bot_admin', true)
                .eq('is_active', true);

            if (error) {
                console.error('❌ Erreur récupération groupes admin:', error);
                return [];
            }

            const announcementGroups = [];

            for (const group of adminGroups) {
                const metadata = group.metadata || {};
                
                // Critères pour identifier un groupe d'annonces de communauté
                const isAnnouncementGroup = metadata.announce === true;
                const isSmallGroup = group.participant_count <= 5; // Groupes d'annonces sont généralement petits
                const hasAnnouncementKeywords = ['annonce', 'announcement', 'canal', 'channel', 'info'].some(
                    keyword => group.group_name.toLowerCase().includes(keyword)
                );

                if (isAnnouncementGroup || (isSmallGroup && hasAnnouncementKeywords)) {
                    // Vérifier si c'est vraiment un groupe d'annonces en analysant la communauté
                    const relatedGroups = await this.findRelatedGroupsForAnnouncement(group, adminGroups);
                    
                    if (relatedGroups.length > 0) {
                        const announcementGroupData = {
                            group_id: group.group_id,
                            group_name: group.group_name,
                            community_id: group.community_id,
                            participant_count: group.participant_count,
                            related_groups: relatedGroups,
                            total_community_members: relatedGroups.reduce((sum, g) => sum + g.participant_count, 0),
                            is_announcement_group: true,
                            can_send_announcements: true
                        };

                        announcementGroups.push(announcementGroupData);
                        
                        // Marquer ce groupe comme groupe d'annonces dans la base
                        await db.supabase
                            .from('bot_groups')
                            .update({ 
                                group_type: 'announcement',
                                updated_at: new Date().toISOString()
                            })
                            .eq('group_id', group.group_id);

                        console.log(`📢 Groupe d'annonces identifié: ${group.group_name} (${relatedGroups.length} groupes liés)`);
                    }
                }
            }

            // Sauvegarder la liste des groupes d'annonces pour utilisation future
            await this.saveAnnouncementGroupsList(announcementGroups);

            console.log(`✅ ${announcementGroups.length} groupes d'annonces identifiés et stockés`);
            return announcementGroups;

        } catch (error) {
            console.error('❌ Erreur identification groupes annonces:', error);
            return [];
        }
    }

    /**
     * 🔧 Trouve les groupes liés à un groupe donné (pour détection communauté)
     */
    async findRelatedGroups(groupId, allGroups) {
        try {
            const targetGroup = allGroups.find(g => g.group_id === groupId);
            if (!targetGroup) return [];

            const relatedGroups = [];

            for (const group of allGroups) {
                if (group.group_id === groupId) continue;

                // Critères de liaison (admins communs, nom similaire, etc.)
                const score = await this.calculateGroupRelationScore(targetGroup, group);
                
                if (score >= 40) { // Seuil de liaison
                    relatedGroups.push({
                        group_id: group.group_id,
                        group_name: group.group_name,
                        participant_count: group.participant_count,
                        relation_score: score
                    });
                }
            }

            return relatedGroups;
        } catch (error) {
            console.error('❌ Erreur findRelatedGroups:', error);
            return [];
        }
    }

    /**
     * 🔧 NOUVEAU: Trouve les groupes liés spécifiquement pour l'identification des annonces
     * Adapté pour traiter les objets de base de données Supabase
     */
    async findRelatedGroupsForAnnouncement(targetGroup, adminGroups) {
        try {
            if (!targetGroup || !adminGroups || adminGroups.length === 0) return [];

            const relatedGroups = [];

            for (const group of adminGroups) {
                if (group.group_id === targetGroup.group_id) continue;

                // Critères de liaison simplifiés pour les objets DB
                let score = 0;

                // 1. Comparaison de noms (similarité simple)
                if (targetGroup.group_name && group.group_name) {
                    const targetWords = targetGroup.group_name.toLowerCase().split(/\s+/);
                    const groupWords = group.group_name.toLowerCase().split(/\s+/);
                    
                    const commonWords = targetWords.filter(word => 
                        groupWords.some(gw => gw.includes(word) || word.includes(gw))
                    );
                    
                    if (commonWords.length > 0) {
                        score += Math.min(50, commonWords.length * 25);
                    }
                }

                // 2. Taille de groupe similaire (communautés ont souvent des groupes de tailles similaires)
                const sizeDiff = Math.abs((targetGroup.participant_count || 0) - (group.participant_count || 0));
                if (sizeDiff < 20) score += 20;

                // 3. Même statut admin bot
                if (targetGroup.is_bot_admin && group.is_bot_admin) {
                    score += 30;
                }

                // 4. Dates de création proches (si disponibles)
                if (targetGroup.created_at && group.created_at) {
                    const timeDiff = Math.abs(new Date(targetGroup.created_at) - new Date(group.created_at));
                    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
                    if (daysDiff < 30) score += 15; // Créés dans les 30 jours
                }

                if (score >= 40) { // Seuil de liaison
                    relatedGroups.push({
                        group_id: group.group_id,
                        group_name: group.group_name,
                        participant_count: group.participant_count,
                        relation_score: score
                    });
                }
            }

            return relatedGroups;
        } catch (error) {
            console.error('❌ Erreur findRelatedGroupsForAnnouncement:', error);
            return [];
        }
    }

    /**
     * 🔧 Sauvegarde la liste des groupes d'annonces pour utilisation future
     */
    async saveAnnouncementGroupsList(announcementGroups) {
        try {
            // Créer une table spéciale pour les groupes d'annonces si nécessaire
            const listData = {
                id: 'announcement_groups_list',
                data: announcementGroups,
                total_announcement_groups: announcementGroups.length,
                total_community_members: announcementGroups.reduce((sum, g) => sum + g.total_community_members, 0),
                last_updated: new Date().toISOString(),
                bot_admin_groups: announcementGroups.filter(g => g.can_send_announcements).length
            };

            // Utiliser la table de config existante pour stocker cette info
            const { error } = await db.supabase
                .from('bot_config')
                .upsert({
                    key: 'announcement_groups_list',
                    value: listData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) {
                console.error('❌ Erreur sauvegarde liste annonces:', error);
            } else {
                console.log('✅ Liste des groupes d\'annonces sauvegardée pour utilisation future');
            }

        } catch (error) {
            console.error('❌ Erreur saveAnnouncementGroupsList:', error);
        }
    }

    /**
     * 🔧 AMÉLIORATION: Diagnostic complet des groupes
     */
    async diagnosticGroups() {
        console.log('🔍 === DIAGNOSTIC COMPLET DES GROUPES ===');
        
        try {
            // Test 1: groupFetchAllParticipating
            console.log('📊 Test 1: groupFetchAllParticipating()');
            const participating = await this.sock.groupFetchAllParticipating();
            console.log('Réponse:', Object.keys(participating).length, 'éléments');
            
            // Test 2: Store chats
            console.log('📊 Test 2: sock.chats');
            const chats = this.sock.chats || {};
            const groupChats = Object.keys(chats).filter(id => id.endsWith('@g.us'));
            console.log('Groupes dans store:', groupChats.length);
            
            // Test 3: État de connexion
            console.log('📊 Test 3: État de connexion');
            console.log('Connecté:', !!this.sock.user);
            console.log('User info:', this.sock.user?.name || 'N/A');
            
            return {
                participatingCount: Object.keys(participating).length,
                storeGroupCount: groupChats.length,
                isConnected: !!this.sock.user,
                userName: this.sock.user?.name
            };
            
        } catch (error) {
            console.error('❌ Erreur diagnostic:', error);
            return { error: error.message };
        }
    }
    
    /**
     * 🔧 AMÉLIORATION: Forcer la détection manuelle
     */
    async forceDetection() {
        console.log('🚀 === DÉTECTION FORCÉE ===');
        this.isDetecting = false; // Reset du flag
        return await this.detectAllGroups();
    }

    // ========================================
    // 🚀 NOUVELLES MÉTHODES OPTIMISÉES
    // ========================================

    /**
     * 🎯 Détermine si une détection périodique est nécessaire
     */
    shouldRunPeriodicDetection() {
        const now = Date.now();
        const timeSinceLastEvent = now - this.lastEventTime;
        const timeSinceLastDetection = this.lastDetection ? now - this.lastDetection.getTime() : Infinity;
        
        // Si des mises à jour sont en attente ET que ça fait plus de 5 minutes
        if (this.pendingUpdates.size > 0 && timeSinceLastEvent > 5 * 60 * 1000) {
            return true;
        }
        
        // Si aucune détection depuis plus de 2 heures (fallback de sécurité)
        if (timeSinceLastDetection > 2 * 60 * 60 * 1000) {
            return true;
        }
        
        // Si beaucoup d'événements récents, faire une détection
        if (this.pendingUpdates.size > 10) {
            return true;
        }
        
        return false;
    }

    /**
     * 🎯 Calcule l'intervalle optimal basé sur l'activité
     */
    getOptimizedInterval() {
        const now = Date.now();
        const timeSinceLastEvent = now - this.lastEventTime;
        
        // Si activité récente (< 30 min) : vérifier toutes les 10 minutes
        if (timeSinceLastEvent < 30 * 60 * 1000) {
            return 10 * 60 * 1000; // 10 minutes
        }
        
        // Si activité modérée (< 2h) : vérifier toutes les 30 minutes
        if (timeSinceLastEvent < 2 * 60 * 60 * 1000) {
            return 30 * 60 * 1000; // 30 minutes
        }
        
        // Si peu d'activité : vérifier toutes les 2 heures
        return 2 * 60 * 60 * 1000; // 2 heures
    }

    /**
     * 🔄 Traite un groupe avec mécanisme de retry
     */
    async processGroupWithRetry(chatId, results, maxRetries = 3) {
        const retryKey = `process_${chatId}`;
        let attempts = this.retryAttempts.get(retryKey) || 0;
        
        while (attempts < maxRetries) {
            try {
                await this.processGroup(chatId, results);
                
                // Succès : reset les tentatives
                this.retryAttempts.delete(retryKey);
                return;
                
            } catch (error) {
                attempts++;
                this.retryAttempts.set(retryKey, attempts);
                
                this.logError(`Tentative ${attempts}/${maxRetries} échoué pour ${chatId}`, error);
                
                if (attempts >= maxRetries) {
                    throw new Error(`Échec après ${maxRetries} tentatives: ${error.message}`);
                }
                
                // Attente progressive entre les tentatives
                await this.sleep(attempts * 2000);
            }
        }
    }

    /**
     * 🔄 Sauvegarde un groupe avec retry robuste
     */
    async saveGroupWithRetry(groupData, maxRetries = 3) {
        const retryKey = `save_${groupData.group_id}`;
        let attempts = this.retryAttempts.get(retryKey) || 0;
        
        while (attempts < maxRetries) {
            try {
                const data = await db.upsertGroup(groupData);
                
                // Succès : reset les tentatives
                this.retryAttempts.delete(retryKey);
                this.logSuccess(`Groupe sauvegardé: ${groupData.group_name}`);
                return data;
                
            } catch (error) {
                attempts++;
                this.retryAttempts.set(retryKey, attempts);
                
                this.logError(`Sauvegarde tentative ${attempts}/${maxRetries} pour ${groupData.group_name}`, error);
                
                if (attempts >= maxRetries) {
                    this.logError(`ÉCHEC DÉFINITIF sauvegarde ${groupData.group_name}`, error);
                    throw error;
                }
                
                // Attente progressive (2s, 4s, 6s...)
                await this.sleep(attempts * 2000);
            }
        }
    }

    /**
     * 🔄 Version améliorée de handleParticipantUpdate avec sauvegarde intelligente
     */
    async handleParticipantUpdateOptimized(groupId, participants, action, author) {
        try {
            // Marquer l'activité récente et ajouter aux updates en attente
            this.lastEventTime = Date.now();
            this.pendingUpdates.add(groupId);
            
            this.logInfo(`Événement "${action}" pour ${participants.length} participant(s) dans ${groupId}`);

            // Traiter l'événement immédiatement
            await this.handleParticipantUpdate(groupId, participants, action, author);
            
            // Si événement important (promotion/join/leave), déclencher une sauvegarde complète
            if (['add', 'remove', 'promote', 'demote'].includes(action)) {
                await this.triggerGroupRefresh(groupId);
            } else {
                // Pour les événements moins critiques, retirer quand même de pending updates
                this.pendingUpdates.delete(groupId);
            }

            // Reprogrammer la prochaine détection après événement
            this.scheduleNextDetection();

        } catch (error) {
            this.logError(`Erreur handleParticipantUpdateOptimized pour ${groupId}`, error);
            // En cas d'erreur, laisser dans pendingUpdates pour retry plus tard
        }
    }

    /**
     * 🔄 Déclenche une actualisation complète d'un groupe spécifique
     */
    async triggerGroupRefresh(groupId) {
        try {
            this.logInfo(`Actualisation complète du groupe ${groupId}`);
            
            const results = { groups: [], communities: [], errors: [] };
            await this.processGroupWithRetry(groupId, results);
            
            // Retirer de la liste des mises à jour en attente
            this.pendingUpdates.delete(groupId);
            
            this.logSuccess(`Groupe ${groupId} actualisé avec succès`);
            
        } catch (error) {
            this.logError(`Erreur actualisation groupe ${groupId}`, error);
        }
    }

    // ========================================
    // 🚀 SYSTÈME DE LOGGING ORGANISÉ
    // ========================================

    /**
     * 📝 Log une erreur de façon structurée
     */
    logError(message, error = null) {
        const timestamp = new Date().toISOString();
        const errorMsg = error ? `: ${error.message}` : '';
        console.error(`[${timestamp}] ❌ [GroupDetection] ${message}${errorMsg}`);
        
        // TODO: Ici on pourrait sauvegarder dans un fichier de log ou base de données
        this.saveLogToFile('ERROR', message, error);
    }

    /**
     * 📝 Log un succès de façon structurée
     */
    logSuccess(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ✅ [GroupDetection] ${message}`);
        this.saveLogToFile('SUCCESS', message);
    }

    /**
     * 📝 Log une info de façon structurée
     */
    logInfo(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 📊 [GroupDetection] ${message}`);
        this.saveLogToFile('INFO', message);
    }

    /**
     * 📝 Log un warning de façon structurée
     */
    logWarning(message) {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] ⚠️ [GroupDetection] ${message}`);
        this.saveLogToFile('WARNING', message);
    }

    /**
     * 💾 Sauvegarde les logs dans un fichier organisé
     */
    saveLogToFile(level, message, error = null) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Créer le dossier de logs s'il n'existe pas
            const logDir = path.join(process.cwd(), 'data', 'logs', 'group-detection');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // Nom de fichier avec date
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(logDir, `group-detection-${today}.log`);
            
            // Préparer l'entrée de log
            const timestamp = new Date().toISOString();
            const errorDetails = error ? `\nError Details: ${error.stack || error.message}` : '';
            const logEntry = `[${timestamp}] [${level}] ${message}${errorDetails}\n`;
            
            // Écrire dans le fichier
            fs.appendFileSync(logFile, logEntry);
            
        } catch (fileError) {
            // Ne pas faire échouer le processus principal si le logging échoue
            console.error('Erreur sauvegarde log:', fileError.message);
        }
    }

    /**
     * 🔄 Planifie la prochaine détection avec intervalle adaptatif
     */
    scheduleNextDetection() {
        // Annuler la programmation précédente
        if (this.adaptiveTimeout) {
            clearTimeout(this.adaptiveTimeout);
        }
        
        const nextInterval = this.getOptimizedInterval();
        this.logInfo(`Prochaine détection dans ${nextInterval/60000} min`);
        
        this.adaptiveTimeout = setTimeout(() => {
            if (!this.isDetecting && this.shouldRunPeriodicDetection()) {
                this.detectAllGroups()
                    .catch(error => this.logError('Erreur détection périodique', error))
                    .finally(() => {
                        // Reprogrammer la prochaine détection
                        this.scheduleNextDetection();
                    });
            } else {
                // Reprogrammer même si on ne détecte pas (pour réévaluer plus tard)
                this.scheduleNextDetection();
            }
        }, nextInterval);
    }

    /**
     * 🛑 Arrête le système de détection (cleanup)
     */
    stopAutoDetection() {
        if (this.adaptiveTimeout) {
            clearTimeout(this.adaptiveTimeout);
            this.adaptiveTimeout = null;
            this.logInfo('Système de détection automatique arrêté');
        }
        if (this.optimizedDetectionInterval) {
            clearInterval(this.optimizedDetectionInterval);
            this.optimizedDetectionInterval = null;
        }
    }

    /**
     * 🔄 Upsert participant avec mécanisme de retry
     */
    async upsertParticipantWithRetry(userData, maxRetries = 3) {
        const retryKey = `upsert_participant_${userData.group_id}_${userData.user_jid}`;
        let attempts = this.retryAttempts.get(retryKey) || 0;
        
        while (attempts < maxRetries) {
            try {
                const { error } = await db.supabase
                    .from('bot_group_participants')
                    .upsert(userData, { 
                        onConflict: 'group_id,user_jid',
                        ignoreDuplicates: false
                    });
                
                if (error) throw error;
                
                // Succès : reset les tentatives
                this.retryAttempts.delete(retryKey);
                return;
                
            } catch (error) {
                attempts++;
                this.retryAttempts.set(retryKey, attempts);
                
                this.logError(`Tentative ${attempts}/${maxRetries} upsert participant`, error);
                
                if (attempts >= maxRetries) {
                    this.logError(`ÉCHEC DÉFINITIF upsert participant ${userData.user_name}`, error);
                    throw error;
                }
                
                // Attente progressive
                await this.sleep(attempts * 1000);
            }
        }
    }

    /**
     * 📊 Obtient des statistiques sur l'optimisation
     */
    getOptimizationStats() {
        return {
            lastEventTime: new Date(this.lastEventTime).toISOString(),
            pendingUpdates: this.pendingUpdates.size,
            retryAttempts: this.retryAttempts.size,
            optimizedInterval: this.getOptimizedInterval() / 60000 + ' min',
            shouldRunDetection: this.shouldRunPeriodicDetection(),
            activeTimeout: !!this.adaptiveTimeout
        };
    }
}

module.exports = { GroupDetectionSystem };