const { i18n, getText, getUserLanguage } = require('../../lib/i18n');
const settings = require('../../config/settings');

async function languageCommand(sock, chatId, message, args) {
    try {
        console.log('🌐 Language command called with args:', args);
        const userId = message.key.remoteJid;
        const currentLang = getUserLanguage(userId);
        
        // If no argument provided, show current language and available options
        if (!args || args.length === 0) {
            const availableLanguages = i18n.getAvailableLanguages().map(lang => lang.code);
            const languageNames = {
                'fr': '🇫🇷 Français',
                'en': '🇺🇸 English', 
                'es': '🇪🇸 Español'
            };
            
            let response = `╔═══════════════════╗\n`;
            response += `   🌐 *${getText(userId, 'CAT_LANGUAGE', 'fr')}*\n`;
            response += `╚═══════════════════╝\n\n`;
            response += `📍 *Langue actuelle:* ${languageNames[currentLang] || currentLang}\n\n`;
            response += `🔤 *Langues disponibles:*\n`;
            
            availableLanguages.forEach(lang => {
                const marker = lang === currentLang ? '✅' : '▫️';
                response += `${marker} \`.lang ${lang}\` - ${languageNames[lang]}\n`;
            });
            
            response += `\n💡 *Utilisation:* \`.lang <code>\`\n`;
            response += `📝 *Exemple:* \`.lang en\` pour Anglais\n`;
            response += `🤖 Le bot détecte automatiquement votre langue`;
            
            await sock.sendMessage(chatId, { 
                text: response
            }, { quoted: message });
            return;
        }
        
        const newLanguage = args[0].toLowerCase();
        const availableLanguages = i18n.getAvailableLanguages().map(lang => lang.code);
        
        // Check if language is supported
        if (!availableLanguages.includes(newLanguage)) {
            const languageNames = {
                'fr': '🇫🇷 Français',
                'en': '🇺🇸 English', 
                'es': '🇪🇸 Español'
            };
            
            let errorMsg = `❌ *Langue non supportée!*\n\n`;
            errorMsg += `🔤 *Langues disponibles:*\n`;
            availableLanguages.forEach(lang => {
                errorMsg += `▫️ \`.lang ${lang}\` - ${languageNames[lang]}\n`;
            });
            
            await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
            return;
        }
        
        // Set new language
        const success = i18n.setUserLanguage(userId, newLanguage);
        if (success) {
            const languageNames = {
                'fr': '🇫🇷 Français',
                'en': '🇺🇸 English', 
                'es': '🇪🇸 Español'
            };
            
            let successMsg = '';
            switch(newLanguage) {
                case 'fr':
                    successMsg = `✅ *Langue changée avec succès!*\n🇫🇷 wabot parle maintenant en *Français*\n\n💡 Tapez \`.help\` pour voir le menu en français`;
                    break;
                case 'en':
                    successMsg = `✅ *Language changed successfully!*\n🇺🇸 wabot now speaks *English*\n\n💡 Type \`.help\` to see the menu in English`;
                    break;
                case 'es':
                    successMsg = `✅ *¡Idioma cambiado exitosamente!*\n🇪🇸 wabot ahora habla en *Español*\n\n💡 Escribe \`.help\` para ver el menú en español`;
                    break;
                default:
                    successMsg = `✅ Language changed to ${languageNames[newLanguage]}`;
            }
            
            await sock.sendMessage(chatId, { 
                text: successMsg
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: '❌ Erreur lors du changement de langue' }, { quoted: message });
        }
        
    } catch (error) {
        console.error('Error in language command:', error);
        await sock.sendMessage(chatId, { text: '❌ Une erreur s\'est produite lors du changement de langue' }, { quoted: message });
    }
}

module.exports = { languageCommand };