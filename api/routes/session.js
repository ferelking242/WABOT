'use strict';

/**
 * Session Export / Import
 * GET  /api/v1/session/export  → JSON bundle (base64 files)
 * POST /api/v1/session/import  → write files, restart bot
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { requireAuth } = require('../middleware/auth');

const SESSION_DIR = path.resolve(process.cwd(), 'session');

// ── Export ────────────────────────────────────────────────────────────────────
router.get('/export', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return res.status(404).json({ success: false, error: 'Aucune session trouvée' });
    }

    const files = {};
    const readDir = (dir, prefix) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel  = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) readDir(full, rel);
        else files[rel] = fs.readFileSync(full).toString('base64');
      }
    };
    readDir(SESSION_DIR, '');

    res.json({
      success:    true,
      version:    '1.0',
      bot:        'wabot',
      exportedAt: new Date().toISOString(),
      files
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Import ────────────────────────────────────────────────────────────────────
router.post('/import', requireAuth, (req, res) => {
  try {
    const { files } = req.body || {};
    if (!files || typeof files !== 'object' || !Object.keys(files).length) {
      return res.status(400).json({ success: false, error: 'Données de session invalides' });
    }

    // Backup existing session
    if (fs.existsSync(SESSION_DIR)) {
      const backup = `${SESSION_DIR}_backup_${Date.now()}`;
      fs.cpSync(SESSION_DIR, backup, { recursive: true });
    }

    // Write new files
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    let count = 0;
    for (const [rel, b64] of Object.entries(files)) {
      const full = path.resolve(SESSION_DIR, rel);
      if (!full.startsWith(SESSION_DIR)) continue; // security guard
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.from(b64, 'base64'));
      count++;
    }

    res.json({
      success:    true,
      message:    `Session importée (${count} fichiers). Redémarrage en cours…`,
      filesCount: count
    });

    // Restart after response is sent
    setTimeout(() => {
      console.log('[Session] Redémarrage après import de session');
      process.exit(0);
    }, 1500);

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
