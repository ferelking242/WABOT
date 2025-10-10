const { getText, getUserLanguage } = require('../../lib/languages');

async function rockpaperscissorsCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const userLang = getUserLanguage(senderId);
        
        // Game choices
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        
        // Multilingual choice mappings
        const choiceMapping = {
            fr: {
                'pierre': 'rock', 'roche': 'rock', 'rock': 'rock',
                'papier': 'paper', 'paper': 'paper', 'feuille': 'paper',
                'ciseaux': 'scissors', 'scissors': 'scissors', 'ciseau': 'scissors'
            },
            en: {
                'rock': 'rock', 'stone': 'rock',
                'paper': 'paper',
                'scissors': 'scissors', 'scissor': 'scissors'
            },
            es: {
                'piedra': 'rock', 'rock': 'rock', 'roca': 'rock',
                'papel': 'paper', 'paper': 'paper',
                'tijeras': 'scissors', 'tijera': 'scissors', 'scissors': 'scissors'
            }
        };
        
        // Choice display names and emojis
        const choiceDisplay = {
            rock: {
                fr: { name: 'Pierre', emoji: '🪨' },
                en: { name: 'Rock', emoji: '🪨' },
                es: { name: 'Piedra', emoji: '🪨' }
            },
            paper: {
                fr: { name: 'Papier', emoji: '📄' },
                en: { name: 'Paper', emoji: '📄' },
                es: { name: 'Papel', emoji: '📄' }
            },
            scissors: {
                fr: { name: 'Ciseaux', emoji: '✂️' },
                en: { name: 'Scissors', emoji: '✂️' },
                es: { name: 'Tijeras', emoji: '✂️' }
            }
        };
        
        if (args.length === 0) {
            const helpText = userLang === 'fr' ? 
                `🎮 **Pierre-Papier-Ciseaux** 🎮\n\n🪨 Pierre bat Ciseaux\n📄 Papier bat Pierre\n✂️ Ciseaux bat Papier\n\n💡 **Usage:** .rps pierre/papier/ciseaux\n📝 **Exemple:** .rps pierre` :
                userLang === 'es' ?
                `🎮 **Piedra-Papel-Tijeras** 🎮\n\n🪨 Piedra vence Tijeras\n📄 Papel vence Piedra\n✂️ Tijeras vence Papel\n\n💡 **Uso:** .rps piedra/papel/tijeras\n📝 **Ejemplo:** .rps piedra` :
                `🎮 **Rock-Paper-Scissors** 🎮\n\n🪨 Rock beats Scissors\n📄 Paper beats Rock\n✂️ Scissors beats Paper\n\n💡 **Usage:** .rps rock/paper/scissors\n📝 **Example:** .rps rock`;
            
            await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
            return;
        }
        
        const userInput = args[0].toLowerCase();
        const userLangChoices = choiceMapping[userLang] || choiceMapping['en'];
        
        if (!userLangChoices[userInput]) {
            const errorText = userLang === 'fr' ?
                `❌ **Choix invalide!**\n\n✅ **Choix valides:** pierre, papier, ciseaux` :
                userLang === 'es' ?
                `❌ **¡Elección inválida!**\n\n✅ **Elecciones válidas:** piedra, papel, tijeras` :
                `❌ **Invalid choice!**\n\n✅ **Valid choices:** rock, paper, scissors`;
            
            await sock.sendMessage(chatId, { text: errorText }, { quoted: message });
            return;
        }
        
        const userChoice = userLangChoices[userInput];
        
        // Determine winner
        let result = '';
        if (userChoice === botChoice) {
            result = 'tie';
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            result = 'win';
        } else {
            result = 'lose';
        }
        
        // Get display names
        const userDisplay = choiceDisplay[userChoice][userLang] || choiceDisplay[userChoice]['en'];
        const botDisplay = choiceDisplay[botChoice][userLang] || choiceDisplay[botChoice]['en'];
        
        // Create result message
        let resultText = '';
        if (userLang === 'fr') {
            resultText = `🎮 **Pierre-Papier-Ciseaux** 🎮\n\n👤 **@${senderId.split('@')[0]}:** ${userDisplay.emoji} ${userDisplay.name}\n🤖 **Bot:** ${botDisplay.emoji} ${botDisplay.name}\n\n`;
            
            switch (result) {
                case 'win':
                    resultText += `🎉 **Victoire!** Tu as gagné!\n💪 ${userDisplay.name} bat ${botDisplay.name}`;
                    break;
                case 'lose':
                    resultText += `😔 **Défaite!** Tu as perdu!\n🤖 ${botDisplay.name} bat ${userDisplay.name}`;
                    break;
                case 'tie':
                    resultText += `🤝 **Match nul!** Égalité parfaite!`;
                    break;
            }
        } else if (userLang === 'es') {
            resultText = `🎮 **Piedra-Papel-Tijeras** 🎮\n\n👤 **@${senderId.split('@')[0]}:** ${userDisplay.emoji} ${userDisplay.name}\n🤖 **Bot:** ${botDisplay.emoji} ${botDisplay.name}\n\n`;
            
            switch (result) {
                case 'win':
                    resultText += `🎉 **¡Victoria!** ¡Ganaste!\n💪 ${userDisplay.name} vence ${botDisplay.name}`;
                    break;
                case 'lose':
                    resultText += `😔 **¡Derrota!** ¡Perdiste!\n🤖 ${botDisplay.name} vence ${userDisplay.name}`;
                    break;
                case 'tie':
                    resultText += `🤝 **¡Empate!** ¡Igualdad perfecta!`;
                    break;
            }
        } else {
            resultText = `🎮 **Rock-Paper-Scissors** 🎮\n\n👤 **@${senderId.split('@')[0]}:** ${userDisplay.emoji} ${userDisplay.name}\n🤖 **Bot:** ${botDisplay.emoji} ${botDisplay.name}\n\n`;
            
            switch (result) {
                case 'win':
                    resultText += `🎉 **Victory!** You won!\n💪 ${userDisplay.name} beats ${botDisplay.name}`;
                    break;
                case 'lose':
                    resultText += `😔 **Defeat!** You lost!\n🤖 ${botDisplay.name} beats ${userDisplay.name}`;
                    break;
                case 'tie':
                    resultText += `🤝 **Tie!** Perfect match!`;
                    break;
            }
        }
        
        await sock.sendMessage(chatId, { 
            text: resultText,
            mentions: [senderId]
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in rock-paper-scissors command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error in rock-paper-scissors game. Please try again later!' 
        }, { quoted: message });
    }
}

module.exports = { rockpaperscissorsCommand };