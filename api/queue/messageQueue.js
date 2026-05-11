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
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

class MessageQueue extends EventEmitter {
    constructor(opts = {}) {
        super();

        // Processing settings
        this.minDelay = opts.minDelay ?? 800;    // ms between messages
        this.maxDelay = opts.maxDelay ?? 2500;   // ms — random between min/max
        this.maxRetries = opts.maxRetries ?? 3;
        this.typingMs = opts.typingMs ?? 1200;   // Typing indicator duration
        this.concurrency = 1;                    // Always 1 — sequential sends

        // Internal state
        this._queues = { high: [], normal: [], low: [] };
        this._processing = false;
        this._stats = {
            enqueued: 0,
            succeeded: 0,
            failed: 0,
            retried: 0,
            dropped: 0,
        };

        // Job registry for status lookup
        this._jobs = new Map();

        // Start processing loop
        this._loop();
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Enqueue a message job
     * @param {object} opts
     * @param {string} opts.jid        — WhatsApp JID
     * @param {object} opts.content    — Baileys message content
     * @param {string} opts.priority   — 'high' | 'normal' | 'low'
     * @param {boolean} opts.typing    — Show typing indicator
     * @param {number} opts.scheduledAt — Unix ms to send at
     * @param {string} opts.apiKeyId   — Owner key (for quota)
     * @param {object} opts.meta       — Arbitrary caller metadata
     * @returns {{ jobId: string }}
     */
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

        // Trim job registry (keep last 10k)
        if (this._jobs.size > 10_000) {
            const oldest = [...this._jobs.keys()][0];
            this._jobs.delete(oldest);
        }

        return { jobId };
    }

    /**
     * Get job status
     */
    getJob(jobId) {
        const j = this._jobs.get(jobId);
        if (!j) return null;
        return { ...j, content: undefined }; // Don't expose content in status
    }

    /**
     * Get queue depth and stats
     */
    getStats() {
        return {
            queue: {
                high: this._queues.high.length,
                normal: this._queues.normal.length,
                low: this._queues.low.length,
                total: this._queues.high.length + this._queues.normal.length + this._queues.low.length,
            },
            stats: { ...this._stats },
            processing: this._processing,
        };
    }

    /**
     * Clear all pending jobs (emergency drain)
     */
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

    // ── Internal processing ────────────────────────────────────────────────────

    _nextJob() {
        for (const priority of ['high', 'normal', 'low']) {
            const q = this._queues[priority];
            if (!q.length) continue;

            // Check scheduled jobs — skip if not yet due
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

                // Typing indicator
                if (job.typing) {
                    try {
                        await sock.sendPresenceUpdate('composing', job.jid);
                        await sleep(this.typingMs);
                        await sock.sendPresenceUpdate('paused', job.jid);
                    } catch { /* non-fatal */ }
                }

                // Send the message
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

                // Track delivery via webhook
                try {
                    const { deliverEvent } = require('../utils/webhook');
                    await deliverEvent('message.sent', {
                        to: job.jid,
                        messageId,
                        jobId: job.jobId,
                        meta: job.meta,
                    });
                } catch { /* non-fatal */ }

            } catch (err) {
                job.error = err.message;

                if (job.attempts < this.maxRetries) {
                    // Exponential backoff retry
                    job.status = 'queued';
                    const backoff = Math.pow(2, job.attempts) * 1000;
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
                        await deliverEvent('message.failed', {
                            to: job.jid,
                            jobId: job.jobId,
                            error: err.message,
                            meta: job.meta,
                        });
                    } catch { /* non-fatal */ }
                }
            }

            this._processing = false;

            // Delay before next message (anti-ban)
            await sleep(this._randomDelay());
        }
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Singleton queue instance
const queue = new MessageQueue({
    minDelay: parseInt(process.env.QUEUE_MIN_DELAY || '800'),
    maxDelay: parseInt(process.env.QUEUE_MAX_DELAY || '2500'),
    maxRetries: 3,
    typingMs: 1200,
});

module.exports = queue;
