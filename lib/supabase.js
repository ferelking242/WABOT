/**
 * Supabase Configuration for WhatsApp Bot
 * Utilise les variables d'environnement du .env racine
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase is optional — bot starts without it, DB features are disabled
const SUPABASE_ENABLED = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let supabase = null;

if (SUPABASE_ENABLED) {
    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: { autoRefreshToken: false, persistSession: false }
        }
    );
    console.log('✅ Supabase client configuré pour le bot WhatsApp');
} else {
    console.warn('⚠️  Supabase non configuré — fonctionnalités DB désactivées (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes)');
}

// Services pour le bot
const supabaseBot = {
    async saveGroupInfo(groupData) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('bot_groups').upsert(groupData, { onConflict: 'group_id', ignoreDuplicates: false }).select().single();
            if (error) { console.error('❌ Erreur sauvegarde groupe:', error); return null; }
            return data;
        } catch (e) { return null; }
    },

    async getGroupsByOwner(ownerNumber) {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase.from('bot_groups').select('*').or(`owner_whatsapp_number.eq.${ownerNumber},admin_whatsapp_numbers.cs.{${ownerNumber}}`);
            if (error) { return []; }
            return data;
        } catch (e) { return []; }
    },

    async saveAnalytics(analyticsData) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('bot_analytics').insert(analyticsData).select().single();
            if (error) { return null; }
            return data;
        } catch (e) { return null; }
    },

    async testConnection() {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('bot_groups').select('id').limit(1);
            return !error;
        } catch (e) { return false; }
    }
};

module.exports = {
    supabase,
    supabaseBot
};