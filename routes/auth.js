// ============================================================
// routes/auth.js — Authentication routes
// ============================================================
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const router = express.Router();

// GET setting helper
function getSetting(key) {
  const row = db.prepare('SELECT value FROM Settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// POST /api/auth/admin-login
router.post('/admin-login', (req, res) => {
  const { pass } = req.body;
  if (!pass) return res.json({ success: false, error: 'กรุณาใส่ password' });
  const stored = getSetting('admin_password') || 'admin1234';
  if (pass.trim() === stored.trim()) {
    res.json({ success: true, role: 'admin' });
  } else {
    res.json({ success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
  }
});

// POST /api/auth/host-login
router.post('/host-login', (req, res) => {
  const { pass } = req.body;
  const enabled = getSetting('host_password_enabled') === 'true';
  if (!enabled) return res.json({ success: true, role: 'host' });
  const stored = getSetting('host_password') || '';
  if (!stored || pass.trim() === stored.trim()) {
    res.json({ success: true, role: 'host' });
  } else {
    res.json({ success: false, error: 'รหัสผ่าน Host ไม่ถูกต้อง' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  const { oldPass, newPass } = req.body;
  const stored = getSetting('admin_password') || 'admin1234';
  if (oldPass.trim() !== stored.trim()) {
    return res.json({ success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  }
  if (!newPass || newPass.trim().length < 4) {
    return res.json({ success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
  }
  db.prepare('INSERT OR REPLACE INTO Settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('admin_password', newPass.trim(), new Date().toISOString());
  res.json({ success: true });
});

module.exports = router;
