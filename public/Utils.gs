// ============================================================
// Utils.gs - Utility & Helper Functions
// ============================================================

/** generateId() — สร้าง Unique ID เช่น QZ-1A2B3C */
function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix || 'ID'}-${id}`;
}

/** generatePIN() — สร้าง 6-digit PIN */
function generatePIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** generatePlayerCode() — สร้าง player code เช่น HERO-42 */
function generatePlayerCode() {
  const words = ['STAR','HERO','LION','WOLF','HAWK','BOLT','FIRE','JADE','RUBY','GOLD'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(10 + Math.random() * 90)}`;
}

/** tryParseJSON() — parse JSON แบบปลอดภัย */
function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback !== undefined ? fallback : null; }
}

/**
 * getSheetData() — ดึงข้อมูลจาก Sheet เป็น Array of Objects
 * ใช้แถวแรกเป็น header
 */
function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  // columns ที่ต้อง force String (Sheets อาจ auto-convert เป็น Number)
  const forceString = ['pin', 'id', 'session_id', 'participant_id',
                       'question_id', 'quiz_id', 'host_id', 'player_code'];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = forceString.includes(h) ? String(v === null || v === undefined ? '' : v).trim() : v;
    });
    return obj;
  });
}

/** deleteRowById() — ลบแถวจาก Sheet ตาม id column แรก */
function deleteRowById(ss, sheetName, id) {
  const sheet = ss.getSheetByName(sheetName);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) { sheet.deleteRow(i + 1); return true; }
  }
  return false;
}

/** sanitizeQuestionForPlayer() — ซ่อน is_correct ก่อนส่งให้ Player */
function sanitizeQuestionForPlayer(question) {
  const sanitized = { ...question };
  // parse options_json ถ้ายังเป็น string (มาจาก Sheet โดยตรง)
  let opts = sanitized.options;
  if (!opts && sanitized.options_json) {
    opts = tryParseJSON(sanitized.options_json, []);
  }
  if (typeof opts === 'string') opts = tryParseJSON(opts, []);
  sanitized.options = Array.isArray(opts)
    ? opts.map(opt => ({ text: opt.text }))
    : [];
  return sanitized;
}

/** updatePollResult() — อัปเดตนับ vote ใน PollResults */
function updatePollResult(ss, sessionId, questionId, answer) {
  const sheet   = ss.getSheetByName('PollResults');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const answers = Array.isArray(answer) ? answer : [answer];

  answers.forEach(ans => {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === sessionId && data[i][2] === questionId && data[i][3] === ans) {
        const countCol = headers.indexOf('vote_count') + 1;
        sheet.getRange(i + 1, countCol).setValue((Number(data[i][4]) || 0) + 1);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([generateId('PL'), sessionId, questionId, ans, 1]);
    }
  });
}

/** closePreviousSessionsForHost() — ปิด session เก่าของ host */
function closePreviousSessionsForHost(ss, hostId) {
  const sheet   = ss.getSheetByName('Sessions');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusCol = headers.indexOf('status') + 1;
  const hostCol   = headers.indexOf('host_id') + 1;
  const endedCol  = headers.indexOf('ended_at') + 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][hostCol - 1] === hostId &&
        (data[i][statusCol - 1] === 'active' || data[i][statusCol - 1] === 'waiting')) {
      sheet.getRange(i + 1, statusCol).setValue('ended');
      sheet.getRange(i + 1, endedCol).setValue(new Date().toISOString());
    }
  }
}

/** getWebAppUrl() — ดึง URL ของ Web App ตัวเอง */
function getWebAppUrl() {
  try {
    // วิธีที่ดีที่สุดสำหรับ GAS Web App
    return ScriptApp.getService().getUrl();
  } catch (e1) {
    try {
      return ScriptApp.getScriptId()
        ? 'https://script.google.com/macros/s/' + ScriptApp.getScriptId() + '/exec'
        : '';
    } catch (e2) {
      return '';
    }
  }
}