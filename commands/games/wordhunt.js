const { channelConfig } = require('../../lib/channelConfig');
const { getUserLanguage } = require('../../lib/languages');

// Store active word hunt games
let wordHuntGames = {};

// Word lists by language and difficulty
const wordLists = {
    fr: {
        easy: ['chat', 'chien', 'maison', 'rouge', 'bleu', 'grand', 'petit', 'livre', 'table', 'eau'],
        normal: ['ordinateur', 'téléphone', 'voiture', 'restaurant', 'université', 'bibliothèque', 'médecin', 'professeur', 'musique', 'cinéma'],
        hard: ['philosophie', 'architecture', 'psychologie', 'technologie', 'photographie', 'mathématiques', 'astronaute', 'entrepreneur', 'sophistiqué', 'extraordinaire']
    },
    en: {
        easy: ['cat', 'dog', 'house', 'red', 'blue', 'big', 'small', 'book', 'table', 'water'],
        normal: ['computer', 'telephone', 'car', 'restaurant', 'university', 'library', 'doctor', 'teacher', 'music', 'cinema'],
        hard: ['philosophy', 'architecture', 'psychology', 'technology', 'photography', 'mathematics', 'astronaut', 'entrepreneur', 'sophisticated', 'extraordinary']
    },
    es: {
        easy: ['gato', 'perro', 'casa', 'rojo', 'azul', 'grande', 'pequeño', 'libro', 'mesa', 'agua'],
        normal: ['ordenador', 'teléfono', 'coche', 'restaurante', 'universidad', 'biblioteca', 'médico', 'profesor', 'música', 'cine'],
        hard: ['filosofía', 'arquitectura', 'psicología', 'tecnología', 'fotografía', 'matemáticas', 'astronauta', 'empresario', 'sofisticado', 'extraordinario']
    }
};

// Scramble word function
function scrambleWord(word) {
    const letters = word.split('');
    let scrambled = [...letters];
    
    // Fisher-Yates shuffle
    for (let i = scrambled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
    }
    
    // Ensure it's actually scrambled (not the same as original)
    let attempts = 0;
    while (scrambled.join('') === word && attempts < 10) {
        for (let i = scrambled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
        }
        attempts++;
    }
    
    return scrambled.join('');
}

// Generate anagram hint
function generateHint(word) {
    const hints = {
        // French hints
        'chat': 'Animal domestique qui ronronne 🐱',
        'chien': 'Meilleur ami de l\'homme 🐕',
        'maison': 'Endroit où on habite 🏠',
        'ordinateur': 'Machine pour travailler et jouer 💻',
        'téléphone': 'Appareil pour appeler 📱',
        'philosophie': 'Science de la sagesse 🤔',
        
        // English hints
        'cat': 'Domestic animal that purrs 🐱',
        'dog': 'Man\'s best friend 🐕',
        'house': 'Place where you live 🏠',
        'computer': 'Machine for work and play 💻',
        'telephone': 'Device for calling 📱',
        'philosophy': 'Science of wisdom 🤔',
        
        // Spanish hints
        'gato': 'Animal doméstico que ronronea 🐱',
        'perro': 'Mejor amigo del hombre 🐕',
        'casa': 'Lugar donde vives 🏠',
        'ordenador': 'Máquina para trabajar y jugar 💻',
        'teléfono': 'Dispositivo para llamar 📱',
        'filosofía': 'Ciencia de la sabiduría 🤔'
    };
    
    return hints[word] || `Mot de ${word.length} lettres`;
}

// Start word hunt game
async function wordhuntCommand(sock, chatId, senderId, message, args) {
    try {
        const userLang = getUserLanguage(senderId);
        
        // Check if user already has a game
        if (wordHuntGames[senderId]) {
            const activeText = userLang === 'fr' ? 
                '🔤 Vous avez déjà un jeu en cours ! Répondez au mot ou tapez `.whquit`' :
                userLang === 'es' ? 
                '🔤 ¡Ya tienes un juego en curso! Responde la palabra o escribe `.whquit`' :
                '🔤 You already have a game in progress! Answer the word or type `.whquit`';
                
            await sock.sendMessage(chatId, {
                text: activeText,
                ...channelConfig
            });
            return;
        }

        // Parse difficulty
        const difficulty = args[0]?.toLowerCase() || 'normal';
        const validDifficulties = ['easy', 'normal', 'hard'];
        
        if (!validDifficulties.includes(difficulty)) {
            const helpText = userLang === 'fr' ? 
                `🔤 *CHASSE AUX MOTS* 🔤\n\n*Utilisation:*\n\`.wordhunt [difficulté]\`\n\n*Difficultés:*\n• \`easy\` - Mots courts (3-5 lettres)\n• \`normal\` - Mots moyens (6-10 lettres)\n• \`hard\` - Mots longs (10+ lettres)\n\n*Comment jouer:*\n• Un mot est mélangé\n• Vous devez trouver le mot original\n• Utilisez les indices si besoin\n\n*Exemple:* \`.wordhunt hard\`` :
                userLang === 'es' ? 
                `🔤 *CAZA DE PALABRAS* 🔤\n\n*Uso:*\n\`.wordhunt [dificultad]\`\n\n*Dificultades:*\n• \`easy\` - Palabras cortas (3-5 letras)\n• \`normal\` - Palabras medias (6-10 letras)\n• \`hard\` - Palabras largas (10+ letras)\n\n*Cómo jugar:*\n• Una palabra está mezclada\n• Debes encontrar la palabra original\n• Usa pistas si necesitas\n\n*Ejemplo:* \`.wordhunt hard\`` :
                `🔤 *WORD HUNT* 🔤\n\n*Usage:*\n\`.wordhunt [difficulty]\`\n\n*Difficulties:*\n• \`easy\` - Short words (3-5 letters)\n• \`normal\` - Medium words (6-10 letters)\n• \`hard\` - Long words (10+ letters)\n\n*How to play:*\n• A word is scrambled\n• You must find the original word\n• Use hints if needed\n\n*Example:* \`.wordhunt hard\``;

            await sock.sendMessage(chatId, {
                text: helpText,
                ...channelConfig
            });
            return;
        }

        // Get word list for user's language
        const langWordLists = wordLists[userLang] || wordLists['en'];
        const difficultyWords = langWordLists[difficulty] || langWordLists['normal'];
        
        // Select random word
        const originalWord = difficultyWords[Math.floor(Math.random() * difficultyWords.length)];
        const scrambledWord = scrambleWord(originalWord);
        
        // Create game
        const game = {
            originalWord: originalWord.toLowerCase(),
            scrambledWord: scrambledWord,
            difficulty: difficulty,
            attempts: 0,
            maxAttempts: 5,
            hintsUsed: 0,
            maxHints: 2,
            startTime: Date.now()
        };
        
        wordHuntGames[senderId] = game;

        const gameText = userLang === 'fr' ? 
            `🔤 *CHASSE AUX MOTS* - ${difficulty.toUpperCase()}\n\n🔀 **Mot mélangé:** \`${scrambledWord.toUpperCase()}\`\n🎯 **Lettres:** ${originalWord.length}\n\n💡 Trouvez le mot original !\n⚡ Tentatives: ${game.maxAttempts}\n🔍 Indices disponibles: ${game.maxHints}\n\n**Commandes:**\n• Tapez le mot directement\n• \`.whhint\` - Indice\n• \`.whquit\` - Abandonner` :
            userLang === 'es' ? 
            `🔤 *CAZA DE PALABRAS* - ${difficulty.toUpperCase()}\n\n🔀 **Palabra mezclada:** \`${scrambledWord.toUpperCase()}\`\n🎯 **Letras:** ${originalWord.length}\n\n💡 ¡Encuentra la palabra original!\n⚡ Intentos: ${game.maxAttempts}\n🔍 Pistas disponibles: ${game.maxHints}\n\n**Comandos:**\n• Escribe la palabra directamente\n• \`.whhint\` - Pista\n• \`.whquit\` - Abandonar` :
            `🔤 *WORD HUNT* - ${difficulty.toUpperCase()}\n\n🔀 **Scrambled word:** \`${scrambledWord.toUpperCase()}\`\n🎯 **Letters:** ${originalWord.length}\n\n💡 Find the original word!\n⚡ Attempts: ${game.maxAttempts}\n🔍 Hints available: ${game.maxHints}\n\n**Commands:**\n• Type the word directly\n• \`.whhint\` - Hint\n• \`.whquit\` - Quit`;

        await sock.sendMessage(chatId, {
            text: gameText,
            mentions: [senderId],
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in wordhunt command:', error);
        const errorText = getUserLanguage(senderId) === 'fr' ? 
            '❌ Erreur lors du démarrage de la chasse aux mots !' :
            '❌ Error starting word hunt!';
        await sock.sendMessage(chatId, {
            text: errorText,
            ...channelConfig
        });
    }
}

// Check word hunt answer
async function checkWordHuntAnswer(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = wordHuntGames[senderId];
        
        if (!game) return false;

        const userAnswer = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim().toLowerCase();
        
        // Skip if it's a command
        if (userAnswer.startsWith('.')) return false;
        
        game.attempts++;
        
        if (userAnswer === game.originalWord) {
            // Correct answer!
            const timeTaken = Math.round((Date.now() - game.startTime) / 1000);
            const timeBonus = Math.max(50 - timeTaken, 0);
            const attemptBonus = Math.max((game.maxAttempts - game.attempts) * 20, 0);
            const hintPenalty = game.hintsUsed * 10;
            const totalPoints = Math.max(100 + timeBonus + attemptBonus - hintPenalty, 10);
            
            const successText = userLang === 'fr' ? 
                `🔤 *BRAVO !* 🎉\n\n✅ **Mot trouvé:** ${game.originalWord.toUpperCase()}\n🔀 **Était mélangé:** ${game.scrambledWord.toUpperCase()}\n\n📊 **Score:**\n⏰ Temps: ${timeTaken}s (+${timeBonus} pts)\n🎯 Tentatives: ${game.attempts}/${game.maxAttempts} (+${attemptBonus} pts)\n💡 Indices: ${game.hintsUsed} (-${hintPenalty} pts)\n🏆 **Total: ${totalPoints} points**\n\n🔄 Nouveau jeu avec \`.wordhunt [difficulté]\`\n🎯 Essayez une difficulté plus élevée !` :
                userLang === 'es' ? 
                `🔤 *¡BRAVO!* 🎉\n\n✅ **Palabra encontrada:** ${game.originalWord.toUpperCase()}\n🔀 **Estaba mezclada:** ${game.scrambledWord.toUpperCase()}\n\n📊 **Puntuación:**\n⏰ Tiempo: ${timeTaken}s (+${timeBonus} pts)\n🎯 Intentos: ${game.attempts}/${game.maxAttempts} (+${attemptBonus} pts)\n💡 Pistas: ${game.hintsUsed} (-${hintPenalty} pts)\n🏆 **Total: ${totalPoints} puntos**\n\n🔄 Nuevo juego con \`.wordhunt [dificultad]\`\n🎯 ¡Prueba una dificultad más alta!` :
                `🔤 *BRAVO!* 🎉\n\n✅ **Word found:** ${game.originalWord.toUpperCase()}\n🔀 **Was scrambled:** ${game.scrambledWord.toUpperCase()}\n\n📊 **Score:**\n⏰ Time: ${timeTaken}s (+${timeBonus} pts)\n🎯 Attempts: ${game.attempts}/${game.maxAttempts} (+${attemptBonus} pts)\n💡 Hints: ${game.hintsUsed} (-${hintPenalty} pts)\n🏆 **Total: ${totalPoints} points**\n\n🔄 New game with \`.wordhunt [difficulty]\`\n🎯 Try a higher difficulty!`;

            await sock.sendMessage(chatId, {
                text: successText,
                mentions: [senderId],
                ...channelConfig
            });
            
            delete wordHuntGames[senderId];
            return true;
            
        } else {
            // Wrong answer
            if (game.attempts >= game.maxAttempts) {
                // Game over
                const gameOverText = userLang === 'fr' ? 
                    `🔤 *GAME OVER !* 😞\n\n❌ **Votre réponse:** ${userAnswer.toUpperCase()}\n✅ **Mot correct:** ${game.originalWord.toUpperCase()}\n🔀 **Était mélangé:** ${game.scrambledWord.toUpperCase()}\n\n🔄 Nouvelle partie avec \`.wordhunt\`\n💪 Essayez encore, vous pouvez y arriver !` :
                    userLang === 'es' ? 
                    `🔤 *¡GAME OVER!* 😞\n\n❌ **Tu respuesta:** ${userAnswer.toUpperCase()}\n✅ **Palabra correcta:** ${game.originalWord.toUpperCase()}\n🔀 **Estaba mezclada:** ${game.scrambledWord.toUpperCase()}\n\n🔄 Nueva partida con \`.wordhunt\`\n💪 ¡Inténtalo de nuevo, puedes hacerlo!` :
                    `🔤 *GAME OVER!* 😞\n\n❌ **Your answer:** ${userAnswer.toUpperCase()}\n✅ **Correct word:** ${game.originalWord.toUpperCase()}\n🔀 **Was scrambled:** ${game.scrambledWord.toUpperCase()}\n\n🔄 New game with \`.wordhunt\`\n💪 Try again, you can do it!`;

                await sock.sendMessage(chatId, {
                    text: gameOverText,
                    mentions: [senderId],
                    ...channelConfig
                });
                
                delete wordHuntGames[senderId];
                return true;
                
            } else {
                // Try again
                const remainingAttempts = game.maxAttempts - game.attempts;
                const tryAgainText = userLang === 'fr' ? 
                    `🔤 *INCORRECT !* ❌\n\n❌ **Votre réponse:** ${userAnswer.toUpperCase()}\n🔀 **Mot mélangé:** \`${game.scrambledWord.toUpperCase()}\`\n\n⚡ Tentatives restantes: ${remainingAttempts}\n💡 Réfléchissez aux lettres disponibles !\n\n🔍 Tapez \`.whhint\` pour un indice` :
                    userLang === 'es' ? 
                    `🔤 *¡INCORRECTO!* ❌\n\n❌ **Tu respuesta:** ${userAnswer.toUpperCase()}\n🔀 **Palabra mezclada:** \`${game.scrambledWord.toUpperCase()}\`\n\n⚡ Intentos restantes: ${remainingAttempts}\n💡 ¡Piensa en las letras disponibles!\n\n🔍 Escribe \`.whhint\` para una pista` :
                    `🔤 *INCORRECT!* ❌\n\n❌ **Your answer:** ${userAnswer.toUpperCase()}\n🔀 **Scrambled word:** \`${game.scrambledWord.toUpperCase()}\`\n\n⚡ Attempts remaining: ${remainingAttempts}\n💡 Think about the available letters!\n\n🔍 Type \`.whhint\` for a hint`;

                await sock.sendMessage(chatId, {
                    text: tryAgainText,
                    mentions: [senderId],
                    ...channelConfig
                });
                
                return true;
            }
        }
        
    } catch (error) {
        console.error('Error checking word hunt answer:', error);
        return false;
    }
}

// Word hunt hint command
async function whHintCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = wordHuntGames[senderId];
        
        if (!game) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucune chasse aux mots en cours !' :
                '❌ No word hunt in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        if (game.hintsUsed >= game.maxHints) {
            const noHintsText = userLang === 'fr' ? 
                '❌ Tous les indices ont été utilisés !' :
                '❌ All hints have been used!';
                
            await sock.sendMessage(chatId, {
                text: noHintsText,
                ...channelConfig
            });
            return;
        }

        game.hintsUsed++;
        
        let hint = '';
        if (game.hintsUsed === 1) {
            // First hint: show meaning/context
            hint = generateHint(game.originalWord);
        } else if (game.hintsUsed === 2) {
            // Second hint: show first and last letter
            const firstLetter = game.originalWord[0].toUpperCase();
            const lastLetter = game.originalWord[game.originalWord.length - 1].toUpperCase();
            hint = userLang === 'fr' ? 
                `Commence par "${firstLetter}" et finit par "${lastLetter}"` :
                userLang === 'es' ? 
                `Empieza con "${firstLetter}" y termina con "${lastLetter}"` :
                `Starts with "${firstLetter}" and ends with "${lastLetter}"`;
        }
        
        const hintText = userLang === 'fr' ? 
            `🔤 *INDICE ${game.hintsUsed}/${game.maxHints}* 💡\n\n🔍 ${hint}\n\n🔀 **Mot mélangé:** \`${game.scrambledWord.toUpperCase()}\`\n⚡ Tentatives restantes: ${game.maxAttempts - game.attempts}` :
            userLang === 'es' ? 
            `🔤 *PISTA ${game.hintsUsed}/${game.maxHints}* 💡\n\n🔍 ${hint}\n\n🔀 **Palabra mezclada:** \`${game.scrambledWord.toUpperCase()}\`\n⚡ Intentos restantes: ${game.maxAttempts - game.attempts}` :
            `🔤 *HINT ${game.hintsUsed}/${game.maxHints}* 💡\n\n🔍 ${hint}\n\n🔀 **Scrambled word:** \`${game.scrambledWord.toUpperCase()}\`\n⚡ Attempts remaining: ${game.maxAttempts - game.attempts}`;

        await sock.sendMessage(chatId, {
            text: hintText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in word hunt hint:', error);
    }
}

// Quit word hunt
async function whQuitCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        
        if (!wordHuntGames[senderId]) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucune chasse aux mots en cours !' :
                '❌ No word hunt in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        const game = wordHuntGames[senderId];
        delete wordHuntGames[senderId];
        
        const quitText = userLang === 'fr' ? 
            `🔤 Chasse aux mots abandonnée !\n\n✅ **Le mot était:** ${game.originalWord.toUpperCase()}\n🔀 **Était mélangé:** ${game.scrambledWord.toUpperCase()}\n\n🔄 Nouvelle partie avec \`.wordhunt\`` :
            userLang === 'es' ? 
            `🔤 ¡Caza de palabras abandonada!\n\n✅ **La palabra era:** ${game.originalWord.toUpperCase()}\n🔀 **Estaba mezclada:** ${game.scrambledWord.toUpperCase()}\n\n🔄 Nueva partida con \`.wordhunt\`` :
            `🔤 Word hunt quit!\n\n✅ **The word was:** ${game.originalWord.toUpperCase()}\n🔀 **Was scrambled:** ${game.scrambledWord.toUpperCase()}\n\n🔄 New game with \`.wordhunt\``;

        await sock.sendMessage(chatId, {
            text: quitText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in word hunt quit:', error);
    }
}

module.exports = {
    wordhuntCommand,
    checkWordHuntAnswer,
    whHintCommand,
    whQuitCommand
};