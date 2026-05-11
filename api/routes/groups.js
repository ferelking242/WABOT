'use strict';

/**
 * Group management routes
 * GET    /v1/groups                         — list all groups bot is in
 * GET    /v1/groups/:groupId                — group info + participants
 * POST   /v1/groups/:groupId/message        — send message to group
 * GET    /v1/groups/:groupId/participants   — list participants
 * POST   /v1/groups/:groupId/invite         — get invite link
 */

const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getWhatsAppInstance } = require('../../lib/whatsappInstance');
const { toGroupJid } = require('../utils/phone');
const { deliverEvent } = require('../utils/webhook');
const axios = require('axios');

const router = Router();
router.use(requireAuth, requirePermission('groups'), rateLimit);

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
        res.status(503).json({ success: false, error: 'BOT_NOT_CONNECTED', message: 'WhatsApp bot is not connected.' });
        return null;
    }
    return sock;
}

async function fetchBuffer(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
}

// ── List Groups ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    const sock = getSock(res);
    if (!sock) return;

    try {
        // Baileys does not have a direct "list all groups" API.
        // We use the in-memory store which tracks joined chats.
        const store = require('../../lib/lightweight_store');
        const chats = store.chats?.all ? store.chats.all() : (store.chats ? Object.values(store.chats) : []);
        const groups = chats
            .filter(c => c.id && c.id.endsWith('@g.us'))
            .map(c => ({
                id: c.id,
                name: c.name || c.subject || null,
                unreadCount: c.unreadCount || 0,
            }));

        res.json({ success: true, total: groups.length, groups });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Get Group Info ────────────────────────────────────────────────────────────

router.get('/:groupId', async (req, res) => {
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toGroupJid(req.params.groupId);
        const meta = await sock.groupMetadata(jid);

        res.json({
            success: true,
            group: {
                id: meta.id,
                subject: meta.subject,
                description: meta.desc,
                owner: meta.owner,
                creation: meta.creation,
                participantCount: meta.participants?.length || 0,
                participants: meta.participants?.map(p => ({
                    id: p.id,
                    admin: p.admin || null,
                    isSuperAdmin: p.admin === 'superadmin',
                })),
                ephemeralDuration: meta.ephemeralDuration,
                announce: meta.announce,
                restrict: meta.restrict,
            },
        });
    } catch (err) {
        const status = err.message?.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Get Participants ──────────────────────────────────────────────────────────

router.get('/:groupId/participants', async (req, res) => {
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toGroupJid(req.params.groupId);
        const meta = await sock.groupMetadata(jid);

        res.json({
            success: true,
            groupId: jid,
            total: meta.participants?.length || 0,
            participants: meta.participants?.map(p => ({
                id: p.id,
                phone: p.id.replace('@s.whatsapp.net', ''),
                admin: p.admin || null,
            })),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

// ── Send Message to Group ─────────────────────────────────────────────────────

const GroupMessageSchema = z.object({
    text: z.string().min(1).max(65536).optional(),
    imageUrl: z.string().url().optional(),
    caption: z.string().max(1024).optional(),
    mention: z.array(z.string()).optional(),
}).refine(d => d.text || d.imageUrl, { message: 'Provide text or imageUrl' });

router.post('/:groupId/message', async (req, res) => {
    const data = validate(GroupMessageSchema, req.body, res);
    if (!data) return;
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toGroupJid(req.params.groupId);
        let content;

        if (data.imageUrl) {
            const image = await fetchBuffer(data.imageUrl);
            content = { image, caption: data.caption };
        } else {
            content = { text: data.text };
        }

        if (data.mention?.length) {
            content.mentions = data.mention.map(m => m.includes('@') ? m : `${m}@s.whatsapp.net`);
        }

        const sent = await sock.sendMessage(jid, content);
        await deliverEvent('message.sent', { to: jid, messageId: sent?.key?.id });

        res.json({
            success: true,
            messageId: sent?.key?.id || null,
            to: jid,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'SEND_FAILED', message: err.message });
    }
});

// ── Get Invite Link ───────────────────────────────────────────────────────────

router.post('/:groupId/invite', async (req, res) => {
    const sock = getSock(res);
    if (!sock) return;

    try {
        const jid = toGroupJid(req.params.groupId);
        const code = await sock.groupInviteCode(jid);
        res.json({
            success: true,
            groupId: jid,
            inviteCode: code,
            inviteLink: `https://chat.whatsapp.com/${code}`,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'FETCH_FAILED', message: err.message });
    }
});

module.exports = router;
