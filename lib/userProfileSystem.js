/**
 * Système de récupération des profils utilisateurs WhatsApp
 * 
 * Ce système permet de:
 * - Récupérer les biographies/statuts WhatsApp
 * - Télécharger les photos de profil
 * - Obtenir des informations détaillées sur les comptes
 * - Détecter les comptes business/vérifiés
 */

const path = require('path');
const fs = require('fs').promises;
const { db } = require('./database');

class UserProfileSystem {
    constructor(sock) {
        this.sock = sock;
        this.profileCache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 heures
        this.rateLimitDelay = 2000; // 2 secondes entre les requêtes
        this.lastRequest = 0;
    }

    /**
     * Récupère le profil complet d'un utilisateur
     */
    async getUserProfile(userJid) {
        try {
            // Vérifier si le socket est connecté
            if (!this.sock || !this.sock.user) {
                console.log('⚠️ Socket non connecté pour récupérer le profil');
                return null;
            }

            // Vérifier le cache
            const cached = this.profileCache.get(userJid);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.data;
            }

            // Respecter le rate limiting
            await this.respectRateLimit();

            const profile = {
                jid: userJid,
                name: null,
                bio: null,
                profilePicture: null,
                isVerified: false,
                isBusiness: false,
                lastSeen: null,
                about: null,
                updatedAt: new Date().toISOString()
            };

            // Récupérer le nom/notify
            try {
                const contactInfo = this.sock.contacts[userJid];
                if (contactInfo) {
                    profile.name = contactInfo.name || contactInfo.notify || null;
                }
            } catch (error) {
                console.log(`ℹ️ Pas d'infos contact pour ${userJid}`);
            }

            // Récupérer le statut/biographie
            try {
                const status = await this.sock.fetchStatus(userJid);
                if (status) {
                    profile.bio = status.status;
                    profile.about = status.status;
                }
            } catch (error) {
                console.log(`ℹ️ Pas de statut disponible pour ${userJid}`);
            }

            // Récupérer la photo de profil
            try {
                const profilePicUrl = await this.sock.profilePictureUrl(userJid, 'image');
                if (profilePicUrl) {
                    profile.profilePicture = profilePicUrl;
                    // Optionnellement télécharger et sauvegarder localement
                    // profile.profilePictureLocal = await this.downloadProfilePicture(userJid, profilePicUrl);
                }
            } catch (error) {
                console.log(`ℹ️ Pas de photo de profil pour ${userJid}`);
            }

            // Détecter si c'est un compte business (sans récursion)
            try {
                profile.isBusiness = userJid.includes('@s.whatsapp.net') && await this.isBusinessAccount(userJid, profile.bio);
            } catch (error) {
                console.log(`ℹ️ Impossible de détecter le type de compte pour ${userJid}`);
                profile.isBusiness = false; // Valeur par défaut sécurisée
            }

            // Mettre en cache
            this.profileCache.set(userJid, {
                data: profile,
                timestamp: Date.now()
            });

            return profile;

        } catch (error) {
            console.error(`❌ Erreur récupération profil ${userJid}:`, error.message);
            return null;
        }
    }

    /**
     * Met à jour les profils de tous les participants d'un groupe
     */
    async updateGroupParticipantsProfiles(groupId) {
        try {
            console.log(`🔄 Mise à jour des profils pour le groupe ${groupId}`);

            // Récupérer les participants depuis la base de données
            const { data: participants, error } = await db.supabase
                .from('bot_group_participants')
                .select('user_jid, user_name')
                .eq('group_id', groupId)
                .eq('is_active', true);

            if (error) {
                throw new Error(`Erreur récupération participants: ${error.message}`);
            }

            if (!participants || participants.length === 0) {
                console.log('ℹ️ Aucun participant à traiter');
                return;
            }

            console.log(`👥 Traitement de ${participants.length} participants`);
            let updated = 0;

            for (const participant of participants) {
                try {
                    const profile = await this.getUserProfile(participant.user_jid);
                    
                    if (profile) {
                        await this.updateParticipantProfile(groupId, participant.user_jid, profile);
                        updated++;
                    }

                    // Délai pour éviter le spam
                    await this.sleep(this.rateLimitDelay);

                } catch (error) {
                    console.error(`❌ Erreur profil ${participant.user_jid}:`, error.message);
                }
            }

            console.log(`✅ ${updated} profils mis à jour sur ${participants.length}`);
            return { total: participants.length, updated };

        } catch (error) {
            console.error('❌ Erreur mise à jour profils groupe:', error);
            throw error;
        }
    }

    /**
     * Met à jour le profil d'un participant dans la base de données
     */
    async updateParticipantProfile(groupId, userJid, profile) {
        try {
            const updates = {
                user_name: profile.name || null,
                user_bio: profile.bio || null,
                profile_picture_url: profile.profilePicture || null,
                is_business: profile.isBusiness || false,
                is_verified: profile.isVerified || false,
                updated_at: new Date().toISOString()
            };

            // Tenter d'extraire prénom/nom si on a un nom complet
            if (profile.name) {
                const nameParts = profile.name.trim().split(' ');
                updates.first_name = nameParts[0] || null;
                updates.last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
            }

            const { error } = await db.supabase
                .from('bot_group_participants')
                .update(updates)
                .eq('group_id', groupId)
                .eq('user_jid', userJid);

            if (error) {
                throw new Error(`Erreur update participant: ${error.message}`);
            }

        } catch (error) {
            console.error('❌ Erreur update profil participant:', error);
            throw error;
        }
    }

    /**
     * Télécharge et sauvegarde une photo de profil
     */
    async downloadProfilePicture(userJid, profilePicUrl) {
        try {
            const response = await fetch(profilePicUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const fileName = `profile_${userJid.split('@')[0]}_${Date.now()}.jpg`;
            const filePath = path.join('data', 'profiles', fileName);

            // Créer le dossier si nécessaire
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Sauvegarder le fichier
            await fs.writeFile(filePath, Buffer.from(buffer));

            console.log(`📸 Photo de profil sauvegardée: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error('❌ Erreur téléchargement photo de profil:', error);
            return null;
        }
    }

    /**
     * Détecte si un compte est un compte business
     * Version sans récursion pour éviter les boucles infinies
     */
    async isBusinessAccount(userJid, existingBio = null) {
        try {
            // Essayer de récupérer les infos business via l'API
            // Note: Cette méthode peut nécessiter des permissions spéciales
            const businessInfo = await this.sock.getBusinessProfile(userJid);
            return !!businessInfo;
        } catch (error) {
            // Méthodes de détection alternatives basées sur la bio fournie
            // IMPORTANT: NE PAS appeler getUserProfile ici pour éviter la récursion
            if (existingBio) {
                const businessKeywords = [
                    'service', 'vente', 'achat', 'livraison', 'commerce',
                    'boutique', 'magasin', 'entreprise', 'company', 'business',
                    'contact', 'commande', 'prix', 'disponible', 'promo'
                ];
                
                const bioLower = existingBio.toLowerCase();
                return businessKeywords.some(keyword => bioLower.includes(keyword));
            }

            // Si pas de bio fournie, retourner false plutôt que de risquer la récursion
            return false;
        }
    }

    /**
     * Récupère les informations étendues d'un utilisateur
     */
    async getExtendedUserInfo(userJid) {
        try {
            const basicProfile = await this.getUserProfile(userJid);
            if (!basicProfile) return null;

            const extendedInfo = {
                ...basicProfile,
                phoneNumber: await db.extractPhoneNumber(userJid), // 🔧 FIX: Utiliser la fonction correcte
                countryInfo: null,
                activityLevel: 'unknown',
                joinDate: null,
                lastActivity: null
            };

            // 🔧 FIX: Détection du pays avec vérification
            if (extendedInfo.phoneNumber && extendedInfo.phoneNumber.match(/^\d{6,15}$/)) {
                const { countryDetector } = require('./countryDetection');
                extendedInfo.countryInfo = countryDetector.detectCountryFromPhone(extendedInfo.phoneNumber);
            }

            // Récupérer les infos d'activité depuis la base de données
            try {
                const { data: activityData } = await db.supabase
                    .from('bot_group_participants')
                    .select('participant_since, last_seen_in_group, message_count')
                    .eq('user_jid', userJid)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (activityData) {
                    extendedInfo.joinDate = activityData.participant_since;
                    extendedInfo.lastActivity = activityData.last_seen_in_group;
                    extendedInfo.activityLevel = this.calculateActivityLevel(activityData.message_count);
                }
            } catch (error) {
                console.log(`ℹ️ Pas d'infos d'activité pour ${userJid}`);
            }

            return extendedInfo;

        } catch (error) {
            console.error('❌ Erreur infos étendues utilisateur:', error);
            return null;
        }
    }

    /**
     * Calcule le niveau d'activité basé sur le nombre de messages
     */
    calculateActivityLevel(messageCount) {
        if (messageCount >= 1000) return 'très actif';
        if (messageCount >= 100) return 'actif';
        if (messageCount >= 10) return 'modéré';
        if (messageCount > 0) return 'peu actif';
        return 'inactif';
    }

    /**
     * Extrait le numéro de téléphone du JID
     */
    extractPhoneNumber(jid) {
        try {
            return jid.split('@')[0];
        } catch (error) {
            return null;
        }
    }

    /**
     * Détecte le pays à partir du numéro de téléphone
     */
    detectCountryFromPhone(phoneNumber) {
        if (!phoneNumber) return null;

        const countryMappings = {
            '33': { code: '+33', name: 'France', iso: 'FR' },
            '242': { code: '+242', name: 'Congo', iso: 'CG' },
            '237': { code: '+237', name: 'Cameroun', iso: 'CM' },
            '225': { code: '+225', name: "Côte d'Ivoire", iso: 'CI' },
            '221': { code: '+221', name: 'Sénégal', iso: 'SN' },
            '223': { code: '+223', name: 'Mali', iso: 'ML' },
            '227': { code: '+227', name: 'Niger', iso: 'NE' },
            '226': { code: '+226', name: 'Burkina Faso', iso: 'BF' },
            '229': { code: '+229', name: 'Bénin', iso: 'BJ' },
            '228': { code: '+228', name: 'Togo', iso: 'TG' },
            '235': { code: '+235', name: 'Tchad', iso: 'TD' },
            '236': { code: '+236', name: 'Centrafrique', iso: 'CF' },
            '240': { code: '+240', name: 'Guinée Équatoriale', iso: 'GQ' },
            '241': { code: '+241', name: 'Gabon', iso: 'GA' },
            '1': { code: '+1', name: 'États-Unis/Canada', iso: 'US' },
            '44': { code: '+44', name: 'Royaume-Uni', iso: 'GB' },
            '49': { code: '+49', name: 'Allemagne', iso: 'DE' },
            '34': { code: '+34', name: 'Espagne', iso: 'ES' },
            '39': { code: '+39', name: 'Italie', iso: 'IT' },
            '32': { code: '+32', name: 'Belgique', iso: 'BE' },
            '41': { code: '+41', name: 'Suisse', iso: 'CH' },
            '212': { code: '+212', name: 'Maroc', iso: 'MA' },
            '213': { code: '+213', name: 'Algérie', iso: 'DZ' },
            '216': { code: '+216', name: 'Tunisie', iso: 'TN' }
        };

        // Essayer différentes longueurs de codes pays
        for (let len = 3; len >= 1; len--) {
            const prefix = phoneNumber.substring(0, len);
            if (countryMappings[prefix]) {
                return countryMappings[prefix];
            }
        }

        return { code: null, name: 'Inconnu', iso: null };
    }

    /**
     * Respecte les limites de taux d'API
     */
    async respectRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            await this.sleep(waitTime);
        }
        
        this.lastRequest = Date.now();
    }

    /**
     * Utilitaire pour les délais
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Nettoie le cache des profils
     */
    clearCache() {
        this.profileCache.clear();
        console.log('🧹 Cache des profils nettoyé');
    }

    /**
     * Obtient les statistiques du cache
     */
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [jid, entry] of this.profileCache.entries()) {
            if ((now - entry.timestamp) < this.cacheTimeout) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        }

        return {
            totalEntries: this.profileCache.size,
            validEntries,
            expiredEntries,
            cacheTimeout: this.cacheTimeout
        };
    }

    /**
     * Traitement en lot des profils utilisateurs
     */
    async batchUpdateProfiles(userJids, batchSize = 10) {
        console.log(`🔄 Traitement en lot de ${userJids.length} profils (batch: ${batchSize})`);
        
        const results = {
            processed: 0,
            errors: 0,
            profiles: []
        };

        for (let i = 0; i < userJids.length; i += batchSize) {
            const batch = userJids.slice(i, i + batchSize);
            console.log(`📦 Traitement batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(userJids.length/batchSize)}`);

            for (const userJid of batch) {
                try {
                    const profile = await this.getUserProfile(userJid);
                    if (profile) {
                        results.profiles.push(profile);
                        results.processed++;
                    }
                } catch (error) {
                    console.error(`❌ Erreur profil ${userJid}:`, error.message);
                    results.errors++;
                }

                await this.sleep(this.rateLimitDelay);
            }

            // Pause entre les batches
            await this.sleep(5000);
        }

        console.log(`✅ Traitement terminé: ${results.processed} profils, ${results.errors} erreurs`);
        return results;
    }
}

module.exports = { UserProfileSystem };