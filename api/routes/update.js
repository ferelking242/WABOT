'use strict';

/**
 * Update routes — GitHub webhook + manual trigger
 *
 * POST /v1/update/github-webhook  — GitHub push webhook receiver
 * POST /v1/update/apply           — Manual update trigger (admin)
 * POST /v1/update/rollback        — Manual rollback to previous (admin)
 * GET  /v1/update/status          — Current update state
 */

const { Router } = require('express');
const crypto = require('crypto');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { hasPermission } = require('../utils/apiKeys');

const router = Router();

function isAdmin(req) {
    return hasPermission(req.apiKey, '*') || hasPermission(req.apiKey, 'admin');
}

// ── GitHub Webhook (raw body needed for HMAC) ──────────────────────────────────

const express = require('express');

router.post('/github-webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;

        if (secret) {
            const sig = req.headers['x-hub-signature-256'];
            if (!sig) return res.status(401).json({ error: 'Missing signature' });

            const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.body).digest('hex')}`;
            if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        let payload;
        try { payload = JSON.parse(req.body); }
        catch { return res.status(400).json({ error: 'Invalid JSON' }); }

        const event = req.headers['x-github-event'];

        if (event === 'push') {
            const newSha = payload.after;
            const branch = (payload.ref || '').replace('refs/heads/', '');
            const targetBranch = process.env.GITHUB_BRANCH || 'main';

            if (branch !== targetBranch) {
                return res.json({ message: `Ignoring push to branch: ${branch}` });
            }

            res.json({
                success: true,
                message: 'Update triggered',
                sha: newSha,
                branch,
            });

            // Trigger update asynchronously
            setImmediate(async () => {
                try {
                    const { applyUpdate } = require('../../lib/autoUpdater');
                    await applyUpdate(newSha);
                } catch (err) {
                    console.error('[Update webhook] Error:', err.message);
                }
            });
        } else {
            res.json({ message: `Event '${event}' acknowledged but not handled` });
        }
    }
);

// ── Auth required for remaining routes ────────────────────────────────────────

router.use(requireAuth, rateLimit);

// ── Status ────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
    try {
        const { getStatus } = require('../../lib/autoUpdater');
        res.json({ success: true, update: getStatus() });
    } catch {
        res.json({ success: true, update: { error: 'AutoUpdater not loaded' } });
    }
});

// ── Manual update (admin) ──────────────────────────────────────────────────────

router.post('/apply', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ success: false, error: 'ADMIN_REQUIRED' });
    }

    const { sha } = req.body;
    if (!sha) return res.status(400).json({ success: false, error: 'sha required in body' });

    res.json({ success: true, message: 'Update applying in background...', sha });

    setImmediate(async () => {
        try {
            const { applyUpdate } = require('../../lib/autoUpdater');
            await applyUpdate(sha);
        } catch (err) {
            console.error('[Update apply] Error:', err.message);
        }
    });
});

// ── Manual rollback (admin) ───────────────────────────────────────────────────

router.post('/rollback', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ success: false, error: 'ADMIN_REQUIRED' });
    }

    const fs   = require('fs');
    const path = require('path');
    const ROOT  = path.join(__dirname, '..', '..'); // wabot/
    const STATE_FILE = path.join(ROOT, '.wabot_state.json');

    let state;
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
    catch { return res.status(404).json({ success: false, error: 'No update state found' }); }

    if (!state.backupDir || !fs.existsSync(state.backupDir)) {
        return res.status(404).json({ success: false, error: 'No backup available for rollback' });
    }

    res.json({ success: true, message: 'Rolling back to previous build...', previousSha: state.previousSha });

    setImmediate(() => {
        try {
            function restoreDir(dir, rel) {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const entryRel = path.join(rel, entry.name);
                    const src = path.join(dir, entry.name);
                    const dest = path.join(ROOT, entryRel);
                    if (entry.isDirectory()) {
                        restoreDir(src, entryRel);
                    } else {
                        fs.mkdirSync(path.dirname(dest), { recursive: true });
                        fs.copyFileSync(src, dest);
                    }
                }
            }
            restoreDir(state.backupDir, '');
            fs.writeFileSync(STATE_FILE, JSON.stringify({
                currentSha: state.previousSha,
                pendingValidation: false,
                lastRollback: new Date().toISOString(),
                rollbackReason: 'Manual rollback via API',
            }, null, 2));
            console.log('[Update] Manual rollback complete — restarting...');
            setTimeout(() => process.exit(0), 1000);
        } catch (err) {
            console.error('[Update rollback] Error:', err.message);
        }
    });
});

module.exports = router;
