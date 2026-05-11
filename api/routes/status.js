'use strict';

const { Router } = require('express');
const { getWhatsAppInstance, isWhatsAppConnected } = require('../../lib/whatsappInstance');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = Router();

/**
 * GET /v1/health
 * Public — no auth required. Used by health checks, monitors, and the Flutter app.
 */
router.get('/health', (req, res) => {
    const connected = isWhatsAppConnected();
    const { getPublicUrl } = require('../server');

    res.status(connected ? 200 : 503).json({
        success: true,
        status: connected ? 'ok' : 'degraded',
        whatsapp: connected ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        publicUrl: getPublicUrl(),
        apiBase: `${getPublicUrl()}/api/v1`,
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /v1/status
 * Full bot status — auth required
 */
router.get('/status', requireAuth, rateLimit, (req, res) => {
    const sock = getWhatsAppInstance();
    const connected = isWhatsAppConnected();
    const mem = process.memoryUsage();
    const { getPublicUrl } = require('../server');

    let updateStatus = null;
    try {
        const { getStatus } = require('../../lib/autoUpdater');
        updateStatus = getStatus();
    } catch { /* updater may not be loaded yet */ }

    res.json({
        success: true,
        bot: {
            connected,
            phone: sock?.user?.id?.replace(/:.*@/, '@') || null,
            name: sock?.user?.name || null,
        },
        api: {
            version: '2.0.0',
            publicUrl: getPublicUrl(),
            apiBase: `${getPublicUrl()}/api/v1`,
            docsUrl: `${getPublicUrl()}/api/v1/docs`,
            port: parseInt(process.env.API_PORT || '3001'),
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
            env: process.env.NODE_ENV || 'production',
        },
        update: updateStatus,
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /v1/metrics
 */
router.get('/metrics', requireAuth, rateLimit, (req, res) => {
    const { listApiKeys } = require('../utils/apiKeys');
    const { listWebhooks } = require('../utils/webhook');
    const queue = require('../queue/messageQueue');

    const keys = listApiKeys();
    const hooks = listWebhooks();
    const qStats = queue.getStats();

    res.json({
        success: true,
        metrics: {
            apiKeys: { total: keys.length, active: keys.filter(k => k.active).length },
            webhooks: {
                total: hooks.length,
                totalDeliveries: hooks.reduce((s, h) => s + (h.deliveries || 0), 0),
            },
            queue: qStats,
            uptime: Math.floor(process.uptime()),
            memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
