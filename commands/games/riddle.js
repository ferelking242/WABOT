const { getText, getUserLanguage } = require('../../lib/languages');

// Riddle database with multilingual support
const riddles = {
    fr: [
        {
            question: "🤔 **Énigme:** Je suis plus lourd que ce que je porte, et plus je travaille, plus je deviens petit. Que suis-je ?",
            answer: "crayon",
            alternatives: ["un crayon", "le crayon"],
            hint: "💡 **Indice:** Tu l'utilises pour écrire et dessiner."
        },
        {
            question: "🤔 **Énigme:** Plus on en prend, plus on en laisse. Qu'est-ce que c'est ?",
            answer: "pas",
            alternatives: ["des pas", "les pas", "empreintes"],
            hint: "💡 **Indice:** Tu en fais quand tu marches."
        },
        {
            question: "🤔 **Énigme:** J'ai des dents mais je ne peux pas mordre. Que suis-je ?",
            answer: "peigne",
            alternatives: ["un peigne", "le peigne"],
            hint: "💡 **Indice:** On m'utilise pour se coiffer."
        },
        {
            question: "🤔 **Énigme:** Je peux voler sans ailes, pleurer sans yeux. Partout je vais, la mort me suit. Que suis-je ?",
            answer: "nuage",
            alternatives: ["un nuage", "le nuage", "nuages"],
            hint: "💡 **Indice:** Je suis dans le ciel et j'apporte la pluie."
        },
        {
            question: "🤔 **Énigme:** Plus on me donne, plus j'ai faim. Que suis-je ?",
            answer: "feu",
            alternatives: ["le feu", "un feu"],
            hint: "💡 **Indice:** Je brûle et j'ai besoin de bois pour grandir."
        }
    ],
    en: [
        {
            question: "🤔 **Riddle:** I am heavier than what I carry, and the more I work, the smaller I become. What am I?",
            answer: "pencil",
            alternatives: ["a pencil", "the pencil"],
            hint: "💡 **Hint:** You use me to write and draw."
        },
        {
            question: "🤔 **Riddle:** The more you take, the more you leave behind. What are they?",
            answer: "footsteps",
            alternatives: ["footstep", "steps", "footprints"],
            hint: "💡 **Hint:** You make them when you walk."
        },
        {
            question: "🤔 **Riddle:** I have teeth but cannot bite. What am I?",
            answer: "comb",
            alternatives: ["a comb", "the comb"],
            hint: "💡 **Hint:** People use me to style their hair."
        },
        {
            question: "🤔 **Riddle:** I can fly without wings, cry without eyes. Wherever I go, death follows. What am I?",
            answer: "cloud",
            alternatives: ["a cloud", "the cloud", "clouds"],
            hint: "💡 **Hint:** I'm in the sky and bring rain."
        },
        {
            question: "🤔 **Riddle:** The more you feed me, the hungrier I become. What am I?",
            answer: "fire",
            alternatives: ["a fire", "the fire"],
            hint: "💡 **Hint:** I burn and need wood to grow."
        }
    ],
    es: [
        {
            question: "🤔 **Adivinanza:** Soy más pesado que lo que cargo, y cuanto más trabajo, más pequeño me vuelvo. ¿Qué soy?",
            answer: "lápiz",
            alternatives: ["un lápiz", "el lápiz"],
            hint: "💡 **Pista:** Me usas para escribir y dibujar."
        },
        {
            question: "🤔 **Adivinanza:** Cuanto más tomas, más dejas atrás. ¿Qué son?",
            answer: "pasos",
            alternatives: ["paso", "huellas", "pisadas"],
            hint: "💡 **Pista:** Los haces cuando caminas."
        },
        {
            question: "🤔 **Adivinanza:** Tengo dientes pero no puedo morder. ¿Qué soy?",
            answer: "peine",
            alternatives: ["un peine", "el peine"],
            hint: "💡 **Pista:** La gente me usa para peinarse."
        },
        {
            question: "🤔 **Adivinanza:** Puedo volar sin alas, llorar sin ojos. Donde voy, la muerte me sigue. ¿Qué soy?",
            answer: "nube",
            alternatives: ["una nube", "la nube", "nubes"],
            hint: "💡 **Pista:** Estoy en el cielo y traigo lluvia."
        },
        {
            question: "🤔 **Adivinanza:** Cuanto más me alimentas, más hambre tengo. ¿Qué soy?",
            answer: "fuego",
            alternatives: ["un fuego", "el fuego"],
            hint: "💡 **Pista:** Ardo y necesito madera para crecer."
        }
    ]
};

let activeRiddles = {};

async function riddleCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // If user wants to give up
        if (args[0] && args[0].toLowerCase() === 'giveup') {
            if (activeRiddles[chatId]) {
                const answer = activeRiddles[chatId].answer;
                delete activeRiddles[chatId];
                
                const giveUpMsg = userLang === 'fr' ? `😔 **Abandonné!**\n\n✅ **Réponse:** ${answer}` :
                                 userLang === 'es' ? `😔 **¡Te rendiste!**\n\n✅ **Respuesta:** ${answer}` :
                                 `😔 **Gave up!**\n\n✅ **Answer:** ${answer}`;
                
                await sock.sendMessage(chatId, { text: giveUpMsg }, { quoted: message });
            } else {
                const noRiddleMsg = userLang === 'fr' ? '❌ Aucune énigme active!' :
                                   userLang === 'es' ? '❌ ¡No hay adivinanza activa!' :
                                   '❌ No active riddle!';
                await sock.sendMessage(chatId, { text: noRiddleMsg }, { quoted: message });
            }
            return;
        }
        
        // If user wants a hint
        if (args[0] && args[0].toLowerCase() === 'hint') {
            if (activeRiddles[chatId]) {
                await sock.sendMessage(chatId, { text: activeRiddles[chatId].hint }, { quoted: message });
            } else {
                const noRiddleMsg = userLang === 'fr' ? '❌ Aucune énigme active!' :
                                   userLang === 'es' ? '❌ ¡No hay adivinanza activa!' :
                                   '❌ No active riddle!';
                await sock.sendMessage(chatId, { text: noRiddleMsg }, { quoted: message });
            }
            return;
        }
        
        // If user is trying to answer
        if (args.length > 0 && activeRiddles[chatId]) {
            const userAnswer = args.join(' ').toLowerCase().trim();
            const riddle = activeRiddles[chatId];
            
            const correctAnswers = [riddle.answer, ...riddle.alternatives].map(ans => ans.toLowerCase());
            
            if (correctAnswers.includes(userAnswer)) {
                delete activeRiddles[chatId];
                
                const successMsg = userLang === 'fr' ? `🎉 **Bravo @${senderId.split('@')[0]}!**\n\n✅ **Bonne réponse:** ${riddle.answer}\n\n🧠 Tu es vraiment intelligent(e)!` :
                                  userLang === 'es' ? `🎉 **¡Bravo @${senderId.split('@')[0]}!**\n\n✅ **Respuesta correcta:** ${riddle.answer}\n\n🧠 ¡Eres muy inteligente!` :
                                  `🎉 **Congratulations @${senderId.split('@')[0]}!**\n\n✅ **Correct answer:** ${riddle.answer}\n\n🧠 You are really smart!`;
                
                await sock.sendMessage(chatId, { 
                    text: successMsg,
                    mentions: [senderId]
                }, { quoted: message });
            } else {
                const wrongMsg = userLang === 'fr' ? `❌ **Mauvaise réponse!**\n\n💭 Essaie encore ou tape \`.riddle hint\` pour un indice\n🏳️ Ou \`.riddle giveup\` pour abandonner` :
                                userLang === 'es' ? `❌ **¡Respuesta incorrecta!**\n\n💭 Intenta de nuevo o escribe \`.riddle hint\` para una pista\n🏳️ O \`.riddle giveup\` para rendirte` :
                                `❌ **Wrong answer!**\n\n💭 Try again or type \`.riddle hint\` for a hint\n🏳️ Or \`.riddle giveup\` to give up`;
                
                await sock.sendMessage(chatId, { text: wrongMsg }, { quoted: message });
            }
            return;
        }
        
        // Start new riddle
        const langRiddles = riddles[userLang] || riddles['en'];
        const randomRiddle = langRiddles[Math.floor(Math.random() * langRiddles.length)];
        
        activeRiddles[chatId] = randomRiddle;
        
        const instructionsMsg = userLang === 'fr' ? `\n\n📝 **Comment jouer:**\n• Réponds avec \`.riddle <ta réponse>\`\n• \`.riddle hint\` pour un indice\n• \`.riddle giveup\` pour abandonner` :
                               userLang === 'es' ? `\n\n📝 **Cómo jugar:**\n• Responde con \`.riddle <tu respuesta>\`\n• \`.riddle hint\` para una pista\n• \`.riddle giveup\` para rendirte` :
                               `\n\n📝 **How to play:**\n• Answer with \`.riddle <your answer>\`\n• \`.riddle hint\` for a hint\n• \`.riddle giveup\` to give up`;
        
        await sock.sendMessage(chatId, { 
            text: randomRiddle.question + instructionsMsg 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in riddle command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error in riddle game. Please try again later!' 
        }, { quoted: message });
    }
}

module.exports = { riddleCommand };