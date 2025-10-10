require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    console.log('🧪 Test de la table group_commands_config...');
    
    const testData = {
        group_id: 'test_group_' + Date.now(),
        command_name: 'test_command',
        is_enabled: true
    };
    
    const { data: insertData, error: insertError } = await supabase
        .from('group_commands_config')
        .insert(testData)
        .select();
    
    if (insertError) {
        console.log('❌ ERREUR:', insertError.message);
        console.log('Code:', insertError.code);
        console.log('Details:', insertError.details);
        console.log('');
        console.log('La table n\'existe probablement pas. Créez-la avec le SQL suivant dans Supabase SQL Editor:');
        console.log('https://supabase.com/dashboard/project/_/editor');
        console.log('');
        const fs = require('fs');
        const sql = fs.readFileSync(__dirname + '/../dev/sql/create_group_commands_config.sql', 'utf8');
        console.log(sql);
        process.exit(1);
    }
    
    console.log('✅ Insert réussi:', insertData[0].id);
    
    // Nettoyer
    await supabase
        .from('group_commands_config')
        .delete()
        .eq('group_id', testData.group_id);
    
    console.log('✅ Table fonctionne correctement!');
    process.exit(0);
})();
