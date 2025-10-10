/**
 * Script pour vérifier la structure des tables dans Supabase
 * et forcer l'ajout de la colonne is_active si nécessaire
 */

const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../config/supabase.config');

// Initialiser le client Supabase
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

async function verifyAndFixTables() {
    console.log('🔍 Vérification approfondie des tables et colonnes...');
    
    try {
        // 1. Vérifier directement la structure de bot_group_participants
        console.log('📊 Test direct d\'insertion avec is_active...');
        
        // Essayer d'insérer un enregistrement test avec is_active
        const testData = {
            group_id: 'test_verification@g.us',
            user_jid: 'test_user@s.whatsapp.net',
            user_phone: '+242123456789',
            user_name: 'Test User Verification',
            is_active: true
        };
        
        const { data: insertResult, error: insertError } = await supabase
            .from('bot_group_participants')
            .insert(testData)
            .select();
            
        if (insertError) {
            console.log('❌ Erreur insertion test:', insertError.message);
            
            // Si l'erreur concerne is_active, forcer l'ajout de la colonne
            if (insertError.message.includes('is_active')) {
                console.log('🔧 Tentative d\'ajout forcé de la colonne is_active...');
                
                // Utiliser une approche différente pour ajouter la colonne
                const alterSQL = `
                    ALTER TABLE public.bot_group_participants 
                    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
                `;
                
                // Essayer via une requête raw
                try {
                    await supabase.rpc('exec_sql', { sql: alterSQL });
                    console.log('✅ Colonne is_active ajoutée via RPC');
                } catch (rpcError) {
                    console.log('❌ RPC exec_sql ne fonctionne pas:', rpcError.message);
                    
                    // Alternative: Essayer via les PostgreSQL functions
                    const { error: alterError } = await supabase.rpc('alter_table_add_column', {
                        table_name: 'bot_group_participants',
                        column_name: 'is_active',
                        column_type: 'BOOLEAN',
                        default_value: 'true'
                    });
                    
                    if (alterError) {
                        console.log('❌ Alter table function ne fonctionne pas:', alterError.message);
                        
                        console.log('📝 Action manuelle requise:');
                        console.log('Exécutez ce SQL directement dans l\'interface Supabase:');
                        console.log(alterSQL);
                    } else {
                        console.log('✅ Colonne ajoutée via alter_table_add_column');
                    }
                }
                
                // Réessayer l'insertion après ajout de la colonne
                console.log('🔄 Nouvel essai d\'insertion...');
                const { data: retryInsert, error: retryError } = await supabase
                    .from('bot_group_participants')
                    .insert(testData)
                    .select();
                    
                if (retryError) {
                    console.log('❌ Échec après ajout de colonne:', retryError.message);
                } else {
                    console.log('✅ Insertion réussie après ajout de colonne');
                    
                    // Nettoyer l'enregistrement test
                    await supabase
                        .from('bot_group_participants')
                        .delete()
                        .eq('group_id', 'test_verification@g.us');
                    console.log('🧹 Enregistrement test supprimé');
                }
            }
        } else {
            console.log('✅ Insertion test réussie, la colonne is_active existe');
            console.log('Données insérées:', insertResult);
            
            // Nettoyer l'enregistrement test
            await supabase
                .from('bot_group_participants')
                .delete()
                .eq('group_id', 'test_verification@g.us');
            console.log('🧹 Enregistrement test supprimé');
        }
        
        // 2. Tester les autres tables aussi
        console.log('\n📊 Test des autres tables...');
        
        // Test bot_groups
        const { error: groupsError } = await supabase
            .from('bot_groups')
            .select('*', { count: 'exact', head: true });
        console.log(`bot_groups: ${groupsError ? '❌ ' + groupsError.message : '✅ OK'}`);
        
        // Test bot_group_admins
        const { error: adminsError } = await supabase
            .from('bot_group_admins')
            .select('*', { count: 'exact', head: true });
        console.log(`bot_group_admins: ${adminsError ? '❌ ' + adminsError.message : '✅ OK'}`);
        
        // Test features
        const { error: featuresError } = await supabase
            .from('features')
            .select('*', { count: 'exact', head: true });
        console.log(`features: ${featuresError ? '❌ ' + featuresError.message : '✅ OK'}`);
        
        console.log('\n✅ Vérification terminée');
        
    } catch (error) {
        console.error('❌ Erreur lors de la vérification:', error);
    }
}

// Exécuter le script
verifyAndFixTables().then(() => {
    console.log('🏁 Script de vérification terminé');
    process.exit(0);
}).catch(err => {
    console.error('💥 Erreur fatale:', err);
    process.exit(1);
});