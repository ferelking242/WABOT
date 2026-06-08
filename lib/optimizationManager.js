/**
 * Optimization Manager for wabot
 * Centralized integration of all performance and concurrency optimizations
 */

const { rateLimiter } = require('./rateLimiter');
const { messageQueue } = require('./messageQueue');
const { circuitBreakerManager } = require('./circuitBreaker');
const { connectionPool } = require('./connectionPooling');
const { memoryMonitor } = require('./memoryMonitor');
const { performanceMetrics } = require('./performanceMetrics');
const { bulkOperations } = require('./bulkOperations');

class OptimizationManager {
    constructor() {
        this.initialized = false;
        this.systems = {
            rateLimiter,
            messageQueue,
            circuitBreakerManager,
            connectionPool,
            memoryMonitor,
            performanceMetrics,
            bulkOperations
        };
        
        this.metrics = {
            startTime: Date.now(),
            messagesProcessed: 0,
            errorsHandled: 0,
            optimizationsApplied: 0
        };
        
        console.log('🚀 Optimization Manager created');
    }

    /**
     * Initialize all optimization systems
     */
    async initialize() {
        if (this.initialized) {
            console.log('⚠️ Optimization Manager already initialized');
            return;
        }

        try {
            console.log('🔧 Initializing optimization systems...');

            // Initialize individual systems that need it
            if (messageQueue.initialize) {
                messageQueue.initialize();
            }
            
            // Initialize other systems that may need it
            if (connectionPool.initialize) {
                connectionPool.initialize();
            }
            
            if (performanceMetrics.initialize) {
                performanceMetrics.initialize();
            }
            
            if (circuitBreakerManager.initialize) {
                circuitBreakerManager.initialize();
            }
            
            if (bulkOperations.initialize) {
                bulkOperations.initialize();
            }

            // Initialize VIP users from environment
            await this.initializeVipUsers();

            // Setup performance monitoring
            this.setupPerformanceMonitoring();

            // Setup memory monitoring alerts
            this.setupMemoryAlerts();

            // Setup circuit breaker alerts
            this.setupCircuitBreakerAlerts();

            // Health check interval
            this.startHealthChecks();

            this.initialized = true;
            console.log('✅ All optimization systems initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize optimization systems:', error.message);
            throw error;
        }
    }

    /**
     * Initialize VIP users (owners/admins) for rate limiting
     */
    async initializeVipUsers() {
        try {
            // Add default owner
            const ownerNumber = process.env.OWNER_NUMBER || '242056621477';
            const ownerJid = `${ownerNumber}@s.whatsapp.net`;
            rateLimiter.addVipUser(ownerJid);

            // Add any additional VIP users from environment
            const vipUsers = process.env.VIP_USERS ? process.env.VIP_USERS.split(',') : [];
            for (const user of vipUsers) {
                const userJid = user.includes('@') ? user : `${user}@s.whatsapp.net`;
                rateLimiter.addVipUser(userJid);
            }

            console.log(`👑 Initialized ${vipUsers.length + 1} VIP users for rate limiting`);

        } catch (error) {
            console.error('Error initializing VIP users:', error.message);
        }
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        performanceMetrics.on('command', (data) => {
            if (data.performance === 'slow' || data.performance === 'very_slow') {
                console.warn(`⚠️ Slow command detected: ${data.command} (${data.responseTime}ms)`);
            }
        });

        performanceMetrics.on('threshold', (data) => {
            if (data.level === 'critical') {
                console.error(`🚨 Critical threshold exceeded: ${data.type} at ${data.value}`);
            }
        });

        performanceMetrics.on('healthCheck', (health) => {
            if (health.overall < 60) {
                console.warn(`⚠️ System health degraded: ${health.overall}%`);
            }
        });
    }

    /**
     * Setup memory monitoring alerts
     */
    setupMemoryAlerts() {
        memoryMonitor.on('alert', (alert) => {
            const emoji = alert.to === 'critical' ? '🚨' : '⚠️';
            console.log(`${emoji} Memory alert: ${alert.to} (${alert.usage.heapUsed}MB used)`);
        });

        memoryMonitor.on('memoryLeakDetected', (data) => {
            console.error(`🚨 Memory leak detected! Growth: ${data.growthRatio.toFixed(2)}x baseline`);
        });

        memoryMonitor.on('overflow', (data) => {
            console.error('🚨 CRITICAL: Memory overflow! Immediate restart recommended.');
        });
    }

    /**
     * Setup circuit breaker alerts
     */
    setupCircuitBreakerAlerts() {
        // Circuit breaker manager is not an EventEmitter, individual breakers are
        // We'll get alerts through the breakers themselves or via health checks
        console.log('🔒 Circuit breaker monitoring configured via health checks');
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks() {
        setInterval(async () => {
            try {
                const health = await this.getSystemHealth();
                
                if (health.overall < 50) {
                    console.error('🚨 System health critical:', health);
                } else if (health.overall < 70) {
                    console.warn('⚠️ System health degraded:', health);
                }

            } catch (error) {
                console.error('Error in health check:', error.message);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Process message with all optimizations
     */
    async processMessageOptimized(sock, message, chatId, messageProcessor, options = {}) {
        const startTime = Date.now();
        const command = this.extractCommand(message);
        const userId = message.key.participantAlt || message.key.participant || message.key.remoteJid;

        try {
            // 1. Rate limiting check
            const isVip = options.isVip || await this.isVipUser(userId);
            const rateLimitCheck = await rateLimiter.checkLimit(userId, command, isVip);
            
            if (!rateLimitCheck.allowed) {
                await sock.sendMessage(chatId, { 
                    text: rateLimitCheck.reason 
                }, { quoted: message });
                return { success: false, reason: 'rate_limited' };
            }

            // 2. Queue the message for processing
            const queueResult = await messageQueue.enqueue(
                message, 
                chatId, 
                messageProcessor, 
                {
                    isVip,
                    command,
                    timeout: options.timeout || 30000,
                    priority: this.determinePriority(command, isVip)
                }
            );

            if (!queueResult.success) {
                await sock.sendMessage(chatId, { 
                    text: queueResult.reason 
                }, { quoted: message });
                return { success: false, reason: 'queue_full' };
            }

            this.metrics.messagesProcessed++;
            
            // Track performance
            const endTime = Date.now();
            performanceMetrics.trackCommand(command, startTime, endTime, true, {
                queuePosition: queueResult.position,
                estimatedWait: queueResult.estimatedWait
            });

            return { 
                success: true, 
                messageId: queueResult.messageId,
                position: queueResult.position 
            };

        } catch (error) {
            const endTime = Date.now();
            this.metrics.errorsHandled++;

            // Track error
            performanceMetrics.trackCommand(command, startTime, endTime, false, {
                error: error.message
            });
            performanceMetrics.trackError('message_processing', error.message, {
                userId,
                command,
                chatId
            });

            console.error('Error in optimized message processing:', error.message);
            throw error;
        }
    }

    /**
     * Execute API call with optimizations
     */
    async executeApiCallOptimized(apiName, apiCall, options = {}) {
        const startTime = Date.now();

        try {
            // Use connection pooling and circuit breaker
            const result = await connectionPool.executeApiCall(apiName, apiCall, options);

            const endTime = Date.now();
            performanceMetrics.trackApiCall(apiName, endTime - startTime, true);

            return result;

        } catch (error) {
            const endTime = Date.now();
            performanceMetrics.trackApiCall(apiName, endTime - startTime, false, {
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Execute database operation with optimizations
     */
    async executeDatabaseOptimized(operation, ...args) {
        const startTime = Date.now();

        try {
            const result = await connectionPool.executeWithSupabase(operation);

            const endTime = Date.now();
            performanceMetrics.trackApiCall('supabase', endTime - startTime, true);

            return result;

        } catch (error) {
            const endTime = Date.now();
            performanceMetrics.trackApiCall('supabase', endTime - startTime, false, {
                error: error.message
            });

            throw error;
        }
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
        return 'general';
    }

    /**
     * Determine message priority
     */
    determinePriority(command, isVip) {
        if (isVip) return 0; // CRITICAL

        const highPriorityCommands = ['help', 'status', 'ping', 'alive'];
        if (highPriorityCommands.includes(command)) return 1; // HIGH

        const mediumPriorityCommands = ['play', 'video', 'sticker'];
        if (mediumPriorityCommands.includes(command)) return 2; // MEDIUM

        return 1; // DEFAULT HIGH
    }

    /**
     * Check if user is VIP
     */
    async isVipUser(userId) {
        // This could be enhanced to check database
        try {
            const isOwner = require('./isOwner');
            return await isOwner(userId);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get comprehensive system health
     */
    async getSystemHealth() {
        try {
            const memoryHealth = memoryMonitor.getStatus();
            const performanceHealth = performanceMetrics.calculateHealth();
            const rateLimiterStats = rateLimiter.getGlobalStats();
            const queueStats = messageQueue.getStatus();
            const circuitBreakerStats = circuitBreakerManager.getAllStatuses();
            const connectionStats = connectionPool.getStats();
            const bulkStats = bulkOperations.getHealth();

            // Calculate overall health score
            let overallScore = 100;

            // Memory health impact (30%)
            overallScore -= (100 - memoryHealth.health) * 0.3;

            // Performance health impact (25%)
            overallScore -= (100 - performanceHealth.overall) * 0.25;

            // Queue health impact (20%)
            const queueHealthScore = queueStats.totalQueued > queueStats.config.maxQueueSize * 0.8 ? 50 : 100;
            overallScore -= (100 - queueHealthScore) * 0.2;

            // Circuit breaker health impact (15%)
            const openBreakers = circuitBreakerStats.global.openBreakers;
            const totalBreakers = circuitBreakerStats.global.totalBreakers;
            const circuitHealthScore = totalBreakers > 0 ? ((totalBreakers - openBreakers) / totalBreakers) * 100 : 100;
            overallScore -= (100 - circuitHealthScore) * 0.15;

            // Bulk operations health impact (10%)
            overallScore -= (100 - bulkStats.score) * 0.1;

            return {
                overall: Math.max(0, Math.round(overallScore)),
                components: {
                    memory: memoryHealth.health,
                    performance: performanceHealth.overall,
                    queue: queueHealthScore,
                    circuitBreakers: circuitHealthScore,
                    bulkOperations: bulkStats.score
                },
                details: {
                    memory: memoryHealth,
                    performance: performanceHealth,
                    rateLimiter: rateLimiterStats,
                    queue: queueStats,
                    circuitBreakers: circuitBreakerStats,
                    connections: connectionStats,
                    bulk: bulkStats
                },
                uptime: Date.now() - this.metrics.startTime,
                metrics: { ...this.metrics }
            };

        } catch (error) {
            console.error('Error calculating system health:', error.message);
            return {
                overall: 0,
                error: error.message,
                uptime: Date.now() - this.metrics.startTime
            };
        }
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            optimization: { ...this.metrics },
            rateLimiter: rateLimiter.getGlobalStats(),
            queue: messageQueue.getStatus(),
            circuitBreakers: circuitBreakerManager.getAllStatuses(),
            connections: connectionPool.getStats(),
            memory: memoryMonitor.getStatus(),
            performance: performanceMetrics.getStatus(),
            bulk: bulkOperations.getStats()
        };
    }

    /**
     * Force cleanup of all systems
     */
    async forceCleanup() {
        try {
            console.log('🧹 Forcing cleanup of optimization systems...');

            // Force memory cleanup
            memoryMonitor.emergencyCleanup();

            // Reset circuit breakers
            circuitBreakerManager.resetAll();

            // Clear rate limiter caches
            // (rateLimiter has automatic cleanup)

            // Force garbage collection
            if (global.gc) {
                global.gc();
            }

            this.metrics.optimizationsApplied++;
            console.log('✅ Forced cleanup completed');

        } catch (error) {
            console.error('Error in forced cleanup:', error.message);
        }
    }

    /**
     * Destroy all optimization systems
     */
    async destroy() {
        try {
            console.log('🗑️ Destroying optimization systems...');

            // Destroy all systems
            Object.values(this.systems).forEach(system => {
                if (system && typeof system.destroy === 'function') {
                    system.destroy();
                }
            });

            this.initialized = false;
            console.log('✅ All optimization systems destroyed');

        } catch (error) {
            console.error('Error destroying optimization systems:', error.message);
        }
    }
}

// Create singleton instance
const optimizationManager = new OptimizationManager();

module.exports = {
    optimizationManager,
    
    // Convenience functions for easy integration
    processMessageOptimized: (sock, message, chatId, processor, options) => 
        optimizationManager.processMessageOptimized(sock, message, chatId, processor, options),
    
    executeApiCallOptimized: (apiName, apiCall, options) => 
        optimizationManager.executeApiCallOptimized(apiName, apiCall, options),
    
    executeDatabaseOptimized: (operation, ...args) => 
        optimizationManager.executeDatabaseOptimized(operation, ...args),
    
    getSystemHealth: () => optimizationManager.getSystemHealth(),
    getStats: () => optimizationManager.getStats(),
    forceCleanup: () => optimizationManager.forceCleanup(),
    
    // Direct access to subsystems
    rateLimiter,
    messageQueue,
    circuitBreakerManager,
    connectionPool,
    memoryMonitor,
    performanceMetrics,
    bulkOperations
};