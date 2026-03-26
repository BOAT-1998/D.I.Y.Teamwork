// ============================================================
// routes/quizzes.js — Quiz & Question CRUD
// ============================================================
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const router = express.Router();

function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${id}`;
}

// ── QUIZ CRUD ────────────────────────────────────────────────

// GET /api/quizzes — list all quizzes with question count
router.get('/', (req, res) => {
  try {
    const quizzes = db.prepare('SELECT * FROM Quizzes ORDER BY created_at DESC').all();
    const withCount = quizzes.map(q => ({
      ...q,
      questionCount: db.prepare('SELECT COUNT(*) as c FROM Questions WHERE quiz_id=?').get(q.id).c
    }));
    res.json({ success: true, data: withCount });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/quizzes/:id — quiz detail with questions
router.get('/:id', (req, res) => {
  try {
    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(req.params.id);
    if (!quiz) return res.json({ success: false, error: 'Quiz not found' });
    const questions = db.prepare(
      'SELECT * FROM Questions WHERE quiz_id=? ORDER BY order_num ASC'
    ).all(req.params.id).map(q => ({
      ...q,
      options: tryParseJSON(q.options_json, [])
    }));
    res.json({ success: true, data: { ...quiz, questions } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/quizzes — create quiz
router.post('/', (req, res) => {
  try {
    const d   = req.body;
    const id  = generateId('QZ');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO Quizzes (id,title,description,category,cover_image,host_id,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, d.title || 'Untitled Quiz', d.description || '', d.category || 'General',
          d.cover_image || '', d.host_id || 'admin', JSON.stringify(d.settings || {}), now);
    res.json({ success: true, id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /api/quizzes/:id — update quiz
router.put('/:id', (req, res) => {
  try {
    const d = req.body;
    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(req.params.id);
    if (!quiz) return res.json({ success: false, error: 'Quiz not found' });
    db.prepare(
      'UPDATE Quizzes SET title=?, description=?, category=?, settings_json=? WHERE id=?'
    ).run(
      d.title       || quiz.title,
      d.description !== undefined ? d.description : quiz.description,
      d.category    || quiz.category,
      d.settings    ? JSON.stringify(d.settings) : quiz.settings_json,
      req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/quizzes/duplicate — copy quiz + all questions
router.post('/duplicate', (req, res) => {
  console.log('🔄 Duplicating Quiz:', req.body.quizId);
  try {
    const quizId = req.body.quizId;
    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(quizId);
    if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

    const newQuizId = generateId('QZ');
    const now = new Date().toISOString();
    
    const tx = db.transaction(() => {
      // Copy Quiz metadata
      console.log('   - Inserting new quiz:', newQuizId);
      db.prepare(
        'INSERT INTO Quizzes (id,title,description,category,cover_image,host_id,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(newQuizId, quiz.title + ' (Copy)', quiz.description, quiz.category,
            quiz.cover_image, quiz.host_id, quiz.settings_json, now);

      // Copy all Questions tied to this quiz
      const questions = db.prepare('SELECT * FROM Questions WHERE quiz_id=?').all(quizId);
      console.log(`   - Found ${questions.length} questions to clone.`);
      for (const q of questions) {
        const newQId = generateId('QN');
        db.prepare(
          'INSERT INTO Questions (id,quiz_id,type,text,image_url,time_limit,points,order_num,options_json) VALUES (?,?,?,?,?,?,?,?,?)'
        ).run(newQId, newQuizId, q.type, q.text, q.image_url, q.time_limit, q.points, q.order_num, q.options_json);
      }
    });
    tx();

    console.log('✅ Duplication success:', newQuizId);
    res.json({ success: true, id: newQuizId });
  } catch (err) {
    console.error('❌ Duplication error details:', err);
    res.json({ success: false, error: err.message });
  }
});

// POST /api/quizzes/:id/shuffle — shuffle questions order
router.post('/:id/shuffle', (req, res) => {
  try {
    const quizId = req.params.id;
    const questions = db.prepare('SELECT id FROM Questions WHERE quiz_id=?').all(quizId);
    if (!questions.length) return res.json({ success: true });

    // Fisher-Yates Shuffle
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    // Update positions in a single transaction
    const tx = db.transaction(() => {
      const stmt = db.prepare('UPDATE Questions SET order_num=? WHERE id=?');
      questions.forEach((q, i) => stmt.run(i + 1, q.id));
    });
    tx();

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /api/quizzes/:id — delete quiz + its questions
router.delete('/:id', (req, res) => {
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM Questions WHERE quiz_id=?').run(req.params.id);
      db.prepare('DELETE FROM Quizzes WHERE id=?').run(req.params.id);
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── QUESTION CRUD ────────────────────────────────────────────

// POST /api/quizzes/questions — create or update question
router.post('/questions/save', (req, res) => {
  try {
    const d   = req.body;
    const now = new Date().toISOString();
    if (d.id) {
      // UPDATE
      db.prepare(
        'UPDATE Questions SET quiz_id=?,type=?,text=?,image_url=?,time_limit=?,points=?,order_num=?,options_json=? WHERE id=?'
      ).run(d.quiz_id, d.type || 'multiple_choice', d.text || '', d.image_url || '',
            d.time_limit || 30, d.points || 0, d.order_num || 1,
            JSON.stringify(d.options || []), d.id);
      return res.json({ success: true, id: d.id });
    }
    // CREATE
    const id = generateId('QN');
    db.prepare(
      'INSERT INTO Questions (id,quiz_id,type,text,image_url,time_limit,points,order_num,options_json) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(id, d.quiz_id, d.type || 'multiple_choice', d.text || '', d.image_url || '',
          d.time_limit || 30, d.points || 0, d.order_num || 1,
          JSON.stringify(d.options || []));
    res.json({ success: true, id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /api/quizzes/questions/:id
router.delete('/questions/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM Questions WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
