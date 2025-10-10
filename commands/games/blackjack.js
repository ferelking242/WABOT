const { channelConfig } = require('../../lib/channelConfig');
const { getText, getUserLanguage } = require('../../lib/languages');

// Store active blackjack games
let blackjackGames = {};

// Card deck
const deck = {
    values: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    suits: ['♠️', '♥️', '♦️', '♣️']
};

// Card value calculation
function getCardValue(card) {
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    if (card.value === 'A') return 11; // We'll handle ace logic separately
    return parseInt(card.value);
}

// Calculate hand value with proper ace handling
function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    
    for (let card of hand) {
        if (card.value === 'A') {
            aces++;
            value += 11;
        } else {
            value += getCardValue(card);
        }
    }
    
    // Convert aces from 11 to 1 if needed
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

// Create shuffled deck
function createDeck() {
    const cards = [];
    for (let suit of deck.suits) {
        for (let value of deck.values) {
            cards.push({ value, suit, display: `${value}${suit}` });
        }
    }
    
    // Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    
    return cards;
}

// Format hand display
function formatHand(hand, hideFirst = false) {
    if (hideFirst && hand.length > 0) {
        return [`🂠`, ...hand.slice(1).map(card => card.display)].join(' ');
    }
    return hand.map(card => card.display).join(' ');
}

// Start new blackjack game
async function blackjackCommand(sock, chatId, senderId, message, args) {
    try {
        const userLang = getUserLanguage(senderId);
        
        // Check if user already has a game
        if (blackjackGames[senderId]) {
            const activeText = userLang === 'fr' ? 
                '🃏 Vous avez déjà une partie en cours ! Tapez `.bjhit`, `.bjstand` ou `.bjquit`' :
                userLang === 'es' ? 
                '🃏 ¡Ya tienes un juego en curso! Escribe `.bjhit`, `.bjstand` o `.bjquit`' :
                '🃏 You already have a game in progress! Type `.bjhit`, `.bjstand` or `.bjquit`';
                
            await sock.sendMessage(chatId, {
                text: activeText,
                ...channelConfig
            });
            return;
        }

        // Create new game
        const gameDeck = createDeck();
        const game = {
            deck: gameDeck,
            playerHand: [gameDeck.pop(), gameDeck.pop()],
            dealerHand: [gameDeck.pop(), gameDeck.pop()],
            gameOver: false,
            playerStand: false
        };

        blackjackGames[senderId] = game;

        const playerValue = calculateHandValue(game.playerHand);
        const dealerVisibleValue = getCardValue(game.dealerHand[0]);

        // Check for immediate blackjack
        if (playerValue === 21) {
            const dealerValue = calculateHandValue(game.dealerHand);
            if (dealerValue === 21) {
                // Push (tie)
                game.gameOver = true;
                const tieText = userLang === 'fr' ? 
                    `🃏 *BLACKJACK - ÉGALITÉ !*\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 Égalité parfaite ! Nouveau jeu avec \`.blackjack\`` :
                    userLang === 'es' ? 
                    `🃏 *BLACKJACK - ¡EMPATE!*\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 ¡Empate perfecto! Nuevo juego con \`.blackjack\`` :
                    `🃏 *BLACKJACK - TIE!*\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 Perfect tie! New game with \`.blackjack\``;
                    
                await sock.sendMessage(chatId, {
                    text: tieText,
                    ...channelConfig
                });
                delete blackjackGames[senderId];
                return;
            } else {
                // Player blackjack wins
                game.gameOver = true;
                const winText = userLang === 'fr' ? 
                    `🃏 *BLACKJACK ! VOUS GAGNEZ !* 🎉\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n🏆 Blackjack naturel ! Nouveau jeu avec \`.blackjack\`` :
                    userLang === 'es' ? 
                    `🃏 *¡BLACKJACK! ¡GANAS!* 🎉\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n🏆 ¡Blackjack natural! Nuevo juego con \`.blackjack\`` :
                    `🃏 *BLACKJACK! YOU WIN!* 🎉\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n🏆 Natural blackjack! New game with \`.blackjack\``;
                    
                await sock.sendMessage(chatId, {
                    text: winText,
                    ...channelConfig
                });
                delete blackjackGames[senderId];
                return;
            }
        }

        // Regular game start
        const gameText = userLang === 'fr' ? 
            `🃏 *BLACKJACK* 🃏\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Actions:**\n• \`.bjhit\` - Prendre une carte\n• \`.bjstand\` - Rester\n• \`.bjquit\` - Abandonner\n\n🎯 **Objectif:** Atteindre 21 sans dépasser !` :
            userLang === 'es' ? 
            `🃏 *BLACKJACK* 🃏\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Acciones:**\n• \`.bjhit\` - Tomar carta\n• \`.bjstand\` - Plantarse\n• \`.bjquit\` - Abandonar\n\n🎯 **Objetivo:** ¡Llegar a 21 sin pasarse!` :
            `🃏 *BLACKJACK* 🃏\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Actions:**\n• \`.bjhit\` - Hit (take card)\n• \`.bjstand\` - Stand\n• \`.bjquit\` - Quit\n\n🎯 **Goal:** Reach 21 without going over!`;

        await sock.sendMessage(chatId, {
            text: gameText,
            mentions: [senderId],
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in blackjack command:', error);
        const errorText = getUserLanguage(senderId) === 'fr' ? 
            '❌ Erreur lors du démarrage du blackjack !' :
            '❌ Error starting blackjack!';
        await sock.sendMessage(chatId, {
            text: errorText,
            ...channelConfig
        });
    }
}

// Hit command (take a card)
async function bjHitCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = blackjackGames[senderId];
        
        if (!game || game.gameOver) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucune partie en cours ! Démarrez avec `.blackjack`' :
                userLang === 'es' ? 
                '❌ ¡No hay juego en curso! Inicia con `.blackjack`' :
                '❌ No game in progress! Start with `.blackjack`';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        // Add card to player
        game.playerHand.push(game.deck.pop());
        const playerValue = calculateHandValue(game.playerHand);

        if (playerValue > 21) {
            // Player busts
            game.gameOver = true;
            const bustText = userLang === 'fr' ? 
                `🃏 *VOUS AVEZ DÉPASSÉ !* 💥\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n💸 Dépassé 21 ! Nouveau jeu avec \`.blackjack\`` :
                userLang === 'es' ? 
                `🃏 *¡TE PASASTE!* 💥\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n💸 ¡Pasaste de 21! Nuevo juego con \`.blackjack\`` :
                `🃏 *BUST!* 💥\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${calculateHandValue(game.dealerHand)}\n\n💸 Over 21! New game with \`.blackjack\``;
                
            await sock.sendMessage(chatId, {
                text: bustText,
                ...channelConfig
            });
            delete blackjackGames[senderId];
            return;
        }

        // Show updated hand
        const dealerVisibleValue = getCardValue(game.dealerHand[0]);
        const hitText = userLang === 'fr' ? 
            `🃏 *CARTE AJOUTÉE !*\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Actions:**\n• \`.bjhit\` - Prendre une carte\n• \`.bjstand\` - Rester` :
            userLang === 'es' ? 
            `🃏 *¡CARTA AÑADIDA!*\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Acciones:**\n• \`.bjhit\` - Tomar carta\n• \`.bjstand\` - Plantarse` :
            `🃏 *CARD ADDED!*\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand, true)} = ${dealerVisibleValue}+?\n\n**Actions:**\n• \`.bjhit\` - Hit\n• \`.bjstand\` - Stand`;

        await sock.sendMessage(chatId, {
            text: hitText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in blackjack hit:', error);
    }
}

// Stand command (dealer's turn)
async function bjStandCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        const game = blackjackGames[senderId];
        
        if (!game || game.gameOver) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucune partie en cours !' :
                '❌ No game in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        game.playerStand = true;
        const playerValue = calculateHandValue(game.playerHand);

        // Dealer plays
        while (calculateHandValue(game.dealerHand) < 17) {
            game.dealerHand.push(game.deck.pop());
        }

        const dealerValue = calculateHandValue(game.dealerHand);
        game.gameOver = true;

        let resultText = '';
        if (dealerValue > 21) {
            // Dealer busts, player wins
            resultText = userLang === 'fr' ? 
                `🃏 *VOUS GAGNEZ !* 🎉\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 Le dealer a dépassé 21 ! Nouveau jeu avec \`.blackjack\`` :
                userLang === 'es' ? 
                `🃏 *¡GANAS!* 🎉\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 ¡El dealer se pasó de 21! Nuevo juego con \`.blackjack\`` :
                `🃏 *YOU WIN!* 🎉\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 Dealer busted! New game with \`.blackjack\``;
        } else if (playerValue > dealerValue) {
            // Player wins
            resultText = userLang === 'fr' ? 
                `🃏 *VOUS GAGNEZ !* 🎉\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 Votre main est meilleure ! Nouveau jeu avec \`.blackjack\`` :
                userLang === 'es' ? 
                `🃏 *¡GANAS!* 🎉\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 ¡Tu mano es mejor! Nuevo juego con \`.blackjack\`` :
                `🃏 *YOU WIN!* 🎉\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🏆 Your hand is better! New game with \`.blackjack\``;
        } else if (playerValue < dealerValue) {
            // Dealer wins
            resultText = userLang === 'fr' ? 
                `🃏 *LE DEALER GAGNE !* 😞\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n💸 La main du dealer est meilleure ! Nouveau jeu avec \`.blackjack\`` :
                userLang === 'es' ? 
                `🃏 *¡EL DEALER GANA!* 😞\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n💸 ¡La mano del dealer es mejor! Nuevo juego con \`.blackjack\`` :
                `🃏 *DEALER WINS!* 😞\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n💸 Dealer's hand is better! New game with \`.blackjack\``;
        } else {
            // Tie
            resultText = userLang === 'fr' ? 
                `🃏 *ÉGALITÉ !* 🤝\n\n👤 **Vos cartes:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 Même valeur ! Nouveau jeu avec \`.blackjack\`` :
                userLang === 'es' ? 
                `🃏 *¡EMPATE!* 🤝\n\n👤 **Tus cartas:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 ¡Mismo valor! Nuevo juego con \`.blackjack\`` :
                `🃏 *TIE!* 🤝\n\n👤 **Your cards:** ${formatHand(game.playerHand)} = ${playerValue}\n🤖 **Dealer:** ${formatHand(game.dealerHand)} = ${dealerValue}\n\n🤝 Same value! New game with \`.blackjack\``;
        }

        await sock.sendMessage(chatId, {
            text: resultText,
            ...channelConfig
        });

        delete blackjackGames[senderId];

    } catch (error) {
        console.error('Error in blackjack stand:', error);
    }
}

// Quit command
async function bjQuitCommand(sock, chatId, senderId, message) {
    try {
        const userLang = getUserLanguage(senderId);
        
        if (!blackjackGames[senderId]) {
            const noGameText = userLang === 'fr' ? 
                '❌ Aucune partie en cours !' :
                '❌ No game in progress!';
                
            await sock.sendMessage(chatId, {
                text: noGameText,
                ...channelConfig
            });
            return;
        }

        delete blackjackGames[senderId];
        
        const quitText = userLang === 'fr' ? 
            '🃏 Partie de blackjack abandonnée ! Nouvelle partie avec `.blackjack`' :
            userLang === 'es' ? 
            '🃏 ¡Juego de blackjack abandonado! Nuevo juego con `.blackjack`' :
            '🃏 Blackjack game quit! New game with `.blackjack`';

        await sock.sendMessage(chatId, {
            text: quitText,
            ...channelConfig
        });

    } catch (error) {
        console.error('Error in blackjack quit:', error);
    }
}

module.exports = {
    blackjackCommand,
    bjHitCommand,
    bjStandCommand,
    bjQuitCommand
};