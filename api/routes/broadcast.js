'use strict';

/**
 * Broadcast / bulk messaging routes
 * POST /v1/broadcast        — send text to multiple numbers
 * POST /v1/broadcast/image  — send image to multiple numbers
 * POST /v1/broadcast/template — send template message to list
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getWhatsAppInstance } = require('../../lib/whatsappInstance');
const { toJid } = require('../utils/phone');
const { deliverEvent } = require('../utils/webhook');
const axios = require('axios');

const router = Router();
router.use(requireAuth, requirePermission('broadcast'), rateLimit);

function validate(schema, body, res) {
    const result = schema.safeParse(body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: result.error.errors });
        return null;
    }
    return result.data;
}

function getSock(res) {
    const sock = getWhatsAppInstance();
    if (!sock) {
        res.status(503).json({ success: false, error: 'BOT_NOT_CONNECTED', message: 'WhatsApp bot is not connected.' });
        return null;
    }
    return sock;
}

async function fetchBuffer(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
}

// Delay between messages to avoid WhatsApp spam detection (ms)
const SEND_DELAY = 1200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Core broadcast logic — send a content object to a list of JIDs
 * Returns results array: [{ to, success, messageId?, error? }]
 */
async function broadcastContent(sock, jids, contentFn, delayMs = SEND_DELAY) {
    const results = [];
    for (const jid of jids) {
        try {
            const content = typeof contentFn === 'function' ? await contentFn(jid) : contentFn;
            const sent = await sock.sendMessage(jid, content);
            results.push({ to: jid, success: true, messageId: sent?.key?.id || null });
        } catch (err) {
            results.push({ to: jid, success: false, error: err.message });
        }
        if (delayMs > 0) await sleep(delayMs);
    }
    return results;
}

// ── Broadcast Text ────────────────────────────────────────────────────────────

const BroadcastTextSchema = z.object({
    recipients: z.array(z.string().min(7)).min(1).max(500),
    text: z.string().min(1).max(65536),
    delay: z.number().int().min(500).max(10000).optional(),
});

router.post('/', async (req, res) => {
    const data = validate(BroadcastTextSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jids = data.recipients.map(toJid);
        const results = await broadcastContent(sock, jids, { text: data.text }, data.delay ?? SEND_DELAY);

        const succeeded = results.filter(r => r.success).length;
        const failed = results.length - succeeded;

        await deliverEvent('broadcast.completed', { total: jids.length, succeeded, failed });

        res.json({
            success: true,
            summary: { total: jids.length, succeeded, failed },
            results,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'BROADCAST_FAILED', message: err.message });
    }
});

// ── Broadcast Image ───────────────────────────────────────────────────────────

const BroadcastImageSchema = z.object({
    recipients: z.array(z.string().min(7)).min(1).max(200),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
    delay: z.number().int().min(500).max(10000).optional(),
});

router.post('/image', async (req, res) => {
    const data = validate(BroadcastImageSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jids = data.recipients.map(toJid);
        // Fetch image once, reuse buffer
        const image = await fetchBuffer(data.url);
        const content = { image, caption: data.caption };

        const results = await broadcastContent(sock, jids, content, data.delay ?? SEND_DELAY);
        const succeeded = results.filter(r => r.success).length;
        const failed = results.length - succeeded;

        res.json({
            success: true,
            summary: { total: jids.length, succeeded, failed },
            results,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'BROADCAST_FAILED', message: err.message });
    }
});

// ── Broadcast Template ────────────────────────────────────────────────────────

const RecipientWithVars = z.object({
    phone: z.string().min(7),
    variables: z.record(z.string()).optional(),
});

const BroadcastTemplateSchema = z.object({
    recipients: z.array(RecipientWithVars).min(1).max(500),
    template: z.string().min(1).max(65536),
    delay: z.number().int().min(500).max(10000).optional(),
});

router.post('/template', async (req, res) => {
    const data = validate(BroadcastTemplateSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const entries = data.recipients.map(r => ({
            jid: toJid(r.phone),
            variables: r.variables || {},
        }));

        const results = [];
        for (const { jid, variables } of entries) {
            try {
                let text = data.template;
                for (const [k, v] of Object.entries(variables)) {
                    text = text.replaceAll(`{{${k}}}`, v);
                }
                const sent = await sock.sendMessage(jid, { text });
                results.push({ to: jid, success: true, messageId: sent?.key?.id || null });
            } catch (err) {
                results.push({ to: jid, success: false, error: err.message });
            }
            if ((data.delay ?? SEND_DELAY) > 0) await sleep(data.delay ?? SEND_DELAY);
        }

        const succeeded = results.filter(r => r.success).length;
        const failed = results.length - succeeded;

        res.json({
            success: true,
            summary: { total: entries.length, succeeded, failed },
            results,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'BROADCAST_FAILED', message: err.message });
    }
});

module.exports = router;
