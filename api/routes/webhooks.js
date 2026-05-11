'use strict';

/**
 * Webhook management routes
 * GET    /v1/webhooks       — list webhooks for this API key
 * POST   /v1/webhooks       — register a new webhook
 * DELETE /v1/webhooks/:id   — remove a webhook
 * POST   /v1/webhooks/:id/test — send a test event
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { registerWebhook, listWebhooks, deleteWebhook, deliverEvent } = require('../utils/webhook');

const router = Router();
router.use(requireAuth, requirePermission('webhooks'), rateLimit);

function validate(schema, body, res) {
    const result = schema.safeParse(body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: result.error.errors });
        return null;
    }
    return result.data;
}

const VALID_EVENTS = [
    'message.received',
    'message.sent',
    'otp.sent',
    'otp.verified',
    'otp.resent',
    'broadcast.completed',
    '*',
];

// ── List Webhooks ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    const hooks = listWebhooks(req.apiKey.id);
    res.json({ success: true, total: hooks.length, webhooks: hooks });
});

// ── Register Webhook ──────────────────────────────────────────────────────────

const RegisterSchema = z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1).default(['message.received']),
    secret: z.string().min(8).optional(),
});

router.post('/', (req, res) => {
    const data = validate(RegisterSchema, req.body, res);
    if (!data) return;

    // Validate event names
    const invalid = data.events.filter(e => !VALID_EVENTS.includes(e));
    if (invalid.length) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_EVENTS',
            message: `Unknown event(s): ${invalid.join(', ')}`,
            validEvents: VALID_EVENTS,
        });
    }

    const hook = registerWebhook({
        url: data.url,
        events: data.events,
        secret: data.secret || null,
        apiKeyId: req.apiKey.id,
    });

    res.status(201).json({ success: true, webhook: hook });
});

// ── Delete Webhook ────────────────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
    const deleted = deleteWebhook(req.params.id);
    if (!deleted) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Webhook not found' });
    }
    res.json({ success: true, message: 'Webhook deleted' });
});

// ── Test Webhook ──────────────────────────────────────────────────────────────

router.post('/:id/test', async (req, res) => {
    const hooks = listWebhooks(req.apiKey.id);
    const hook = hooks.find(h => h.id === req.params.id);

    if (!hook) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Webhook not found' });
    }

    await deliverEvent('message.sent', {
        test: true,
        to: '1234567890@s.whatsapp.net',
        messageId: 'test-msg-id',
        content: { text: 'This is a test event from wabot API' },
    });

    res.json({ success: true, message: 'Test event delivered to webhook' });
});

module.exports = router;
