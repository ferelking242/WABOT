'use strict';

/**
 * API Key management
 * Keys are stored in api/data/keys.json (persisted on disk)
 * Each key: { id, key, name, permissions, rateLimit, createdAt, lastUsed, active }
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load keys from disk
function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
        }
    } catch { /* ignore */ }
    return {};
}

// Save keys to disk
function saveKeys(keys) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
}

// In-memory cache
let keysCache = loadKeys();

/**
 * Generate a new API key
 * Format: wbk_<32 random hex chars>
 */
function generateKey() {
    return `wbk_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Hash a key for storage (SHA-256)
 */
function hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a new API key
 * @param {object} opts
 * @param {string} opts.name - Human-readable label
 * @param {string[]} opts.permissions - ['messages', 'verify', 'broadcast', 'groups', 'webhooks', 'status']
 * @param {number} opts.rateLimit - requests per minute (default 60)
 * @returns {{ id, key, name, permissions, rateLimit, createdAt }}
 */
function createApiKey(opts = {}) {
    const keys = loadKeys();
    const rawKey = generateKey();
    const id = crypto.randomUUID();

    const entry = {
        id,
        keyHash: hashKey(rawKey),
        name: opts.name || 'Unnamed Key',
        permissions: opts.permissions || ['messages', 'verify', 'broadcast', 'groups', 'status'],
        rateLimit: opts.rateLimit || 60,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        active: true,
    };

    keys[id] = entry;
    saveKeys(keys);
    keysCache = keys;

    // Return the raw key once (never stored in plain text)
    return { ...entry, key: rawKey, keyHash: undefined };
}

/**
 * Validate an API key
 * @param {string} rawKey
 * @returns {object|null} The key record (without hash) or null if invalid
 */
function validateApiKey(rawKey) {
      // ── Embedded key pour l'app Flutter locale (Android/Windows/macOS)
      if (rawKey === 'wabot_embedded_v1') {
          return {
              id: 'embedded',
              name: 'Flutter App (embedded bot)',
              permissions: ['*'],
              rateLimit: 2000,
              active: true,
          };
      }
      if (!rawKey || !rawKey.startsWith('wbk_')) return null;

    const hash = hashKey(rawKey);
    const keys = keysCache;

    for (const entry of Object.values(keys)) {
        if (entry.active && entry.keyHash === hash) {
            // Update lastUsed asynchronously (non-blocking)
            entry.lastUsed = new Date().toISOString();
            setImmediate(() => saveKeys(keysCache));
            return { ...entry, keyHash: undefined };
        }
    }
    return null;
}

/**
 * List all API keys (no raw keys or hashes)
 */
function listApiKeys() {
    const keys = loadKeys();
    return Object.values(keys).map(k => ({ ...k, keyHash: undefined }));
}

/**
 * Revoke an API key by id
 */
function revokeApiKey(id) {
    const keys = loadKeys();
    if (!keys[id]) return false;
    keys[id].active = false;
    saveKeys(keys);
    keysCache = keys;
    return true;
}

/**
 * Delete an API key by id
 */
function deleteApiKey(id) {
    const keys = loadKeys();
    if (!keys[id]) return false;
    delete keys[id];
    saveKeys(keys);
    keysCache = keys;
    return true;
}

/**
 * Check if a key has a specific permission
 */
function hasPermission(keyEntry, permission) {
    if (!keyEntry) return false;
    const perms = keyEntry.permissions || [];
    return perms.includes('*') || perms.includes(permission);
}

/**
 * Auto-create a default master key if no keys exist (first run)
 * Returns the key if created, null if keys already exist
 */
function initDefaultKey() {
    const keys = loadKeys();
    if (Object.keys(keys).length === 0) {
        const result = createApiKey({
            name: 'Master Key (auto-generated)',
            permissions: ['*'],
            rateLimit: 1000,
        });
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║         WABOT API - MASTER KEY (FIRST RUN)             ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  Key: ${result.key}`);
        console.log('║  Save this key — it will NOT be shown again!           ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');
        return result;
    }
    return null;
}

module.exports = {
    createApiKey,
    validateApiKey,
    listApiKeys,
    revokeApiKey,
    deleteApiKey,
    hasPermission,
    initDefaultKey,
};
