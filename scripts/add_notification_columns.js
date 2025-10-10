require('dotenv').config();
const { Pool } = require('pg');

async function addNotificationColumns() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('🔧 Ajout des colonnes de notification à group_links_temp...');
        
        const query = `
            ALTER TABLE group_links_temp 
            ADD COLUMN IF NOT EXISTS notification_pending BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS notification_error TEXT,
            ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
        `;
        
        await pool.query(query);
        console.log('✅ Colonnes de notification ajoutées avec succès!');
        
        // Vérifier les colonnes
        const checkQuery = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'group_links_temp'
            ORDER BY ordinal_position;
        `;
        
        const result = await pool.query(checkQuery);
        console.log('\n📋 Structure de la table group_links_temp:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout des colonnes:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

addNotificationColumns()
    .then(() => {
        console.log('\n✅ Migration terminée avec succès!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Migration échouée:', error);
        process.exit(1);
    });
