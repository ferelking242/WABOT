require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

async function addNotificationColumns() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non défini');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        console.log('🔧 Ajout des colonnes de notification à group_links_temp via Supabase RPC...');
        
        // Utiliser une RPC function ou SQL direct via Supabase
        const query = `
            ALTER TABLE group_links_temp 
            ADD COLUMN IF NOT EXISTS notification_pending BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS notification_error TEXT,
            ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
        `;
        
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
        
        if (error) {
            // Si RPC n'existe pas, essayer avec la méthode query directe via PostgreSQL REST API
            console.log('⚠️ RPC non disponible, tentative via API REST...');
            
            // Alternative: Créer manuellement via Supabase Dashboard ou utiliser pg directement
            console.log('ℹ️ Veuillez exécuter cette commande SQL dans le Supabase Dashboard:');
            console.log('\n' + query + '\n');
            console.log('📍 URL: https://supabase.com/dashboard/project/[PROJECT_ID]/sql');
            return;
        }
        
        console.log('✅ Colonnes de notification ajoutées avec succès!');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout des colonnes:', error.message);
        console.log('\n📝 SQL à exécuter manuellement dans Supabase Dashboard:');
        console.log(`
ALTER TABLE group_links_temp 
ADD COLUMN IF NOT EXISTS notification_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS notification_error TEXT,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
        `);
    }
}

addNotificationColumns()
    .then(() => {
        console.log('\n✅ Script terminé!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script échoué:', error);
        process.exit(1);
    });
