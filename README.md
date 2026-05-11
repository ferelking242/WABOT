# wabot — WhatsApp Bot + Production REST API

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![API](https://img.shields.io/badge/REST%20API-v2-25D366.svg)

**WhatsApp bot with a full production REST API — send messages, OTP, broadcasts, and more from any app.**

[Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Auto-Update](#-auto-update-ab-deployment) · [Flutter App](#-flutter-app-integration) · [Deployment](#-deployment)

</div>

---

## Features

| Category | What's included |
|---|---|
| **Messaging** | Text, image, video, audio, document, location, contact card, reactions, buttons, list menu, polls, scheduled sends |
| **OTP / Verify** | Send → verify → resend → cancel with expiry |
| **Broadcast** | Multi-recipient text / image / template (personalized variables), with scheduling |
| **Groups** | List, info, participants, send message, get invite link |
| **Webhooks** | Register URLs, HMAC signatures, test delivery, event filtering |
| **Contacts** | Check if numbers are on WhatsApp, get profile photo |
| **Quotas** | Free / Starter / Pro / Business plans with daily limits |
| **Message Queue** | Anti-ban delays, retry × 3, priority levels, typing indicator |
| **Message Log** | Full history with status, filter by date/type/status |
| **Auto-Update** | A/B deployment — GitHub push → health check → rollback if broken |
| **Admin** | API key management, plan assignment, global stats |

---

## Quick Start

### Option 1 — Replit (recommended, zero setup)

1. Fork this repo, then **import it into Replit** as a Node.js project
2. In the Replit Secrets panel, add:
   ```
   GITHUB_TOKEN       = ghp_...            # for auto-update
   GITHUB_OWNER       = your-github-user
   GITHUB_REPO        = wabot
   WHATSAPP_PHONE_NUMBER = 242064235945    # bot phone
   OWNER_NUMBER       = 242065491040       # your number
   ```
3. Click **Run** — the bot starts, API comes up on port 3001
4. Scan the QR code that appears in the console
5. Your API is live at the URL printed in the console

### Option 2 — VPS / Linux server

```bash
# 1. Clone the repo
git clone https://github.com/ferelking242/wabot.git
cd wabot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
nano .env     # fill in WHATSAPP_PHONE_NUMBER, OWNER_NUMBER, etc.

# 4. Start with PM2 (recommended — PM2 handles auto-restart after updates)
npm install -g pm2
pm2 start index.js --name wabot
pm2 save
pm2 startup     # auto-start on server reboot

# OR start directly (development)
node index.js
```

### Option 3 — Local PC (Windows / Mac / Linux)

```bash
git clone https://github.com/ferelking242/wabot.git
cd wabot
npm install
cp .env.example .env
# Edit .env — set WHATSAPP_PHONE_NUMBER and OWNER_NUMBER at minimum
node index.js
```

API will be at `http://localhost:3001/api/v1`

---

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER` | Yes | Bot phone number (no `+`) |
| `OWNER_NUMBER` | Yes | Your personal number |
| `API_PORT` | No | API port (default `3001`) |
| `PUBLIC_URL` | No | Your server's public URL (auto-detected on Replit / Railway / Render) |
| `AUTO_UPDATE` | No | `true` / `false` — enable GitHub auto-update |
| `GITHUB_TOKEN` | No | GitHub PAT — avoids rate limits during polling |
| `GITHUB_OWNER` | No | GitHub username (for auto-update) |
| `GITHUB_REPO` | No | GitHub repo name (for auto-update) |
| `GITHUB_BRANCH` | No | Branch to track (default `main`) |
| `GITHUB_WEBHOOK_SECRET` | No | Secret to verify GitHub push webhooks |
| `QUEUE_MIN_DELAY` | No | Min ms between messages (default `800`) |
| `QUEUE_MAX_DELAY` | No | Max ms between messages (default `2500`) |

---

## API Reference

**Base URL:** `{PUBLIC_URL}/api/v1`  
**Auth:** `X-API-Key: wbk_your_key` header (or `?api_key=wbk_...` param)  
**Interactive docs:** `{PUBLIC_URL}/api/v1/docs`

Your master API key is printed in the console on first startup.

### Status & Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Public health check — returns `publicUrl` and `apiBase` |
| GET | `/status` | Yes | Bot status, public URL, process info, update state |
| GET | `/metrics` | Yes | Queue stats, key count, webhook count |

### Messages

| Method | Path | Description |
|---|---|---|
| POST | `/messages/text` | Send a text message |
| POST | `/messages/image` | Send an image (URL or base64) |
| POST | `/messages/video` | Send a video |
| POST | `/messages/audio` | Send audio / voice note (`ptt: true`) |
| POST | `/messages/document` | Send a file |
| POST | `/messages/location` | Send GPS coordinates |
| POST | `/messages/contact` | Send a contact card |
| POST | `/messages/template` | Send with `{{variable}}` substitution |
| POST | `/messages/reaction` | React to a message with emoji |
| POST | `/messages/buttons` | Message with up to 3 clickable buttons |
| POST | `/messages/list` | Interactive list menu with sections |
| POST | `/messages/poll` | Poll with up to 12 options |
| POST | `/messages/schedule` | Schedule a message at a future time |
| GET | `/messages/queue/:jobId` | Track delivery status of a queued message |

**Text example:**
```json
POST /api/v1/messages/text
{
  "to": "242064235945",
  "text": "Hello from wabot!"
}
```

**Buttons example:**
```json
POST /api/v1/messages/buttons
{
  "to": "242064235945",
  "text": "Choose an option:",
  "buttons": [
    {"id": "btn1", "displayText": "Option A"},
    {"id": "btn2", "displayText": "Option B"}
  ]
}
```

**Schedule example:**
```json
POST /api/v1/messages/schedule
{
  "to": "242064235945",
  "text": "Reminder: meeting in 10 min!",
  "scheduledAt": "2026-05-11T14:00:00.000Z"
}
```

### OTP Verification

| Method | Path | Description |
|---|---|---|
| POST | `/verify/send` | Send a 6-digit OTP via WhatsApp |
| POST | `/verify/check` | Verify the code |
| POST | `/verify/resend` | Resend OTP |
| GET | `/verify/:requestId` | Check OTP status |
| DELETE | `/verify/:requestId` | Cancel / invalidate |

```json
POST /api/v1/verify/send
{ "phone": "242064235945", "expirySeconds": 300 }

POST /api/v1/verify/check
{ "requestId": "uuid-here", "code": "482937" }
```

### Broadcast

| Method | Path | Description |
|---|---|---|
| POST | `/broadcast` | Text to multiple numbers (max 500) |
| POST | `/broadcast/image` | Image to multiple numbers (max 200) |
| POST | `/broadcast/template` | Personalized template per recipient |
| POST | `/broadcast/schedule` | Schedule a broadcast |

```json
POST /api/v1/broadcast
{
  "recipients": ["242064235945", "33612345678"],
  "text": "Hello everyone!"
}
```

### Groups

| Method | Path | Description |
|---|---|---|
| GET | `/groups` | List all groups the bot is in |
| GET | `/groups/:groupId` | Group metadata + participants |
| POST | `/groups/:groupId/message` | Send message to a group |
| POST | `/groups/:groupId/invite` | Get invite link |

### Contacts

| Method | Path | Description |
|---|---|---|
| POST | `/contacts/check` | Check if numbers are registered on WhatsApp |
| GET | `/contacts/:phone/info` | Profile photo + name |

### Instance Management

| Method | Path | Description |
|---|---|---|
| GET | `/instance/status` | Detailed connection + queue metrics |
| GET | `/instance/qr` | Get QR code as base64 PNG (for re-pairing) |
| POST | `/instance/reconnect` | Force reconnect |
| POST | `/instance/presence` | Set presence (`online`, `unavailable`, `composing`) |
| GET | `/instance/queue` | Queue state and pending jobs |
| DELETE | `/instance/queue` | Flush the message queue |

### Webhooks

```json
POST /api/v1/webhooks
{
  "url": "https://myserver.com/hook",
  "events": ["message.received", "otp.verified"],
  "secret": "my-hmac-secret"
}
```

**Webhook events:** `message.received`, `message.sent`, `message.failed`, `otp.sent`, `otp.verified`, `otp.resent`, `broadcast.completed`, `bot.update.success`, `bot.update.rollback`, `*`

Each delivery includes `X-Wabot-Signature: sha256=<hmac>` if you set a secret.

### Admin

| Method | Path | Description |
|---|---|---|
| GET | `/admin/keys` | List all API keys |
| POST | `/admin/keys` | Create new key (`name`, `permissions`, `plan`) |
| PATCH | `/admin/keys/:id/revoke` | Revoke a key |
| DELETE | `/admin/keys/:id` | Delete a key |
| GET | `/admin/quotas` | List quotas (usage per key) |
| PATCH | `/admin/quotas/:id` | Set plan (`free`/`starter`/`pro`/`business`) |
| GET | `/admin/stats` | Global stats (queue, messages, keys) |

### Logs

| Method | Path | Description |
|---|---|---|
| GET | `/logs` | Message history (filters: `status`, `type`, `from`, `to`, `limit`) |
| GET | `/logs/stats` | Counts by status and type |
| DELETE | `/logs` | Clear logs |

### Update (A/B deployment)

| Method | Path | Description |
|---|---|---|
| GET | `/update/status` | Current update state + pending validation |
| POST | `/update/apply` | Trigger manual update to a specific SHA |
| POST | `/update/rollback` | Rollback to previous build |
| POST | `/update/github-webhook` | GitHub push webhook receiver |

---

## Auto-Update A/B Deployment

The bot self-updates from GitHub with **automatic rollback** if the update breaks anything.

### How it works

```
1. Every 5 min: check GitHub API for new commits on main branch
                OR: receive push event via GitHub webhook
                
2. New commit detected:
   ├─ Backup all changed files → .wabot_backup/{oldSha}_{newSha}/
   ├─ Download new files from GitHub API
   ├─ Write updated files to disk
   └─ Restart process (state: pendingValidation = true)

3. On restart (30s validation window):
   ├─ Health check: GET /api/v1/health every 3s
   ├─ 3 consecutive successes → VALIDATED ✅
   │   └─ Clear backup, log success, fire webhook
   └─ Timeout or failure → ROLLBACK ❌
       ├─ Restore backup files
       ├─ Restart with previous build
       └─ Fire bot.update.rollback webhook with reason
```

### Setting up GitHub push webhook (instant updates)

1. In your GitHub repo → **Settings → Webhooks → Add webhook**
2. Payload URL: `https://your-bot-url/api/v1/update/github-webhook`
3. Content type: `application/json`
4. Secret: set a random string, add it as `GITHUB_WEBHOOK_SECRET` env var
5. Events: just **push events**

With this set up, every `git push` to `main` triggers an update within seconds.

### Manual update via API

```bash
# Check current version
curl -H "X-API-Key: wbk_..." https://your-bot/api/v1/update/status

# Apply specific commit
curl -X POST -H "X-API-Key: wbk_..." -H "Content-Type: application/json" \
  -d '{"sha":"abc1234"}' https://your-bot/api/v1/update/apply

# Roll back to previous build
curl -X POST -H "X-API-Key: wbk_..." https://your-bot/api/v1/update/rollback
```

---

## Flutter App Integration

The bot automatically exposes its public URL via the health endpoint (no auth required):

```http
GET https://your-bot-url/api/v1/health
```

```json
{
  "success": true,
  "status": "ok",
  "whatsapp": "connected",
  "publicUrl": "https://your-bot-url",
  "apiBase": "https://your-bot-url/api/v1",
  "uptime": 3600,
  "timestamp": "2026-05-11T12:00:00.000Z"
}
```

**In your Flutter app:**

```dart
// 1. Discover the bot URL (call once at startup)
final health = await http.get(Uri.parse('$BOT_BASE_URL/api/v1/health'));
final data = jsonDecode(health.body);
final apiBase = data['apiBase'];  // use this for all subsequent calls

// 2. Send a message
await http.post(
  Uri.parse('$apiBase/messages/text'),
  headers: {'X-API-Key': 'wbk_...', 'Content-Type': 'application/json'},
  body: jsonEncode({'to': '242064235945', 'text': 'Hello!'}),
);
```

---

## Deployment

### Replit (included)
- Run once to get the public URL — it appears in the console and at `/api/v1/health`
- Use **Deploy** to publish permanently (the URL won't change)
- Auto-update works via GitHub polling every 5 min (no webhook needed)

### VPS with PM2 (recommended for production)

```bash
pm2 start index.js --name wabot --watch false
pm2 save
pm2 startup
```

PM2 will auto-restart the bot after an update exit (process.exit(0)). The A/B validation happens on the next startup.

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001
CMD ["node", "index.js"]
```

```bash
docker build -t wabot .
docker run -d --name wabot --restart=unless-stopped \
  -p 3001:3001 \
  -e WHATSAPP_PHONE_NUMBER=242064235945 \
  -e OWNER_NUMBER=242065491040 \
  -e GITHUB_TOKEN=ghp_... \
  -v $(pwd)/data:/app/data \
  wabot
```

### Railway / Render

Set the environment variables in the platform dashboard. The `PUBLIC_URL` is auto-detected from `RAILWAY_STATIC_URL` or `RENDER_EXTERNAL_URL`.

---

## Architecture

```
wabot/
├── index.js                    # Entry point
├── lib/
│   ├── whatsapp-connection.js  # Baileys WebSocket connection
│   ├── whatsappInstance.js     # Singleton WhatsApp socket
│   ├── autoUpdater.js          # A/B auto-update + rollback
│   └── ...
├── api/
│   ├── server.js               # Express app + public URL detection
│   ├── middleware/
│   │   ├── auth.js             # API key authentication
│   │   └── rateLimit.js        # Per-key rate limiting
│   ├── routes/
│   │   ├── messages.js         # Text, image, video, buttons, poll...
│   │   ├── verify.js           # OTP send/check/resend
│   │   ├── broadcast.js        # Multi-recipient sends
│   │   ├── groups.js           # Group management
│   │   ├── webhooks.js         # Webhook CRUD + delivery
│   │   ├── contacts.js         # Number check + profile
│   │   ├── instance.js         # QR, reconnect, presence, queue
│   │   ├── logs.js             # Message history
│   │   ├── admin.js            # Key management + quotas
│   │   ├── update.js           # Auto-update endpoints
│   │   └── status.js           # Health, status, metrics
│   ├── queue/
│   │   └── messageQueue.js     # Anti-ban queue + retry + scheduling
│   └── utils/
│       ├── apiKeys.js          # Key persistence + permission check
│       ├── quota.js            # Plan limits + daily counters
│       ├── messageLog.js       # Message history persistence
│       └── webhook.js          # HMAC delivery + retry
├── .env.example                # Configuration template
└── .wabot_state.json           # Auto-updater state (auto-created)
```

---

## Message Queue — Anti-Ban Protection

All messages go through a FIFO queue with random delays:

- **Default delays:** 800 ms – 2500 ms between each message (configurable)
- **Typing indicator:** bot appears to type before sending (opt-in per message)
- **Retry:** up to 3 attempts with exponential backoff (1s → 2s → 4s)
- **Priority levels:** `urgent`, `normal`, `low` (broadcasts always `low`)
- **Scheduling:** messages can be queued for a future timestamp

This pattern mimics human behavior and reduces the risk of WhatsApp rate-limiting or banning the number.

---

## Quota Plans

| Plan | Messages/day | Use case |
|---|---|---|
| `free` | 100 | Testing / personal |
| `starter` | 1,000 | Small projects |
| `pro` | 10,000 | Production apps |
| `business` | Unlimited | Enterprise |

Assign a plan: `PATCH /api/v1/admin/quotas/:keyId` with `{"plan":"pro"}`

---

## License

MIT — use freely, keep attribution.
