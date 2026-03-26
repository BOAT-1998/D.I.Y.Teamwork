// ============================================================
// routes/sessions.js — Live Session management
// ============================================================
const express = require('express');
const { db } = require('../db');
const router = express.Router();

function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${id}`;
}
function generatePIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function generatePlayerCode() {
  const words = ['STAR','HERO','LION','WOLF','HAWK','BOLT','FIRE','JADE','RUBY','GOLD'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(10 + Math.random() * 90)}`;
}
function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
function sanitizeForPlayer(q, showAnswer = false) {
  const opts = tryParseJSON(q.options_json, []);
  return {
    ...q,
    options: Array.isArray(opts) ? opts.map(o => ({
      text: o.text,
      ...(showAnswer ? { is_correct: o.is_correct } : {})
    })) : []
  };
}

// ── GET /api/sessions/history ──────────────────────────────
router.get('/history', (req, res) => {
  try {
    const hostId = req.query.hostId;
    let sessions;
    if (hostId) {
      sessions = db.prepare(`
        SELECT s.*, q.title as quizTitle
        FROM Sessions s LEFT JOIN Quizzes q ON s.quiz_id=q.id
        WHERE s.host_id=? ORDER BY s.started_at DESC
      `).all(hostId);
    } else {
      sessions = db.prepare(`
        SELECT s.*, q.title as quizTitle
        FROM Sessions s LEFT JOIN Quizzes q ON s.quiz_id=q.id
        ORDER BY s.started_at DESC
      `).all();
    }
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── DELETE /api/sessions/history ───────────────────────────
router.delete('/history', (req, res) => {
  try {
    db.prepare("DELETE FROM Sessions WHERE status='ended'").run();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/delete (individual) ──────────────────
router.post('/delete', (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.json({ success: false, error: 'sessionId required' });
    
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM Responses WHERE session_id=?').run(sessionId);
      db.prepare('DELETE FROM PollResults WHERE session_id=?').run(sessionId);
      db.prepare('DELETE FROM Participants WHERE session_id=?').run(sessionId);
      db.prepare('DELETE FROM Sessions WHERE id=?').run(sessionId);
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/start ───────────────────────────────
router.post('/start', (req, res) => {
  try {
    const { quizId, hostId } = req.body;
    if (!quizId) return res.json({ success: false, error: 'quizId required' });

    // Close previous sessions for this host
    const hId = hostId || 'admin';
    db.prepare(`UPDATE Sessions SET status='ended', ended_at=? WHERE host_id=? AND status IN ('active','waiting')`)
      .run(new Date().toISOString(), hId);

    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(quizId);
    if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

    const pin = generatePIN();
    const id  = generateId('SS');
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO Sessions (id,quiz_id,pin,host_id,status,current_q_index,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, quizId, pin, hId, 'waiting', 0, now, '');

    res.json({ success: true, sessionId: id, pin, quizTitle: quiz.title });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/validate-pin/:pin ──────────────────────
router.get('/validate-pin/:pin', (req, res) => {
  const pinNum = parseInt(String(req.params.pin).trim(), 10);
  const session = db.prepare("SELECT * FROM Sessions WHERE CAST(pin AS INTEGER)=? AND status IN ('waiting','active')").get(pinNum);
  if (!session) return res.json({ success: false, error: 'ไม่พบ Session ឬ อาจจบลงแล้ว' });
  if (session.status === 'active') return res.json({ success: false, error: 'Session นี้ได้เริ่มแล้ว ให้รอ Session ใหม่' });
  res.json({ success: true, sessionId: session.id });
});

// ── POST /api/sessions/join ────────────────────────────────
router.post('/join', (req, res) => {
  try {
    const { pin, playerName, avatar } = req.body;
    if (!pin || !playerName) return res.json({ success: false, error: 'PIN and name required' });

    const pinNum = parseInt(String(pin).trim(), 10);
    const session = db.prepare(
      "SELECT * FROM Sessions WHERE CAST(pin AS INTEGER)=? AND status IN ('waiting','active')"
    ).get(pinNum);

    if (!session) return res.json({ success: false, error: 'Session not found or already ended' });

    if (session.status === 'active') {
      const existing = db.prepare('SELECT id FROM Participants WHERE session_id=? AND lower(name)=lower(?)').get(session.id, playerName);
      if (!existing) return res.json({ success: false, error: 'Session นี้ได้เริ่มแล้ว ให้รอ Session ใหม่' });
      return res.json({ success: true, participantId: existing.id, sessionId: session.id, rejoined: true });
    }

    // Check duplicate name
    const existing = db.prepare(
      'SELECT * FROM Participants WHERE session_id=? AND lower(name)=lower(?)'
    ).get(session.id, playerName);
    if (existing) {
      return res.json({ success: true, participantId: existing.id, sessionId: session.id, rejoined: true });
    }

    const pId = generateId('PT');
    const now  = new Date().toISOString();
    db.prepare(
      'INSERT INTO Participants (id,session_id,name,player_code,avatar,joined_at) VALUES (?,?,?,?,?,?)'
    ).run(pId, session.id, playerName, generatePlayerCode(), avatar || '👤', now);

    res.json({ success: true, participantId: pId, sessionId: session.id, rejoined: false });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/live ─────────────────────────────
router.get('/:id/live', (req, res) => {
  try {
    const { participantId } = req.query;
    const session = db.prepare('SELECT * FROM Sessions WHERE id=?').get(req.params.id);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(session.quiz_id);
    const questions = db.prepare(
      'SELECT * FROM Questions WHERE quiz_id=? ORDER BY order_num ASC'
    ).all(session.quiz_id).map(q => ({ ...q, options: tryParseJSON(q.options_json, []) }));

    const currentIdx = Number(session.current_q_index) || 0;
    const currentQ   = questions[currentIdx] || null;
    const showAnswer = !!session.show_answer;

    const participantCount = db.prepare('SELECT COUNT(*) as c FROM Participants WHERE session_id=?').get(session.id).c;

    let answered = false;
    if (participantId && currentQ) {
      answered = !!db.prepare(
        'SELECT id FROM Responses WHERE session_id=? AND participant_id=? AND question_id=?'
      ).get(session.id, participantId, currentQ.id);
    }

    res.json({
      success: true,
      data: {
        sessionId:            session.id,
        status:               session.status,
        pin:                  String(session.pin),
        quizTitle:            quiz ? quiz.title : '',
        currentQuestionIndex: currentIdx,
        totalQuestions:       questions.length,
        currentQuestion:      currentQ ? sanitizeForPlayer(currentQ, showAnswer) : null,
        participantCount,
        answered,
        showAnswer,
        isLastQuestion:       currentIdx >= questions.length - 1,
        webAppUrl:            `http://localhost:${process.env.PORT || 3000}`
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/:id/reveal ──────────────────────────
router.post('/:id/reveal', (req, res) => {
  try {
    db.prepare('UPDATE Sessions SET show_answer=1 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/:id/next ────────────────────────────
router.post('/:id/next', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM Sessions WHERE id=?').get(req.params.id);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    if (session.status === 'waiting') {
      db.prepare("UPDATE Sessions SET status='active', show_answer=0 WHERE id=?").run(req.params.id);
      return res.json({ success: true, newIndex: 0, isFirstQuestion: true });
    }
    const newIdx = (Number(session.current_q_index) || 0) + 1;
    db.prepare('UPDATE Sessions SET current_q_index=?, show_answer=0 WHERE id=?').run(newIdx, req.params.id);
    res.json({ success: true, newIndex: newIdx, isFirstQuestion: false });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/:id/end ─────────────────────────────
router.post('/:id/end', (req, res) => {
  try {
    db.prepare("UPDATE Sessions SET status='ended', ended_at=? WHERE id=?")
      .run(new Date().toISOString(), req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── POST /api/sessions/:id/answer ─────────────────────────
router.post('/:id/answer', (req, res) => {
  try {
    const { participantId, questionId, answer } = req.body;
    const sessionId = req.params.id;

    // Already answered?
    const existing = db.prepare(
      'SELECT id FROM Responses WHERE session_id=? AND participant_id=? AND question_id=?'
    ).get(sessionId, participantId, questionId);
    if (existing) return res.json({ success: false, error: 'Already answered' });

    const question = db.prepare('SELECT * FROM Questions WHERE id=?').get(questionId);
    if (!question) return res.json({ success: false, error: 'Question not found' });

    const options = tryParseJSON(question.options_json, []);
    const points  = Number(question.points) || 10;
    let isCorrect = false;
    let score     = 0;
    const qType   = question.type;

    if (qType === 'multiple_choice' || qType === 'true_false') {
      const correctOpt = options.find(o => o.is_correct === true || o.is_correct === 'true' || o.is_correct === 'TRUE');
      isCorrect = !!(correctOpt && correctOpt.text === answer);
      score = isCorrect ? points : 0;
    } else if (qType === 'checkbox') {
      const correctOpts = options.filter(o => o.is_correct === true || o.is_correct === 'true' || o.is_correct === 'TRUE').map(o => o.text).sort();
      const given = Array.isArray(answer) ? [...answer].sort() : [answer];
      isCorrect = JSON.stringify(correctOpts) === JSON.stringify(given);
      score = isCorrect ? points : 0;
    }

    const id  = generateId('RS');
    const now = new Date().toISOString();
    const answerStr = Array.isArray(answer) ? JSON.stringify(answer) : answer;

    db.prepare(
      'INSERT INTO Responses (id,session_id,participant_id,question_id,answer,is_correct,score,time_taken,submitted_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(id, sessionId, participantId, questionId, answerStr, isCorrect ? 1 : 0, score, 0, now);

    // Update poll results for poll/word_cloud
    if (qType === 'poll' || qType === 'word_cloud') {
      const answers = Array.isArray(answer) ? answer : [answer];
      answers.forEach(ans => {
        const existing = db.prepare(
          'SELECT id FROM PollResults WHERE session_id=? AND question_id=? AND answer_text=?'
        ).get(sessionId, questionId, ans);
        if (existing) {
          db.prepare('UPDATE PollResults SET vote_count=vote_count+1 WHERE id=?').run(existing.id);
        } else {
          db.prepare('INSERT INTO PollResults (id,session_id,question_id,answer_text,vote_count) VALUES (?,?,?,?,?)')
            .run(generateId('PL'), sessionId, questionId, ans, 1);
        }
      });
    }

    res.json({ success: true, isCorrect, score, points });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/leaderboard ─────────────────────
router.get('/:id/leaderboard', (req, res) => {
  try {
    const sessionId = req.params.id;
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses    = db.prepare('SELECT * FROM Responses WHERE session_id=?').all(sessionId);

    const leaderboard = participants.map(p => {
      const pRes     = responses.filter(r => r.participant_id === p.id);
      const total    = pRes.reduce((s, r) => s + (r.score || 0), 0);
      const correct  = pRes.filter(r => r.is_correct === 1 || r.is_correct === 'TRUE').length;
      return { id: p.id, name: p.name, playerCode: p.player_code, totalScore: total, correctCount: correct, totalAnswered: pRes.length };
    }).sort((a, b) => b.totalScore - a.totalScore);

    leaderboard.forEach((p, i) => { p.rank = i + 1; });
    res.json({ success: true, data: leaderboard });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/participants ─────────────────────
router.get('/:id/participants', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM Participants WHERE session_id=? ORDER BY joined_at ASC').all(req.params.id);
    res.json({ success: true, data: rows.map(p => ({ id: p.id, name: p.name, playerCode: p.player_code, avatar: p.avatar, joinedAt: p.joined_at })) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/questions/:qid/results ──────────
router.get('/:id/questions/:qid/results', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses    = db.prepare('SELECT * FROM Responses WHERE session_id=? AND question_id=?').all(sessionId, questionId);

    const total    = participants.length;
    const answered = responses.length;
    const correct  = responses.filter(r => r.is_correct === 1).length;

    const answerCounts = {};
    responses.forEach(r => {
      const ans = r.answer || 'ไม่มีคำตอบ';
      answerCounts[ans] = (answerCounts[ans] || 0) + 1;
    });

    res.json({ success: true, data: { total, answered, correct, answerCounts, accuracy: answered ? Math.round(correct / answered * 100) : 0 } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- GET /api/sessions/:id/questions/:qid/answers (per-user answers)
router.get('/:id/questions/:qid/answers', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const responses = db.prepare(
      'SELECT * FROM Responses WHERE session_id=? AND question_id=? ORDER BY submitted_at ASC'
    ).all(sessionId, questionId);
    const participants = db.prepare(
      'SELECT id, name, player_code FROM Participants WHERE session_id=?'
    ).all(sessionId);
    const pMap = new Map(participants.map(p => [p.id, p]));
    const data = responses.map(r => {
      const p = pMap.get(r.participant_id) || {};
      return {
        participantId: r.participant_id,
        name: p.name || 'Unknown',
        playerCode: p.player_code || '',
        answer: r.answer,
        isCorrect: r.is_correct === 1 || r.is_correct === 'TRUE' || r.is_correct === true,
        submittedAt: r.submitted_at || ''
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/questions/:qid/poll ─────────────
router.get('/:id/questions/:qid/poll', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const data = db.prepare('SELECT * FROM PollResults WHERE session_id=? AND question_id=?').all(sessionId, questionId);
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── GET /api/sessions/:id/report ──────────────────────────
router.get('/:id/report', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session   = db.prepare('SELECT * FROM Sessions WHERE id=?').get(sessionId);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    const quiz         = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(session.quiz_id);
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses    = db.prepare('SELECT * FROM Responses WHERE session_id=?').all(sessionId);
    const questions    = db.prepare('SELECT * FROM Questions WHERE quiz_id=? ORDER BY order_num').all(session.quiz_id);

    // Build leaderboard
    const leaderboard = participants.map(p => {
      const pRes   = responses.filter(r => r.participant_id === p.id);
      const total  = pRes.reduce((s, r) => s + (r.score || 0), 0);
      const correct = pRes.filter(r => r.is_correct === 1).length;
      return { id: p.id, name: p.name, totalScore: total, correctCount: correct };
    }).sort((a, b) => b.totalScore - a.totalScore);

    const questionSummary = questions.map(q => {
      const qRes    = responses.filter(r => r.question_id === q.id);
      const correct = qRes.filter(r => r.is_correct === 1).length;
      return { id: q.id, text: q.text, answered: qRes.length, correct, accuracy: qRes.length ? Math.round(correct / qRes.length * 100) : 0 };
    });

    res.json({ success: true, data: { session, quizTitle: quiz ? quiz.title : '', participantCount: participants.length, leaderboard, questionSummary } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
