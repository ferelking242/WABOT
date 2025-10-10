/**
 * Circuit Breaker System for wabot
 * Protects against cascading failures from external APIs and services
 */

const EventEmitter = require('events');
const { cache } = require('./cache');

class CircuitBreaker extends EventEmitter {
    constructor(name, options = {}) {
        super();
        
        this.name = name;
        this.config = {
            failureThreshold: options.failureThreshold || 5,      // 5 failures to open
            successThreshold: options.successThreshold || 3,      // 3 successes to close
            timeout: options.timeout || 60000,                   // 60s timeout in open state
            monitor: options.monitor !== false,                  // Enable monitoring
            
            // Advanced configuration
            slowCallThreshold: options.slowCallThreshold || 10000, // 10s = slow call
            slowCallRateThreshold: options.slowCallRateThreshold || 0.5, // 50% slow calls = problem
            minimumRequestThreshold: options.minimumRequestThreshold || 10, // Need 10+ requests to evaluate
            slidingWindowSize: options.slidingWindowSize || 100,   // Track last 100 calls
            halfOpenMaxCalls: options.halfOpenMaxCalls || 3,      // Max calls in half-open state
            
            // Retry configuration
            retryAfter: options.retryAfter || 30000,              // Retry after 30s
            exponentialBackoff: options.exponentialBackoff !== false,
            maxRetryDelay: options.maxRetryDelay || 300000        // Max 5 minutes
        };
        
        this.state = 'CLOSED';  // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
        this.retryDelay = this.config.retryAfter;
        
        // Sliding window for advanced monitoring
        this.callHistory = [];
        this.metrics = {
            totalCalls: 0,
            totalFailures: 0,
            totalSlowCalls: 0,
            averageResponseTime: 0,
            lastFailureTime: null,
            lastSuccessTime: null,
            stateChanges: []
        };
        
        // Removed automatic initialization log - use manager initialization instead
    }

    /**
     * Execute a call through the circuit breaker
     * @param {function} asyncFunction - The function to execute
     * @param {...any} args - Arguments for the function
     * @returns {Promise} - Result or circuit breaker error
     */
    async execute(asyncFunction, ...args) {
        // Check if circuit is open
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                const waitTime = Math.ceil((this.nextAttempt - Date.now()) / 1000);
                throw new CircuitBreakerError(
                    `Circuit breaker is OPEN for ${this.name}. Retry in ${waitTime}s`,
                    'CIRCUIT_OPEN',
                    waitTime
                );
            } else {
                // Transition to half-open
                this.setState('HALF_OPEN');
            }
        }
        
        // In half-open state, limit concurrent calls
        if (this.state === 'HALF_OPEN') {
            const halfOpenCalls = this.callHistory.filter(call => 
                call.state === 'HALF_OPEN' && call.endTime === null
            ).length;
            
            if (halfOpenCalls >= this.config.halfOpenMaxCalls) {
                throw new CircuitBreakerError(
                    `Circuit breaker ${this.name} is testing. Too many concurrent calls.`,
                    'HALF_OPEN_LIMIT'
                );
            }
        }
        
        return this.call(asyncFunction, ...args);
    }

    /**
     * Execute the actual call with monitoring
     */
    async call(asyncFunction, ...args) {
        const callId = this.generateCallId();
        const startTime = Date.now();
        
        // Track call start
        const callInfo = {
            id: callId,
            startTime,
            endTime: null,
            success: null,
            duration: null,
            state: this.state,
            error: null
        };
        
        this.callHistory.push(callInfo);
        this.metrics.totalCalls++;
        
        try {
            // Execute with timeout
            const result = await Promise.race([
                asyncFunction(...args),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Circuit breaker timeout')), 
                              this.config.timeout);
                })
            ]);
            
            // Success
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            callInfo.endTime = endTime;
            callInfo.duration = duration;
            callInfo.success = true;
            
            this.onSuccess(duration);
            
            return result;
            
        } catch (error) {
            // Failure
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            callInfo.endTime = endTime;
            callInfo.duration = duration;
            callInfo.success = false;
            callInfo.error = error.message;
            
            this.onFailure(error);
            
            throw error;
        } finally {
            this.cleanupHistory();
        }
    }

    /**
     * Handle successful call
     */
    onSuccess(duration) {
        this.metrics.lastSuccessTime = Date.now();
        this.updateAverageResponseTime(duration);
        
        // Check if call was slow
        if (duration > this.config.slowCallThreshold) {
            this.metrics.totalSlowCalls++;
            
            // Check slow call rate
            const recentCalls = this.getRecentCalls();
            const slowCallRate = this.calculateSlowCallRate(recentCalls);
            
            if (slowCallRate > this.config.slowCallRateThreshold && 
                recentCalls.length >= this.config.minimumRequestThreshold) {
                console.warn(`⚠️ High slow call rate (${Math.round(slowCallRate * 100)}%) for ${this.name}`);
                this.emit('slowCallRate', { rate: slowCallRate, threshold: this.config.slowCallRateThreshold });
            }
        }
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.setState('CLOSED');
                this.failureCount = 0;
                this.successCount = 0;
                this.retryDelay = this.config.retryAfter; // Reset retry delay
            }
        } else if (this.state === 'CLOSED') {
            // Reset failure count on success
            this.failureCount = 0;
        }
    }

    /**
     * Handle failed call
     */
    onFailure(error) {
        this.metrics.totalFailures++;
        this.metrics.lastFailureTime = Date.now();
        this.failureCount++;
        
        // Emit failure event
        this.emit('failure', { error, failureCount: this.failureCount });
        
        if (this.state === 'HALF_OPEN') {
            // Failed during half-open, go back to open
            this.setState('OPEN');
            this.scheduleRetry();
        } else if (this.state === 'CLOSED') {
            // Check if we should open the circuit
            const recentCalls = this.getRecentCalls();
            const failureRate = this.calculateFailureRate(recentCalls);
            
            if (this.failureCount >= this.config.failureThreshold || 
                (failureRate > 0.5 && recentCalls.length >= this.config.minimumRequestThreshold)) {
                this.setState('OPEN');
                this.scheduleRetry();
            }
        }
    }

    /**
     * Calculate failure rate from recent calls
     */
    calculateFailureRate(calls) {
        if (calls.length === 0) return 0;
        const failures = calls.filter(call => call.success === false).length;
        return failures / calls.length;
    }

    /**
     * Calculate slow call rate from recent calls
     */
    calculateSlowCallRate(calls) {
        if (calls.length === 0) return 0;
        const slowCalls = calls.filter(call => 
            call.success === true && call.duration > this.config.slowCallThreshold
        ).length;
        return slowCalls / calls.length;
    }

    /**
     * Get recent calls within sliding window
     */
    getRecentCalls() {
        const windowStart = Date.now() - (5 * 60 * 1000); // 5 minutes window
        return this.callHistory
            .filter(call => call.startTime > windowStart && call.endTime !== null)
            .slice(-this.config.slidingWindowSize);
    }

    /**
     * Update average response time
     */
    updateAverageResponseTime(duration) {
        const alpha = 0.1; // Smoothing factor
        this.metrics.averageResponseTime = this.metrics.averageResponseTime * (1 - alpha) + duration * alpha;
    }

    /**
     * Set circuit breaker state
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        
        // Track state change
        this.metrics.stateChanges.push({
            from: oldState,
            to: newState,
            timestamp: Date.now(),
            failureCount: this.failureCount,
            successCount: this.successCount
        });
        
        // Keep only recent state changes
        if (this.metrics.stateChanges.length > 50) {
            this.metrics.stateChanges = this.metrics.stateChanges.slice(-25);
        }
        
        console.log(`🔄 Circuit breaker ${this.name}: ${oldState} → ${newState}`);
        this.emit('stateChange', { from: oldState, to: newState, name: this.name });
    }

    /**
     * Schedule next retry attempt
     */
    scheduleRetry() {
        if (this.config.exponentialBackoff) {
            this.retryDelay = Math.min(this.retryDelay * 2, this.config.maxRetryDelay);
        }
        
        this.nextAttempt = Date.now() + this.retryDelay;
        
        console.log(`⏰ Circuit breaker ${this.name} will retry in ${Math.ceil(this.retryDelay / 1000)}s`);
    }

    /**
     * Force circuit state (for testing or manual intervention)
     */
    forceState(state) {
        if (['CLOSED', 'OPEN', 'HALF_OPEN'].includes(state)) {
            this.setState(state);
            if (state === 'CLOSED') {
                this.failureCount = 0;
                this.successCount = 0;
                this.retryDelay = this.config.retryAfter;
            }
        }
    }

    /**
     * Get circuit breaker status
     */
    getStatus() {
        const recentCalls = this.getRecentCalls();
        const failureRate = this.calculateFailureRate(recentCalls);
        const slowCallRate = this.calculateSlowCallRate(recentCalls);
        
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.nextAttempt,
            retryDelay: this.retryDelay,
            metrics: {
                ...this.metrics,
                recentCalls: recentCalls.length,
                failureRate: Math.round(failureRate * 100),
                slowCallRate: Math.round(slowCallRate * 100),
                health: this.calculateHealth()
            },
            config: { ...this.config }
        };
    }

    /**
     * Calculate health score (0-100)
     */
    calculateHealth() {
        if (this.state === 'OPEN') return 0;
        if (this.state === 'HALF_OPEN') return 25;
        
        const recentCalls = this.getRecentCalls();
        if (recentCalls.length === 0) return 100;
        
        const failureRate = this.calculateFailureRate(recentCalls);
        const slowCallRate = this.calculateSlowCallRate(recentCalls);
        
        // Health decreases with failure rate and slow call rate
        const health = Math.max(0, 100 - (failureRate * 60) - (slowCallRate * 40));
        return Math.round(health);
    }

    /**
     * Generate unique call ID
     */
    generateCallId() {
        return `${this.name}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    /**
     * Cleanup old call history
     */
    cleanupHistory() {
        const cutoff = Date.now() - (30 * 60 * 1000); // Keep 30 minutes of history
        this.callHistory = this.callHistory.filter(call => call.startTime > cutoff);
        
        // Also keep only recent entries within sliding window
        if (this.callHistory.length > this.config.slidingWindowSize * 2) {
            this.callHistory = this.callHistory.slice(-this.config.slidingWindowSize);
        }
    }

    /**
     * Reset circuit breaker
     */
    reset() {
        this.setState('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
        this.retryDelay = this.config.retryAfter;
        this.callHistory = [];
        this.metrics = {
            totalCalls: 0,
            totalFailures: 0,
            totalSlowCalls: 0,
            averageResponseTime: 0,
            lastFailureTime: null,
            lastSuccessTime: null,
            stateChanges: []
        };
        
        console.log(`🔄 Circuit breaker ${this.name} reset`);
        this.emit('reset', { name: this.name });
    }
}

/**
 * Custom error for circuit breaker
 */
class CircuitBreakerError extends Error {
    constructor(message, code, retryAfter = null) {
        super(message);
        this.name = 'CircuitBreakerError';
        this.code = code;
        this.retryAfter = retryAfter;
        this.circuitBreaker = true;
    }
}

/**
 * Circuit Breaker Manager - manages multiple circuit breakers
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
        this.globalStats = {
            totalBreakers: 0,
            openBreakers: 0,
            halfOpenBreakers: 0,
            closedBreakers: 0
        };
        
        // Initialization log moved to explicit initialize() method
    }

    /**
     * Create or get circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {object} options - Configuration options
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    getBreaker(name, options = {}) {
        if (!this.breakers.has(name)) {
            const breaker = new CircuitBreaker(name, options);
            
            // Listen to state changes for global stats
            breaker.on('stateChange', (event) => {
                this.updateGlobalStats();
            });
            
            this.breakers.set(name, breaker);
            this.updateGlobalStats();
        }
        
        return this.breakers.get(name);
    }
    
    /**
     * Initialize circuit breaker system
     */
    initialize() {
        console.log('🔒 Circuit Breaker Manager initialized');
    }

    /**
     * Execute with circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {function} asyncFunction - Function to execute
     * @param {object} options - Circuit breaker options
     * @param {...any} args - Function arguments
     */
    async execute(name, asyncFunction, options = {}, ...args) {
        const breaker = this.getBreaker(name, options);
        return breaker.execute(asyncFunction, ...args);
    }

    /**
     * Get all circuit breaker statuses
     */
    getAllStatuses() {
        const statuses = {};
        for (const [name, breaker] of this.breakers.entries()) {
            statuses[name] = breaker.getStatus();
        }
        
        return {
            breakers: statuses,
            global: { ...this.globalStats }
        };
    }

    /**
     * Update global statistics
     */
    updateGlobalStats() {
        this.globalStats = {
            totalBreakers: this.breakers.size,
            openBreakers: 0,
            halfOpenBreakers: 0,
            closedBreakers: 0
        };
        
        for (const breaker of this.breakers.values()) {
            switch (breaker.state) {
                case 'OPEN':
                    this.globalStats.openBreakers++;
                    break;
                case 'HALF_OPEN':
                    this.globalStats.halfOpenBreakers++;
                    break;
                case 'CLOSED':
                    this.globalStats.closedBreakers++;
                    break;
            }
        }
    }

    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }

    /**
     * Reset specific circuit breaker
     */
    reset(name) {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Remove circuit breaker
     */
    remove(name) {
        if (this.breakers.has(name)) {
            this.breakers.delete(name);
            this.updateGlobalStats();
        }
    }
}

// Create singleton manager
const circuitBreakerManager = new CircuitBreakerManager();

// Pre-configure circuit breakers for common APIs
const API_BREAKERS = {
    youtube: { failureThreshold: 3, timeout: 15000, slowCallThreshold: 10000 },
    instagram: { failureThreshold: 3, timeout: 10000, slowCallThreshold: 8000 },
    tiktok: { failureThreshold: 3, timeout: 10000, slowCallThreshold: 8000 },
    openai: { failureThreshold: 5, timeout: 30000, slowCallThreshold: 20000 },
    google: { failureThreshold: 3, timeout: 15000, slowCallThreshold: 10000 },
    supabase: { failureThreshold: 5, timeout: 5000, slowCallThreshold: 3000 },
    media_processing: { failureThreshold: 3, timeout: 20000, slowCallThreshold: 15000 }
};

// Helper functions for common use cases
const createApiBreaker = (apiName, customOptions = {}) => {
    const defaultOptions = API_BREAKERS[apiName] || {};
    return circuitBreakerManager.getBreaker(apiName, { ...defaultOptions, ...customOptions });
};

module.exports = {
    CircuitBreaker,
    CircuitBreakerError,
    circuitBreakerManager,
    createApiBreaker,
    
    // Convenience functions
    execute: (name, fn, options, ...args) => circuitBreakerManager.execute(name, fn, options, ...args),
    getBreaker: (name, options) => circuitBreakerManager.getBreaker(name, options),
    getAllStatuses: () => circuitBreakerManager.getAllStatuses(),
    reset: (name) => circuitBreakerManager.reset(name),
    resetAll: () => circuitBreakerManager.resetAll()
};