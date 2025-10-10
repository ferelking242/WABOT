/**
 * Configuration Supabase sécurisée pour wabot
 * Utilise uniquement les variables d'environnement
 */

require('dotenv').config();

module.exports = {
    // Supabase Configuration - Utilise les variables d'environnement
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    
    // Database Configuration  
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_PASSWORD: process.env.DB_PASSWORD,
    
    // PostgreSQL Connection URLs
    POSTGRES_DIRECT_URL: process.env.DATABASE_URL,
    POSTGRES_TRANSACTION_POOLER: process.env.DATABASE_URL_TRANSACTION,
    POSTGRES_SESSION_POOLER: process.env.DATABASE_URL_SESSION,
    
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development'
};