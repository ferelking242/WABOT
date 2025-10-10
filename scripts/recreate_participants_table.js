/**
 * Script pour recréer complètement la table bot_group_participants 
 * avec toutes les colonnes nécessaires, y compris is_active
 */

const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../config/supabase.config');

// Initialiser le client Supabase
const supabase = createClient(
    supabaseConfig.SUPABASE_URL,
    supabaseConfig.SUPABASE_SERVICE_KEY
);

async function recreateParticipantsTable() {
    console.log('🔧 Recreation complète de la table bot_group_participants...');
    
    try {
        // 1. Sauvegarder les données existantes (si nécessaire)
        console.log('💾 Sauvegarde des données existantes...');
        const { data: existingData, error: selectError } = await supabase
            .from('bot_group_participants')
            .select('*');
            
        if (selectError) {
            console.log('⚠️ Aucune donnée existante à sauvegarder:', selectError.message);
        } else {
            console.log(`📊 ${existingData ? existingData.length : 0} enregistrements trouvés`);
        }
        
        // 2. Supprimer la table existante
        console.log('🗑️ Suppression de la table existante...');
        try {
            const dropSQL = `DROP TABLE IF EXISTS public.bot_group_participants CASCADE;`;
            await supabase.rpc('exec_sql', { sql: dropSQL });
            console.log('✅ Table supprimée');
        } catch (dropError) {
            console.log('⚠️ Erreur suppression (probablement normale):', dropError.message);
        }
        
        // 3. Créer la nouvelle table avec toutes les colonnes
        console.log('🏗️ Création de la nouvelle table...');
        const createSQL = `
            CREATE TABLE public.bot_group_participants (
                id SERIAL PRIMARY KEY,
                group_id VARCHAR(255) NOT NULL,
                user_jid VARCHAR(255) NOT NULL,
                user_phone VARCHAR(50),
                user_name VARCHAR(255),
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                user_bio TEXT,
                profile_picture_url TEXT,
                country_code VARCHAR(10),
                country_name VARCHAR(100),
                is_admin BOOLEAN DEFAULT false,
                is_owner BOOLEAN DEFAULT false,
                is_super_admin BOOLEAN DEFAULT false,
                participant_since TIMESTAMP DEFAULT NOW(),
                last_seen_in_group TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                is_verified BOOLEAN DEFAULT false,
                is_business BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                additional_info JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                
                -- Contraintes
                CONSTRAINT unique_group_user UNIQUE (group_id, user_jid)
            );
            
            -- Index pour optimiser les performances
            CREATE INDEX IF NOT EXISTS idx_bot_group_participants_group_id ON public.bot_group_participants(group_id);
            CREATE INDEX IF NOT EXISTS idx_bot_group_participants_user_jid ON public.bot_group_participants(user_jid);
            CREATE INDEX IF NOT EXISTS idx_bot_group_participants_is_active ON public.bot_group_participants(is_active);
            
            -- Clé étrangère vers bot_groups
            ALTER TABLE public.bot_group_participants 
            ADD CONSTRAINT fk_bot_groups 
            FOREIGN KEY (group_id) REFERENCES public.bot_groups(group_id) ON DELETE CASCADE;
            
            -- RLS (Row Level Security) si nécessaire
            ALTER TABLE public.bot_group_participants ENABLE ROW LEVEL SECURITY;
            
            -- Politique pour permettre l'accès au service role
            CREATE POLICY "Enable all access for service role" ON public.bot_group_participants
            FOR ALL USING (auth.role() = 'service_role');
        `;
        
        try {
            await supabase.rpc('exec_sql', { sql: createSQL });
            console.log('✅ Table créée avec succès');
        } catch (createError) {
            console.log('❌ Erreur création table:', createError.message);
            console.log('📝 SQL à exécuter manuellement:');
            console.log(createSQL);
            return;
        }
        
        // 4. Tester la nouvelle table
        console.log('🧪 Test de la nouvelle table...');
        const testData = {
            group_id: 'test_new_table@g.us',
            user_jid: 'test_user@s.whatsapp.net',
            user_phone: '+242123456789',
            user_name: 'Test User New Table',
            is_active: true,
            is_admin: false,
            message_count: 0
        };
        
        const { data: testInsert, error: testError } = await supabase
            .from('bot_group_participants')
            .insert(testData)
            .select();
            
        if (testError) {
            console.log('❌ Test échec:', testError.message);
        } else {
            console.log('✅ Test réussi, table fonctionnelle');
            console.log('🔍 Données test:', testInsert);
            
            // Nettoyer
            await supabase
                .from('bot_group_participants')
                .delete()
                .eq('group_id', 'test_new_table@g.us');
            console.log('🧹 Données test supprimées');
        }
        
        // 5. Restaurer les données sauvegardées (si applicable)
        if (existingData && existingData.length > 0) {
            console.log('📥 Restauration des données sauvegardées...');
            
            // Filtrer les données pour ne garder que les colonnes valides
            const cleanedData = existingData.map(row => {
                const cleaned = { ...row };
                delete cleaned.id; // Laisser l'auto-increment faire son travail
                return cleaned;
            });
            
            const { error: restoreError } = await supabase
                .from('bot_group_participants')
                .insert(cleanedData);
                
            if (restoreError) {
                console.log('⚠️ Erreur restauration:', restoreError.message);
                console.log('💾 Données à restaurer manuellement:', cleanedData.length, 'enregistrements');
            } else {
                console.log('✅ Données restaurées avec succès');
            }
        }
        
        console.log('✅ Recreation terminée avec succès');
        
    } catch (error) {
        console.error('❌ Erreur lors de la recreation:', error);
    }
}

// Exécuter le script
recreateParticipantsTable().then(() => {
    console.log('🏁 Script de recreation terminé');
    process.exit(0);
}).catch(err => {
    console.error('💥 Erreur fatale:', err);
    process.exit(1);
});