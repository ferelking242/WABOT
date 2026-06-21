/**
 * wabot - A WhatsApp Bot
 * Copyright (c) 2024 wabot team
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */

// Load environment variables FIRST before any other requires
// Force override to prevent empty Replit env vars from blocking .env file
require('dotenv').config({ override: true });

require('./config/settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const SessionManager = require('./lib/sessionManager')

// SessionManager singleton global pour cohérence
const globalSessionManager = new SessionManager()
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const { autoTransferViewOnce } = require('./commands/dvo');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    proto,
    jidNormalizedUser
} = require("@whiskeysockets/baileys")
// Using a lightweight persisted store for data persistence
// Import update notifier system
const updateNotifier = require('./lib/updateNotifier')
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')

// COMPLÉTER la table MCC avec les pays africains manquants
const EXTENDED_PHONENUMBER_MCC = {
    ...PHONENUMBER_MCC,
    // Afrique de l'Ouest
    'CI': '612',  // Côte d'Ivoire - Orange, MTN, Moov
    'SN': '608',  // Sénégal - Orange, Free, Expresso
    'BF': '613',  // Burkina Faso - Orange, Telmob, Telecel
    'ML': '610',  // Mali - Orange, Malitel, Telecel
    'NE': '614',  // Niger - Orange, Airtel, Moov
    'TG': '615',  // Togo - Togocom, Moov
    'BJ': '616',  // Bénin - MTN, Moov, Glo
    
    // Afrique Centrale  
    'CG': '629',  // Congo Brazzaville - MTN, Airtel, Warid
    'CD': '630',  // Congo RDC - Vodacom, Airtel, Orange
    'CF': '623',  // Centrafrique - Orange, Telecel, Moov
    'TD': '622',  // Tchad - Airtel, Tigo, Salam
    'CM': '624',  // Cameroun - MTN, Orange, Nexttel
    'GA': '628',  // Gabon - Airtel, Moov, Libertis
    'GQ': '627',  // Guinée Équatoriale - Orange, Hits GE
    
    // Autres pays africains fréquents
    'MA': '604',  // Maroc - Orange, Inwi, Wana
    'DZ': '603',  // Algérie - Mobilis, Ooredoo, Djezzy
    'TN': '605',  // Tunisie - Orange, Ooredoo, Tunisie Telecom
}
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')
// Import centralized logger
const { logger, error, warn, success, info, system, debug, network, database, memory, connection, startup } = require('./lib/logger')


// Global companion system instance
// Global companionSystem removed - using new wa-multi-session system

// Initialize store
store.readFromFile()
const settings = require('./config/settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// 🚀 OPTIMIZATION SYSTEMS INTEGRATION
const { optimizationManager } = require('./lib/optimizationManager');

// ✅ COMPANION SYSTEM INTEGRATION - Global instantiation for automatic cleanup
const CompanionSessionManager = require('./lib/CompanionSessionManager');
let globalCompanionManager = null;

// Variable pour savoir si les systèmes sont initialisés
let systemsInitialized = false;

// Function to initialize all systems ONLY after WhatsApp connection is established
async function initializeAllSystems() {
    if (systemsInitialized) {
        info('Systems', 'Systèmes déjà initialisés, skip.')
        return;
    }
    
    system('Systems', 'Initialisation des systèmes d\'optimisation...')
    
    try {
        // Initialize companion system
        if (!globalCompanionManager) {
            globalCompanionManager = new CompanionSessionManager();
            success('Systems', 'CompanionSessionManager initialisé (Baileys + DB persistence)')
        }
        
        // Initialize optimization systems
        await optimizationManager.initialize();
        success('Systems', 'Tous les systèmes d\'optimisation initialisés ✅')
        
        systemsInitialized = true;
    } catch (err) {
        warn('Systems', `Erreur initialisation systèmes (non critique): ${err.message}`)
        // Continue without systems - non-critical
    }
}

// Enhanced memory optimization with optimization manager
setInterval(() => {
    if (global.gc) {
        global.gc()
    }
}, 60_000) // every 1 minute

// Enhanced memory monitoring with optimization manager
setInterval(async () => {
    const used = process.memoryUsage().rss / 1024 / 1024
    
    // Use optimization manager for health check
    try {
        const health = await optimizationManager.getSystemHealth();
        
        if (health.overall < 30) {
            await optimizationManager.forceCleanup();
        }
        
        // Pas de log de santé toutes les 2 minutes
        
        if (used > 1200) { // Increased threshold to 1.2GB with optimization systems
            console.log(`❌ Memory limit exceeded: ${used}MB - restarting...`);
            setTimeout(() => process.exit(1), 5000);
        }
    } catch (error) {
        // Fallback to original logic if optimization manager fails
        if (used > 1000) {
            console.log(`❌ Memory limit exceeded: ${used}MB - restarting...`);
            setTimeout(() => process.exit(1), 5000);
        }
    }
}, 120_000) // check every 2 minutes

// Configuration via variables d'environnement
let phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || global.phoneNumber || "242061194809"
// FIX: l'ancienne ligne faisait `undefined + "@s.whatsapp.net"` → truthy → fallback jamais atteint
let owner = [(process.env.OWNER_NUMBER || '242065491040') + '@s.whatsapp.net']

global.botname = process.env.BOT_NAME || "wabot"
global.themeemoji = process.env.THEME_EMOJI || "•"

// WhatsApp connection helpers removed - moved to whatsapp-connection.js
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

// startXeonBotInc function removed - WhatsApp connection moved to whatsapp-connection.js

// All WhatsApp event handlers, message processing and connection logic moved to whatsapp-connection.js


// Import and start WhatsApp connection
startup('wabot', 'Démarrage de la connexion WhatsApp...')
require('./lib/whatsapp-connection.js');

// Start REST API server (port 3001 by default, configurable via API_PORT env)
const { startApiServer } = require('./api/server');
startApiServer();

// Start auto-updater (A/B deployment with rollback)
const autoUpdater = require('./lib/autoUpdater');
autoUpdater.start().catch(err => {
    console.error('[AutoUpdater] Failed to start:', err.message);
});

process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err)
    const code = err?.data || err?.output?.statusCode || ''
    error('Uncaught Exception', { error: msg, code, stack: err?.stack?.substring(0, 300) }, 'SYSTEM')
})

process.on('unhandledRejection', (err) => {
    const msg = err?.message || String(err)
    const code = err?.data || err?.output?.statusCode || ''
    // Les 429 WhatsApp sont gérés par le circuit-breaker — pas besoin de logger
    if (code === 429 || msg.includes('429')) return
    error('Unhandled Promise Rejection', { error: msg, code, stack: err?.stack?.substring(0, 300) }, 'SYSTEM')
})

process.on('SIGTERM', () => {
    system('Process', 'SIGTERM reçu — arrêt propre...')
    autoUpdater.stopPolling();
    process.exit(0);
});