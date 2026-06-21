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

// ── Check latest SHA from GitHub ──────────────────────────────────────────────

router.get('/check', async (req, res) => {
    try {
        const https   = require('https');
        const owner   = process.env.GITHUB_REPO_OWNER || 'ferelking242';
        const repo    = process.env.GITHUB_REPO_NAME  || 'WABOT';
        const branch  = process.env.GITHUB_BRANCH     || 'main';

        const latestSha = await new Promise((resolve, reject) => {
            const opts = {
                hostname: 'api.github.com',
                path:     `/repos/${owner}/${repo}/commits/${branch}`,
                headers: {
                    'User-Agent': 'wabot-updater',
                    'Accept':     'application/vnd.github.v3+json',
                    ...(process.env.GITHUB_TOKEN
                        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
                        : {}),
                },
            };
            https.get(opts, (r) => {
                let data = '';
                r.on('data', (c) => { data += c; });
                r.on('end', () => {
                    try { resolve(JSON.parse(data).sha || null); }
                    catch { reject(new Error('Réponse GitHub invalide')); }
                });
            }).on('error', reject);
        });

        let currentSha = null;
        try {
            const { getStatus } = require('../../lib/autoUpdater');
            currentSha = getStatus().currentSha || null;
        } catch { /* autoUpdater pas encore initialisé */ }

        const hasUpdate = !!(latestSha && currentSha && latestSha !== currentSha);
        res.json({ success: true, latestSha, currentSha, hasUpdate });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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

// ── Bundle update for Android (bot runs as esbuild bundle) ───────────────────

router.get('/check-bundle', async (req, res) => {
    try {
        const https = require('https');
        const fs    = require('fs');
        const path  = require('path');

        // SHA du dernier commit qui a touché bundle.js dans wabot_app
        const latestSha = await new Promise((resolve, reject) => {
            const opts = {
                hostname: 'api.github.com',
                path: '/repos/ferelking242/wabot_app/commits?path=wabot-android-src/bundle.js&per_page=1',
                headers: {
                    'User-Agent': 'wabot-updater',
                    'Accept':     'application/vnd.github.v3+json',
                    ...(process.env.GITHUB_TOKEN
                        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
                        : {}),
                },
            };
            https.get(opts, (r) => {
                let data = '';
                r.on('data', c => { data += c; });
                r.on('end', () => {
                    try {
                        const arr = JSON.parse(data);
                        if (Array.isArray(arr) && arr[0]) resolve(arr[0].sha);
                        else resolve(null);
                    } catch { reject(new Error('Réponse GitHub invalide')); }
                });
            }).on('error', reject);
        });

        // SHA du bundle actuellement en cours d'exécution
        const stateFile = path.join(path.dirname(process.argv[1]), '.bundle_state.json');
        let currentSha = null;
        try {
            const s = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            currentSha = s.bundleSha || null;
        } catch { /* première exécution, pas encore de state */ }

        const hasUpdate = !!(latestSha && currentSha && latestSha !== currentSha);
        res.json({ success: true, latestSha, currentSha, hasUpdate });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/apply-bundle', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ success: false, error: 'ADMIN_REQUIRED' });
    }

    const { sha } = req.body;
    res.json({ success: true, message: 'Téléchargement du bundle en cours…', sha });

    setImmediate(async () => {
        const https   = require('https');
        const fs      = require('fs');
        const path    = require('path');

        const bundleUrl  = 'https://raw.githubusercontent.com/ferelking242/wabot_app/main/wabot-android-src/bundle.js';
        const targetPath = process.argv[1]; // chemin réel de main.js qui tourne
        const tmpPath    = targetPath + '.tmp';
        const stateFile  = path.join(path.dirname(targetPath), '.bundle_state.json');

        console.log('[BundleUpdate] 🔽 Téléchargement depuis:', bundleUrl);
        console.log('[BundleUpdate] 📁 Cible:', targetPath);

        try {
            const content = await new Promise((resolve, reject) => {
                https.get(bundleUrl, (r) => {
                    if (r.statusCode !== 200) {
                        reject(new Error(`HTTP ${r.statusCode} en téléchargeant le bundle`));
                        return;
                    }
                    const chunks = [];
                    r.on('data', c => chunks.push(c));
                    r.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
                }).on('error', reject);
            });

            // Écriture atomique : tmp puis rename
            fs.writeFileSync(tmpPath, content, 'utf-8');
            fs.renameSync(tmpPath, targetPath);

            // Mémoriser la version installée
            fs.writeFileSync(stateFile, JSON.stringify({
                bundleSha: sha || 'unknown',
                updatedAt: new Date().toISOString(),
            }, null, 2));

            console.log(`[BundleUpdate] ✅ bundle.js écrit (${(content.length / 1024).toFixed(0)} KB) — redémarrage dans 1s…`);
            setTimeout(() => process.exit(0), 1000);
        } catch (err) {
            console.error('[BundleUpdate] ❌ Échec:', err.message);
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
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
