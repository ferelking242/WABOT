'use strict';

/**
 * Contact routes
 * GET  /v1/contacts/check        — check if phone(s) are on WhatsApp
 * GET  /v1/contacts/:phone/info  — get profile info (name, about, pic)
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getWhatsAppInstance } = require('../../lib/whatsappInstance');
const { toJid } = require('../utils/phone');

const router = Router();
router.use(requireAuth, requirePermission('messages'), rateLimit);

function validate(schema, body, res) {
    const r = schema.safeParse(body);
    if (!r.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: r.error.errors });
        return null;
    }
    return r.data;
}

function getSock(res) {
    const sock = getWhatsAppInstance();
    if (!sock) {
        res.status(503).json({ success: false, error: 'BOT_NOT_CONNECTED' });
        return null;
    }
    return sock;
}

// ── Check if phone(s) are on WhatsApp ─────────────────────────────────────────

const CheckSchema = z.object({
    phones: z.array(z.string().min(7)).min(1).max(50),
});

router.post('/check', async (req, res) => {
    const data = validate(CheckSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jids = data.phones.map(toJid);
        // onWhatsApp returns array of { exists, jid, lid }
        const results = await sock.onWhatsApp(...jids);

        const map = {};
        for (const r of (results || [])) {
            map[r.jid] = r.exists;
        }

        const output = data.phones.map((phone, i) => ({
            phone,
            jid: jids[i],
            exists: map[jids[i]] ?? false,
        }));

        res.json({
            success: true,
            total: output.length,
            registered: output.filter(o => o.exists).length,
            results: output,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'CHECK_FAILED', message: err.message });
    }
});

// ── Single check via query param ───────────────────────────────────────────────

router.get('/check', async (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ success: false, error: 'MISSING_PHONE' });

    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toJid(phone);
        const results = await sock.onWhatsApp(jid);
        const exists = results?.[0]?.exists ?? false;
        res.json({ success: true, phone, jid, exists });
    } catch (err) {
        res.status(500).json({ success: false, error: 'CHECK_FAILED', message: err.message });
    }
});

// ── Get profile info ───────────────────────────────────────────────────────────

router.get('/:phone/info', async (req, res) => {
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toJid(req.params.phone);

        // Fetch profile picture URL
        let profilePicUrl = null;
        try {
            profilePicUrl = await sock.profilePictureUrl(jid, 'image');
        } catch { /* no pic */ }

        // Fetch status/about
        let status = null;
        try {
            const statusResult = await sock.fetchStatus(jid);
            status = statusResult?.status || null;
        } catch { /* no status */ }

        res.json({
            success: true,
            contact: {
                phone: req.params.phone,
                jid,
                profilePicUrl,
                status,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

module.exports = router;
