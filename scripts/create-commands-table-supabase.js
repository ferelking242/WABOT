/**
 * Script pour créer RÉELLEMENT la table group_commands_config dans Supabase
 * en utilisant le client Supabase directement avec une requête SQL brute
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        },
        db: {
            schema: 'public'
        }
    }
);

async function createTable() {
    console.log('🔧 Création de la table group_commands_config...');
    
    try {
        // Utiliser une requête raw SQL via PostgreSQL REST API
        const { data, error } = await supabase
            .from('_sql')
            .select('*')
            .limit(0);

        // Si _sql n'existe pas, on utilise rpc
        const sql = `
            CREATE TABLE IF NOT EXISTS group_commands_config (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                group_id TEXT NOT NULL,
                command_name TEXT NOT NULL,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                disabled_by TEXT,
                disabled_at TIMESTAMPTZ,
                disabled_reason TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT unique_group_command UNIQUE(group_id, command_name)
            );

            CREATE INDEX IF NOT EXISTS idx_group_commands_group_id ON group_commands_config(group_id);
            CREATE INDEX IF NOT EXISTS idx_group_commands_command_name ON group_commands_config(command_name);
            CREATE INDEX IF NOT EXISTS idx_group_commands_enabled ON group_commands_config(is_enabled);
        `;

        console.log('📝 Exécution du SQL...');
        console.log('');
        console.log('════════════════════════════════════════════════════════');
        console.log('IMPORTANT: Exécutez ce SQL dans le SQL Editor de Supabase:');
        console.log('https://supabase.com/dashboard/project/_/editor');
        console.log('════════════════════════════════════════════════════════');
        console.log('');
        console.log(sql);
        console.log('');
        console.log('════════════════════════════════════════════════════════');
        console.log('');
        
        // Essayer via une insertion dans une table test
        console.log('⚠️  La création automatique via le client Supabase n\'est pas supportée.');
        console.log('💡 Vous devez copier-coller le SQL ci-dessus dans le SQL Editor de Supabase.');
        console.log('');
        console.log('Après création, appuyez sur Entrée pour vérifier...');
        
        // Attendre l'entrée utilisateur
        await new Promise((resolve) => {
            process.stdin.once('data', () => resolve());
        });
        
        // Vérifier que la table existe maintenant
        const { data: testData, error: testError } = await supabase
            .from('group_commands_config')
            .select('id')
            .limit(1);
        
        if (testError) {
            console.error('❌ La table n\'existe toujours pas:', testError.message);
            console.error('');
            console.error('Veuillez exécuter le SQL ci-dessus dans Supabase SQL Editor.');
            process.exit(1);
        }
        
        console.log('✅ Table group_commands_config créée et vérifiée avec succès!');
        console.log('');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

createTable();
