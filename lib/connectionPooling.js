/**
 * Advanced Connection Pooling System for wabot
 * Optimizes database and API connections for high concurrency
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const axios = require('axios');
const { Agent } = require('https');
const { cache } = require('./cache');
const { circuitBreakerManager } = require('./circuitBreaker');

class ConnectionPool {
    constructor() {
        this.pools = new Map();
        this.config = {
            supabase: {
                maxConnections: 20,
                minConnections: 5,
                acquireTimeoutMillis: 30000,
                createTimeoutMillis: 10000,
                idleTimeoutMillis: 30000,
                reapIntervalMillis: 1000,
                createRetryIntervalMillis: 200,
                max: 20,
                min: 5
            },
            http: {
                maxSockets: 100,
                maxFreeSockets: 10,
                timeout: 30000,
                freeSocketTimeout: 4000,
                keepAlive: true,
                keepAliveMsecs: 1000
            },
            api: {
                youtube: { maxConcurrent: 10, timeout: 15000 },
                instagram: { maxConcurrent: 8, timeout: 12000 },
                openai: { maxConcurrent: 5, timeout: 30000 },
                google: { maxConcurrent: 15, timeout: 20000 }
            }
        };
        
        this.stats = {
            connections: {
                active: 0,
                idle: 0,
                total: 0
            },
            requests: {
                pending: 0,
                completed: 0,
                failed: 0
            },
            pools: new Map()
        };
        
        // Ne pas initialiser automatiquement - attendre l'appel d'initialize()
        this.initialized = false;
        
    }

    /**
     * Initialize the connection pool system
     */
    initialize() {
        if (this.initialized) {
            console.log('⚠️ Connection Pool already initialized');
            return;
        }
        
        this.initializePools();
        this.startMonitoring();
        this.initialized = true;
        
        console.log('✅ Connection Pool system initialized');
    }

    /**
     * Initialize all connection pools
     */
    initializePools() {
        // Initialize Supabase connection pool
        this.initializeSupabasePool();
        
        // Initialize HTTP agents for external APIs
        this.initializeHttpAgents();
        
        // Initialize API-specific pools
        this.initializeApiPools();
    }

    /**
     * Initialize Supabase connection pool
     */
    initializeSupabasePool() {
        const config = require('../config/supabase.config');
        
        if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
            console.warn('⚠️ Supabase configuration missing, skipping pool creation');
            return;
        }

        try {
            // Create pool of Supabase clients
            const supabasePool = {
                name: 'supabase',
                connections: [],
                available: [],
                inUse: new Set(),
                config: this.config.supabase,
                stats: {
                    created: 0,
                    destroyed: 0,
                    acquired: 0,
                    released: 0,
                    timeouts: 0,
                    errors: 0
                }
            };

            // Pre-create minimum connections
            for (let i = 0; i < this.config.supabase.minConnections; i++) {
                const client = this.createSupabaseClient();
                supabasePool.connections.push(client);
                supabasePool.available.push(client);
                supabasePool.stats.created++;
            }

            this.pools.set('supabase', supabasePool);
            console.log(`✅ Supabase pool created with ${this.config.supabase.minConnections} connections`);
            
        } catch (error) {
            console.error('❌ Failed to initialize Supabase pool:', error.message);
        }
    }

    /**
     * Create individual Supabase client
     */
    createSupabaseClient() {
        const config = require('../config/supabase.config');
        
        return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: false,
                detectSessionInUrl: false
            },
            db: { schema: 'public' },
            realtime: { transport: ws },
            global: {
                headers: { 'User-Agent': 'wabot-connection-pool' }
            }
        });
    }

    /**
     * Initialize HTTP agents for external APIs
     */
    initializeHttpAgents() {
        // HTTPS Agent for external APIs
        const httpsAgent = new Agent({
            keepAlive: this.config.http.keepAlive,
            keepAliveMsecs: this.config.http.keepAliveMsecs,
            maxSockets: this.config.http.maxSockets,
            maxFreeSockets: this.config.http.maxFreeSockets,
            timeout: this.config.http.timeout,
            freeSocketTimeout: this.config.http.freeSocketTimeout
        });

        // Create optimized axios instance
        const apiClient = axios.create({
            httpsAgent,
            timeout: this.config.http.timeout,
            maxRedirects: 3,
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
            headers: {
                'User-Agent': 'wabot-api-client/2.0',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate'
            }
        });

        // Add request interceptor for tracking
        apiClient.interceptors.request.use(
            (config) => {
                config.metadata = { startTime: Date.now() };
                this.stats.requests.pending++;
                return config;
            },
            (error) => {
                this.stats.requests.failed++;
                return Promise.reject(error);
            }
        );

        // Add response interceptor for tracking
        apiClient.interceptors.response.use(
            (response) => {
                const duration = Date.now() - response.config.metadata.startTime;
                this.stats.requests.pending--;
                this.stats.requests.completed++;
                
                // Cache successful responses if appropriate
                if (response.status === 200 && response.config.method === 'get') {
                    const cacheKey = `api_${this.hashUrl(response.config.url)}`;
                    cache.set(cacheKey, response.data, 5 * 60 * 1000); // 5 minutes
                }
                
                return response;
            },
            (error) => {
                this.stats.requests.pending--;
                this.stats.requests.failed++;
                return Promise.reject(error);
            }
        );

        this.pools.set('http', { agent: httpsAgent, client: apiClient });
        console.log('✅ HTTP connection pool created');
    }

    /**
     * Initialize API-specific connection pools
     */
    initializeApiPools() {
        for (const [apiName, config] of Object.entries(this.config.api)) {
            const pool = {
                name: apiName,
                maxConcurrent: config.maxConcurrent,
                timeout: config.timeout,
                active: new Set(),
                queue: [],
                stats: {
                    requests: 0,
                    completed: 0,
                    failed: 0,
                    queued: 0,
                    avgResponseTime: 0
                }
            };
            
            this.pools.set(apiName, pool);
        }
        
        console.log(`✅ API pools created for: ${Object.keys(this.config.api).join(', ')}`);
    }

    /**
     * Acquire Supabase connection from pool
     * @returns {Promise<object>} Supabase client
     */
    async acquireSupabaseConnection() {
        const pool = this.pools.get('supabase');
        if (!pool) {
            throw new Error('Supabase pool not initialized');
        }

        const startTime = Date.now();
        
        try {
            // Check for available connection
            if (pool.available.length > 0) {
                const client = pool.available.pop();
                pool.inUse.add(client);
                pool.stats.acquired++;
                return client;
            }

            // Create new connection if under limit
            if (pool.connections.length < pool.config.maxConnections) {
                const client = this.createSupabaseClient();
                pool.connections.push(client);
                pool.inUse.add(client);
                pool.stats.created++;
                pool.stats.acquired++;
                return client;
            }

            // Wait for available connection
            return await this.waitForSupabaseConnection(pool, startTime);
            
        } catch (error) {
            pool.stats.errors++;
            throw error;
        }
    }

    /**
     * Wait for available Supabase connection
     */
    async waitForSupabaseConnection(pool, startTime) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pool.stats.timeouts++;
                reject(new Error('Connection pool timeout'));
            }, pool.config.acquireTimeoutMillis);

            const checkConnection = () => {
                if (pool.available.length > 0) {
                    clearTimeout(timeout);
                    const client = pool.available.pop();
                    pool.inUse.add(client);
                    pool.stats.acquired++;
                    resolve(client);
                } else {
                    setTimeout(checkConnection, 50);
                }
            };

            checkConnection();
        });
    }

    /**
     * Release Supabase connection back to pool
     * @param {object} client - Supabase client to release
     */
    releaseSupabaseConnection(client) {
        const pool = this.pools.get('supabase');
        if (!pool || !client) return;

        try {
            if (pool.inUse.has(client)) {
                pool.inUse.delete(client);
                pool.available.push(client);
                pool.stats.released++;
            }
        } catch (error) {
            console.error('Error releasing Supabase connection:', error.message);
            pool.stats.errors++;
        }
    }

    /**
     * Execute database operation with connection pooling
     * @param {function} operation - Database operation function
     * @returns {Promise} Operation result
     */
    async executeWithSupabase(operation) {
        let client = null;
        
        try {
            client = await this.acquireSupabaseConnection();
            
            // Use circuit breaker for database operations
            const result = await circuitBreakerManager.execute(
                'supabase',
                operation,
                { timeout: 10000, failureThreshold: 5 },
                client
            );
            
            return result;
            
        } finally {
            if (client) {
                this.releaseSupabaseConnection(client);
            }
        }
    }

    /**
     * Execute API call with pooling and circuit breaker
     * @param {string} apiName - API name (youtube, instagram, etc.)
     * @param {function} apiCall - API call function
     * @param {object} options - Call options
     */
    async executeApiCall(apiName, apiCall, options = {}) {
        const pool = this.pools.get(apiName);
        const httpPool = this.pools.get('http');
        
        if (!pool || !httpPool) {
            return await apiCall(httpPool.client);
        }

        // Check if API pool has capacity
        if (pool.active.size >= pool.maxConcurrent) {
            return new Promise((resolve, reject) => {
                pool.queue.push({ apiCall, resolve, reject, options });
                pool.stats.queued++;
            });
        }

        return this.processApiCall(pool, httpPool.client, apiCall, options);
    }

    /**
     * Process API call with tracking
     */
    async processApiCall(pool, httpClient, apiCall, options) {
        const callId = `${pool.name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const startTime = Date.now();
        
        pool.active.add(callId);
        pool.stats.requests++;
        
        try {
            // Use circuit breaker
            const result = await circuitBreakerManager.execute(
                pool.name,
                apiCall,
                { timeout: pool.timeout, failureThreshold: 3 },
                httpClient
            );
            
            const duration = Date.now() - startTime;
            pool.stats.completed++;
            
            // Update average response time
            const alpha = 0.1;
            pool.stats.avgResponseTime = pool.stats.avgResponseTime * (1 - alpha) + duration * alpha;
            
            return result;
            
        } catch (error) {
            pool.stats.failed++;
            throw error;
            
        } finally {
            pool.active.delete(callId);
            
            // Process next in queue
            if (pool.queue.length > 0 && pool.active.size < pool.maxConcurrent) {
                const next = pool.queue.shift();
                this.processApiCall(pool, httpClient, next.apiCall, next.options)
                    .then(next.resolve)
                    .catch(next.reject);
            }
        }
    }

    /**
     * Get HTTP client for external requests
     */
    getHttpClient() {
        const httpPool = this.pools.get('http');
        return httpPool ? httpPool.client : axios;
    }

    /**
     * Get connection pool statistics
     */
    getStats() {
        const poolStats = {};
        
        for (const [name, pool] of this.pools.entries()) {
            if (name === 'supabase') {
                poolStats[name] = {
                    connections: {
                        total: pool.connections.length,
                        available: pool.available.length,
                        inUse: pool.inUse.size
                    },
                    stats: { ...pool.stats }
                };
            } else if (name === 'http') {
                poolStats[name] = {
                    agent: 'HTTP Agent configured',
                    client: 'Axios client with interceptors'
                };
            } else {
                poolStats[name] = {
                    active: pool.active.size,
                    queued: pool.queue.length,
                    maxConcurrent: pool.maxConcurrent,
                    stats: { ...pool.stats }
                };
            }
        }
        
        return {
            pools: poolStats,
            global: { ...this.stats }
        };
    }

    /**
     * Health check for all pools
     */
    async healthCheck() {
        const health = {
            supabase: false,
            http: false,
            apis: {},
            overall: false
        };
        
        try {
            // Test Supabase connection
            const supabaseResult = await this.executeWithSupabase(async (client) => {
                const { data, error } = await client.from('users').select('count').limit(1);
                return !error;
            });
            health.supabase = supabaseResult;
            
        } catch (error) {
            console.warn('Supabase health check failed:', error.message);
        }
        
        try {
            // Test HTTP client
            const httpClient = this.getHttpClient();
            const response = await httpClient.get('https://httpbin.org/status/200', { timeout: 5000 });
            health.http = response.status === 200;
            
        } catch (error) {
            console.warn('HTTP health check failed:', error.message);
        }
        
        // Test API pools
        for (const apiName of Object.keys(this.config.api)) {
            const pool = this.pools.get(apiName);
            health.apis[apiName] = pool && pool.active.size < pool.maxConcurrent;
        }
        
        health.overall = health.supabase && health.http && 
                        Object.values(health.apis).every(h => h);
        
        return health;
    }

    /**
     * Cleanup idle connections
     */
    async cleanup() {
        let cleaned = 0;
        
        const supabasePool = this.pools.get('supabase');
        if (supabasePool) {
            // Remove excess idle connections
            const excessConnections = supabasePool.available.length - supabasePool.config.minConnections;
            if (excessConnections > 0) {
                for (let i = 0; i < excessConnections; i++) {
                    const client = supabasePool.available.pop();
                    const index = supabasePool.connections.indexOf(client);
                    if (index > -1) {
                        supabasePool.connections.splice(index, 1);
                        supabasePool.stats.destroyed++;
                        cleaned++;
                    }
                }
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Connection pool cleaned ${cleaned} idle connections`);
        }
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        // Cleanup interval
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // Every 5 minutes
        
        // Stats logging
        setInterval(() => {
            const stats = this.getStats();
            console.log(`📊 Connection Pools: ${JSON.stringify(stats, null, 2)}`);
        }, 10 * 60 * 1000); // Every 10 minutes
    }

    /**
     * Hash URL for caching
     */
    hashUrl(url) {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Destroy all pools
     */
    async destroy() {
        console.log('🗑️ Destroying connection pools...');
        
        // Clear all pools
        for (const [name, pool] of this.pools.entries()) {
            if (name === 'supabase') {
                pool.connections.length = 0;
                pool.available.length = 0;
                pool.inUse.clear();
            } else if (name !== 'http') {
                pool.active.clear();
                pool.queue.length = 0;
            }
        }
        
        this.pools.clear();
        console.log('✅ All connection pools destroyed');
    }
}

// Create singleton instance
const connectionPool = new ConnectionPool();

module.exports = {
    connectionPool,
    
    // Convenience functions
    executeWithSupabase: (operation) => connectionPool.executeWithSupabase(operation),
    executeApiCall: (apiName, apiCall, options) => connectionPool.executeApiCall(apiName, apiCall, options),
    getHttpClient: () => connectionPool.getHttpClient(),
    getStats: () => connectionPool.getStats(),
    healthCheck: () => connectionPool.healthCheck()
};