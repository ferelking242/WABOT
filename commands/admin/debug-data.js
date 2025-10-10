/**
 * Commande debug pour vérifier les données récupérées d'un groupe
 * Usage: !debug-data ou !debug-data TESTE
 */

const { db } = require('../../lib/database');

module.exports = {
    name: 'debug-data',
    aliases: ['debug', 'check-data', 'verify'],
    category: 'admin',
    description: 'Vérifie les données récupérées d\'un groupe et affiche toutes les tables',
    usage: '!debug-data [nom_groupe]',
    
    async execute(sock, message, args) {
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Vérifier si l'utilisateur est admin (pour cette commande debug)
        const ownerNumber = process.env.OWNER_NUMBER || '242061194809';
        const normalizedSender = senderId.replace('@s.whatsapp.net', '').replace('@lid', '');
        const normalizedOwner = ownerNumber.replace('+', '');
        
        if (normalizedSender !== normalizedOwner) {
            await sock.sendMessage(chatId, { 
                text: '❌ Cette commande est réservée aux administrateurs.' 
            });
            return;
        }

        try {
            const groupName = args.length > 0 ? args.join(' ') : 'TESTE';
            
            await sock.sendMessage(chatId, { 
                text: `🔍 **VÉRIFICATION DES DONNÉES - GROUPE: ${groupName}**\n\nRecherche en cours...` 
            });

            // 1. Récupérer les données du groupe
            const { data: groupData, error: groupError } = await db.supabase
                .from('bot_groups')
                .select('*')
                .ilike('group_name', `%${groupName}%`);

            if (groupError) {
                await sock.sendMessage(chatId, { 
                    text: `❌ Erreur récupération groupe: ${groupError.message}` 
                });
                return;
            }

            if (!groupData || groupData.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: `❌ Aucun groupe trouvé avec le nom "${groupName}"` 
                });
                return;
            }

            const group = groupData[0];
            
            // 2. Récupérer les participants
            const { data: participantsData, error: participantsError } = await db.supabase
                .from('bot_group_participants')
                .select('*')
                .eq('group_id', group.group_id);

            // 3. Récupérer les admins
            const { data: adminsData, error: adminsError } = await db.supabase
                .from('bot_group_admins')
                .select('*')
                .eq('group_id', group.group_id);

            // 4. Récupérer les mappings JID
            const { data: mappingsData, error: mappingsError } = await db.supabase
                .from('bot_jid_mappings')
                .select('*')
                .eq('group_jid', group.group_id);

            // Construire le rapport
            let report = `📊 **RAPPORT COMPLET - ${group.group_name}**\n\n`;
            
            // INFORMATIONS DU GROUPE
            report += `🏷️ **DONNÉES DU GROUPE:**\n`;
            report += `├─ ID: ${group.group_id}\n`;
            report += `├─ Nom: ${group.group_name}\n`;
            report += `├─ Type: ${group.group_type || 'group'}\n`;
            report += `├─ Bot admin: ${group.is_bot_admin ? '✅' : '❌'}\n`;
            report += `├─ Participants: ${group.participant_count || 0}\n`;
            report += `├─ Communauté: ${group.community_id || 'Aucune'}\n`;
            report += `├─ Est communauté: ${group.is_community ? '✅' : '❌'}\n`;
            report += `└─ Créé: ${group.created_at ? new Date(group.created_at).toLocaleDateString() : 'N/A'}\n\n`;

            // PARTICIPANTS
            if (participantsData && participantsData.length > 0) {
                report += `👥 **PARTICIPANTS (${participantsData.length}):**\n`;
                participantsData.slice(0, 5).forEach((p, i) => {
                    const phone = p.user_phone || 'N/A';
                    const name = p.user_name || 'Sans nom';
                    const country = p.country_name || 'Pays inconnu';
                    report += `├─ ${i + 1}. ${name} (${phone}) - ${country}\n`;
                });
                if (participantsData.length > 5) {
                    report += `└─ ... et ${participantsData.length - 5} autres\n`;
                }
                report += '\n';
            } else {
                report += `👥 **PARTICIPANTS:** Aucun participant récupéré\n\n`;
            }

            // ADMINS
            if (adminsData && adminsData.length > 0) {
                report += `👑 **ADMINS (${adminsData.length}):**\n`;
                adminsData.forEach((a, i) => {
                    const phone = a.user_phone || 'N/A';
                    const name = a.user_name || 'Sans nom';
                    const role = a.is_owner ? 'Propriétaire' : 'Admin';
                    report += `├─ ${i + 1}. ${name} (${phone}) - ${role}\n`;
                });
                report += '\n';
            } else {
                report += `👑 **ADMINS:** Aucun admin récupéré\n\n`;
            }

            // MAPPINGS JID
            if (mappingsData && mappingsData.length > 0) {
                report += `🔗 **MAPPINGS JID (${mappingsData.length}):**\n`;
                mappingsData.slice(0, 3).forEach((m, i) => {
                    report += `├─ ${i + 1}. ${m.group_jid} → ${m.private_jid} → ${m.phone_number || 'N/A'}\n`;
                });
                if (mappingsData.length > 3) {
                    report += `└─ ... et ${mappingsData.length - 3} autres\n`;
                }
                report += '\n';
            } else {
                report += `🔗 **MAPPINGS JID:** Aucun mapping trouvé (normal si nouveau système)\n\n`;
            }

            // MÉTADONNÉES
            if (group.metadata) {
                report += `📋 **MÉTADONNÉES:**\n`;
                const metadata = typeof group.metadata === 'string' ? JSON.parse(group.metadata) : group.metadata;
                report += `├─ Annonces: ${metadata.announce ? '✅' : '❌'}\n`;
                report += `├─ Description: ${metadata.desc || 'Aucune'}\n`;
                report += `└─ Autres infos: ${Object.keys(metadata).length} champs\n\n`;
            }

            // STATISTIQUES
            report += `📈 **STATISTIQUES:**\n`;
            report += `├─ JIDs extraits: ${participantsData?.length || 0}\n`;
            report += `├─ Numéros détectés: ${participantsData?.filter(p => p.user_phone && p.user_phone !== 'N/A').length || 0}\n`;
            report += `├─ Pays détectés: ${participantsData?.filter(p => p.country_name && p.country_name !== 'Pays inconnu').length || 0}\n`;
            report += `└─ Mappings réussis: ${mappingsData?.length || 0}\n\n`;

            report += `✅ **Vérification terminée !**\n`;
            report += `🔧 Les données sont ${participantsData?.length > 0 ? 'correctement' : 'partiellement'} récupérées.`;

            // Envoyer le rapport (diviser si trop long)
            if (report.length > 4000) {
                const parts = report.match(/.{1,3800}/g) || [report];
                for (let i = 0; i < parts.length; i++) {
                    await sock.sendMessage(chatId, { 
                        text: `${parts[i]}${i < parts.length - 1 ? '\n\n📄 *Suite...*' : ''}` 
                    });
                    
                    if (i < parts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Délai entre messages
                    }
                }
            } else {
                await sock.sendMessage(chatId, { text: report });
            }

        } catch (error) {
            console.error('❌ Erreur debug-data:', error);
            await sock.sendMessage(chatId, { 
                text: `❌ Erreur lors de la vérification: ${error.message}` 
            });
        }
    }
};