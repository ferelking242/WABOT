'use strict';

/**
 * OTP Verification routes
 * POST /v1/verify/send    — generate & send OTP via WhatsApp
 * POST /v1/verify/check   — validate an OTP code
 * POST /v1/verify/resend  — regenerate & resend OTP
 * GET  /v1/verify/:id     — get OTP status (no code exposed)
 * DELETE /v1/verify/:id   — cancel OTP
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getWhatsAppInstance } = require('../../lib/whatsappInstance');
const { createOtp, verifyOtp, cancelOtp, getOtpInfo, refreshOtp } = require('../utils/otp');
const { toJid } = require('../utils/phone');
const { deliverEvent } = require('../utils/webhook');

const router = Router();
router.use(requireAuth, requirePermission('verify'), rateLimit);

function validate(schema, body, res) {
    const result = schema.safeParse(body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: result.error.errors });
        return null;
    }
    return result.data;
}

function getSock(res) {
    const sock = getWhatsAppInstance();
    if (!sock) {
        res.status(503).json({
            success: false,
            error: 'BOT_NOT_CONNECTED',
            message: 'WhatsApp bot is not connected. Try again shortly.',
        });
        return null;
    }
    return sock;
}

// Default OTP message template
const DEFAULT_TEMPLATE =
    '🔐 *Verification Code*\n\nYour code is: *{{code}}*\n\n⏳ Valid for {{minutes}} minutes.\nDo not share this code with anyone.';

// ── Send OTP ──────────────────────────────────────────────────────────────────

const SendSchema = z.object({
    phone: z.string().min(7).max(20),
    template: z.string().optional(),          // Custom message template (use {{code}} & {{minutes}})
    codeLength: z.number().int().min(4).max(8).optional(),
    expirySeconds: z.number().int().min(60).max(600).optional(),
    sender: z.string().optional(),            // Bot identifier / app name (cosmetic)
});

router.post('/send', async (req, res) => {
    const data = validate(SendSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toJid(data.phone);
        const expirySeconds = data.expirySeconds || 300;
        const phone = data.phone.replace(/[\s+\-().]/g, '').replace(/^00/, '');

        const { requestId, code, expiresAt } = createOtp(phone, {
            length: data.codeLength || 6,
            expirySeconds,
        });

        // Build message text
        const template = data.template || DEFAULT_TEMPLATE;
        const minutes = Math.round(expirySeconds / 60);
        const text = template
            .replaceAll('{{code}}', code)
            .replaceAll('{{minutes}}', String(minutes))
            .replaceAll('{{phone}}', phone)
            .replaceAll('{{sender}}', data.sender || 'wabot');

        await sock.sendMessage(jid, { text });

        await deliverEvent('otp.sent', { requestId, phone, expiresAt });

        res.status(201).json({
            success: true,
            requestId,
            phone,
            expiresAt,
            expirySeconds,
            message: 'OTP sent successfully via WhatsApp',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Check / Verify OTP ────────────────────────────────────────────────────────

const CheckSchema = z.object({
    requestId: z.string().uuid(),
    code: z.string().min(4).max(8),
});

router.post('/check', (req, res) => {
    const data = validate(CheckSchema, req.body, res);
    if (!data) return;

    const result = verifyOtp(data.requestId, data.code);

    if (result.valid) {
        deliverEvent('otp.verified', { requestId: data.requestId, phone: result.phone });
        return res.json({
            success: true,
            valid: true,
            phone: result.phone,
            verifiedAt: result.verifiedAt,
        });
    }

    const statusMap = {
        WRONG_CODE: 400,
        EXPIRED: 410,
        MAX_ATTEMPTS_EXCEEDED: 429,
        ALREADY_VERIFIED: 409,
        INVALID_REQUEST_ID: 404,
    };

    res.status(statusMap[result.reason] || 400).json({
        success: false,
        valid: false,
        error: result.reason,
        attemptsLeft: result.attemptsLeft ?? undefined,
    });
});

// ── Resend OTP ────────────────────────────────────────────────────────────────

const ResendSchema = z.object({
    requestId: z.string().uuid(),
    expirySeconds: z.number().int().min(60).max(600).optional(),
});

router.post('/resend', async (req, res) => {
    const data = validate(ResendSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    const refreshed = refreshOtp(data.requestId, data.expirySeconds || 300);
    if (!refreshed) {
        return res.status(404).json({
            success: false,
            error: 'REQUEST_NOT_FOUND',
            message: 'OTP request not found, already verified, or expired',
        });
    }

    try {
        const info = getOtpInfo(data.requestId);
        const jid = toJid(info.phone);
        const minutes = Math.round((data.expirySeconds || 300) / 60);

        const text = DEFAULT_TEMPLATE
            .replaceAll('{{code}}', refreshed.code)
            .replaceAll('{{minutes}}', String(minutes))
            .replaceAll('{{phone}}', info.phone)
            .replaceAll('{{sender}}', 'wabot');

        await sock.sendMessage(jid, { text });
        await deliverEvent('otp.resent', { requestId: data.requestId, phone: info.phone });

        res.json({
            success: true,
            requestId: data.requestId,
            expiresAt: refreshed.expiresAt,
            message: 'OTP resent successfully',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Get OTP Status ────────────────────────────────────────────────────────────

router.get('/:requestId', (req, res) => {
    const { requestId } = req.params;
    const info = getOtpInfo(requestId);

    if (!info) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'OTP request not found' });
    }

    res.json({ success: true, ...info });
});

// ── Cancel OTP ────────────────────────────────────────────────────────────────

router.delete('/:requestId', (req, res) => {
    const deleted = cancelOtp(req.params.requestId);
    if (!deleted) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'OTP request not found' });
    }
    res.json({ success: true, message: 'OTP request cancelled' });
});

module.exports = router;
