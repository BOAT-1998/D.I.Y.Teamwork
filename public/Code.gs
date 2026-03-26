// ============================================================
// D.I.Y. Teamwork - Google Apps Script Full Stack
// Code.gs - Main Entry Point & Router
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const SPREADSHEET_ID = '1FV6mF1dl4b5s8a_WY33EcGfNfFz8fP6oN90ef_kd5hg';
const DRIVE_FOLDER_ID = '1Dxj9vxZdbFmR6wpD1dImPG25K9gUT5WR';
const APP_VERSION    = '1.0.0';
const APP_NAME       = 'D.I.Y. Teamwork';

// ── ENTRY POINT ─────────────────────────────────────────────
/**
 * doGet() — รับทุก HTTP GET request แล้ว route ไปหน้าที่ถูกต้อง
 * Query params:
 *   ?page=admin|host|player|presenter|login (default: login)
 *   ?pin=XXXXXX  (สำหรับ player เข้าด้วย PIN)
 */
function doGet(e) {
  // Guard: e อาจเป็น undefined เมื่อ run จาก Editor โดยตรง
  const params = (e && e.parameter) ? e.parameter : {};
  const page = (params.page || 'login').toLowerCase();
  const pin  = params.pin  || '';

  // สร้าง template ตาม page
  let tmpl;
  try {
    switch (page) {
      case 'admin':     tmpl = HtmlService.createTemplateFromFile('Admin');     break;
      case 'host':      tmpl = HtmlService.createTemplateFromFile('Host');      break;
      case 'presenter': tmpl = HtmlService.createTemplateFromFile('Presenter'); break;
      case 'player':
        tmpl = HtmlService.createTemplateFromFile('Player');
        tmpl.pin = pin;
        break;
      default:
        tmpl = HtmlService.createTemplateFromFile('Login');
    }
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h2>Error loading page: ${page}</h2><pre>${err}</pre>`
    );
  }

  tmpl.appName    = APP_NAME;
  tmpl.appVersion = APP_VERSION;

  return tmpl.evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * include() — ใช้ใน HTML template เพื่อดึงไฟล์อื่นมารวม
 * ตัวอย่าง: <?!= include('_styles') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── DASHBOARD DATA ───────────────────────────────────────────
/**
 * getDashboardData() — ดึงข้อมูลสรุปสำหรับ Admin Dashboard
 */
function getDashboardData() {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const quizzes = getSheetData(ss, 'Quizzes');
    const sessions= getSheetData(ss, 'Sessions');
    const participants = getSheetData(ss, 'Participants');
    const responses    = getSheetData(ss, 'Responses');

    // นับ sessions ที่ active / completed
    const activeSessions    = sessions.filter(s => s.status === 'active').length;
    const completedSessions = sessions.filter(s => s.status === 'ended').length;

    // คำนวณ average score
    const scores     = responses.filter(r => r.score !== '').map(r => Number(r.score) || 0);
    const avgScore   = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Accuracy rate
    const correct    = responses.filter(r => r.is_correct === 'TRUE' || r.is_correct === true).length;
    const accuracy   = responses.length ? Math.round((correct / responses.length) * 100) : 0;

    return {
      success: true,
      data: {
        totalQuizzes:       quizzes.length,
        totalSessions:      sessions.length,
        activeSessions,
        completedSessions,
        totalParticipants:  participants.length,
        totalResponses:     responses.length,
        averageScore:       avgScore,
        accuracyRate:       accuracy,
        recentSessions:     sessions.slice(-5).reverse()
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── QUIZ MANAGEMENT ──────────────────────────────────────────

/** getQuizList() — ดึงรายการ Quiz ทั้งหมด */
function getQuizList() {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const quizzes = getSheetData(ss, 'Quizzes');
    const questions = getSheetData(ss, 'Questions');

    // นับจำนวนข้อสำหรับแต่ละ quiz
    const quizzesWithCount = quizzes.map(q => ({
      ...q,
      questionCount: questions.filter(qn => qn.quiz_id === q.id).length
    }));

    return { success: true, data: quizzesWithCount };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getQuizDetail() — ดึงรายละเอียด Quiz รวม Questions */
function getQuizDetail(quizId) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const quizzes   = getSheetData(ss, 'Quizzes');
    const questions = getSheetData(ss, 'Questions');

    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz) return { success: false, error: 'Quiz not found' };

    // ดึง Questions ที่เป็นของ quiz นี้ + parse options_json
    const quizQuestions = questions
      .filter(q => q.quiz_id === quizId)
      .sort((a, b) => Number(a.order_num) - Number(b.order_num))
      .map(q => ({
        ...q,
        options: tryParseJSON(q.options_json, [])
      }));

    return {
      success: true,
      data: { ...quiz, questions: quizQuestions }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** createQuiz() — สร้าง Quiz ใหม่ */
function createQuiz(quizData) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Quizzes');

    const id  = generateId('QZ');
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      quizData.title        || 'Untitled Quiz',
      quizData.description  || '',
      quizData.category     || 'General',
      quizData.cover_image  || '',
      quizData.host_id      || 'admin',
      JSON.stringify(quizData.settings || {}),
      now
    ]);

    return { success: true, id };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** updateQuiz() — อัปเดต Quiz */
function updateQuiz(quizId, quizData) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Quizzes');
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === quizId) {
        const row = i + 1;
        if (quizData.title)       sheet.getRange(row, headers.indexOf('title') + 1).setValue(quizData.title);
        if (quizData.description) sheet.getRange(row, headers.indexOf('description') + 1).setValue(quizData.description);
        if (quizData.category)    sheet.getRange(row, headers.indexOf('category') + 1).setValue(quizData.category);
        if (quizData.settings)    sheet.getRange(row, headers.indexOf('settings_json') + 1).setValue(JSON.stringify(quizData.settings));
        return { success: true };
      }
    }
    return { success: false, error: 'Quiz not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** deleteQuiz() — ลบ Quiz และ Questions ที่เกี่ยวข้อง */
function deleteQuiz(quizId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    deleteRowById(ss, 'Quizzes', quizId);

    // ลบ questions ที่ quiz_id ตรงกัน
    const qSheet = ss.getSheetByName('Questions');
    const qData  = qSheet.getDataRange().getValues();
    // ลบจากล่างขึ้นบนเพื่อไม่ให้ row index เลื่อน
    for (let i = qData.length - 1; i >= 1; i--) {
      if (qData[i][1] === quizId) qSheet.deleteRow(i + 1);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** saveQuestion() — เพิ่มหรืออัปเดตคำถาม */
function saveQuestion(questionData) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Questions');

    if (questionData.id) {
      // UPDATE
      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === questionData.id) {
          const row = i + 1;
          sheet.getRange(row, 1, 1, headers.length).setValues([[
            questionData.id,
            questionData.quiz_id,
            questionData.type       || 'multiple_choice',
            questionData.text       || '',
            questionData.image_url  || '',
            questionData.time_limit || 30,
            questionData.points     || 10,
            questionData.order_num  || 1,
            JSON.stringify(questionData.options || [])
          ]]);
          return { success: true, id: questionData.id };
        }
      }
    }

    // CREATE
    const id  = generateId('QN');
    const now = new Date().toISOString();
    sheet.appendRow([
      id,
      questionData.quiz_id,
      questionData.type       || 'multiple_choice',
      questionData.text       || '',
      questionData.image_url  || '',
      questionData.time_limit || 30,
      questionData.points     || 10,
      questionData.order_num  || 1,
      JSON.stringify(questionData.options || [])
    ]);

    return { success: true, id };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** deleteQuestion() — ลบคำถาม */
function deleteQuestion(questionId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    deleteRowById(ss, 'Questions', questionId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── LIVE SESSION ─────────────────────────────────────────────

/** startSession() — Host เริ่ม session ใหม่ สร้าง PIN */
function startSession(quizId, hostId) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Sessions');

    // ปิด session เก่าของ host นี้ก่อน (ถ้ามี)
    closePreviousSessionsForHost(ss, hostId);

    const pin = generatePIN();
    const id  = generateId('SS');
    const now = new Date().toISOString();

    sheet.appendRow([id, quizId, pin, hostId, 'waiting', 0, now, '']);

    // อ่าน quiz เพื่อส่ง title กลับ
    const quiz = getQuizDetail(quizId);

    return {
      success: true,
      sessionId: id,
      pin,
      quizTitle: quiz.success ? quiz.data.title : ''
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** joinSession() — Participant เข้า session ด้วย PIN */
function joinSession(pin, playerName) {
  try {
    if (!pin || !playerName) return { success: false, error: 'PIN and name required' };

    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessions = getSheetData(ss, 'Sessions');

    // เทียบ PIN โดย parse เป็น Number ทั้งสองฝั่ง
    // (Sheets อาจเก็บ PIN เป็น Number ทำให้ String compare ล้มเหลว)
    const pinNum = parseInt(String(pin).trim(), 10);

    const session = sessions.find(s => {
      const sPinNum = parseInt(String(s.pin).trim(), 10);
      return sPinNum === pinNum && (s.status === 'waiting' || s.status === 'active');
    });

    if (!session) {
      const allPins = sessions.map(s => String(s.pin).trim() + '(' + s.status + ')').join(', ');
      Logger.log('joinSession: PIN not matched. Looking for: ' + pinNum + ' | Available: ' + allPins);
      return { success: false, error: 'Session not found or already ended' };
    }

    // เช็คชื่อซ้ำใน session นี้
    const participants = getSheetData(ss, 'Participants');
    const existing = participants.find(p => p.session_id === session.id && p.name.toLowerCase() === playerName.toLowerCase());
    if (existing) return { success: true, participantId: existing.id, sessionId: session.id, rejoined: true };

    const pId = generateId('PT');
    const now = new Date().toISOString();
    ss.getSheetByName('Participants').appendRow([pId, session.id, playerName, generatePlayerCode(), now]);

    return { success: true, participantId: pId, sessionId: session.id, rejoined: false };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getLiveSessionData() — Polling: ดึงสถานะ session ปัจจุบัน */
function getLiveSessionData(sessionId, participantId) {
  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessions     = getSheetData(ss, 'Sessions');
    const sessionIdStr = String(sessionId || '').trim();
    const partIdStr    = String(participantId || '').trim();

    const session = sessions.find(s => String(s.id).trim() === sessionIdStr);
    if (!session) return { success: false, error: 'Session not found' };

    const quiz       = getQuizDetail(session.quiz_id);
    const questions  = quiz.success ? quiz.data.questions : [];
    const currentIdx = Number(session.current_q_index) || 0;
    const currentQ   = questions[currentIdx] || null;

    // นับผู้เข้าร่วม — ใช้ sessionIdStr เสมอ (กัน type mismatch)
    const participants = getSheetData(ss, 'Participants')
      .filter(p => String(p.session_id).trim() === sessionIdStr);

    // เช็คว่า participant นี้ตอบข้อนี้ไปแล้วหรือยัง
    let answered = false;
    if (partIdStr && currentQ) {
      const responses = getSheetData(ss, 'Responses');
      answered = responses.some(r =>
        String(r.session_id).trim()     === sessionIdStr &&
        String(r.participant_id).trim() === partIdStr &&
        String(r.question_id).trim()    === String(currentQ.id).trim()
      );
    }

    // ดึง Web App URL เพื่อส่งให้ Presenter แสดง join link
    const webAppUrl = getWebAppUrl();

    return {
      success: true,
      data: {
        sessionId:            sessionIdStr,
        status:               session.status,
        pin:                  String(session.pin).trim(),
        quizTitle:            quiz.success ? quiz.data.title : '',
        currentQuestionIndex: currentIdx,
        totalQuestions:       questions.length,
        currentQuestion:      currentQ ? sanitizeQuestionForPlayer(currentQ) : null,
        participantCount:     participants.length,
        answered,
        isLastQuestion:       currentIdx >= questions.length - 1,
        webAppUrl
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** nextQuestion() — Host กดไปข้อถัดไป
 *  ถ้ายัง 'waiting' → เปลี่ยนเป็น 'active' แต่ index คงเดิม (ข้อแรก = 0)
 *  ถ้า 'active' แล้ว → เลื่อน index +1
 */
function nextQuestion(sessionId) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName('Sessions');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxCol    = headers.indexOf('current_q_index') + 1;
    const statusCol = headers.indexOf('status') + 1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(sessionId).trim()) {
        const currentStatus = data[i][statusCol - 1];
        const currentIdx    = Number(data[i][idxCol - 1]) || 0;

        if (currentStatus === 'waiting') {
          // ข้อแรก: แค่เปลี่ยน status → active, index ยังเป็น 0
          sheet.getRange(i + 1, statusCol).setValue('active');
          return { success: true, newIndex: 0, isFirstQuestion: true };
        } else {
          // ข้อถัดไป: เลื่อน index
          const newIdx = currentIdx + 1;
          sheet.getRange(i + 1, idxCol).setValue(newIdx);
          return { success: true, newIndex: newIdx, isFirstQuestion: false };
        }
      }
    }
    return { success: false, error: 'Session not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** endSession() — จบ session */
function endSession(sessionId) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName('Sessions');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sessionId) {
        sheet.getRange(i + 1, headers.indexOf('status') + 1).setValue('ended');
        sheet.getRange(i + 1, headers.indexOf('ended_at') + 1).setValue(new Date().toISOString());
        return { success: true };
      }
    }
    return { success: false, error: 'Session not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** submitAnswer() — Participant ส่งคำตอบ */
function submitAnswer(sessionId, participantId, questionId, answer) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ตรวจสอบว่าตอบไปแล้วหรือยัง
    const responses = getSheetData(ss, 'Responses');
    const alreadyAnswered = responses.find(r =>
      r.session_id === sessionId &&
      r.participant_id === participantId &&
      r.question_id === questionId
    );
    if (alreadyAnswered) return { success: false, error: 'Already answered' };

    // ดึง question เพื่อตรวจ
    const questions  = getSheetData(ss, 'Questions');
    const question   = questions.find(q => q.id === questionId);
    if (!question) return { success: false, error: 'Question not found' };

    const options  = tryParseJSON(question.options_json, []);
    let isCorrect  = false;
    let score      = 0;
    const points   = Number(question.points) || 10;

    // ตรวจคำตอบตาม type
    const qType = question.type;
    if (qType === 'multiple_choice' || qType === 'true_false') {
      const correctOpt = options.find(o => o.is_correct === true || o.is_correct === 'TRUE');
      isCorrect = correctOpt && correctOpt.text === answer;
      score = isCorrect ? points : 0;
    } else if (qType === 'checkbox') {
      const correctOpts = options.filter(o => o.is_correct === true || o.is_correct === 'TRUE').map(o => o.text).sort();
      const given = Array.isArray(answer) ? answer.sort() : [answer];
      isCorrect = JSON.stringify(correctOpts) === JSON.stringify(given);
      score = isCorrect ? points : 0;
    } else {
      // poll, open_text, word_cloud, rating, q_and_a — no scoring
      isCorrect = false;
      score = 0;
    }

    const id  = generateId('RS');
    const now = new Date().toISOString();
    ss.getSheetByName('Responses').appendRow([
      id, sessionId, participantId, questionId,
      Array.isArray(answer) ? JSON.stringify(answer) : answer,
      isCorrect, score, 0, now
    ]);

    // อัปเดต PollResults ถ้าเป็น poll/word_cloud
    if (qType === 'poll' || qType === 'word_cloud') {
      updatePollResult(ss, sessionId, questionId, answer);
    }

    return { success: true, isCorrect, score, points };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getLeaderboard() — ดึง Leaderboard ของ session */
function getLeaderboard(sessionId) {
  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    const participants = getSheetData(ss, 'Participants').filter(p => p.session_id === sessionId);
    const responses    = getSheetData(ss, 'Responses').filter(r => r.session_id === sessionId);

    const leaderboard = participants.map(p => {
      const pResponses = responses.filter(r => r.participant_id === p.id);
      const totalScore = pResponses.reduce((sum, r) => sum + (Number(r.score) || 0), 0);
      const correct    = pResponses.filter(r => r.is_correct === 'TRUE' || r.is_correct === true).length;
      return {
        id:           p.id,
        name:         p.name,
        playerCode:   p.player_code,
        totalScore,
        correctCount: correct,
        totalAnswered:pResponses.length
      };
    }).sort((a, b) => b.totalScore - a.totalScore);

    // เพิ่ม rank
    leaderboard.forEach((p, i) => { p.rank = i + 1; });

    return { success: true, data: leaderboard };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getPollResults() — ดึงผล Poll/WordCloud real-time */
function getPollResults(sessionId, questionId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pollData = getSheetData(ss, 'PollResults').filter(
      p => p.session_id === sessionId && p.question_id === questionId
    );
    return { success: true, data: pollData };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getQuestionResults() — ดึงผลการตอบทุกคนของข้อนั้น (สำหรับ Host) */
function getQuestionResults(sessionId, questionId) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const responses = getSheetData(ss, 'Responses').filter(
      r => r.session_id === sessionId && r.question_id === questionId
    );
    const participants = getSheetData(ss, 'Participants').filter(p => p.session_id === sessionId);
    const total      = participants.length;
    const answered   = responses.length;
    const correct    = responses.filter(r => r.is_correct === 'TRUE' || r.is_correct === true).length;

    // นับคำตอบแต่ละตัวเลือก
    const answerCounts = {};
    responses.forEach(r => {
      const ans = r.answer || 'No answer';
      answerCounts[ans] = (answerCounts[ans] || 0) + 1;
    });

    return {
      success: true,
      data: { total, answered, correct, answerCounts, accuracy: total ? Math.round(correct / total * 100) : 0 }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── PRESENTER HELPERS ────────────────────────────────────────

/**
 * getParticipants(sessionId) — ดึงรายชื่อผู้เข้าร่วมทั้งหมดใน session
 * ใช้โดย Presenter.html เพื่อแสดงชิปชื่อผู้เข้าร่วมหน้า waiting screen
 */
function getParticipants(sessionId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const participants = getSheetData(ss, 'Participants')
      .filter(p => p.session_id === sessionId)
      .map(p => ({ id: p.id, name: p.name, playerCode: p.player_code, joinedAt: p.joined_at }));
    return { success: true, data: participants };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * getQuestionResults(sessionId, questionId)
 * ดึงสถิติคำตอบของคำถามข้อนั้นใน session
 * ใช้โดย Presenter + Host เพื่อแสดง answer distribution
 */
function getQuestionResults(sessionId, questionId) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessions  = getSheetData(ss, 'Sessions');
    const session   = sessions.find(s => s.id === sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    const participants = getSheetData(ss, 'Participants').filter(p => p.session_id === sessionId);
    const responses    = getSheetData(ss, 'Responses').filter(
      r => r.session_id === sessionId && r.question_id === questionId
    );

    const total   = participants.length;
    const answered = responses.length;
    const correct  = responses.filter(r => r.is_correct === 'TRUE' || r.is_correct === true).length;

    // นับคำตอบแต่ละ option
    const answerCounts = {};
    responses.forEach(r => {
      const ans = r.answer || 'ไม่มีคำตอบ';
      answerCounts[ans] = (answerCounts[ans] || 0) + 1;
    });

    return {
      success: true,
      data: {
        total,
        answered,
        correct,
        answerCounts,
        accuracy: answered ? Math.round(correct / answered * 100) : 0
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── REPORTS ──────────────────────────────────────────────────

/** getReports() — ดึงรายงานสรุปของ session */
function getReports(sessionId) {
  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessions     = getSheetData(ss, 'Sessions');
    const session      = sessions.find(s => s.id === sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    const quiz       = getQuizDetail(session.quiz_id);
    const leaderboard = getLeaderboard(sessionId);
    const participants = getSheetData(ss, 'Participants').filter(p => p.session_id === sessionId);
    const responses    = getSheetData(ss, 'Responses').filter(r => r.session_id === sessionId);

    // สรุปรายคำถาม
    const questions = quiz.success ? quiz.data.questions : [];
    const questionSummary = questions.map(q => {
      const qResponses = responses.filter(r => r.question_id === q.id);
      const correct    = qResponses.filter(r => r.is_correct === 'TRUE' || r.is_correct === true).length;
      return {
        id:       q.id,
        text:     q.text,
        answered: qResponses.length,
        correct,
        accuracy: qResponses.length ? Math.round(correct / qResponses.length * 100) : 0
      };
    });

    return {
      success: true,
      data: {
        session,
        quizTitle:       quiz.success ? quiz.data.title : '',
        participantCount:participants.length,
        leaderboard:     leaderboard.data || [],
        questionSummary
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** getSessionHistory() — ดึง session ทั้งหมดของ host */
function getSessionHistory(hostId) {
  try {
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessions = getSheetData(ss, 'Sessions');
    const quizzes  = getSheetData(ss, 'Quizzes');

    const filtered = sessions
      .filter(s => !hostId || s.host_id === hostId)
      .map(s => {
        const quiz = quizzes.find(q => q.id === s.quiz_id);
        return { ...s, quizTitle: quiz ? quiz.title : 'Unknown' };
      })
      .reverse();

    return { success: true, data: filtered };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── SETTINGS ─────────────────────────────────────────────────

/** getSettings() — ดึง Settings ทั้งหมด */
function getSettings() {
  try {
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    const data = getSheetData(ss, 'Settings');
    const settings = {};
    data.forEach(row => { settings[row.key] = row.value; });
    return { success: true, data: settings };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** saveSettings() — บันทึก Settings */
function saveSettings(settingsObj) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Settings');
    const data  = sheet.getDataRange().getValues();
    const now   = new Date().toISOString();

    Object.entries(settingsObj).forEach(([key, value]) => {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(value);
          sheet.getRange(i + 1, 3).setValue(now);
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, value, now]);
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── MUSIC / DRIVE ─────────────────────────────────────────────

/** getMusicFiles() — ดึงรายการไฟล์ MP3 จาก Google Drive folder */
function getMusicFiles() {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const files  = folder.getFiles();
    const result = [];

    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      // กรองเฉพาะ audio files
      if (mimeType.startsWith('audio/') || file.getName().match(/\.(mp3|wav|ogg|m4a)$/i)) {
        result.push({
          id:       file.getId(),
          name:     file.getName(),
          url:      `https://drive.google.com/uc?export=download&id=${file.getId()}`,
          mimeType
        });
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/** uploadImageToDrive() — อัปโหลดรูปจาก base64 ขึ้น Drive */
function uploadImageToDrive(base64Data, fileName, mimeType) {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const blob   = Utilities.newBlob(
      Utilities.base64Decode(base64Data.replace(/^data:[^;]+;base64,/, '')),
      mimeType || 'image/png',
      fileName || `image_${Date.now()}.png`
    );
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      success: true,
      fileId:  file.getId(),
      url:     `https://drive.google.com/uc?export=view&id=${file.getId()}`
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── SETUP ────────────────────────────────────────────────────

/**
 * setupSpreadsheet() — เรียกครั้งแรกเพื่อสร้าง Sheets และ Headers
 * *** RUN ฟังก์ชันนี้ใน Apps Script Editor ก่อน deploy ***
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const schemas = {
    Users:        ['id','name','email','role','password_hash','created_at'],
    Quizzes:      ['id','title','description','category','cover_image','host_id','settings_json','created_at'],
    Questions:    ['id','quiz_id','type','text','image_url','time_limit','points','order_num','options_json'],
    Sessions:     ['id','quiz_id','pin','host_id','status','current_q_index','started_at','ended_at'],
    Participants: ['id','session_id','name','player_code','joined_at'],
    Responses:    ['id','session_id','participant_id','question_id','answer','is_correct','score','time_taken','submitted_at'],
    PollResults:  ['id','session_id','question_id','answer_text','vote_count'],
    Settings:     ['key','value','updated_at']
  };

  Object.entries(schemas).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    // ตรวจว่ายังไม่มี header
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setBackground('#1a472a').setFontColor('#ffffff').setFontWeight('bold');
    }
  });

  // ใส่ข้อมูลตัวอย่าง
  insertSampleData(ss);

  Logger.log('✅ Setup complete! Sheets created with sample data.');
  SpreadsheetApp.getUi().alert('Setup Complete! ✅\nSheets and sample data created successfully.');
}

/** insertSampleData() — ใส่ข้อมูลตัวอย่างเพื่อทดสอบ */
function insertSampleData(ss) {
  const now = new Date().toISOString();

  // Sample Quiz
  const qzSheet = ss.getSheetByName('Quizzes');
  if (qzSheet.getLastRow() <= 1) {
    qzSheet.appendRow(['QZ001', 'General Knowledge Quiz', 'ทดสอบความรู้ทั่วไป', 'General', '', 'admin',
      JSON.stringify({ shuffle_questions: false, shuffle_options: false, show_answer: true, allow_retry: false }), now]);
    qzSheet.appendRow(['QZ002', 'Team Building Poll', 'Poll สำหรับทีม', 'Poll', '', 'admin',
      JSON.stringify({ shuffle_questions: false, shuffle_options: false, show_answer: false, allow_retry: false }), now]);
  }

  // Sample Questions
  const qnSheet = ss.getSheetByName('Questions');
  if (qnSheet.getLastRow() <= 1) {
    qnSheet.appendRow(['QN001','QZ001','multiple_choice','กรุงเทพมหานครเป็นเมืองหลวงของประเทศใด?','',30,10,1,
      JSON.stringify([{text:'ประเทศไทย',is_correct:true},{text:'เวียดนาม',is_correct:false},{text:'มาเลเซีย',is_correct:false},{text:'ลาว',is_correct:false}])]);
    qnSheet.appendRow(['QN002','QZ001','true_false','โลกหมุนรอบดวงอาทิตย์ใช่หรือไม่?','',20,10,2,
      JSON.stringify([{text:'True',is_correct:true},{text:'False',is_correct:false}])]);
    qnSheet.appendRow(['QN003','QZ001','multiple_choice','1 + 1 = ?','',15,5,3,
      JSON.stringify([{text:'1',is_correct:false},{text:'2',is_correct:true},{text:'3',is_correct:false},{text:'11',is_correct:false}])]);
    qnSheet.appendRow(['QN004','QZ002','poll','คุณชอบกิจกรรม Team Building แบบไหนมากที่สุด?','',0,0,1,
      JSON.stringify([{text:'เกมกลางแจ้ง'},{text:'Workshop สร้างสรรค์'},{text:'อาหารมื้อพิเศษ'},{text:'Online Activity'}])]);
    qnSheet.appendRow(['QN005','QZ002','word_cloud','คำที่นึกถึงเมื่อพูดถึง "ทีมที่ดี" คือ?','',0,0,2,
      JSON.stringify([])]);
  }

  // Sample Settings
  const stSheet = ss.getSheetByName('Settings');
  if (stSheet.getLastRow() <= 1) {
    const defaults = [
      ['app_name', APP_NAME],
      ['app_color', '#10b981'],
      ['app_logo', ''],
      ['default_time_limit', '30'],
      ['default_points', '10'],
      ['music_enabled', 'true'],
      ['music_file_id', ''],
      ['leaderboard_enabled', 'true'],
      ['admin_password', 'admin1234'],
    ];
    defaults.forEach(([k, v]) => stSheet.appendRow([k, v, now]));
  }
}