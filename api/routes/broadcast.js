'use strict';

/**
 * Broadcast / bulk messaging routes — v2 with queue + quota
 *
 * POST /v1/broadcast           — text to multiple numbers
 * POST /v1/broadcast/image     — image to multiple numbers
 * POST /v1/broadcast/template  — personalized template per recipient
 * POST /v1/broadcast/schedule  — schedule bulk send at specific time
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { quotaMiddleware } = require('../utils/quota');
const { logMessage } = require('../utils/messageLog');
const queue = require('../queue/messageQueue');
const { toJid } = require('../utils/phone');
const axios = require('axios');

const router = Router();
router.use(requireAuth, requirePermission('broadcast'), rateLimit);

function validate(schema, body, res) {
    const r = schema.safeParse(body);
    if (!r.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: r.error.errors });
        return null;
    }
    return r.data;
}

async function fetchBuffer(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
}

/**
 * Enqueue a batch and return immediately
 */
function enqueueBatch(res, jobs, apiKey) {
    const results = jobs.map(({ jid, content, type, meta, scheduledAt }) => {
        const { jobId } = queue.enqueue({
            jid,
            content,
            priority: 'low',   // Broadcasts always low priority
            typing: false,
            scheduledAt: scheduledAt || null,
            apiKeyId: apiKey.id,
            meta: { type, ...meta },
        });
        logMessage({ to: jid, type, status: 'queued', jobId, apiKeyId: apiKey.id });
        return { to: jid, jobId, status: 'queued' };
    });

    res.status(202).json({
        success: true,
        total: results.length,
        status: 'queued',
        message: `${results.length} messages queued for delivery`,
        jobs: results,
        queueStatusUrl: '/api/v1/messages/queue',
        timestamp: new Date().toISOString(),
    });
}

// ── Broadcast Text ────────────────────────────────────────────────────────────

const BroadcastTextSchema = z.object({
    recipients: z.array(z.string().min(7)).min(1).max(500),
    text: z.string().min(1).max(65536),
    scheduledAt: z.number().int().optional(),
});

router.post('/', (req, res, next) => {
    const data = validate(BroadcastTextSchema, req.body, res);
    if (!data) return;
    // Check quota for total count
    const { consume } = require('../utils/quota');
    const check = consume(req.apiKey.id, data.recipients.length);
    if (!check.allowed) {
        return res.status(429).json({
            success: false,
            error: 'QUOTA_EXCEEDED',
            message: `Batch of ${data.recipients.length} would exceed daily quota`,
            quota: check,
        });
    }

    const jobs = data.recipients.map(phone => ({
        jid: toJid(phone),
        content: { text: data.text },
        type: 'text',
        meta: {},
        scheduledAt: data.scheduledAt,
    }));

    enqueueBatch(res, jobs, req.apiKey);
});

// ── Broadcast Image ───────────────────────────────────────────────────────────

const BroadcastImageSchema = z.object({
    recipients: z.array(z.string().min(7)).min(1).max(200),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
    scheduledAt: z.number().int().optional(),
});

router.post('/image', async (req, res) => {
    const data = validate(BroadcastImageSchema, req.body, res);
    if (!data) return;

    const { consume } = require('../utils/quota');
    const check = consume(req.apiKey.id, data.recipients.length);
    if (!check.allowed) {
        return res.status(429).json({
            success: false,
            error: 'QUOTA_EXCEEDED',
            message: `Batch of ${data.recipients.length} would exceed daily quota`,
            quota: check,
        });
    }

    try {
        const image = await fetchBuffer(data.url);
        const jobs = data.recipients.map(phone => ({
            jid: toJid(phone),
            content: { image, caption: data.caption },
            type: 'image',
            meta: {},
            scheduledAt: data.scheduledAt,
        }));
        enqueueBatch(res, jobs, req.apiKey);
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
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
    scheduledAt: z.number().int().optional(),
});

router.post('/template', (req, res) => {
    const data = validate(BroadcastTemplateSchema, req.body, res);
    if (!data) return;

    const { consume } = require('../utils/quota');
    const check = consume(req.apiKey.id, data.recipients.length);
    if (!check.allowed) {
        return res.status(429).json({
            success: false,
            error: 'QUOTA_EXCEEDED',
            quota: check,
        });
    }

    const jobs = data.recipients.map(({ phone, variables }) => {
        let text = data.template;
        if (variables) {
            for (const [k, v] of Object.entries(variables)) {
                text = text.replaceAll(`{{${k}}}`, v);
            }
        }
        return {
            jid: toJid(phone),
            content: { text },
            type: 'template',
            meta: { variables },
            scheduledAt: data.scheduledAt,
        };
    });

    enqueueBatch(res, jobs, req.apiKey);
});

// ── Scheduled Broadcast ───────────────────────────────────────────────────────

const ScheduledBroadcastSchema = z.object({
    recipients: z.array(z.string().min(7)).min(1).max(500),
    text: z.string().min(1).max(65536),
    sendAt: z.string().datetime(),
});

router.post('/schedule', (req, res) => {
    const data = validate(ScheduledBroadcastSchema, req.body, res);
    if (!data) return;

    const scheduledAt = new Date(data.sendAt).getTime();
    if (isNaN(scheduledAt) || scheduledAt < Date.now()) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_SCHEDULE',
            message: 'sendAt must be a future ISO 8601 datetime',
        });
    }

    const { consume } = require('../utils/quota');
    const check = consume(req.apiKey.id, data.recipients.length);
    if (!check.allowed) {
        return res.status(429).json({ success: false, error: 'QUOTA_EXCEEDED', quota: check });
    }

    const jobs = data.recipients.map(phone => ({
        jid: toJid(phone),
        content: { text: data.text },
        type: 'text',
        meta: { scheduledFor: data.sendAt },
        scheduledAt,
    }));

    enqueueBatch(res, jobs, req.apiKey);
});

module.exports = router;
