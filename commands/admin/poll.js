const { channelConfig } = require('../../lib/channelConfig');
const { supabase } = require('../../lib/supabase');

// Create poll in Supabase
async function createPoll(groupId, creatorId, question, options) {
    try {
        console.log('📊 [POLL] Création sondage:', { groupId, creatorId, question, options: options.length });
        
        const { data, error } = await supabase
            .from('polls')
            .insert({
                group_id: groupId,
                creator_id: creatorId,
                question: question,
                options: options,
                votes: {},
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('❌ [POLL] Erreur création sondage:', error);
            return null;
        }

        console.log('✅ [POLL] Sondage créé avec ID:', data.id);
        return data;
    } catch (err) {
        console.error('❌ [POLL] Erreur dans createPoll:', err);
        return null;
    }
}

// Get poll by ID
async function getPoll(groupId, pollId) {
    try {
        const { data, error } = await supabase
            .from('polls')
            .select('*')
            .eq('group_id', groupId)
            .eq('id', pollId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error getting poll:', error);
            return null;
        }

        return data || null;
    } catch (err) {
        console.error('Error in getPoll:', err);
        return null;
    }
}

// Update poll votes
async function updatePollVotes(pollId, votes) {
    try {
        console.log('🗳️ [POLL] Mise à jour votes pour sondage:', pollId, 'Total votes:', Object.keys(votes).length);
        
        const { error } = await supabase
            .from('polls')
            .update({ 
                votes: votes,
                updated_at: new Date().toISOString()
            })
            .eq('id', pollId);

        if (error) {
            console.error('❌ [POLL] Erreur mise à jour votes:', error);
            return false;
        }

        console.log('✅ [POLL] Votes mis à jour avec succès');
        return true;
    } catch (err) {
        console.error('❌ [POLL] Erreur dans updatePollVotes:', err);
        return false;
    }
}

// Get active polls for group
async function getActivePolls(groupId) {
    try {
        const { data, error } = await supabase
            .from('polls')
            .select('*')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error getting active polls:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Error in getActivePolls:', err);
        return [];
    }
}

// Create poll command
async function pollCommand(sock, chatId, senderId, message, args) {
    try {
        if (!args.length) {
            await sock.sendMessage(chatId, {
                text: `📊 *CRÉATEUR DE SONDAGES*\n\n*Utilisation:*\n\`.poll "question" option1|option2|option3\`\n\n*Exemples:*\n• \`.poll "Quelle pizza préférez-vous?" Margherita|Pepperoni|4 Fromages|Végétarienne\`\n• \`.poll "Film ce soir?" Action|Comédie|Horror\`\n\n*Commandes:*\n• \`.vote [numéro]\` - Voter\n• \`.pollresults\` - Voir résultats\n• \`.polls\` - Sondages actifs\n• \`.endpoll [id]\` - Terminer (admins)`,
                ...channelConfig
            });
            return;
        }

        const text = args.join(' ');
        
        // Parse question and options
        const questionMatch = text.match(/^"([^"]+)"\s*(.*)$/);
        if (!questionMatch) {
            await sock.sendMessage(chatId, {
                text: '❌ Format incorrect !\n\n📝 *Format:* `.poll "question" option1|option2|option3`\n\n💡 La question doit être entre guillemets et les options séparées par |',
                ...channelConfig
            });
            return;
        }

        const question = questionMatch[1].trim();
        const optionsText = questionMatch[2].trim();
        
        if (!optionsText) {
            await sock.sendMessage(chatId, {
                text: '❌ Aucune option fournie !\n\n📝 Ajoutez les options séparées par | après la question',
                ...channelConfig
            });
            return;
        }

        const options = optionsText.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
        
        if (options.length < 2) {
            await sock.sendMessage(chatId, {
                text: '❌ Au moins 2 options sont requises !',
                ...channelConfig
            });
            return;
        }

        if (options.length > 10) {
            await sock.sendMessage(chatId, {
                text: '❌ Maximum 10 options autorisées !',
                ...channelConfig
            });
            return;
        }

        // Validation supplémentaire
        if (question.length > 200) {
            await sock.sendMessage(chatId, {
                text: '❌ Question trop longue ! Maximum 200 caractères.',
                ...channelConfig
            });
            return;
        }

        if (options.some(opt => opt.length > 100)) {
            await sock.sendMessage(chatId, {
                text: '❌ Une ou plusieurs options sont trop longues ! Maximum 100 caractères par option.',
                ...channelConfig
            });
            return;
        }

        // Create poll in Supabase
        const pollRecord = await createPoll(chatId, senderId, question, options);
        if (!pollRecord) {
            console.error('❌ [POLL] Échec création sondage pour:', chatId);
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la création du sondage ! Veuillez réessayer.',
                ...channelConfig
            });
            return;
        }

        const pollId = pollRecord.id;
        console.log('🎉 [POLL] Sondage créé avec succès, ID:', pollId);

        // Format poll message
        let pollText = `📊 *NOUVEAU SONDAGE*\n\n❓ *${question}*\n\n`;
        options.forEach((option, index) => {
            pollText += `*${index + 1}.* ${option}\n`;
        });
        pollText += `\n💡 *Votez avec:* \`.vote ${pollId} [numéro]\`\n🆔 *ID:* \`${pollId}\`\n⏰ *Créé par:* @${senderId.split('@')[0]}`;

        await sock.sendMessage(chatId, {
            text: pollText,
            mentions: [senderId],
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in poll command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la création du sondage !',
            ...channelConfig
        });
    }
}

// Vote command
async function voteCommand(sock, chatId, senderId, message, args) {
    try {
        if (args.length < 2) {
            await sock.sendMessage(chatId, {
                text: '❌ Format incorrect !\n\n📝 *Utilisation:* `.vote [poll_id] [numéro_option]`\n\n💡 Utilisez `.polls` pour voir les sondages actifs',
                ...channelConfig
            });
            return;
        }

        const pollId = args[0];
        const optionNumber = parseInt(args[1]);

        const poll = await getPoll(chatId, pollId);

        if (!poll) {
            await sock.sendMessage(chatId, {
                text: '❌ Sondage introuvable !\n\n💡 Utilisez `.polls` pour voir les sondages actifs',
                ...channelConfig
            });
            return;
        }

        if (!poll.is_active) {
            await sock.sendMessage(chatId, {
                text: '❌ Ce sondage est terminé !',
                ...channelConfig
            });
            return;
        }

        if (isNaN(optionNumber) || optionNumber < 1 || optionNumber > poll.options.length) {
            await sock.sendMessage(chatId, {
                text: `❌ Option invalide !\n\n📝 Choisissez un numéro entre 1 et ${poll.options.length}`,
                ...channelConfig
            });
            return;
        }

        // Check if user already voted
        const votes = poll.votes || {};
        const previousVote = votes[senderId];
        if (previousVote) {
            await sock.sendMessage(chatId, {
                text: `❌ Vous avez déjà voté !\n\n🗳️ *Votre vote:* ${poll.options[previousVote - 1]}\n\n💡 Chaque personne ne peut voter qu'une seule fois`,
                ...channelConfig
            });
            return;
        }

        // Record vote
        votes[senderId] = optionNumber;
        const success = await updatePollVotes(poll.id, votes);
        if (!success) {
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de l\'enregistrement du vote !',
                ...channelConfig
            });
            return;
        }

        await sock.sendMessage(chatId, {
            text: `✅ *Vote enregistré !*\n\n🗳️ Vous avez voté pour: *${poll.options[optionNumber - 1]}*\n\n💡 Utilisez \`.pollresults ${pollId}\` pour voir les résultats`,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in vote command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors du vote !',
            ...channelConfig
        });
    }
}

// Poll results command
async function pollResultsCommand(sock, chatId, senderId, message, args) {
    try {
        const pollId = args[0];
        
        if (!pollId) {
            await sock.sendMessage(chatId, {
                text: '❌ ID de sondage requis !\n\n📝 *Utilisation:* `.pollresults [poll_id]`\n\n💡 Utilisez `.polls` pour voir les sondages actifs',
                ...channelConfig
            });
            return;
        }

        const poll = await getPoll(chatId, pollId);

        if (!poll) {
            await sock.sendMessage(chatId, {
                text: '❌ Sondage introuvable !',
                ...channelConfig
            });
            return;
        }

        // Calculate results
        const votes = Object.values(poll.votes || {});
        const totalVotes = votes.length;
        const optionCounts = {};
        
        // Initialize counts
        poll.options.forEach((_, index) => {
            optionCounts[index + 1] = 0;
        });
        
        // Count votes
        votes.forEach(vote => {
            optionCounts[vote]++;
        });

        // Format results
        let resultsText = `📊 *RÉSULTATS DU SONDAGE*\n\n❓ *${poll.question}*\n\n`;
        
        poll.options.forEach((option, index) => {
            const count = optionCounts[index + 1];
            const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : '0.0';
            const bar = '█'.repeat(Math.floor(percentage / 5));
            
            resultsText += `*${index + 1}.* ${option}\n`;
            resultsText += `📊 ${bar} ${percentage}% (${count} votes)\n\n`;
        });

        resultsText += `🗳️ *Total:* ${totalVotes} votes\n`;
        resultsText += `📅 *Créé:* ${new Date(poll.created_at).toLocaleString()}\n`;
        resultsText += `🆔 *ID:* \`${pollId}\`\n`;
        resultsText += `📊 *Statut:* ${poll.is_active ? '🟢 Actif' : '🔴 Terminé'}`;

        await sock.sendMessage(chatId, {
            text: resultsText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in poll results command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de l\'affichage des résultats !',
            ...channelConfig
        });
    }
}

// List active polls
async function listPollsCommand(sock, chatId, senderId, message, args) {
    try {
        const activePolls = await getActivePolls(chatId);
        
        if (activePolls.length === 0) {
            await sock.sendMessage(chatId, {
                text: '📊 *AUCUN SONDAGE ACTIF*\n\nCréez un nouveau sondage avec:\n`.poll "question" option1|option2|option3`',
                ...channelConfig
            });
            return;
        }

        let pollsList = `📊 *SONDAGES ACTIFS* (${activePolls.length})\n\n`;
        
        activePolls.forEach((poll, index) => {
            const votesCount = Object.keys(poll.votes || {}).length;
            const createdDate = new Date(poll.created_at).toLocaleDateString();
            
            pollsList += `*${index + 1}.* ${poll.question}\n`;
            pollsList += `🗳️ ${votesCount} votes • 📅 ${createdDate}\n`;
            pollsList += `🆔 ID: \`${poll.id}\`\n\n`;
        });

        pollsList += `💡 *Commandes:*\n• \`.vote [id] [numéro]\` - Voter\n• \`.pollresults [id]\` - Voir résultats`;

        await sock.sendMessage(chatId, {
            text: pollsList,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in list polls command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de l\'affichage des sondages !',
            ...channelConfig
        });
    }
}

// End poll command (admin only)
async function endPollCommand(sock, chatId, senderId, message, args) {
    try {
        if (!args.length) {
            await sock.sendMessage(chatId, {
                text: '❌ ID de sondage requis !\n\n📝 *Utilisation:* `.endpoll [poll_id]`',
                ...channelConfig
            });
            return;
        }

        const pollId = args[0];
        const poll = await getPoll(chatId, pollId);

        if (!poll) {
            await sock.sendMessage(chatId, {
                text: '❌ Sondage introuvable !',
                ...channelConfig
            });
            return;
        }

        if (!poll.is_active) {
            await sock.sendMessage(chatId, {
                text: '❌ Ce sondage est déjà terminé !',
                ...channelConfig
            });
            return;
        }

        // Terminate poll
        const { error } = await supabase
            .from('polls')
            .update({ 
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', pollId);

        if (error) {
            console.error('❌ [POLL] Erreur fermeture sondage:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Erreur lors de la fermeture du sondage !',
                ...channelConfig
            });
            return;
        }

        console.log('🔒 [POLL] Sondage fermé:', pollId);
        
        // Show final results
        await pollResultsCommand(sock, chatId, senderId, message, [pollId]);
        
        await sock.sendMessage(chatId, {
            text: `🔒 *Sondage terminé !*\n\n📊 Le sondage \`${pollId}\` a été fermé par un administrateur.\n\n💡 Utilisez \`.pollresults ${pollId}\` pour voir les résultats finaux.`,
            ...channelConfig
        });

    } catch (error) {
        console.error('❌ [POLL] Erreur endpoll:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Erreur lors de la fermeture du sondage !',
            ...channelConfig
        });
    }
}

module.exports = {
    pollCommand,
    voteCommand,
    pollResultsCommand,
    listPollsCommand,
    endPollCommand
};