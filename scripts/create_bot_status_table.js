import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config();

async function createBotStatusTable() {
  try {
    console.log('🔨 Création de la table bot_status...\n');
    
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.log('❌ Variable DATABASE_URL manquante');
      return;
    }
    
    // Connexion directe à PostgreSQL
    const client = new Client({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');
    
    // Créer la table bot_status
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bot_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'offline',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT single_row_check CHECK (id = 1)
      );
    `;
    
    console.log('🔧 Création de la table bot_status...');
    await client.query(createTableQuery);
    console.log('✅ Table bot_status créée');
    
    // Insérer la ligne initiale
    const insertQuery = `
      INSERT INTO bot_status (id, last_seen_at, status)
      VALUES (1, NOW(), 'offline')
      ON CONFLICT (id) DO NOTHING;
    `;
    
    console.log('🔧 Insertion de la ligne initiale...');
    await client.query(insertQuery);
    console.log('✅ Ligne initiale insérée');
    
    // Créer l'index
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_bot_status_last_seen_at ON bot_status(last_seen_at);
    `;
    
    console.log('🔧 Création de l\'index...');
    await client.query(createIndexQuery);
    console.log('✅ Index créé');
    
    // Vérifier que la table existe
    console.log('\n🔍 Vérification de la table...');
    const { rows } = await client.query('SELECT * FROM bot_status WHERE id = 1');
    console.log('✅ Table bot_status accessible');
    console.log('📊 Données actuelles:', rows[0]);
    
    await client.end();
    console.log('\n✅ Script terminé avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
  }
}

createBotStatusTable();
