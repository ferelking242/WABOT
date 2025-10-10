/**
 * Gestionnaire du statut du bot dans la base de données
 * Met à jour le champ last_seen_at toutes les 5 minutes
 */

const postgres = require('postgres');

class BotStatusManager {
  constructor() {
    this.sql = null;
    this.updateInterval = null;
    this.isInitialized = false;
  }

  /**
   * Initialise le gestionnaire de statut
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️  BotStatusManager déjà initialisé');
      return;
    }

    try {
      // Connexion à la base de données
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.warn('⚠️  DATABASE_URL non configuré - statut du bot non géré');
        return;
      }

      this.sql = postgres(databaseUrl, {
        max: 1, // Connection pool minimal pour ce service
        idle_timeout: 20,
        connect_timeout: 10
      });

      // Créer la table bot_status si elle n'existe pas
      await this.createTableIfNotExists();

      // Mettre à jour immédiatement
      await this.updateStatus('online');

      // Démarrer la mise à jour automatique toutes les 5 minutes
      this.startAutoUpdate();

      this.isInitialized = true;
      console.log('✅ BotStatusManager initialisé - mise à jour toutes les 5 minutes');
    } catch (error) {
      console.error('❌ Erreur initialisation BotStatusManager:', error.message);
    }
  }

  /**
   * Crée la table bot_status si elle n'existe pas
   */
  async createTableIfNotExists() {
    try {
      await this.sql`
        CREATE TABLE IF NOT EXISTS bot_status (
          id INTEGER PRIMARY KEY DEFAULT 1,
          last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          status VARCHAR(20) DEFAULT 'offline',
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          CONSTRAINT single_row_check CHECK (id = 1)
        )
      `;

      // Insérer la ligne initiale si elle n'existe pas
      await this.sql`
        INSERT INTO bot_status (id, last_seen_at, status)
        VALUES (1, NOW(), 'offline')
        ON CONFLICT (id) DO NOTHING
      `;

      // Créer un index sur last_seen_at
      await this.sql`
        CREATE INDEX IF NOT EXISTS idx_bot_status_last_seen_at ON bot_status(last_seen_at)
      `;

      console.log('✅ Table bot_status créée/vérifiée');
    } catch (error) {
      console.error('❌ Erreur création table bot_status:', error.message);
      throw error;
    }
  }

  /**
   * Met à jour le statut du bot
   */
  async updateStatus(status = 'online') {
    if (!this.sql) {
      console.warn('⚠️  BotStatusManager non initialisé');
      return;
    }

    try {
      await this.sql`
        UPDATE bot_status
        SET 
          last_seen_at = NOW(),
          status = ${status},
          updated_at = NOW()
        WHERE id = 1
      `;
      
      console.log(`📡 Statut du bot mis à jour: ${status} à ${new Date().toISOString()}`);
    } catch (error) {
      console.error('❌ Erreur mise à jour statut:', error.message);
    }
  }

  /**
   * Démarre la mise à jour automatique du statut
   */
  startAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Mettre à jour toutes les 5 minutes (300000 ms)
    this.updateInterval = setInterval(async () => {
      await this.updateStatus('online');
    }, 5 * 60 * 1000);

    console.log('🔄 Mise à jour automatique du statut activée (toutes les 5 minutes)');
  }

  /**
   * Arrête le gestionnaire de statut
   */
  async shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Marquer le bot comme offline
    if (this.sql) {
      try {
        await this.updateStatus('offline');
      } catch (error) {
        console.error('❌ Erreur lors du marquage offline:', error.message);
      }

      await this.sql.end();
      this.sql = null;
    }

    this.isInitialized = false;
    console.log('👋 BotStatusManager arrêté');
  }
}

// Instance singleton
let botStatusManager = null;

function getBotStatusManager() {
  if (!botStatusManager) {
    botStatusManager = new BotStatusManager();
  }
  return botStatusManager;
}

module.exports = {
  BotStatusManager,
  getBotStatusManager
};
