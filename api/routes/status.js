'use strict';

const { Router } = require('express');
const { getWhatsAppInstance, isWhatsAppConnected } = require('../../lib/whatsappInstance');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = Router();

/**
 * GET /v1/health
 * Public health check — no auth required
 */
router.get('/health', (req, res) => {
    const connected = isWhatsAppConnected();
    res.status(connected ? 200 : 503).json({
        success: true,
        status: connected ? 'ok' : 'degraded',
        whatsapp: connected ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /v1/status
 * Bot status — requires auth
 */
router.get('/status', requireAuth, rateLimit, (req, res) => {
    const sock = getWhatsAppInstance();
    const connected = isWhatsAppConnected();

    const mem = process.memoryUsage();

    res.json({
        success: true,
        bot: {
            connected,
            phone: sock?.user?.id?.replace(/:.*@/, '@') || null,
            name: sock?.user?.name || null,
            platform: sock?.ws?.socket?.localAddress || null,
        },
        process: {
            uptime: Math.floor(process.uptime()),
            memory: {
                rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
            },
            nodeVersion: process.version,
            pid: process.pid,
        },
        api: {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
        },
    });
});

/**
 * GET /v1/metrics
 * Usage metrics — requires auth
 */
router.get('/metrics', requireAuth, rateLimit, (req, res) => {
    const { listApiKeys } = require('../utils/apiKeys');
    const { listWebhooks } = require('../utils/webhook');

    const keys = listApiKeys();
    const hooks = listWebhooks();

    res.json({
        success: true,
        metrics: {
            apiKeys: {
                total: keys.length,
                active: keys.filter(k => k.active).length,
            },
            webhooks: {
                total: hooks.length,
                totalDeliveries: hooks.reduce((s, h) => s + (h.deliveries || 0), 0),
            },
            uptime: Math.floor(process.uptime()),
            memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
