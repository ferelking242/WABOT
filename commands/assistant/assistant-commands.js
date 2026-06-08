/**
 * Commandes pour la gestion des assistants personnels
 */

const PersonalAssistant = require('../../serena-assistant/enhanced/PersonalAssistant');
const { channelConfig } = require('../../lib/channelConfig');
const { i18n } = require('../../lib/i18n');

/**
 * Commande principale pour les assistants
 */
async function assistantCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        
        if (!args || args.length === 0) {
            const helpMessage = `🤖 *ASSISTANT PERSONNEL*\n\n` +
                              `👤 *GESTION DE VOTRE ASSISTANT:*\n\n` +
                              `• \`.assistant info\` - Voir les infos de votre assistant\n` +
                              `• \`.assistant create [nom] [genre] [personnalité]\` - Créer un assistant\n` +
                              `• \`.assistant rename [nouveau_nom]\` - Changer le nom\n` +
                              `• \`.assistant personality [type]\` - Changer la personnalité\n` +
                              `• \`.assistant bio [description]\` - Définir une biographie\n` +
                              `• \`.assistant enable\` - Activer l'assistant\n` +
                              `• \`.assistant disable\` - Désactiver l'assistant\n` +
                              `• \`.assistant test [message]\` - Tester une réponse\n\n` +
                              `🎭 *PERSONNALITÉS DISPONIBLES:*\n` +
                              `• \`friendly\` - Chaleureux et amical\n` +
                              `• \`professional\` - Formel et efficace\n` +
                              `• \`casual\` - Très décontracté\n` +
                              `• \`formal\` - Très respectueux\n\n` +
                              `👫 *GENRES:* \`female\`, \`male\`, \`neutral\`\n\n` +
                              `💡 *Exemple:*\n` +
                              `\`.assistant create Marie female friendly\``;

            await sock.sendMessage(chatId, {
                text: helpMessage,
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const command = args[0].toLowerCase();
        const additionalArgs = args.slice(1);

        // Identifier le companion (pour cette démo, on utilise le senderId)
        const companionId = senderId;

        switch (command) {
            case 'info':
                await showAssistantInfo(sock, chatId, message, companionId);
                break;

            case 'create':
                await createAssistant(sock, chatId, message, companionId, additionalArgs);
                break;

            case 'rename':
                await renameAssistant(sock, chatId, message, companionId, additionalArgs.join(' '));
                break;

            case 'personality':
                await changePersonality(sock, chatId, message, companionId, additionalArgs[0]);
                break;

            case 'bio':
                await setBio(sock, chatId, message, companionId, additionalArgs.join(' '));
                break;

            case 'enable':
                await toggleAssistant(sock, chatId, message, companionId, true);
                break;

            case 'disable':
                await toggleAssistant(sock, chatId, message, companionId, false);
                break;

            case 'test':
                await testAssistant(sock, chatId, message, companionId, additionalArgs.join(' '));
                break;

            case 'help':
                await assistantCommand(sock, chatId, message, []);
                break;

            default:
                await sock.sendMessage(chatId, {
                    text: `❌ Commande inconnue: ${command}\n\nUtilisez \`.assistant help\` pour voir toutes les commandes disponibles.`,
                    ...channelConfig
                }, { quoted: message });
                break;
        }

    } catch (error) {
        console.error('Erreur dans la commande assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de l'exécution de la commande assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Afficher les informations de l'assistant
 */
async function showAssistantInfo(sock, chatId, message, companionId) {
    try {
        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant) {
            await sock.sendMessage(chatId, {
                text: "❌ Aucun assistant trouvé. Utilisez `.assistant create` pour en créer un.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const expertiseAreas = JSON.parse(assistant.assistant.expertise_areas || '[]');
        
        const infoText = `🤖 *VOTRE ASSISTANT PERSONNEL*\n\n` +
                        `👤 *Nom:* ${assistant.assistant.assistant_name}\n` +
                        `🎭 *Personnalité:* ${assistant.assistant.personality_profile}\n` +
                        `👫 *Genre:* ${assistant.assistant.gender}\n` +
                        `💼 *Type:* ${assistant.assistant.assistant_type}\n` +
                        `🗣️ *Style:* ${assistant.assistant.voice_style}\n` +
                        `⚡ *Statut:* ${assistant.assistant.is_enabled ? '✅ Actif' : '❌ Inactif'}\n\n` +
                        (assistant.assistant.bio ? `📖 *Biographie:*\n${assistant.assistant.bio}\n\n` : '') +
                        (expertiseAreas.length > 0 ? `🎯 *Expertise:* ${expertiseAreas.join(', ')}\n\n` : '') +
                        `📅 *Créé le:* ${new Date(assistant.assistant.created_at).toLocaleDateString()}\n` +
                        `🔄 *Dernière MAJ:* ${new Date(assistant.assistant.updated_at).toLocaleDateString()}`;

        await sock.sendMessage(chatId, {
            text: infoText,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur affichage info assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la récupération des informations de l'assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Créer un nouvel assistant
 */
async function createAssistant(sock, chatId, message, companionId, args) {
    try {
        const [name, gender, personality] = args;
        
        if (!name) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier au moins un nom pour votre assistant.\n\nUtilisation: `.assistant create [nom] [genre] [personnalité]`\n\nExemple: `.assistant create Marie female friendly`",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const assistant = new PersonalAssistant(companionId);
        
        // Valider les paramètres
        const validGenders = ['female', 'male', 'neutral'];
        const validPersonalities = ['friendly', 'professional', 'casual', 'formal'];
        
        const finalGender = gender && validGenders.includes(gender.toLowerCase()) ? gender.toLowerCase() : 'neutral';
        const finalPersonality = personality && validPersonalities.includes(personality.toLowerCase()) ? personality.toLowerCase() : 'friendly';

        // Créer l'assistant avec les paramètres fournis
        await assistant.createAssistant({
            name: name,
            gender: finalGender,
            personality: finalPersonality,
            assistantType: 'commercial',
            expertiseAreas: ['service client', 'vente', 'support'],
            voiceStyle: 'warm'
        });

        const successText = `✅ *Assistant créé avec succès !*\n\n` +
                           `👤 *Nom:* ${assistant.assistant.assistant_name}\n` +
                           `👫 *Genre:* ${assistant.assistant.gender}\n` +
                           `🎭 *Personnalité:* ${assistant.assistant.personality_profile}\n\n` +
                           `🎉 Votre assistant est maintenant prêt à vous aider !\n` +
                           `💡 Utilisez \`.assistant test [message]\` pour tester une interaction.`;

        await sock.sendMessage(chatId, {
            text: successText,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur création assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la création de l'assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Renommer l'assistant
 */
async function renameAssistant(sock, chatId, message, companionId, newName) {
    try {
        if (!newName) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier un nouveau nom.\n\nUtilisation: `.assistant rename [nouveau_nom]`",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant) {
            await sock.sendMessage(chatId, {
                text: "❌ Aucun assistant trouvé. Créez-en un d'abord avec `.assistant create`.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const oldName = assistant.assistant.assistant_name;
        await assistant.customize({ name: newName });

        await sock.sendMessage(chatId, {
            text: `✅ Assistant renommé avec succès !\n\n${oldName} → ${newName}`,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur renommage assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors du renommage de l'assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Changer la personnalité
 */
async function changePersonality(sock, chatId, message, companionId, newPersonality) {
    try {
        const validPersonalities = ['friendly', 'professional', 'casual', 'formal'];
        
        if (!newPersonality || !validPersonalities.includes(newPersonality.toLowerCase())) {
            await sock.sendMessage(chatId, {
                text: `❌ Personnalité invalide.\n\nPersonnalités disponibles: ${validPersonalities.join(', ')}\n\nUtilisation: \`.assistant personality [type]\``,
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant) {
            await sock.sendMessage(chatId, {
                text: "❌ Aucun assistant trouvé. Créez-en un d'abord avec `.assistant create`.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        await assistant.customize({ personality: newPersonality.toLowerCase() });

        const personalityDescriptions = {
            friendly: 'Chaleureux et amical 😊',
            professional: 'Formel et efficace 💼',
            casual: 'Très décontracté 😎',
            formal: 'Très respectueux 🎩'
        };

        await sock.sendMessage(chatId, {
            text: `✅ Personnalité changée !\n\n${assistant.assistant.assistant_name} est maintenant ${personalityDescriptions[newPersonality.toLowerCase()]}`,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur changement personnalité:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors du changement de personnalité.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Définir une biographie
 */
async function setBio(sock, chatId, message, companionId, bio) {
    try {
        if (!bio) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier une biographie.\n\nUtilisation: `.assistant bio [description]`",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant) {
            await sock.sendMessage(chatId, {
                text: "❌ Aucun assistant trouvé. Créez-en un d'abord avec `.assistant create`.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        await assistant.customize({ bio: bio });

        await sock.sendMessage(chatId, {
            text: `✅ Biographie mise à jour pour ${assistant.assistant.assistant_name} !\n\n📖 *Nouvelle biographie:*\n${bio}`,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur définition bio:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors de la définition de la biographie.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Activer/désactiver l'assistant
 */
async function toggleAssistant(sock, chatId, message, companionId, enable) {
    try {
        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant) {
            await sock.sendMessage(chatId, {
                text: "❌ Aucun assistant trouvé. Créez-en un d'abord avec `.assistant create`.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Mettre à jour le statut (cette fonction devrait être ajoutée à PersonalAssistant)
        await assistant.customize({ isEnabled: enable });

        const statusText = enable ? '✅ activé' : '❌ désactivé';
        await sock.sendMessage(chatId, {
            text: `${enable ? '✅' : '❌'} Assistant ${assistant.assistant.assistant_name} ${statusText} !`,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur toggle assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors du changement de statut de l'assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

/**
 * Tester l'assistant
 */
async function testAssistant(sock, chatId, message, companionId, testMessage) {
    try {
        if (!testMessage) {
            await sock.sendMessage(chatId, {
                text: "❌ Veuillez spécifier un message de test.\n\nUtilisation: `.assistant test [message]`\n\nExemple: `.assistant test Bonjour, comment ça va ?`",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        const assistant = new PersonalAssistant(companionId);
        await assistant.initialize();

        if (!assistant.assistant || !assistant.assistant.is_enabled) {
            await sock.sendMessage(chatId, {
                text: "❌ Assistant non disponible ou désactivé.",
                ...channelConfig
            }, { quoted: message });
            return;
        }

        // Simulation du traitement du message
        const response = await assistant.processMessage(chatId, testMessage, { test: true });

        const testResult = `🧪 *TEST ASSISTANT*\n\n` +
                          `👤 *Assistant:* ${assistant.assistant.assistant_name}\n` +
                          `📨 *Message test:* ${testMessage}\n\n` +
                          `🤖 *Réponse:*\n${response}`;

        await sock.sendMessage(chatId, {
            text: testResult,
            ...channelConfig
        }, { quoted: message });

    } catch (error) {
        console.error('Erreur test assistant:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Erreur lors du test de l'assistant.",
            ...channelConfig
        }, { quoted: message });
    }
}

module.exports = {
    name: 'assistant',
    description: 'Gérer votre assistant personnel avec nom humain',
    category: 'companion',
    usage: '.assistant [info|create|rename|personality|bio|enable|disable|test|help]',
    execute: assistantCommand
};