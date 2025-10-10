/**
 * Performance Metrics and Health Monitoring System for wabot
 * Tracks system performance, response times, and health indicators
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const os = require('os');

class PerformanceMetrics extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            // Performance thresholds
            thresholds: {
                responseTime: {
                    fast: 1000,      // < 1s = fast
                    normal: 3000,    // < 3s = normal
                    slow: 10000      // > 10s = slow
                },
                cpu: {
                    warning: 70,     // 70% CPU warning
                    critical: 90     // 90% CPU critical
                },
                throughput: {
                    minimum: 10,     // Min 10 commands/minute
                    target: 50       // Target 50 commands/minute
                }
            },
            
            // Monitoring intervals
            intervals: {
                metrics: 30000,      // Collect metrics every 30s
                health: 60000,       // Health check every minute
                report: 300000       // Generate report every 5 minutes
            },
            
            // History retention
            history: {
                maxEntries: 2000,    // Keep 2000 entries
                retentionHours: 24   // 24 hours of data
            }
        };
        
        this.metrics = {
            // Command performance
            commands: {
                total: 0,
                successful: 0,
                failed: 0,
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                responseTimes: []
            },
            
            // System performance
            system: {
                cpuUsage: [],
                memoryUsage: [],
                loadAverage: [],
                uptime: process.uptime()
            },
            
            // API performance
            apis: new Map(),
            
            // Queue performance
            queue: {
                processed: 0,
                queued: 0,
                avgWaitTime: 0,
                maxWaitTime: 0
            },
            
            // Error tracking
            errors: {
                total: 0,
                byCategory: new Map(),
                recent: []
            }
        };
        
        this.data = {
            history: [],
            snapshots: [],
            reports: []
        };
        
        this.intervals = {
            metrics: null,
            health: null,
            report: null
        };
        
        // Ne pas démarrer automatiquement - attendre l'appel d'initialize()
        this.initialized = false;
    }

    /**
     * Initialize performance monitoring system
     */
    initialize() {
        if (this.initialized) {
            console.log('⚠️ Performance Metrics already initialized');
            return;
        }
        
        this.startMonitoring();
        this.initialized = true;
        
        console.log('📈 Performance Metrics initialized');
    }

    /**
     * Start performance monitoring
     */
    startMonitoring() {
        // Collect system metrics
        this.intervals.metrics = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.intervals.metrics);
        
        // Health checks
        this.intervals.health = setInterval(() => {
            this.performHealthCheck();
        }, this.config.intervals.health);
        
        // Generate reports
        this.intervals.report = setInterval(() => {
            this.generateReport();
        }, this.config.intervals.report);
        
        console.log('✅ Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        console.log('⏹️ Performance monitoring stopped');
    }

    /**
     * Track command execution
     * @param {string} command - Command name
     * @param {number} startTime - Start timestamp
     * @param {number} endTime - End timestamp
     * @param {boolean} success - Whether command succeeded
     * @param {object} metadata - Additional metadata
     */
    trackCommand(command, startTime, endTime, success, metadata = {}) {
        const responseTime = endTime - startTime;
        
        // Update command metrics
        this.metrics.commands.total++;
        if (success) {
            this.metrics.commands.successful++;
        } else {
            this.metrics.commands.failed++;
        }
        
        // Update response time stats
        this.updateResponseTimeStats(responseTime);
        
        // Record command execution
        const execution = {
            timestamp: endTime,
            command,
            responseTime,
            success,
            metadata
        };
        
        this.recordExecution(execution);
        
        // Emit performance event
        this.emit('command', {
            command,
            responseTime,
            success,
            performance: this.categorizePerformance(responseTime)
        });
        
        return execution;
    }

    /**
     * Update response time statistics
     */
    updateResponseTimeStats(responseTime) {
        // Update min/max
        this.metrics.commands.minResponseTime = Math.min(this.metrics.commands.minResponseTime, responseTime);
        this.metrics.commands.maxResponseTime = Math.max(this.metrics.commands.maxResponseTime, responseTime);
        
        // Update average (rolling)
        const alpha = 0.1;
        this.metrics.commands.avgResponseTime = 
            this.metrics.commands.avgResponseTime * (1 - alpha) + responseTime * alpha;
        
        // Keep recent response times for analysis
        this.metrics.commands.responseTimes.push(responseTime);
        if (this.metrics.commands.responseTimes.length > 1000) {
            this.metrics.commands.responseTimes = this.metrics.commands.responseTimes.slice(-500);
        }
    }

    /**
     * Categorize performance level
     */
    categorizePerformance(responseTime) {
        const thresholds = this.config.thresholds.responseTime;
        
        if (responseTime < thresholds.fast) return 'fast';
        if (responseTime < thresholds.normal) return 'normal';
        if (responseTime < thresholds.slow) return 'slow';
        return 'very_slow';
    }

    /**
     * Track API call performance
     * @param {string} apiName - API name
     * @param {number} responseTime - Response time in ms
     * @param {boolean} success - Whether call succeeded
     * @param {object} metadata - Additional metadata
     */
    trackApiCall(apiName, responseTime, success, metadata = {}) {
        if (!this.metrics.apis.has(apiName)) {
            this.metrics.apis.set(apiName, {
                total: 0,
                successful: 0,
                failed: 0,
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                recentCalls: []
            });
        }
        
        const apiMetrics = this.metrics.apis.get(apiName);
        
        // Update counters
        apiMetrics.total++;
        if (success) {
            apiMetrics.successful++;
        } else {
            apiMetrics.failed++;
        }
        
        // Update response times
        apiMetrics.minResponseTime = Math.min(apiMetrics.minResponseTime, responseTime);
        apiMetrics.maxResponseTime = Math.max(apiMetrics.maxResponseTime, responseTime);
        
        const alpha = 0.1;
        apiMetrics.avgResponseTime = apiMetrics.avgResponseTime * (1 - alpha) + responseTime * alpha;
        
        // Record recent call
        apiMetrics.recentCalls.push({
            timestamp: Date.now(),
            responseTime,
            success,
            metadata
        });
        
        // Keep only recent calls
        if (apiMetrics.recentCalls.length > 100) {
            apiMetrics.recentCalls = apiMetrics.recentCalls.slice(-50);
        }
        
        this.emit('apiCall', {
            api: apiName,
            responseTime,
            success,
            performance: this.categorizePerformance(responseTime)
        });
    }

    /**
     * Track queue performance
     * @param {number} waitTime - Time spent in queue
     * @param {number} queueSize - Current queue size
     */
    trackQueue(waitTime, queueSize) {
        this.metrics.queue.processed++;
        this.metrics.queue.queued = queueSize;
        
        // Update wait time stats
        this.metrics.queue.maxWaitTime = Math.max(this.metrics.queue.maxWaitTime, waitTime);
        
        const alpha = 0.1;
        this.metrics.queue.avgWaitTime = this.metrics.queue.avgWaitTime * (1 - alpha) + waitTime * alpha;
        
        this.emit('queue', {
            waitTime,
            queueSize,
            processed: this.metrics.queue.processed
        });
    }

    /**
     * Track error occurrence
     * @param {string} category - Error category
     * @param {string} message - Error message
     * @param {object} context - Error context
     */
    trackError(category, message, context = {}) {
        this.metrics.errors.total++;
        
        // Update category count
        const categoryCount = this.metrics.errors.byCategory.get(category) || 0;
        this.metrics.errors.byCategory.set(category, categoryCount + 1);
        
        // Record recent error
        const error = {
            timestamp: Date.now(),
            category,
            message,
            context
        };
        
        this.metrics.errors.recent.push(error);
        
        // Keep only recent errors
        if (this.metrics.errors.recent.length > 100) {
            this.metrics.errors.recent = this.metrics.errors.recent.slice(-50);
        }
        
        this.emit('error', error);
    }

    /**
     * Record command execution in history
     */
    recordExecution(execution) {
        this.data.history.push(execution);
        
        // Limit history size
        if (this.data.history.length > this.config.history.maxEntries) {
            this.data.history = this.data.history.slice(-this.config.history.maxEntries);
        }
        
        // Remove old entries
        const cutoff = Date.now() - (this.config.history.retentionHours * 60 * 60 * 1000);
        this.data.history = this.data.history.filter(entry => entry.timestamp > cutoff);
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        try {
            const timestamp = Date.now();
            
            // CPU usage
            const cpuUsage = process.cpuUsage();
            const cpuPercent = this.calculateCpuPercent(cpuUsage);
            
            // Memory usage
            const memUsage = process.memoryUsage();
            
            // Load average
            const loadAvg = os.loadavg();
            
            // Record metrics
            this.metrics.system.cpuUsage.push({ timestamp, usage: cpuPercent });
            this.metrics.system.memoryUsage.push({ timestamp, ...memUsage });
            this.metrics.system.loadAverage.push({ timestamp, load: loadAvg });
            
            // Limit arrays
            const maxEntries = 720; // 6 hours of 30s intervals
            this.metrics.system.cpuUsage = this.metrics.system.cpuUsage.slice(-maxEntries);
            this.metrics.system.memoryUsage = this.metrics.system.memoryUsage.slice(-maxEntries);
            this.metrics.system.loadAverage = this.metrics.system.loadAverage.slice(-maxEntries);
            
            // Check thresholds
            this.checkSystemThresholds(cpuPercent, memUsage);
            
        } catch (error) {
            console.error('Error collecting system metrics:', error.message);
        }
    }

    /**
     * Calculate CPU percentage
     */
    calculateCpuPercent(cpuUsage) {
        if (!this.lastCpuUsage) {
            this.lastCpuUsage = cpuUsage;
            return 0;
        }
        
        const userDiff = cpuUsage.user - this.lastCpuUsage.user;
        const systemDiff = cpuUsage.system - this.lastCpuUsage.system;
        const totalDiff = userDiff + systemDiff;
        
        this.lastCpuUsage = cpuUsage;
        
        // Convert to percentage (rough approximation)
        return Math.min(100, (totalDiff / 1000000) / this.config.intervals.metrics * 100);
    }

    /**
     * Check system thresholds
     */
    checkSystemThresholds(cpuPercent, memUsage) {
        const thresholds = this.config.thresholds;
        
        // CPU threshold check
        if (cpuPercent > thresholds.cpu.critical) {
            this.emit('threshold', {
                type: 'cpu',
                level: 'critical',
                value: cpuPercent,
                threshold: thresholds.cpu.critical
            });
        } else if (cpuPercent > thresholds.cpu.warning) {
            this.emit('threshold', {
                type: 'cpu',
                level: 'warning',
                value: cpuPercent,
                threshold: thresholds.cpu.warning
            });
        }
        
        // Memory threshold check
        const memUsageMB = memUsage.heapUsed / (1024 * 1024);
        if (memUsageMB > 800) { // 800MB critical
            this.emit('threshold', {
                type: 'memory',
                level: 'critical',
                value: memUsageMB,
                threshold: 800
            });
        }
    }

    /**
     * Perform health check
     */
    performHealthCheck() {
        const health = this.calculateHealth();
        
        this.emit('healthCheck', health);
        
        // Log health status
        const status = health.overall >= 80 ? '✅' : health.overall >= 60 ? '⚠️' : '🚨';
        // Log de santé système supprimé pour réduire le spam;
    }

    /**
     * Calculate system health score
     */
    calculateHealth() {
        let performance = 100;
        let reliability = 100;
        
        // Performance score based on response times
        const avgResponseTime = this.metrics.commands.avgResponseTime;
        if (avgResponseTime > this.config.thresholds.responseTime.slow) {
            performance -= 40;
        } else if (avgResponseTime > this.config.thresholds.responseTime.normal) {
            performance -= 20;
        }
        
        // Reliability score based on success rate
        const successRate = this.metrics.commands.total > 0 ? 
            (this.metrics.commands.successful / this.metrics.commands.total) * 100 : 100;
        reliability = successRate;
        
        // System resource score
        const recentCpu = this.metrics.system.cpuUsage.slice(-10);
        const avgCpu = recentCpu.length > 0 ? 
            recentCpu.reduce((sum, entry) => sum + entry.usage, 0) / recentCpu.length : 0;
        
        let resourceScore = 100;
        if (avgCpu > this.config.thresholds.cpu.critical) {
            resourceScore -= 30;
        } else if (avgCpu > this.config.thresholds.cpu.warning) {
            resourceScore -= 15;
        }
        
        // Overall health
        const overall = Math.round((performance + reliability + resourceScore) / 3);
        
        return {
            overall,
            performance: Math.round(performance),
            reliability: Math.round(reliability),
            resources: Math.round(resourceScore),
            details: {
                avgResponseTime,
                successRate,
                avgCpu,
                commandsTotal: this.metrics.commands.total,
                errorsTotal: this.metrics.errors.total
            }
        };
    }

    /**
     * Generate performance report
     */
    generateReport() {
        const report = {
            timestamp: Date.now(),
            period: this.config.intervals.report,
            health: this.calculateHealth(),
            metrics: this.getMetricsSummary(),
            insights: this.generateInsights(),
            recommendations: this.generateRecommendations()
        };
        
        this.data.reports.push(report);
        
        // Keep only recent reports
        if (this.data.reports.length > 100) {
            this.data.reports = this.data.reports.slice(-50);
        }
        
        this.emit('report', report);
        
        return report;
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        const summary = {
            commands: {
                total: this.metrics.commands.total,
                successful: this.metrics.commands.successful,
                failed: this.metrics.commands.failed,
                successRate: this.metrics.commands.total > 0 ? 
                    (this.metrics.commands.successful / this.metrics.commands.total) * 100 : 0,
                avgResponseTime: Math.round(this.metrics.commands.avgResponseTime),
                minResponseTime: this.metrics.commands.minResponseTime === Infinity ? 0 : this.metrics.commands.minResponseTime,
                maxResponseTime: this.metrics.commands.maxResponseTime
            },
            apis: {},
            queue: { ...this.metrics.queue },
            errors: {
                total: this.metrics.errors.total,
                byCategory: Object.fromEntries(this.metrics.errors.byCategory)
            }
        };
        
        // API summary
        for (const [apiName, apiMetrics] of this.metrics.apis.entries()) {
            summary.apis[apiName] = {
                total: apiMetrics.total,
                successRate: apiMetrics.total > 0 ? (apiMetrics.successful / apiMetrics.total) * 100 : 0,
                avgResponseTime: Math.round(apiMetrics.avgResponseTime)
            };
        }
        
        return summary;
    }

    /**
     * Generate insights
     */
    generateInsights() {
        const insights = [];
        
        // Performance insights
        if (this.metrics.commands.avgResponseTime > this.config.thresholds.responseTime.normal) {
            insights.push({
                type: 'performance',
                level: 'warning',
                message: `Average response time is ${Math.round(this.metrics.commands.avgResponseTime)}ms (above normal threshold)`
            });
        }
        
        // Reliability insights
        const successRate = this.metrics.commands.total > 0 ? 
            (this.metrics.commands.successful / this.metrics.commands.total) * 100 : 100;
        
        if (successRate < 95) {
            insights.push({
                type: 'reliability',
                level: successRate < 85 ? 'critical' : 'warning',
                message: `Command success rate is ${successRate.toFixed(1)}%`
            });
        }
        
        // Throughput insights
        const recentCommands = this.data.history.filter(entry => 
            entry.timestamp > Date.now() - (5 * 60 * 1000) // Last 5 minutes
        ).length;
        
        if (recentCommands < this.config.thresholds.throughput.minimum) {
            insights.push({
                type: 'throughput',
                level: 'warning',
                message: `Low activity: only ${recentCommands} commands in last 5 minutes`
            });
        }
        
        return insights;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const health = this.calculateHealth();
        
        if (health.performance < 70) {
            recommendations.push('Optimize slow commands and consider caching frequently used data');
        }
        
        if (health.reliability < 90) {
            recommendations.push('Investigate error patterns and improve error handling');
        }
        
        if (health.resources < 80) {
            recommendations.push('Monitor system resources and consider scaling');
        }
        
        if (this.metrics.queue.avgWaitTime > 5000) {
            recommendations.push('Queue wait times are high - consider increasing worker capacity');
        }
        
        return recommendations;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            monitoring: this.intervals.metrics !== null,
            health: this.calculateHealth(),
            metrics: this.getMetricsSummary(),
            system: {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: this.metrics.system.cpuUsage.slice(-1)[0]?.usage || 0
            }
        };
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics.commands = {
            total: 0,
            successful: 0,
            failed: 0,
            avgResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            responseTimes: []
        };
        
        this.metrics.apis.clear();
        this.metrics.errors = {
            total: 0,
            byCategory: new Map(),
            recent: []
        };
        
        this.data.history = [];
        
        console.log('📊 Performance metrics reset');
    }

    /**
     * Destroy the metrics system
     */
    destroy() {
        this.stopMonitoring();
        this.reset();
        console.log('🗑️ Performance metrics destroyed');
    }
}

// Create singleton instance
const performanceMetrics = new PerformanceMetrics();

module.exports = {
    performanceMetrics,
    
    // Convenience functions
    trackCommand: (command, startTime, endTime, success, metadata) => 
        performanceMetrics.trackCommand(command, startTime, endTime, success, metadata),
    trackApiCall: (apiName, responseTime, success, metadata) => 
        performanceMetrics.trackApiCall(apiName, responseTime, success, metadata),
    trackQueue: (waitTime, queueSize) => 
        performanceMetrics.trackQueue(waitTime, queueSize),
    trackError: (category, message, context) => 
        performanceMetrics.trackError(category, message, context),
    getStatus: () => performanceMetrics.getStatus(),
    getHealth: () => performanceMetrics.calculateHealth(),
    generateReport: () => performanceMetrics.generateReport()
};