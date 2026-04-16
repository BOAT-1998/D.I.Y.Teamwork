// ============================================================
// routes/sessions.js - Live Session management
// ============================================================
const express = require('express');
const { db } = require('../db');
const QRCode = require('qrcode');

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
  const words = ['STAR', 'HERO', 'LION', 'WOLF', 'HAWK', 'BOLT', 'FIRE', 'JADE', 'RUBY', 'GOLD'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(10 + Math.random() * 90)}`;
}

function tryParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function normalizeEmployeeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeForPlayer(question, showAnswer = false) {
  const options = tryParseJSON(question.options_json, []);
  return {
    ...question,
    options: Array.isArray(options)
      ? options.map((option) => ({
          text: option.text,
          ...(showAnswer ? { is_correct: option.is_correct } : {})
        }))
      : []
  };
}

function findExistingParticipant(sessionId, playerName, employeeCode) {
  if (employeeCode) {
    const existingByCode = db.prepare(
      'SELECT * FROM Participants WHERE session_id=? AND upper(trim(employee_code))=?'
    ).get(sessionId, employeeCode);
    if (existingByCode) return existingByCode;
  }

  return db.prepare(
    'SELECT * FROM Participants WHERE session_id=? AND lower(name)=lower(?)'
  ).get(sessionId, playerName);
}

function findRosterEmployee(employeeCode) {
  if (!employeeCode) return null;
  return db.prepare(
    'SELECT employee_code, employee_name, branch_code FROM EmployeeRoster WHERE employee_code=?'
  ).get(employeeCode);
}

router.get('/qr', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, error: 'text query is required' });
    }

    const requestedSize = parseInt(req.query.size, 10);
    const size = Number.isFinite(requestedSize)
      ? Math.max(120, Math.min(1024, requestedSize))
      : 256;

    const png = await QRCode.toBuffer(text, {
      type: 'png',
      width: size,
      margin: 1,
      color: { dark: '#0f172aff', light: '#ffffffff' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/history', (req, res) => {
  try {
    const hostId = req.query.hostId;
    let sessions;

    if (hostId) {
      sessions = db.prepare(`
        SELECT s.*, q.title as quizTitle
        FROM Sessions s
        LEFT JOIN Quizzes q ON s.quiz_id=q.id
        WHERE s.host_id=?
        ORDER BY s.started_at DESC
      `).all(hostId);
    } else {
      sessions = db.prepare(`
        SELECT s.*, q.title as quizTitle
        FROM Sessions s
        LEFT JOIN Quizzes q ON s.quiz_id=q.id
        ORDER BY s.started_at DESC
      `).all();
    }

    res.json({ success: true, data: sessions });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/history', (req, res) => {
  try {
    db.prepare("DELETE FROM Sessions WHERE status='ended'").run();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

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

router.post('/start', (req, res) => {
  try {
    const { quizId, hostId } = req.body;
    if (!quizId) return res.json({ success: false, error: 'quizId required' });

    const host = hostId || 'admin';
    db.prepare(`
      UPDATE Sessions
      SET status='ended', ended_at=?
      WHERE host_id=? AND status IN ('active','waiting')
    `).run(new Date().toISOString(), host);

    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(quizId);
    if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

    const pin = generatePIN();
    const sessionId = generateId('SS');
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO Sessions (id,quiz_id,pin,host_id,status,current_q_index,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(sessionId, quizId, pin, host, 'waiting', 0, now, '');

    res.json({ success: true, sessionId, pin, quizTitle: quiz.title });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/validate-pin/:pin', (req, res) => {
  const pinNum = parseInt(String(req.params.pin).trim(), 10);
  const session = db.prepare(
    "SELECT * FROM Sessions WHERE CAST(pin AS INTEGER)=? AND status IN ('waiting','active')"
  ).get(pinNum);

  if (!session) {
    return res.json({ success: false, error: 'ไม่พบ Session หรือ Session นี้จบแล้ว' });
  }
  if (session.status === 'active') {
    return res.json({ success: false, error: 'Session นี้เริ่มแล้ว กรุณารอ Session ใหม่' });
  }

  res.json({ success: true, sessionId: session.id });
});

router.post('/join', (req, res) => {
  try {
    const { pin, playerName, avatar, employeeCode } = req.body;
    if (!pin || !playerName) {
      return res.json({ success: false, error: 'PIN and name required' });
    }

    const reqEmpCodeSetting = db.prepare("SELECT value FROM Settings WHERE key='require_employee_code'").get();
    const requireEmployeeCode = reqEmpCodeSetting ? reqEmpCodeSetting.value !== 'false' : true;

    const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
    if (requireEmployeeCode && !normalizedEmployeeCode) {
      return res.json({ success: false, error: 'Employee code required' });
    }

    const pinNum = parseInt(String(pin).trim(), 10);
    const session = db.prepare(
      "SELECT * FROM Sessions WHERE CAST(pin AS INTEGER)=? AND status IN ('waiting','active')"
    ).get(pinNum);

    if (!session) {
      return res.json({ success: false, error: 'Session not found or already ended' });
    }

    const existing = findExistingParticipant(session.id, playerName, normalizedEmployeeCode);
    if (session.status === 'active') {
      if (!existing) {
        return res.json({ success: false, error: 'Session นี้เริ่มแล้ว กรุณารอ Session ใหม่' });
      }
      return res.json({
        success: true,
        participantId: existing.id,
        sessionId: session.id,
        rejoined: true
      });
    }

    if (existing) {
      return res.json({
        success: true,
        participantId: existing.id,
        sessionId: session.id,
        rejoined: true
      });
    }

    const maxParticipantsRow = db.prepare(
      "SELECT value FROM Settings WHERE key='max_participants'"
    ).get();
    const maxParticipants = parseInt(maxParticipantsRow ? maxParticipantsRow.value : '0', 10);
    if (maxParticipants > 0) {
      const currentCount = db.prepare(
        'SELECT COUNT(*) as c FROM Participants WHERE session_id=?'
      ).get(session.id).c;
      if (currentCount >= maxParticipants) {
        return res.json({ success: false, error: 'ขออภัย จำนวนคนเต็มแล้ว' });
      }
    }

    const rosterEmployee = findRosterEmployee(normalizedEmployeeCode);
    const participantId = generateId('PT');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO Participants
      (id,session_id,name,player_code,avatar,employee_code,branch_code,joined_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      participantId,
      session.id,
      playerName,
      generatePlayerCode(),
      avatar || '👤',
      normalizedEmployeeCode,
      rosterEmployee?.branch_code || '',
      now
    );

    res.json({
      success: true,
      participantId,
      sessionId: session.id,
      rejoined: false,
      matchedRoster: !!rosterEmployee
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/live', (req, res) => {
  try {
    const { participantId } = req.query;
    const session = db.prepare('SELECT * FROM Sessions WHERE id=?').get(req.params.id);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(session.quiz_id);
    const questions = db.prepare(
      'SELECT * FROM Questions WHERE quiz_id=? ORDER BY order_num ASC'
    ).all(session.quiz_id);

    const currentQuestionIndex = Number(session.current_q_index) || 0;
    const currentQuestion = questions[currentQuestionIndex] || null;
    const participantCount = db.prepare(
      'SELECT COUNT(*) as c FROM Participants WHERE session_id=?'
    ).get(session.id).c;
    const showAnswer = !!session.show_answer;

    let answered = false;
    if (participantId && currentQuestion) {
      answered = !!db.prepare(
        'SELECT id FROM Responses WHERE session_id=? AND participant_id=? AND question_id=?'
      ).get(session.id, participantId, currentQuestion.id);
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        pin: String(session.pin),
        quizTitle: quiz ? quiz.title : '',
        currentQuestionIndex,
        totalQuestions: questions.length,
        currentQuestion: currentQuestion
          ? sanitizeForPlayer(currentQuestion, showAnswer)
          : null,
        participantCount,
        answered,
        showAnswer,
        isLastQuestion: currentQuestionIndex >= questions.length - 1,
        webAppUrl: `http://localhost:${process.env.PORT || 3000}`
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/:id/reveal', (req, res) => {
  try {
    db.prepare('UPDATE Sessions SET show_answer=1 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/:id/next', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM Sessions WHERE id=?').get(req.params.id);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    if (session.status === 'waiting') {
      db.prepare("UPDATE Sessions SET status='active', show_answer=0 WHERE id=?").run(req.params.id);
      return res.json({ success: true, newIndex: 0, isFirstQuestion: true });
    }

    const newIndex = (Number(session.current_q_index) || 0) + 1;
    db.prepare('UPDATE Sessions SET current_q_index=?, show_answer=0 WHERE id=?')
      .run(newIndex, req.params.id);

    res.json({ success: true, newIndex, isFirstQuestion: false });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/:id/end', (req, res) => {
  try {
    db.prepare("UPDATE Sessions SET status='ended', ended_at=? WHERE id=?")
      .run(new Date().toISOString(), req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/:id/answer', (req, res) => {
  try {
    const { participantId, questionId, answer } = req.body;
    const sessionId = req.params.id;

    const existing = db.prepare(
      'SELECT id FROM Responses WHERE session_id=? AND participant_id=? AND question_id=?'
    ).get(sessionId, participantId, questionId);
    if (existing) {
      return res.json({ success: false, error: 'Already answered' });
    }

    const question = db.prepare('SELECT * FROM Questions WHERE id=?').get(questionId);
    if (!question) return res.json({ success: false, error: 'Question not found' });

    const options = tryParseJSON(question.options_json, []);
    const points = Number(question.points) || 10;
    const questionType = question.type;
    let isCorrect = false;
    let score = 0;

    if (questionType === 'multiple_choice' || questionType === 'true_false') {
      const correctOption = options.find(
        (option) =>
          option.is_correct === true ||
          option.is_correct === 'true' ||
          option.is_correct === 'TRUE'
      );
      isCorrect = !!(correctOption && correctOption.text === answer);
      score = isCorrect ? points : 0;
    } else if (questionType === 'checkbox') {
      const correctOptions = options
        .filter(
          (option) =>
            option.is_correct === true ||
            option.is_correct === 'true' ||
            option.is_correct === 'TRUE'
        )
        .map((option) => option.text)
        .sort();
      const givenAnswers = Array.isArray(answer) ? [...answer].sort() : [answer];
      isCorrect = JSON.stringify(correctOptions) === JSON.stringify(givenAnswers);
      score = isCorrect ? points : 0;
    }

    const id = generateId('RS');
    const now = new Date().toISOString();
    const answerValue = Array.isArray(answer) ? JSON.stringify(answer) : answer;

    db.prepare(`
      INSERT INTO Responses
      (id,session_id,participant_id,question_id,answer,is_correct,score,time_taken,submitted_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      id,
      sessionId,
      participantId,
      questionId,
      answerValue,
      isCorrect ? 1 : 0,
      score,
      0,
      now
    );

    if (questionType === 'poll' || questionType === 'word_cloud') {
      const answers = Array.isArray(answer) ? answer : [answer];
      answers.forEach((item) => {
        const existingPoll = db.prepare(
          'SELECT id FROM PollResults WHERE session_id=? AND question_id=? AND answer_text=?'
        ).get(sessionId, questionId, item);
        if (existingPoll) {
          db.prepare('UPDATE PollResults SET vote_count=vote_count+1 WHERE id=?')
            .run(existingPoll.id);
        } else {
          db.prepare(`
            INSERT INTO PollResults
            (id,session_id,question_id,answer_text,vote_count)
            VALUES (?,?,?,?,?)
          `).run(generateId('PL'), sessionId, questionId, item, 1);
        }
      });
    }

    res.json({ success: true, isCorrect, score, points });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/leaderboard', (req, res) => {
  try {
    const sessionId = req.params.id;
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses = db.prepare('SELECT * FROM Responses WHERE session_id=?').all(sessionId);

    const leaderboard = participants
      .map((participant) => {
        const participantResponses = responses.filter(
          (response) => response.participant_id === participant.id
        );
        const totalScore = participantResponses.reduce(
          (sum, response) => sum + (response.score || 0),
          0
        );
        const correctCount = participantResponses.filter(
          (response) => response.is_correct === 1 || response.is_correct === 'TRUE'
        ).length;

        return {
          id: participant.id,
          name: participant.name,
          playerCode: participant.player_code,
          employeeCode: participant.employee_code || '',
          totalScore,
          correctCount,
          totalAnswered: participantResponses.length
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    leaderboard.forEach((player, index) => {
      player.rank = index + 1;
    });

    res.json({ success: true, data: leaderboard });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/participants', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM Participants WHERE session_id=? ORDER BY joined_at ASC'
    ).all(req.params.id);

    res.json({
      success: true,
      data: rows.map((participant) => ({
        id: participant.id,
        name: participant.name,
        playerCode: participant.player_code,
        employeeCode: participant.employee_code || '',
        branchCode: participant.branch_code || '',
        avatar: participant.avatar,
        joinedAt: participant.joined_at
      }))
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/attendance', (req, res) => {
  try {
    const sessionId = req.params.id;
    const rosterRows = db.prepare(
      'SELECT employee_code, employee_name, branch_code, imported_at FROM EmployeeRoster ORDER BY employee_code ASC'
    ).all();
    const participants = db.prepare(
      'SELECT * FROM Participants WHERE session_id=? ORDER BY joined_at ASC'
    ).all(sessionId);

    const participantByCode = new Map();
    participants.forEach((participant) => {
      const employeeCode = normalizeEmployeeCode(participant.employee_code);
      if (employeeCode && !participantByCode.has(employeeCode)) {
        participantByCode.set(employeeCode, participant);
      }
    });

    const employees = rosterRows.map((employee) => {
      const matchedParticipant = participantByCode.get(employee.employee_code) || null;
      return {
        employeeCode: employee.employee_code,
        employeeName: employee.employee_name,
        branchCode: employee.branch_code,
        joined: !!matchedParticipant,
        participantId: matchedParticipant?.id || '',
        participantName: matchedParticipant?.name || '',
        avatar: matchedParticipant?.avatar || '',
        joinedAt: matchedParticipant?.joined_at || ''
      };
    });

    const unknownParticipants = participants
      .filter((participant) => !participantByCode.has(normalizeEmployeeCode(participant.employee_code)) || !rosterRows.find((employee) => employee.employee_code === normalizeEmployeeCode(participant.employee_code)))
      .map((participant) => ({
        id: participant.id,
        name: participant.name,
        employeeCode: participant.employee_code || '',
        branchCode: participant.branch_code || '',
        avatar: participant.avatar || '',
        joinedAt: participant.joined_at || ''
      }));

    const joinedCount = employees.filter((employee) => employee.joined).length;
    const rosterCount = employees.length;

    res.json({
      success: true,
      data: {
        rosterCount,
        joinedCount,
        missingCount: Math.max(0, rosterCount - joinedCount),
        unknownCount: unknownParticipants.length,
        latestImportAt: rosterRows[0]?.imported_at || null,
        employees,
        unknownParticipants
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/questions/:qid/results', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses = db.prepare(
      'SELECT * FROM Responses WHERE session_id=? AND question_id=?'
    ).all(sessionId, questionId);

    const total = participants.length;
    const answered = responses.length;
    const correct = responses.filter((response) => response.is_correct === 1).length;

    const answerCounts = {};
    responses.forEach((response) => {
      const answerText = response.answer || 'ไม่มีคำตอบ';
      answerCounts[answerText] = (answerCounts[answerText] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        total,
        answered,
        correct,
        answerCounts,
        accuracy: answered ? Math.round((correct / answered) * 100) : 0
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/questions/:qid/answers', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const responses = db.prepare(
      'SELECT * FROM Responses WHERE session_id=? AND question_id=? ORDER BY submitted_at ASC'
    ).all(sessionId, questionId);
    const participants = db.prepare(
      'SELECT id, name, player_code, employee_code FROM Participants WHERE session_id=?'
    ).all(sessionId);
    const participantMap = new Map(participants.map((participant) => [participant.id, participant]));

    const data = responses.map((response) => {
      const participant = participantMap.get(response.participant_id) || {};
      return {
        participantId: response.participant_id,
        name: participant.name || 'Unknown',
        playerCode: participant.player_code || '',
        employeeCode: participant.employee_code || '',
        answer: response.answer,
        isCorrect:
          response.is_correct === 1 ||
          response.is_correct === 'TRUE' ||
          response.is_correct === true,
        submittedAt: response.submitted_at || ''
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/questions/:qid/poll', (req, res) => {
  try {
    const { id: sessionId, qid: questionId } = req.params;
    const data = db.prepare(
      'SELECT * FROM PollResults WHERE session_id=? AND question_id=?'
    ).all(sessionId, questionId);
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/:id/report', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = db.prepare('SELECT * FROM Sessions WHERE id=?').get(sessionId);
    if (!session) return res.json({ success: false, error: 'Session not found' });

    const quiz = db.prepare('SELECT * FROM Quizzes WHERE id=?').get(session.quiz_id);
    const participants = db.prepare('SELECT * FROM Participants WHERE session_id=?').all(sessionId);
    const responses = db.prepare('SELECT * FROM Responses WHERE session_id=?').all(sessionId);
    const questions = db.prepare(
      'SELECT * FROM Questions WHERE quiz_id=? ORDER BY order_num'
    ).all(session.quiz_id);
    const participantCount = participants.length;
    const textTypes = new Set(['word_cloud', 'open_text', 'short_answer', 'q_and_a']);
    const wordCloudMap = new Map();
    const textUserSet = new Set();
    let textMessageCount = 0;

    const leaderboard = participants
      .map((participant) => {
        const participantResponses = responses.filter(
          (response) => response.participant_id === participant.id
        );
        const totalScore = participantResponses.reduce(
          (sum, response) => sum + (response.score || 0),
          0
        );
        const correctCount = participantResponses.filter(
          (response) => response.is_correct === 1
        ).length;
        return {
          id: participant.id,
          name: participant.name,
          totalScore,
          correctCount
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    const questionSummary = questions.map((question) => {
      const questionResponses = responses.filter(
        (response) => response.question_id === question.id
      );
      const correct = questionResponses.filter((response) => response.is_correct === 1).length;
      const answered = questionResponses.length;
      const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
      const isTextType = textTypes.has(question.type);
      const textSubmitters = isTextType ? answered : 0;
      const textSubmitRate = isTextType && participantCount
        ? Math.round((answered / participantCount) * 100)
        : 0;
      const chartValue = isTextType ? textSubmitRate : accuracy;

      if (isTextType) {
        questionResponses.forEach((response) => {
          const raw = String(response.answer || '').trim();
          if (!raw) return;
          textMessageCount += 1;
          textUserSet.add(response.participant_id);

          const normalized = raw.replace(/\s+/g, ' ').trim();
          if (!normalized) return;
          wordCloudMap.set(normalized, (wordCloudMap.get(normalized) || 0) + 1);
        });
      }

      return {
        id: question.id,
        order_num: question.order_num,
        type: question.type,
        text: question.text,
        answered,
        correct,
        accuracy,
        isTextType,
        textSubmitters,
        textSubmitRate,
        chartValue
      };
    });

    const wordCloudData = Array.from(wordCloudMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([text, count]) => ({ text, count }));

    res.json({
      success: true,
      data: {
        session,
        quizTitle: quiz ? quiz.title : '',
        participantCount,
        leaderboard,
        questionSummary,
        wordCloudData,
        textMessageCount,
        textUsersCount: textUserSet.size
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
