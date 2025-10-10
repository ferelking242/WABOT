const { channelConfig } = require('../../lib/channelConfig');
const { getUserLanguage } = require('../../lib/languages');

// Store active memory games
let memoryGames = {};

// Memory sequences and patterns
const memorySequences = {
    colors: ['🔴', '🟡', '🔵', '🟢', '🟣', '🟠'],
    numbers: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'],
    emojis: ['😀', '😎', '🥳', '😍', '🤔', '😂', '🫡', '🤩']
};

// Generate random sequence
function generateSequence(type, length) {
    const pool = memorySequences[type] || memorySequences.colors;
    const sequence = [];
    
    for (let i = 0; i < length; i++) {
        sequence.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    
    return sequence;
}

// Start memory game
async function memoryCommand(sock, chatId, senderId, message, args) {
    try {
        const userLang = getUserLanguage(senderId);
        
        // Check if user already has a game
        if (memoryGames[senderId]) {
            const activeText = userLang === 'fr' ? 
                '🧠 Vous avez déjà un jeu de mémoire en cours ! Répondez à la séquence ou tapez `.memquit`' :
                userLang === 'es' ? 
                '🧠 ¡Ya tienes un juego de memoria en curso! Responde la secuencia o escribe `.memquit`' :
                '🧠 You already have a memory game in progress! Answer the sequence or type `.memquit`';
                
            await sock.sendMessage(chatId, {
                text: activeText,
                ...channelConfig
            });
            return;
        }

        // Parse game options
        const difficulty = args[0]?.toLowerCase() || 'normal';
        const sequenceType = args[1]?.toLowerCase() || 'colors';
        
        // Validate options
        const validDifficulties = ['easy', 'normal', 'hard', 'expert'];
        const validTypes = ['colors', 'numbers', 'emojis'];
        
        if (!validDifficulties.includes(difficulty)) {
            const helpText = userLang === 'fr' ? 
                `🧠 *JEU DE MÉMOIRE* 🧠\n\n*Utilisation:*\n\`.memory [difficulté] [type]\`\n\n*Difficultés:*\n• \`easy\` - 3 éléments\n• \`normal\` - 4 éléments\n• \`hard\` - 5 éléments\n• \`expert\` - 6 éléments\n\n*Types:*\n• \`colors\` - Couleurs 🔴🟡🔵\n• \`numbers\` - Chiffres 1️⃣2️⃣3️⃣\n• \`emojis\` - Emojis 😀😎🥳\n\n*Exemple:* \`.memory hard emojis\`` :
                userLang === 'es' ? 
                `🧠 *JUEGO DE MEMORIA* 🧠\n\n*Uso:*\n\`.memory [dificultad] [tipo]\`\n\n*Dificultades:*\n• \`easy\` - 3 elementos\n• \`normal\` - 4 elementos\n• \`hard\` - 5 elementos\n• \`expert\` - 6 elementos\n\n*Tipos:*\n• \`colors\` - Colores 🔴🟡🔵\n• \`numbers\` - Números 1️⃣2️⃣3️⃣\n• \`emojis\` - Emojis 😀😎🥳\n\n*Ejemplo:* \`.memory hard emojis\`` :
                `🧠 *MEMORY GAME* 🧠\n\n*Usage:*\n\`.memory [difficulty] [type]\`\n\n*Difficulties:*\n• \`easy\` - 3 items\n• \`normal\` - 4 items\n• \`hard\` - 5 items\n• \`expert\` - 6 items\n\n*Types:*\n• \`colors\` - Colors 🔴🟡🔵\n• \`numbers\` - Numbers 1️⃣2️⃣3️⃣\n• \`emojis\` - Emojis 😀😎🥳\n\n*Example:* \`.memory hard emojis\``;

            await sock.sendMessage(chatId, {
                text: helpText,
                ...channelConfig
            });
            return;
        }

        if (!validTypes.includes(sequenceType)) {
            sequenceType = 'colors'; // Default fallback
        }

        // Set sequence length based on difficulty
        const sequenceLengths = {
            easy: 3,
            normal: 4,
            hard: 5,
            expert: 6
        };
        
        const sequenceLength = sequenceLengths[difficulty];
        const sequence = generateSequence(sequenceType, sequenceLength);
        
        // Create game
        const game = {
            sequence: sequence,
            type: sequenceType,
            difficulty: difficulty,
            shown: false,
            attempts: 0,
            maxAttempts: 3,
            startTime: Date.now()
        };
        
        memoryGames[senderId] = game;

        // Show sequence first
        const sequenceText = userLang === 'fr' ? 
            `🧠 *JEU DE MÉMOIRE* - ${difficulty.toUpperCase()}\n\n📝 *Mémorisez cette séquence:*\n\n${sequence.join(' ')}\n\n⏰ Vous avez 5 secondes pour mémoriser...\n\n💡 Répondez ensuite avec les mêmes éléments dans le même ordre (séparés par des espaces)` :
            userLang === 'es' ? 
            `🧠 *JUEGO DE MEMORIA* - ${difficulty.toUpperCase()}\n\n📝 *Memoriza esta secuencia:*\n\n${sequence.join(' ')}\n\n⏰ Tienes 5 segundos para memorizar...\n\n💡 Luego responde con los mismos elementos en el mismo orden (separados por espacios)` :
            `🧠 *MEMORY GAME* - ${difficulty.toUpperCase()}\n\n📝 *Memorize this sequence:*\n\n${sequence.join(' ')}\n\n⏰ You have 5 seconds to memorize...\n\n💡 Then reply with the same items in the same order (separated by spaces)`;

        await sock.sendMessage(chatId, {
            text: sequenceText,
            mentions: [senderId],
            ...channelConfig
        });

        // After 5 seconds, show prompt
        setTimeout(async () => {
            if (memoryGames[senderId] && !memoryGames[senderId].shown) {
                memoryGames[senderId].shown = true;
                
                const promptText = userLang === 'fr' ? 
                    `🧠 *TEMPS ÉCOULÉ !*\n\n🤔 Maintenant, répétez la séquence !\n\n💡 Tapez les éléments séparés par des espaces\n📝 Exemple: 🔴 🟡 🔵\n\n⚡ Tentatives restantes: ${game.maxAttempts}` :
                    userLang === 'es' ? 
                    `🧠 *¡TIEMPO TERMINADO!*\n\n🤔 ¡Ahora repite la secuencia!\n\n💡 Escribe los elementos separados por espacios\n📝 Ejemplo: 🔴 🟡 🔵\n\n⚡ Intentos restantes: ${game.maxAttempts}` :
                    `🧠 *TIME'S UP!*\n\n🤔 Now repeat the sequence!\n\n💡 Type the items separated by spaces\n📝 Example: 🔴 🟡 🔵\n\n⚡ Attempts remaining: ${game.maxAttempts}`;

                await sock.sendMessage(chatId, {
                    text: promptText,
                    mentions: [senderId],
                    ...channelConfig
                });
            }
        }, 5000);

    } catch (error) {
        console.error('Error in memory command:', error);
        const errorText = getUserLanguage(senderId) === 'fr' ? 
            '❌ Erreur lors du démarrage du jeu de mémoire !' :
            '❌ Error starting memory game!';
        await sock.sendMessage(chatId, {
            text: errorText,
            ...channelConfig
        });
    }
}

// Check memory answer
async function checkMemoryAnswer(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = memoryGames[senderId];
        
        if (!game || !game.shown) return false;

        const userResponse = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
        const userSequence = userResponse.split(/\s+/);
        
        game.attempts++;
        
        // Check if sequence matches
        const isCorrect = userSequence.length === game.sequence.length && 
                         userSequence.every((item, index) => item === game.sequence[index]);

        if (isCorrect) {
            // Success!
            const timeTaken = Math.round((Date.now() - game.startTime) / 1000);
            const points = Math.max(100 - (timeTaken * 2) - (game.attempts * 10), 10);
            
            const successText = userLang === 'fr' ? 
                `🧠 *PARFAIT !* 🎉\n\n✅ Séquence correcte: ${game.sequence.join(' ')}\n⏰ Temps: ${timeTaken} secondes\n🔥 Tentatives: ${game.attempts}/${game.maxAttempts}\n🏆 Points: ${points}\n\n💡 Nouveau jeu avec \`.memory [difficulté] [type]\`\n🎯 Essayez une difficulté plus élevée !` :
                userLang === 'es' ? 
                `🧠 *¡PERFECTO!* 🎉\n\n✅ Secuencia correcta: ${game.sequence.join(' ')}\n⏰ Tiempo: ${timeTaken} segundos\n🔥 Intentos: ${game.attempts}/${game.maxAttempts}\n🏆 Puntos: ${points}\n\n💡 Nuevo juego con \`.memory [dificultad] [tipo]\`\n🎯 ¡Prueba una dificultad más alta!` :
                `🧠 *PERFECT!* 🎉\n\n✅ Correct sequence: ${game.sequence.join(' ')}\n⏰ Time: ${timeTaken} seconds\n🔥 Attempts: ${game.attempts}/${game.maxAttempts}\n🏆 Points: ${points}\n\n💡 New game with \`.memory [difficulty] [type]\`\n🎯 Try a higher difficulty!`;

            await sock.sendMessage(chatId, {
                text: successText,
                mentions: [senderId],
                ...channelConfig
            });
            
            delete memoryGames[senderId];
            return true;
            
        } else {
            // Wrong answer
            if (game.attempts >= game.maxAttempts) {
                // Game over
                const gameOverText = userLang === 'fr' ? 
                    `🧠 *GAME OVER !* 😞\n\n❌ Votre réponse: ${userSequence.join(' ')}\n✅ Séquence correcte: ${game.sequence.join(' ')}\n\n🔄 Nouvelle partie avec \`.memory\`\n💪 Essayez encore, vous pouvez y arriver !` :
                    userLang === 'es' ? 
                    `🧠 *¡GAME OVER!* 😞\n\n❌ Tu respuesta: ${userSequence.join(' ')}\n✅ Secuencia correcta: ${game.sequence.join(' ')}\n\n🔄 Nueva partida con \`.memory\`\n💪 ¡Inténtalo de nuevo, puedes hacerlo!` :
                    `🧠 *GAME OVER!* 😞\n\n❌ Your answer: ${userSequence.join(' ')}\n✅ Correct sequence: ${game.sequence.join(' ')}\n\n🔄 New game with \`.memory\`\n💪 Try again, you can do it!`;

                await sock.sendMessage(chatId, {
                    text: gameOverText,
                    mentions: [senderId],
                    ...channelConfig
                });
                
                delete memoryGames[senderId];
                return true;
                
            } else {
                // Try again
                const remainingAttempts = game.maxAttempts - game.attempts;
                const tryAgainText = userLang === 'fr' ? 
                    `🧠 *INCORRECT !* ❌\n\n❌ Votre réponse: ${userSequence.join(' ')}\n\n⚡ Tentatives restantes: ${remainingAttempts}\n💡 Réfléchissez bien et essayez encore !\n\n🔄 Tapez `.memhint` pour un indice` :
                    userLang === 'es' ? 
                    `🧠 *¡INCORRECTO!* ❌\n\n❌ Tu respuesta: ${userSequence.join(' ')}\n\n⚡ Intentos restantes: ${remainingAttempts}\n💡 ¡Piensa bien e inténtalo de nuevo!\n\n🔄 Escribe \`.memhint\` para una pista` :
                    `🧠 *INCORRECT!* ❌\n\n❌ Your answer: ${userSequence.join(' ')}\n\n⚡ Attempts remaining: ${remainingAttempts}\n💡 Think carefully and try again!\n\n🔄 Type \`.memhint\` for a hint`;

                await sock.sendMessage(chatId, {
                    text: tryAgainText,
                    mentions: [senderId],
                    ...channelConfig
                });
                
                return true;
            }
        }
        
    } catch (error) {
        console.error('Error checking memory answer:', error);
        return false;
    }
}

// Memory hint command
async function memHintCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = memoryGames[senderId];
        
        if (!game || !game.shown) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucun jeu de mémoire en cours !' :
                '❌ No memory game in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        // Give hint (show first element)
        const hint = game.sequence[0];
        const hintText = userLang === 'fr' ? 
            `🧠 *INDICE* 💡\n\n🔍 Le premier élément est: ${hint}\n\n💪 Continuez avec le reste de la séquence !` :
            userLang === 'es' ? 
            `🧠 *PISTA* 💡\n\n🔍 El primer elemento es: ${hint}\n\n💪 ¡Continúa con el resto de la secuencia!` :
            `🧠 *HINT* 💡\n\n🔍 The first item is: ${hint}\n\n💪 Continue with the rest of the sequence!`;

        await sock.sendMessage(chatId, {
            text: hintText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in memory hint:', error);
    }
}

// Quit memory game
async function memQuitCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        
        if (!memoryGames[senderId]) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucun jeu de mémoire en cours !' :
                '❌ No memory game in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        const game = memoryGames[senderId];
        delete memoryGames[senderId];
        
        const quitText = userLang === 'fr' ? 
            `🧠 Jeu de mémoire abandonné !\n\n📝 La séquence était: ${game.sequence.join(' ')}\n\n🔄 Nouvelle partie avec \`.memory\`` :
            userLang === 'es' ? 
            `🧠 ¡Juego de memoria abandonado!\n\n📝 La secuencia era: ${game.sequence.join(' ')}\n\n🔄 Nueva partida con \`.memory\`` :
            `🧠 Memory game quit!\n\n📝 The sequence was: ${game.sequence.join(' ')}\n\n🔄 New game with \`.memory\``;

        await sock.sendMessage(chatId, {
            text: quitText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in memory quit:', error);
    }
}

module.exports = {
    memoryCommand,
    checkMemoryAnswer,
    memHintCommand,
    memQuitCommand
};