'use strict';

/**
 * Message sending routes
 * POST /v1/messages/text
 * POST /v1/messages/image
 * POST /v1/messages/video
 * POST /v1/messages/audio
 * POST /v1/messages/document
 * POST /v1/messages/location
 * POST /v1/messages/contact
 * POST /v1/messages/template
 * POST /v1/messages/reaction
 */

const { Router } = require('express');
const { z } = require('zod');
const { getWhatsAppInstance } = require('../../lib/whatsappInstance');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { toJid, toGroupJid } = require('../utils/phone');
const { deliverEvent } = require('../utils/webhook');
const axios = require('axios');

const router = Router();

// All message routes require auth + messages permission
router.use(requireAuth, requirePermission('messages'), rateLimit);

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function resolveJid(to) {
    if (typeof to === 'string' && (to.endsWith('@g.us') || to.endsWith('@s.whatsapp.net'))) return to;
    // Heuristic: 18+ digits likely a group id
    if (/^\d{15,}/.test(String(to).replace('@', ''))) {
        try { return toGroupJid(to); } catch { /* fall through */ }
    }
    return toJid(to);
}

function validate(schema, body, res) {
    const result = schema.safeParse(body);
    if (!result.success) {
        res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            details: result.error.errors,
        });
        return null;
    }
    return result.data;
}

async function fetchBuffer(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
}

function getMimetype(url) {
    const u = url.toLowerCase();
    if (u.endsWith('.mp4') || u.endsWith('.mov')) return 'video/mp4';
    if (u.endsWith('.mp3')) return 'audio/mp3';
    if (u.endsWith('.ogg')) return 'audio/ogg; codecs=opus';
    if (u.endsWith('.pdf')) return 'application/pdf';
    if (u.endsWith('.png')) return 'image/png';
    if (u.endsWith('.gif')) return 'image/gif';
    if (u.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
}

async function sendAndRespond(res, sock, jid, content, quoted) {
    const opts = {};
    if (quoted) opts.quoted = { key: { remoteJid: jid, id: quoted } };

    const sent = await sock.sendMessage(jid, content, opts);
    await deliverEvent('message.sent', { to: jid, messageId: sent?.key?.id, content });

    res.json({
        success: true,
        messageId: sent?.key?.id || null,
        to: jid,
        timestamp: new Date().toISOString(),
    });
}

// ── Text ───────────────────────────────────────────────────────────────────────

const TextSchema = z.object({
    to: z.string().min(1),
    text: z.string().min(1).max(65536),
    quoted: z.string().optional(),
    preview: z.boolean().optional(),
});

router.post('/text', async (req, res) => {
    const data = validate(TextSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const content = { text: data.text };
        if (data.preview === false) content.linkPreview = false;
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Image ──────────────────────────────────────────────────────────────────────

const ImageSchema = z.object({
    to: z.string().min(1),
    url: z.string().url().optional(),
    base64: z.string().optional(),
    caption: z.string().max(1024).optional(),
    quoted: z.string().optional(),
}).refine(d => d.url || d.base64, { message: 'Provide either url or base64' });

router.post('/image', async (req, res) => {
    const data = validate(ImageSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        let image;
        if (data.base64) {
            image = Buffer.from(data.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        } else {
            image = await fetchBuffer(data.url);
        }
        const content = { image, caption: data.caption };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Video ──────────────────────────────────────────────────────────────────────

const VideoSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
    gifPlayback: z.boolean().optional(),
    quoted: z.string().optional(),
});

router.post('/video', async (req, res) => {
    const data = validate(VideoSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const video = await fetchBuffer(data.url);
        const content = { video, caption: data.caption, gifPlayback: data.gifPlayback };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Audio ──────────────────────────────────────────────────────────────────────

const AudioSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    ptt: z.boolean().optional(),  // true = voice note
    quoted: z.string().optional(),
});

router.post('/audio', async (req, res) => {
    const data = validate(AudioSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const audio = await fetchBuffer(data.url);
        const mimetype = getMimetype(data.url);
        const content = { audio, mimetype, ptt: data.ptt ?? false };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Document ───────────────────────────────────────────────────────────────────

const DocumentSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    filename: z.string().min(1),
    mimetype: z.string().optional(),
    caption: z.string().max(1024).optional(),
    quoted: z.string().optional(),
});

router.post('/document', async (req, res) => {
    const data = validate(DocumentSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const document = await fetchBuffer(data.url);
        const mimetype = data.mimetype || getMimetype(data.url) || 'application/octet-stream';
        const content = { document, fileName: data.filename, mimetype, caption: data.caption };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Location ───────────────────────────────────────────────────────────────────

const LocationSchema = z.object({
    to: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().optional(),
    address: z.string().optional(),
    quoted: z.string().optional(),
});

router.post('/location', async (req, res) => {
    const data = validate(LocationSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const content = {
            location: {
                degreesLatitude: data.lat,
                degreesLongitude: data.lon,
                name: data.name,
                address: data.address,
            },
        };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Contact ────────────────────────────────────────────────────────────────────

const ContactSchema = z.object({
    to: z.string().min(1),
    contactName: z.string().min(1),
    contactPhone: z.string().min(7),
    quoted: z.string().optional(),
});

router.post('/contact', async (req, res) => {
    const data = validate(ContactSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        const phone = data.contactPhone.replace(/\D/g, '');
        const vcard =
            `BEGIN:VCARD\nVERSION:3.0\nFN:${data.contactName}\nTEL;type=CELL;type=VOICE;waid=${phone}:+${phone}\nEND:VCARD`;
        const content = {
            contacts: {
                displayName: data.contactName,
                contacts: [{ vcard }],
            },
        };
        await sendAndRespond(res, sock, jid, content, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Template (text with {{variable}} substitution) ────────────────────────────

const TemplateSchema = z.object({
    to: z.string().min(1),
    template: z.string().min(1).max(65536),
    variables: z.record(z.string()).optional(),
    quoted: z.string().optional(),
});

router.post('/template', async (req, res) => {
    const data = validate(TemplateSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        let text = data.template;
        if (data.variables) {
            for (const [key, val] of Object.entries(data.variables)) {
                text = text.replaceAll(`{{${key}}}`, val);
            }
        }
        await sendAndRespond(res, sock, jid, { text }, data.quoted);
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Reaction ───────────────────────────────────────────────────────────────────

const ReactionSchema = z.object({
    to: z.string().min(1),
    messageId: z.string().min(1),
    emoji: z.string().min(1),
});

router.post('/reaction', async (req, res) => {
    const data = validate(ReactionSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = resolveJid(data.to);
        await sock.sendMessage(jid, {
            react: { text: data.emoji, key: { remoteJid: jid, id: data.messageId } },
        });
        res.json({ success: true, to: jid, emoji: data.emoji, timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

module.exports = router;
