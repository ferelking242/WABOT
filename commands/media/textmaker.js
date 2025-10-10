const axios = require('axios');
const mumaker = require('mumaker');
const { channelConfig } = require('../../lib/channelConfig');

// Reusable message templates
const messageTemplates = {
    error: (message) => ({
        text: message,
        ...channelConfig
    }),
    success: (text, imageUrl) => ({
        image: { url: imageUrl },
        caption: "wabot by codecraft",
        ...channelConfig
    })
};

async function textmakerCommand(sock, chatId, message, q, type) {
    try {
        if (!q) {
            return await sock.sendMessage(chatId, messageTemplates.error("Please provide text to generate\nExample: .metallic Nick"));
        }

        // Extract text - remove command name from q to get only user text
        const commandMatch = q.match(/^\.\w+\s+(.+)$/);
        const text = commandMatch ? commandMatch[1].trim() : q.replace(/^\.\w+\s*/, '').trim();

        if (!text) {
            return await sock.sendMessage(chatId, messageTemplates.error("Please provide text to generate\nExample: .metallic Nick"));
        }

        // Add reaction emoji to show processing
        try {
            await sock.sendMessage(chatId, {
                react: {
                    text: '⏳',
                    key: message.key
                }
            });
        } catch (err) {
            console.log('Could not send reaction');
        }

        try {
            let result;
            switch (type) {
                case 'metallic':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-3d-shiny-metallic-text-effect-online-687.html", text);
                    break;
                case 'ice':
                    result = await mumaker.ephoto("https://en.ephoto360.com/ice-text-effect-online-101.html", text);
                    break;
                case 'snow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html", text);
                    break;
                case 'impressive':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html", text);
                    break;
                case 'matrix':
                    result = await mumaker.ephoto("https://en.ephoto360.com/matrix-text-effect-154.html", text);
                    break;
                case 'light':
                    result = await mumaker.ephoto("https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html", text);
                    break;
                case 'neon':
                    result = await mumaker.ephoto("https://en.ephoto360.com/neon-text-effect-68.html", text);
                    break;
                case 'devil':
                    result = await mumaker.ephoto("https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html", text);
                    break;
                case 'purple':
                    result = await mumaker.ephoto("https://en.ephoto360.com/purple-text-effect-online-100.html", text);
                    break;
                case 'thunder':
                    result = await mumaker.ephoto("https://en.ephoto360.com/thunder-text-effect-online-97.html", text);
                    break;
                case 'leaves':
                    result = await mumaker.ephoto("https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html", text);
                    break;
                case '1917':
                    result = await mumaker.ephoto("https://en.ephoto360.com/1917-style-text-effect-523.html", text);
                    break;
                case 'arena':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html", text);
                    break;
                case 'hacker':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html", text);
                    break;
                case 'sand':
                    result = await mumaker.ephoto("https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html", text);
                    break;
                case 'blackpink':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html", text);
                    break;
                case 'glitch':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html", text);
                    break;
                case 'fire':
                    result = await mumaker.ephoto("https://en.ephoto360.com/dragon-fire-text-effect-111.html", text);
                    break;
                case 'diamond':
                    result = await mumaker.ephoto("https://en.ephoto360.com/diamond-text-95.html", text);
                    break;
                case 'rainbow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/city-rainbow-effect-4.html", text);
                    break;
                case 'space':
                    result = await mumaker.ephoto("https://en.ephoto360.com/galaxy-text-effect-116.html", text);
                    break;
                case 'galaxy':
                    result = await mumaker.ephoto("https://en.ephoto360.com/galaxy-text-effect-new-258.html", text);
                    break;
                case 'gold':
                    result = await mumaker.ephoto("https://en.ephoto360.com/metal-text-effect-online-110.html", text);
                    break;
                case 'silver':
                    result = await mumaker.ephoto("https://en.ephoto360.com/glossy-chrome-text-effect-online-424.html", text);
                    break;
                case 'chrome':
                    result = await mumaker.ephoto("https://en.ephoto360.com/chrome-text-effect-91.html", text);
                    break;
                case 'blood':
                    result = await mumaker.ephoto("https://en.ephoto360.com/write-blood-text-on-the-wall-264.html", text);
                    break;
                case 'horror':
                    result = await mumaker.ephoto("https://en.ephoto360.com/writing-horror-text-online-266.html", text);
                    break;
                case 'love':
                    result = await mumaker.ephoto("https://en.ephoto360.com/text-effect-halloween-online-79.html", text);
                    break;
                case 'retro':
                    result = await mumaker.ephoto("https://en.ephoto360.com/free-retro-neon-text-effect-online-538.html", text);
                    break;
                case 'christmas':
                    result = await mumaker.ephoto("https://en.ephoto360.com/christmas-snow-text-effect-online-623.html", text);
                    break;
                case 'cyber':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-impressive-neon-glitch-text-effects-online-768.html", text);
                    break;
                case 'graffiti':
                    result = await mumaker.ephoto("https://en.ephoto360.com/graffiti-creator-online-414.html", text);
                    break;
                case 'water':
                    result = await mumaker.ephoto("https://en.ephoto360.com/water-text-effect-online-295.html", text);
                    break;
                case 'electric':
                    result = await mumaker.ephoto("https://en.ephoto360.com/electric-text-effect-online-103.html", text);
                    break;
                case 'lava':
                    result = await mumaker.ephoto("https://en.ephoto360.com/lava-text-effect-online-189.html", text);
                    break;
                case 'wooden':
                    result = await mumaker.ephoto("https://en.ephoto360.com/wood-text-effect-online-109.html", text);
                    break;
                case 'glass':
                    result = await mumaker.ephoto("https://en.ephoto360.com/transparent-glass-text-effect-online-426.html", text);
                    break;
                case 'comic':
                    result = await mumaker.ephoto("https://en.ephoto360.com/comic-book-text-effect-online-412.html", text);
                    break;
                default:
                    const availableEffects = [
                        "🔥 fire", "✨ metallic", "❄️ ice", "☃️ snow", "🔢 matrix", 
                        "🌈 neon", "😈 devil", "💜 purple", "⚡ thunder", "🍃 leaves", 
                        "🇺🇸 1917", "🏰 arena", "👻 hacker", "🏖️ sand", "💖 blackpink", 
                        "🔌 glitch", "💎 diamond", "🌈 rainbow", "🌌 space", "🌌 galaxy", 
                        "🥇 gold", "🥈 silver", "⚪ chrome", "🩸 blood", "💀 horror", "❤️ love",
                        "🕺 retro", "🎄 christmas", "🤖 cyber", "🎨 graffiti", "💧 water",
                        "⚡ electric", "🌋 lava", "🪵 wooden", "🔍 glass", "💥 comic"
                    ];
                    return await sock.sendMessage(chatId, messageTemplates.error(`🗯️ Effet non disponible\n\n📝 **${availableEffects.length} effets disponibles:**\n${availableEffects.join(", ")}\n\n💡 **Exemple:** .fire MonTexte`));
            }

            if (!result || !result.image) {
                throw new Error('No image URL received from the API');
            }

            await sock.sendMessage(chatId, messageTemplates.success(text, result.image));
            
            // Add success reaction
            try {
                await sock.sendMessage(chatId, {
                    react: {
                        text: '✅',
                        key: message.key
                    }
                });
            } catch (err) {
                console.log('Could not send success reaction');
            }
        } catch (error) {
            console.error('Error in text generator:', error);
            
            // Add error reaction
            try {
                await sock.sendMessage(chatId, {
                    react: {
                        text: '❌',
                        key: message.key
                    }
                });
            } catch (err) {
                console.log('Could not send error reaction');
            }
            
            await sock.sendMessage(chatId, messageTemplates.error(`Error: ${error.message}`));
        }
    } catch (error) {
        console.error('Error in textmaker command:', error);
        await sock.sendMessage(chatId, messageTemplates.error("An error occurred. Please try again later."));
    }
}

module.exports = textmakerCommand; 