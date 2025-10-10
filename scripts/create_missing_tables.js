/**
 * Script pour créer les tables manquantes dans Supabase
 * Utilise la connexion Supabase existante du bot
 */

const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../config/supabase.config');

// Initialiser le client Supabase
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

async function createMissingTables() {
    console.log('🔧 Création des tables manquantes dans Supabase...');
    
    try {
        // 1. Créer la table features (manquante complètement)
        console.log('📝 Création de la table "features"...');
        const { error: featuresError } = await supabase.rpc('create_features_table', {}, {
            count: null
        });
        
        // Alternative: SQL direct si rpc ne fonctionne pas
        const createFeaturesSQL = `
            CREATE TABLE IF NOT EXISTS features (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                display_name VARCHAR(150),
                description TEXT,
                category VARCHAR(50) DEFAULT 'general',
                command VARCHAR(100),
                aliases JSONB DEFAULT '[]'::jsonb,
                is_premium BOOLEAN DEFAULT false,
                is_admin_only BOOLEAN DEFAULT false,
                is_owner_only BOOLEAN DEFAULT false,
                is_enabled BOOLEAN DEFAULT true,
                tags JSONB DEFAULT '[]'::jsonb,
                usage_example TEXT,
                usage_count INTEGER DEFAULT 0,
                rating_sum INTEGER DEFAULT 0,
                rating_count INTEGER DEFAULT 0,
                version VARCHAR(20) DEFAULT '1.0.0',
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `;
        
        console.log('🚀 Exécution du SQL pour créer la table features...');
        const { error: sqlFeaturesError } = await supabase.rpc('exec_sql', { 
            sql_query: createFeaturesSQL 
        });
        
        if (sqlFeaturesError) {
            console.log('⚠️ Tentative alternative pour la table features...');
            // Alternative: Insertion directe pour tester si la table existe
            const { error: testError } = await supabase
                .from('features')
                .select('count', { count: 'exact', head: true });
                
            if (testError && testError.code === 'PGRST106') {
                console.log('❌ Table features n\'existe pas et ne peut pas être créée via RPC');
                console.log('SQL requis:', createFeaturesSQL);
            } else {
                console.log('✅ Table features existe déjà ou a été créée');
            }
        } else {
            console.log('✅ Table features créée avec succès');
        }
        
        // 2. Vérifier et ajouter la colonne is_active à bot_group_participants si nécessaire
        console.log('📝 Vérification de la colonne "is_active" dans bot_group_participants...');
        
        const { error: participantsTestError } = await supabase
            .from('bot_group_participants')
            .select('is_active', { head: true, count: 'exact' });
            
        if (participantsTestError && participantsTestError.message.includes('is_active')) {
            console.log('🔧 Ajout de la colonne is_active à bot_group_participants...');
            
            const addColumnSQL = `
                ALTER TABLE bot_group_participants 
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
            `;
            
            const { error: addColumnError } = await supabase.rpc('exec_sql', { 
                sql_query: addColumnSQL 
            });
            
            if (addColumnError) {
                console.log('❌ Erreur ajout colonne is_active:', addColumnError.message);
                console.log('SQL requis:', addColumnSQL);
            } else {
                console.log('✅ Colonne is_active ajoutée avec succès');
            }
        } else {
            console.log('✅ Colonne is_active existe déjà dans bot_group_participants');
        }
        
        // 3. Vérifier que toutes les tables nécessaires existent
        console.log('🔍 Vérification de toutes les tables...');
        
        const tables = ['bot_groups', 'bot_group_participants', 'bot_group_admins', 'features'];
        const tableStatus = {};
        
        for (const table of tables) {
            try {
                const { error } = await supabase
                    .from(table)
                    .select('count', { count: 'exact', head: true });
                    
                if (error) {
                    tableStatus[table] = `❌ ${error.message}`;
                } else {
                    tableStatus[table] = '✅ Existe';
                }
            } catch (err) {
                tableStatus[table] = `❌ ${err.message}`;
            }
        }
        
        console.log('📊 État des tables:');
        for (const [table, status] of Object.entries(tableStatus)) {
            console.log(`  ${table}: ${status}`);
        }
        
        console.log('✅ Vérification terminée');
        
    } catch (error) {
        console.error('❌ Erreur lors de la création des tables:', error);
    }
}

// Exécuter le script
createMissingTables().then(() => {
    console.log('🏁 Script terminé');
    process.exit(0);
}).catch(err => {
    console.error('💥 Erreur fatale:', err);
    process.exit(1);
});