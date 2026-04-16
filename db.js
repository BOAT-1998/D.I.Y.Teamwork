// ============================================================
// db.js - SQLite Database using sql.js (pure WASM, no native compile)
// ============================================================
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'db.sqlite');

let _db = null;
let _SQL = null;
let _txDepth = 0;

function save(force = false) {
  if (!_db) return;
  if (!force && _txDepth > 0) return;
  fs.writeFileSync(dbPath, Buffer.from(_db.export()));
}

async function initDB() {
  _SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    _db = new _SQL.Database(fileBuffer);
  } else {
    _db = new _SQL.Database();
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS Quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'General',
      cover_image TEXT DEFAULT '',
      host_id TEXT DEFAULT 'admin',
      settings_json TEXT DEFAULT '{}',
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS Questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      type TEXT DEFAULT 'multiple_choice',
      text TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      time_limit INTEGER DEFAULT 30,
      points INTEGER DEFAULT 10,
      order_num INTEGER DEFAULT 1,
      options_json TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS Sessions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      pin TEXT NOT NULL,
      host_id TEXT DEFAULT 'admin',
      status TEXT DEFAULT 'waiting',
      current_q_index INTEGER DEFAULT 0,
      started_at TEXT,
      ended_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS Participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      player_code TEXT DEFAULT '',
      avatar TEXT DEFAULT '👤',
      employee_code TEXT DEFAULT '',
      branch_code TEXT DEFAULT '',
      joined_at TEXT
    );
    CREATE TABLE IF NOT EXISTS Responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT DEFAULT '',
      is_correct INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      time_taken INTEGER DEFAULT 0,
      submitted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS PollResults (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer_text TEXT DEFAULT '',
      vote_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS EmployeeRoster (
      employee_code TEXT PRIMARY KEY,
      employee_name TEXT DEFAULT '',
      branch_code TEXT DEFAULT '',
      imported_at TEXT
    );
  `);

  try { _db.run('ALTER TABLE Participants ADD COLUMN avatar TEXT DEFAULT "👤"'); } catch (e) {}
  try { _db.run('ALTER TABLE Participants ADD COLUMN employee_code TEXT DEFAULT ""'); } catch (e) {}
  try { _db.run('ALTER TABLE Participants ADD COLUMN branch_code TEXT DEFAULT ""'); } catch (e) {}
  try { _db.run('ALTER TABLE Sessions ADD COLUMN show_answer INTEGER DEFAULT 0'); } catch (e) {}

  save();

  const now = new Date().toISOString();
  const defaults = [
    ['app_name', 'D.I.Y. Teamwork'],
    ['app_color', '#10b981'],
    ['app_logo', ''],
    ['default_time_limit', '30'],
    ['default_points', '10'],
    ['music_enabled', 'true'],
    ['music_file_id', ''],
    ['leaderboard_enabled', 'true'],
    ['admin_password', 'admin1234'],
    ['host_password_enabled', 'false'],
    ['host_password', ''],
    ['background_color', '#0a0f1e'],
    ['background_image_url', ''],
    ['max_participants', '0'],
    ['auto_start_at_limit', 'false'],
    ['effect_correct_url', ''],
    ['effect_wrong_url', ''],
    ['require_employee_code', 'true']
  ];
  defaults.forEach(([k, v]) => {
    _db.run(
      'INSERT OR IGNORE INTO Settings (key,value,updated_at) VALUES (?,?,?)',
      [k, v, now]
    );
  });

  const quizCount = _db.exec("SELECT COUNT(*) FROM Quizzes")[0]?.values[0][0] || 0;
  if (quizCount === 0) {
    _db.run(
      'INSERT INTO Quizzes VALUES (?,?,?,?,?,?,?,?)',
      [
        'QZ001',
        'General Knowledge Quiz',
        'ทดสอบความรู้ทั่วไป',
        'General',
        '',
        'admin',
        JSON.stringify({
          shuffle_questions: false,
          shuffle_options: false,
          show_answer: true,
          allow_retry: false
        }),
        now
      ]
    );
    _db.run(
      'INSERT INTO Quizzes VALUES (?,?,?,?,?,?,?,?)',
      [
        'QZ002',
        'Team Building Poll',
        'Poll สำหรับทีม',
        'Poll',
        '',
        'admin',
        JSON.stringify({
          shuffle_questions: false,
          shuffle_options: false,
          show_answer: false,
          allow_retry: false
        }),
        now
      ]
    );

    const addQuestion = (id, quizId, type, text, timeLimit, points, orderNum, options) => {
      _db.run('INSERT INTO Questions VALUES (?,?,?,?,?,?,?,?,?)', [
        id,
        quizId,
        type,
        text,
        '',
        timeLimit,
        points,
        orderNum,
        JSON.stringify(options)
      ]);
    };

    addQuestion(
      'QN001',
      'QZ001',
      'multiple_choice',
      'กรุงเทพมหานครเป็นเมืองหลวงของประเทศใด?',
      30,
      10,
      1,
      [
        { text: 'ประเทศไทย', is_correct: true },
        { text: 'เวียดนาม', is_correct: false },
        { text: 'มาเลเซีย', is_correct: false },
        { text: 'ลาว', is_correct: false }
      ]
    );
    addQuestion(
      'QN002',
      'QZ001',
      'true_false',
      'โลกหมุนรอบดวงอาทิตย์ใช่หรือไม่?',
      20,
      10,
      2,
      [
        { text: 'True', is_correct: true },
        { text: 'False', is_correct: false }
      ]
    );
    addQuestion(
      'QN003',
      'QZ001',
      'multiple_choice',
      '1 + 1 = ?',
      15,
      5,
      3,
      [
        { text: '1', is_correct: false },
        { text: '2', is_correct: true },
        { text: '3', is_correct: false },
        { text: '11', is_correct: false }
      ]
    );
    addQuestion(
      'QN004',
      'QZ002',
      'poll',
      'คุณชอบกิจกรรม Team Building แบบไหนมากที่สุด?',
      0,
      0,
      1,
      [
        { text: 'เกมกลางแจ้ง' },
        { text: 'Workshop สร้างสรรค์' },
        { text: 'อาหารมื้อพิเศษ' },
        { text: 'Online Activity' }
      ]
    );
    addQuestion(
      'QN005',
      'QZ002',
      'word_cloud',
      'คำที่นึกถึงเมื่อพูดถึง "ทีมที่ดี" คือ?',
      0,
      0,
      2,
      []
    );
  }

  save();
  return db;
}

const db = {
  prepare(sql) {
    return {
      get(...params) {
        const flat = params.flat();
        const res = _db.exec(sql, flat.length ? flat : undefined);
        if (!res.length || !res[0].values.length) return undefined;
        const { columns, values } = res[0];
        const row = {};
        columns.forEach((c, i) => {
          row[c] = values[0][i];
        });
        return row;
      },
      all(...params) {
        const flat = params.flat();
        const res = _db.exec(sql, flat.length ? flat : undefined);
        if (!res.length) return [];
        const { columns, values } = res[0];
        return values.map((row) => {
          const obj = {};
          columns.forEach((c, i) => {
            obj[c] = row[i];
          });
          return obj;
        });
      },
      run(...params) {
        const flat = params.flat();
        _db.run(sql, flat.length ? flat : undefined);
        save();
        return this;
      }
    };
  },
  exec(sql) {
    _db.run(sql);
    save();
  },
  transaction(fn) {
    return () => {
      let started = false;
      let committed = false;
      try {
        _db.run('BEGIN');
        started = true;
        _txDepth++;
        fn();
        _db.run('COMMIT');
        committed = true;
        save(true);
      } catch (e) {
        if (started && !committed) {
          try {
            _db.run('ROLLBACK');
          } catch (_) {}
        }
        throw e;
      } finally {
        if (started) _txDepth = Math.max(0, _txDepth - 1);
      }
    };
  }
};

module.exports = { db, initDB, dbPath };
