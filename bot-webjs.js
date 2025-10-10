/**
 * wabot - WhatsApp Bot avec WhatsApp Web.js
 * Solution alternative plus stable que Baileys
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Configuration
const SESSION_PATH = './data/sessions/webjs';
const phoneNumber = process.env.BOT_PHONE_NUMBER || "242061194809";

// Créer le dossier de sessions s'il n'existe pas
if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true });
}

console.log('🚀 [WABOT] Démarrage avec WhatsApp Web.js...');
console.log(`📱 Numéro configuré: +${phoneNumber}`);

// Initialiser le client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: SESSION_PATH
    }),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable', // Chrome système Replit
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--single-process'
        ]
    }
});

// Événement QR Code
client.on('qr', (qr) => {
    console.log('\n🌹⃝━❮ 𝐖𝐚𝐛𝐨𝐭 Connexion ❯━');
    console.log('┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆');
    console.log('┊ ┊ ✫ ˚♡ ⋆｡ ✧');
    console.log('⊹ ☪︎⋆ 📱 Scan QR Code pour connecter ⋆☪︎ ⊹');
    console.log('✧ ⋆｡ ♡˚ ✫ ┊ ┊');
    console.log('⋆☪︎ ｡⋆❀ ｡⋆ ┊ ┊ ┊ ┊ ┊');
    console.log('━❮ 𝐖𝐚𝐛𝐨𝐭 Connexion ❯━⃝🌹\n');
    
    // Afficher le QR code dans le terminal
    qrcode.generate(qr, { small: true });
    
    console.log('\n📋 Instructions:');
    console.log('  1. Ouvrez WhatsApp sur votre téléphone');
    console.log('  2. Allez dans Paramètres > Appareils connectés');
    console.log('  3. Appuyez sur "Connecter un appareil"');
    console.log('  4. Scannez le QR code ci-dessus');
    console.log('\n⏳ En attente du scan...\n');
});

// Événement de connexion
client.on('ready', () => {
    console.log('\n🎉 ✅ WABOT CONNECTÉ AVEC SUCCÈS !');
    console.log('\n🌹⃝━❮ 𝐖𝐚𝐛𝐨𝐭 Prêt ❯━');
    console.log('┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆');
    console.log('┊ ┊ ✫ ˚♡ ⋆｡ ✧');
    console.log('⊹ ☪︎⋆ 🤖 Bot en ligne et opérationnel ⋆☪︎ ⊹');
    console.log('✧ ⋆｡ ♡˚ ✫ ┊ ┊');
    console.log('⋆☪︎ ｡⋆❀ ｡⋆ ┊ ┊ ┊ ┊ ┊');
    console.log('━❮ 𝐖𝐚𝐛𝐨𝐭 Prêt ❯━⃝🌹\n');
    
    console.log(`📱 Numéro connecté: ${client.info.wid.user}`);
    console.log(`🔋 Version WhatsApp: ${client.info.platform}`);
    console.log(`📅 Connecté le: ${new Date().toLocaleString()}`);
});

// Événement d'authentification
client.on('authenticated', (session) => {
    console.log('✅ Authentification réussie !');
    console.log('💾 Session sauvegardée dans:', SESSION_PATH);
});

// Événement d'échec d'authentification
client.on('auth_failure', (msg) => {
    console.log('❌ Échec d\'authentification:', msg);
    console.log('🔄 Veuillez redémarrer le bot et scanner à nouveau le QR code');
});

// Événement de déconnexion
client.on('disconnected', (reason) => {
    console.log('⚠️ Client déconnecté:', reason);
    console.log('🔄 Redémarrage automatique...');
    
    // Redémarrage automatique après 5 secondes
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Gestion des messages (basique pour test)
client.on('message', (message) => {
    if (message.body === '!ping') {
        message.reply('🏓 Pong! Bot WhatsApp Web.js opérationnel !');
    }
    
    if (message.body === '!status') {
        const info = client.info;
        message.reply(`📊 Status:\n` +
                     `🤖 Bot: Actif\n` +
                     `📱 Numéro: ${info.wid.user}\n` +
                     `🔋 Plateforme: ${info.platform}\n` +
                     `⏰ Connecté: ${new Date().toLocaleString()}`);
    }
});

// Gestion d'erreur globale
process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.log('💥 Uncaught Exception:', error);
});

// Initialiser le client
console.log('🔄 Initialisation du client WhatsApp Web.js...');
client.initialize();

// Fonction pour arrêt propre
process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt en cours...');
    await client.destroy();
    console.log('✅ Client fermé proprement');
    process.exit(0);
});

module.exports = client;