'use strict';

/**
 * Webhook delivery utility
 * Stores webhook registrations and delivers events with retry logic
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadWebhooks() {
    try {
        if (fs.existsSync(WEBHOOKS_FILE)) return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8'));
    } catch { /* ignore */ }
    return {};
}

function saveWebhooks(hooks) {
    fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(hooks, null, 2), 'utf-8');
}

let hooksCache = loadWebhooks();

/**
 * Register a webhook
 * @param {object} opts
 * @param {string} opts.url - Target URL
 * @param {string[]} opts.events - ['message.received','message.sent','otp.sent','otp.verified']
 * @param {string} opts.secret - Optional secret for HMAC signing
 * @param {string} opts.apiKeyId - Owner API key id
 */
function registerWebhook(opts) {
    const hooks = loadWebhooks();
    const id = crypto.randomUUID();

    hooks[id] = {
        id,
        url: opts.url,
        events: opts.events || ['message.received'],
        secret: opts.secret || null,
        apiKeyId: opts.apiKeyId || null,
        active: true,
        createdAt: new Date().toISOString(),
        deliveries: 0,
        lastDelivery: null,
    };

    saveWebhooks(hooks);
    hooksCache = hooks;
    return hooks[id];
}

/**
 * List all webhooks (optionally filter by apiKeyId)
 */
function listWebhooks(apiKeyId = null) {
    const hooks = loadWebhooks();
    const all = Object.values(hooks).filter(h => h.active);
    if (apiKeyId) return all.filter(h => h.apiKeyId === apiKeyId);
    return all;
}

/**
 * Delete a webhook
 */
function deleteWebhook(id) {
    const hooks = loadWebhooks();
    if (!hooks[id]) return false;
    delete hooks[id];
    saveWebhooks(hooks);
    hooksCache = hooks;
    return true;
}

/**
 * Build HMAC-SHA256 signature for payload
 */
function signPayload(secret, payload) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver an event to all matching webhooks
 * @param {string} event - Event name e.g. 'message.received'
 * @param {object} data - Event payload
 */
async function deliverEvent(event, data) {
    const hooks = Object.values(hooksCache).filter(h => h.active && h.events.includes(event));
    if (!hooks.length) return;

    const payload = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
    });

    await Promise.allSettled(
        hooks.map(hook => deliverToHook(hook, payload))
    );
}

async function deliverToHook(hook, payload, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    const DELAYS = [0, 5000, 15000];

    try {
        const headers = {
            'Content-Type': 'application/json',
            'X-Wabot-Event': JSON.parse(payload).event,
            'X-Wabot-Delivery': crypto.randomUUID(),
        };

        if (hook.secret) {
            headers['X-Wabot-Signature'] = `sha256=${signPayload(hook.secret, payload)}`;
        }

        await axios.post(hook.url, payload, {
            headers,
            timeout: 10000,
        });

        // Update stats
        hooksCache[hook.id] && (hooksCache[hook.id].deliveries++);
        hooksCache[hook.id] && (hooksCache[hook.id].lastDelivery = new Date().toISOString());
        setImmediate(() => saveWebhooks(hooksCache));

    } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
            setTimeout(() => deliverToHook(hook, payload, attempt + 1), DELAYS[attempt]);
        } else {
            console.error(`[Webhook] Failed to deliver to ${hook.url} after ${MAX_ATTEMPTS} attempts: ${err.message}`);
        }
    }
}

module.exports = { registerWebhook, listWebhooks, deleteWebhook, deliverEvent };
