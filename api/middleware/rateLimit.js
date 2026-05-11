'use strict';

/**
 * Per-API-key rate limiter (sliding window, in-memory)
 */

// Store: keyId -> [timestamp, ...]
const windows = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [id, times] of windows.entries()) {
        const fresh = times.filter(t => t > cutoff);
        if (fresh.length === 0) windows.delete(id);
        else windows.set(id, fresh);
    }
}, 5 * 60 * 1000);

/**
 * Rate limit middleware
 * Uses req.apiKey.rateLimit (requests per minute)
 */
function rateLimit(req, res, next) {
    const key = req.apiKey;
    if (!key) return next(); // No key = handled by auth middleware

    const limit = key.rateLimit || 60;
    const windowMs = 60_000; // 1 minute
    const now = Date.now();
    const cutoff = now - windowMs;

    let times = windows.get(key.id) || [];
    times = times.filter(t => t > cutoff);
    times.push(now);
    windows.set(key.id, times);

    const remaining = Math.max(0, limit - times.length);
    const resetAt = Math.ceil((times[0] + windowMs) / 1000);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetAt);

    if (times.length > limit) {
        return res.status(429).json({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit of ${limit} requests/minute exceeded`,
            retryAfter: resetAt,
        });
    }

    next();
}

module.exports = { rateLimit };
