'use strict';

/**
 * Phone number utilities for WhatsApp API
 * Handles formatting, validation, and JID conversion
 */

/**
 * Normalize a phone number to WhatsApp JID format
 * Accepts: +242064235945, 242064235945, 00242064235945, 0064235945 (local)
 * Returns: 242064235945@s.whatsapp.net
 */
function toJid(phone) {
    if (!phone) throw new Error('Phone number is required');

    // Already a JID
    if (typeof phone === 'string' && phone.includes('@')) return phone;

    let num = String(phone).trim();

    // Remove spaces, dashes, parentheses, dots
    num = num.replace(/[\s\-().]/g, '');

    // Remove leading +
    if (num.startsWith('+')) num = num.slice(1);

    // Remove leading 00 (international prefix)
    if (num.startsWith('00')) num = num.slice(2);

    // Must be digits only now
    if (!/^\d{7,15}$/.test(num)) {
        throw new Error(`Invalid phone number format: ${phone}`);
    }

    return `${num}@s.whatsapp.net`;
}

/**
 * Convert an array of phone numbers to JIDs
 */
function toJids(phones) {
    if (!Array.isArray(phones)) throw new Error('phones must be an array');
    return phones.map(toJid);
}

/**
 * Extract plain number from JID
 */
function fromJid(jid) {
    if (!jid) return null;
    return jid.replace(/@s\.whatsapp\.net|@g\.us|@c\.us/, '');
}

/**
 * Check if a JID is a group
 */
function isGroupJid(jid) {
    return typeof jid === 'string' && jid.endsWith('@g.us');
}

/**
 * Format group id to JID
 * Accepts: 120363000000000001@g.us or 120363000000000001-1234567890
 */
function toGroupJid(groupId) {
    if (!groupId) throw new Error('Group ID is required');
    const s = String(groupId).trim();
    if (s.endsWith('@g.us')) return s;
    // Strip any @ suffix
    const base = s.replace(/@.*$/, '');
    return `${base}@g.us`;
}

/**
 * Validate a phone number (loose check)
 */
function isValidPhone(phone) {
    try {
        toJid(phone);
        return true;
    } catch {
        return false;
    }
}

module.exports = { toJid, toJids, fromJid, isGroupJid, toGroupJid, isValidPhone };
