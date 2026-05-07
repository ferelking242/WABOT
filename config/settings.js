// Load environment variables from .env file
// Force override to prevent empty Replit env vars from blocking .env file
require('dotenv').config({ override: true });

const settings = {
  packname: 'wabot',
  author: '‎',
  botName: "wabot",
  botOwner: 'wabot team', // Your name
  ownerNumber: process.env.OWNER_NUMBER || '242065491040', //Set your number here without + symbol, just add country code & number without any space
  botPhoneNumber: process.env.WHATSAPP_PHONE_NUMBER || '242064235945', // Bot's WhatsApp number for pairing
  giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "This is a bot for managing group commands and automating tasks.",
  version: "4.3",
  updateZipUrl: "",
  
  // Configuration GitHub pour les mises à jour (fallback si git remote indisponible)
  github: {
    owner: null, // Ex: 'username' - Laissez null pour auto-détection via git remote
    repo: null,  // Ex: 'wabot' - Laissez null pour auto-détection via git remote
    token: null  // GITHUB_TOKEN optionnel pour éviter rate limiting - Utilisez process.env.GITHUB_TOKEN de préférence
  }
};

// Configure global variables
global.phoneNumber = settings.botPhoneNumber;

module.exports = settings;
