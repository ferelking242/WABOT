/**
 * CompanionSessionManager - Système moderne de gestion de sessions multiples
 * Utilise Baileys directement pour les codes de jumelage (comme 1.example)
 * 
 * Fonctionnalités :
 * - Sessions isolées par utilisateur
 * - Support concurrent multi-utilisateur (2-4+ utilisateurs)
 * - Codes de jumelage (comme 1.example)
 * - Notifications claires et formatées
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    delay,
    jidNormalizedUser,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { rmSync } = require('fs');
const { db } = require('./database.js');
// Import buildMessageHandler localement pour éviter la dépendance circulaire

// ✅ NOUVEAU: Import des modules optimisés
const { ConnectionPoolManager } = require('./ConnectionPoolManager.js');
const { SessionStateManager } = require('./SessionStateManager.js');
const { CompanionCleanupManager } = require('./CompanionCleanupManager.js');

/**
 * Utility function to serialize errors safely for user display
 * Prevents '[object Object]' errors in messages
 */
function serializeError(error) {
    if (!error) return 'Unknown error occurred';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (typeof error === 'object') {
        try {
            return JSON.stringify(error, Object.getOwnPropertyNames(error));
        } catch {
            return error.toString();
        }
    }
    return String(error);
}

class CompanionSessionManager {
    constructor() {
        this.activeSessions = new Map();
        this.sessionCallbacks = new Map();
        this.creationInProgress = new Set(); // Contrôle de concurrence pour éviter les races
        this.processedMessages = new Map(); // Cache TTL pour éviter doubles réponses
        this.db = db; // Instance de base de données
        
        // ✅ NOUVEAU: Initialisation des modules optimisés
        this.poolManager = new ConnectionPoolManager();
        this.stateManager = new SessionStateManager();
        this.cleanupManager = new CompanionCleanupManager(this.db);
        
        // Étendre le cleanupManager avec nos méthodes
        this.cleanupManager.getCompanionConfigFromDB = this.getCompanionConfigFromDB.bind(this);
        this.cleanupManager.updateCompanionStatusInDB = this.updateCompanionStatusInDB.bind(this);
        
        // ✅ MAINTENIR la compatibilité avec le code existant
        this.connectionPool = this.poolManager.connectionPool; // Compatibilité
        this.sessionStates = this.poolManager.sessionStates; // Compatibilité
        this.conflictResolver = this.poolManager.conflictResolver; // Compatibilité
        this.maxConnectionsPerPhone = this.poolManager.maxConnectionsPerPhone; // Compatibilité
        this.connectionTimeout = this.poolManager.connectionTimeout; // Compatibilité
        
        console.log(chalk.blue('🤖 CompanionSessionManager initialized (Baileys direct) with Database persistence'));
        
        // Recharger les companions existants depuis la base de données
        this.loadExistingCompanions();
        
        // Nettoyer le cache des messages traités toutes les 30 secondes
        setInterval(() => {
            const now = Date.now();
            for (const [messageId, timestamp] of this.processedMessages.entries()) {
                if (now - timestamp > 30000) { // TTL de 30 secondes
                    this.processedMessages.delete(messageId);
                }
            }
        }, 30000);
    }

    /**
     * ✅ DELEGATE: Vérifier et résoudre les conflits de connexion pour un numéro de téléphone
     */
    async checkConnectionConflicts(phoneNumber, newSessionId) {
        return this.poolManager.checkConnectionConflicts(phoneNumber, newSessionId, this.activeSessions);
    }

    /**
     * ✅ DELEGATE: Mettre à jour l'état d'une session dans le pool
     */
    updateSessionState(sessionId, state, phoneNumber = null) {
        return this.poolManager.updateSessionState(sessionId, state, phoneNumber);
    }

    /**
     * ✅ DELEGATE: Nettoyer les entrées expirées du pool de connexions
     */
    cleanupConnectionPool() {
        return this.poolManager.cleanupConnectionPool();
    }

    /**
     * ✅ DELEGATE: Résoudre un conflit de session en cours
     */
    async resolveSessionConflict(phoneNumber, preferredSessionId = null) {
        return this.poolManager.resolveSessionConflict(phoneNumber, preferredSessionId, this.activeSessions, this.closeSession.bind(this));
    }

    /**
     * ✅ DELEGATE: Effectuer un nettoyage automatique complet
     */
    async performAutomaticCleanup() {
        return this.cleanupManager.performAutomaticCleanup();
    }

    /**
     * ✅ LEGACY: Ancienne méthode - remplacée par checkConnectionConflicts delegate
     * @deprecated
     */
    async checkConnectionConflictsOld(phoneNumber, newSessionId) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[POOL] Checking connection conflicts for phone ${cleanPhone}`));
        
        // Vérifier s'il y a déjà une connexion active pour ce numéro
        const existingConnection = this.connectionPool.get(cleanPhone);
        
        if (existingConnection && existingConnection.sessionId !== newSessionId) {
            console.log(chalk.yellow(`[POOL] ⚠️ Conflict detected for phone ${cleanPhone}: existing=${existingConnection.sessionId}, new=${newSessionId}`));
            
            // Vérifier si l'ancienne connexion est encore active
            const existingSession = this.activeSessions.get(existingConnection.sessionId);
            const existingState = this.sessionStates.get(existingConnection.sessionId);
            
            if (existingSession && existingState?.state === 'connected') {
                // Ancienne connexion encore active - fermer la nouvelle pour éviter le conflit
                console.log(chalk.red(`[POOL] Closing new session ${newSessionId} to prevent conflict with active ${existingConnection.sessionId}`));
                await this.closeSession(newSessionId);
                return { conflict: true, action: 'closed_new', activeSession: existingConnection.sessionId };
            } else {
                // Ancienne connexion inactive - la remplacer
                console.log(chalk.green(`[POOL] Replacing inactive session ${existingConnection.sessionId} with new ${newSessionId}`));
                if (existingSession) {
                    await this.closeSession(existingConnection.sessionId);
                }
                this.connectionPool.set(cleanPhone, {
                    sessionId: newSessionId,
                    lastActivity: Date.now(),
                    state: 'connecting'
                });
                return { conflict: false, action: 'replaced_inactive' };
            }
        } else {
            // Pas de conflit ou même session
            this.connectionPool.set(cleanPhone, {
                sessionId: newSessionId,
                lastActivity: Date.now(),
                state: 'connecting'
            });
            return { conflict: false, action: 'no_conflict' };
        }
    }

    // ✅ REMOVED: Méthodes dupliquées supprimées - utiliser les delegates ci-dessus

    // ✅ REMOVED: resolveSessionConflict également supprimée - utiliser le delegate ci-dessus

    /**
     * Sanitise le nom du companion pour éviter les attaques de traversée de chemin
     * SÉCURITÉ CRITIQUE : Empêche les utilisateurs malveillants de supprimer des fichiers arbitraires
     */
    sanitizeCompanionName(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('Companion name must be a non-empty string');
        }
        
        // Autoriser seulement les caractères alphanumériques, tirets et underscores
        const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '');
        
        if (sanitized.length === 0) {
            throw new Error('Companion name contains only invalid characters');
        }
        
        if (sanitized.length > 50) {
            throw new Error('Companion name too long (max 50 characters)');
        }
        
        return sanitized;
    }

    /**
     * Créer un sessionPath sécurisé (NOUVEAU : sans timestamp)
     */
    createSecureSessionPath(companionName) {
        const sanitizedName = this.sanitizeCompanionName(companionName);
        const sessionId = `companion-${sanitizedName}`;
        const sessionPath = path.resolve('./sessions', sessionId);
        
        // Vérifier que le chemin reste dans le dossier sessions
        const sessionsDir = path.resolve('./sessions');
        if (!sessionPath.startsWith(sessionsDir)) {
            throw new Error('Security violation: Invalid session path');
        }
        
        return { sessionId, sessionPath };
    }

    /**
     * Parser les sessionIds pour supporter les anciens et nouveaux formats
     * RÉTROCOMPATIBILITÉ : companion-name-timestamp et companion-name
     */
    parseSessionId(sessionIdOrPath) {
        const fs = require('fs');
        const path = require('path');
        
        const base = path.basename(String(sessionIdOrPath).replace(/[/]+$/, ''));
        const id = base.startsWith('companion-') ? base : `companion-${base}`;
        const parts = id.split('-');
        
        if (parts.length <= 2) {
            return { id, name: parts.slice(1).join('-'), timestamp: null };
        }
        
        const last = parts[parts.length - 1];
        const isTs = /^\d{13}$/.test(last);
        
        if (!isTs) {
            return { id, name: parts.slice(1).join('-'), timestamp: null };
        }
        
        const name = parts.slice(1, -1).join('-');
        return { id, name, timestamp: Number(last) };
    }

    /**
     * Trouver un sessionId par nom (support ancien et nouveau format)
     */
    findSessionByName(companionName, { includeInactive = true } = {}) {
        const fs = require('fs');
        const path = require('path');
        
        const sanitized = this.sanitizeCompanionName(companionName);
        const target = sanitized.toLowerCase();

        // 1) Sessions actives
        for (const sessionId of this.activeSessions.keys()) {
            const { name } = this.parseSessionId(sessionId);
            if (name && name.toLowerCase() === target) {
                return { type: 'active', sessionId, sessionPath: path.resolve('./sessions', sessionId) };
            }
        }

        if (!includeInactive) return null;

        // 2) Nouveau format de répertoire
        const newId = `companion-${sanitized}`;
        const newPath = path.resolve('./sessions', newId);
        if (fs.existsSync(newPath)) {
            return { type: 'inactive:new', sessionId: newId, sessionPath: newPath };
        }

        // 3) Anciens formats (prendre le timestamp le plus récent)
        const prefix = `companion-${sanitized}-`;
        let latest = null;
        
        if (fs.existsSync('./sessions')) {
            for (const entry of fs.readdirSync('./sessions', { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                const name = entry.name;
                if (!name.startsWith(prefix)) continue;
                
                const parsed = this.parseSessionId(name);
                if (parsed.timestamp && (!latest || parsed.timestamp > latest.timestamp)) {
                    latest = {
                        type: 'inactive:legacy',
                        sessionId: parsed.id,
                        sessionPath: path.resolve('./sessions', name),
                        timestamp: parsed.timestamp
                    };
                }
            }
        }
        
        return latest; // peut être null
    }

    /**
     * Crée une nouvelle session companion avec code de jumelage OU QR code
     */
    async createCompanionSession(phoneNumber, companionName, callback, useQR = false, requesterJid = null) {
        try {
            // ✅ NOUVEAU: Vérifier les conflits de connexion AVANT la création
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const { sessionId, sessionPath } = this.createSecureSessionPath(companionName);
            
            console.log(chalk.cyan(`[POOL] Checking conflicts before creating session for ${companionName} (${cleanPhone})`));
            const conflictCheck = await this.poolManager.checkConnectionConflicts(cleanPhone, sessionId, this.activeSessions);
            
            if (conflictCheck.conflict) {
                console.log(chalk.red(`[POOL] ❌ Session creation blocked due to conflict`));
                if (callback) {
                    callback({
                        success: false,
                        error: `Another companion session is already active for this phone number. Active session: ${conflictCheck.activeSession}`,
                        companionName: companionName,
                        conflictingSession: conflictCheck.activeSession
                    });
                }
                return;
            }
            
            console.log(chalk.green(`[POOL] ✅ No conflicts detected, proceeding with creation`));
            
            // ✅ NOUVEAU: Vérifier la limite de connexions avec le nouveau module
            const connectionLimit = this.poolManager.checkConnectionLimit(cleanPhone);
            
            if (connectionLimit.limitReached) {
                console.log(chalk.red(`[POOL] ❌ Maximum connections reached for phone ${cleanPhone}: ${connectionLimit.current}/${connectionLimit.limit}`));
                if (callback) {
                    callback({
                        success: false,
                        error: `Maximum connections limit reached for this phone number (${connectionLimit.current}/${connectionLimit.limit}). Please close an existing companion first.`,
                        companionName: companionName,
                        maxConnectionsReached: true
                    });
                }
                return;
            }
            
            // Contrôle de concurrence : vérifier si une création est déjà en cours pour ce nom
            const creationKey = `${companionName}-${phoneNumber}`;
            if (this.creationInProgress.has(creationKey)) {
                console.log(chalk.yellow(`⚠️ Companion creation already in progress for ${creationKey}`));
                if (callback) {
                    callback({
                        success: false,
                        error: `A companion creation is already in progress for ${companionName}. Please wait.`,
                        companionName: companionName
                    });
                }
                return { success: false, error: 'Creation already in progress' };
            }
            
            // Marquer comme en cours de création
            this.creationInProgress.add(creationKey);
            
            try {
                // Vérifier la limite STRICTE de 2 compagnons maximum
                const activeCompanions = this.getActiveSessions();
                if (activeCompanions.length >= 2) {
                    console.log(chalk.yellow(`⚠️ Maximum companion limit reached: ${activeCompanions.length}/2 companions active`));
                    
                    if (callback) {
                        callback({
                            success: false,
                            error: `Maximum limit of 2 companions reached (${activeCompanions.length}/2 active). Please close an existing companion first using .companion close [name]`,
                            companionName: companionName
                        });
                    }
                    return { success: false, error: 'Maximum companion limit reached' };
                }
                
                // Vérifier s'il y a déjà une session active pour ce numéro
                const existingSession = await this.findSessionByPhone(phoneNumber);
                if (existingSession.found) {
                    console.log(chalk.yellow(`⚠️ Session already exists for phone ${phoneNumber}: ${existingSession.companionName} (source: ${existingSession.source})`));
                    
                    if (callback) {
                        callback({
                            success: false,
                            error: `A companion already exists for phone ${phoneNumber}. Use .companion close ${existingSession.companionName} first.`,
                            companionName: companionName
                        });
                    }
                    return { success: false, error: 'Session already exists' };
                }
            
            // NOUVEAU : Vérification robuste des doublons avec gestion des états orphelins
            const existingCompanion = await this.getCompanionConfigFromDB(companionName);
            if (existingCompanion) {
                console.log(chalk.yellow(`⚠️ Companion with name '${companionName}' already exists`));
                
                // Vérifier si c'est un companion orphelin (bloqué en "initializing" depuis trop longtemps)
                const createdAt = new Date(existingCompanion.created_at);
                const ageInMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
                const isOrphaned = existingCompanion.status === 'initializing' && ageInMinutes > 10; // Plus de 10 minutes
                
                if (isOrphaned) {
                    console.log(chalk.yellow(`🧹 Detected orphaned companion '${companionName}' (${ageInMinutes.toFixed(1)} minutes old), cleaning up...`));
                    
                    // Nettoyer le companion orphelin
                    await this.cleanupOrphanedCompanion(existingCompanion.user_id);
                    console.log(chalk.green(`✅ Orphaned companion cleaned up, proceeding with creation...`));
                } else {
                    // Companion valide existant, refuser la création
                    const errorMessage = existingCompanion.status === 'initializing' 
                        ? `Un companion avec le nom '${companionName}' est en cours de création.\nVeuillez attendre ou utiliser un nom différent.`
                        : `Un companion avec le nom '${companionName}' existe déjà.\nChoisis un nom différent ou utilise .companion list pour voir tous les companions.`;
                    
                    if (callback) {
                        callback({
                            success: false,
                            error: errorMessage,
                            companionName: companionName
                        });
                    }
                    return { success: false, error: 'Companion name already exists' };
                }
            }
            const { sessionId, sessionPath } = this.createSecureSessionPath(companionName);
            
            console.log(chalk.yellow(`📱 Creating companion session: ${sessionId}`));
            console.log(chalk.cyan(`📞 Phone: ${phoneNumber} | Name: ${companionName}`));

                // Stocker le callback pour cette session
                this.sessionCallbacks.set(sessionId, callback);

                // ✅ FIXED: Don't save to DB yet - wait for successful connection
                const ownerJid = requesterJid || `${phoneNumber}@s.whatsapp.net`; // Fallback en cas d'absence
                
                // Store companion info temporarily for later DB save after successful connection  
                const tempCompanionInfo = {
                    sessionId,
                    phoneNumber,
                    companionName,
                    ownerJid: ownerJid // ✅ FIXED: Use fallback ownerJid instead of just requesterJid
                };
                
                // Store temp info for access during connection success
                this.tempCompanionInfo = this.tempCompanionInfo || new Map();
                this.tempCompanionInfo.set(sessionId, tempCompanionInfo);
                
                console.log(chalk.cyan(`[DATABASE] Companion creation started - will save to DB only after successful connection`));

                // Créer le bot companion (copie de 1.example)
                await this.startCompanionBot(sessionPath, phoneNumber, companionName, sessionId, callback, useQR);

                return {
                    success: true,
                    sessionId: sessionId,
                    sessionPath: sessionPath,
                    companionName: companionName
                };

            } catch (innerError) {
                console.error(chalk.red(`❌ Error creating companion session: ${innerError.message}`));
                
                // Note: No longer need to clean up pendingCompanions as we save immediately to DB
                
                // Clean up session directory and temp info if creation failed
                try {
                    if (typeof sessionPath !== 'undefined' && fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        console.log(chalk.yellow(`🧹 Cleaned up failed session directory: ${sessionPath}`));
                    }
                    // Clean up temporary companion info
                    if (this.tempCompanionInfo && typeof sessionId !== 'undefined') {
                        this.tempCompanionInfo.delete(sessionId);
                        console.log(chalk.yellow(`🧹 Cleaned up temporary companion info: ${sessionId}`));
                    }
                } catch (cleanupError) {
                    console.error(chalk.red(`Warning: Could not cleanup session directory: ${serializeError(cleanupError)}`));
                }
                
                if (callback) {
                    callback({
                        success: false,
                        error: serializeError(innerError),
                        companionName: companionName
                    });
                }
                
                throw innerError;
            } finally {
                // Toujours nettoyer le flag de création en cours
                this.creationInProgress.delete(creationKey);
            }

        } catch (error) {
            console.error(chalk.red(`❌ Error in createCompanionSession: ${error.message}`));
            
            if (callback) {
                callback({
                    success: false,
                    error: serializeError(error),
                    companionName: companionName
                });
            }
            
            // Nettoyer en cas d'erreur
            const creationKey = `${companionName}-${phoneNumber}`;
            this.creationInProgress.delete(creationKey);
            
            throw error;
        }
    }

    /**
     * Démarre un bot companion avec choix code/QR
     */
    async startCompanionBot(sessionPath, phoneNumber, companionName, sessionId, callback, useQR = false, isRestore = false) {
        try {
            // Configuration identique à 1.example
            // SÉCURITÉ : Nettoyer seulement si c'est une nouvelle création, pas une restauration
            const fs = require('fs');
            if (!isRestore && fs.existsSync(sessionPath)) {
                console.log(chalk.yellow(`[DEBUG] Cleaning existing session: ${sessionPath}`));
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(chalk.green(`[DEBUG] Session cleaned - fresh start`));
            } else if (isRestore) {
                console.log(chalk.blue(`[DEBUG] Restoring existing session: ${sessionPath}`));
            }
            
            // Négociation de version pour éviter les 408 dus au drift de protocole
            const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
            const { version } = await fetchLatestBaileysVersion();
            console.log(chalk.blue(`[DEBUG] Using Baileys version: ${version.join('.')}`));
            
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
            
            const XeonBotInc = makeWASocket({
                version,  // Utiliser la version négociée
                logger: require('pino')({ level: 'silent' }),
                printQRInTerminal: useQR, // QR dans terminal si demandé
                mobile: false,
                auth: {
                    creds: state.creds,
                    // CRITICAL SECURITY: Use makeCacheableSignalKeyStore with silent logger to prevent private keys from being exposed in logs
                    keys: makeCacheableSignalKeyStore(state.keys, require('pino')({ level: 'silent' }).child({ level: 'silent' })),
                },
                // Configuration navigateur optimisée pour pairing code 2024-2025
                browser: ["Ubuntu", "Chrome", "124.0.0.0"],
                // Optimisations réseau selon solutions récentes
                markOnlineOnConnect: false,  // Évite problèmes de notification
                generateHighQualityLinkPreview: false,  // Réduit la charge
                syncFullHistory: false,  // Performance améliorée
                shouldSyncHistoryMessage: () => false,  // Pas de sync historique
                emitOwnEvents: false,  // Réduit les événements
                // TIMEOUTS OPTIMISÉS POUR ERREUR 408 - Version 2024
                connectTimeoutMs: 120000,        // 2 minutes
                defaultQueryTimeoutMs: 60000,    // 1 minute pour queries
                retryRequestDelayMs: 3000,      // 3s entre retries (augmenté)
                maxMsgRetryCount: 3,            // Max 3 retries
                keepAliveIntervalMs: 30000,     // Keep alive 30s
                // Optimisations getMessage
                getMessage: async (key) => {
                    return {
                        conversation: "Hi"
                    }
                },
                msgRetryCounterCache: new (require('node-cache'))(),
                // Désactiver agent/proxy si utilisé
                agent: undefined,
                fetchAgent: undefined,
            })
            
            // Set public flag to allow processing of all incoming messages
            XeonBotInc.public = true;

            // Stocker la session
            this.activeSessions.set(sessionId, XeonBotInc);

            // Gestion authentification : code de jumelage OU QR code
            console.log(chalk.blue(`[DEBUG] Auth state for ${companionName}:`));
            console.log(chalk.blue(`[DEBUG] - registered: ${XeonBotInc.authState.creds.registered}`));
            console.log(chalk.blue(`[DEBUG] - me: ${XeonBotInc.authState.creds.me?.id || 'none'}`));
            
            if (!XeonBotInc.authState.creds.registered) {
                console.log(chalk.yellow(`[DEBUG] ${companionName} needs authentication`));
                
                if (useQR) {
                    // Mode QR Code
                    console.log(chalk.magenta(`📱 Generating QR code for ${companionName}`));
                    
                    XeonBotInc.ev.on('connection.update', async (update) => {
                        const { qr } = update;
                        if (qr) {
                            console.log(chalk.green('QR Code generated for', companionName));
                            
                            // Générer l'image QR avec qrcode
                            const QRCode = require('qrcode');
                            try {
                                const qrImageBuffer = await QRCode.toBuffer(qr, {
                                    scale: 8,
                                    margin: 2,
                                    color: {
                                        dark: '#000000',
                                        light: '#FFFFFF'
                                    }
                                });
                                
                                // Callback avec QR code
                                if (callback) {
                                    callback({
                                        success: true,
                                        qrCode: qrImageBuffer,
                                        companionName: companionName,
                                        sessionId: sessionId,
                                        sessionPath: sessionPath,
                                        mode: 'qr'
                                    });
                                }
                                
                            } catch (error) {
                                console.error('QR generation error:', error);
                                if (callback) {
                                    callback({
                                        success: false,
                                        error: serializeError(error),
                                        companionName: companionName,
                                        sessionId: sessionId
                                    });
                                }
                            }
                        }
                    });
                    
                } else {
                    // Mode Code de jumelage (par défaut)
                    console.log(chalk.magenta(`🔑 Requesting pairing code for ${companionName}`));
                    console.log(chalk.blue(`[DEBUG] Raw phone: ${phoneNumber}`));
                    
                    // Nettoyer le numéro de téléphone
                    phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
                    console.log(chalk.blue(`[DEBUG] Cleaned phone: ${phoneNumber}`));

                    // Valider le numéro avec awesome-phonenumber
                    const pn = require('awesome-phonenumber');
                    const phoneValid = pn('+' + phoneNumber).isValid();
                    console.log(chalk.blue(`[DEBUG] Phone validation: ${phoneValid}`));
                    
                    if (!phoneValid) {
                        throw new Error('Invalid phone number format');
                    }

                    // Séquence pairing code optimisée 2024-2025 avec régénération automatique
                    setTimeout(async () => {
                        const maxRetries = 10; // Increased from 3 to match regeneration spec
                        let currentAttempt = 0;
                        
                        while (currentAttempt < maxRetries) {
                            currentAttempt++;
                            try {
                                console.log(chalk.blue(`[DEBUG] 🔐 PAIRING CODE REQUEST INITIATED (Attempt ${currentAttempt}/${maxRetries})`));
                                console.log(chalk.blue(`[DEBUG] Target phone: +${phoneNumber}`));
                                console.log(chalk.blue(`[DEBUG] Companion name: ${companionName}`));
                                console.log(chalk.blue(`[DEBUG] Request timestamp: ${new Date().toISOString()}`));
                                console.log(chalk.blue(`[DEBUG] Enhanced sequence - 2024 fix`));
                                
                                const requestStartTime = Date.now();
                                // Utiliser Promise.race pour timeout manuel
                                let code = await Promise.race([
                                    XeonBotInc.requestPairingCode(phoneNumber),
                                    new Promise((_, reject) => 
                                        setTimeout(() => reject(new Error('Pairing code timeout after 60s')), 60000)
                                    )
                                ]);
                                const requestDuration = Date.now() - requestStartTime;
                                
                                code = code?.match(/.{1,4}/g)?.join("-") || code
                                
                                // Log sécurisé pour production - Gate stricté
                                const isDebug = process.env.NODE_ENV !== 'production' && process.env.LOG_SENSITIVE === 'true';
                                if (isDebug) {
                                    console.log(chalk.black(chalk.bgGreen(`🔑 PAIRING CODE GENERATED FOR ${companionName.toUpperCase()}: `)), chalk.black(chalk.white(code)));
                                } else {
                                    console.log(chalk.green(`🔑 Pairing code generated for ${companionName} (length: ${code.length})`));
                                }
                                console.log(chalk.blue(`[DEBUG] Request completed in ${requestDuration}ms (Attempt ${currentAttempt})`));
                                // Logs sécurisés pour production
                                if (isDebug) {
                                    console.log(chalk.blue(`[DEBUG] Code format: ${code}`));
                                    console.log(chalk.blue(`[DEBUG] Code length: ${code.length} characters`));
                                } else {
                                    console.log(chalk.blue(`[DEBUG] Code generated successfully (${code.length} chars)`));
                                }
                                
                                console.log(chalk.green(`[DEBUG] 📱 NOTIFICATION SHOULD APPEAR ON WHATSAPP NOW!`));
                                console.log(chalk.magenta(`[DEBUG] ⏰ Notification should arrive within 30 seconds`));
                                console.log(chalk.cyan(`[DEBUG] 🔍 TROUBLESHOOTING IF NO NOTIFICATION:`));
                                console.log(chalk.cyan(`[DEBUG] 1. ✅ Verify phone +${phoneNumber} is correct`));
                                console.log(chalk.cyan(`[DEBUG] 2. ✅ Check WhatsApp app is installed and updated`));
                                console.log(chalk.cyan(`[DEBUG] 3. ✅ Ensure device has stable internet connection`));
                                console.log(chalk.cyan(`[DEBUG] 4. ✅ Check WhatsApp notifications are enabled in device settings`));
                                console.log(chalk.cyan(`[DEBUG] 5. ✅ Try closing and reopening WhatsApp app`));
                                console.log(chalk.cyan(`[DEBUG] 6. ✅ Check if device is in Do Not Disturb mode`));
                                console.log(chalk.cyan(`[DEBUG] 7. ✅ Verify device time/timezone is correct`));
                                console.log(chalk.cyan(`[DEBUG] 8. ✅ Try airplane mode ON/OFF to refresh connection`));
                                console.log(chalk.yellow(`[DEBUG] ⏳ Waiting for user to enter code in WhatsApp...`));
                                
                                // Callback avec le code généré
                                if (callback) {
                                    callback({
                                        success: true,
                                        code: code,
                                        companionName: companionName,
                                        sessionId: sessionId,
                                        sessionPath: sessionPath,
                                        mode: 'pairing',
                                        attempt: currentAttempt
                                    });
                                }
                                
                                // Ne pas sortir de la boucle - continuer à générer des codes jusqu'à connexion
                                console.log(chalk.yellow(`[DEBUG] ⏳ Waiting for user to complete pairing or code expiration...`));
                                
                                // Attendre avant la prochaine tentative (le code expire naturellement)
                                const renewalInterval = process.env.PAIRING_RENEW_INTERVAL_MS || 600000; // 10 minutes par défaut
                                await new Promise(resolve => setTimeout(resolve, renewalInterval));
                                
                                // Vérifier si l'utilisateur a completé le jumelage (vraie condition de succès)
                                if (XeonBotInc.authState.creds.registered) {
                                    console.log(chalk.green(`[DEBUG] ✅ User has completed pairing for ${companionName} - stopping code regeneration`));
                                    return; // Sortir de la boucle car l'utilisateur s'est connecté
                                }
                                
                                console.log(chalk.blue(`[DEBUG] 🔄 Code may have expired, generating new one...`));
                                
                            } catch (error) {
                                console.error(`Error requesting pairing code (attempt ${currentAttempt}):`, error);
                                console.log(chalk.red(`[DEBUG] Pairing code error: ${error.message}`));
                                
                                if (currentAttempt === maxRetries) {
                                    // Dernière tentative échouée
                                    if (callback) {
                                        callback({
                                            success: false,
                                            error: `Pairing code failed after ${maxRetries} attempts: ${serializeError(error)}`,
                                            companionName: companionName,
                                            sessionId: sessionId
                                        });
                                    }
                                } else {
                                    // Attendre avant retry avec backoff exponentiel
                                    const waitTime = currentAttempt * 5000; // 5s, 10s, 15s
                                    console.log(chalk.yellow(`[DEBUG] Retrying in ${waitTime/1000}s...`));
                                    await new Promise(resolve => setTimeout(resolve, waitTime));
                                }
                            }
                        }
                    }, 3000)
                }
            }

            // Gestionnaire de connexion avec debug étendu
            XeonBotInc.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = s
                
                console.log(chalk.blue(`[DEBUG] Connection update for ${companionName}:`));
                console.log(chalk.blue(`[DEBUG] - connection: ${connection}`));
                console.log(chalk.blue(`[DEBUG] - isNewLogin: ${isNewLogin}`));
                console.log(chalk.blue(`[DEBUG] - receivedPendingNotifications: ${receivedPendingNotifications}`));
                console.log(chalk.blue(`[DEBUG] - qr present: ${!!qr}`));
                console.log(chalk.blue(`[DEBUG] - lastDisconnect: ${lastDisconnect?.error?.message || 'none'}`));
                
                if (connection === "connecting") {
                    console.log(chalk.yellow(`[DEBUG] ${companionName} is connecting...`));
                    // ✅ NOUVEAU: Mettre à jour l'état dans le pool avec le nouveau module
                    this.poolManager.updateSessionState(sessionId, 'connecting', phoneNumber);
                }
                
                if (connection === "open") {
                    console.log(chalk.green(`✅ Companion ${companionName} connected!`))
                    console.log(chalk.blue(`[DEBUG] User info: ${JSON.stringify(XeonBotInc.user, null, 2)}`));
                    
                    // ✅ NOUVEAU: Mettre à jour l'état dans le pool ET la session en mémoire
                    this.poolManager.updateSessionState(sessionId, 'connected', phoneNumber);
                    const session = this.activeSessions.get(sessionId);
                    if (session) {
                        session.state = 'open';
                        session.lastConnected = Date.now();
                        console.log(chalk.green(`[DEBUG] Session ${sessionId} marked as 'open'`));
                    }
                    
                    // Réinitialiser les tentatives de redemarrage sur succès
                    if (this.restartAttempts) {
                        this.restartAttempts.set(sessionId, 0);
                        console.log(chalk.green(`[DEBUG] Reset restart attempts for ${companionName}`));
                    }
                    
                    // ✅ FIXED: Save companion to DB for the first time on successful connection
                    try {
                        // Check if this is a new companion creation or existing one
                        const tempInfo = this.tempCompanionInfo?.get(sessionId);
                        if (tempInfo) {
                            // New companion - save to DB for the first time with 'connected' status
                            console.log(chalk.cyan(`[DATABASE] Saving new companion ${companionName} to DB with 'connected' status...`));
                            await this.saveCompanionToDB(tempInfo.sessionId, tempInfo.phoneNumber, tempInfo.companionName, tempInfo.ownerJid, null, 'connected');
                            // Clean up temp info after successful save
                            this.tempCompanionInfo.delete(sessionId);
                            console.log(chalk.green(`[DATABASE] ✅ New companion ${companionName} saved successfully to DB`));
                        } else {
                            // Existing companion - just update status
                            await this.updateCompanionStatusInDB(sessionId, 'connected');
                        }
                        console.log(chalk.green(`💾 Companion ${companionName} status updated to 'connected' in database`));
                    } catch (dbError) {
                        console.error(chalk.red(`❌ Failed to update companion status in DB: ${serializeError(dbError)}`));
                        // Continue execution - connection is established even if DB update fails
                    }
                    
                    // Notifier la connexion réussie
                    if (callback) {
                        callback({
                            success: true,
                            connected: true,
                            companionName: companionName,
                            user: XeonBotInc.user,
                            sessionId: sessionId
                        });
                    }
                }
                
                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode
                    const errorMessage = lastDisconnect?.error?.message || '';
                    console.log(chalk.red(`[DEBUG] Connection closed for ${companionName}, status: ${statusCode}`));
                    console.log(chalk.red(`[DEBUG] Error: ${errorMessage}`));
                    
                    // ✅ NOUVEAU: Mettre à jour l'état dans le pool ET marquer la session en mémoire
                    this.poolManager.updateSessionState(sessionId, 'disconnected', phoneNumber);
                    const session = this.activeSessions.get(sessionId);
                    if (session) {
                        session.state = 'closed';
                        session.lastDisconnected = Date.now();
                        console.log(chalk.red(`[DEBUG] Session ${sessionId} marked as 'closed'`));
                    }
                    
                    // ✅ NOUVEAU: Vérifier s'il y a des conflits à résoudre après cette déconnexion
                    if (errorMessage.includes('Stream Errored') && errorMessage.includes('conflict')) {
                        console.log(chalk.yellow(`[POOL] Detected stream conflict error, attempting resolution...`));
                        setTimeout(async () => {
                            await this.poolManager.resolveSessionConflict(phoneNumber, null, this.activeSessions, this.closeSession.bind(this));
                        }, 2000); // Attendre 2s avant de résoudre le conflit
                    }
                    
                    // PRIORITÉ: Gérer l'expiration du code de pairing avec régénération automatique robuste
                    if (errorMessage.includes('QR refs attempts ended')) {
                        console.log(chalk.yellow(`[DEBUG] Pairing code expired for ${companionName} - starting automatic regeneration cycle`));
                        
                        // Initialiser le compteur de régénération si nécessaire
                        if (!this.pairingCodeAttempts) this.pairingCodeAttempts = new Map();
                        if (!this.regenerationInProgress) this.regenerationInProgress = new Map();
                        
                        // Protection contre la concurrence - éviter les régénérations multiples
                        if (this.regenerationInProgress.get(sessionId)) {
                            console.log(chalk.yellow(`[DEBUG] Regeneration already in progress for ${companionName}, ignoring duplicate QR expiry`));
                            return;
                        }
                        
                        const codeAttempts = this.pairingCodeAttempts.get(sessionId) || 0;
                        
                        if (codeAttempts < 10) {
                            // Marquer la régénération comme en cours
                            this.regenerationInProgress.set(sessionId, true);
                            this.pairingCodeAttempts.set(sessionId, codeAttempts + 1);
                            const remainingAttempts = 10 - (codeAttempts + 1);
                            
                            console.log(chalk.cyan(`[DEBUG] Auto-regenerating pairing code attempt ${codeAttempts + 1}/10 for ${companionName} (${remainingAttempts} remaining)`));
                            
                            // Informer l'utilisateur de la régénération
                            if (callback) {
                                callback({
                                    success: true,
                                    mode: 'regenerating',
                                    message: `Pairing code expired. Generating new code automatically... (attempt ${codeAttempts + 1}/10)`,
                                    companionName: companionName,
                                    sessionId: sessionId,
                                    attempt: codeAttempts + 1,
                                    remainingAttempts: remainingAttempts
                                });
                            }
                            
                            // Nettoyer la session expirée
                            this.activeSessions.delete(sessionId);
                            
                            // Backoff exponentiel vrai avec jitter : 5s, 10s, 20s, 40s... (capped at 30s)
                            const baseDelay = 5000; // 5 seconds base
                            const exponentialDelay = Math.min(baseDelay * Math.pow(2, codeAttempts - 1), 30000); // True exponential with cap
                            const jitter = exponentialDelay * (0.5 + Math.random() * 0.5); // 50%-100% of delay as jitter
                            const backoffDelay = exponentialDelay + jitter;
                            
                            console.log(chalk.blue(`[DEBUG] Waiting ${Math.round(backoffDelay/1000)}s before regeneration (exponential backoff + jitter)`));
                            
                            // Attendre avec backoff puis régénérer
                            setTimeout(async () => {
                                try {
                                    console.log(chalk.magenta(`[DEBUG] 🔄 Auto-generating new pairing code for ${companionName} (${codeAttempts + 1}/10)...`));
                                    
                                    // NETTOYER la session expirée (pas authentifiée) 
                                    const fs = require('fs');
                                    if (fs.existsSync(sessionPath)) {
                                        console.log(chalk.yellow(`[DEBUG] Cleaning expired session: ${sessionPath}`));
                                        fs.rmSync(sessionPath, { recursive: true, force: true });
                                        console.log(chalk.green(`[DEBUG] Expired session cleaned`));
                                    }
                                    
                                    // Régénérer le code de pairing en redémarrant le processus d'auth
                                    await this.startCompanionBot(sessionPath, phoneNumber, companionName, sessionId, callback, useQR);
                                    
                                } catch (regenerateError) {
                                    console.error(chalk.red(`[DEBUG] Failed to regenerate pairing code for ${companionName}:`, regenerateError.message));
                                    
                                    // Si la régénération échoue, cleanup complet des ressources
                                    await this.performCompleteCleanup(sessionId, sessionPath, companionName, 'regeneration_failed');
                                    
                                    if (callback) {
                                        callback({
                                            success: false,
                                            mode: 'regeneration_failed',
                                            error: `Failed to regenerate pairing code after expiration (attempt ${codeAttempts + 1}): ${regenerateError.message}`,
                                            companionName: companionName,
                                            sessionId: sessionId
                                        });
                                    }
                                }
                            }, backoffDelay);
                            
                            return; // Ne pas continuer avec les autres vérifications
                        } else {
                            console.log(chalk.red(`[DEBUG] Max pairing code regeneration attempts reached for ${companionName} (10/10)`));
                            console.log(chalk.red(`[DEBUG] Companion creation failed - user should try again later`));
                            this.pairingCodeAttempts.delete(sessionId);
                            
                            // Informer l'utilisateur que la limite est atteinte
                            if (callback) {
                                callback({
                                    success: false,
                                    error: `Pairing code regeneration limit exceeded (10 attempts). The companion creation process has been stopped. Please try creating the companion again in a few minutes.`,
                                    companionName: companionName,
                                    sessionId: sessionId,
                                    maxAttemptsReached: true
                                });
                            }
                        }
                    }
                    
                    // Gérer les codes d'erreur normaux après pairing (SAUF QR refs attempts ended qui est traité ci-dessus)
                    else if (statusCode === 515 || statusCode === DisconnectReason.restartRequired || statusCode === 408 || 
                        errorMessage.includes('Stream Errored') || errorMessage.includes('restart required') || 
                        errorMessage.includes('Connection terminated')) {
                        console.log(chalk.green(`[DEBUG] Normal restart required for ${companionName} after pairing - this is expected behavior`));
                        
                        // Éviter les redémarrages infinis - max 3 tentatives
                        if (!this.restartAttempts) this.restartAttempts = new Map();
                        const attempts = this.restartAttempts.get(sessionId) || 0;
                        
                        if (attempts < 3) {
                            this.restartAttempts.set(sessionId, attempts + 1);
                            console.log(chalk.cyan(`[DEBUG] Restart attempt ${attempts + 1}/3 for ${companionName}`));
                            
                            // Attendre 3 secondes puis redémarrer (plus long pour stabilité)
                            setTimeout(async () => {
                                try {
                                    console.log(chalk.yellow(`[DEBUG] Restarting companion ${companionName} after authentication...`));
                                    
                                    // Nettoyer la session courante SANS supprimer les fichiers auth
                                    this.activeSessions.delete(sessionId);
                                    
                                    // PRÉSERVER les credentials authentifiés - NE PAS SUPPRIMER sessionPath
                                    console.log(chalk.green(`[DEBUG] Preserving authenticated credentials for ${companionName}`));
                                    
                                    // Charger l'état authentifié existant
                                    const { state: authState, saveCreds: newSaveCreds } = await useMultiFileAuthState(sessionPath);
                                    
                                    // Vérifier si l'authentification est complète
                                    if (authState.creds.registered) {
                                        console.log(chalk.green(`[DEBUG] Authentication completed for ${companionName}, starting authenticated session...`));
                                        
                                        // Démarrer avec les credentials authentifiés PRÉSERVÉS
                                        await this.startAuthenticatedBot(sessionPath, companionName, sessionId, callback, authState, newSaveCreds);
                                    } else {
                                        console.log(chalk.yellow(`[DEBUG] Authentication still pending for ${companionName}, cleaning and restarting auth process...`));
                                        
                                        // SEULEMENT maintenant supprimer si pas authentifié
                                        const fs = require('fs');
                                        if (fs.existsSync(sessionPath)) {
                                            console.log(chalk.yellow(`[DEBUG] Cleaning incomplete session: ${sessionPath}`));
                                            fs.rmSync(sessionPath, { recursive: true, force: true });
                                            console.log(chalk.green(`[DEBUG] Incomplete session cleaned`));
                                        }
                                        
                                        // Redémarrer le processus d'auth
                                        await this.startCompanionBot(sessionPath, phoneNumber, companionName, sessionId, callback, useQR);
                                    }
                                    
                                    console.log(chalk.green(`[DEBUG] Companion ${companionName} restarted successfully!`));
                                    
                                } catch (restartError) {
                                    console.error(chalk.red(`[DEBUG] Failed to restart ${companionName}:`, restartError.message));
                                    
                                    // Si le redémarrage échoue, nettoyer
                                    this.activeSessions.delete(sessionId);
                                    this.sessionCallbacks.delete(sessionId);
                                    this.restartAttempts?.delete(sessionId);
                                }
                            }, 3000);
                            
                            return; // Ne pas nettoyer tout de suite
                        } else {
                            console.log(chalk.red(`[DEBUG] Max restart attempts reached for ${companionName}`));
                            this.restartAttempts.delete(sessionId);
                        }
                    }
                    
                    // Gérer logout normal ou autres erreurs
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        try {
                            rmSync(sessionPath, { recursive: true, force: true })
                            console.log(chalk.red(`[DEBUG] Session files deleted for ${companionName}`));
                        } catch (err) {
                            console.log(chalk.red(`[DEBUG] Error deleting session files: ${err.message}`));
                        }
                        console.log(chalk.red(`Session ${companionName} logged out`))
                    }
                    
                    // Nettoyer la session fermée (sauf si redémarrage en cours)
                    this.activeSessions.delete(sessionId);
                    this.sessionCallbacks.delete(sessionId);
                }
            })

            // Sauvegarder les credentials avec debug (API Baileys correcte)
            XeonBotInc.ev.on('creds.update', saveCreds);

            // Ajout d'events de debug supplémentaires pour traquer l'authentification
            XeonBotInc.ev.on('CB:call', (data) => {
                console.log(chalk.magenta(`[DEBUG] Call event for ${companionName}: ${JSON.stringify(data)}`));
            });

            XeonBotInc.ev.on('CB:receipt', (data) => {
                console.log(chalk.magenta(`[DEBUG] Receipt event for ${companionName}: ${JSON.stringify(data)}`));
            });

            XeonBotInc.ev.on('CB:ib,,dirty', (data) => {
                console.log(chalk.magenta(`[DEBUG] Dirty event for ${companionName}: ${JSON.stringify(data)}`));
            });

            XeonBotInc.ev.on('CB:success', (data) => {
                console.log(chalk.green(`[DEBUG] Success event for ${companionName}: ${JSON.stringify(data)}`));
            });

            XeonBotInc.ev.on('CB:failure', (data) => {
                console.log(chalk.red(`[DEBUG] Failure event for ${companionName}: ${JSON.stringify(data)}`));
            });

            // Traquer les changements d'état d'auth
            let lastAuthState = XeonBotInc.authState.creds.registered;
            const authChecker = setInterval(() => {
                const currentAuthState = XeonBotInc.authState.creds.registered;
                if (currentAuthState !== lastAuthState) {
                    console.log(chalk.cyan(`[DEBUG] Auth state changed for ${companionName}: ${lastAuthState} -> ${currentAuthState}`));
                    lastAuthState = currentAuthState;
                }
            }, 1000);

            // Cleaner l'interval quand la session se ferme
            setTimeout(() => clearInterval(authChecker), 60000); // Stop après 1 minute

            // Gestionnaire de messages spécialisé pour compagnons avec déduplication et isolation
            XeonBotInc.ev.on('messages.upsert', async (chatUpdate) => {
                try {
                    const mek = chatUpdate.messages[0]
                    if (!mek.message) return
                    mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
                    if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
                    if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
                    if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                    // DÉDUPLICATION : Vérifier si ce message a déjà été traité
                    const messageId = `${mek.key.remoteJid}:${mek.key.id}:${mek.key.fromMe}`;
                    if (this.processedMessages.has(messageId)) {
                        console.log(chalk.gray(`[COMPANION ${companionName}] Message ${messageId} already processed, skipping`));
                        return;
                    }
                    
                    // Marquer ce message comme traité
                    this.processedMessages.set(messageId, Date.now());

                    // Clear message retry cache to prevent memory bloat
                    if (XeonBotInc?.msgRetryCounterCache) {
                        XeonBotInc.msgRetryCounterCache.clear()
                    }

                    // Gestionnaire spécialisé pour compagnons avec isolation complète
                    await this.handleCompanionMessages(XeonBotInc, chatUpdate, companionName)
                } catch (error) {
                    console.error(`[DEBUG] Message error in companion ${companionName}:`, error);
                }
            });

            return XeonBotInc;

        } catch (error) {
            console.error(chalk.red(`❌ Error starting companion bot: ${error.message}`));
            throw error;
        }
    }

    /**
     * Obtient toutes les sessions actives
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.keys());
    }

    /**
     * Trouve une session par numéro de téléphone (Supabase comme source de vérité)
     * Retourne un objet normalisé { found, source, sessionId, companionName, userId }
     */
    async findSessionByPhone(phoneNumber) {
        // Nettoyer le numéro pour la comparaison
        const cleanRequestedPhone = phoneNumber.replace(/[^0-9]/g, '');
        console.log(chalk.blue(`[DEBUG] Looking for sessions for phone: ${cleanRequestedPhone}`));
        
        // PRIORITÉ 1: Chercher dans Supabase (source de vérité)
        try {
            const { data, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('phone_number', cleanRequestedPhone);
                
            if (error) {
                console.log(chalk.yellow(`[DEBUG] Database error when checking phone: ${error.message}`));
            } else if (data && data.length > 0) {
                // Trouvé dans Supabase - retourner un objet normalisé
                const companion = data[0];
                console.log(chalk.yellow(`[DEBUG] Found companion in Supabase: ${companion.companion_name} (${companion.user_id})`));
                return {
                    found: true,
                    source: 'supabase',
                    sessionId: companion.user_id, // garder l'ID original pour la cohérence
                    companionName: companion.companion_name,
                    userId: companion.user_id,
                    phoneNumber: companion.phone_number
                };
            }
        } catch (dbError) {
            console.log(chalk.yellow(`[DEBUG] Error checking Supabase: ${dbError.message}`));
        }
        
        // PRIORITÉ 2: Chercher dans les sessions actives (seulement si pas trouvé dans Supabase)
        for (const sessionId of this.activeSessions.keys()) {
            const sessionPath = `./sessions/${sessionId}`;
            try {
                const fs = require('fs');
                const path = require('path');
                const credsPath = path.join(sessionPath, 'creds.json');
                
                if (fs.existsSync(credsPath)) {
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    const sessionPhoneId = creds.me?.id;
                    
                    if (sessionPhoneId) {
                        const sessionPhone = sessionPhoneId.split('@')[0].replace(/[^0-9]/g, '');
                        console.log(chalk.blue(`[DEBUG] Checking active session ${sessionId}: ${sessionPhone} vs ${cleanRequestedPhone}`));
                        
                        if (sessionPhone === cleanRequestedPhone) {
                            console.log(chalk.yellow(`[DEBUG] Found matching active session (NOT IN SUPABASE): ${sessionId}`));
                            console.log(chalk.red(`[WARNING] Session ${sessionId} exists locally but not in Supabase - data inconsistency!`));
                            
                            // Extraire le nom du companion depuis l'ID de session
                            const parts = sessionId.split('-');
                            const companionName = parts.length >= 2 ? parts[1] : 'unknown';
                            
                            return {
                                found: true,
                                source: 'active',
                                sessionId: sessionId,
                                companionName: companionName,
                                userId: sessionId,
                                phoneNumber: cleanRequestedPhone
                            };
                        }
                    }
                }
            } catch (error) {
                console.log(chalk.yellow(`[DEBUG] Error reading creds for active session ${sessionId}: ${error.message}`));
            }
        }
        
        // PRIORITÉ 3: Chercher dans les dossiers de sessions locaux (orphelins potentiels)
        try {
            const fs = require('fs');
            const path = require('path');
            const sessionsDir = './sessions';
            
            if (fs.existsSync(sessionsDir)) {
                const folders = fs.readdirSync(sessionsDir).filter(f => 
                    f.startsWith('companion-') && 
                    fs.statSync(path.join(sessionsDir, f)).isDirectory()
                );
                
                console.log(chalk.blue(`[DEBUG] Checking ${folders.length} existing session folders...`));
                
                for (const folder of folders) {
                    try {
                        const credsPath = path.join(sessionsDir, folder, 'creds.json');
                        if (fs.existsSync(credsPath)) {
                            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                            const sessionPhoneId = creds.me?.id;
                            
                            if (sessionPhoneId) {
                                const sessionPhone = sessionPhoneId.split('@')[0].replace(/[^0-9]/g, '');
                                console.log(chalk.blue(`[DEBUG] Checking existing session ${folder}: ${sessionPhone} vs ${cleanRequestedPhone}`));
                                
                                if (sessionPhone === cleanRequestedPhone) {
                                    console.log(chalk.yellow(`[DEBUG] Found matching existing session (ORPHAN): ${folder}`));
                                    console.log(chalk.red(`[WARNING] Session ${folder} exists locally but not in Supabase - orphaned session!`));
                                    
                                    // Extraire le nom du companion depuis l'ID de session
                                    const parts = folder.split('-');
                                    const companionName = parts.length >= 2 ? parts[1] : 'unknown';
                                    
                                    return {
                                        found: true,
                                        source: 'local',
                                        sessionId: folder,
                                        companionName: companionName,
                                        userId: folder,
                                        phoneNumber: cleanRequestedPhone
                                    };
                                }
                            } else {
                                console.log(chalk.gray(`[DEBUG] Session ${folder} has no phone ID in creds (incomplete auth)`));
                            }
                        }
                    } catch (error) {
                        console.log(chalk.yellow(`[DEBUG] Error reading creds for folder ${folder}: ${error.message}`));
                    }
                }
            }
        } catch (error) {
            console.log(chalk.yellow(`[DEBUG] Error checking existing sessions: ${error.message}`));
        }
        
        console.log(chalk.green(`[DEBUG] No existing session found for phone ${cleanRequestedPhone}`));
        return { found: false, source: null, sessionId: null, companionName: null, userId: null, phoneNumber: cleanRequestedPhone };
    }

    /**
     * Nettoie les sessions orphelines (sessions avec fichiers mais pas d'authentification complète)
     */
    async cleanupOrphanedSessions() {
        try {
            console.log(chalk.yellow('[DEBUG] 🧹 Starting cleanup of orphaned sessions...'));
            
            const fs = require('fs');
            const path = require('path');
            const sessionsDir = './sessions';
            
            if (!fs.existsSync(sessionsDir)) {
                console.log(chalk.blue('[DEBUG] No sessions directory found, nothing to clean'));
                return { cleaned: 0, errors: [] };
            }
            
            const folders = fs.readdirSync(sessionsDir).filter(f => 
                f.startsWith('companion-') && 
                fs.statSync(path.join(sessionsDir, f)).isDirectory()
            );
            
            console.log(chalk.blue(`[DEBUG] Found ${folders.length} companion session folders to check`));
            
            let cleaned = 0;
            const errors = [];
            
            for (const folder of folders) {
                try {
                    const folderPath = path.join(sessionsDir, folder);
                    const credsPath = path.join(folderPath, 'creds.json');
                    
                    if (fs.existsSync(credsPath)) {
                        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        
                        // Vérifier si la session est incomplète
                        const isIncomplete = !creds.registered || !creds.me?.id || creds.me?.name === '~';
                        
                        if (isIncomplete) {
                            console.log(chalk.yellow(`[DEBUG] 🗑️ Cleaning incomplete session: ${folder}`));
                            console.log(chalk.gray(`[DEBUG] - registered: ${creds.registered}`));
                            console.log(chalk.gray(`[DEBUG] - me.id: ${creds.me?.id || 'none'}`));
                            console.log(chalk.gray(`[DEBUG] - me.name: ${creds.me?.name || 'none'}`));
                            
                            // Supprimer le dossier de session incomplet
                            fs.rmSync(folderPath, { recursive: true, force: true });
                            cleaned++;
                            
                            console.log(chalk.green(`[DEBUG] ✅ Cleaned orphaned session: ${folder}`));
                        } else {
                            console.log(chalk.green(`[DEBUG] ✅ Session ${folder} is complete, keeping it`));
                        }
                    } else {
                        console.log(chalk.yellow(`[DEBUG] 🗑️ Cleaning session without creds: ${folder}`));
                        fs.rmSync(folderPath, { recursive: true, force: true });
                        cleaned++;
                    }
                } catch (error) {
                    console.log(chalk.red(`[DEBUG] ❌ Error processing ${folder}: ${error.message}`));
                    errors.push({ folder, error: error.message });
                }
            }
            
            console.log(chalk.green(`[DEBUG] 🧹 Cleanup completed: ${cleaned} sessions cleaned, ${errors.length} errors`));
            return { cleaned, errors };
            
        } catch (error) {
            console.error(chalk.red(`[DEBUG] ❌ Error during cleanup: ${error.message}`));
            return { cleaned: 0, errors: [{ folder: 'general', error: error.message }] };
        }
    }

    /**
     * Démarre un bot companion déjà authentifié
     */
    async startAuthenticatedBot(sessionPath, companionName, sessionId, callback, authState, saveCreds) {
        try {
            console.log(chalk.green(`[DEBUG] Starting authenticated bot for ${companionName}...`));
            
            // Négociation de version pour bot authentifié
            const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
            const { version } = await fetchLatestBaileysVersion();
            console.log(chalk.blue(`[DEBUG] Using Baileys version for authenticated bot: ${version.join('.')}`));
            
            const XeonBotInc = makeWASocket({
                version,  // Utiliser la version négociée
                logger: require('pino')({ level: 'silent' }),
                printQRInTerminal: false,
                mobile: false,
                auth: authState,
                // Configuration navigateur optimisée pour bot authentifié 2024-2025
                browser: ["Ubuntu", "Chrome", "124.0.0.0"],
                // Optimisations réseau pour bot authentifié
                markOnlineOnConnect: true,  // OK pour bot authentifié
                generateHighQualityLinkPreview: false,  // Réduit la charge
                syncFullHistory: false,  // Performance améliorée
                shouldSyncHistoryMessage: () => false,  // Pas de sync historique
                emitOwnEvents: false,  // Réduit les événements
                // TIMEOUTS OPTIMISÉS VERSION 2024
                connectTimeoutMs: 120000,        // 2 minutes
                defaultQueryTimeoutMs: 60000,    // 1 minute
                retryRequestDelayMs: 3000,      // 3s entre retries
                maxMsgRetryCount: 3,            // Max 3 retries
                keepAliveIntervalMs: 30000,     // Keep alive 30s
                getMessage: async (key) => {
                    return {
                        conversation: "Hi"
                    }
                },
                msgRetryCounterCache: new (require('node-cache'))(),
                // Désactiver agent/proxy
                agent: undefined,
                fetchAgent: undefined,
            });
            
            // Set public flag to allow processing of all incoming messages
            XeonBotInc.public = true;
            
            // Stocker la session
            this.activeSessions.set(sessionId, XeonBotInc);
            
            // Sauvegarder les credentials (API Baileys correcte)
            XeonBotInc.ev.on('creds.update', saveCreds);
            
            // Gestion des événements de connexion
            XeonBotInc.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                
                console.log(chalk.blue(`[DEBUG] Authenticated bot connection update for ${companionName}: ${connection}`));
                
                if (connection === "open") {
                    console.log(chalk.green(`✅ Authenticated companion ${companionName} connected!`));
                    
                    // Nettoyer les flags de régénération maintenant que la connexion a réussi
                    this.pairingCodeAttempts?.delete(sessionId);
                    this.regenerationInProgress?.delete(sessionId);
                    this.restartAttempts?.delete(sessionId);
                    
                    // Marquer la session comme ouverte en mémoire
                    const session = this.activeSessions.get(sessionId);
                    if (session) {
                        session.state = 'open';
                        session.lastConnected = Date.now();
                        console.log(chalk.green(`[DEBUG] Authenticated session ${sessionId} marked as 'open'`));
                    }
                    
                    // ✅ FIXED: Save companion to DB or update status depending on if it's new
                    try {
                        const tempInfo = this.tempCompanionInfo?.get(sessionId);
                        if (tempInfo) {
                            // New companion - save to DB for the first time with 'connected' status
                            console.log(chalk.cyan(`[DATABASE] Saving new authenticated companion ${companionName} to DB...`));
                            await this.saveCompanionToDB(tempInfo.sessionId, tempInfo.phoneNumber, tempInfo.companionName, tempInfo.ownerJid, null, 'connected');
                            // Clean up temp info after successful save
                            this.tempCompanionInfo.delete(sessionId);
                            console.log(chalk.green(`[DATABASE] ✅ New authenticated companion ${companionName} saved to DB`));
                        } else {
                            // Existing companion - just update status
                            await this.updateCompanionStatusInDB(sessionId, 'connected');
                        }
                    } catch (dbError) {
                        console.error(chalk.red(`[DATABASE] ❌ Error saving/updating companion: ${serializeError(dbError)}`));
                    }
                    
                    // Réinitialiser les tentatives de redemarrage sur succès
                    if (this.restartAttempts) {
                        this.restartAttempts.set(sessionId, 0);
                        console.log(chalk.green(`[DEBUG] Reset restart attempts for authenticated ${companionName}`));
                    }
                    
                    // Notifier la connexion réussie
                    if (callback) {
                        callback({
                            success: true,
                            connected: true,
                            companionName: companionName,
                            user: XeonBotInc.user,
                            sessionId: sessionId
                        });
                    }
                }
                
                if (connection === 'close') {
                    console.log(chalk.red(`[DEBUG] Authenticated bot disconnected for ${companionName}`));
                    
                    // Marquer la session comme fermée en mémoire
                    const session = this.activeSessions.get(sessionId);
                    if (session) {
                        session.state = 'closed';
                        session.lastDisconnected = Date.now();
                        console.log(chalk.red(`[DEBUG] Authenticated session ${sessionId} marked as 'closed'`));
                    }
                    
                    // Mettre à jour le statut en base de données
                    await this.updateCompanionStatusInDB(sessionId, 'disconnected');
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        try {
                            rmSync(sessionPath, { recursive: true, force: true });
                        } catch { }
                    }
                    
                    this.activeSessions.delete(sessionId);
                    this.sessionCallbacks.delete(sessionId);
                }
            });
            
            // Sauvegarder les credentials
            XeonBotInc.ev.on('creds.update', saveCreds);
            
            // NOTE: Le gestionnaire de messages spécialisé pour compagnons
            // est déjà enregistré plus haut dans le code (ligne ~551)
            // Pas besoin d'un deuxième gestionnaire ici
            
            return XeonBotInc;
            
        } catch (error) {
            console.error(chalk.red(`❌ Error starting authenticated bot: ${error.message}`));
            throw error;
        }
    }

    /**
     * Ferme une session companion
     */
    async closeSession(sessionId) {
        try {
            console.log(chalk.yellow(`🔌 Closing session: ${sessionId}`));
            console.log(chalk.blue(`[DEBUG] Active sessions before close: ${Array.from(this.activeSessions.keys()).join(', ')}`));
            
            const session = this.activeSessions.get(sessionId);
            if (session) {
                console.log(chalk.blue(`[DEBUG] Ending WebSocket connection for ${sessionId}`));
                await session.end();
            }
            
            // Nettoyer les références
            this.sessionCallbacks.delete(sessionId);
            this.activeSessions.delete(sessionId);
            this.restartAttempts?.delete(sessionId);
            
            // Supprimer de la base de données
            await this.removeCompanionFromDB(sessionId);
            
            // Supprimer physiquement les fichiers de session de manière sécurisée
            try {
                const fs = require('fs');
                const sessionPath = path.resolve('./sessions', sessionId);
                const sessionsDir = path.resolve('./sessions');
                
                // SÉCURITÉ : Vérifier que le chemin reste dans le dossier sessions
                if (sessionPath.startsWith(sessionsDir) && fs.existsSync(sessionPath)) {
                    console.log(chalk.blue(`[DEBUG] Deleting session files: ${sessionPath}`));
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log(chalk.green(`[DEBUG] Session files deleted successfully`));
                }
            } catch (fsError) {
                console.log(chalk.red(`[DEBUG] Error deleting session files: ${fsError.message}`));
            }
            
            console.log(chalk.blue(`[DEBUG] Active sessions after close: ${Array.from(this.activeSessions.keys()).join(', ')}`));
            console.log(chalk.green(`✅ Session ${sessionId} closed successfully`));
            
        } catch (error) {
            console.error(chalk.red(`❌ Error closing session: ${error.message}`));
        }
    }

    /**
     * Gestionnaire de messages spécialisé pour les compagnons
     * Traite TOUTES les commandes comme le bot principal avec prefix #
     */
    async handleCompanionMessages(sock, messageUpdate, companionName) {
        try {
            const { messages, type } = messageUpdate;
            if (type !== 'notify') return;

            const msg = messages?.[0] || null;
            if (!msg?.message) return;
            
            const chatId = msg.key.remoteJid || null;
            if (!chatId) return;

            // ✅ CORRECTION CRITIQUE : Ajouter l'interception automatique des view-once AVANT le traitement normal
            // Exactement comme le bot principal dans index.js ligne 397
            try {
                const { autoTransferViewOnce } = require('../commands/dvo');
                await autoTransferViewOnce(sock, msg);
            } catch (autoTransferError) {
                // Erreur silencieuse comme pour le bot principal - ne pas interrompre le traitement
                console.error(`❌ [${companionName}] Error in autoTransferViewOnce:`, autoTransferError.message);
            }

            // Créer une fonction isOwner spécifique pour ce companion
            const companionConfig = await this.getCompanionConfigFromDB(companionName);
            const ownerJid = companionConfig?.owner_jid;
            const prefix = companionConfig?.config?.prefix || '#';
            
            const isOwner = async (jid) => {
                if (!ownerJid) return false;
                return jidNormalizedUser(jid) === jidNormalizedUser(ownerJid);
            };

            // Créer un handler de commandes pour ce companion avec le préfixe '#'
            const companionChannelInfo = {};

            // Import local pour éviter la dépendance circulaire
            const { buildMessageHandler } = require('./commandHandler');
            const companionHandler = buildMessageHandler({
                prefix: prefix, // Utiliser le préfixe du companion (# par défaut)
                isOwner: isOwner,
                botIdentity: 'companion',
                featureFlags: {
                    enableAutomations: false // Désactiver les automations pour éviter les doublons
                },
                channelInfo: companionChannelInfo
            });

            // Utiliser le handler de commandes complet pour les companions
            await companionHandler(sock, messageUpdate, true);

        } catch (error) {
            console.error(chalk.red(`❌ Companion ${companionName} message error: ${error.message}`));
        }
    }

    /**
     * Récupérer la configuration d'un companion depuis la base de données
     */
    async getCompanionConfigFromDB(companionName) {
        try {
            // Échapper les caractères wildcard pour recherche exacte case-insensitive
            const pattern = companionName.replace(/[%_]/g, '\\$&');
            
            // Chercher tous les companions pour trouver celui avec le bon nom (case-insensitive)
            const { data, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .ilike('companion_name', pattern)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error(chalk.red(`[DATABASE] Error getting companion config: ${error.message}`));
                return null;
            }

            return data;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error in getCompanionConfigFromDB: ${error.message}`));
            return null;
        }
    }

    /**
     * Nettoyer un companion orphelin (bloqué en statut initializing trop longtemps)
     */
    async cleanupOrphanedCompanion(userId) {
        try {
            console.log(chalk.yellow(`🧹 [CLEANUP] Removing orphaned companion: ${userId}`));
            
            // Supprimer de la base de données
            const { error } = await this.db.supabase
                .from('companions')
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error(chalk.red(`[CLEANUP] Error removing companion from DB: ${error.message}`));
                return false;
            }

            // Supprimer le dossier de session s'il existe (avec validation de sécurité)
            const fs = require('fs');
            const path = require('path');
            
            // SÉCURITÉ: Nettoyer et valider l'userId pour éviter path traversal
            const sanitizedUserId = this.sanitizeCompanionName(userId);
            const sessionPath = path.resolve('./sessions', sanitizedUserId);
            const sessionsDir = path.resolve('./sessions');
            
            // SÉCURITÉ: Vérifier que le chemin reste dans le dossier sessions
            if (!sessionPath.startsWith(sessionsDir)) {
                console.error(chalk.red(`[CLEANUP] Security violation: Invalid session path for userId: ${userId}`));
                return false;
            }
            
            if (fs.existsSync(sessionPath)) {
                try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log(chalk.green(`[CLEANUP] Removed session folder: ${sessionPath}`));
                } catch (fsError) {
                    console.error(chalk.yellow(`[CLEANUP] Warning: Could not remove session folder: ${fsError.message}`));
                }
            }

            console.log(chalk.green(`✅ [CLEANUP] Successfully cleaned up orphaned companion: ${userId}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[CLEANUP] Error cleaning up orphaned companion: ${error.message}`));
            return false;
        }
    }

    /**
     * Obtenir la configuration d'un companion depuis la base de données par user_id (sessionId)
     */
    async getCompanionConfigByUserId(userId) {
        try {
            const { data, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error(chalk.red(`[DATABASE] Error getting companion config by user_id: ${error.message}`));
                return null;
            }

            return data;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error in getCompanionConfigByUserId: ${error.message}`));
            return null;
        }
    }

    /**
     * Mettre à jour le préfixe d'un companion
     */
    async updateCompanionPrefix(companionName, newPrefix) {
        try {
            const companionConfig = await this.getCompanionConfigFromDB(companionName);
            if (!companionConfig) {
                throw new Error('Companion not found');
            }

            const updatedConfig = {
                ...companionConfig.config,
                prefix: newPrefix
            };

            const { error } = await this.db.supabase
                .from('companions')
                .update({
                    config: updatedConfig,
                    updated_at: new Date().toISOString()
                })
                .eq('companion_name', companionName);

            if (error) throw error;

            console.log(chalk.green(`[DATABASE] Prefix updated for companion ${companionName}: ${newPrefix}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error updating prefix: ${error.message}`));
            throw error;
        }
    }

    /**
     * Sauvegarder un companion dans la base de données
     */
    async saveCompanionToDB(sessionId, phoneNumber, companionName, ownerJid, pairingCode = null, status = 'initializing') {
        try {
            const companionData = {
                user_id: sessionId,
                phone_number: phoneNumber,
                companion_name: companionName,
                owner_jid: ownerJid,
                status: status, // ✅ FIXED: Allow custom status instead of hardcoded 'initializing'
                pairing_code: pairingCode,
                config: { prefix: '#' }, // Préfixe par défaut
                last_activity: new Date().toISOString()
            };

            const { error } = await this.db.supabase
                .from('companions')
                .upsert(companionData);

            if (error) throw error;

            console.log(chalk.green(`[DATABASE] Companion saved: ${companionName} (${sessionId})`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error saving companion: ${error.message}`));
            return false;
        }
    }

    /**
     * Mettre à jour le statut d'un companion dans la base de données
     */
    async updateCompanionStatusInDB(sessionId, status) {
        try {
            const { error } = await this.db.supabase
                .from('companions')
                .update({
                    status: status,
                    last_activity: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', sessionId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error updating companion status: ${error.message}`));
            return false;
        }
    }

    /**
     * Charger les companions existants depuis la base de données
     */
    async loadExistingCompanions() {
        try {
            console.log(chalk.blue('[DATABASE] Loading existing companions from database...'));

            // D'abord, faire une réconciliation complète
            await this.reconcileSessionsWithDatabase();

            const { data, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('status', 'connected');

            if (error) throw error;

            if (data && data.length > 0) {
                console.log(chalk.yellow(`[DATABASE] Found ${data.length} existing companions to restore`));
                
                let restoredCount = 0;
                const maxCompanions = 2; // Limite stricte
                
                for (const companion of data) {
                    // Respecter la limite de 2 companions
                    if (restoredCount >= maxCompanions) {
                        console.log(chalk.yellow(`[DATABASE] Reached limit of ${maxCompanions} companions, marking remaining as disconnected`));
                        await this.updateCompanionStatusInDB(companion.user_id, 'disconnected');
                        continue;
                    }
                    
                    // Vérifier si ce companion n'est pas déjà actif
                    if (this.activeSessions.has(companion.user_id)) {
                        console.log(chalk.yellow(`[DATABASE] Companion ${companion.companion_name} already active, skipping`));
                        continue;
                    }
                    
                    const sessionPath = path.resolve('./sessions', companion.user_id);
                    const sessionsDir = path.resolve('./sessions');
                    
                    // SÉCURITÉ : Vérifier le chemin de session
                    if (!sessionPath.startsWith(sessionsDir)) {
                        console.error(chalk.red(`[DATABASE] Security violation: Invalid session path for ${companion.companion_name}`));
                        await this.updateCompanionStatusInDB(companion.user_id, 'disconnected');
                        continue;
                    }
                    
                    // Vérifier si les fichiers de session existent
                    if (fs.existsSync(sessionPath)) {
                        console.log(chalk.blue(`[DATABASE] Restoring companion: ${companion.companion_name} (${companion.user_id})`));
                        
                        try {
                            // Tenter de redémarrer la session
                            await this.startCompanionBot(sessionPath, companion.phone_number, companion.companion_name, companion.user_id, null, false, true);
                            restoredCount++;
                        } catch (error) {
                            console.error(chalk.red(`[DATABASE] Failed to restore companion ${companion.companion_name}: ${error.message}`));
                            // Marquer comme disconnected
                            await this.updateCompanionStatusInDB(companion.user_id, 'disconnected');
                        }
                    } else {
                        console.log(chalk.yellow(`[DATABASE] Session files missing for ${companion.companion_name}, marking as disconnected`));
                        await this.updateCompanionStatusInDB(companion.user_id, 'disconnected');
                    }
                }
                
                console.log(chalk.green(`[DATABASE] Successfully restored ${restoredCount}/${data.length} companions`));
            } else {
                console.log(chalk.gray('[DATABASE] No existing companions found'));
            }
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error loading existing companions: ${error.message}`));
        }
    }

    /**
     * 🔄 RÉCONCILIATION AUTOMATIQUE - Synchroniser sessions/ vers base de données
     * Cette méthode scanne le dossier sessions/ et crée des entrées DB pour les sessions orphelines
     */
    async reconcileSessionsWithDatabase() {
        try {
            console.log(chalk.blue('[RECONCILIATION] 🔄 Starting automatic reconciliation...'));
            
            const fs = require('fs');
            const path = require('path');
            const sessionsDir = './sessions';
            
            if (!fs.existsSync(sessionsDir)) {
                console.log(chalk.gray('[RECONCILIATION] No sessions directory found'));
                return { reconciled: 0, errors: [] };
            }
            
            // Obtenir tous les companions de la DB pour comparaison
            const { data: dbCompanions, error: dbError } = await this.db.supabase
                .from('companions')
                .select('user_id, companion_name, phone_number');
            
            if (dbError) {
                console.error(chalk.red(`[RECONCILIATION] Error fetching DB companions: ${dbError.message}`));
                return { reconciled: 0, errors: [dbError.message] };
            }
            
            const dbUserIds = new Set((dbCompanions || []).map(c => c.user_id));
            
            // Scanner les dossiers de sessions
            const folders = fs.readdirSync(sessionsDir).filter(f => f.startsWith('companion-'));
            let reconciledCount = 0;
            const errors = [];
            
            console.log(chalk.cyan(`[RECONCILIATION] Found ${folders.length} companion session folders to check`));
            
            for (const folder of folders) {
                try {
                    const sessionPath = path.join(sessionsDir, folder);
                    const credsPath = path.join(sessionPath, 'creds.json');
                    
                    // Skip si déjà en DB
                    if (dbUserIds.has(folder)) {
                        console.log(chalk.gray(`[RECONCILIATION] Session ${folder} already in DB, skipping`));
                        continue;
                    }
                    
                    // Vérifier si la session est valide
                    if (!fs.existsSync(credsPath)) {
                        console.log(chalk.yellow(`[RECONCILIATION] No creds.json in ${folder}, skipping`));
                        continue;
                    }
                    
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    
                    if (!creds.registered || !creds.me?.id) {
                        console.log(chalk.yellow(`[RECONCILIATION] Unregistered session ${folder}, skipping`));
                        continue;
                    }
                    
                    // Extraire les informations de la session
                    const phoneNumber = creds.me.id.split('@')[0].replace(/[^0-9]/g, '');
                    const companionName = this.parseSessionId(folder).name || folder.replace('companion-', '');
                    
                    // Déterminer l'owner (pas possible de le récupérer des creds, utiliser un placeholder)
                    const ownerJid = `${phoneNumber}@s.whatsapp.net`; // Placeholder - will need manual assignment by real owner
                    
                    console.log(chalk.yellow(`[RECONCILIATION] 🔄 Found orphaned session: ${companionName} (${phoneNumber})`));
                    
                    // Créer l'entrée en DB
                    const { error: insertError } = await this.db.supabase
                        .from('companions')
                        .insert({
                            user_id: folder,
                            companion_name: companionName,
                            phone_number: phoneNumber,
                            owner_jid: ownerJid,
                            status: 'sleeping', // Marquer comme endormi
                            config: {},
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    
                    if (insertError) {
                        console.error(chalk.red(`[RECONCILIATION] Failed to insert ${companionName}: ${insertError.message}`));
                        errors.push(`${companionName}: ${insertError.message}`);
                    } else {
                        console.log(chalk.green(`[RECONCILIATION] ✅ Reconciled ${companionName} -> DB`));
                        reconciledCount++;
                    }
                    
                } catch (error) {
                    console.error(chalk.red(`[RECONCILIATION] Error processing ${folder}: ${error.message}`));
                    errors.push(`${folder}: ${error.message}`);
                }
            }
            
            if (reconciledCount > 0) {
                console.log(chalk.green(`[RECONCILIATION] ✅ Successfully reconciled ${reconciledCount} orphaned sessions`));
            } else {
                console.log(chalk.gray('[RECONCILIATION] No orphaned sessions found'));
            }
            
            return { reconciled: reconciledCount, errors };
            
        } catch (error) {
            console.error(chalk.red(`[RECONCILIATION] Fatal error: ${error.message}`));
            return { reconciled: 0, errors: [error.message] };
        }
    }

    /**
     * Auto-réveil automatique des companions endormis
     * Vérifie si un utilisateur a un companion endormi et le réveille automatiquement
     */
    async autoWakeCompanionForUser(userJid) {
        try {
            console.log(chalk.blue(`[AUTO-WAKE] Checking for sleeping companion for user: ${userJid}`));
            
            // Normaliser le JID utilisateur
            const { jidNormalizedUser } = require('@whiskeysockets/baileys');
            const normalizedUserJid = jidNormalizedUser(userJid);
            
            // Chercher un companion endormi pour cet utilisateur
            const { data, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('owner_jid', normalizedUserJid)
                .eq('status', 'sleeping')
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.log(chalk.yellow(`[AUTO-WAKE] Error checking for sleeping companion: ${error.message}`));
                return false;
            }

            if (!data) {
                console.log(chalk.gray(`[AUTO-WAKE] No sleeping companion found for user: ${normalizedUserJid}`));
                return false;
            }

            const companionName = data.companion_name;
            console.log(chalk.cyan(`[AUTO-WAKE] Found sleeping companion: ${companionName}, attempting auto-wake...`));

            // ✅ FIXED: Construire le chemin de session correctement using user_id from DB
            // user_id contient déjà le format complet: "companion-name-timestamp"
            const sessionPath = `./sessions/${data.user_id}`;
            
            // Vérifier si les fichiers de session existent
            const fs = require('fs');
            if (!fs.existsSync(sessionPath)) {
                console.log(chalk.yellow(`[AUTO-WAKE] Session files missing for ${companionName} at ${sessionPath}, cannot auto-wake`));
                return false;
            }

            console.log(chalk.blue(`[AUTO-WAKE] Using session path: ${sessionPath}`));

            // Réveiller le companion automatiquement
            try {
                await this.startCompanionBot(sessionPath, data.phone_number, companionName, data.user_id, null, false, true);
                
                console.log(chalk.green(`[AUTO-WAKE] ✅ Successfully auto-woke companion: ${companionName}`));
                return true;
            } catch (error) {
                console.error(chalk.red(`[AUTO-WAKE] ❌ Failed to auto-wake companion ${companionName}: ${error.message}`));
                return false;
            }

        } catch (error) {
            console.error(chalk.red(`[AUTO-WAKE] Error in auto-wake process: ${error.message}`));
            return false;
        }
    }

    /**
     * Supprimer un companion de la base de données par sessionId
     */
    async removeCompanionFromDB(sessionId) {
        try {
            const { error } = await this.db.supabase
                .from('companions')
                .delete()
                .eq('user_id', sessionId);

            if (error) throw error;

            console.log(chalk.green(`[DATABASE] Companion removed from database: ${sessionId}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error removing companion: ${error.message}`));
            return false;
        }
    }

    /**
     * Supprimer un companion de la base de données par nom
     */
    async removeCompanionFromDBByName(companionName) {
        try {
            // Échapper les caractères wildcard pour recherche exacte case-insensitive
            const pattern = companionName.replace(/[%_]/g, '\\$&');
            
            const { error } = await this.db.supabase
                .from('companions')
                .delete()
                .ilike('companion_name', pattern);

            if (error) throw error;

            console.log(chalk.green(`[DATABASE] Companion removed from database by name: ${companionName}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`[DATABASE] Error removing companion by name: ${error.message}`));
            return false;
        }
    }
    
    /**
     * Cleanup complet des ressources pour une session échouée/expirée
     */
    async performCompleteCleanup(sessionId, sessionPath, companionName, reason = 'unknown') {
        console.log(chalk.yellow(`[CLEANUP] Starting complete cleanup for ${companionName} (reason: ${reason})`));
        
        try {
            // 1. Fermer proprement le socket s'il existe
            const session = this.activeSessions.get(sessionId);
            if (session && session.socket) {
                try {
                    await session.socket.end();
                    console.log(chalk.green(`[CLEANUP] Socket closed for ${sessionId}`));
                } catch (err) {
                    console.log(chalk.yellow(`[CLEANUP] Socket close error (likely already closed): ${err.message}`));
                }
            }
            
            // 2. Nettoyer toutes les maps/états en mémoire
            this.activeSessions.delete(sessionId);
            this.sessionCallbacks.delete(sessionId);
            this.pendingCompanions.delete(sessionId);
            this.pairingCodeAttempts?.delete(sessionId);
            this.regenerationInProgress?.delete(sessionId);
            this.restartAttempts?.delete(sessionId);
            
            // 3. Nettoyer les fichiers de session si ils existent
            const fs = require('fs');
            if (fs.existsSync(sessionPath)) {
                try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log(chalk.green(`[CLEANUP] Session files removed: ${sessionPath}`));
                } catch (fsErr) {
                    console.log(chalk.yellow(`[CLEANUP] Session files cleanup error: ${fsErr.message}`));
                }
            }
            
            // 4. Supprimer de la base de données si nécessaire (orphan cleanup)
            try {
                await this.removeCompanionFromDB(sessionId);
                console.log(chalk.green(`[CLEANUP] Database cleanup completed for ${sessionId}`));
            } catch (dbErr) {
                console.log(chalk.yellow(`[CLEANUP] Database cleanup error: ${dbErr.message}`));
            }
            
            console.log(chalk.green(`[CLEANUP] ✅ Complete cleanup finished for ${companionName}`));
            
        } catch (error) {
            console.error(chalk.red(`[CLEANUP] ❌ Error during complete cleanup for ${companionName}: ${error.message}`));
        }
    }

    /**
     * 🧹 NETTOYAGE AUTOMATIQUE - Nettoie les sessions corrompues/expirées automatiquement
     * Appelé au démarrage et toutes les 15 minutes
     */
    async performAutomaticCleanup() {
        const startTime = Date.now();
        console.log(chalk.cyan(`[AUTO-CLEANUP] start ${new Date().toISOString()}`));
        console.log(chalk.cyan(`[AUTO-CLEANUP] 🧹 Démarrage du nettoyage automatique...`));
        
        try {
            const results = {
                orphanedDBCompanions: 0,
                corruptedSessions: 0,
                expiredSessions: 0,
                ownersNotified: new Set(),
                errors: []
            };

            // 1. Nettoyer les companions orphelins en DB (stuck in 'initializing' > 10 minutes)
            await this.cleanupOrphanedDBCompanions(results);

            // 2. Nettoyer les sessions corrompues/expirées sur le filesystem
            await this.cleanupCorruptedSessions(results);

            // 3. Envoyer notifications aux propriétaires (une seule fois)
            await this.notifyOwnersOfCleanup(results);

            // 4. Re-synchroniser l'état en mémoire
            await this.resyncInMemoryState();

            const duration = Date.now() - startTime;
            this.lastCleanupTime = Date.now();

            console.log(chalk.green(`[AUTO-CLEANUP] ✅ Nettoyage terminé en ${duration}ms:`));
            console.log(chalk.green(`[AUTO-CLEANUP] - ${results.orphanedDBCompanions} companions orphelins DB nettoyés`));
            console.log(chalk.green(`[AUTO-CLEANUP] - ${results.corruptedSessions} sessions corrompues supprimées`));
            console.log(chalk.green(`[AUTO-CLEANUP] - ${results.expiredSessions} sessions expirées supprimées`));
            console.log(chalk.green(`[AUTO-CLEANUP] - ${results.ownersNotified.size} propriétaires notifiés`));

            if (results.errors.length > 0) {
                console.log(chalk.yellow(`[AUTO-CLEANUP] ⚠️ ${results.errors.length} erreurs rencontrées`));
            }

        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur pendant le nettoyage automatique: ${error.message}`));
        }
    }

    /**
     * Nettoie les companions orphelins dans la DB (status='initializing' depuis >10 minutes)
     */
    async cleanupOrphanedDBCompanions(results) {
        try {
            console.log(chalk.cyan(`[AUTO-CLEANUP] Recherche de companions orphelins en DB...`));
            
            // Trouver les companions bloqués en 'initializing' depuis plus de 10 minutes
            const { data: orphanedCompanions, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .eq('status', 'initializing')
                .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // 10 minutes ago

            if (error) {
                results.errors.push(`DB lookup error: ${error.message}`);
                return;
            }

            if (orphanedCompanions && orphanedCompanions.length > 0) {
                console.log(chalk.yellow(`[AUTO-CLEANUP] Trouvé ${orphanedCompanions.length} companions orphelins en DB`));

                for (const companion of orphanedCompanions) {
                    try {
                        // Nettoyer les fichiers de session associés
                        const sessionPath = path.resolve('./sessions', `companion-${companion.companion_name}`);
                        if (fs.existsSync(sessionPath)) {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                            console.log(chalk.yellow(`[AUTO-CLEANUP] Supprimé dossier session: ${sessionPath}`));
                        }

                        // Supprimer de la DB
                        await this.removeCompanionFromDB(companion.user_id);
                        results.orphanedDBCompanions++;
                        results.ownersNotified.add(companion.owner_jid);

                        console.log(chalk.green(`[AUTO-CLEANUP] ✅ Companion orphelin nettoyé: ${companion.companion_name}`));

                    } catch (cleanupError) {
                        results.errors.push(`Cleanup error for ${companion.companion_name}: ${cleanupError.message}`);
                        console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur nettoyage ${companion.companion_name}: ${cleanupError.message}`));
                    }
                }
            } else {
                console.log(chalk.green(`[AUTO-CLEANUP] ✅ Aucun companion orphelin en DB trouvé`));
            }

        } catch (error) {
            results.errors.push(`DB cleanup error: ${error.message}`);
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur nettoyage DB: ${error.message}`));
        }
    }

    /**
     * Nettoie les sessions corrompues/expirées sur le filesystem
     */
    async cleanupCorruptedSessions(results) {
        try {
            console.log(chalk.cyan(`[AUTO-CLEANUP] Scan des sessions corrompues/expirées...`));
            
            const sessionsDir = './sessions';
            if (!fs.existsSync(sessionsDir)) return;

            const sessionFolders = fs.readdirSync(sessionsDir)
                .filter(folder => folder.startsWith('companion-'))
                .map(folder => ({
                    name: folder,
                    path: path.join(sessionsDir, folder),
                    createdTime: fs.statSync(path.join(sessionsDir, folder)).mtime.getTime()
                }));

            for (const session of sessionFolders) {
                try {
                    const credsPath = path.join(session.path, 'creds.json');
                    const sessionAge = Date.now() - session.createdTime;
                    const maxAge = 24 * 60 * 60 * 1000; // 24 heures

                    let shouldCleanup = false;
                    let reason = '';

                    if (!fs.existsSync(credsPath)) {
                        shouldCleanup = true;
                        reason = 'Pas de fichier creds.json';
                        results.corruptedSessions++;
                    } else {
                        try {
                            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                            if (!creds.registered || !creds.me?.id) {
                                if (sessionAge > maxAge) {
                                    shouldCleanup = true;
                                    reason = 'Session non-enregistrée expirée (>24h)';
                                    results.expiredSessions++;
                                }
                            }
                        } catch (parseError) {
                            shouldCleanup = true;
                            reason = 'Fichier creds.json corrompu';
                            results.corruptedSessions++;
                        }
                    }

                    if (shouldCleanup) {
                        fs.rmSync(session.path, { recursive: true, force: true });
                        console.log(chalk.yellow(`[AUTO-CLEANUP] 🗑️ Session supprimée: ${session.name} (${reason})`));
                        
                        // Si c'est une session corrompue avec un nom valide, essayer de trouver le propriétaire
                        const companionName = session.name.replace('companion-', '');
                        const dbCompanion = await this.getCompanionConfigFromDB(companionName);
                        if (dbCompanion) {
                            results.ownersNotified.add(dbCompanion.owner_jid);
                            // Marquer comme disconnected en DB
                            await this.updateCompanionStatusInDB(dbCompanion.user_id, 'disconnected');
                        }
                    }

                } catch (sessionError) {
                    results.errors.push(`Session cleanup error for ${session.name}: ${sessionError.message}`);
                    console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur session ${session.name}: ${sessionError.message}`));
                }
            }

            console.log(chalk.green(`[AUTO-CLEANUP] ✅ Scan des sessions terminé`));

        } catch (error) {
            results.errors.push(`Session cleanup error: ${error.message}`);
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur scan sessions: ${error.message}`));
        }
    }

    /**
     * Envoie des notifications aux propriétaires (une seule fois, pas de traces)
     */
    async notifyOwnersOfCleanup(results) {
        if (results.ownersNotified.size === 0) return;

        try {
            console.log(chalk.cyan(`[AUTO-CLEANUP] Envoi des notifications à ${results.ownersNotified.size} propriétaires...`));

            for (const ownerJid of results.ownersNotified) {
                // Vérifier si la notification a déjà été envoyée récemment
                const notificationKey = `${ownerJid}-${Math.floor(Date.now() / (60 * 60 * 1000))}` // par heure
                
                if (this.cleanupNotifications.has(notificationKey)) {
                    continue; // Déjà notifié cette heure
                }

                try {
                    const cleanupMessage = `🧹 *Nettoyage automatique effectué*\n\n` +
                                         `Certaines sessions companion corrompues ou expirées ont été automatiquement nettoyées.\n\n` +
                                         `💡 Aucune action requise - vos companions actifs ne sont pas affectés.\n\n` +
                                         `ℹ️ Si vous rencontrez des problèmes, utilisez \`.companion list\` pour vérifier l'état.`;

                    // Essayer d'envoyer la notification (si possible)
                    if (this.activeSessions && this.activeSessions.size > 0) {
                        // Utiliser la première session active pour envoyer le message
                        const firstSession = Array.from(this.activeSessions.values())[0];
                        if (firstSession && firstSession.socket && typeof firstSession.socket.sendMessage === 'function') {
                            try {
                                await firstSession.socket.sendMessage(ownerJid, { text: cleanupMessage });
                                console.log(chalk.green(`[AUTO-CLEANUP] ✅ Notification envoyée à ${ownerJid}`));
                                this.cleanupNotifications.add(notificationKey);
                            } catch (sendError) {
                                console.log(chalk.yellow(`[AUTO-CLEANUP] ⚠️ Impossible d'envoyer notification à ${ownerJid}: ${sendError.message}`));
                            }
                        }
                    }

                } catch (ownerError) {
                    results.errors.push(`Notification error for ${ownerJid}: ${ownerError.message}`);
                }
            }

            // Nettoyer les anciennes notifications (garder seulement les 24 dernières heures)
            const cutoff = Math.floor(Date.now() / (60 * 60 * 1000)) - 24;
            for (const key of this.cleanupNotifications) {
                const timestamp = parseInt(key.split('-').pop());
                if (timestamp < cutoff) {
                    this.cleanupNotifications.delete(key);
                }
            }

        } catch (error) {
            results.errors.push(`Notification system error: ${error.message}`);
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur notifications: ${error.message}`));
        }
    }

    /**
     * Re-synchronise l'état en mémoire après le nettoyage
     */
    async resyncInMemoryState() {
        try {
            console.log(chalk.cyan(`[AUTO-CLEANUP] Re-synchronisation de l'état en mémoire...`));
            
            // Recharger les companions depuis la DB pour s'assurer que l'état est cohérent
            const { data: companions, error } = await this.db.supabase
                .from('companions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur resync: ${error.message}`));
                return;
            }

            // Nettoyer les sessions en mémoire qui n'existent plus en DB
            for (const [sessionId, session] of this.activeSessions.entries()) {
                const existsInDB = companions?.find(c => c.user_id === sessionId);
                if (!existsInDB) {
                    console.log(chalk.yellow(`[AUTO-CLEANUP] Nettoyage session en mémoire orpheline: ${sessionId}`));
                    this.activeSessions.delete(sessionId);
                    this.sessionCallbacks.delete(sessionId);
                }
            }

            console.log(chalk.green(`[AUTO-CLEANUP] ✅ Re-synchronisation terminée`));

        } catch (error) {
            console.error(chalk.red(`[AUTO-CLEANUP] ❌ Erreur resync: ${error.message}`));
        }
    }
}

module.exports = CompanionSessionManager;