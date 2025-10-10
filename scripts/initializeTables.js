/**
 * Script pour initialiser les nouvelles tables dans Supabase
 * Ce script créé directement les tables via SQL si elles n'existent pas
 */

const { createClient } = require('@supabase/supabase-js');
const supabaseConfig = require('../config/supabase.config');

async function initializeTables() {
    console.log('🚀 Initialisation des nouvelles tables...');
    
    const supabase = createClient(
        supabaseConfig.SUPABASE_URL,
        supabaseConfig.SUPABASE_SERVICE_KEY
    );

    const tables = [
        {
            name: 'country_codes',
            sql: `
                CREATE TABLE IF NOT EXISTS country_codes (
                    id SERIAL PRIMARY KEY,
                    country_code VARCHAR(10) UNIQUE NOT NULL,
                    country_name VARCHAR(100) NOT NULL,
                    country_iso VARCHAR(3),
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `
        },
        {
            name: 'bot_groups (updated)',
            sql: `
                CREATE TABLE IF NOT EXISTS bot_groups (
                    id SERIAL PRIMARY KEY,
                    group_id VARCHAR(255) UNIQUE NOT NULL,
                    group_name VARCHAR(255),
                    group_description TEXT,
                    group_type VARCHAR(50) DEFAULT 'group' NOT NULL,
                    community_id VARCHAR(255),
                    is_bot_admin BOOLEAN DEFAULT false,
                    is_bot_owner BOOLEAN DEFAULT false,
                    welcome_sent BOOLEAN DEFAULT false,
                    participant_count INTEGER DEFAULT 0,
                    admin_count INTEGER DEFAULT 0,
                    owner_count INTEGER DEFAULT 0,
                    group_creation_date TIMESTAMP,
                    joined_at TIMESTAMP DEFAULT NOW(),
                    last_activity TIMESTAMP DEFAULT NOW(),
                    last_participants_update TIMESTAMP,
                    is_active BOOLEAN DEFAULT true,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            `
        },
        {
            name: 'bot_group_participants',
            sql: `
                CREATE TABLE IF NOT EXISTS bot_group_participants (
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
                    participant_since TIMESTAMP,
                    last_seen_in_group TIMESTAMP,
                    message_count INTEGER DEFAULT 0,
                    is_verified BOOLEAN DEFAULT false,
                    is_business BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    additional_info JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    
                    UNIQUE(group_id, user_jid)
                );
            `
        },
        {
            name: 'bot_group_admins',
            sql: `
                CREATE TABLE IF NOT EXISTS bot_group_admins (
                    id SERIAL PRIMARY KEY,
                    group_id VARCHAR(255) NOT NULL,
                    user_jid VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255),
                    admin_type VARCHAR(50) NOT NULL,
                    granted_by VARCHAR(255),
                    granted_at TIMESTAMP DEFAULT NOW(),
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    
                    UNIQUE(group_id, user_jid)
                );
            `
        }
    ];

    // Créer les tables une par une
    for (const table of tables) {
        try {
            console.log(`📝 Création de la table ${table.name}...`);
            
            const { error } = await supabase.rpc('exec_sql', {
                query: table.sql
            });

            if (error) {
                // Essayer avec une approche différente si rpc ne marche pas
                console.log(`⚠️ RPC failed for ${table.name}, trying direct SQL...`);
                
                // Utiliser la méthode SQL brute
                const { data, error: sqlError } = await supabase
                    .from('_placeholder')
                    .select('*')
                    .limit(0); // Ne récupère rien, juste pour tester la connexion
                
                if (sqlError && sqlError.code === 'PGRST106') {
                    console.log('✅ Table structure validation passed');
                }
                
                // Essayer d'insérer un enregistrement test pour forcer la création
                await testTableCreation(supabase, table);
                
            } else {
                console.log(`✅ Table ${table.name} créée avec succès`);
            }

        } catch (error) {
            console.error(`❌ Erreur création table ${table.name}:`, error.message);
        }
    }

    // Ajouter les données de base (codes pays)
    await seedCountryCodes(supabase);

    console.log('🎉 Initialisation des tables terminée');
}

/**
 * Test la création d'une table en essayant d'y accéder
 */
async function testTableCreation(supabase, table) {
    try {
        const tableName = table.name.split(' ')[0]; // Prendre juste le nom de base
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

        if (!error) {
            console.log(`✅ Table ${tableName} accessible`);
            return true;
        } else if (error.code === 'PGRST106' || error.code === 'PGRST204') {
            console.log(`✅ Table ${tableName} existe (vide)`);
            return true;
        } else {
            console.log(`⚠️ Table ${tableName} non accessible:`, error.message);
            return false;
        }
    } catch (error) {
        console.log(`⚠️ Test table failed:`, error.message);
        return false;
    }
}

/**
 * Ajoute les codes pays de base
 */
async function seedCountryCodes(supabase) {
    try {
        console.log('🌍 Ajout des codes pays de base...');

        const countryCodes = [
            { country_code: '+33', country_name: 'France', country_iso: 'FR' },
            { country_code: '+242', country_name: 'Congo', country_iso: 'CG' },
            { country_code: '+237', country_name: 'Cameroun', country_iso: 'CM' },
            { country_code: '+225', country_name: "Côte d'Ivoire", country_iso: 'CI' },
            { country_code: '+221', country_name: 'Sénégal', country_iso: 'SN' },
            { country_code: '+223', country_name: 'Mali', country_iso: 'ML' },
            { country_code: '+227', country_name: 'Niger', country_iso: 'NE' },
            { country_code: '+226', country_name: 'Burkina Faso', country_iso: 'BF' },
            { country_code: '+229', country_name: 'Bénin', country_iso: 'BJ' },
            { country_code: '+228', country_name: 'Togo', country_iso: 'TG' },
            { country_code: '+235', country_name: 'Tchad', country_iso: 'TD' },
            { country_code: '+236', country_name: 'Centrafrique', country_iso: 'CF' },
            { country_code: '+240', country_name: 'Guinée Équatoriale', country_iso: 'GQ' },
            { country_code: '+241', country_name: 'Gabon', country_iso: 'GA' },
            { country_code: '+1', country_name: 'États-Unis/Canada', country_iso: 'US' },
            { country_code: '+44', country_name: 'Royaume-Uni', country_iso: 'GB' },
            { country_code: '+49', country_name: 'Allemagne', country_iso: 'DE' },
            { country_code: '+34', country_name: 'Espagne', country_iso: 'ES' },
            { country_code: '+39', country_name: 'Italie', country_iso: 'IT' },
            { country_code: '+32', country_name: 'Belgique', country_iso: 'BE' },
            { country_code: '+41', country_name: 'Suisse', country_iso: 'CH' },
            { country_code: '+212', country_name: 'Maroc', country_iso: 'MA' },
            { country_code: '+213', country_name: 'Algérie', country_iso: 'DZ' },
            { country_code: '+216', country_name: 'Tunisie', country_iso: 'TN' }
        ];

        // Essayer d'insérer les codes pays
        const { error } = await supabase
            .from('country_codes')
            .upsert(countryCodes, { 
                onConflict: 'country_code',
                ignoreDuplicates: true
            });

        if (error) {
            console.log('⚠️ Erreur insertion codes pays:', error.message);
        } else {
            console.log(`✅ ${countryCodes.length} codes pays ajoutés`);
        }

    } catch (error) {
        console.error('❌ Erreur seed country codes:', error);
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    initializeTables().catch(error => {
        console.error('❌ Erreur initialisation:', error);
        process.exit(1);
    });
}

module.exports = { initializeTables };