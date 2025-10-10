/**
 * Script pour créer la table group_links_temp dans Supabase
 * Utilisée pour le système de liaison de groupes via codes temporaires
 */

const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../config/supabase.config');

// Initialiser le client Supabase
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

async function createGroupLinksTempTable() {
    console.log('🔧 Création de la table group_links_temp dans Supabase...');
    
    try {
        // SQL pour créer la table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS group_links_temp (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
                code TEXT UNIQUE NOT NULL,
                group_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                participant_count INTEGER DEFAULT 0,
                is_admin BOOLEAN DEFAULT false,
                is_owner BOOLEAN DEFAULT false,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            -- Index pour recherche rapide par code
            CREATE INDEX IF NOT EXISTS idx_group_links_temp_code ON group_links_temp(code);

            -- Index pour recherche par user_id
            CREATE INDEX IF NOT EXISTS idx_group_links_temp_user_id ON group_links_temp(user_id);

            -- Index pour nettoyage automatique des codes expirés
            CREATE INDEX IF NOT EXISTS idx_group_links_temp_expires_at ON group_links_temp(expires_at);
        `;
        
        console.log('🚀 Exécution du SQL pour créer la table group_links_temp...');
        
        // Tenter avec RPC si disponible
        const { error: rpcError } = await supabase.rpc('exec_sql', { 
            sql_query: createTableSQL 
        });
        
        if (rpcError) {
            console.log('⚠️ RPC non disponible, test de l\'existence de la table...');
            
            // Tester si la table existe en essayant une requête
            const { error: testError } = await supabase
                .from('group_links_temp')
                .select('count', { count: 'exact', head: true });
                
            if (testError) {
                if (testError.code === 'PGRST106' || testError.message.includes('does not exist')) {
                    console.log('❌ Table group_links_temp n\'existe pas et ne peut pas être créée via RPC');
                    console.log('\n📋 Veuillez exécuter ce SQL directement dans votre dashboard Supabase:\n');
                    console.log(createTableSQL);
                    console.log('\n🔗 Accédez à: https://supabase.com/dashboard/project/_/sql');
                } else {
                    console.log('❌ Erreur lors du test de la table:', testError.message);
                }
            } else {
                console.log('✅ Table group_links_temp existe déjà ou a été créée');
            }
        } else {
            console.log('✅ Table group_links_temp créée avec succès');
        }
        
        // Vérifier la structure de la table
        const { data: tableData, error: selectError } = await supabase
            .from('group_links_temp')
            .select('*')
            .limit(0);
            
        if (!selectError) {
            console.log('✅ Table group_links_temp vérifiée et prête à l\'emploi');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la création de la table:', error);
        throw error;
    }
}

// Exécuter le script
if (require.main === module) {
    createGroupLinksTempTable()
        .then(() => {
            console.log('🎉 Script terminé avec succès');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erreur fatale:', error);
            process.exit(1);
        });
}

module.exports = { createGroupLinksTempTable };
