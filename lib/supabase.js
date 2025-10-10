/**
 * Supabase Configuration for WhatsApp Bot
 * Utilise les variables d'environnement du .env racine
 */

const { createClient } = require('@supabase/supabase-js');

// Vérifier que les variables d'environnement sont présentes
if (!process.env.SUPABASE_URL) {
    console.error('❌ SUPABASE_URL manquante dans le .env');
    throw new Error('SUPABASE_URL is required');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY manquante dans le .env');
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

// Créer le client Supabase avec la clé service (accès admin)
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

console.log('✅ Supabase client configuré pour le bot WhatsApp');

// Services pour le bot
const supabaseBot = {
    // Sauvegarder les informations d'un groupe
    async saveGroupInfo(groupData) {
        try {
            const { data, error } = await supabase
                .from('bot_groups')
                .upsert(groupData, { 
                    onConflict: 'group_id',
                    ignoreDuplicates: false 
                })
                .select()
                .single();
            
            if (error) {
                console.error('❌ Erreur sauvegarde groupe:', error);
                return null;
            }
            
            console.log(`✅ Groupe sauvegardé: ${groupData.group_name}`);
            return data;
        } catch (error) {
            console.error('❌ Erreur Supabase saveGroupInfo:', error);
            return null;
        }
    },

    // Récupérer les groupes d'un propriétaire
    async getGroupsByOwner(ownerNumber) {
        try {
            const { data, error } = await supabase
                .from('bot_groups')
                .select('*')
                .or(`owner_whatsapp_number.eq.${ownerNumber},admin_whatsapp_numbers.cs.{${ownerNumber}}`);
            
            if (error) {
                console.error('❌ Erreur récupération groupes:', error);
                return [];
            }
            
            console.log(`✅ ${data.length} groupes trouvés pour ${ownerNumber}`);
            return data;
        } catch (error) {
            console.error('❌ Erreur Supabase getGroupsByOwner:', error);
            return [];
        }
    },

    // Sauvegarder les analytics d'une commande
    async saveAnalytics(analyticsData) {
        try {
            const { data, error } = await supabase
                .from('bot_analytics')
                .insert(analyticsData)
                .select()
                .single();
            
            if (error) {
                console.error('❌ Erreur sauvegarde analytics:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('❌ Erreur Supabase saveAnalytics:', error);
            return null;
        }
    },

    // Tester la connexion
    async testConnection() {
        try {
            const { data, error } = await supabase
                .from('bot_groups')
                .select('id')
                .limit(1);
            
            if (error) {
                console.error('❌ Test connexion Supabase échoué:', error);
                return false;
            }
            
            // Connection successful (silent to reduce log verbosity)
            return true;
        } catch (error) {
            console.error('❌ Erreur test connexion Supabase:', error);
            return false;
        }
    }
};

module.exports = {
    supabase,
    supabaseBot
};