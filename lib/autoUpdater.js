'use strict';

/**
 * wabot Auto-Updater — A/B deployment with automatic rollback
 *
 * How it works:
 *  1. Every 5 min (or on webhook trigger): check GitHub for new commits
 *  2. If new commit found:
 *     a. Backup all changed files to .wabot_backup/{oldSha}_{newSha}/
 *     b. Download & write new files from GitHub API
 *     c. Write state: { pendingValidation: true, ... }
 *     d. Exit process (host / Replit / PM2 restarts automatically)
 *  3. On next startup (pendingValidation = true):
 *     a. Start 30 s health check loop on own API
 *     b. If all checks pass  → SUCCESS: clear backups, update currentSha
 *     c. If any check fails  → ROLLBACK: restore files, log error, alert webhooks
 *
 * Zero downtime risk: if update breaks the server, rollback restores
 * the previous working code within 30 seconds.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const ROOT       = path.join(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.wabot_state.json');
const BACKUP_DIR = path.join(ROOT, '.wabot_backup');

// ── State helpers ──────────────────────────────────────────────────────────────

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
    catch { return { currentSha: null, pendingValidation: false }; }
}

function writeState(s) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf-8');
}

// ── GitHub API helpers ─────────────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'ferelking242';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'wabot';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghFetch(path_) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.github.com',
            path: path_,
            headers: {
                'User-Agent':    'wabot-updater/1.0',
                'Accept':        'application/vnd.github.v3+json',
                ...(GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {}),
            },
        };
        https.get(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('JSON parse failed')); }
            });
        }).on('error', reject);
    });
}

async function getLatestCommitSha() {
    const data = await ghFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`);
    return data.sha || null;
}

async function getChangedFiles(oldSha, newSha) {
    // Returns list of files changed between two SHAs
    const data = await ghFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${oldSha}...${newSha}`);
    return (data.files || []).map(f => ({ filename: f.filename, status: f.status }));
}

async function downloadFile(filePath) {
    // Get file content via GitHub API
    const data = await ghFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`);
    if (!data.content) return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
}

// ── Backup helpers ─────────────────────────────────────────────────────────────

function backupFile(relPath, backupDir) {
    const src = path.join(ROOT, relPath);
    if (!fs.existsSync(src)) return;
    const dest = path.join(backupDir, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function restoreBackup(backupDir) {
    if (!fs.existsSync(backupDir)) return false;
    function restoreDir(dir, rel) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const entryRel = path.join(rel, entry.name);
            const src = path.join(dir, entry.name);
            const dest = path.join(ROOT, entryRel);
            if (entry.isDirectory()) {
                restoreDir(src, entryRel);
            } else {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(src, dest);
            }
        }
    }
    restoreDir(backupDir, '');
    return true;
}

function clearBackup(backupDir) {
    if (!fs.existsSync(backupDir)) return;
    fs.rmSync(backupDir, { recursive: true, force: true });
}

// ── Health check ───────────────────────────────────────────────────────────────

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: 5000 }, res => {
            resolve(res.statusCode);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function runHealthCheck(port = 3001, waitSeconds = 30) {
    const url = `http://127.0.0.1:${port}/api/v1/health`;
    const deadline = Date.now() + waitSeconds * 1000;
    let passed = 0;

    // Give the server time to start
    await sleep(10_000);

    while (Date.now() < deadline) {
        try {
            const code = await httpGet(url);
            if (code >= 200 && code < 500) {
                passed++;
                if (passed >= 3) return true; // 3 consecutive successes
            } else {
                passed = 0;
            }
        } catch {
            passed = 0;
        }
        await sleep(3000);
    }
    return false;
}

// ── Core update logic ──────────────────────────────────────────────────────────

let isUpdating = false;

async function applyUpdate(newSha) {
    if (isUpdating) return;
    isUpdating = true;

    const state = readState();
    const oldSha = state.currentSha || 'HEAD~1';
    const backupDir = path.join(BACKUP_DIR, `${oldSha.slice(0,7)}_${newSha.slice(0,7)}`);

    console.log(`[AutoUpdater] 🔄 Applying update ${oldSha.slice(0,7)} → ${newSha.slice(0,7)}`);

    try {
        // Get changed files
        let changedFiles = [];
        if (oldSha !== 'HEAD~1') {
            try {
                const files = await getChangedFiles(oldSha, newSha);
                changedFiles = files.filter(f => f.status !== 'removed');
                console.log(`[AutoUpdater] ${changedFiles.length} files changed`);
            } catch (err) {
                console.error('[AutoUpdater] Could not get diff, skipping update:', err.message);
                isUpdating = false;
                return;
            }
        }

        if (changedFiles.length === 0) {
            console.log('[AutoUpdater] No files to update');
            writeState({ ...state, currentSha: newSha });
            isUpdating = false;
            return;
        }

        // Backup current files
        fs.mkdirSync(backupDir, { recursive: true });
        for (const { filename } of changedFiles) {
            backupFile(filename, backupDir);
        }
        console.log(`[AutoUpdater] ✅ Backed up ${changedFiles.length} files → ${backupDir}`);

        // Download and write new files
        let written = 0;
        for (const { filename } of changedFiles) {
            try {
                const content = await downloadFile(filename);
                if (content === null) continue;
                const dest = path.join(ROOT, filename);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, content, 'utf-8');
                written++;
            } catch (err) {
                console.error(`[AutoUpdater] Failed to write ${filename}:`, err.message);
            }
        }
        console.log(`[AutoUpdater] ✅ Written ${written}/${changedFiles.length} files`);

        // Write pending validation state
        writeState({
            currentSha: newSha,
            previousSha: oldSha,
            pendingValidation: true,
            backupDir,
            updatedAt: new Date().toISOString(),
        });

        // Notify webhooks
        try {
            const { deliverEvent } = require('../api/utils/webhook');
            await deliverEvent('bot.update.applying', { oldSha, newSha, files: changedFiles.length });
        } catch { /* non-fatal */ }

        console.log('[AutoUpdater] 🔁 Restarting process for validation...');
        setTimeout(() => process.exit(0), 1000);

    } catch (err) {
        console.error('[AutoUpdater] ❌ Update failed:', err.message);
        clearBackup(backupDir);
        isUpdating = false;
    }
}

// ── Validation on startup ──────────────────────────────────────────────────────

async function validatePendingUpdate() {
    const state = readState();
    if (!state.pendingValidation) return;

    const port = parseInt(process.env.API_PORT || '3001');
    console.log(`[AutoUpdater] 🔍 Validating update ${state.previousSha?.slice(0,7)} → ${state.currentSha?.slice(0,7)}`);
    console.log('[AutoUpdater] Running 30s health check...');

    const healthy = await runHealthCheck(port, 30);

    if (healthy) {
        console.log('[AutoUpdater] ✅ Update validated successfully!');
        clearBackup(state.backupDir);
        writeState({ currentSha: state.currentSha, pendingValidation: false, lastUpdateAt: new Date().toISOString() });

        try {
            const { deliverEvent } = require('../api/utils/webhook');
            await deliverEvent('bot.update.success', {
                sha: state.currentSha,
                previousSha: state.previousSha,
                validatedAt: new Date().toISOString(),
            });
        } catch { /* non-fatal */ }
    } else {
        console.error('[AutoUpdater] ❌ Health check FAILED — rolling back!');

        const restored = restoreBackup(state.backupDir);
        console.log(restored ? '[AutoUpdater] ✅ Backup restored' : '[AutoUpdater] ⚠️ No backup found');

        writeState({
            currentSha: state.previousSha,
            pendingValidation: false,
            lastRollback: new Date().toISOString(),
            rollbackReason: 'Health check failed after 30s',
        });

        try {
            const { deliverEvent } = require('../api/utils/webhook');
            await deliverEvent('bot.update.rollback', {
                failedSha: state.currentSha,
                restoredSha: state.previousSha,
                reason: 'Health check failed after 30s',
                rolledBackAt: new Date().toISOString(),
            });
        } catch { /* non-fatal */ }

        console.log('[AutoUpdater] 🔁 Restarting with previous build...');
        setTimeout(() => process.exit(0), 2000);
    }
}

// ── Polling loop ───────────────────────────────────────────────────────────────

let pollInterval = null;

function startPolling(intervalMs = 5 * 60 * 1000) {
    async function check() {
        if (isUpdating) return;
        try {
            const newSha = await getLatestCommitSha();
            if (!newSha) return;

            const state = readState();
            if (!state.currentSha) {
                // First run — just record current SHA
                writeState({ ...state, currentSha: newSha });
                return;
            }

            if (newSha !== state.currentSha) {
                console.log(`[AutoUpdater] 🆕 New commit detected: ${newSha.slice(0,7)}`);
                await applyUpdate(newSha);
            }
        } catch (err) {
            // Rate limit or network error — silent, try next interval
            if (!err.message?.includes('rate')) {
                console.error('[AutoUpdater] Poll error:', err.message);
            }
        }
    }

    // Run immediately, then on interval
    setTimeout(check, 30_000); // Initial delay — let bot connect first
    pollInterval = setInterval(check, intervalMs);
    console.log(`[AutoUpdater] 🕐 Polling GitHub every ${intervalMs / 60000} min`);
}

function stopPolling() {
    if (pollInterval) clearInterval(pollInterval);
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function start() {
    const state = readState();

    // Validate pending update from previous restart
    if (state.pendingValidation) {
        validatePendingUpdate(); // async, non-blocking
    }

    // Auto-update polling (if GITHUB_OWNER/REPO are set)
    if (process.env.AUTO_UPDATE !== 'false' && GITHUB_OWNER && GITHUB_REPO) {
        startPolling();
    } else {
        console.log('[AutoUpdater] Auto-update disabled (set AUTO_UPDATE=true with GITHUB_OWNER & GITHUB_REPO)');
    }
}

function getStatus() {
    const state = readState();
    return {
        currentSha: state.currentSha,
        pendingValidation: state.pendingValidation || false,
        lastUpdateAt: state.lastUpdateAt || null,
        lastRollback: state.lastRollback || null,
        isUpdating,
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { start, applyUpdate, getStatus, stopPolling };
