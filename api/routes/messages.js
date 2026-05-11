'use strict';

/**
 * Message sending routes — v2 with queue + quota + logging + new types
 *
 * POST /v1/messages/text
 * POST /v1/messages/image
 * POST /v1/messages/video
 * POST /v1/messages/audio
 * POST /v1/messages/document
 * POST /v1/messages/location
 * POST /v1/messages/contact
 * POST /v1/messages/template
 * POST /v1/messages/reaction
 * POST /v1/messages/buttons      ← NEW
 * POST /v1/messages/list         ← NEW
 * POST /v1/messages/poll         ← NEW
 * POST /v1/messages/forward      ← NEW
 * GET  /v1/messages/queue        ← NEW - queue status
 * GET  /v1/messages/queue/:jobId ← NEW - job status
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { quotaMiddleware } = require('../utils/quota');
const { logMessage } = require('../utils/messageLog');
const queue = require('../queue/messageQueue');
const { toJid, toGroupJid } = require('../utils/phone');
const axios = require('axios');

const router = Router();
router.use(requireAuth, requirePermission('messages'), rateLimit);

// ── Helpers ────────────────────────────────────────────────────────────────────

function validate(schema, body, res) {
    const r = schema.safeParse(body);
    if (!r.success) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: r.error.errors });
        return null;
    }
    return r.data;
}

function resolveJid(to) {
    if (typeof to === 'string' && (to.endsWith('@g.us') || to.endsWith('@s.whatsapp.net'))) return to;
    if (/^\d{15,}/.test(String(to).replace('@', ''))) {
        try { return toGroupJid(to); } catch { /* fall through */ }
    }
    return toJid(to);
}

async function fetchBuffer(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
}

/**
 * Core enqueue helper — enqueues message, logs it, returns 202
 */
function enqueueMsg(res, jid, content, apiKey, opts = {}) {
    const { jobId } = queue.enqueue({
        jid,
        content,
        priority: opts.priority || 'normal',
        typing: opts.typing ?? false,
        scheduledAt: opts.scheduledAt ?? null,
        apiKeyId: apiKey.id,
        meta: { type: opts.type || 'text', ...opts.meta },
    });

    logMessage({
        to: jid,
        type: opts.type || 'text',
        status: 'queued',
        jobId,
        apiKeyId: apiKey.id,
        meta: opts.meta || {},
    });

    res.status(202).json({
        success: true,
        jobId,
        to: jid,
        status: 'queued',
        message: 'Message queued for delivery',
        statusUrl: `/api/v1/messages/queue/${jobId}`,
        timestamp: new Date().toISOString(),
    });
}

// ── Queue status ───────────────────────────────────────────────────────────────

router.get('/queue', (req, res) => {
    res.json({ success: true, ...queue.getStats() });
});

router.get('/queue/:jobId', (req, res) => {
    const job = queue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'JOB_NOT_FOUND' });
    res.json({ success: true, job });
});

// ── Text ───────────────────────────────────────────────────────────────────────

const TextSchema = z.object({
    to: z.string().min(1),
    text: z.string().min(1).max(65536),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    scheduledAt: z.number().int().optional(),
    quoted: z.string().optional(),
});

router.post('/text', quotaMiddleware(1), async (req, res) => {
    const data = validate(TextSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);
    enqueueMsg(res, jid, { text: data.text }, req.apiKey, {
        type: 'text',
        typing: data.typing,
        priority: data.priority,
        scheduledAt: data.scheduledAt,
        meta: { quoted: data.quoted },
    });
});

// ── Image ──────────────────────────────────────────────────────────────────────

const ImageSchema = z.object({
    to: z.string().min(1),
    url: z.string().url().optional(),
    base64: z.string().optional(),
    caption: z.string().max(1024).optional(),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    scheduledAt: z.number().int().optional(),
}).refine(d => d.url || d.base64, { message: 'Provide url or base64' });

router.post('/image', quotaMiddleware(1), async (req, res) => {
    const data = validate(ImageSchema, req.body, res);
    if (!data) return;

    try {
        const jid = resolveJid(data.to);
        let image;
        if (data.base64) {
            image = Buffer.from(data.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        } else {
            image = await fetchBuffer(data.url);
        }
        enqueueMsg(res, jid, { image, caption: data.caption }, req.apiKey, {
            type: 'image', typing: data.typing, priority: data.priority, scheduledAt: data.scheduledAt,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Video ──────────────────────────────────────────────────────────────────────

const VideoSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
    gifPlayback: z.boolean().optional(),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    scheduledAt: z.number().int().optional(),
});

router.post('/video', quotaMiddleware(1), async (req, res) => {
    const data = validate(VideoSchema, req.body, res);
    if (!data) return;

    try {
        const jid = resolveJid(data.to);
        const video = await fetchBuffer(data.url);
        enqueueMsg(res, jid, { video, caption: data.caption, gifPlayback: data.gifPlayback }, req.apiKey, {
            type: 'video', typing: data.typing, priority: data.priority, scheduledAt: data.scheduledAt,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Audio ──────────────────────────────────────────────────────────────────────

const AudioSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    ptt: z.boolean().optional(),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
});

router.post('/audio', quotaMiddleware(1), async (req, res) => {
    const data = validate(AudioSchema, req.body, res);
    if (!data) return;

    try {
        const jid = resolveJid(data.to);
        const audio = await fetchBuffer(data.url);
        const ext = (data.url || '').toLowerCase();
        const mimetype = ext.endsWith('.ogg') ? 'audio/ogg; codecs=opus' : 'audio/mp4';
        enqueueMsg(res, jid, { audio, mimetype, ptt: data.ptt ?? false }, req.apiKey, {
            type: 'audio', typing: data.typing, priority: data.priority,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Document ───────────────────────────────────────────────────────────────────

const DocumentSchema = z.object({
    to: z.string().min(1),
    url: z.string().url(),
    filename: z.string().min(1),
    mimetype: z.string().optional(),
    caption: z.string().max(1024).optional(),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
});

router.post('/document', quotaMiddleware(1), async (req, res) => {
    const data = validate(DocumentSchema, req.body, res);
    if (!data) return;

    try {
        const jid = resolveJid(data.to);
        const document = await fetchBuffer(data.url);
        enqueueMsg(res, jid, {
            document,
            fileName: data.filename,
            mimetype: data.mimetype || 'application/octet-stream',
            caption: data.caption,
        }, req.apiKey, { type: 'document', typing: data.typing, priority: data.priority });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Location ───────────────────────────────────────────────────────────────────

const LocationSchema = z.object({
    to: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().optional(),
    address: z.string().optional(),
});

router.post('/location', quotaMiddleware(1), (req, res) => {
    const data = validate(LocationSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);
    enqueueMsg(res, jid, {
        location: {
            degreesLatitude: data.lat,
            degreesLongitude: data.lon,
            name: data.name,
            address: data.address,
        },
    }, req.apiKey, { type: 'location' });
});

// ── Contact ────────────────────────────────────────────────────────────────────

const ContactSchema = z.object({
    to: z.string().min(1),
    contactName: z.string().min(1),
    contactPhone: z.string().min(7),
});

router.post('/contact', quotaMiddleware(1), (req, res) => {
    const data = validate(ContactSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);
    const phone = data.contactPhone.replace(/\D/g, '');
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${data.contactName}\nTEL;type=CELL;type=VOICE;waid=${phone}:+${phone}\nEND:VCARD`;
    enqueueMsg(res, jid, {
        contacts: { displayName: data.contactName, contacts: [{ vcard }] },
    }, req.apiKey, { type: 'contact' });
});

// ── Template ───────────────────────────────────────────────────────────────────

const TemplateSchema = z.object({
    to: z.string().min(1),
    template: z.string().min(1).max(65536),
    variables: z.record(z.string()).optional(),
    typing: z.boolean().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    scheduledAt: z.number().int().optional(),
});

router.post('/template', quotaMiddleware(1), (req, res) => {
    const data = validate(TemplateSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);
    let text = data.template;
    if (data.variables) {
        for (const [k, v] of Object.entries(data.variables)) {
            text = text.replaceAll(`{{${k}}}`, v);
        }
    }
    enqueueMsg(res, jid, { text }, req.apiKey, {
        type: 'template', typing: data.typing, priority: data.priority, scheduledAt: data.scheduledAt,
    });
});

// ── Reaction ───────────────────────────────────────────────────────────────────

const ReactionSchema = z.object({
    to: z.string().min(1),
    messageId: z.string().min(1),
    emoji: z.string().min(1),
});

router.post('/reaction', (req, res) => {
    const data = validate(ReactionSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);
    enqueueMsg(res, jid, {
        react: { text: data.emoji, key: { remoteJid: jid, id: data.messageId } },
    }, req.apiKey, { type: 'reaction' });
});

// ── Buttons ← NEW ─────────────────────────────────────────────────────────────

const ButtonSchema = z.object({
    to: z.string().min(1),
    body: z.string().min(1),
    footer: z.string().optional(),
    buttons: z.array(z.object({
        id: z.string().min(1),
        text: z.string().min(1),
    })).min(1).max(3),
    typing: z.boolean().optional(),
});

router.post('/buttons', quotaMiddleware(1), (req, res) => {
    const data = validate(ButtonSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);

    const buttons = data.buttons.map(b => ({
        buttonId: b.id,
        buttonText: { displayText: b.text },
        type: 1,
    }));

    enqueueMsg(res, jid, {
        buttonsMessage: {
            contentText: data.body,
            footerText: data.footer || '',
            buttons,
            headerType: 1,
        },
    }, req.apiKey, { type: 'buttons', typing: data.typing });
});

// ── List Message ← NEW ────────────────────────────────────────────────────────

const ListSection = z.object({
    title: z.string().min(1),
    rows: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
    })).min(1),
});

const ListSchema = z.object({
    to: z.string().min(1),
    body: z.string().min(1),
    footer: z.string().optional(),
    buttonText: z.string().default('Select an option'),
    sections: z.array(ListSection).min(1),
    title: z.string().optional(),
    typing: z.boolean().optional(),
});

router.post('/list', quotaMiddleware(1), (req, res) => {
    const data = validate(ListSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);

    enqueueMsg(res, jid, {
        listMessage: {
            title: data.title || '',
            description: data.body,
            footerText: data.footer || '',
            buttonText: data.buttonText,
            listType: 1,
            sections: data.sections.map(s => ({
                title: s.title,
                rows: s.rows.map(r => ({
                    rowId: r.id,
                    title: r.title,
                    description: r.description || '',
                })),
            })),
        },
    }, req.apiKey, { type: 'list', typing: data.typing });
});

// ── Poll ← NEW ────────────────────────────────────────────────────────────────

const PollSchema = z.object({
    to: z.string().min(1),
    question: z.string().min(1).max(255),
    options: z.array(z.string().min(1)).min(2).max(12),
    allowMultiple: z.boolean().optional(),
    typing: z.boolean().optional(),
});

router.post('/poll', quotaMiddleware(1), (req, res) => {
    const data = validate(PollSchema, req.body, res);
    if (!data) return;
    const jid = resolveJid(data.to);

    enqueueMsg(res, jid, {
        poll: {
            name: data.question,
            values: data.options,
            selectableCount: data.allowMultiple ? data.options.length : 1,
        },
    }, req.apiKey, { type: 'poll', typing: data.typing });
});

// ── Scheduled message helper ───────────────────────────────────────────────────

const ScheduleSchema = z.object({
    to: z.string().min(1),
    text: z.string().min(1),
    sendAt: z.string().datetime(),  // ISO 8601
    typing: z.boolean().optional(),
});

router.post('/schedule', quotaMiddleware(1), (req, res) => {
    const data = validate(ScheduleSchema, req.body, res);
    if (!data) return;

    const scheduledAt = new Date(data.sendAt).getTime();
    if (isNaN(scheduledAt) || scheduledAt < Date.now()) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_SCHEDULE',
            message: 'sendAt must be a future ISO 8601 datetime',
        });
    }

    const jid = resolveJid(data.to);
    enqueueMsg(res, jid, { text: data.text }, req.apiKey, {
        type: 'text',
        typing: data.typing,
        scheduledAt,
        priority: 'normal',
        meta: { scheduledFor: data.sendAt },
    });
});

module.exports = router;
