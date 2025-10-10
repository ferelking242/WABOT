const { channelConfig } = require('../../lib/channelConfig');
const { getUserLanguage } = require('../../lib/languages');

// Store active math quiz games
let mathQuizGames = {};

// Generate math problems by difficulty
function generateMathProblem(difficulty) {
    let problem = {};
    
    switch (difficulty) {
        case 'easy':
            // Addition and subtraction with small numbers
            const operation1 = Math.random() < 0.5 ? '+' : '-';
            if (operation1 === '+') {
                const a = Math.floor(Math.random() * 50) + 1;
                const b = Math.floor(Math.random() * 50) + 1;
                problem = {
                    question: `${a} + ${b}`,
                    answer: a + b,
                    operation: 'addition'
                };
            } else {
                const a = Math.floor(Math.random() * 50) + 20;
                const b = Math.floor(Math.random() * 20) + 1;
                problem = {
                    question: `${a} - ${b}`,
                    answer: a - b,
                    operation: 'subtraction'
                };
            }
            break;
            
        case 'normal':
            // All basic operations
            const operations = ['+', '-', '*', '/'];
            const op = operations[Math.floor(Math.random() * operations.length)];
            
            switch (op) {
                case '+':
                    const a1 = Math.floor(Math.random() * 200) + 10;
                    const b1 = Math.floor(Math.random() * 200) + 10;
                    problem = {
                        question: `${a1} + ${b1}`,
                        answer: a1 + b1,
                        operation: 'addition'
                    };
                    break;
                case '-':
                    const a2 = Math.floor(Math.random() * 200) + 50;
                    const b2 = Math.floor(Math.random() * 50) + 1;
                    problem = {
                        question: `${a2} - ${b2}`,
                        answer: a2 - b2,
                        operation: 'subtraction'
                    };
                    break;
                case '*':
                    const a3 = Math.floor(Math.random() * 25) + 2;
                    const b3 = Math.floor(Math.random() * 25) + 2;
                    problem = {
                        question: `${a3} × ${b3}`,
                        answer: a3 * b3,
                        operation: 'multiplication'
                    };
                    break;
                case '/':
                    const divisor = Math.floor(Math.random() * 12) + 2;
                    const quotient = Math.floor(Math.random() * 20) + 2;
                    const dividend = divisor * quotient;
                    problem = {
                        question: `${dividend} ÷ ${divisor}`,
                        answer: quotient,
                        operation: 'division'
                    };
                    break;
            }
            break;
            
        case 'hard':
            // Complex operations with larger numbers, squares, etc.
            const hardOps = ['square', 'cube', 'percentage', 'complex'];
            const hardOp = hardOps[Math.floor(Math.random() * hardOps.length)];
            
            switch (hardOp) {
                case 'square':
                    const base = Math.floor(Math.random() * 20) + 5;
                    problem = {
                        question: `${base}²`,
                        answer: base * base,
                        operation: 'square'
                    };
                    break;
                case 'cube':
                    const base2 = Math.floor(Math.random() * 10) + 2;
                    problem = {
                        question: `${base2}³`,
                        answer: base2 * base2 * base2,
                        operation: 'cube'
                    };
                    break;
                case 'percentage':
                    const percentage = [10, 15, 20, 25, 30, 40, 50, 60, 75, 80][Math.floor(Math.random() * 10)];
                    const number = Math.floor(Math.random() * 500) + 100;
                    problem = {
                        question: `${percentage}% de ${number}`,
                        answer: Math.round((percentage / 100) * number),
                        operation: 'percentage'
                    };
                    break;
                case 'complex':
                    const a4 = Math.floor(Math.random() * 50) + 10;
                    const b4 = Math.floor(Math.random() * 20) + 5;
                    const c4 = Math.floor(Math.random() * 10) + 2;
                    problem = {
                        question: `(${a4} + ${b4}) × ${c4}`,
                        answer: (a4 + b4) * c4,
                        operation: 'complex'
                    };
                    break;
            }
            break;
            
        case 'expert':
            // Very complex math problems
            const expertOps = ['factorial', 'power', 'algebra', 'sequence'];
            const expertOp = expertOps[Math.floor(Math.random() * expertOps.length)];
            
            switch (expertOp) {
                case 'factorial':
                    const fact = Math.floor(Math.random() * 6) + 4; // 4! to 9!
                    let factResult = 1;
                    for (let i = 1; i <= fact; i++) {
                        factResult *= i;
                    }
                    problem = {
                        question: `${fact}!`,
                        answer: factResult,
                        operation: 'factorial'
                    };
                    break;
                case 'power':
                    const base3 = Math.floor(Math.random() * 8) + 2;
                    const exp = Math.floor(Math.random() * 4) + 3;
                    problem = {
                        question: `${base3}^${exp}`,
                        answer: Math.pow(base3, exp),
                        operation: 'power'
                    };
                    break;
                case 'algebra':
                    // Simple equation: x + a = b, find x
                    const a5 = Math.floor(Math.random() * 30) + 10;
                    const x = Math.floor(Math.random() * 50) + 5;
                    const b5 = a5 + x;
                    problem = {
                        question: `x + ${a5} = ${b5}, x = ?`,
                        answer: x,
                        operation: 'algebra'
                    };
                    break;
                case 'sequence':
                    // Arithmetic sequence
                    const start = Math.floor(Math.random() * 10) + 1;
                    const diff = Math.floor(Math.random() * 5) + 2;
                    const seq = [start, start + diff, start + 2*diff, start + 3*diff];
                    problem = {
                        question: `${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, ?`,
                        answer: start + 4*diff,
                        operation: 'sequence'
                    };
                    break;
            }
            break;
    }
    
    return problem;
}

// Start math quiz
async function mathquizCommand(sock, chatId, senderId, message, args) {
    try {
        const userLang = getUserLanguage(senderId);
        
        // Check if user already has a game
        if (mathQuizGames[senderId]) {
            const activeText = userLang === 'fr' ? 
                '🧮 Vous avez déjà un quiz en cours ! Répondez au problème ou tapez `.mquit`' :
                userLang === 'es' ? 
                '🧮 ¡Ya tienes un quiz en curso! Responde el problema o escribe `.mquit`' :
                '🧮 You already have a quiz in progress! Answer the problem or type `.mquit`';
                
            await sock.sendMessage(chatId, {
                text: activeText,
                ...channelConfig
            });
            return;
        }

        // Parse options
        const difficulty = args[0]?.toLowerCase() || 'normal';
        const questionsCount = parseInt(args[1]) || 5;
        
        const validDifficulties = ['easy', 'normal', 'hard', 'expert'];
        
        if (!validDifficulties.includes(difficulty)) {
            const helpText = userLang === 'fr' ? 
                `🧮 *QUIZ MATHÉMATIQUES* 🧮\n\n*Utilisation:*\n\`.mathquiz [difficulté] [nombre]\`\n\n*Difficultés:*\n• \`easy\` - Addition/soustraction simple\n• \`normal\` - Opérations de base (+, -, ×, ÷)\n• \`hard\` - Carrés, pourcentages, expressions\n• \`expert\` - Factorielles, puissances, algèbre\n\n*Exemples:*\n• \`.mathquiz easy 3\` - 3 questions faciles\n• \`.mathquiz hard 10\` - 10 questions difficiles\n\n*Par défaut:* normal, 5 questions` :
                userLang === 'es' ? 
                `🧮 *QUIZ MATEMÁTICAS* 🧮\n\n*Uso:*\n\`.mathquiz [dificultad] [número]\`\n\n*Dificultades:*\n• \`easy\` - Suma/resta simple\n• \`normal\` - Operaciones básicas (+, -, ×, ÷)\n• \`hard\` - Cuadrados, porcentajes, expresiones\n• \`expert\` - Factoriales, potencias, álgebra\n\n*Ejemplos:*\n• \`.mathquiz easy 3\` - 3 preguntas fáciles\n• \`.mathquiz hard 10\` - 10 preguntas difíciles\n\n*Por defecto:* normal, 5 preguntas` :
                `🧮 *MATH QUIZ* 🧮\n\n*Usage:*\n\`.mathquiz [difficulty] [number]\`\n\n*Difficulties:*\n• \`easy\` - Simple addition/subtraction\n• \`normal\` - Basic operations (+, -, ×, ÷)\n• \`hard\` - Squares, percentages, expressions\n• \`expert\` - Factorials, powers, algebra\n\n*Examples:*\n• \`.mathquiz easy 3\` - 3 easy questions\n• \`.mathquiz hard 10\` - 10 hard questions\n\n*Default:* normal, 5 questions`;

            await sock.sendMessage(chatId, {
                text: helpText,
                ...channelConfig
            });
            return;
        }

        // Validate questions count
        if (questionsCount < 1 || questionsCount > 20) {
            const invalidText = userLang === 'fr' ? 
                '❌ Nombre de questions invalide ! (1-20)' :
                userLang === 'es' ? 
                '❌ ¡Número de preguntas inválido! (1-20)' :
                '❌ Invalid number of questions! (1-20)';
                
            await sock.sendMessage(chatId, {
                text: invalidText,
                ...channelConfig
            });
            return;
        }

        // Generate first problem
        const firstProblem = generateMathProblem(difficulty);
        
        // Create game
        const game = {
            difficulty: difficulty,
            totalQuestions: questionsCount,
            currentQuestion: 1,
            score: 0,
            currentProblem: firstProblem,
            startTime: Date.now(),
            correctAnswers: [],
            wrongAnswers: []
        };
        
        mathQuizGames[senderId] = game;

        const gameStartText = userLang === 'fr' ? 
            `🧮 *QUIZ MATHÉMATIQUES* - ${difficulty.toUpperCase()}\n\n📊 *Question ${game.currentQuestion}/${game.totalQuestions}*\n\n🔢 *Problème:*\n\`${firstProblem.question} = ?\`\n\n💡 Tapez juste le nombre en réponse\n⏰ Pas de limite de temps\n🎯 Score actuel: 0/${game.totalQuestions}\n\n*Commandes:*\n• Tapez la réponse directement\n• \`.mquit\` - Abandonner` :
            userLang === 'es' ? 
            `🧮 *QUIZ MATEMÁTICAS* - ${difficulty.toUpperCase()}\n\n📊 *Pregunta ${game.currentQuestion}/${game.totalQuestions}*\n\n🔢 *Problema:*\n\`${firstProblem.question} = ?\`\n\n💡 Escribe solo el número como respuesta\n⏰ Sin límite de tiempo\n🎯 Puntuación actual: 0/${game.totalQuestions}\n\n*Comandos:*\n• Escribe la respuesta directamente\n• \`.mquit\` - Abandonar` :
            `🧮 *MATH QUIZ* - ${difficulty.toUpperCase()}\n\n📊 *Question ${game.currentQuestion}/${game.totalQuestions}*\n\n🔢 *Problem:*\n\`${firstProblem.question} = ?\`\n\n💡 Type just the number as answer\n⏰ No time limit\n🎯 Current score: 0/${game.totalQuestions}\n\n*Commands:*\n• Type the answer directly\n• \`.mquit\` - Quit`;

        await sock.sendMessage(chatId, {
            text: gameStartText,
            mentions: [senderId],
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in mathquiz command:', error);
        const errorText = getUserLanguage(senderId) === 'fr' ? 
            '❌ Erreur lors du démarrage du quiz mathématiques !' :
            '❌ Error starting math quiz!';
        await sock.sendMessage(chatId, {
            text: errorText,
            ...channelConfig
        });
    }
}

// Check math quiz answer
async function checkMathQuizAnswer(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = mathQuizGames[senderId];
        
        if (!game) return false;

        const userAnswer = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
        
        // Skip if it's a command
        if (userAnswer.startsWith('.')) return false;
        
        const numericAnswer = parseInt(userAnswer);
        if (isNaN(numericAnswer)) return false; // Not a number
        
        const isCorrect = numericAnswer === game.currentProblem.answer;
        
        if (isCorrect) {
            game.score++;
            game.correctAnswers.push({
                question: game.currentProblem.question,
                answer: game.currentProblem.answer,
                userAnswer: numericAnswer
            });
        } else {
            game.wrongAnswers.push({
                question: game.currentProblem.question,
                answer: game.currentProblem.answer,
                userAnswer: numericAnswer
            });
        }
        
        game.currentQuestion++;
        
        if (game.currentQuestion > game.totalQuestions) {
            // Quiz finished!
            const timeTaken = Math.round((Date.now() - game.startTime) / 1000);
            const percentage = Math.round((game.score / game.totalQuestions) * 100);
            
            let grade = '';
            if (percentage >= 90) grade = '🏆 Excellent !';
            else if (percentage >= 80) grade = '🥇 Très bien !';
            else if (percentage >= 70) grade = '🥈 Bien !';
            else if (percentage >= 60) grade = '🥉 Correct !';
            else grade = '📚 À améliorer !';
            
            const finishText = userLang === 'fr' ? 
                `🧮 *QUIZ TERMINÉ !* 🎉\n\n📊 **Résultats:**\n✅ Bonnes réponses: ${game.score}/${game.totalQuestions}\n❌ Erreurs: ${game.totalQuestions - game.score}\n📈 Pourcentage: ${percentage}%\n⏰ Temps total: ${timeTaken} secondes\n\n🏅 **Évaluation:** ${grade}\n\n💡 Nouveau quiz avec \`.mathquiz [difficulté] [nombre]\`\n🎯 Essayez une difficulté plus élevée !` :
                userLang === 'es' ? 
                `🧮 *¡QUIZ TERMINADO!* 🎉\n\n📊 **Resultados:**\n✅ Respuestas correctas: ${game.score}/${game.totalQuestions}\n❌ Errores: ${game.totalQuestions - game.score}\n📈 Porcentaje: ${percentage}%\n⏰ Tiempo total: ${timeTaken} segundos\n\n🏅 **Evaluación:** ${grade}\n\n💡 Nuevo quiz con \`.mathquiz [dificultad] [número]\`\n🎯 ¡Prueba una dificultad más alta!` :
                `🧮 *QUIZ FINISHED!* 🎉\n\n📊 **Results:**\n✅ Correct answers: ${game.score}/${game.totalQuestions}\n❌ Errors: ${game.totalQuestions - game.score}\n📈 Percentage: ${percentage}%\n⏰ Total time: ${timeTaken} seconds\n\n🏅 **Grade:** ${grade}\n\n💡 New quiz with \`.mathquiz [difficulty] [number]\`\n🎯 Try a higher difficulty!`;

            await sock.sendMessage(chatId, {
                text: finishText,
                mentions: [senderId],
                ...channelConfig
            });
            
            delete mathQuizGames[senderId];
            return true;
            
        } else {
            // Next question
            const nextProblem = generateMathProblem(game.difficulty);
            game.currentProblem = nextProblem;
            
            const resultEmoji = isCorrect ? '✅' : '❌';
            const nextText = userLang === 'fr' ? 
                `🧮 ${resultEmoji} **${isCorrect ? 'Correct' : `Incorrect (réponse: ${game.wrongAnswers[game.wrongAnswers.length - 1]?.answer || 'N/A'})`}**\n\n📊 **Question ${game.currentQuestion}/${game.totalQuestions}**\n\n🔢 **Problème:**\n\`${nextProblem.question} = ?\`\n\n🎯 Score: ${game.score}/${game.totalQuestions}` :
                userLang === 'es' ? 
                `🧮 ${resultEmoji} **${isCorrect ? 'Correcto' : `Incorrecto (respuesta: ${game.wrongAnswers[game.wrongAnswers.length - 1]?.answer || 'N/A'})`}**\n\n📊 **Pregunta ${game.currentQuestion}/${game.totalQuestions}**\n\n🔢 **Problema:**\n\`${nextProblem.question} = ?\`\n\n🎯 Puntuación: ${game.score}/${game.totalQuestions}` :
                `🧮 ${resultEmoji} **${isCorrect ? 'Correct' : `Incorrect (answer: ${game.wrongAnswers[game.wrongAnswers.length - 1]?.answer || 'N/A'})`}**\n\n📊 **Question ${game.currentQuestion}/${game.totalQuestions}**\n\n🔢 **Problem:**\n\`${nextProblem.question} = ?\`\n\n🎯 Score: ${game.score}/${game.totalQuestions}`;

            await sock.sendMessage(chatId, {
                text: nextText,
                ...channelConfig
            });
            
            return true;
        }
        
    } catch (error) {
        console.error('Error checking math quiz answer:', error);
        return false;
    }
}

// Quit math quiz
async function mquitCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        
        if (!mathQuizGames[senderId]) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucun quiz mathématiques en cours !' :
                '❌ No math quiz in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        const game = mathQuizGames[senderId];
        const percentage = game.totalQuestions > 0 ? Math.round((game.score / (game.currentQuestion - 1)) * 100) : 0;
        
        delete mathQuizGames[senderId];
        
        const quitText = userLang === 'fr' ? 
            `🧮 Quiz mathématiques abandonné !\n\n📊 **Progression:** ${game.currentQuestion - 1}/${game.totalQuestions} questions\n✅ Score partiel: ${game.score}/${game.currentQuestion - 1} (${percentage}%)\n\n🔄 Nouveau quiz avec \`.mathquiz\`` :
            userLang === 'es' ? 
            `🧮 ¡Quiz matemáticas abandonado!\n\n📊 **Progreso:** ${game.currentQuestion - 1}/${game.totalQuestions} preguntas\n✅ Puntuación parcial: ${game.score}/${game.currentQuestion - 1} (${percentage}%)\n\n🔄 Nuevo quiz con \`.mathquiz\`` :
            `🧮 Math quiz quit!\n\n📊 **Progress:** ${game.currentQuestion - 1}/${game.totalQuestions} questions\n✅ Partial score: ${game.score}/${game.currentQuestion - 1} (${percentage}%)\n\n🔄 New quiz with \`.mathquiz\``;

        await sock.sendMessage(chatId, {
            text: quitText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in math quiz quit:', error);
    }
}

module.exports = {
    mathquizCommand,
    checkMathQuizAnswer,
    mquitCommand
};