const { db } = require('./database');
const settings = require('../config/settings');

/**
 * SYSTÈME CENTRALISÉ DE VÉRIFICATION DES PERMISSIONS
 * 
 * Ce système unifie toutes les vérifications de permissions en un seul endroit.
 * Il gère automatiquement les différents formats de JID (privé vs groupe)
 * et utilise le système de mapping pour associer les JIDs.
 */

async function isOwnerOrSudo(senderId, sock = null, chatId = null) {
    if (!senderId) return false;
    
    try {
        console.log(`🔍 Vérification permissions pour: ${senderId}`);
        
        // ÉTAPE 1: Résoudre le JID vers son JID principal via le système de mapping
        const resolvedJid = await db.resolveToUserJid(senderId);
        console.log(`🔄 JID résolu: ${senderId} → ${resolvedJid}`);
        
        // ÉTAPE 2: Vérifier dans la base de données avec le JID résolu
        const user = await db.getUser(resolvedJid);
        if (user && (user.is_owner || user.is_sudo)) {
            console.log(`✅ Permissions trouvées en DB: ${user.is_owner ? 'OWNER' : 'SUDO'} pour ${resolvedJid}`);
            return true;
        }
        
        // ÉTAPE 3: Vérification fallback avec le numéro de propriétaire configuré
        const ownerNumber = settings.ownerNumber;
        const ownerJidPrivate = ownerNumber + '@s.whatsapp.net';
        
        if (resolvedJid === ownerJidPrivate || senderId === ownerJidPrivate) {
            console.log(`✅ Propriétaire configuré reconnu: ${ownerJidPrivate}`);
            
            // Auto-enregistrer le propriétaire dans la DB s'il n'y est pas
            if (!user) {
                await db.upsertUser({
                    user_id: ownerJidPrivate,
                    is_owner: true,
                    phone_number: ownerNumber
                });
                console.log(`📝 Propriétaire auto-enregistré en DB: ${ownerJidPrivate}`);
            }
            
            return true;
        }
        
        // ÉTAPE 4: Système désactivé pour la sécurité - pas d'auto-mapping
        // Note: L'auto-mapping sera réactivé uniquement après création manuelle du mapping initial
        if (senderId !== resolvedJid && !senderId.includes('@s.whatsapp.net')) {
            console.log(`⚠️ JID de groupe sans mapping détecté: ${senderId}`);
            console.log(`ℹ️ Auto-mapping désactivé pour la sécurité. Utilisez createJidMapping() pour créer le mapping manuellement.`);
        }
        
        console.log(`❌ Aucune permission trouvée pour: ${senderId}`);
        return false;
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification des permissions:', error);
        return false;
    }
}

/**
 * Vérifier si l'utilisateur est propriétaire d'un ou plusieurs companions
 * Utilise le système centralisé de résolution de JID
 */
async function isCompanionOwner(senderId) {
    if (!senderId) return { isCompanionOwner: false, companions: [] };
    
    try {
        // Utiliser le système centralisé pour résoudre le JID
        const resolvedJid = await db.resolveToUserJid(senderId);
        console.log(`🔍 Vérification companion ownership pour: ${senderId} → ${resolvedJid}`);
        
        // Chercher tous les companions appartenant à cet utilisateur
        const { data: companions, error } = await db.supabase
            .from('companions')
            .select('*')
            .eq('owner_jid', resolvedJid);
        
        if (error) {
            console.error('Error checking companion ownership:', error);
            return { isCompanionOwner: false, companions: [] };
        }
        
        const isCompanionOwner = companions && companions.length > 0;
        
        if (isCompanionOwner) {
            console.log(`✅ Companion ownership trouvé: ${companions.length} companions pour ${resolvedJid}`);
        }
        
        return {
            isCompanionOwner,
            companions: companions || []
        };
        
    } catch (error) {
        console.error('Error in isCompanionOwner:', error);
        return { isCompanionOwner: false, companions: [] };
    }
}

/**
 * Vérifier si l'utilisateur a des permissions étendues (owner/sudo OU propriétaire de companion)
 * Utilise le système centralisé
 */
async function hasExtendedPermissions(senderId, sock = null, chatId = null) {
    if (!senderId) return { hasPermission: false, type: 'none', companions: [] };
    
    try {
        console.log(`🔍 Vérification permissions étendues pour: ${senderId}`);
        
        // Vérifier propriétaire/sudo principal
        const isMainOwner = await isOwnerOrSudo(senderId, sock, chatId);
        if (isMainOwner) {
            return { 
                hasPermission: true, 
                type: 'owner_sudo', 
                companions: [] 
            };
        }
        
        // Ensuite vérifier propriétaire de companion
        const companionCheck = await isCompanionOwner(senderId);
        if (companionCheck.isCompanionOwner) {
            return {
                hasPermission: true,
                type: 'companion_owner',
                companions: companionCheck.companions
            };
        }
        
        return { hasPermission: false, type: 'none', companions: [] };
        
    } catch (error) {
        console.error('Error checking extended permissions:', error);
        return { hasPermission: false, type: 'none', companions: [] };
    }
}

/**
 * FONCTION UTILITAIRE: Créer manuellement un mapping entre JID de groupe et JID principal
 * Utile pour l'administrateur système
 */
async function createJidMapping(primaryJid, groupJid, phoneNumber = null, verifiedBy = 'manual') {
    try {
        console.log(`📝 Création mapping manuel: ${groupJid} → ${primaryJid}`);
        
        const mapping = await db.upsertJidMapping({
            primaryJid: primaryJid,
            groupJid: groupJid,
            phoneNumber: phoneNumber,
            verified: true,
            verifiedBy: verifiedBy
        });
        
        console.log(`✅ Mapping créé avec succès`);
        return mapping;
        
    } catch (error) {
        console.error('❌ Erreur lors de la création du mapping:', error);
        throw error;
    }
}

/**
 * FONCTION UTILITAIRE: Afficher tous les mappings pour un utilisateur
 */
async function getUserMappings(primaryJid) {
    try {
        const mappings = await db.findAssociatedJids(primaryJid);
        console.log(`📋 Mappings pour ${primaryJid}:`, mappings);
        return mappings;
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des mappings:', error);
        return [];
    }
}

/**
 * FONCTION SPÉCIALE: Configurer le mapping pour l'utilisateur principal
 * Cette fonction configure spécifiquement votre mapping personnel
 */
async function setupOwnerMapping() {
    try {
        const ownerNumber = settings.ownerNumber; // 242065491040
        const primaryJid = ownerNumber + '@s.whatsapp.net'; // 242065491040@s.whatsapp.net
        const groupJid = '224772868833471'; // Votre JID de groupe
        
        console.log(`🔧 Configuration du mapping pour le propriétaire principal...`);
        console.log(`📱 Numéro: ${ownerNumber}`);
        console.log(`🔑 JID privé: ${primaryJid}`);
        console.log(`👥 JID groupe: ${groupJid}`);
        
        // Créer le mapping
        const mapping = await createJidMapping(primaryJid, groupJid, ownerNumber, 'owner_setup');
        
        // S'assurer que l'utilisateur est enregistré comme propriétaire
        await db.upsertUser({
            user_id: primaryJid,
            is_owner: true,
            phone_number: ownerNumber
        });
        
        console.log(`✅ Configuration terminée! Le système reconnaîtra maintenant:`);
        console.log(`   - En privé: ${primaryJid}`);
        console.log(`   - Dans les groupes: ${groupJid}`);
        
        return { success: true, mapping, primaryJid, groupJid };
        
    } catch (error) {
        console.error('❌ Erreur lors de la configuration du mapping propriétaire:', error);
        throw error;
    }
}

// Garder la compatibilité - export principal pour l'ancienne structure
module.exports = isOwnerOrSudo;

// Ajouter toutes les fonctions comme propriétés
module.exports.isOwnerOrSudo = isOwnerOrSudo;
module.exports.isCompanionOwner = isCompanionOwner;
module.exports.hasExtendedPermissions = hasExtendedPermissions;
module.exports.createJidMapping = createJidMapping;
module.exports.getUserMappings = getUserMappings;
module.exports.setupOwnerMapping = setupOwnerMapping;