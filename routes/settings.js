// ============================================================
// routes/settings.js — App settings
// ============================================================
const express = require('express');
const { db } = require('../db');
const router = express.Router();

// GET /api/settings — get all settings as object
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM Settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/settings — save/update settings
router.post('/', (req, res) => {
  try {
    const obj = req.body;
    const now = new Date().toISOString();
    const upsert = db.prepare(
      'INSERT INTO Settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
    );
    const tx = db.transaction(() => {
      Object.entries(obj).forEach(([k, v]) => upsert.run(k, String(v), now));
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
