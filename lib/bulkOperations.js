/**
 * Bulk Operations System for wabot
 * Optimizes batch processing for companions, database operations, and API calls
 */

const EventEmitter = require('events');
const { connectionPool } = require('./connectionPooling');
const { circuitBreakerManager } = require('./circuitBreaker');
const { performanceMetrics } = require('./performanceMetrics');

class BulkOperations extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            // Batch sizes
            batches: {
                database: 25,      // 25 DB operations per batch
                api: 5,           // 5 API calls per batch
                companions: 10,   // 10 companion operations per batch
                messages: 50      // 50 messages per batch
            },
            
            // Timeouts for batching
            timeouts: {
                database: 2000,   // 2 seconds max wait for DB batch
                api: 5000,        // 5 seconds max wait for API batch
                companions: 3000, // 3 seconds max wait for companion batch
                messages: 1000    // 1 second max wait for message batch
            },
            
            // Retry configuration
            retry: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                initialDelay: 1000
            },
            
            // Performance thresholds
            performance: {
                maxConcurrentBatches: 10,
                slowBatchThreshold: 10000, // 10 seconds
                failureRateThreshold: 0.1  // 10% failure rate
            }
        };
        
        this.queues = {
            database: [],
            api: new Map(), // Grouped by API name
            companions: [],
            messages: []
        };
        
        this.timers = {
            database: null,
            api: new Map(),
            companions: null,
            messages: null
        };
        
        this.stats = {
            batches: {
                total: 0,
                successful: 0,
                failed: 0,
                avgSize: 0,
                avgDuration: 0
            },
            operations: {
                total: 0,
                successful: 0,
                failed: 0,
                batched: 0,
                individual: 0
            },
            performance: {
                slowBatches: 0,
                fastBatches: 0,
                activeBatches: 0
            }
        };
        
        this.activeBatches = new Set();
        
        // Initialization log moved to explicit initialize() method
    }

    /**
     * Initialize bulk operations system
     */
    initialize() {
        console.log('📦 Bulk Operations System initialized');
    }

    /**
     * Execute database operations in bulk
     * @param {string} operation - Operation type (insert, update, delete, select)
     * @param {string} table - Table name
     * @param {array} data - Array of data objects
     * @param {object} options - Operation options
     */
    async executeDatabaseBulk(operation, table, data, options = {}) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        
        const startTime = Date.now();
        const batchId = this.generateBatchId('db');
        
        try {
            this.activeBatches.add(batchId);
            this.stats.performance.activeBatches++;
            
            // Split into manageable chunks
            const chunks = this.chunkArray(data, this.config.batches.database);
            const results = [];
            
            for (const chunk of chunks) {
                const chunkResult = await this.processDatabaseChunk(operation, table, chunk, options);
                results.push(...chunkResult);
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchSuccess(batchId, 'database', data.length, duration);
            this.stats.operations.batched += data.length;
            
            return results;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchFailure(batchId, 'database', data.length, duration, error);
            throw error;
            
        } finally {
            this.activeBatches.delete(batchId);
            this.stats.performance.activeBatches--;
        }
    }

    /**
     * Process a database chunk
     */
    async processDatabaseChunk(operation, table, chunk, options) {
        return await connectionPool.executeWithSupabase(async (client) => {
            switch (operation.toLowerCase()) {
                case 'insert':
                    const { data: insertData, error: insertError } = await client
                        .from(table)
                        .insert(chunk)
                        .select();
                    
                    if (insertError) throw insertError;
                    return insertData;
                
                case 'update':
                    const results = [];
                    for (const item of chunk) {
                        const { data: updateData, error: updateError } = await client
                            .from(table)
                            .update(item.data)
                            .eq(item.where.column, item.where.value)
                            .select();
                        
                        if (updateError) throw updateError;
                        results.push(...updateData);
                    }
                    return results;
                
                case 'delete':
                    const deleteResults = [];
                    for (const item of chunk) {
                        const { data: deleteData, error: deleteError } = await client
                            .from(table)
                            .delete()
                            .eq(item.column, item.value)
                            .select();
                        
                        if (deleteError) throw deleteError;
                        deleteResults.push(...deleteData);
                    }
                    return deleteResults;
                
                case 'select':
                    const { data: selectData, error: selectError } = await client
                        .from(table)
                        .select(options.select || '*')
                        .in(options.column, chunk);
                    
                    if (selectError) throw selectError;
                    return selectData;
                
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }
        });
    }

    /**
     * Execute API calls in bulk with rate limiting
     * @param {string} apiName - API name
     * @param {array} calls - Array of API call functions
     * @param {object} options - Options
     */
    async executeApiBulk(apiName, calls, options = {}) {
        if (!Array.isArray(calls) || calls.length === 0) {
            throw new Error('Calls must be a non-empty array');
        }
        
        const startTime = Date.now();
        const batchId = this.generateBatchId('api');
        
        try {
            this.activeBatches.add(batchId);
            this.stats.performance.activeBatches++;
            
            // Execute with circuit breaker protection
            const results = await circuitBreakerManager.execute(
                `bulk_${apiName}`,
                async () => {
                    return await this.processApiCalls(apiName, calls, options);
                },
                {
                    failureThreshold: 3,
                    timeout: 30000
                }
            );
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchSuccess(batchId, 'api', calls.length, duration);
            this.stats.operations.batched += calls.length;
            
            return results;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchFailure(batchId, 'api', calls.length, duration, error);
            throw error;
            
        } finally {
            this.activeBatches.delete(batchId);
            this.stats.performance.activeBatches--;
        }
    }

    /**
     * Process API calls with concurrency control
     */
    async processApiCalls(apiName, calls, options) {
        const chunks = this.chunkArray(calls, this.config.batches.api);
        const results = [];
        
        for (const chunk of chunks) {
            // Execute chunk in parallel with controlled concurrency
            const chunkPromises = chunk.map(async (call, index) => {
                const callStartTime = Date.now();
                
                try {
                    const result = await connectionPool.executeApiCall(apiName, call, options);
                    
                    const callEndTime = Date.now();
                    performanceMetrics.trackApiCall(apiName, callEndTime - callStartTime, true);
                    
                    return { success: true, result, index };
                    
                } catch (error) {
                    const callEndTime = Date.now();
                    performanceMetrics.trackApiCall(apiName, callEndTime - callStartTime, false, { error: error.message });
                    
                    return { success: false, error: error.message, index };
                }
            });
            
            const chunkResults = await Promise.allSettled(chunkPromises);
            results.push(...chunkResults.map(result => result.value || result.reason));
            
            // Add delay between chunks to respect rate limits
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await this.delay(1000); // 1 second between chunks
            }
        }
        
        return results;
    }

    /**
     * Execute companion operations in bulk
     * @param {string} operation - Operation type
     * @param {array} companions - Array of companion data
     * @param {object} options - Options
     */
    async executeCompanionBulk(operation, companions, options = {}) {
        if (!Array.isArray(companions) || companions.length === 0) {
            throw new Error('Companions must be a non-empty array');
        }
        
        const startTime = Date.now();
        const batchId = this.generateBatchId('companion');
        
        try {
            this.activeBatches.add(batchId);
            this.stats.performance.activeBatches++;
            
            const chunks = this.chunkArray(companions, this.config.batches.companions);
            const results = [];
            
            for (const chunk of chunks) {
                const chunkResult = await this.processCompanionChunk(operation, chunk, options);
                results.push(...chunkResult);
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchSuccess(batchId, 'companion', companions.length, duration);
            this.stats.operations.batched += companions.length;
            
            return results;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchFailure(batchId, 'companion', companions.length, duration, error);
            throw error;
            
        } finally {
            this.activeBatches.delete(batchId);
            this.stats.performance.activeBatches--;
        }
    }

    /**
     * Process companion chunk
     */
    async processCompanionChunk(operation, chunk, options) {
        const results = [];
        
        switch (operation.toLowerCase()) {
            case 'wake':
                for (const companion of chunk) {
                    try {
                        const result = await this.wakeCompanion(companion, options);
                        results.push({ success: true, companion: companion.name, result });
                    } catch (error) {
                        results.push({ success: false, companion: companion.name, error: error.message });
                    }
                    
                    // Small delay between companion operations
                    await this.delay(500);
                }
                break;
                
            case 'sleep':
                for (const companion of chunk) {
                    try {
                        const result = await this.sleepCompanion(companion, options);
                        results.push({ success: true, companion: companion.name, result });
                    } catch (error) {
                        results.push({ success: false, companion: companion.name, error: error.message });
                    }
                    
                    await this.delay(500);
                }
                break;
                
            case 'status':
                // Status can be checked in parallel
                const statusPromises = chunk.map(async (companion) => {
                    try {
                        const status = await this.getCompanionStatus(companion, options);
                        return { success: true, companion: companion.name, status };
                    } catch (error) {
                        return { success: false, companion: companion.name, error: error.message };
                    }
                });
                
                const statusResults = await Promise.allSettled(statusPromises);
                results.push(...statusResults.map(result => result.value || { success: false, error: result.reason }));
                break;
                
            default:
                throw new Error(`Unsupported companion operation: ${operation}`);
        }
        
        return results;
    }

    /**
     * Wake companion (placeholder - integrate with actual companion manager)
     */
    async wakeCompanion(companion, options) {
        // This would integrate with the actual companion manager
        // For now, return a mock result
        return { status: 'waking', companion: companion.name };
    }

    /**
     * Sleep companion (placeholder - integrate with actual companion manager)
     */
    async sleepCompanion(companion, options) {
        // This would integrate with the actual companion manager
        return { status: 'sleeping', companion: companion.name };
    }

    /**
     * Get companion status (placeholder)
     */
    async getCompanionStatus(companion, options) {
        // This would integrate with the actual companion manager
        return { status: 'active', companion: companion.name };
    }

    /**
     * Execute message operations in bulk
     * @param {array} messages - Array of message operations
     * @param {object} options - Options
     */
    async executeMessageBulk(messages, options = {}) {
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages must be a non-empty array');
        }
        
        const startTime = Date.now();
        const batchId = this.generateBatchId('message');
        
        try {
            this.activeBatches.add(batchId);
            this.stats.performance.activeBatches++;
            
            // Group messages by chat to avoid conflicts
            const groupedMessages = this.groupMessagesByChat(messages);
            const results = [];
            
            for (const [chatId, chatMessages] of groupedMessages.entries()) {
                const chunks = this.chunkArray(chatMessages, this.config.batches.messages);
                
                for (const chunk of chunks) {
                    const chunkResult = await this.processMessageChunk(chunk, options);
                    results.push(...chunkResult);
                    
                    // Small delay between chunks for the same chat
                    await this.delay(200);
                }
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchSuccess(batchId, 'message', messages.length, duration);
            this.stats.operations.batched += messages.length;
            
            return results;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.recordBatchFailure(batchId, 'message', messages.length, duration, error);
            throw error;
            
        } finally {
            this.activeBatches.delete(batchId);
            this.stats.performance.activeBatches--;
        }
    }

    /**
     * Group messages by chat ID
     */
    groupMessagesByChat(messages) {
        const grouped = new Map();
        
        for (const message of messages) {
            const chatId = message.chatId || message.key?.remoteJid;
            if (!grouped.has(chatId)) {
                grouped.set(chatId, []);
            }
            grouped.get(chatId).push(message);
        }
        
        return grouped;
    }

    /**
     * Process message chunk
     */
    async processMessageChunk(chunk, options) {
        const results = [];
        
        for (const message of chunk) {
            try {
                // This would integrate with the actual message processor
                const result = await this.processMessage(message, options);
                results.push({ success: true, messageId: message.id, result });
            } catch (error) {
                results.push({ success: false, messageId: message.id, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Process individual message (placeholder)
     */
    async processMessage(message, options) {
        // This would integrate with the actual message processor
        return { status: 'processed', messageId: message.id };
    }

    /**
     * Utility: Split array into chunks
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Utility: Delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique batch ID
     */
    generateBatchId(type) {
        return `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    /**
     * Record successful batch
     */
    recordBatchSuccess(batchId, type, size, duration) {
        this.stats.batches.total++;
        this.stats.batches.successful++;
        this.stats.operations.total += size;
        this.stats.operations.successful += size;
        
        // Update averages
        const alpha = 0.1;
        this.stats.batches.avgSize = this.stats.batches.avgSize * (1 - alpha) + size * alpha;
        this.stats.batches.avgDuration = this.stats.batches.avgDuration * (1 - alpha) + duration * alpha;
        
        // Track performance
        if (duration > this.config.performance.slowBatchThreshold) {
            this.stats.performance.slowBatches++;
        } else {
            this.stats.performance.fastBatches++;
        }
        
        this.emit('batchComplete', {
            batchId,
            type,
            size,
            duration,
            success: true
        });
        
        console.log(`✅ Batch ${batchId} completed: ${size} ${type} operations in ${duration}ms`);
    }

    /**
     * Record failed batch
     */
    recordBatchFailure(batchId, type, size, duration, error) {
        this.stats.batches.total++;
        this.stats.batches.failed++;
        this.stats.operations.total += size;
        this.stats.operations.failed += size;
        
        this.emit('batchFailed', {
            batchId,
            type,
            size,
            duration,
            error: error.message
        });
        
        console.error(`❌ Batch ${batchId} failed: ${error.message}`);
        performanceMetrics.trackError('bulk_operation', error.message, { batchId, type, size });
    }

    /**
     * Get operation statistics
     */
    getStats() {
        const successRate = this.stats.batches.total > 0 ? 
            (this.stats.batches.successful / this.stats.batches.total) * 100 : 0;
        
        const operationSuccessRate = this.stats.operations.total > 0 ? 
            (this.stats.operations.successful / this.stats.operations.total) * 100 : 0;
        
        return {
            batches: {
                ...this.stats.batches,
                successRate: Math.round(successRate * 100) / 100
            },
            operations: {
                ...this.stats.operations,
                successRate: Math.round(operationSuccessRate * 100) / 100
            },
            performance: {
                ...this.stats.performance,
                avgBatchSize: Math.round(this.stats.batches.avgSize),
                avgBatchDuration: Math.round(this.stats.batches.avgDuration)
            },
            queues: {
                database: this.queues.database.length,
                api: Array.from(this.queues.api.values()).reduce((sum, queue) => sum + queue.length, 0),
                companions: this.queues.companions.length,
                messages: this.queues.messages.length
            }
        };
    }

    /**
     * Get health status
     */
    getHealth() {
        const stats = this.getStats();
        let health = 100;
        
        // Reduce health based on failure rate
        if (stats.batches.successRate < 95) {
            health -= (95 - stats.batches.successRate);
        }
        
        // Reduce health for slow performance
        const slowBatchRatio = stats.performance.slowBatches / 
            (stats.performance.slowBatches + stats.performance.fastBatches);
        if (slowBatchRatio > 0.1) {
            health -= (slowBatchRatio * 30);
        }
        
        // Reduce health for high active batch count
        if (stats.performance.activeBatches > this.config.performance.maxConcurrentBatches) {
            health -= 20;
        }
        
        return {
            score: Math.max(0, Math.round(health)),
            status: health >= 80 ? 'excellent' : health >= 60 ? 'good' : health >= 40 ? 'poor' : 'critical',
            details: {
                successRate: stats.batches.successRate,
                activeBatches: stats.performance.activeBatches,
                slowBatchRatio: Math.round(slowBatchRatio * 100)
            }
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.stats = {
            batches: {
                total: 0,
                successful: 0,
                failed: 0,
                avgSize: 0,
                avgDuration: 0
            },
            operations: {
                total: 0,
                successful: 0,
                failed: 0,
                batched: 0,
                individual: 0
            },
            performance: {
                slowBatches: 0,
                fastBatches: 0,
                activeBatches: 0
            }
        };
        
        console.log('📊 Bulk operations stats reset');
    }

    /**
     * Destroy the bulk operations system
     */
    destroy() {
        // Clear all timers
        Object.values(this.timers).forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        
        // Clear queues
        Object.values(this.queues).forEach(queue => {
            if (Array.isArray(queue)) {
                queue.length = 0;
            } else if (queue instanceof Map) {
                queue.clear();
            }
        });
        
        this.activeBatches.clear();
        this.reset();
        
        console.log('🗑️ Bulk operations system destroyed');
    }
}

// Create singleton instance
const bulkOperations = new BulkOperations();

module.exports = {
    bulkOperations,
    
    // Convenience functions
    executeDatabaseBulk: (operation, table, data, options) => 
        bulkOperations.executeDatabaseBulk(operation, table, data, options),
    executeApiBulk: (apiName, calls, options) => 
        bulkOperations.executeApiBulk(apiName, calls, options),
    executeCompanionBulk: (operation, companions, options) => 
        bulkOperations.executeCompanionBulk(operation, companions, options),
    executeMessageBulk: (messages, options) => 
        bulkOperations.executeMessageBulk(messages, options),
    getStats: () => bulkOperations.getStats(),
    getHealth: () => bulkOperations.getHealth()
};