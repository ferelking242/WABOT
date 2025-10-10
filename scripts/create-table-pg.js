require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const createTable = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Create table
    await client.query(`
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
    `);
    console.log('✅ Table group_link_notifications created successfully');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_link_notifications_pending 
      ON group_link_notifications(notification_sent, created_at) 
      WHERE notification_sent = false;
    `);
    console.log('✅ Index idx_group_link_notifications_pending created');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_link_notifications_group_id 
      ON group_link_notifications(group_id);
    `);
    console.log('✅ Index idx_group_link_notifications_group_id created');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
};

createTable();
