'use strict';

/**
 * Quota system — per-API-key daily message limits
 *
 * Plans:
 *   free     : 100  messages/day
 *   starter  : 1000 messages/day
 *   pro      : 10000 messages/day
 *   business : unlimited
 *   custom   : set manually
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUOTA_FILE = path.join(DATA_DIR, 'quotas.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PLAN_LIMITS = {
    free: 100,
    starter: 1000,
    pro: 10_000,
    business: Infinity,
};

function loadQuotas() {
    try {
        if (fs.existsSync(QUOTA_FILE)) return JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
    } catch { /* ignore */ }
    return {};
}

function saveQuotas(q) {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(q, null, 2), 'utf-8');
}

let cache = loadQuotas();

function todayKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

/**
 * Set or update plan for an API key
 */
function setPlan(apiKeyId, plan = 'free', customLimit = null) {
    const q = loadQuotas();
    if (!q[apiKeyId]) q[apiKeyId] = {};
    q[apiKeyId].plan = plan;
    if (customLimit !== null) q[apiKeyId].customLimit = customLimit;
    saveQuotas(q);
    cache = q;
}

/**
 * Get daily limit for key
 */
function getLimit(apiKeyId) {
    const entry = cache[apiKeyId];
    if (!entry) return PLAN_LIMITS.free;
    if (entry.customLimit !== undefined) return entry.customLimit;
    return PLAN_LIMITS[entry.plan] ?? PLAN_LIMITS.free;
}

/**
 * Get current usage for today
 */
function getUsage(apiKeyId) {
    const entry = cache[apiKeyId];
    if (!entry) return 0;
    const today = todayKey();
    if (entry.lastDate !== today) return 0;
    return entry.count || 0;
}

/**
 * Check and consume a quota slot.
 * Returns { allowed: bool, used: number, limit: number, remaining: number }
 */
function consume(apiKeyId, amount = 1) {
    const q = loadQuotas();
    const today = todayKey();

    if (!q[apiKeyId]) q[apiKeyId] = { plan: 'free', count: 0, lastDate: today };

    const entry = q[apiKeyId];

    // Reset daily counter
    if (entry.lastDate !== today) {
        entry.count = 0;
        entry.lastDate = today;
    }

    const limit = entry.customLimit ?? PLAN_LIMITS[entry.plan] ?? PLAN_LIMITS.free;

    if (limit !== Infinity && entry.count + amount > limit) {
        cache = q;
        return {
            allowed: false,
            used: entry.count,
            limit,
            remaining: Math.max(0, limit - entry.count),
            resetAt: `${today}T23:59:59Z`,
        };
    }

    entry.count += amount;
    entry.total = (entry.total || 0) + amount;
    saveQuotas(q);
    cache = q;

    return {
        allowed: true,
        used: entry.count,
        limit,
        remaining: limit === Infinity ? Infinity : Math.max(0, limit - entry.count),
        resetAt: `${today}T23:59:59Z`,
    };
}

/**
 * Get full quota info for a key
 */
function getQuotaInfo(apiKeyId) {
    const q = loadQuotas();
    const today = todayKey();
    const entry = q[apiKeyId] || { plan: 'free', count: 0, lastDate: today };
    const used = entry.lastDate === today ? (entry.count || 0) : 0;
    const limit = entry.customLimit ?? PLAN_LIMITS[entry.plan] ?? PLAN_LIMITS.free;

    return {
        apiKeyId,
        plan: entry.plan || 'free',
        dailyLimit: limit === Infinity ? 'unlimited' : limit,
        used,
        remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - used),
        totalAllTime: entry.total || 0,
        resetAt: `${today}T23:59:59Z`,
    };
}

/**
 * List all quotas
 */
function listQuotas() {
    const q = loadQuotas();
    return Object.entries(q).map(([id, _]) => getQuotaInfo(id));
}

/**
 * Middleware factory — checks quota before allowing message sends
 */
function quotaMiddleware(amount = 1) {
    return (req, res, next) => {
        if (!req.apiKey) return next();
        const result = consume(req.apiKey.id, amount);

        res.setHeader('X-Quota-Limit', result.limit === Infinity ? 'unlimited' : result.limit);
        res.setHeader('X-Quota-Used', result.used);
        res.setHeader('X-Quota-Remaining', result.remaining === Infinity ? 'unlimited' : result.remaining);
        res.setHeader('X-Quota-Reset', result.resetAt);

        if (!result.allowed) {
            return res.status(429).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: `Daily quota of ${result.limit} messages exceeded`,
                quota: result,
                upgradeUrl: 'https://wabot.example.com/pricing',
            });
        }
        next();
    };
}

module.exports = { setPlan, getLimit, getUsage, consume, getQuotaInfo, listQuotas, quotaMiddleware, PLAN_LIMITS };
