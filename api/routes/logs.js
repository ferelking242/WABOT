'use strict';

/**
 * Message log routes
 * GET  /v1/logs           — query message history
 * GET  /v1/logs/stats     — stats summary
 * GET  /v1/logs/:id       — single log entry
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { queryLogs, getStats } = require('../utils/messageLog');

const router = Router();
router.use(requireAuth, rateLimit);

// ── Query logs ─────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    const { to, status, type, from, to_ts, limit, offset } = req.query;

    const filters = {
        apiKeyId: req.apiKey.id,
        to,
        status,
        type,
        from: from ? parseInt(from) : undefined,
        to_ts: to_ts ? parseInt(to_ts) : undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    };

    const result = queryLogs(filters);
    res.json({ success: true, ...result });
});

// ── Stats ──────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
    const stats = getStats(req.apiKey.id);
    res.json({ success: true, ...stats });
});

module.exports = router;
