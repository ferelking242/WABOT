'use strict';

/**
 * Message log — persisted circular log of sent/failed messages
 * Stored in api/data/messages.json (last 50k entries, rotating)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_ENTRIES = 50_000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory buffer (flush to disk every 10 s)
let buffer = [];
let flushing = false;

function loadLog() {
    try {
        if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    } catch { /* ignore */ }
    return [];
}

function flushToDisk() {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    try {
        let existing = loadLog();
        existing = existing.concat(buffer);
        if (existing.length > MAX_ENTRIES) existing = existing.slice(-MAX_ENTRIES);
        fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 0), 'utf-8');
        buffer = [];
    } catch { /* ignore */ }
    flushing = false;
}

setInterval(flushToDisk, 10_000);

/**
 * Record a message send attempt
 */
function logMessage(entry) {
    const record = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        date: new Date().toISOString(),
        to: entry.to || null,
        type: entry.type || 'text',
        status: entry.status || 'queued',    // queued | sent | failed | delivered | read
        messageId: entry.messageId || null,
        jobId: entry.jobId || null,
        apiKeyId: entry.apiKeyId || null,
        error: entry.error || null,
        meta: entry.meta || {},
    };
    buffer.push(record);
    return record;
}

/**
 * Update status of an existing log entry by messageId
 */
function updateStatus(messageId, status) {
    // Update in buffer first
    for (const r of buffer) {
        if (r.messageId === messageId) { r.status = status; return; }
    }
    // For disk records, we skip live update (expensive) — webhooks handle this
}

/**
 * Query message logs
 * @param {object} filters
 * @param {string} filters.apiKeyId
 * @param {string} filters.to
 * @param {string} filters.status
 * @param {string} filters.type
 * @param {number} filters.from  — Unix ms
 * @param {number} filters.to_ts — Unix ms
 * @param {number} filters.limit — max results (default 100)
 * @param {number} filters.offset
 */
function queryLogs(filters = {}) {
    flushToDisk();
    const all = loadLog();

    let results = all;

    if (filters.apiKeyId) results = results.filter(r => r.apiKeyId === filters.apiKeyId);
    if (filters.to) results = results.filter(r => r.to?.includes(filters.to));
    if (filters.status) results = results.filter(r => r.status === filters.status);
    if (filters.type) results = results.filter(r => r.type === filters.type);
    if (filters.from) results = results.filter(r => r.ts >= filters.from);
    if (filters.to_ts) results = results.filter(r => r.ts <= filters.to_ts);

    // Most recent first
    results = results.reverse();

    const total = results.length;
    const offset = filters.offset || 0;
    const limit = Math.min(filters.limit || 100, 1000);

    return {
        total,
        offset,
        limit,
        data: results.slice(offset, offset + limit),
    };
}

/**
 * Stats summary
 */
function getStats(apiKeyId = null) {
    flushToDisk();
    const all = loadLog();
    const records = apiKeyId ? all.filter(r => r.apiKeyId === apiKeyId) : all;

    const byStatus = {};
    const byType = {};

    for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byType[r.type] = (byType[r.type] || 0) + 1;
    }

    return {
        total: records.length,
        byStatus,
        byType,
    };
}

module.exports = { logMessage, updateStatus, queryLogs, getStats, flushToDisk };
