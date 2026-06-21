'use strict';

/**
 * Instance management routes
 * GET  /v1/instance/status    — detailed bot status
 * GET  /v1/instance/qr        — get QR code (PNG base64) for pairing
 * POST /v1/instance/reconnect — force reconnect
 * GET  /v1/instance/info      — bot profile info
 * POST /v1/instance/presence  — set presence (online/offline/typing)
 */

const { Router } = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getWhatsAppInstance, isWhatsAppConnected } = require('../../lib/whatsappInstance');
const queue = require('../queue/messageQueue');

const router = Router();
router.use(requireAuth, rateLimit);

// Store QR code in memory as it's generated
let lastQr = null;
let lastQrTimestamp = null;

// Hook into Baileys QR events once bot loads
setImmediate(() => {
    const attach = setInterval(() => {
        const sock = getWhatsAppInstance();
        if (!sock) return;
        clearInterval(attach);

        sock.ev.on('connection.update', ({ qr }) => {
            if (qr) {
                lastQr = qr;
                lastQrTimestamp = Date.now();
            }
        });
    }, 3000);
});

// ── Status ─────────────────────────────────────────────────────────────────────

// Cache de la photo de profil (évite d'appeler WhatsApp trop souvent)
let _cachedPicUrl  = null;
let _picCacheTime  = 0;
const _PIC_TTL_MS  = 5 * 60 * 1000; // 5 min

router.get('/status', async (req, res) => {
    const sock      = getWhatsAppInstance();
    const connected = isWhatsAppConnected();
    const mem       = process.memoryUsage();
    const qStat     = queue.getStats();

    // Photo de profil (avec cache + fallback silencieux)
    if (connected && sock?.user?.id && Date.now() - _picCacheTime > _PIC_TTL_MS) {
        try {
            _cachedPicUrl = await sock.profilePictureUrl(sock.user.id, 'image');
            _picCacheTime = Date.now();
        } catch (_) {
            _cachedPicUrl = null;
        }
    }
    if (!connected) { _cachedPicUrl = null; _picCacheTime = 0; }

    res.json({
        success: true,
        instance: {
            connected,
            phone:         sock?.user?.id?.replace(/:.*@/, '@') || null,
            name:          sock?.user?.name || null,
            platform:      'Baileys',
            profilePicUrl: _cachedPicUrl,
        },
        queue: qStat,
        process: {
            uptime:  Math.floor(process.uptime()),
            pid:     process.pid,
            memory: {
                rss:      `${Math.round(mem.rss      / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
            },
            node: process.version,
        },
        timestamp: new Date().toISOString(),
    });
});

// ── QR Code ────────────────────────────────────────────────────────────────────

router.get('/qr', async (req, res) => {
    const connected = isWhatsAppConnected();

    if (connected) {
        return res.json({
            success: true,
            connected: true,
            message: 'Bot is already connected — no QR needed',
        });
    }

    if (!lastQr) {
        return res.status(503).json({
            success: false,
            error: 'QR_NOT_AVAILABLE',
            message: 'QR code not yet generated. Bot may be starting up.',
        });
    }

    const ageSeconds = Math.floor((Date.now() - lastQrTimestamp) / 1000);
    if (ageSeconds > 60) {
        return res.status(410).json({
            success: false,
            error: 'QR_EXPIRED',
            message: 'QR code expired (>60s). Restart bot to get a fresh one.',
            ageSeconds,
        });
    }

    // Generate QR as base64 PNG
    try {
        const qrcode = require('qrcode');
        const png = await qrcode.toDataURL(lastQr, { type: 'image/png', width: 300 });

        const fmt = req.query.format || 'json';

        if (fmt === 'image') {
            const buf = Buffer.from(png.replace('data:image/png;base64,', ''), 'base64');
            res.setHeader('Content-Type', 'image/png');
            return res.send(buf);
        }

        return res.json({
            success: true,
            connected: false,
            qr: lastQr,                  // raw string (for qrcode libraries)
            qrImage: png,                // base64 PNG data URL
            ageSeconds,
            expiresInSeconds: 60 - ageSeconds,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'QR_FAILED', message: err.message });
    }
});

// ── Reconnect ──────────────────────────────────────────────────────────────────

router.post('/reconnect', requirePermission('admin'), async (req, res) => {
    // Signal the bot to reconnect by exiting (panel/pm2 will restart)
    res.json({
        success: true,
        message: 'Reconnect signal sent. Bot will restart automatically.',
        warning: 'This will briefly disconnect the bot.',
    });

    setTimeout(() => {
        console.log('[API] Reconnect requested via API — restarting process...');
        process.exit(0);
    }, 1000);
});

// ── Reset session (Déconnecter) ────────────────────────────────────────────────
// POST /reset — supprime la session WhatsApp et redémarre le bot (nouveau QR requis)

router.post('/reset', requirePermission('admin'), async (req, res) => {
    const fs   = require('fs');
    const path = require('path');

    res.json({
        success: true,
        message: 'Session reset en cours. Le bot va redémarrer et demander un nouveau QR.',
    });

    setTimeout(() => {
        try {
            // Supprimer le dossier de session Baileys
            const sessionDirs = ['./auth_info_baileys', './session', './auth_info', './baileys_auth_info'];
            for (const dir of sessionDirs) {
                const full = path.resolve(dir);
                if (fs.existsSync(full)) {
                    fs.rmSync(full, { recursive: true, force: true });
                    console.log(`[API] Session supprimée: ${full}`);
                }
            }
        } catch (e) {
            console.error('[API] Erreur suppression session:', e.message);
        }
        console.log('[API] Reset session via API — redémarrage...');
        process.exit(0);
    }, 800);
});

// ── Bot Profile Info ───────────────────────────────────────────────────────────

router.get('/info', async (req, res) => {
    const sock = getWhatsAppInstance();
    if (!sock) {
        return res.status(503).json({ success: false, error: 'BOT_NOT_CONNECTED' });
    }

    try {
        const user = sock.user;
        res.json({
            success: true,
            info: {
                jid: user?.id || null,
                phone: user?.id?.replace(/:.*@/, '@').replace('@s.whatsapp.net', '') || null,
                name: user?.name || null,
                platform: 'WhatsApp',
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Set Presence ───────────────────────────────────────────────────────────────

router.post('/presence', async (req, res) => {
    const sock = getWhatsAppInstance();
    if (!sock) return res.status(503).json({ success: false, error: 'BOT_NOT_CONNECTED' });

    const { type, to } = req.body;
    const validTypes = ['available', 'unavailable', 'composing', 'recording', 'paused'];

    if (!validTypes.includes(type)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_PRESENCE_TYPE',
            validTypes,
        });
    }

    try {
        if (to) {
            const { toJid } = require('../utils/phone');
            await sock.sendPresenceUpdate(type, toJid(to));
        } else {
            await sock.sendPresenceUpdate(type);
        }
        res.json({ success: true, type, to: to || 'global' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FAILED', message: err.message });
    }
});

// ── Pairing Code ───────────────────────────────────────────────────────────────
// POST /pair — request an 8-digit pairing code for a phone number
// The bot must not yet be registered. Call once per fresh session.

let lastPairingCode = null;
let lastPairingPhone = null;

router.post('/pair', async (req, res) => {
    const connected = isWhatsAppConnected();
    if (connected) {
        return res.json({ success: true, connected: true, message: 'Bot is already connected.' });
    }

    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'MISSING_PHONE', message: 'Provide phone number in body: { "phone": "2420612345678" }' });
    }

    const cleanPhone = String(phone).replace(/[^\d]/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
        return res.status(400).json({ success: false, error: 'INVALID_PHONE', message: 'Phone number must be 7–15 digits (no + or spaces).' });
    }

    // If same phone was already paired in this session, return cached code
    if (lastPairingCode && lastPairingPhone === cleanPhone) {
        return res.json({ success: true, code: lastPairingCode, cached: true });
    }

    const sock = getWhatsAppInstance();
    if (!sock) {
        return res.status(503).json({ success: false, error: 'BOT_NOT_STARTED', message: 'WhatsApp socket not initialized yet. Wait a few seconds and retry.' });
    }

    try {
        let code = await sock.requestPairingCode(cleanPhone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        lastPairingCode  = code;
        lastPairingPhone = cleanPhone;

        // Clear cache after 3 minutes
        setTimeout(() => { lastPairingCode = null; lastPairingPhone = null; }, 3 * 60 * 1000);

        res.json({ success: true, code, phone: cleanPhone });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'PAIR_FAILED',
            message: err.message || 'Failed to generate pairing code. The bot may already be registered — use /reconnect to reset.',
        });
    }
});

// ── Queue management ───────────────────────────────────────────────────────────

router.get('/queue', (req, res) => {
    res.json({ success: true, ...queue.getStats() });
});

router.delete('/queue', requirePermission('admin'), (req, res) => {
    const priority = req.query.priority || null;
    const cleared = queue.clearQueue(priority);
    res.json({ success: true, cleared, message: `Cleared ${cleared} jobs` });
});

router.get('/queue/:jobId', (req, res) => {
    const job = queue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'JOB_NOT_FOUND' });
    res.json({ success: true, job });
});

module.exports = router;
