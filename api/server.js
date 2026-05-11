'use strict';

/**
 * wabot REST API Server
 * Public API for WhatsApp messaging, OTP verification, and more
 *
 * Base URL: /api/v1
 * Auth:     X-API-Key header  OR  ?api_key=wbk_...
 */

const express = require('express');
const cors = require('cors');
const { initDefaultKey } = require('./utils/apiKeys');

// ── App setup ──────────────────────────────────────────────────────────────────

const app = express();

// Trust reverse proxy (Replit / Render / Railway)
app.set('trust proxy', 1);

// CORS — allow all origins by default (restrict via env if needed)
app.use(cors({
    origin: process.env.API_CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
}));

// JSON body parser (generous limit for base64 media)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Request logger (compact) ───────────────────────────────────────────────────

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const color = res.statusCode < 400 ? '\x1b[32m' : '\x1b[31m';
        console.log(`[API] ${color}${res.statusCode}\x1b[0m ${req.method} ${req.path} ${ms}ms`);
    });
    next();
});

// ── Root docs endpoint (no auth) ───────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({
        name: 'wabot REST API',
        version: '1.0.0',
        description: 'Public REST API for WhatsApp messaging via wabot',
        documentation: `${req.protocol}://${req.get('host')}/api/v1/docs`,
        endpoints: {
            health: 'GET /api/v1/health',
            status: 'GET /api/v1/status',
            metrics: 'GET /api/v1/metrics',
            messages: {
                text: 'POST /api/v1/messages/text',
                image: 'POST /api/v1/messages/image',
                video: 'POST /api/v1/messages/video',
                audio: 'POST /api/v1/messages/audio',
                document: 'POST /api/v1/messages/document',
                location: 'POST /api/v1/messages/location',
                contact: 'POST /api/v1/messages/contact',
                template: 'POST /api/v1/messages/template',
                reaction: 'POST /api/v1/messages/reaction',
            },
            verify: {
                send: 'POST /api/v1/verify/send',
                check: 'POST /api/v1/verify/check',
                resend: 'POST /api/v1/verify/resend',
                status: 'GET /api/v1/verify/:requestId',
                cancel: 'DELETE /api/v1/verify/:requestId',
            },
            broadcast: {
                text: 'POST /api/v1/broadcast',
                image: 'POST /api/v1/broadcast/image',
                template: 'POST /api/v1/broadcast/template',
            },
            groups: {
                list: 'GET /api/v1/groups',
                info: 'GET /api/v1/groups/:groupId',
                participants: 'GET /api/v1/groups/:groupId/participants',
                message: 'POST /api/v1/groups/:groupId/message',
                invite: 'POST /api/v1/groups/:groupId/invite',
            },
            webhooks: {
                list: 'GET /api/v1/webhooks',
                create: 'POST /api/v1/webhooks',
                delete: 'DELETE /api/v1/webhooks/:id',
                test: 'POST /api/v1/webhooks/:id/test',
            },
            admin: {
                listKeys: 'GET /api/v1/admin/keys',
                createKey: 'POST /api/v1/admin/keys',
                revokeKey: 'PATCH /api/v1/admin/keys/:id/revoke',
                deleteKey: 'DELETE /api/v1/admin/keys/:id',
            },
        },
        auth: 'Set X-API-Key header or ?api_key= query param',
    });
});

// ── Interactive API Docs ───────────────────────────────────────────────────────

app.get('/api/v1/docs', (req, res) => {
    res.send(getDocsHtml(req));
});

// ── Mount API routes ───────────────────────────────────────────────────────────

app.use('/api/v1', require('./routes/index'));

// ── 404 handler ────────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
        docs: '/api/v1/docs',
    });
});

// ── Global error handler ───────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    console.error('[API Error]', err.message);
    res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
});

// ── Webhook: forward incoming WhatsApp messages to registered webhooks ─────────

function setupIncomingMessageForwarding() {
    const { deliverEvent } = require('./utils/webhook');
    const { getWhatsAppInstance } = require('../lib/whatsappInstance');

    // Poll for WhatsApp connection and attach listener
    const attach = setInterval(() => {
        const sock = getWhatsAppInstance();
        if (!sock) return;

        clearInterval(attach);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                if (!msg.message || msg.key.fromMe) continue;

                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    null;

                await deliverEvent('message.received', {
                    from: msg.key.remoteJid,
                    sender: msg.key.participant || msg.key.remoteJid,
                    messageId: msg.key.id,
                    text,
                    timestamp: msg.messageTimestamp
                        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
                        : new Date().toISOString(),
                    isGroup: msg.key.remoteJid?.endsWith('@g.us') || false,
                }).catch(() => {});
            }
        });

        console.log('[API] Incoming message forwarding to webhooks active');
    }, 5000);
}

// ── Start server ───────────────────────────────────────────────────────────────

function startApiServer() {
    const PORT = parseInt(process.env.API_PORT || '3001', 10);

    // Auto-create first API key if none exist
    initDefaultKey();

    // Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n╔═══════════════════════════════════════════════════╗`);
        console.log(`║         wabot REST API Server started              ║`);
        console.log(`╠═══════════════════════════════════════════════════╣`);
        console.log(`║  Port:    ${PORT}                                     ║`);
        console.log(`║  Base:    http://0.0.0.0:${PORT}/api/v1               ║`);
        console.log(`║  Docs:    http://0.0.0.0:${PORT}/api/v1/docs          ║`);
        console.log(`║  Health:  http://0.0.0.0:${PORT}/api/v1/health        ║`);
        console.log(`╚═══════════════════════════════════════════════════╝\n`);
    });

    server.on('error', err => {
        console.error('[API] Server error:', err.message);
    });

    // Attach webhook forwarding after server is up
    setupIncomingMessageForwarding();

    return server;
}

// ── Docs HTML generator ────────────────────────────────────────────────────────

function getDocsHtml(req) {
    const base = `${req.protocol}://${req.get('host')}/api/v1`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>wabot API Docs</title>
<style>
  :root { --brand: #25D366; --dark: #0a0a0a; --card: #141414; --border: #222; --text: #e0e0e0; --muted: #888; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); padding: 2rem; line-height: 1.6; }
  h1 { color: var(--brand); font-size: 2rem; margin-bottom: 0.25rem; }
  h2 { color: var(--brand); font-size: 1.1rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: 0.95rem; margin: 1rem 0 0.5rem; color: #ccc; }
  .subtitle { color: var(--muted); margin-bottom: 2rem; }
  .endpoint { background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
  .endpoint-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; cursor: pointer; }
  .endpoint-header:hover { background: #1a1a1a; }
  .method { font-family: monospace; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; min-width: 56px; text-align: center; }
  .method.GET { background: #1a3a5c; color: #5ba4f5; }
  .method.POST { background: #1a3a2a; color: #5bf57a; }
  .method.DELETE { background: #3a1a1a; color: #f55b5b; }
  .method.PATCH { background: #3a2a1a; color: #f5a55b; }
  .path { font-family: monospace; font-size: 0.9rem; }
  .desc { color: var(--muted); font-size: 0.85rem; margin-left: auto; }
  .body { padding: 1rem; border-top: 1px solid var(--border); display: none; }
  .body.open { display: block; }
  .tag { display: inline-block; background: #1a1a3a; color: #a0a0ff; border-radius: 4px; padding: 0.1rem 0.5rem; font-size: 0.75rem; margin: 0.1rem; }
  pre { background: #0d0d0d; border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-size: 0.82rem; overflow-x: auto; white-space: pre; }
  .required { color: #f55b5b; font-size: 0.7rem; margin-left: 4px; }
  .auth-box { background: #1a1a0a; border: 1px solid #333; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 2rem; }
  .auth-box code { color: var(--brand); }
  a { color: var(--brand); }
</style>
</head>
<body>
<h1>🤖 wabot REST API</h1>
<p class="subtitle">Version 1.0.0 &nbsp;·&nbsp; <a href="${base}/health">Health Check</a> &nbsp;·&nbsp; <a href="/">JSON Index</a></p>

<div class="auth-box">
  <h3>🔑 Authentication</h3>
  <p>All endpoints (except <code>/health</code>) require an API key.<br>
  Pass it as a header: <code>X-API-Key: wbk_your_key_here</code><br>
  Or as a query param: <code>?api_key=wbk_your_key_here</code><br>
  Your master key is printed in the server console on first start.</p>
</div>

<h2>📡 Status</h2>

${ep('GET', `${base}/health`, 'Public health check — no auth required', '', '')}
${ep('GET', `${base}/status`, 'Bot connection & process info', '', '')}
${ep('GET', `${base}/metrics`, 'Usage metrics (keys, webhooks, uptime)', '', '')}

<h2>💬 Messages</h2>

${ep('POST', `${base}/messages/text`, 'Send a text message', '{"to":"242064235945","text":"Hello!"}', '{"success":true,"messageId":"3EB0...","to":"242064235945@s.whatsapp.net"}')}
${ep('POST', `${base}/messages/image`, 'Send an image', '{"to":"242064235945","url":"https://example.com/photo.jpg","caption":"Check this out!"}', '{"success":true,"messageId":"3EB1..."}')}
${ep('POST', `${base}/messages/video`, 'Send a video', '{"to":"242064235945","url":"https://example.com/video.mp4","caption":"Watch!"}', '')}
${ep('POST', `${base}/messages/audio`, 'Send audio / voice note (ptt=true)', '{"to":"242064235945","url":"https://example.com/audio.ogg","ptt":true}', '')}
${ep('POST', `${base}/messages/document`, 'Send a file/document', '{"to":"242064235945","url":"https://example.com/file.pdf","filename":"Report.pdf"}', '')}
${ep('POST', `${base}/messages/location`, 'Send a GPS location', '{"to":"242064235945","lat":-4.32,"lon":15.32,"name":"Brazzaville","address":"Congo"}', '')}
${ep('POST', `${base}/messages/contact`, 'Send a contact card', '{"to":"242064235945","contactName":"Alice","contactPhone":"33612345678"}', '')}
${ep('POST', `${base}/messages/template`, 'Send a message with {{variable}} substitution', '{"to":"242064235945","template":"Hi {{name}}, your order {{id}} is ready!","variables":{"name":"Alice","id":"ORD-123"}}', '')}
${ep('POST', `${base}/messages/reaction`, 'React to a message with an emoji', '{"to":"242064235945","messageId":"3EB0ABC...","emoji":"👍"}', '')}

<h2>🔐 OTP Verification</h2>

${ep('POST', `${base}/verify/send`, 'Send OTP code via WhatsApp', '{"phone":"242064235945","expirySeconds":300}', '{"success":true,"requestId":"uuid","expiresAt":"2026-05-11T12:05:00.000Z"}')}
${ep('POST', `${base}/verify/check`, 'Validate OTP code', '{"requestId":"uuid","code":"482937"}', '{"success":true,"valid":true,"phone":"242064235945","verifiedAt":"..."}')}
${ep('POST', `${base}/verify/resend`, 'Regenerate & resend OTP', '{"requestId":"uuid"}', '{"success":true,"requestId":"uuid","expiresAt":"..."}')}
${ep('GET', `${base}/verify/:requestId`, 'Get OTP status (no code exposed)', '', '')}
${ep('DELETE', `${base}/verify/:requestId`, 'Cancel / invalidate OTP', '', '')}

<h2>📢 Broadcast</h2>

${ep('POST', `${base}/broadcast`, 'Send text to multiple numbers (max 500)', '{"recipients":["242064235945","33612345678"],"text":"Hello everyone!"}', '{"success":true,"summary":{"total":2,"succeeded":2,"failed":0},"results":[...]}')}
${ep('POST', `${base}/broadcast/image`, 'Send image to multiple numbers (max 200)', '{"recipients":["242064235945"],"url":"https://example.com/banner.jpg","caption":"New offer!"}', '')}
${ep('POST', `${base}/broadcast/template`, 'Personalized template to each recipient', '{"recipients":[{"phone":"242064235945","variables":{"name":"Alice"}}],"template":"Hi {{name}}!"}', '')}

<h2>👥 Groups</h2>

${ep('GET', `${base}/groups`, 'List all groups the bot is in', '', '')}
${ep('GET', `${base}/groups/:groupId`, 'Get group metadata + participants', '', '')}
${ep('GET', `${base}/groups/:groupId/participants`, 'List participants only', '', '')}
${ep('POST', `${base}/groups/:groupId/message`, 'Send message to a group', '{"text":"Hello group!"}', '')}
${ep('POST', `${base}/groups/:groupId/invite`, 'Get group invite link', '', '{"success":true,"inviteLink":"https://chat.whatsapp.com/..."}')}

<h2>🪝 Webhooks</h2>

${ep('GET', `${base}/webhooks`, 'List your registered webhooks', '', '')}
${ep('POST', `${base}/webhooks`, 'Register a new webhook URL', '{"url":"https://myserver.com/hook","events":["message.received","otp.verified"],"secret":"mysecret"}', '{"success":true,"webhook":{...}}')}
${ep('DELETE', `${base}/webhooks/:id`, 'Delete a webhook', '', '')}
${ep('POST', `${base}/webhooks/:id/test`, 'Send a test event to a webhook', '', '')}

<h2>🔑 Admin (Key Management)</h2>

${ep('GET', `${base}/admin/keys`, 'List all API keys', '', '')}
${ep('POST', `${base}/admin/keys`, 'Create a new API key', '{"name":"My App","permissions":["messages","verify"],"rateLimit":100}', '{"success":true,"apiKey":{"key":"wbk_..."}}')}
${ep('PATCH', `${base}/admin/keys/:id/revoke`, 'Revoke an API key', '', '')}
${ep('DELETE', `${base}/admin/keys/:id`, 'Delete an API key', '', '')}

<h2>📨 Webhook Events</h2>
<div class="endpoint">
  <div class="endpoint-header">
    <span>Valid event names:</span>
    <span class="tag">message.received</span>
    <span class="tag">message.sent</span>
    <span class="tag">otp.sent</span>
    <span class="tag">otp.verified</span>
    <span class="tag">otp.resent</span>
    <span class="tag">broadcast.completed</span>
    <span class="tag">* (all)</span>
  </div>
  <div class="body open">
    <h3>Payload structure (POST to your URL)</h3>
    <pre>{"event":"message.received","timestamp":"2026-05-11T12:00:00.000Z","data":{"from":"242064235945@s.whatsapp.net","sender":"242064235945@s.whatsapp.net","messageId":"3EB0...","text":"Hello!","timestamp":"...","isGroup":false}}</pre>
    <h3>Verifying signatures (if secret set)</h3>
    <pre>X-Wabot-Signature: sha256=&lt;HMAC-SHA256 of raw body using your secret&gt;</pre>
  </div>
</div>

<script>
document.querySelectorAll('.endpoint-header').forEach(h => {
  h.addEventListener('click', () => {
    const body = h.nextElementSibling;
    if (body) body.classList.toggle('open');
  });
});
</script>
</body>
</html>`;
}

function ep(method, path, desc, reqBody, respBody) {
    const color = { GET: 'GET', POST: 'POST', DELETE: 'DELETE', PATCH: 'PATCH' }[method] || 'GET';
    const bodySection = (reqBody || respBody) ? `
    <div class="body">
      ${reqBody ? `<h3>Request body</h3><pre>${escHtml(JSON.stringify(JSON.parse(reqBody), null, 2))}</pre>` : ''}
      ${respBody ? `<h3>Response example</h3><pre>${escHtml(JSON.stringify(JSON.parse(respBody), null, 2))}</pre>` : ''}
    </div>` : '';

    return `<div class="endpoint">
  <div class="endpoint-header">
    <span class="method ${color}">${method}</span>
    <span class="path">${path.replace(/https?:\/\/[^/]+/, '')}</span>
    <span class="desc">${desc}</span>
  </div>${bodySection}
</div>`;
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Export for use in index.js ─────────────────────────────────────────────────

module.exports = { startApiServer, app };
