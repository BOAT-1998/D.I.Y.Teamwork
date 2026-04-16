const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, dbPath } = require('../db');

const router = express.Router();

function normalizeEmployeeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function getDbStats() {
  const exists = fs.existsSync(dbPath);
  const stats = exists ? fs.statSync(dbPath) : null;
  return {
    path: dbPath,
    exists,
    sizeBytes: stats ? stats.size : 0,
    updatedAt: stats ? stats.mtime.toISOString() : null
  };
}

router.get('/status', (req, res) => {
  try {
    const dbStats = getDbStats();
    const rosterCount = db.prepare('SELECT COUNT(*) as c FROM EmployeeRoster').get()?.c || 0;
    const participantCount = db.prepare('SELECT COUNT(*) as c FROM Participants').get()?.c || 0;
    const matchedParticipants = db.prepare(`
      SELECT COUNT(*) as c
      FROM Participants p
      INNER JOIN EmployeeRoster e ON upper(trim(p.employee_code)) = e.employee_code
      WHERE trim(ifnull(p.employee_code, '')) <> ''
    `).get()?.c || 0;
    const latestImport = db.prepare(
      'SELECT imported_at FROM EmployeeRoster ORDER BY imported_at DESC LIMIT 1'
    ).get();

    res.json({
      success: true,
      data: {
        ...dbStats,
        rosterCount,
        participantCount,
        matchedParticipants,
        latestImportAt: latestImport ? latestImport.imported_at : null
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/employees', (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 5000)) : 500;
    const rows = db.prepare(
      `SELECT employee_code, employee_name, branch_code, imported_at
       FROM EmployeeRoster
       ORDER BY employee_code ASC
       LIMIT ?`
    ).all(limit);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/import', (req, res) => {
  try {
    const inputRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!inputRows.length) {
      return res.json({ success: false, error: 'rows is required' });
    }

    const importedAt = new Date().toISOString();
    const deduped = new Map();
    inputRows.forEach((row) => {
      const employeeCode = normalizeEmployeeCode(
        row.employeeCode || row.employee_code || row.code
      );
      const employeeName = normalizeText(
        row.employeeName || row.employee_name || row.name
      );
      const branchCode = normalizeText(
        row.branchCode || row.branch_code || row.branch
      ).toUpperCase();
      if (!employeeCode) return;
      deduped.set(employeeCode, {
        employeeCode,
        employeeName,
        branchCode,
        importedAt
      });
    });

    const rosterRows = Array.from(deduped.values());
    if (!rosterRows.length) {
      return res.json({ success: false, error: 'ไม่พบข้อมูลรหัสพนักงานในไฟล์' });
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM EmployeeRoster').run();
      const insert = db.prepare(
        'INSERT INTO EmployeeRoster (employee_code, employee_name, branch_code, imported_at) VALUES (?,?,?,?)'
      );
      rosterRows.forEach((row) => {
        insert.run(row.employeeCode, row.employeeName, row.branchCode, row.importedAt);
      });
    });
    tx();

    res.json({
      success: true,
      importedCount: rosterRows.length,
      latestImportAt: importedAt
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/clear', (req, res) => {
  try {
    db.prepare('DELETE FROM EmployeeRoster').run();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/download', (req, res) => {
  try {
    const fileName = path.basename(dbPath);
    res.download(dbPath, fileName);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
