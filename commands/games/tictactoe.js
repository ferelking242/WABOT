const TicTacToe = require('../../lib/tictactoe');
const { i18n } = require('../../lib/i18n');

// Store games globally
const games = {};

// Function to get translated text
function t(userId, key, replacements = {}) {
    return i18n.t(userId, `commands.${key}`, replacements);
}

// Function to create WhatsApp optimized board display
function createWhatsAppBoard(gameData) {
    const arr = gameData.render().map(v => ({
        'X': '❌',
        'O': '⭕',
        '1': '1️⃣',
        '2': '2️⃣',
        '3': '3️⃣',
        '4': '4️⃣',
        '5': '5️⃣',
        '6': '6️⃣',
        '7': '7️⃣',
        '8': '8️⃣',
        '9': '9️⃣',
    }[v]));

    return `\`\`\`\n${arr[0]} | ${arr[1]} | ${arr[2]}\n${arr[3]} | ${arr[4]} | ${arr[5]}\n${arr[6]} | ${arr[7]} | ${arr[8]}\n\`\`\``;
}

// Function to extract mentioned user from text
function extractMentionedUser(text, message) {
    const mentionedJid = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (mentionedJid) {
        return mentionedJid;
    }
    
    // Fallback: check for @mention in text
    const mentionMatch = text.match(/@(\d+)/);
    if (mentionMatch) {
        return mentionMatch[1] + '@s.whatsapp.net';
    }
    
    return null;
}

async function tictactoeCommand(sock, chatId, senderId, text, message) {
    try {
        // Check if player is already in a game
        if (Object.values(games).find(room => 
            room.id.startsWith('tictactoe') && 
            [room.game.playerX, room.game.playerO].includes(senderId)
        )) {
            const errorMsg = i18n.t(senderId, 'commands.tictac.already_in_game');
            await sock.sendMessage(chatId, { 
                text: errorMsg
            });
            return;
        }

        // Check for mentioned user (invitation)
        const mentionedUser = extractMentionedUser(text, message);
        
        // Extract room name (remove @mentions from text)
        const roomName = text.replace(/@\d+/g, '').trim();

        // Look for existing room
        let room = Object.values(games).find(room => 
            room.state === 'WAITING' && 
            (roomName ? room.name === roomName : true)
        );

        if (room) {
            // Join existing room
            room.o = chatId;
            room.game.playerO = senderId;
            room.state = 'PLAYING';

            const board = createWhatsAppBoard(room.game);
            
            const gameText = `🎮 *TIC-TAC-TOE LANCÉ !*
🆚 @${room.game.playerX.split('@')[0]} ❌ vs @${room.game.playerO.split('@')[0]} ⭕
📎 *Room ID:* \`${room.id}\`

---

🎲 *Plateau de jeu actuel :*
${board}

---

📏 *Règles :*
• Aligne 3 symboles (❌ ou ⭕) pour gagner
• Tape un chiffre (1-9) pour jouer
• Tape *.abandon* pour abandonner
• Réagis avec 1️⃣ à 9️⃣ pour jouer

🎆 **C'est à @${room.game.currentTurn.split('@')[0]} de jouer maintenant !**`;

            // Send new game message and store key for editing
            const sentMessage = await sock.sendMessage(chatId, { 
                text: gameText,
                mentions: [room.game.currentTurn, room.game.playerX, room.game.playerO]
            });

            // Store message key for editing
            room.messageKey = sentMessage.key;
            room.moveCount = 0; // Track moves to hide rules after first move

        } else {
            // Create new room
            room = {
                id: 'tictactoe-' + (+new Date),
                x: chatId,
                o: '',
                game: new TicTacToe(senderId, 'o'),
                state: 'WAITING',
                messageKey: null,
                invitedPlayer: mentionedUser
            };

            if (roomName) room.name = roomName;

            let waitingText;
            if (mentionedUser) {
                // Invitation message
                waitingText = `🎯 *Inviter un joueur*\nVous avez invité @${mentionedUser.split('@')[0]} à jouer !\nIl peut rejoindre avec *.jouer ${roomName || ''}*`;
                
                // Send invitation to mentioned user
                try {
                    const inviteText = `🎮 @${senderId.split('@')[0]} vous invite à jouer au morpion !\nRejoignez avec *.jouer ${roomName || ''}*`;
                    await sock.sendMessage(mentionedUser, {
                        text: inviteText,
                        mentions: [senderId]
                    });
                } catch (error) {
                    console.log('Could not send direct invitation:', error.message);
                }
            } else {
                waitingText = `⏳ *En attente d'un adversaire*\nTapez *.jouer ${roomName || ''}* pour rejoindre !`;
            }

            const sentMessage = await sock.sendMessage(chatId, { 
                text: waitingText,
                mentions: mentionedUser ? [mentionedUser] : []
            });

            room.messageKey = sentMessage.key;
            games[room.id] = room;
        }

    } catch (error) {
        console.error('Error in tictactoe command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Erreur lors du démarrage du jeu. Veuillez réessayer.' 
        });
    }
}

async function handleTicTacToeMove(sock, chatId, senderId, text) {
    try {
        console.log(`🎮 [TICTACTOE DEBUG] Handling move: text="${text}" senderId="${senderId}"`);
        console.log(`🎮 [TICTACTOE DEBUG] Available games:`, Object.keys(games));
        
        // Find player's game
        const room = Object.values(games).find(room => 
            room.id.startsWith('tictactoe') && 
            [room.game.playerX, room.game.playerO].includes(senderId) && 
            room.state === 'PLAYING'
        );

        if (!room) {
            console.log(`🎮 [TICTACTOE DEBUG] No room found for senderId: ${senderId}`);
            console.log(`🎮 [TICTACTOE DEBUG] Available rooms:`, Object.values(games).map(r => ({
                id: r.id, 
                playerX: r.game?.playerX, 
                playerO: r.game?.playerO, 
                state: r.state
            })));
            return;
        }

        const isSurrender = /^(surrender|abandon|give up)$/i.test(text);
        
        if (!isSurrender && !/^[1-9]$/.test(text)) return;

        // Allow surrender at any time, not just during player's turn
        if (senderId !== room.game.currentTurn && !isSurrender) {
            await sock.sendMessage(chatId, { 
                text: '❌ Ce n\'est pas votre tour !'
            });
            return;
        }
        
        // Increment move count for rules hiding
        room.moveCount = room.moveCount || 0;
        if (!isSurrender) room.moveCount++;

        let ok = isSurrender ? true : room.game.turn(
            senderId === room.game.playerO,
            parseInt(text) - 1
        );

        if (!ok) {
            await sock.sendMessage(chatId, { 
                text: '❌ Coup invalide ! Cette case est déjà prise.'
            });
            return;
        }

        let winner = room.game.winner;
        let isTie = room.game.turns === 9;

        if (isSurrender) {
            // Set the winner to the opponent of the surrendering player
            winner = senderId === room.game.playerX ? room.game.playerO : room.game.playerX;
            
            const surrenderText = `🏳️ **@${senderId.split('@')[0]} a abandonné ! @${winner.split('@')[0]} gagne !**`;

            // Edit the game message to show surrender
            if (room.messageKey) {
                try {
                    await sock.sendMessage(chatId, {
                        text: surrenderText,
                        edit: room.messageKey,
                        mentions: [senderId, winner]
                    });
                } catch (error) {
                    // Fallback to new message if edit fails
                    await sock.sendMessage(chatId, { 
                        text: surrenderText,
                        mentions: [senderId, winner]
                    });
                }
            }
            
            // Delete the game immediately after surrender
            delete games[room.id];
            return;
        }

        // Create game status message
        let gameStatus;
        if (winner) {
            gameStatus = `🎉 **@${winner.split('@')[0]} remporte la partie !**`;
        } else if (isTie) {
            gameStatus = '🤝 **Match nul !**';
        } else {
            const symbol = room.game.currentTurn === room.game.playerX ? '❌' : '⭕';
            gameStatus = `🎲 **Tour : @${room.game.currentTurn.split('@')[0]} (${symbol})**`;
        }

        const board = createWhatsAppBoard(room.game);
        
        // Rules only show before first move (moveCount = 0)
        const rules = room.moveCount === 1 && !winner && !isTie ? 
            '\n\n---\n\n📏 *Règles :*\n• Aligne 3 symboles (❌ ou ⭕) pour gagner\n• Tape un chiffre (1-9) pour jouer\n• Tape *.abandon* pour abandonner\n• Réagis avec 1️⃣ à 9️⃣ pour jouer' : '';
        
        // Show turn indicator if game continues
        const turnIndicator = !winner && !isTie ? `\n\n🎆 **C'est à @${room.game.currentTurn.split('@')[0]} de jouer maintenant !**` : '';
        
        const gameText = `🎮 *TIC-TAC-TOE EN COURS*
🆚 @${room.game.playerX.split('@')[0]} ❌ vs @${room.game.playerO.split('@')[0]} ⭕
📎 *Room ID:* \`${room.id}\`

---

🎲 *Plateau de jeu actuel :*
${board}

---

${gameStatus}${rules}${turnIndicator}`;

        const mentions = [
            room.game.playerX, 
            room.game.playerO,
            ...(winner ? [winner] : [room.game.currentTurn])
        ];

        // Edit the existing message instead of sending new ones
        if (room.messageKey) {
            try {
                await sock.sendMessage(chatId, {
                    text: gameText,
                    edit: room.messageKey,
                    mentions: mentions
                });
            } catch (error) {
                console.log('Failed to edit message, sending new one:', error.message);
                // Fallback to new message if edit fails
                const sentMessage = await sock.sendMessage(chatId, { 
                    text: gameText,
                    mentions: mentions
                });
                room.messageKey = sentMessage.key;
            }
        } else {
            // Send new message if no key stored
            const sentMessage = await sock.sendMessage(chatId, { 
                text: gameText,
                mentions: mentions
            });
            room.messageKey = sentMessage.key;
        }

        if (winner || isTie) {
            delete games[room.id];
        }

    } catch (error) {
        console.error('Error in tictactoe move:', error);
    }
}

// Function to handle tictactoe moves from numbers 1-9
async function tictactoeMove(sock, chatId, senderId, position) {
    await handleTicTacToeMove(sock, chatId, senderId, position.toString());
}

// Function to handle emoji reactions for tictactoe (1️⃣ to 9️⃣)
async function handleTicTacToeReaction(sock, chatId, senderId, emoji) {
    const emojiToNumber = {
        '1️⃣': '1', '2️⃣': '2', '3️⃣': '3',
        '4️⃣': '4', '5️⃣': '5', '6️⃣': '6',
        '7️⃣': '7', '8️⃣': '8', '9️⃣': '9'
    };
    
    const number = emojiToNumber[emoji];
    if (number) {
        await handleTicTacToeMove(sock, chatId, senderId, number);
    }
}

module.exports = {
    tictactoeCommand,
    handleTicTacToeMove,
    tictactoeMove,
    handleTicTacToeReaction
};