// ============================================================
// routes/dashboard.js — Dashboard stats
// ============================================================
const express = require('express');
const { db } = require('../db');
const router = express.Router();

// GET /api/dashboard
router.get('/', (req, res) => {
  try {
    const totalQuizzes      = db.prepare('SELECT COUNT(*) as c FROM Quizzes').get().c;
    const totalSessions     = db.prepare('SELECT COUNT(*) as c FROM Sessions').get().c;
    const totalParticipants = db.prepare('SELECT COUNT(*) as c FROM Participants').get().c;
    const totalResponses    = db.prepare('SELECT COUNT(*) as c FROM Responses').get().c;
    const activeSessions    = db.prepare("SELECT COUNT(*) as c FROM Sessions WHERE status='active'").get().c;
    const completedSessions = db.prepare("SELECT COUNT(*) as c FROM Sessions WHERE status='ended'").get().c;

    // Average score
    const scoreRows = db.prepare('SELECT score FROM Responses').all();
    const avgScore  = scoreRows.length
      ? Math.round(scoreRows.reduce((a, r) => a + (r.score || 0), 0) / scoreRows.length)
      : 0;

    // Accuracy
    const correct  = db.prepare('SELECT COUNT(*) as c FROM Responses WHERE is_correct=1').get().c;
    const accuracy = totalResponses ? Math.round((correct / totalResponses) * 100) : 0;

    // Recent sessions (last 5)
    const recentSessions = db.prepare(
      "SELECT s.*, q.title as quizTitle FROM Sessions s LEFT JOIN Quizzes q ON s.quiz_id=q.id ORDER BY s.started_at DESC LIMIT 5"
    ).all();

    res.json({
      success: true,
      data: {
        totalQuizzes, totalSessions, activeSessions, completedSessions,
        totalParticipants, totalResponses, averageScore: avgScore,
        accuracyRate: accuracy, recentSessions
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/dashboard/reset
router.post('/reset', (req, res) => {
  try {
    const transaction = db.transaction(() => {
      db.exec("DELETE FROM Sessions");
      db.exec("DELETE FROM Participants");
      db.exec("DELETE FROM Responses");
      db.exec("DELETE FROM PollResults");
    });
    transaction();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
