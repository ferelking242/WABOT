/**
 * Script pour créer la table group_commands_config dans Supabase
 * 
 * Usage: node scripts/setup-commands-table.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function setupTable() {
    console.log('🔧 Configuration de la table group_commands_config...');
    
    try {
        // Lire le fichier SQL
        const sqlPath = path.join(__dirname, '../dev/sql/create_group_commands_config.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Supprimer les commentaires SQL pour compatibilité
        const cleanedSql = sql
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');
        
        console.log('📝 Exécution du script SQL...');
        
        // Essayer d'exécuter via RPC si disponible
        // Sinon, on essaiera via une requête directe
        
        // Vérifier si la table existe déjà
        const { data: existingTable, error: checkError } = await supabase
            .from('group_commands_config')
            .select('id')
            .limit(1);
        
        if (!checkError || checkError.code !== '42P01') {
            console.log('✅ La table group_commands_config existe déjà');
            
            // Compter les entrées
            const { count, error: countError } = await supabase
                .from('group_commands_config')
                .select('id', { count: 'exact', head: true });
            
            if (!countError) {
                console.log(`📊 ${count || 0} configurations de commandes existantes`);
            }
            
            return;
        }
        
        console.log('⚠️ La table n\'existe pas encore.');
        console.log('');
        console.log('📋 Pour créer la table, veuillez exécuter le SQL suivant dans Supabase SQL Editor:');
        console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT/editor');
        console.log('');
        console.log('════════════════════════════════════════════════════════');
        console.log(sql);
        console.log('════════════════════════════════════════════════════════');
        console.log('');
        console.log('💡 Après avoir exécuté le SQL, réexécutez ce script pour vérifier.');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

setupTable()
    .then(() => {
        console.log('✅ Setup terminé');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Erreur fatale:', error);
        process.exit(1);
    });
