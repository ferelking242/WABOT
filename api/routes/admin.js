'use strict';

/**
 * Admin routes — API key management + quota + plan management
 *
 * GET    /v1/admin/keys              — list all keys
 * POST   /v1/admin/keys              — create a new key
 * PATCH  /v1/admin/keys/:id/revoke   — revoke a key
 * DELETE /v1/admin/keys/:id          — delete a key
 * GET    /v1/admin/quotas            — list all quotas
 * GET    /v1/admin/quotas/:id        — quota info for one key
 * PATCH  /v1/admin/quotas/:id        — set plan/limit for key
 * GET    /v1/admin/stats             — global message stats
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { createApiKey, listApiKeys, revokeApiKey, deleteApiKey, hasPermission } = require('../utils/apiKeys');
const { setPlan, getQuotaInfo, listQuotas, PLAN_LIMITS } = require('../utils/quota');
const { getStats } = require('../utils/messageLog');
const queue = require('../queue/messageQueue');

const router = Router();

// Admin routes require auth and admin or wildcard permission
router.use(requireAuth, rateLimit, (req, res, next) => {
    if (!hasPermission(req.apiKey, '*') && !hasPermission(req.apiKey, 'admin')) {
        return res.status(403).json({
            success: false,
            error: 'ADMIN_REQUIRED',
            message: "This endpoint requires the 'admin' or '*' permission",
        });
    }
    next();
});

function validate(schema, body, res) {
    const r = schema.safeParse(body);
    if (!r.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: r.error.errors });
        return null;
    }
    return r.data;
}

const VALID_PERMS = ['messages', 'verify', 'broadcast', 'groups', 'webhooks', 'status', 'admin', '*'];
const VALID_PLANS = Object.keys(PLAN_LIMITS);

// ── Keys ──────────────────────────────────────────────────────────────────────

router.get('/keys', (req, res) => {
    const keys = listApiKeys();
    res.json({ success: true, total: keys.length, keys });
});

const CreateKeySchema = z.object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.string()).min(1).default(['messages', 'verify', 'broadcast', 'groups', 'status']),
    rateLimit: z.number().int().min(1).max(10000).optional(),
    plan: z.string().optional(),
});

router.post('/keys', (req, res) => {
    const data = validate(CreateKeySchema, req.body, res);
    if (!data) return;

    const invalid = data.permissions.filter(p => !VALID_PERMS.includes(p));
    if (invalid.length) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_PERMISSIONS',
            message: `Unknown permission(s): ${invalid.join(', ')}`,
            validPermissions: VALID_PERMS,
        });
    }

    const newKey = createApiKey({
        name: data.name,
        permissions: data.permissions,
        rateLimit: data.rateLimit || 60,
    });

    // Set plan if provided
    if (data.plan) {
        setPlan(newKey.id, data.plan);
    }

    res.status(201).json({
        success: true,
        message: 'API key created. Save the key — it will NOT be shown again.',
        apiKey: newKey,
    });
});

router.patch('/keys/:id/revoke', (req, res) => {
    const revoked = revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({ success: true, message: 'API key revoked' });
});

router.delete('/keys/:id', (req, res) => {
    if (req.params.id === req.apiKey.id) {
        return res.status(400).json({ success: false, error: 'SELF_DELETE', message: 'Cannot delete your own active key' });
    }
    const deleted = deleteApiKey(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({ success: true, message: 'API key deleted' });
});

// ── Quotas ────────────────────────────────────────────────────────────────────

router.get('/quotas', (req, res) => {
    const quotas = listQuotas();
    res.json({
        success: true,
        plans: Object.fromEntries(
            Object.entries(PLAN_LIMITS).map(([k, v]) => [k, v === Infinity ? 'unlimited' : v])
        ),
        quotas,
    });
});

router.get('/quotas/:id', (req, res) => {
    const info = getQuotaInfo(req.params.id);
    res.json({ success: true, quota: info });
});

const SetPlanSchema = z.object({
    plan: z.string().optional(),
    customLimit: z.number().int().min(0).optional(),
}).refine(d => d.plan || d.customLimit !== undefined, { message: 'Provide plan or customLimit' });

router.patch('/quotas/:id', (req, res) => {
    const data = validate(SetPlanSchema, req.body, res);
    if (!data) return;

    if (data.plan && !VALID_PLANS.includes(data.plan)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_PLAN',
            message: `Unknown plan: ${data.plan}`,
            validPlans: VALID_PLANS,
        });
    }

    setPlan(req.params.id, data.plan || 'custom', data.customLimit ?? null);
    const info = getQuotaInfo(req.params.id);
    res.json({ success: true, quota: info });
});

// ── Global stats ───────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
    const msgStats = getStats(); // all keys
    const qStats = queue.getStats();
    const keys = listApiKeys();

    res.json({
        success: true,
        messages: msgStats,
        queue: qStats,
        keys: {
            total: keys.length,
            active: keys.filter(k => k.active).length,
        },
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
