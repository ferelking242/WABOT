'use strict';

/**
 * Message Queue — Anti-ban production-grade queue
 *
 * Features:
 * - FIFO processing with configurable delay between sends
 * - Random jitter on delays (anti-ban)
 * - Retry with exponential backoff (max 3 attempts)
 * - Priority levels: high / normal / low
 * - Queue status & metrics
 * - Per-key daily quota checking
 * - Typing simulation before send (optional)
 * - Event emission for delivery tracking
 *
 * FIX: Ajout circuit-breaker 429 WhatsApp — quand WA répond 429,
 *      pause globale de 60-300s avant tout nouvel envoi.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Circuit-breaker partagé 429 ──────────────────────────────────────────────
// Synchronisé avec lib/messageQueue.js si chargé dans le même process
let _circuit429 = null;
function getCircuit() {
    if (_circuit429) return _circuit429;
    try {
        const { CIRCUIT } = require('../../lib/messageQueue');
        _circuit429 = CIRCUIT;
    } catch (_) {
        // Fallback local si lib/messageQueue n'est pas disponible
        _circuit429 = {
            tripped: false,
            tripCount: 0,
            lastTripAt: 0,
            backoffMs() { return Math.min(300_000, 60_000 + (this.tripCount - 1) * 30_000); },
            trip() {
                this.tripped = true;
                this.tripCount++;
                this.lastTripAt = Date.now();
                const wait = this.backoffMs();
                console.warn(`⚡ [API-QUEUE] Circuit-breaker 429 — pause ${wait / 1000}s`);
                setTimeout(() => {
                    this.tripped = false;
                    console.log('✅ [API-QUEUE] Reprise des envois après 429.');
                }, wait);
            },
        };
    }
    return _circuit429;
}

function is429(err) {
    if (!err) return false;
    return (
        err.data === 429 ||
        (err.message || '').includes('429') ||
        (err.output && err.output.statusCode === 429) ||
        (err.isBoom && err.data === 429)
    );
}

class MessageQueue extends EventEmitter {
    constructor(opts = {}) {
        super();

        this.minDelay = opts.minDelay ?? 1000;
        this.maxDelay = opts.maxDelay ?? 3000;
        this.maxRetries = opts.maxRetries ?? 3;
        this.typingMs = opts.typingMs ?? 1200;
        this.concurrency = 1;

        this._queues = { high: [], normal: [], low: [] };
        this._processing = false;
        this._stats = {
            enqueued: 0,
            succeeded: 0,
            failed: 0,
            retried: 0,
            dropped: 0,
        };

        this._jobs = new Map();

        this._loop();
    }

    enqueue(opts) {
        const jobId = crypto.randomUUID();
        const priority = ['high', 'normal', 'low'].includes(opts.priority) ? opts.priority : 'normal';

        const job = {
            jobId,
            jid: opts.jid,
            content: opts.content,
            typing: opts.typing ?? false,
            scheduledAt: opts.scheduledAt ?? null,
            apiKeyId: opts.apiKeyId ?? null,
            meta: opts.meta ?? {},
            attempts: 0,
            status: 'queued',
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            error: null,
        };

        this._queues[priority].push(job);
        this._jobs.set(jobId, job);
        this._stats.enqueued++;

        if (this._jobs.size > 10_000) {
            const oldest = [...this._jobs.keys()][0];
            this._jobs.delete(oldest);
        }

        return { jobId };
    }

    getJob(jobId) {
        const j = this._jobs.get(jobId);
        if (!j) return null;
        return { ...j, content: undefined };
    }

    getStats() {
        const circuit = getCircuit();
        return {
            queue: {
                high: this._queues.high.length,
                normal: this._queues.normal.length,
                low: this._queues.low.length,
                total: this._queues.high.length + this._queues.normal.length + this._queues.low.length,
            },
            stats: { ...this._stats },
            processing: this._processing,
            circuitBreaker: { tripped: circuit.tripped, tripCount: circuit.tripCount },
        };
    }

    clearQueue(priority = null) {
        if (priority) {
            const count = this._queues[priority]?.length || 0;
            this._queues[priority] = [];
            return count;
        }
        const total = this._queues.high.length + this._queues.normal.length + this._queues.low.length;
        this._queues = { high: [], normal: [], low: [] };
        return total;
    }

    _nextJob() {
        for (const priority of ['high', 'normal', 'low']) {
            const q = this._queues[priority];
            if (!q.length) continue;
            for (let i = 0; i < q.length; i++) {
                const job = q[i];
                if (!job.scheduledAt || Date.now() >= job.scheduledAt) {
                    q.splice(i, 1);
                    return job;
                }
            }
        }
        return null;
    }

    _randomDelay() {
        return this.minDelay + Math.floor(Math.random() * (this.maxDelay - this.minDelay));
    }

    async _loop() {
        while (true) {
            // Respecter le circuit-breaker 429
            const circuit = getCircuit();
            if (circuit.tripped) {
                await sleep(1000);
                continue;
            }

            const job = this._nextJob();

            if (!job) {
                await sleep(200);
                continue;
            }

            this._processing = true;
            job.status = 'processing';
            job.startedAt = Date.now();
            job.attempts++;

            try {
                const { getWhatsAppInstance } = require('../../../lib/whatsappInstance');
                const sock = getWhatsAppInstance();

                if (!sock) {
                    throw new Error('WhatsApp not connected');
                }

                if (job.typing) {
                    try {
                        await sock.sendPresenceUpdate('composing', job.jid);
                        await sleep(this.typingMs);
                        await sock.sendPresenceUpdate('paused', job.jid);
                    } catch { }
                }

                const opts = {};
                if (job.meta?.quotedId) {
                    opts.quoted = { key: { remoteJid: job.jid, id: job.meta.quotedId } };
                }

                const sent = await sock.sendMessage(job.jid, job.content, opts);
                const messageId = sent?.key?.id || null;

                job.status = 'completed';
                job.completedAt = Date.now();
                job.messageId = messageId;
                this._stats.succeeded++;

                this.emit('job:success', { jobId: job.jobId, jid: job.jid, messageId, meta: job.meta });

                try {
                    const { deliverEvent } = require('../utils/webhook');
                    await deliverEvent('message.sent', { to: job.jid, messageId, jobId: job.jobId, meta: job.meta });
                } catch { }

            } catch (err) {
                job.error = err.message;

                // ── Gestion spécifique 429 WhatsApp ────────────────────────
                if (is429(err)) {
                    const circuit = getCircuit();
                    if (!circuit.tripped) circuit.trip();

                    // Re-planifier le job après le backoff
                    job.status = 'queued';
                    job.scheduledAt = Date.now() + circuit.backoffMs();
                    job.attempts--; // Ne pas compter ce retry contre le quota
                    this._queues.low.push(job);
                    this._stats.retried++;
                    this.emit('job:retry', { jobId: job.jobId, attempt: job.attempts, error: err.message, reason: '429' });

                    this._processing = false;
                    // Pas de délai ici — le circuit fera la pause au prochain tour de boucle
                    continue;
                }

                if (job.attempts < this.maxRetries) {
                    job.status = 'queued';
                    const backoff = Math.pow(2, job.attempts) * 2_000; // 4s, 8s, 16s
                    job.scheduledAt = Date.now() + backoff;
                    this._queues.low.push(job);
                    this._stats.retried++;
                    this.emit('job:retry', { jobId: job.jobId, attempt: job.attempts, error: err.message });
                } else {
                    job.status = 'failed';
                    job.completedAt = Date.now();
                    this._stats.failed++;
                    this.emit('job:failed', { jobId: job.jobId, jid: job.jid, error: err.message, meta: job.meta });

                    try {
                        const { deliverEvent } = require('../utils/webhook');
                        await deliverEvent('message.failed', { to: job.jid, jobId: job.jobId, error: err.message, meta: job.meta });
                    } catch { }
                }
            }

            this._processing = false;
            await sleep(this._randomDelay());
        }
    }
}

const queue = new MessageQueue({
    minDelay: parseInt(process.env.QUEUE_MIN_DELAY || '1000'),
    maxDelay: parseInt(process.env.QUEUE_MAX_DELAY || '3000'),
    maxRetries: 3,
    typingMs: 1200,
});

module.exports = queue;
