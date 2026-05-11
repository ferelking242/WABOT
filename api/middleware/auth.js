'use strict';

/**
 * API Key authentication middleware
 * Reads key from: X-API-Key header or ?api_key query param
 */

const { validateApiKey, hasPermission } = require('../utils/apiKeys');

/**
 * Base auth middleware — attaches keyEntry to req.apiKey
 */
function requireAuth(req, res, next) {
    const raw = req.headers['x-api-key'] || req.query.api_key;

    if (!raw) {
        return res.status(401).json({
            success: false,
            error: 'MISSING_API_KEY',
            message: 'Provide your API key via X-API-Key header or ?api_key query param',
        });
    }

    const keyEntry = validateApiKey(raw);
    if (!keyEntry) {
        return res.status(403).json({
            success: false,
            error: 'INVALID_API_KEY',
            message: 'The API key is invalid, revoked, or expired',
        });
    }

    req.apiKey = keyEntry;
    next();
}

/**
 * Permission check middleware factory
 * Usage: requirePermission('messages')
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.apiKey, permission)) {
            return res.status(403).json({
                success: false,
                error: 'INSUFFICIENT_PERMISSIONS',
                message: `This key does not have the '${permission}' permission`,
            });
        }
        next();
    };
}

module.exports = { requireAuth, requirePermission };
