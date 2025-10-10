require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const createTable = async () => {
  console.log('📊 Creating group_link_notifications table...');
  
  // Note: Supabase ne permet pas l'exécution directe de SQL via l'API
  // Cette table doit être créée via le Dashboard SQL Editor de Supabase
  console.log(`
✅ SQL à exécuter dans Supabase Dashboard:

CREATE TABLE IF NOT EXISTS group_link_notifications (
    id SERIAL PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    group_name VARCHAR(500) NOT NULL,
    group_type VARCHAR(50) DEFAULT 'group',
    user_id UUID,
    user_phone VARCHAR(50),
    participant_count INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT false,
    is_owner BOOLEAN DEFAULT false,
    is_bot_admin BOOLEAN DEFAULT false,
    linked_at TIMESTAMP DEFAULT NOW(),
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP,
    notification_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_link_notifications_pending 
ON group_link_notifications(notification_sent, created_at) 
WHERE notification_sent = false;

CREATE INDEX IF NOT EXISTS idx_group_link_notifications_group_id 
ON group_link_notifications(group_id);
  `);
  
  // Test if table exists
  const { data, error } = await supabase
    .from('group_link_notifications')
    .select('id')
    .limit(1);
  
  if (!error) {
    console.log('✅ Table group_link_notifications existe déjà!');
  } else if (error.code === 'PGRST116' || error.code === 'PGRST204' || error.message.includes('does not exist')) {
    console.log('⚠️  Table group_link_notifications n\'existe pas encore');
    console.log('📝 Veuillez exécuter le SQL ci-dessus dans Supabase Dashboard');
    console.log('🔗 https://supabase.com/dashboard/project/[YOUR_PROJECT]/sql/new');
  } else {
    console.error('❌ Erreur:', error);
  }
};

createTable().then(() => process.exit(0));
