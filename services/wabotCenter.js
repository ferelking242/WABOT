const { db } = require('../lib/database');
const { isCommunity } = require('../commands/community/whatsapp-community');

/**
 * 🚀 WABOT CENTER SERVICE - Dedicated module for community admin group management
 * Creates and manages Wabot Centers (admin groups) for WhatsApp communities
 */

/**
 * Main function to create Wabot Center when bot joins/promoted in community
 */
async function createWabotCenter(sock, communityId, communityName, botJid) {
    try {
        console.log(`🏗️ Creating Wabot Center for community: ${communityName}`);
        
        // ATOMIC IDEMPOTENCE: Check and claim creation right atomically
        const existingCenter = await atomicClaimWabotCenterCreation(communityId, communityName);
        if (existingCenter === false) {
            console.log(`ℹ️ Wabot Center creation already claimed/exists for ${communityName}, skipping`);
            return null;
        } else if (existingCenter && existingCenter.wabot_center_id) {
            console.log(`ℹ️ Wabot Center already exists for ${communityName}: ${existingCenter.wabot_center_id}`);
            return existingCenter.wabot_center_id;
        }
        
        // Get REAL community admins from announcement group (most authoritative)
        const communityAdmins = await getCommunityAdminsRobust(sock, communityId, communityName);
        if (!communityAdmins || communityAdmins.length === 0) {
            console.log(`⚠️ No admins found in community ${communityName}, cannot create Wabot Center`);
            await markWabotCenterCreationFailed(communityId, 'No admins found');
            return null;
        }
        
        console.log(`👥 Found ${communityAdmins.length} admins in community ${communityName}`);
        
        // Create Wabot Center group name
        const wabotCenterName = `🤖 Wabot Center - ${communityName}`;
        
        // Create the group using Baileys groupCreate with proper error handling
        let createdGroup;
        try {
            createdGroup = await sock.groupCreate(wabotCenterName, communityAdmins);
        } catch (createError) {
            console.error(`❌ Failed to create Wabot Center group:`, createError);
            await markWabotCenterCreationFailed(communityId, createError.message);
            return null;
        }
        
        const wabotCenterId = createdGroup.id;
        console.log(`✅ Wabot Center created successfully: ${wabotCenterId}`);
        
        // Handle per-participant add failures and send invite links if needed
        await handleWabotCenterMembershipIssues(sock, wabotCenterId, communityAdmins, wabotCenterName);
        
        // Save to database with proper error handling
        const saveSuccess = await saveWabotCenterToDatabase(communityId, wabotCenterId, communityName, wabotCenterName);
        if (!saveSuccess) {
            console.error(`❌ Failed to save Wabot Center to database, but group was created: ${wabotCenterId}`);
        }
        
        // Send welcome message and setup
        await sendWabotCenterWelcomeMessage(sock, wabotCenterId, communityName);
        await setupWabotCenterSettings(sock, wabotCenterId);
        
        console.log(`🎉 Wabot Center setup completed for community: ${communityName}`);
        return wabotCenterId;
        
    } catch (error) {
        console.error(`❌ Error creating Wabot Center for ${communityName}:`, error);
        await markWabotCenterCreationFailed(communityId, error.message);
        return null;
    }
}

/**
 * Get REAL community admins from announcement group with fallbacks
 */
async function getCommunityAdminsRobust(sock, communityId, communityName) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        try {
            // Method 1: Try to get community metadata (most authoritative)
            const communityMeta = await sock.groupMetadata(communityId);
            
            // Check if this is the announcement group by looking for community indicators
            const communityAdmins = communityMeta.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);
                
            if (communityAdmins.length > 0) {
                console.log(`✅ Found ${communityAdmins.length} admins via direct metadata`);
                return communityAdmins;
            }
            
            // Method 2: If no admins found, try to resolve announcement group
            // For communities, communityId might be linked group, need to find root
            try {
                // Try to find linked community root via community helpers
                const { getCommunitySettings } = require('../commands/community/whatsapp-community');
                const settings = await getCommunitySettings(communityId);
                
                if (settings && settings.community_root_id && settings.community_root_id !== communityId) {
                    console.log(`🔍 Trying community root: ${settings.community_root_id}`);
                    const rootMeta = await sock.groupMetadata(settings.community_root_id);
                    const rootAdmins = rootMeta.participants
                        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                        .map(p => p.id);
                        
                    if (rootAdmins.length > 0) {
                        console.log(`✅ Found ${rootAdmins.length} admins via community root`);
                        return rootAdmins;
                    }
                }
            } catch (rootError) {
                console.log(`⚠️ Failed to get community root admins: ${rootError.message}`);
            }
            
            // Method 3: Fallback - use current group admins if any
            if (communityAdmins.length > 0) {
                console.log(`⚠️ Using fallback: ${communityAdmins.length} admins from current group`);
                return communityAdmins;
            }
            
            break; // Exit retry loop if we got metadata but no admins
            
        } catch (metaError) {
            attempts++;
            console.log(`❌ Admin discovery attempt ${attempts}/${maxAttempts} failed:`, metaError.message);
            
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, attempts * 2000));
            } else {
                console.error(`❌ Failed to get community admins after ${maxAttempts} attempts`);
                return null;
            }
        }
    }
    
    return null;
}

/**
 * ATOMIC: Claim the right to create a Wabot Center atomically
 */
async function atomicClaimWabotCenterCreation(communityId, communityName) {
    try {
        const now = new Date().toISOString();
        
        // Try to INSERT with onConflict handling - atomic creation claim
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .upsert({
                community_id: communityId,
                community_name: communityName,
                is_active: false, // Mark as "being created"
                created_at: now,
                updated_at: now
            }, { 
                onConflict: 'community_id',
                ignoreDuplicates: false
            })
            .select('*')
            .single();
            
        if (error) {
            console.error('❌ Error in atomic Wabot Center creation claim:', error);
            return false;
        }
        
        // If existing record has wabot_center_id, it already exists
        if (data.wabot_center_id) {
            return data;
        }
        
        // If no wabot_center_id, we claimed the creation right
        console.log(`✅ Atomic creation claim successful for community ${communityName}`);
        return true;
        
    } catch (error) {
        console.error('❌ Error in atomicClaimWabotCenterCreation:', error);
        return false;
    }
}

/**
 * Mark Wabot Center creation as failed to prevent infinite retries
 */
async function markWabotCenterCreationFailed(communityId, errorMessage) {
    try {
        const { error } = await db.supabase
            .from('wabot_centers')
            .update({
                is_active: false,
                wabot_center_name: `FAILED: ${errorMessage}`,
                updated_at: new Date().toISOString()
            })
            .eq('community_id', communityId);
            
        if (error) {
            console.error('❌ Error marking Wabot Center creation as failed:', error);
        }
    } catch (error) {
        console.error('❌ Error in markWabotCenterCreationFailed:', error);
    }
}

/**
 * Handle membership issues and send invite links to failed participants
 */
async function handleWabotCenterMembershipIssues(sock, wabotCenterId, communityAdmins, wabotCenterName) {
    try {
        // Check current group members
        const groupMeta = await sock.groupMetadata(wabotCenterId);
        const currentMembers = groupMeta.participants.map(p => p.id);
        
        // Find admins who couldn't be added
        const failedAdmins = communityAdmins.filter(admin => !currentMembers.includes(admin));
        
        if (failedAdmins.length > 0) {
            console.log(`⚠️ ${failedAdmins.length} admins couldn't be added to ${wabotCenterName}`);
            
            // Generate invite link
            try {
                const inviteCode = await sock.groupInviteCode(wabotCenterId);
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                // Send invite link to failed admins
                for (const adminJid of failedAdmins) {
                    try {
                        await sock.sendMessage(adminJid, {
                            text: `🤖 *Invitation au Wabot Center*\n\nVous êtes administrateur de la communauté mais n'avez pas pu être ajouté automatiquement au Wabot Center.\n\n🔗 Rejoignez ici: ${inviteLink}\n\n*${wabotCenterName}*`
                        });
                        console.log(`📩 Invite sent to admin: ${adminJid}`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
                    } catch (sendError) {
                        console.log(`❌ Failed to send invite to ${adminJid}:`, sendError.message);
                    }
                }
            } catch (inviteError) {
                console.error(`❌ Failed to generate invite link for ${wabotCenterName}:`, inviteError);
            }
        } else {
            console.log(`✅ All ${communityAdmins.length} admins successfully added to ${wabotCenterName}`);
        }
    } catch (error) {
        console.error('❌ Error handling Wabot Center membership issues:', error);
    }
}

/**
 * Save Wabot Center information to database with proper UPSERT
 */
async function saveWabotCenterToDatabase(communityId, wabotCenterId, communityName, wabotCenterName) {
    try {
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .upsert({
                community_id: communityId,
                wabot_center_id: wabotCenterId,
                community_name: communityName,
                wabot_center_name: wabotCenterName,
                is_active: true,
                admin_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'community_id',
                ignoreDuplicates: false
            })
            .select('*');

        if (error) {
            console.error('❌ Error saving Wabot Center to database:', error);
            return false;
        }
        
        console.log('✅ Wabot Center saved to database successfully');
        return true;
    } catch (error) {
        console.error('❌ Error in saveWabotCenterToDatabase:', error);
        return false;
    }
}

/**
 * Send welcome message to the newly created Wabot Center
 */
async function sendWabotCenterWelcomeMessage(sock, wabotCenterId, communityName) {
    try {
        const welcomeMessage = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃🤖 *BIENVENUE DANS VOTRE WABOT CENTER* 🤖
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏘️ *Communauté:* ${communityName}
👑 *Admins:* Vous êtes les administrateurs de cette communauté

🎯 *OBJECTIF DE CE GROUPE:*
Ce groupe privé a été créé automatiquement pour faciliter la gestion de votre communauté via Wabot.

⚡ *COMMANDES AVANCÉES DISPONIBLES ICI:*
┌────────────────────────────────────────────────┐
│ 🏗️ *GESTION COMMUNAUTÉ*                        │
├────────────────────────────────────────────────┤
│ • \`.community info\` - Infos de la communauté    │
│ • \`.community settings\` - Configuration globale │
│ • \`.community broadcast\` - Message groupé       │
│ • \`.community stats\` - Statistiques            │
├────────────────────────────────────────────────┤
│ 🛡️ *MODÉRATION AVANCÉE*                        │
├────────────────────────────────────────────────┤
│ • \`.ban global\` - Ban dans toute la communauté │
│ • \`.mute community\` - Mute dans tous les groupes│
│ • \`.warn escalate\` - Avertissement escaladé    │
├────────────────────────────────────────────────┤
│ 📊 *ANALYTICS & RAPPORTS*                      │
├────────────────────────────────────────────────┤
│ • \`.analytics daily\` - Rapport quotidien       │
│ • \`.topmembers community\` - Top membres        │
│ • \`.activity report\` - Rapport d'activité     │
└────────────────────────────────────────────────┘

🚀 *AVANTAGES DU WABOT CENTER:*
✅ Commandes administratives centralisées
✅ Gestion de communauté simplifiée  
✅ Rapports et statistiques détaillés
✅ Actions groupées sur tous les canaux
✅ Configuration avancée du bot

💡 *CONSEIL:* Utilisez \`.help admin\` pour voir toutes les commandes disponibles dans ce groupe !

_🤖 Wabot Center créé automatiquement par Wabot v4.3_`;

        await sock.sendMessage(wabotCenterId, {
            text: welcomeMessage
        });
        
        console.log('✅ Welcome message sent to Wabot Center');
    } catch (error) {
        console.error('❌ Error sending Wabot Center welcome message:', error);
    }
}

/**
 * Setup optimal settings for the Wabot Center group
 */
async function setupWabotCenterSettings(sock, wabotCenterId) {
    try {
        // Set group description
        const description = `🤖 Centre de contrôle Wabot pour la gestion de communauté\n⚡ Commandes administratives avancées disponibles\n🛡️ Groupe privé pour les admins uniquement`;
        await sock.groupUpdateDescription(wabotCenterId, description);
        
        // Optionally restrict who can edit group info (admins only)
        await sock.groupSettingUpdate(wabotCenterId, 'locked');
        
        console.log('✅ Wabot Center settings configured');
    } catch (error) {
        console.error('❌ Error setting up Wabot Center settings:', error);
    }
}

/**
 * Check if Wabot Center exists for community (used by main integrations)
 */
async function checkWabotCenterExists(communityId) {
    try {
        const { data, error } = await db.supabase
            .from('wabot_centers')
            .select('*')
            .eq('community_id', communityId)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('❌ Error checking Wabot Center existence:', error);
        return null;
    }
}

/**
 * Trigger Wabot Center creation on bot join (integration point)
 */
async function triggerWabotCenterOnBotJoin(sock, chatId, groupName, botJid) {
    try {
        // Check if this is a community
        const isGroupCommunity = await isCommunity(sock, chatId);
        if (!isGroupCommunity) {
            console.log(`ℹ️ Group ${groupName} is not a community, skipping Wabot Center creation`);
            return false;
        }
        
        // Check if bot is admin
        const { isAdmin } = require('../lib/isAdmin');
        const { isBotAdmin } = await isAdmin(sock, chatId, botJid);
        if (!isBotAdmin) {
            console.log(`ℹ️ Bot is not admin in community ${groupName}, skipping Wabot Center creation`);
            return false;
        }
        
        console.log(`🏗️ Bot is admin in community ${groupName}, creating Wabot Center...`);
        return await createWabotCenter(sock, chatId, groupName, botJid);
        
    } catch (error) {
        console.error('❌ Error in triggerWabotCenterOnBotJoin:', error);
        return false;
    }
}

/**
 * Trigger Wabot Center creation on bot promotion (integration point)
 */
async function triggerWabotCenterOnBotPromotion(sock, groupId, botJid) {
    try {
        // Check if this is a community
        const isGroupCommunity = await isCommunity(sock, groupId);
        if (!isGroupCommunity) {
            console.log(`ℹ️ Group ${groupId} is not a community, skipping Wabot Center creation`);
            return false;
        }
        
        // Get group metadata for community name
        const groupMetadata = await sock.groupMetadata(groupId);
        const communityName = groupMetadata.subject || 'Unknown Community';
        
        console.log(`🏗️ Bot promoted to admin in community ${communityName}, creating Wabot Center...`);
        return await createWabotCenter(sock, groupId, communityName, botJid);
        
    } catch (error) {
        console.error('❌ Error in triggerWabotCenterOnBotPromotion:', error);
        return false;
    }
}

module.exports = {
    createWabotCenter,
    triggerWabotCenterOnBotJoin,
    triggerWabotCenterOnBotPromotion,
    checkWabotCenterExists,
    atomicClaimWabotCenterCreation,
    markWabotCenterCreationFailed,
    handleWabotCenterMembershipIssues,
    saveWabotCenterToDatabase
};