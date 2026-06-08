/**
 * Système de mise à jour en temps réel des groupes et utilisateurs
 * 
 * Ce système écoute les événements WhatsApp et met automatiquement
 * à jour la base de données en temps réel.
 */

const { GroupDetectionSystem } = require('./groupDetection');
const { UserProfileSystem } = require('./userProfileSystem');
const { db } = require('./database');

class RealtimeUpdater {
    constructor(sock) {
        this.sock = sock;
        this.groupDetection = new GroupDetectionSystem(sock);
        this.profileSystem = new UserProfileSystem(sock);
        this.isEnabled = true;
        this.eventQueue = [];
        this.processing = false;
    }

    /**
     * Initialise les écouteurs d'événements WhatsApp
     */
    initialize() {
        console.log('🚀 Initialisation du système de mise à jour en temps réel...');

        // Événements de groupes
        this.sock.ev.on('groups.update', this.handleGroupsUpdate.bind(this));
        this.sock.ev.on('group-participants.update', this.handleParticipantsUpdate.bind(this));
        this.sock.ev.on('group.join', this.handleGroupJoin.bind(this));
        this.sock.ev.on('group.leave', this.handleGroupLeave.bind(this));

        // Événements de messages (pour tracking d'activité)
        this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));

        // Événements de connexion
        this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

        // Démarrer la détection automatique des groupes
        this.groupDetection.startAutoDetection();

        console.log('✅ Système de mise à jour en temps réel activé');
    }

    /**
     * Gère les mises à jour de groupes
     */
    async handleGroupsUpdate(updates) {
        if (!this.isEnabled) return;

        try {
            console.log(`📝 Mise à jour de ${updates.length} groupes`);

            for (const update of updates) {
                await this.queueEvent({
                    type: 'group_update',
                    data: update,
                    timestamp: new Date()
                });
            }

        } catch (error) {
            console.error('❌ Erreur handleGroupsUpdate:', error);
        }
    }

    /**
     * Gère les mises à jour de participants
     */
    async handleParticipantsUpdate(update) {
        if (!this.isEnabled) return;

        try {
            console.log(`👥 Mise à jour participants pour ${update.id}: ${update.action}`);

            await this.queueEvent({
                type: 'participants_update',
                data: update,
                timestamp: new Date()
            });

        } catch (error) {
            console.error('❌ Erreur handleParticipantsUpdate:', error);
        }
    }

    /**
     * Gère l'ajout du bot à un groupe
     */
    async handleGroupJoin(groupJid) {
        if (!this.isEnabled) return;

        try {
            console.log(`🎉 Bot ajouté au groupe: ${groupJid}`);

            await this.queueEvent({
                type: 'group_join',
                data: { groupJid },
                timestamp: new Date()
            });

        } catch (error) {
            console.error('❌ Erreur handleGroupJoin:', error);
        }
    }

    /**
     * Gère la sortie du bot d'un groupe
     */
    async handleGroupLeave(groupJid) {
        if (!this.isEnabled) return;

        try {
            console.log(`👋 Bot retiré du groupe: ${groupJid}`);

            await this.queueEvent({
                type: 'group_leave',
                data: { groupJid },
                timestamp: new Date()
            });

        } catch (error) {
            console.error('❌ Erreur handleGroupLeave:', error);
        }
    }

    /**
     * Gère les nouveaux messages (pour tracking d'activité)
     */
    async handleMessagesUpsert(messageUpdate) {
        if (!this.isEnabled) return;

        try {
            for (const message of messageUpdate.messages) {
                if (message.key.remoteJid.endsWith('@g.us')) {
                    await this.queueEvent({
                        type: 'message_activity',
                        data: {
                            groupJid: message.key.remoteJid,
                            userJid: message.key.participantAlt || message.key.participant || message.key.remoteJid,
                            messageId: message.key.id,
                            timestamp: new Date(message.messageTimestamp * 1000)
                        },
                        timestamp: new Date()
                    });
                }
            }

        } catch (error) {
            console.error('❌ Erreur handleMessagesUpsert:', error);
        }
    }

    /**
     * Gère les mises à jour de connexion
     */
    async handleConnectionUpdate(update) {
        if (update.connection === 'open') {
            console.log('🔄 Connexion établie, lancement de la détection initiale...');
            
            // Attendre un peu puis lancer la détection
            setTimeout(() => {
                this.groupDetection.detectAllGroups().catch(error => {
                    console.error('❌ Erreur détection initiale:', error);
                });
            }, 5000);
        }
    }

    /**
     * Ajoute un événement à la queue de traitement
     */
    async queueEvent(event) {
        this.eventQueue.push(event);
        
        // Traiter la queue si elle n'est pas déjà en cours de traitement
        if (!this.processing) {
            await this.processEventQueue();
        }
    }

    /**
     * Traite la queue d'événements
     */
    async processEventQueue() {
        if (this.processing || this.eventQueue.length === 0) return;

        this.processing = true;

        try {
            while (this.eventQueue.length > 0) {
                const event = this.eventQueue.shift();
                await this.processEvent(event);
                
                // Petit délai pour éviter de surcharger
                await this.sleep(500);
            }

        } catch (error) {
            console.error('❌ Erreur processEventQueue:', error);
        } finally {
            this.processing = false;
        }
    }

    /**
     * Traite un événement spécifique
     */
    async processEvent(event) {
        try {
            switch (event.type) {
                case 'group_update':
                    await this.processGroupUpdate(event.data);
                    break;

                case 'participants_update':
                    await this.processParticipantsUpdate(event.data);
                    break;

                case 'group_join':
                    await this.processGroupJoin(event.data.groupJid);
                    break;

                case 'group_leave':
                    await this.processGroupLeave(event.data.groupJid);
                    break;

                case 'message_activity':
                    await this.processMessageActivity(event.data);
                    break;

                default:
                    console.log(`⚠️ Type d'événement inconnu: ${event.type}`);
            }

        } catch (error) {
            console.error(`❌ Erreur traitement événement ${event.type}:`, error);
        }
    }

    /**
     * Traite une mise à jour de groupe
     */
    async processGroupUpdate(update) {
        try {
            const updates = {};

            if (update.subject !== undefined) {
                updates.group_name = update.subject;
            }

            if (update.desc !== undefined) {
                updates.group_description = update.desc;
            }

            if (update.announce !== undefined) {
                updates.metadata = { announce: update.announce };
            }

            updates.last_activity = new Date().toISOString();
            updates.updated_at = new Date().toISOString();

            if (Object.keys(updates).length > 0) {
                const { error } = await db.supabase
                    .from('bot_groups')
                    .update(updates)
                    .eq('group_id', update.id);

                if (error) {
                    console.error('❌ Erreur update groupe:', error);
                } else {
                    console.log(`✅ Groupe ${update.id} mis à jour`);
                }
            }

        } catch (error) {
            console.error('❌ Erreur processGroupUpdate:', error);
        }
    }

    /**
     * Traite une mise à jour de participants
     */
    async processParticipantsUpdate(update) {
        try {
            const { id: groupId, participants, action } = update;

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
                    console.log(`⚠️ Action participants inconnue: ${action}`);
            }

            // Mettre à jour le compteur de participants
            await this.updateParticipantCount(groupId);

        } catch (error) {
            console.error('❌ Erreur processParticipantsUpdate:', error);
        }
    }

    /**
     * Gère l'ajout de participants
     */
    async handleParticipantsAdd(groupId, participants) {
        try {
            console.log(`➕ Ajout de ${participants.length} participants au groupe ${groupId}`);

            for (const userJid of participants) {
                // 🔧 FIX: Récupérer les infos du participant avec les bonnes fonctions
                const profile = await this.profileSystem.getUserProfile(userJid);
                const phoneNumber = await db.extractPhoneNumber(userJid);
                
                // 🔧 FIX: Détection du pays avec vérification
                let countryInfo = { code: null, name: null };
                if (phoneNumber && phoneNumber.match(/^\d{6,15}$/)) {
                    const { countryDetector } = require('./countryDetection');
                    countryInfo = countryDetector.detectCountryFromPhone(phoneNumber);
                }

                const participantData = {
                    group_id: groupId,
                    user_jid: userJid,
                    user_phone: phoneNumber,
                    user_name: profile?.name || phoneNumber,
                    first_name: profile?.name ? profile.name.split(' ')[0] : null,
                    last_name: profile?.name && profile.name.split(' ').length > 1 ? profile.name.split(' ').slice(1).join(' ') : null,
                    user_bio: profile?.bio || null,
                    profile_picture_url: profile?.profilePicture || null,
                    country_code: countryInfo.code,
                    country_name: countryInfo.name,
                    is_admin: false,
                    is_owner: false,
                    participant_since: new Date().toISOString(),
                    last_seen_in_group: new Date().toISOString(),
                    is_active: true,
                    additional_info: {
                        added_by: 'system', // TODO: détecter qui a ajouté
                        join_method: 'added'
                    }
                };

                const { error } = await db.supabase
                    .from('bot_group_participants')
                    .upsert(participantData, { 
                        onConflict: 'group_id,user_jid',
                        ignoreDuplicates: false
                    });

                if (error) {
                    console.error(`❌ Erreur ajout participant ${userJid}:`, error);
                } else {
                    console.log(`✅ Participant ${userJid} ajouté`);
                }

                await this.sleep(1000); // Rate limiting
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
            console.log(`➖ Suppression de ${participants.length} participants du groupe ${groupId}`);

            for (const userJid of participants) {
                // Vérifier si c'est le bot qui est retiré
                const botJid = this.sock.authState?.creds?.me?.id;
                const normalizedBotJid = botJid ? botJid.split(':')[0] + '@s.whatsapp.net' : null;
                const normalizedUserJid = userJid.split(':')[0] + '@s.whatsapp.net';

                if (normalizedBotJid && normalizedUserJid === normalizedBotJid) {
                    console.log(`🤖 LE BOT A ÉTÉ RETIRÉ du groupe ${groupId} !`);
                    await this.handleBotRemoval(groupId);
                    continue;
                }

                const { error } = await db.supabase
                    .from('bot_group_participants')
                    .update({ 
                        is_active: false,
                        updated_at: new Date().toISOString()
                    })
                    .eq('group_id', groupId)
                    .eq('user_jid', userJid);

                if (!error) {
                    // Supprimer aussi des admins si applicable
                    await db.supabase
                        .from('bot_group_admins')
                        .update({ is_active: false })
                        .eq('group_id', groupId)
                        .eq('user_jid', userJid);

                    console.log(`✅ Participant ${userJid} marqué comme inactif`);
                } else {
                    console.error(`❌ Erreur suppression participant ${userJid}:`, error);
                }
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsRemove:', error);
        }
    }

    /**
     * Gère la promotion de participants (vers admin)
     */
    async handleParticipantsPromote(groupId, participants) {
        try {
            console.log(`⬆️ Promotion de ${participants.length} participants dans ${groupId}`);

            for (const userJid of participants) {
                // Mettre à jour le statut dans participants
                await db.supabase
                    .from('bot_group_participants')
                    .update({ 
                        is_admin: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('group_id', groupId)
                    .eq('user_jid', userJid);

                // Récupérer le nom du participant
                const { data: participantData } = await db.supabase
                    .from('bot_group_participants')
                    .select('user_name')
                    .eq('group_id', groupId)
                    .eq('user_jid', userJid)
                    .single();

                // Ajouter aux admins
                const adminData = {
                    group_id: groupId,
                    user_jid: userJid,
                    user_name: participantData?.user_name || null,
                    admin_type: 'admin',
                    granted_at: new Date().toISOString(),
                    is_active: true
                };

                await db.supabase
                    .from('bot_group_admins')
                    .upsert(adminData, { 
                        onConflict: 'group_id,user_jid',
                        ignoreDuplicates: false
                    });

                console.log(`✅ ${userJid} promu admin`);
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsPromote:', error);
        }
    }

    /**
     * Gère la rétrogradation de participants (retrait admin)
     */
    async handleParticipantsDemote(groupId, participants) {
        try {
            console.log(`⬇️ Rétrogradation de ${participants.length} participants dans ${groupId}`);

            for (const userJid of participants) {
                // Vérifier si c'est le bot qui est demoté
                const botJid = this.sock.authState?.creds?.me?.id;
                const normalizedBotJid = botJid ? botJid.split(':')[0] + '@s.whatsapp.net' : null;
                const normalizedUserJid = userJid.split(':')[0] + '@s.whatsapp.net';

                if (normalizedBotJid && normalizedUserJid === normalizedBotJid) {
                    console.log(`🤖 LE BOT A ÉTÉ RÉTROGRADÉ dans ${groupId} !`);
                    await this.handleBotDemotion(groupId);
                }

                // Mettre à jour le statut dans participants
                await db.supabase
                    .from('bot_group_participants')
                    .update({ 
                        is_admin: false,
                        updated_at: new Date().toISOString()
                    })
                    .eq('group_id', groupId)
                    .eq('user_jid', userJid);

                // Désactiver dans les admins
                await db.supabase
                    .from('bot_group_admins')
                    .update({ is_active: false })
                    .eq('group_id', groupId)
                    .eq('user_jid', userJid);

                console.log(`✅ ${userJid} rétrogradé`);
            }

        } catch (error) {
            console.error('❌ Erreur handleParticipantsDemote:', error);
        }
    }

    /**
     * Traite l'ajout du bot à un nouveau groupe
     */
    async processGroupJoin(groupJid) {
        try {
            console.log(`🚀 Traitement ajout bot au groupe ${groupJid}`);
            
            // Lancer une détection complète du nouveau groupe
            await this.groupDetection.processGroup(groupJid, { groups: [], communities: [], errors: [] });
            
            console.log(`✅ Nouveau groupe ${groupJid} traité`);

        } catch (error) {
            console.error('❌ Erreur processGroupJoin:', error);
        }
    }

    /**
     * Gère la démotion du bot (perte des droits admin)
     */
    async handleBotDemotion(groupId) {
        try {
            console.log(`⚠️ Traitement démotion du bot dans ${groupId}`);

            // Mettre à jour les flags bot_admin dans bot_groups
            const { error } = await db.supabase
                .from('bot_groups')
                .update({ 
                    is_bot_admin: false,
                    updated_at: new Date().toISOString(),
                    last_activity: new Date().toISOString()
                })
                .eq('group_id', groupId);

            if (error) {
                console.error('❌ Erreur update bot_groups lors démotion:', error);
            } else {
                console.log(`✅ Statut admin du bot mis à jour pour ${groupId}`);
            }

        } catch (error) {
            console.error('❌ Erreur handleBotDemotion:', error);
        }
    }

    /**
     * Gère le retrait du bot du groupe
     */
    async handleBotRemoval(groupId) {
        try {
            console.log(`🚪 Traitement retrait du bot du groupe ${groupId}`);

            // Marquer le groupe comme inactif et supprimer le lien avec l'utilisateur
            const { error } = await db.supabase
                .from('bot_groups')
                .update({ 
                    is_active: false,
                    is_bot_admin: false,
                    bot_is_owner: false,
                    user_id: null, // Supprimer le lien avec l'utilisateur
                    updated_at: new Date().toISOString()
                })
                .eq('group_id', groupId);

            if (error) {
                console.error('❌ Erreur update bot_groups lors retrait:', error);
            } else {
                console.log(`✅ Groupe ${groupId} marqué comme inactif et délié`);
            }

            // Supprimer le code de liaison s'il existe
            await db.supabase
                .from('group_link_codes')
                .delete()
                .eq('group_id', groupId);

        } catch (error) {
            console.error('❌ Erreur handleBotRemoval:', error);
        }
    }

    /**
     * Traite la sortie du bot d'un groupe
     */
    async processGroupLeave(groupJid) {
        try {
            console.log(`🚪 Traitement sortie bot du groupe ${groupJid}`);
            await this.handleBotRemoval(groupJid);

        } catch (error) {
            console.error('❌ Erreur processGroupLeave:', error);
        }
    }

    /**
     * Traite l'activité de message
     */
    async processMessageActivity(data) {
        try {
            // Mettre à jour la dernière activité du groupe
            await db.supabase
                .from('bot_groups')
                .update({ 
                    last_activity: data.timestamp.toISOString()
                })
                .eq('group_id', data.groupJid);

            // Mettre à jour l'activité du participant et incrémenter le compteur de messages
            const { error } = await db.supabase
                .from('bot_group_participants')
                .update({ 
                    last_seen_in_group: data.timestamp.toISOString(),
                    message_count: db.supabase.rpc('increment_message_count', { 
                        group_jid: data.groupJid, 
                        user_jid: data.userJid 
                    })
                })
                .eq('group_id', data.groupJid)
                .eq('user_jid', data.userJid);

            if (error) {
                console.error('❌ Erreur update activité:', error);
            }

        } catch (error) {
            console.error('❌ Erreur processMessageActivity:', error);
        }
    }

    /**
     * Met à jour le compteur de participants d'un groupe
     */
    async updateParticipantCount(groupId) {
        try {
            const { count, error } = await db.supabase
                .from('bot_group_participants')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', groupId)
                .eq('is_active', true);

            if (!error) {
                await db.supabase
                    .from('bot_groups')
                    .update({ 
                        participant_count: count,
                        updated_at: new Date().toISOString()
                    })
                    .eq('group_id', groupId);
            }

        } catch (error) {
            console.error('❌ Erreur updateParticipantCount:', error);
        }
    }

    /**
     * Utilitaires
     */
    extractPhoneNumber(jid) {
        return jid.split('@')[0];
    }

    detectCountryFromPhone(phoneNumber) {
        if (!phoneNumber) return { code: null, name: null };

        const countryMappings = {
            '33': { code: '+33', name: 'France' },
            '242': { code: '+242', name: 'Congo' },
            '237': { code: '+237', name: 'Cameroun' },
            '225': { code: '+225', name: "Côte d'Ivoire" },
            '221': { code: '+221', name: 'Sénégal' },
            '1': { code: '+1', name: 'États-Unis/Canada' }
        };

        for (const [code, info] of Object.entries(countryMappings)) {
            if (phoneNumber.startsWith(code)) {
                return info;
            }
        }

        return { code: null, name: null };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Contrôle du système
     */
    enable() {
        this.isEnabled = true;
        console.log('✅ Système de mise à jour en temps réel activé');
    }

    disable() {
        this.isEnabled = false;
        console.log('⏸️ Système de mise à jour en temps réel désactivé');
    }

    /**
     * Obtient les statistiques du système
     */
    getStats() {
        return {
            isEnabled: this.isEnabled,
            queueLength: this.eventQueue.length,
            processing: this.processing,
            groupDetectionStats: this.groupDetection ? this.groupDetection.getDetectionStats() : null
        };
    }
}

module.exports = { RealtimeUpdater };