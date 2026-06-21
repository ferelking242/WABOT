'use strict';

/**
 * Advanced Message Queue System for wabot
 * Handles sequential message processing with anti-ban protection
 *
 * FIX: Réduit maxConcurrent de 50 → 3, ajout circuit-breaker 429,
 *      délai inter-messages, pause check dans processLoop.
 */

const EventEmitter = require('events');
const { rateLimiter } = require('./rateLimiter');
const { cache } = require('./cache');

// ── Circuit-breaker global pour les 429 WhatsApp ────────────────────────────
// Quand WhatsApp répond 429, on pause TOUS les envois pendant BACKOFF_MS
const CIRCUIT = {
    tripped: false,
    tripCount: 0,
    lastTripAt: 0,
    // Durée de pause : 60 s pour le premier trip, +30 s par trip consécutif (max 300 s)
    backoffMs() {
        return Math.min(300_000, 60_000 + (this.tripCount - 1) * 30_000);
    },
    trip() {
        this.tripped = true;
        this.tripCount++;
        this.lastTripAt = Date.now();
        const wait = this.backoffMs();
        console.warn(`⚡ [CIRCUIT-BREAKER] WhatsApp 429 détecté (trip #${this.tripCount}). Pause de ${wait / 1000}s...`);
        setTimeout(() => {
            this.tripped = false;
            console.log('✅ [CIRCUIT-BREAKER] Reprise des envois WhatsApp.');
        }, wait);
    },
    // Réinitialise le compteur si aucun 429 depuis 10 minutes
    resetIfStale() {
        if (!this.tripped && this.tripCount > 0 && Date.now() - this.lastTripAt > 600_000) {
            this.tripCount = 0;
        }
    },
};

// Délai minimum entre deux envois WhatsApp (anti-ban)
const MIN_SEND_DELAY_MS = parseInt(process.env.MIN_SEND_DELAY || '1200', 10);

function is429(err) {
    if (!err) return false;
    const msg = err.message || '';
    const data = err.data;
    return (
        data === 429 ||
        msg.includes('429') ||
        (err.output && err.output.statusCode === 429) ||
        (err.isBoom && data === 429)
    );
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class MessageQueue extends EventEmitter {
    constructor() {
        super();

        this.config = {
            // FIX: 50 → 3 concurrent workers max (anti-ban WhatsApp)
            maxConcurrent: parseInt(process.env.QUEUE_CONCURRENCY || '3', 10),
            maxQueueSize: 1000,
            processingTimeout: 30_000,
            priorityLevels: {
                CRITICAL: 0,
                HIGH: 1,
                MEDIUM: 2,
                LOW: 3,
                BULK: 4,
            },
            retryAttempts: 3,
            retryDelay: 5_000,        // FIX: 2 s → 5 s entre retries normaux
            cleanupInterval: 60_000,
        };

        this.queues = new Map();
        Object.values(this.config.priorityLevels).forEach(p => this.queues.set(p, []));

        this.processing = new Map();
        this.activeProcessors = new Set();
        this.processingCount = 0;
        this.stats = {
            processed: 0,
            failed: 0,
            queued: 0,
            dropped: 0,
            avgProcessingTime: 0,
        };

        this.workers = [];
        this.cleanupInterval = null;
        this.started = false;
        this.paused = false;

        // Horodatage du dernier envoi pour respecter MIN_SEND_DELAY_MS
        this._lastSentAt = 0;
    }

    initialize() {
        if (this.started) {
            console.log('⚠️ Message Queue already started');
            return;
        }
        this.startWorkers();
        this.startCleanup();
        this.started = true;
        console.log(`🔄 Message Queue initialisé — ${this.config.maxConcurrent} worker(s), délai min ${MIN_SEND_DELAY_MS}ms`);
    }

    async enqueue(message, chatId, processor, options = {}) {
        try {
            const messageId = this.generateMessageId(message, chatId);
            const priority = this.determinePriority(message, options);
            const timestamp = Date.now();

            const totalQueued = this.getTotalQueueSize();
            if (totalQueued >= this.config.maxQueueSize) {
                this.stats.dropped++;
                console.warn(`⚠️ Queue pleine (${totalQueued}), message ignoré de ${chatId}`);
                return { success: false, reason: 'Queue is full. Please try again later.', position: -1 };
            }

            const userId = message.key.participantAlt || message.key.participant || message.key.remoteJid;
            const command = this.extractCommand(message);
            const isVip = options.isVip || false;

            const rateLimitCheck = await rateLimiter.checkLimit(userId, command, isVip);
            if (!rateLimitCheck.allowed) {
                return { success: false, reason: rateLimitCheck.reason, retryAfter: rateLimitCheck.retryAfter };
            }

            const queueItem = {
                messageId, message, chatId, processor, priority, timestamp,
                attempts: 0, userId, command,
                options: {
                    timeout: options.timeout || this.config.processingTimeout,
                    retryable: options.retryable !== false,
                    ...options,
                },
            };

            const queue = this.queues.get(priority);
            queue.push(queueItem);
            this.stats.queued++;

            this.emit('enqueued', { messageId, chatId, priority, position: queue.length, totalQueued: this.getTotalQueueSize() });
            this.triggerProcessing();

            return { success: true, messageId, priority, position: queue.length, estimatedWait: this.estimateWaitTime(priority) };

        } catch (error) {
            console.error('Error enqueueing message:', error);
            return { success: false, reason: 'Internal queue error', error: error.message };
        }
    }

    determinePriority(message, options) {
        if (options.priority !== undefined) return options.priority;
        const command = this.extractCommand(message);
        if (options.isVip || ['owner', 'sudo', 'restart', 'status'].includes(command)) return this.config.priorityLevels.CRITICAL;
        if (command && !['play', 'video', 'sticker'].includes(command)) return this.config.priorityLevels.HIGH;
        if (['play', 'video', 'sticker', 'imagine'].includes(command)) return this.config.priorityLevels.MEDIUM;
        if (options.background) return this.config.priorityLevels.LOW;
        return this.config.priorityLevels.HIGH;
    }

    extractCommand(message) {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        if (text.startsWith('.')) return text.substring(1).split(' ')[0].toLowerCase();
        return null;
    }

    generateMessageId(message, chatId) {
        const timestamp = message.messageTimestamp || Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${chatId}_${timestamp}_${random}`;
    }

    getTotalQueueSize() {
        let total = 0;
        for (const queue of this.queues.values()) total += queue.length;
        return total;
    }

    estimateWaitTime(priority) {
        let ahead = 0;
        for (const [qp, queue] of this.queues.entries()) {
            if (qp <= priority) ahead += queue.length;
        }
        const avgTime = this.stats.avgProcessingTime || 2000;
        const concurrency = Math.min(this.config.maxConcurrent, ahead);
        return Math.ceil((ahead * avgTime) / (concurrency || 1));
    }

    startWorkers() {
        for (let i = 0; i < this.config.maxConcurrent; i++) {
            const worker = { id: i, busy: false, currentMessage: null, processedCount: 0, errorCount: 0 };
            this.workers.push(worker);
            this.processLoop(worker);
        }
    }

    async processLoop(worker) {
        while (true) {
            try {
                // Respecter la pause (manuelle ou circuit-breaker 429)
                if (this.paused || CIRCUIT.tripped) {
                    await sleep(500);
                    continue;
                }

                if (worker.busy) {
                    await sleep(100);
                    continue;
                }

                const queueItem = this.getNextQueueItem();
                if (!queueItem) {
                    await sleep(500);
                    continue;
                }

                // Délai anti-ban entre envois successifs
                const sinceLastSend = Date.now() - this._lastSentAt;
                if (sinceLastSend < MIN_SEND_DELAY_MS) {
                    await sleep(MIN_SEND_DELAY_MS - sinceLastSend);
                }

                worker.busy = true;
                worker.currentMessage = queueItem;

                await this.processMessage(worker, queueItem);

                worker.busy = false;
                worker.currentMessage = null;
                worker.processedCount++;

            } catch (error) {
                // Vérifier si c'est un 429 WhatsApp
                if (is429(error) && !CIRCUIT.tripped) {
                    CIRCUIT.trip();
                }
                worker.errorCount++;
                worker.busy = false;
                worker.currentMessage = null;
                await sleep(2000);
            }
        }
    }

    getNextQueueItem() {
        CIRCUIT.resetIfStale();
        for (const priority of Object.values(this.config.priorityLevels).sort()) {
            const queue = this.queues.get(priority);
            if (queue && queue.length > 0) return queue.shift();
        }
        return null;
    }

    async processMessage(worker, queueItem) {
        const startTime = Date.now();
        const { messageId, chatId, processor, message, options } = queueItem;

        try {
            if (this.activeProcessors.has(chatId) && !options.allowConcurrent) {
                setTimeout(() => {
                    const queue = this.queues.get(queueItem.priority);
                    if (queue) queue.unshift(queueItem);
                }, 1000);
                return;
            }

            this.activeProcessors.add(chatId);
            this.processingCount++;
            this.processing.set(messageId, { workerId: worker.id, startTime, chatId, attempts: queueItem.attempts + 1 });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Processing timeout')), options.timeout);
            });

            await Promise.race([processor(message, chatId), timeoutPromise]);

            this._lastSentAt = Date.now();
            const processingTime = Date.now() - startTime;
            this.updateStats(processingTime, true);

            this.emit('processed', { messageId, chatId, workerId: worker.id, processingTime, attempts: queueItem.attempts + 1 });

        } catch (error) {
            const processingTime = Date.now() - startTime;
            queueItem.attempts++;

            // Détection 429 WhatsApp → circuit-breaker
            if (is429(error)) {
                if (!CIRCUIT.tripped) CIRCUIT.trip();
                // Re-queue immédiatement avec priorité basse, sera retentée après la pause
                setTimeout(() => {
                    const queue = this.queues.get(this.config.priorityLevels.LOW);
                    if (queue) queue.push(queueItem);
                }, CIRCUIT.backoffMs());
                return;
            }

            if (options.retryable && queueItem.attempts < this.config.retryAttempts) {
                const backoff = this.config.retryDelay * queueItem.attempts;
                setTimeout(() => {
                    const queue = this.queues.get(queueItem.priority);
                    if (queue) queue.push(queueItem);
                }, backoff);

                this.emit('retry', { messageId, chatId, attempt: queueItem.attempts, error: error.message });
            } else {
                this.updateStats(processingTime, false);
                this.emit('failed', { messageId, chatId, workerId: worker.id, attempts: queueItem.attempts, error: error.message });
            }

        } finally {
            this.processing.delete(messageId);
            this.activeProcessors.delete(chatId);
            this.processingCount--;

            try {
                rateLimiter.releaseConcurrentRequest(queueItem.userId, queueItem.command);
            } catch (_) { }
        }
    }

    updateStats(processingTime, success) {
        if (success) {
            this.stats.processed++;
            const alpha = 0.1;
            this.stats.avgProcessingTime = this.stats.avgProcessingTime * (1 - alpha) + processingTime * alpha;
        } else {
            this.stats.failed++;
        }
    }

    triggerProcessing() { }

    getStatus() {
        const queueSizes = {};
        for (const [priority, queue] of this.queues.entries()) queueSizes[priority] = queue.length;
        return {
            queues: queueSizes,
            totalQueued: this.getTotalQueueSize(),
            processing: this.processingCount,
            circuitBreaker: { tripped: CIRCUIT.tripped, tripCount: CIRCUIT.tripCount },
            workers: {
                total: this.workers.length,
                active: this.workers.filter(w => w.busy).length,
                idle: this.workers.filter(w => !w.busy).length,
            },
            stats: { ...this.stats },
            config: { maxConcurrent: this.config.maxConcurrent, maxQueueSize: this.config.maxQueueSize },
        };
    }

    getMessageStatus(messageId) {
        if (this.processing.has(messageId)) {
            const info = this.processing.get(messageId);
            return { status: 'processing', workerId: info.workerId, startTime: info.startTime, duration: Date.now() - info.startTime, attempts: info.attempts };
        }
        for (const [priority, queue] of this.queues.entries()) {
            const position = queue.findIndex(item => item.messageId === messageId);
            if (position !== -1) return { status: 'queued', priority, position: position + 1, estimatedWait: this.estimateWaitTime(priority) };
        }
        return { status: 'not_found' };
    }

    bumpPriority(messageId, newPriority) {
        for (const [, queue] of this.queues.entries()) {
            const index = queue.findIndex(item => item.messageId === messageId);
            if (index !== -1) {
                const item = queue.splice(index, 1)[0];
                item.priority = newPriority;
                this.queues.get(newPriority).unshift(item);
                return true;
            }
        }
        return false;
    }

    cancelMessage(messageId) {
        for (const [, queue] of this.queues.entries()) {
            const index = queue.findIndex(item => item.messageId === messageId);
            if (index !== -1) {
                queue.splice(index, 1);
                this.emit('cancelled', { messageId });
                return true;
            }
        }
        return false;
    }

    pause() {
        this.paused = true;
        console.log('⏸️ Message queue pausée');
    }

    resume() {
        this.paused = false;
        console.log('▶️ Message queue reprise');
    }

    startCleanup() {
        this.cleanupInterval = setInterval(() => this.cleanup(), this.config.cleanupInterval);
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [messageId, info] of this.processing.entries()) {
            if (now - info.startTime > this.config.processingTimeout * 2) {
                this.processing.delete(messageId);
                cleaned++;
            }
        }
        if (now % (60 * 60 * 1000) < this.config.cleanupInterval) {
            this.stats.processed = Math.floor(this.stats.processed * 0.9);
            this.stats.failed = Math.floor(this.stats.failed * 0.9);
        }
        if (cleaned > 0) console.log(`🧹 Message queue nettoyée: ${cleaned} entrées obsolètes`);
    }

    destroy() {
        this.paused = true;
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        for (const queue of this.queues.values()) queue.length = 0;
        this.processing.clear();
        this.activeProcessors.clear();
        this.workers.length = 0;
        console.log('🗑️ Message queue détruite');
    }
}

const messageQueue = new MessageQueue();

module.exports = {
    messageQueue,
    CIRCUIT,
    enqueue: (message, chatId, processor, options) => messageQueue.enqueue(message, chatId, processor, options),
    getStatus: () => messageQueue.getStatus(),
    getMessageStatus: (messageId) => messageQueue.getMessageStatus(messageId),
    bumpPriority: (messageId, priority) => messageQueue.bumpPriority(messageId, priority),
    cancelMessage: (messageId) => messageQueue.cancelMessage(messageId),
    pause: () => messageQueue.pause(),
    resume: () => messageQueue.resume(),
};
