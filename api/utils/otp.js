'use strict';

/**
 * OTP (One-Time Password) utility
 * Generates, stores, and validates OTP codes for WhatsApp verification
 * Uses in-memory store with TTL — no external dependency needed
 */

const crypto = require('crypto');

// In-memory store: requestId -> { code, phone, expiresAt, attempts, verified }
const store = new Map();

// Cleanup expired entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store.entries()) {
        if (entry.expiresAt < now) store.delete(id);
    }
}, 2 * 60 * 1000);

const DEFAULTS = {
    length: 6,
    expirySeconds: 300,   // 5 minutes
    maxAttempts: 5,
};

/**
 * Generate a numeric OTP code
 */
function generateCode(length = DEFAULTS.length) {
    const max = Math.pow(10, length);
    const min = Math.pow(10, length - 1);
    return String(crypto.randomInt(min, max));
}

/**
 * Create a new OTP request
 * @param {string} phone - Normalized phone number (digits only)
 * @param {object} options
 * @param {number} options.length - Code length (default 6)
 * @param {number} options.expirySeconds - TTL in seconds (default 300)
 * @returns {{ requestId, code, expiresAt }}
 */
function createOtp(phone, options = {}) {
    const length = options.length || DEFAULTS.length;
    const expirySeconds = options.expirySeconds || DEFAULTS.expirySeconds;

    const requestId = crypto.randomUUID();
    const code = generateCode(length);
    const expiresAt = Date.now() + expirySeconds * 1000;

    store.set(requestId, {
        code,
        phone,
        expiresAt,
        attempts: 0,
        verified: false,
        createdAt: Date.now(),
    });

    return { requestId, code, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Verify an OTP code
 * @param {string} requestId
 * @param {string} code
 * @returns {{ valid: boolean, reason?: string, phone?: string }}
 */
function verifyOtp(requestId, code) {
    const entry = store.get(requestId);

    if (!entry) return { valid: false, reason: 'INVALID_REQUEST_ID' };
    if (entry.verified) return { valid: false, reason: 'ALREADY_VERIFIED' };
    if (Date.now() > entry.expiresAt) {
        store.delete(requestId);
        return { valid: false, reason: 'EXPIRED' };
    }
    if (entry.attempts >= DEFAULTS.maxAttempts) {
        store.delete(requestId);
        return { valid: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
    }

    entry.attempts++;

    if (entry.code !== String(code)) {
        return { valid: false, reason: 'WRONG_CODE', attemptsLeft: DEFAULTS.maxAttempts - entry.attempts };
    }

    // Mark verified
    entry.verified = true;
    entry.verifiedAt = Date.now();

    return {
        valid: true,
        phone: entry.phone,
        verifiedAt: new Date(entry.verifiedAt).toISOString(),
    };
}

/**
 * Cancel / invalidate an OTP request
 */
function cancelOtp(requestId) {
    return store.delete(requestId);
}

/**
 * Get OTP entry info (without code for security)
 */
function getOtpInfo(requestId) {
    const entry = store.get(requestId);
    if (!entry) return null;
    return {
        requestId,
        phone: entry.phone,
        expiresAt: new Date(entry.expiresAt).toISOString(),
        attempts: entry.attempts,
        verified: entry.verified,
        expired: Date.now() > entry.expiresAt,
    };
}

/**
 * Re-generate code for an existing requestId (resend)
 */
function refreshOtp(requestId, expirySeconds = DEFAULTS.expirySeconds) {
    const entry = store.get(requestId);
    if (!entry) return null;
    if (entry.verified) return null;

    entry.code = generateCode();
    entry.expiresAt = Date.now() + expirySeconds * 1000;
    entry.attempts = 0;

    return {
        requestId,
        code: entry.code,
        expiresAt: new Date(entry.expiresAt).toISOString(),
    };
}

module.exports = { createOtp, verifyOtp, cancelOtp, getOtpInfo, refreshOtp };
