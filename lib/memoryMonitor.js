/**
 * Advanced Memory Monitoring System for wabot
 * Provides real-time memory tracking, leak detection, and auto-cleanup
 */

const EventEmitter = require('events');
const v8 = require('v8');
const { cache } = require('./cache');

class MemoryMonitor extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            // Memory thresholds in MB
            thresholds: {
                warning: 512,    // 512MB warning
                critical: 800,   // 800MB critical
                maximum: 1024    // 1GB maximum before restart
            },
            
            // Monitoring intervals
            intervals: {
                fast: 15000,     // 15 seconds for active monitoring
                normal: 60000,   // 1 minute for regular checks
                deep: 300000     // 5 minutes for deep analysis
            },
            
            // Cleanup configuration
            cleanup: {
                autoCleanup: true,
                aggressiveMode: false,
                cacheCleanupThreshold: 600, // Clean cache at 600MB
                gcForceThreshold: 700,      // Force GC at 700MB
                heapSnapshotThreshold: 900  // Take heap snapshot at 900MB
            },
            
            // History tracking
            history: {
                maxEntries: 1000,
                retentionHours: 24
            }
        };
        
        this.state = {
            monitoring: false,
            lastCleanup: Date.now(),
            alertLevel: 'normal',
            memoryTrend: 'stable',
            leakDetected: false
        };
        
        this.data = {
            history: [],
            baseline: null,
            peaks: [],
            alerts: [],
            cleanups: []
        };
        
        // NOUVEAU: Gestion intelligente des companions
        this.companionTracking = {
            activeCompanions: 0,
            memoryPerCompanion: 75 * 1024 * 1024, // 75MB estimation
            maxCompanionsCalculated: 0,
            lastCompanionCheck: Date.now()
        };
        
        this.intervals = {
            fast: null,
            normal: null,
            deep: null
        };
        
        this.startMonitoring();
    }

    /**
     * Start memory monitoring
     */
    startMonitoring() {
        if (this.state.monitoring) return;
        
        this.state.monitoring = true;
        
        // Fast monitoring for critical situations
        this.intervals.fast = setInterval(() => {
            this.fastCheck();
        }, this.config.intervals.fast);
        
        // Normal monitoring for regular tracking
        this.intervals.normal = setInterval(() => {
            this.normalCheck();
        }, this.config.intervals.normal);
        
        // Deep analysis for trend detection
        this.intervals.deep = setInterval(() => {
            this.deepAnalysis();
        }, this.config.intervals.deep);
        
        // Take initial baseline
        setTimeout(() => {
            this.data.baseline = this.getMemoryUsage();
        }, 5000);
    }

    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        this.state.monitoring = false;
        
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        
        console.log('⏹️ Memory monitoring stopped');
    }

    /**
     * Fast check for critical memory situations
     */
    fastCheck() {
        const usage = this.getMemoryUsage();
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        
        // Emergency cleanup at critical levels
        if (heapUsedMB > this.config.thresholds.critical) {
            this.emergencyCleanup();
        }
        
        // Force restart at maximum threshold
        if (heapUsedMB > this.config.thresholds.maximum) {
            this.handleMemoryOverflow();
        }
    }

    /**
     * Normal memory check with tracking
     */
    normalCheck() {
        const usage = this.getMemoryUsage();
        const timestamp = Date.now();
        
        // Record history
        this.recordMemoryData(usage, timestamp);
        
        // Check thresholds
        this.checkThresholds(usage);
        
        // Detect trends
        this.detectTrends();
        
        // Auto cleanup if enabled
        if (this.config.cleanup.autoCleanup) {
            this.autoCleanup(usage);
        }
    }

    /**
     * Deep analysis for memory patterns
     */
    deepAnalysis() {
        try {
            const usage = this.getMemoryUsage();
            const heapStats = v8.getHeapStatistics();
            
            // Analyze memory trends
            this.analyzeTrends();
            
            // Detect potential memory leaks
            this.detectMemoryLeaks();
            
            // Update heap statistics
            this.updateHeapStats(heapStats);
            
            // Generate insights
            this.generateInsights();
            
        } catch (error) {
            console.error('Error in deep memory analysis:', error.message);
        }
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        
        return {
            ...usage,
            heapTotal: heapStats.total_heap_size,
            heapUsed: heapStats.used_heap_size,
            heapAvailable: heapStats.total_available_size,
            heapLimit: heapStats.heap_size_limit,
            timestamp: Date.now()
        };
    }

    /**
     * Record memory data in history
     */
    recordMemoryData(usage, timestamp) {
        const entry = {
            timestamp,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss,
            alertLevel: this.state.alertLevel
        };
        
        this.data.history.push(entry);
        
        // Limit history size
        if (this.data.history.length > this.config.history.maxEntries) {
            this.data.history = this.data.history.slice(-this.config.history.maxEntries);
        }
        
        // Remove old entries
        const cutoff = timestamp - (this.config.history.retentionHours * 60 * 60 * 1000);
        this.data.history = this.data.history.filter(entry => entry.timestamp > cutoff);
    }

    /**
     * Check memory thresholds and generate alerts
     */
    checkThresholds(usage) {
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        const oldAlertLevel = this.state.alertLevel;
        
        if (heapUsedMB > this.config.thresholds.critical) {
            this.state.alertLevel = 'critical';
        } else if (heapUsedMB > this.config.thresholds.warning) {
            this.state.alertLevel = 'warning';
        } else {
            this.state.alertLevel = 'normal';
        }
        
        // Generate alert if level changed
        if (oldAlertLevel !== this.state.alertLevel) {
            this.generateAlert(oldAlertLevel, this.state.alertLevel, usage);
        }
        
        // Record peaks
        if (heapUsedMB > (this.data.baseline?.heapUsed || 0) / (1024 * 1024) * 1.5) {
            this.recordPeak(usage);
        }
    }

    /**
     * Detect memory trends
     */
    detectTrends() {
        if (this.data.history.length < 10) return;
        
        const recent = this.data.history.slice(-10);
        const slope = this.calculateSlope(recent.map(entry => entry.heapUsed));
        
        const oldTrend = this.state.memoryTrend;
        
        if (slope > 1024 * 1024) { // Growing by 1MB per sample
            this.state.memoryTrend = 'increasing';
        } else if (slope < -1024 * 1024) { // Decreasing by 1MB per sample
            this.state.memoryTrend = 'decreasing';
        } else {
            this.state.memoryTrend = 'stable';
        }
        
        // Emit trend change
        if (oldTrend !== this.state.memoryTrend) {
            this.emit('trendChange', {
                from: oldTrend,
                to: this.state.memoryTrend,
                slope
            });
        }
    }

    /**
     * Calculate slope for trend analysis
     */
    calculateSlope(values) {
        const n = values.length;
        if (n < 2) return 0;
        
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((a, b) => a + b, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumX2 = values.reduce((sum, _, x) => sum + x * x, 0);
        
        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    /**
     * Analyze long-term trends
     */
    analyzeTrends() {
        if (this.data.history.length < 50) return;
        
        const hourAgo = Date.now() - (60 * 60 * 1000);
        const recentData = this.data.history.filter(entry => entry.timestamp > hourAgo);
        
        if (recentData.length < 10) return;
        
        const memoryValues = recentData.map(entry => entry.heapUsed);
        const trend = this.calculateSlope(memoryValues);
        
        // Check for concerning trends
        if (trend > 5 * 1024 * 1024) { // 5MB/hour growth
            this.emit('concerningTrend', {
                trend: 'rapid_growth',
                rate: trend / (1024 * 1024),
                duration: recentData.length
            });
        }
    }

    /**
     * Detect potential memory leaks
     */
    detectMemoryLeaks() {
        if (this.data.history.length < 100) return;
        
        const recent = this.data.history.slice(-100);
        const baseline = this.data.baseline?.heapUsed || recent[0].heapUsed;
        
        // Check for sustained growth
        const sustainedGrowth = recent.every(entry => entry.heapUsed > baseline * 1.2);
        const currentUsage = recent[recent.length - 1].heapUsed;
        const growthRatio = currentUsage / baseline;
        
        const wasLeakDetected = this.state.leakDetected;
        this.state.leakDetected = sustainedGrowth && growthRatio > 2; // 2x baseline
        
        if (!wasLeakDetected && this.state.leakDetected) {
            this.emit('memoryLeakDetected', {
                baseline: baseline / (1024 * 1024),
                current: currentUsage / (1024 * 1024),
                growthRatio,
                duration: recent.length
            });
            
            console.warn(`🚨 Potential memory leak detected! Growth: ${growthRatio.toFixed(2)}x baseline`);
        }
    }

    /**
     * Update heap statistics
     */
    updateHeapStats(heapStats) {
        this.heapStats = {
            ...heapStats,
            timestamp: Date.now(),
            fragmentation: (heapStats.total_heap_size - heapStats.used_heap_size) / heapStats.total_heap_size,
            utilization: heapStats.used_heap_size / heapStats.total_heap_size
        };
    }

    /**
     * Generate memory insights
     */
    generateInsights() {
        const insights = {
            timestamp: Date.now(),
            summary: this.getMemorySummary(),
            recommendations: this.getRecommendations(),
            health: this.calculateMemoryHealth()
        };
        
        this.emit('insights', insights);
    }

    /**
     * Generate alert for threshold changes
     */
    generateAlert(oldLevel, newLevel, usage) {
        const alert = {
            timestamp: Date.now(),
            from: oldLevel,
            to: newLevel,
            usage: {
                heapUsed: usage.heapUsed / (1024 * 1024),
                heapTotal: usage.heapTotal / (1024 * 1024),
                rss: usage.rss / (1024 * 1024)
            }
        };
        
        this.data.alerts.push(alert);
        this.emit('alert', alert);
        
        const emoji = newLevel === 'critical' ? '🚨' : newLevel === 'warning' ? '⚠️' : '✅';
        console.log(`${emoji} Memory alert: ${oldLevel} → ${newLevel} (${this.formatBytes(usage.heapUsed)} used)`);
    }

    /**
     * Record memory peak
     */
    recordPeak(usage) {
        const peak = {
            timestamp: Date.now(),
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            rss: usage.rss
        };
        
        this.data.peaks.push(peak);
        
        // Keep only recent peaks
        if (this.data.peaks.length > 50) {
            this.data.peaks = this.data.peaks.slice(-25);
        }
    }

    /**
     * Auto cleanup based on thresholds
     */
    autoCleanup(usage) {
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        const timeSinceLastCleanup = Date.now() - this.state.lastCleanup;
        
        // Cleanup cache if threshold reached
        if (heapUsedMB > this.config.cleanup.cacheCleanupThreshold && 
            timeSinceLastCleanup > 30000) { // At least 30 seconds between cleanups
            
            this.cleanupCache();
        }
        
        // Force garbage collection if threshold reached
        if (heapUsedMB > this.config.cleanup.gcForceThreshold && 
            timeSinceLastCleanup > 60000) { // At least 1 minute between GC
            
            this.forceGarbageCollection();
        }
        
        // Take heap snapshot for analysis
        if (heapUsedMB > this.config.cleanup.heapSnapshotThreshold && 
            this.state.alertLevel === 'critical') {
            
            this.takeHeapSnapshot();
        }
    }

    /**
     * Emergency cleanup for critical memory situations
     */
    emergencyCleanup() {
        console.log('🚨 Emergency memory cleanup initiated');
        
        const startUsage = process.memoryUsage().heapUsed;
        
        try {
            // Clear all caches aggressively
            cache.clear();
            
            // Force multiple GC cycles
            for (let i = 0; i < 3; i++) {
                if (global.gc) {
                    global.gc();
                }
            }
            
            // Clear intervals temporarily to reduce memory pressure
            const intervals = global.setInterval;
            
            const endUsage = process.memoryUsage().heapUsed;
            const freed = startUsage - endUsage;
            
            this.recordCleanup('emergency', freed);
            
            console.log(`✅ Emergency cleanup freed ${this.formatBytes(freed)}`);
            
        } catch (error) {
            console.error('Error during emergency cleanup:', error.message);
        }
    }

    /**
     * Handle memory overflow (restart recommendation)
     */
    handleMemoryOverflow() {
        console.error('🚨 CRITICAL: Memory overflow detected! Restart recommended.');
        
        this.emit('overflow', {
            timestamp: Date.now(),
            usage: this.getMemoryUsage(),
            recommendation: 'immediate_restart'
        });
        
        // Try one last cleanup before potential restart
        this.emergencyCleanup();
    }

    /**
     * Cleanup cache
     */
    cleanupCache() {
        try {
            const beforeUsage = process.memoryUsage().heapUsed;
            cache.clear();
            const afterUsage = process.memoryUsage().heapUsed;
            const freed = beforeUsage - afterUsage;
            
            this.recordCleanup('cache', freed);
            this.state.lastCleanup = Date.now();
            
            console.log(`🧹 Cache cleanup freed ${this.formatBytes(freed)}`);
            
        } catch (error) {
            console.error('Error cleaning cache:', error.message);
        }
    }

    /**
     * Force garbage collection
     */
    forceGarbageCollection() {
        if (!global.gc) {
            console.warn('⚠️ Garbage collection not available (start with --expose-gc)');
            return;
        }
        
        try {
            const beforeUsage = process.memoryUsage().heapUsed;
            global.gc();
            const afterUsage = process.memoryUsage().heapUsed;
            const freed = beforeUsage - afterUsage;
            
            this.recordCleanup('gc', freed);
            this.state.lastCleanup = Date.now();
            
            console.log(`♻️ GC freed ${this.formatBytes(freed)}`);
            
        } catch (error) {
            console.error('Error forcing GC:', error.message);
        }
    }

    /**
     * Take heap snapshot for analysis
     */
    takeHeapSnapshot() {
        try {
            const heapSnapshot = v8.writeHeapSnapshot();
            console.log(`📸 Heap snapshot saved: ${heapSnapshot}`);
            
            this.emit('heapSnapshot', {
                timestamp: Date.now(),
                file: heapSnapshot,
                usage: this.getMemoryUsage()
            });
            
        } catch (error) {
            console.error('Error taking heap snapshot:', error.message);
        }
    }

    /**
     * Record cleanup operation
     */
    recordCleanup(type, bytesFreed) {
        const cleanup = {
            timestamp: Date.now(),
            type,
            bytesFreed,
            heapUsedAfter: process.memoryUsage().heapUsed
        };
        
        this.data.cleanups.push(cleanup);
        
        // Keep only recent cleanups
        if (this.data.cleanups.length > 100) {
            this.data.cleanups = this.data.cleanups.slice(-50);
        }
        
        this.emit('cleanup', cleanup);
    }

    /**
     * Get memory summary
     */
    getMemorySummary() {
        const current = this.getMemoryUsage();
        const baseline = this.data.baseline;
        
        return {
            current: {
                heapUsed: current.heapUsed / (1024 * 1024),
                heapTotal: current.heapTotal / (1024 * 1024),
                rss: current.rss / (1024 * 1024),
                external: current.external / (1024 * 1024)
            },
            baseline: baseline ? {
                heapUsed: baseline.heapUsed / (1024 * 1024)
            } : null,
            growth: baseline ? {
                absolute: (current.heapUsed - baseline.heapUsed) / (1024 * 1024),
                percentage: ((current.heapUsed / baseline.heapUsed) - 1) * 100
            } : null,
            alertLevel: this.state.alertLevel,
            trend: this.state.memoryTrend,
            leakDetected: this.state.leakDetected
        };
    }

    /**
     * Get recommendations based on current state
     */
    getRecommendations() {
        const recommendations = [];
        const summary = this.getMemorySummary();
        
        if (summary.alertLevel === 'critical') {
            recommendations.push('Immediate action required: Clear caches and reduce concurrent operations');
        }
        
        if (summary.trend === 'increasing') {
            recommendations.push('Monitor for memory leaks: Usage is steadily increasing');
        }
        
        if (this.state.leakDetected) {
            recommendations.push('Investigate memory leak: Usage has grown significantly from baseline');
        }
        
        if (summary.growth?.percentage > 50) {
            recommendations.push('Consider restarting: Memory usage has grown by more than 50%');
        }
        
        return recommendations;
    }

    /**
     * Calculate memory health score (0-100)
     */
    calculateMemoryHealth() {
        const current = this.getMemoryUsage();
        const heapUsedMB = current.heapUsed / (1024 * 1024);
        
        let health = 100;
        
        // Reduce health based on memory usage
        if (heapUsedMB > this.config.thresholds.critical) {
            health -= 50;
        } else if (heapUsedMB > this.config.thresholds.warning) {
            health -= 25;
        }
        
        // Reduce health for increasing trend
        if (this.state.memoryTrend === 'increasing') {
            health -= 15;
        }
        
        // Reduce health for detected leak
        if (this.state.leakDetected) {
            health -= 30;
        }
        
        return Math.max(0, Math.round(health));
    }

    /**
     * Format bytes for human readability
     */
    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            monitoring: this.state.monitoring,
            alertLevel: this.state.alertLevel,
            trend: this.state.memoryTrend,
            leakDetected: this.state.leakDetected,
            summary: this.getMemorySummary(),
            recommendations: this.getRecommendations(),
            health: this.calculateMemoryHealth(),
            history: {
                entries: this.data.history.length,
                peaks: this.data.peaks.length,
                alerts: this.data.alerts.length,
                cleanups: this.data.cleanups.length
            }
        };
    }

    /**
     * NOUVEAU: Calcul dynamique du nombre max de companions basé sur la RAM disponible
     */
    calculateMaxCompanions() {
        const usage = this.getMemoryUsage();
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        const totalMemoryMB = usage.heapTotal / (1024 * 1024);
        
        // Détecter le plan Replit approximativement
        let availableMemoryMB;
        if (totalMemoryMB < 1500) {
            availableMemoryMB = 1800;  // Plan Starter : ~2GB
        } else if (totalMemoryMB < 40000) {
            availableMemoryMB = 45000; // Plan Core : ~50GB
        } else {
            availableMemoryMB = Math.min(totalMemoryMB * 0.9, 200000); // Teams/Enterprise
        }
        
        // Calculer nombre max de companions (75MB par companion)
        const reservedMemoryMB = 300;
        const freeMemoryMB = availableMemoryMB - heapUsedMB - reservedMemoryMB;
        const companionMemoryMB = 75; // 75MB par companion
        
        this.companionTracking.maxCompanionsCalculated = Math.max(0, Math.floor(freeMemoryMB / companionMemoryMB));
        
        console.log(`🧠 [RAM-CALC] Plan: ${availableMemoryMB}MB, utilisée: ${Math.round(heapUsedMB)}MB, libre: ${Math.round(freeMemoryMB)}MB → Max companions: ${this.companionTracking.maxCompanionsCalculated}`);
        
        return this.companionTracking.maxCompanionsCalculated;
    }

    /**
     * NOUVEAU: Mettre à jour le nombre de companions actifs
     */
    updateCompanionCount(count) {
        this.companionTracking.activeCompanions = count;
        this.companionTracking.lastCompanionCheck = Date.now();
        
        // Recalculer le max si nécessaire
        if (Date.now() - this.companionTracking.lastCompanionCheck > 300000) { // 5 minutes
            this.calculateMaxCompanions();
        }
    }

    /**
     * NOUVEAU: Obtenir les stats de companions
     */
    getCompanionStats() {
        // S'assurer que les calculs sont à jour
        if (this.companionTracking.maxCompanionsCalculated === 0) {
            this.calculateMaxCompanions();
        }
        
        return {
            active: this.companionTracking.activeCompanions,
            maxCalculated: this.companionTracking.maxCompanionsCalculated,
            memoryPerCompanion: 75, // MB
            canAddMore: this.companionTracking.activeCompanions < this.companionTracking.maxCompanionsCalculated,
            ramInfo: this.getMemorySummary()
        };
    }

    /**
     * Destroy the monitor
     */
    destroy() {
        this.stopMonitoring();
        this.data.history = [];
        this.data.peaks = [];
        this.data.alerts = [];
        this.data.cleanups = [];
        console.log('🗑️ Memory monitor destroyed');
    }
}

// Create singleton instance
const memoryMonitor = new MemoryMonitor();

module.exports = {
    memoryMonitor,
    getStatus: () => memoryMonitor.getStatus(),
    getMemorySummary: () => memoryMonitor.getMemorySummary(),
    forceCleanup: () => memoryMonitor.emergencyCleanup(),
    takeSnapshot: () => memoryMonitor.takeHeapSnapshot()
};