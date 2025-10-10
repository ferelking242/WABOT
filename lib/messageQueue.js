/**
 * Advanced Message Queue System for wabot
 * Handles concurrent message processing with priorities and back-pressure control
 */

const EventEmitter = require('events');
const { rateLimiter } = require('./rateLimiter');
const { cache } = require('./cache');

class MessageQueue extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            maxConcurrent: 50,          // Max 50 concurrent message processing
            maxQueueSize: 1000,         // Max 1000 messages in queue
            processingTimeout: 30000,   // 30 seconds timeout per message
            priorityLevels: {
                CRITICAL: 0,    // Owner/admin commands
                HIGH: 1,        // Regular commands
                MEDIUM: 2,      // Media processing
                LOW: 3,         // Background tasks
                BULK: 4         // Bulk operations
            },
            retryAttempts: 3,
            retryDelay: 2000,           // 2 seconds between retries
            cleanupInterval: 60000      // Cleanup every minute
        };
        
        // Queue storage - separate queues by priority
        this.queues = new Map();
        Object.values(this.config.priorityLevels).forEach(priority => {
            this.queues.set(priority, []);
        });
        
        // Processing tracking
        this.processing = new Map();        // messageId -> processing info
        this.activeProcessors = new Set();  // chatId -> processing status
        this.processingCount = 0;
        this.stats = {
            processed: 0,
            failed: 0,
            queued: 0,
            dropped: 0,
            avgProcessingTime: 0
        };
        
        // Workers and intervals
        this.workers = [];
        this.cleanupInterval = null;
        
        // Ne pas démarrer automatiquement - attendre l'appel d'initialize()
        this.started = false;
    }

    /**
     * Initialize and start the message queue
     */
    initialize() {
        if (this.started) {
            console.log('⚠️ Message Queue already started');
            return;
        }
        
        this.startWorkers();
        this.startCleanup();
        this.started = true;
        
        console.log(`🔄 Message Queue initialized with ${this.config.maxConcurrent} concurrent workers`);
    }

    /**
     * Add message to queue
     * @param {object} message - WhatsApp message object
     * @param {string} chatId - Chat ID
     * @param {function} processor - Function to process the message
     * @param {object} options - Processing options
     */
    async enqueue(message, chatId, processor, options = {}) {
        try {
            const messageId = this.generateMessageId(message, chatId);
            const priority = this.determinePriority(message, options);
            const timestamp = Date.now();
            
            // Check queue size limits
            const totalQueued = this.getTotalQueueSize();
            if (totalQueued >= this.config.maxQueueSize) {
                this.stats.dropped++;
                console.warn(`⚠️ Queue full (${totalQueued}), dropping message from ${chatId}`);
                return {
                    success: false,
                    reason: 'Queue is full. Please try again later.',
                    position: -1
                };
            }
            
            // Check rate limits
            const userId = message.key.participant || message.key.remoteJid;
            const command = this.extractCommand(message);
            const isVip = options.isVip || false;
            
            const rateLimitCheck = await rateLimiter.checkLimit(userId, command, isVip);
            if (!rateLimitCheck.allowed) {
                return {
                    success: false,
                    reason: rateLimitCheck.reason,
                    retryAfter: rateLimitCheck.retryAfter
                };
            }
            
            // Create queue item
            const queueItem = {
                messageId,
                message,
                chatId,
                processor,
                priority,
                timestamp,
                attempts: 0,
                userId,
                command,
                options: {
                    timeout: options.timeout || this.config.processingTimeout,
                    retryable: options.retryable !== false,
                    ...options
                }
            };
            
            // Add to appropriate priority queue
            const queue = this.queues.get(priority);
            queue.push(queueItem);
            this.stats.queued++;
            
            // Emit queue event
            this.emit('enqueued', {
                messageId,
                chatId,
                priority,
                position: queue.length,
                totalQueued: this.getTotalQueueSize()
            });
            
            // Try to process immediately if workers available
            this.triggerProcessing();
            
            return {
                success: true,
                messageId,
                priority,
                position: queue.length,
                estimatedWait: this.estimateWaitTime(priority)
            };
            
        } catch (error) {
            console.error('Error enqueueing message:', error);
            return {
                success: false,
                reason: 'Internal queue error',
                error: error.message
            };
        }
    }

    /**
     * Determine message priority
     */
    determinePriority(message, options) {
        if (options.priority !== undefined) {
            return options.priority;
        }
        
        const command = this.extractCommand(message);
        const userId = message.key.participant || message.key.remoteJid;
        
        // Critical priority for specific commands or VIP users
        if (options.isVip || ['owner', 'sudo', 'restart', 'status'].includes(command)) {
            return this.config.priorityLevels.CRITICAL;
        }
        
        // High priority for regular commands
        if (command && !['play', 'video', 'sticker'].includes(command)) {
            return this.config.priorityLevels.HIGH;
        }
        
        // Medium priority for media processing
        if (['play', 'video', 'sticker', 'imagine'].includes(command)) {
            return this.config.priorityLevels.MEDIUM;
        }
        
        // Low priority for background tasks
        if (options.background) {
            return this.config.priorityLevels.LOW;
        }
        
        // Default to high priority
        return this.config.priorityLevels.HIGH;
    }

    /**
     * Extract command from message
     */
    extractCommand(message) {
        const text = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || '';
        
        if (text.startsWith('.')) {
            return text.substring(1).split(' ')[0].toLowerCase();
        }
        return null;
    }

    /**
     * Generate unique message ID
     */
    generateMessageId(message, chatId) {
        const timestamp = message.messageTimestamp || Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${chatId}_${timestamp}_${random}`;
    }

    /**
     * Get total queue size across all priorities
     */
    getTotalQueueSize() {
        let total = 0;
        for (const queue of this.queues.values()) {
            total += queue.length;
        }
        return total;
    }

    /**
     * Estimate wait time based on priority and queue size
     */
    estimateWaitTime(priority) {
        let messagesAhead = 0;
        
        // Count messages with higher or equal priority
        for (const [queuePriority, queue] of this.queues.entries()) {
            if (queuePriority <= priority) {
                messagesAhead += queue.length;
            }
        }
        
        // Estimate based on average processing time and concurrent workers
        const avgTime = this.stats.avgProcessingTime || 2000; // Default 2 seconds
        const concurrency = Math.min(this.config.maxConcurrent, messagesAhead);
        
        return Math.ceil((messagesAhead * avgTime) / (concurrency || 1));
    }

    /**
     * Start worker processes
     */
    startWorkers() {
        for (let i = 0; i < this.config.maxConcurrent; i++) {
            const worker = this.createWorker(i);
            this.workers.push(worker);
        }
    }

    /**
     * Create a worker process
     */
    createWorker(workerId) {
        const worker = {
            id: workerId,
            busy: false,
            currentMessage: null,
            processedCount: 0,
            errorCount: 0
        };
        
        // Start processing loop
        this.processLoop(worker);
        
        return worker;
    }

    /**
     * Main processing loop for worker
     */
    async processLoop(worker) {
        while (true) {
            try {
                if (worker.busy) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                
                const queueItem = this.getNextQueueItem();
                if (!queueItem) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                
                worker.busy = true;
                worker.currentMessage = queueItem;
                
                await this.processMessage(worker, queueItem);
                
                worker.busy = false;
                worker.currentMessage = null;
                worker.processedCount++;
                
            } catch (error) {
                console.error(`Worker ${worker.id} error:`, error);
                worker.errorCount++;
                worker.busy = false;
                worker.currentMessage = null;
                
                // Pause worker briefly on error
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Get next item from queue (priority-based)
     */
    getNextQueueItem() {
        // Process queues in priority order
        for (const priority of Object.values(this.config.priorityLevels).sort()) {
            const queue = this.queues.get(priority);
            if (queue.length > 0) {
                return queue.shift();
            }
        }
        return null;
    }

    /**
     * Process a single message
     */
    async processMessage(worker, queueItem) {
        const startTime = Date.now();
        const { messageId, chatId, processor, message, options } = queueItem;
        
        try {
            // Check if chat is already being processed (prevent duplicate processing)
            if (this.activeProcessors.has(chatId) && !options.allowConcurrent) {
                // Re-queue with slight delay
                setTimeout(() => {
                    const queue = this.queues.get(queueItem.priority);
                    queue.unshift(queueItem);
                }, 1000);
                return;
            }
            
            // Mark chat as being processed
            this.activeProcessors.add(chatId);
            this.processingCount++;
            
            // Track processing
            this.processing.set(messageId, {
                workerId: worker.id,
                startTime,
                chatId,
                attempts: queueItem.attempts + 1
            });
            
            // Set timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Processing timeout')), options.timeout);
            });
            
            // Process message
            const processingPromise = processor(message, chatId);
            
            // Race between processing and timeout
            await Promise.race([processingPromise, timeoutPromise]);
            
            // Processing successful
            const processingTime = Date.now() - startTime;
            this.updateStats(processingTime, true);
            
            this.emit('processed', {
                messageId,
                chatId,
                workerId: worker.id,
                processingTime,
                attempts: queueItem.attempts + 1
            });
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            queueItem.attempts++;
            
            console.error(`Message processing failed (attempt ${queueItem.attempts}):`, error.message);
            
            // Retry logic
            if (options.retryable && queueItem.attempts < this.config.retryAttempts) {
                // Re-queue with delay
                setTimeout(() => {
                    const queue = this.queues.get(queueItem.priority);
                    queue.push(queueItem);
                }, this.config.retryDelay * queueItem.attempts);
                
                this.emit('retry', {
                    messageId,
                    chatId,
                    attempt: queueItem.attempts,
                    error: error.message
                });
            } else {
                // Final failure
                this.updateStats(processingTime, false);
                
                this.emit('failed', {
                    messageId,
                    chatId,
                    workerId: worker.id,
                    attempts: queueItem.attempts,
                    error: error.message
                });
            }
        } finally {
            // Cleanup
            this.processing.delete(messageId);
            this.activeProcessors.delete(chatId);
            this.processingCount--;
            
            // Release concurrent request tracking
            try {
                const { rateLimiter } = require('./rateLimiter');
                rateLimiter.releaseConcurrentRequest(queueItem.userId, queueItem.command);
            } catch (err) {
                console.error('Error releasing concurrent request:', err.message);
            }
        }
    }

    /**
     * Update processing statistics
     */
    updateStats(processingTime, success) {
        if (success) {
            this.stats.processed++;
            // Update rolling average
            const alpha = 0.1; // Smoothing factor
            this.stats.avgProcessingTime = this.stats.avgProcessingTime * (1 - alpha) + processingTime * alpha;
        } else {
            this.stats.failed++;
        }
    }

    /**
     * Trigger processing (notify workers)
     */
    triggerProcessing() {
        // Workers are already in continuous loops, no action needed
        // This method is kept for compatibility and future optimizations
    }

    /**
     * Get queue status
     */
    getStatus() {
        const queueSizes = {};
        for (const [priority, queue] of this.queues.entries()) {
            queueSizes[priority] = queue.length;
        }
        
        const activeWorkers = this.workers.filter(w => w.busy).length;
        
        return {
            queues: queueSizes,
            totalQueued: this.getTotalQueueSize(),
            processing: this.processingCount,
            workers: {
                total: this.workers.length,
                active: activeWorkers,
                idle: this.workers.length - activeWorkers
            },
            stats: { ...this.stats },
            config: {
                maxConcurrent: this.config.maxConcurrent,
                maxQueueSize: this.config.maxQueueSize
            }
        };
    }

    /**
     * Get processing info for specific message
     */
    getMessageStatus(messageId) {
        if (this.processing.has(messageId)) {
            const info = this.processing.get(messageId);
            return {
                status: 'processing',
                workerId: info.workerId,
                startTime: info.startTime,
                duration: Date.now() - info.startTime,
                attempts: info.attempts
            };
        }
        
        // Check if in queue
        for (const [priority, queue] of this.queues.entries()) {
            const position = queue.findIndex(item => item.messageId === messageId);
            if (position !== -1) {
                return {
                    status: 'queued',
                    priority,
                    position: position + 1,
                    estimatedWait: this.estimateWaitTime(priority)
                };
            }
        }
        
        return {
            status: 'not_found'
        };
    }

    /**
     * Priority queue management - bump message priority
     */
    bumpPriority(messageId, newPriority) {
        for (const [currentPriority, queue] of this.queues.entries()) {
            const index = queue.findIndex(item => item.messageId === messageId);
            if (index !== -1) {
                const item = queue.splice(index, 1)[0];
                item.priority = newPriority;
                this.queues.get(newPriority).unshift(item); // Add to front
                return true;
            }
        }
        return false;
    }

    /**
     * Cancel queued message
     */
    cancelMessage(messageId) {
        for (const [priority, queue] of this.queues.entries()) {
            const index = queue.findIndex(item => item.messageId === messageId);
            if (index !== -1) {
                queue.splice(index, 1);
                this.emit('cancelled', { messageId });
                return true;
            }
        }
        return false;
    }

    /**
     * Pause queue processing
     */
    pause() {
        this.paused = true;
        console.log('⏸️ Message queue paused');
    }

    /**
     * Resume queue processing
     */
    resume() {
        this.paused = false;
        console.log('▶️ Message queue resumed');
    }

    /**
     * Start cleanup process
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Cleanup old data and reset statistics
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        // Clean old processing entries (shouldn't happen but safety)
        for (const [messageId, info] of this.processing.entries()) {
            if (now - info.startTime > this.config.processingTimeout * 2) {
                this.processing.delete(messageId);
                cleaned++;
            }
        }
        
        // Reset rolling statistics periodically
        if (now % (60 * 60 * 1000) < this.config.cleanupInterval) { // Every hour
            this.stats.processed = Math.floor(this.stats.processed * 0.9);
            this.stats.failed = Math.floor(this.stats.failed * 0.9);
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Message queue cleaned ${cleaned} stale entries`);
        }
    }

    /**
     * Destroy the queue
     */
    destroy() {
        this.paused = true;
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Clear all queues
        for (const queue of this.queues.values()) {
            queue.length = 0;
        }
        
        this.processing.clear();
        this.activeProcessors.clear();
        this.workers.length = 0;
        
        console.log('🗑️ Message queue destroyed');
    }
}

// Create singleton instance
const messageQueue = new MessageQueue();

module.exports = {
    messageQueue,
    enqueue: (message, chatId, processor, options) => messageQueue.enqueue(message, chatId, processor, options),
    getStatus: () => messageQueue.getStatus(),
    getMessageStatus: (messageId) => messageQueue.getMessageStatus(messageId),
    bumpPriority: (messageId, priority) => messageQueue.bumpPriority(messageId, priority),
    cancelMessage: (messageId) => messageQueue.cancelMessage(messageId),
    pause: () => messageQueue.pause(),
    resume: () => messageQueue.resume()
};