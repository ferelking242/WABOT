const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');
const { db } = require('../../lib/database');

// Valid categories for suggestions
const VALID_CATEGORIES = ['feature', 'improvement', 'ui/ux', 'performance', 'general'];

// Generate improved help message using i18n
function generateSuggestHelpMessage(senderId) {
    return i18n.t(senderId, 'commands.suggest.help_title') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.help_desc') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.usage_format') + '\n' +
           i18n.t(senderId, 'commands.suggest.usage_example') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.category_format') + '\n' +
           i18n.t(senderId, 'commands.suggest.category_example') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.categories') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.priority_info') + '\n\n' +
           i18n.t(senderId, 'commands.suggest.tips');
}

async function suggestCommand(sock, chatId, message, args = []) {
    try {
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        const userLang = getUserLanguage(senderId);

        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        // Parse the input - format: .suggest title | description [| category]
        const input = args.join(' ').trim();
        
        if (!input) {
            return sock.sendMessage(chatId, {
                text: generateSuggestHelpMessage(senderId),
                quoted: message
            });
        }

        // Split by pipe character and clean up parts
        const parts = input.split('|').map(part => part.trim());
        
        if (parts.length < 2 || !parts[0] || !parts[1]) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.suggest.invalid_format'),
                quoted: message
            });
        }

        const title = parts[0];
        const description = parts[1];
        let category = parts[2] || 'general';

        // Validate input
        if (title.length > 255) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.suggest.title_too_long'),
                quoted: message
            });
        }

        if (!description || description.length === 0) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.suggest.description_required'),
                quoted: message
            });
        }

        // Validate category
        category = category.toLowerCase();
        if (!VALID_CATEGORIES.includes(category)) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.suggest.invalid_category'),
                quoted: message
            });
        }

        // Determine if it's a group
        const isGroup = chatId.endsWith('@g.us');
        const groupId = isGroup ? chatId : null;

        // Prepare suggestion data
        const suggestionData = {
            userId: senderId,
            groupId: groupId,
            title: title,
            description: description,
            category: category
        };

        // Save to database
        const suggestion = await db.createSuggestion(suggestionData);

        // Send success message
        const successMessage = i18n.t(senderId, 'commands.suggest.success', {
            id: suggestion.id,
            title: suggestion.title,
            description: suggestion.description,
            category: suggestion.category,
            status: suggestion.status
        });

        await sock.sendMessage(chatId, {
            text: successMessage,
            quoted: message
        });

        // Log for developers
        console.log(`💡 [SUGGESTION] New suggestion #${suggestion.id} from ${senderId}: ${title} (${category})`);

    } catch (error) {
        console.error('❌ Error in suggest command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        
        // Handle table not created error specially
        if (error.message === 'TABLES_NOT_CREATED') {
            await sock.sendMessage(chatId, {
                text: `⚠️ **Configuration Required**\n\nThe suggestion system needs to be set up first. The database tables are not yet created.\n\n🔧 **For Developers:** Please create the required tables in Supabase dashboard using the schema defined in \`db/shared/schema.ts\`\n\n📋 **Required Tables:**\n• bug_reports\n• suggestions  \n• suggestion_votes\n\nOnce setup is complete, users can submit suggestions using \`.suggest <title> | <description>\``,
                quoted: message
            });
        } else {
            await sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.suggest.error'),
                quoted: message
            });
        }
    }
}

module.exports = suggestCommand;