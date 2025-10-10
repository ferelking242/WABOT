const { i18n } = require('../../lib/i18n');
const { getUserLanguage } = require('../../lib/languages');
const { db } = require('../../lib/database');

// Generate improved help message using i18n
function generateBugHelpMessage(senderId) {
    return i18n.t(senderId, 'commands.bug.help_title') + '\n\n' +
           i18n.t(senderId, 'commands.bug.help_desc') + '\n\n' +
           i18n.t(senderId, 'commands.bug.usage_format') + '\n' +
           i18n.t(senderId, 'commands.bug.usage_example') + '\n\n' +
           i18n.t(senderId, 'commands.bug.advanced_format') + '\n' +
           i18n.t(senderId, 'commands.bug.advanced_example') + '\n\n' +
           i18n.t(senderId, 'commands.bug.severity_info') + '\n\n' +
           i18n.t(senderId, 'commands.bug.tips');
}

async function bugCommand(sock, chatId, message, args = []) {
    try {
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        const userLang = getUserLanguage(senderId);

        // Show typing indicator
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        // Parse the input - format: .bug title | description [| steps | expected | actual]
        const input = args.join(' ').trim();
        
        if (!input) {
            return sock.sendMessage(chatId, {
                text: generateBugHelpMessage(senderId),
                quoted: message
            });
        }

        // Split by pipe character and clean up parts
        const parts = input.split('|').map(part => part.trim());
        
        if (parts.length < 2 || !parts[0] || !parts[1]) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.bug.invalid_format'),
                quoted: message
            });
        }

        const title = parts[0];
        const description = parts[1];
        const stepsToReproduce = parts[2] || null;
        const expectedBehavior = parts[3] || null;
        const actualBehavior = parts[4] || null;

        // Validate input
        if (title.length > 255) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.bug.title_too_long'),
                quoted: message
            });
        }

        if (!description || description.length === 0) {
            return sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.bug.description_required'),
                quoted: message
            });
        }

        // Extract command used from message history if possible
        let commandUsed = null;
        const messageText = message?.message?.conversation || 
                           message?.message?.extendedTextMessage?.text || '';
        const commandMatch = messageText.match(/\.(\w+)/);
        if (commandMatch) {
            commandUsed = commandMatch[0];
        }

        // Determine if it's a group
        const isGroup = chatId.endsWith('@g.us');
        const groupId = isGroup ? chatId : null;

        // Prepare bug report data
        const bugData = {
            userId: senderId,
            groupId: groupId,
            title: title,
            description: description,
            stepsToReproduce: stepsToReproduce,
            expectedBehavior: expectedBehavior,
            actualBehavior: actualBehavior,
            commandUsed: commandUsed,
            deviceInfo: {
                platform: 'WhatsApp',
                userLanguage: userLang,
                isGroup: isGroup,
                reportedAt: new Date().toISOString()
            }
        };

        // Save to database
        const bugReport = await db.createBugReport(bugData);

        // Send success message
        const successMessage = i18n.t(senderId, 'commands.bug.success', {
            id: bugReport.id,
            title: bugReport.title,
            description: bugReport.description,
            status: bugReport.status
        });

        await sock.sendMessage(chatId, {
            text: successMessage,
            quoted: message
        });

        // Log for developers
        console.log(`🐛 [BUG REPORT] New report #${bugReport.id} from ${senderId}: ${title}`);

    } catch (error) {
        console.error('❌ Error in bug command:', error);
        const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
        
        // Handle table not created error specially
        if (error.message === 'TABLES_NOT_CREATED') {
            await sock.sendMessage(chatId, {
                text: `⚠️ **Configuration Required**\n\nThe bug reporting system needs to be set up first. The database tables are not yet created.\n\n🔧 **For Developers:** Please create the required tables in Supabase dashboard using the schema defined in \`db/shared/schema.ts\`\n\n📋 **Required Tables:**\n• bug_reports\n• suggestions  \n• suggestion_votes\n\nOnce setup is complete, users can report bugs using \`.bug <title> | <description>\``,
                quoted: message
            });
        } else {
            await sock.sendMessage(chatId, {
                text: i18n.t(senderId, 'commands.bug.error'),
                quoted: message
            });
        }
    }
}

module.exports = bugCommand;