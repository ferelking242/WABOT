'use strict';

/**
 * Admin routes — API key management
 * All routes require a key with '*' or 'admin' permission
 *
 * GET    /v1/admin/keys         — list all keys
 * POST   /v1/admin/keys         — create a new key
 * DELETE /v1/admin/keys/:id     — revoke/delete a key
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { createApiKey, listApiKeys, revokeApiKey, deleteApiKey, hasPermission } = require('../utils/apiKeys');

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
    const result = schema.safeParse(body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: result.error.errors });
        return null;
    }
    return result.data;
}

const VALID_PERMS = ['messages', 'verify', 'broadcast', 'groups', 'webhooks', 'status', 'admin', '*'];

// ── List Keys ─────────────────────────────────────────────────────────────────

router.get('/keys', (req, res) => {
    const keys = listApiKeys();
    res.json({ success: true, total: keys.length, keys });
});

// ── Create Key ────────────────────────────────────────────────────────────────

const CreateKeySchema = z.object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.string()).min(1).default(['messages', 'verify', 'broadcast', 'groups', 'status']),
    rateLimit: z.number().int().min(1).max(10000).optional(),
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

    res.status(201).json({
        success: true,
        message: 'API key created. Save the key — it will NOT be shown again.',
        apiKey: newKey,
    });
});

// ── Revoke Key ────────────────────────────────────────────────────────────────

router.patch('/keys/:id/revoke', (req, res) => {
    const revoked = revokeApiKey(req.params.id);
    if (!revoked) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'API key not found' });
    }
    res.json({ success: true, message: 'API key revoked' });
});

// ── Delete Key ────────────────────────────────────────────────────────────────

router.delete('/keys/:id', (req, res) => {
    // Prevent self-deletion
    if (req.params.id === req.apiKey.id) {
        return res.status(400).json({ success: false, error: 'SELF_DELETE', message: 'Cannot delete your own active key' });
    }
    const deleted = deleteApiKey(req.params.id);
    if (!deleted) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'API key not found' });
    }
    res.json({ success: true, message: 'API key deleted' });
});

module.exports = router;
