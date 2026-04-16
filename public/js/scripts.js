// ============================================================
// scripts.js - Shared JavaScript utilities
// ============================================================

(function environmentCheck() {
  if (window.location.protocol === 'file:') {
    alert(
      'กรุณารัน Node Server แล้วเปิดผ่าน URL ของเครื่องแทนการเปิดไฟล์โดยตรง'
    );
  }
})();

window.applyGlobalSettingsToDocument = function(settings = {}) {
  if (settings.fontFamily) {
    document.documentElement.style.setProperty('--font-main', settings.fontFamily);
  }
  if (settings.fontSize) {
    document.documentElement.style.fontSize = settings.fontSize + 'px';
  }
  if (settings.app_color) {
    document.documentElement.style.setProperty('--primary', settings.app_color);
  }
  if (settings.music_volume !== undefined && settings.music_volume !== '') {
    const vol = parseFloat(settings.music_volume);
    if (!Number.isNaN(vol)) window.globalMusicVolume = vol;
  }
  if (settings.effect_correct_url) window.effectCorrectUrl = settings.effect_correct_url;
  if (settings.effect_wrong_url) window.effectWrongUrl = settings.effect_wrong_url;
  window.globalMusicEnabled = settings.music_enabled !== 'false';
  window.globalRequireEmployeeCode = settings.require_employee_code !== 'false';

  const bgColor = String(settings.background_color || '').trim();
  const bgImage = String(settings.background_image_url || '').trim();
  if (bgColor) {
    document.documentElement.style.setProperty('--bg-dark', bgColor);
  }

  const body = document.body;
  if (!body) return;
  body.style.backgroundColor = bgColor || 'var(--bg-dark)';

  if (bgImage) {
    const safeUrl = bgImage.replace(/"/g, '\\"');
    body.style.backgroundImage = `linear-gradient(rgba(5,10,20,0.5), rgba(5,10,20,0.5)), url("${safeUrl}")`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'fixed';
  } else {
    body.style.backgroundImage = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.backgroundRepeat = '';
    body.style.backgroundAttachment = '';
  }
};

(async function applyGlobalSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success && json.data) {
      window.applyGlobalSettingsToDocument(json.data);
    }
  } catch (e) {}
})();

(function initToastSystem() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);

  window.showToast = function(msg, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };
})();

window.showLoading = function(text = 'กำลังโหลด...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = `<div class="spinner"></div><div class="loading-text">${text}</div>`;
    document.body.appendChild(el);
  } else {
    el.querySelector('.loading-text').textContent = text;
    el.style.display = 'flex';
  }
};

window.hideLoading = function() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
};

window.apiCall = async function(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (data) options.body = JSON.stringify(data);

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP error ${res.status}: ${text.substring(0, 120)}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Parse Error: ${err.message}`);
    }
  } catch (err) {
    console.error('API Call Error:', err);
    throw err;
  }
};

window.confirmDialog = function(msg, onConfirm) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop open';
  el.innerHTML = `
    <div class="modal-panel" style="max-width:380px;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">⚠️</div>
      <p style="font-size:16px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">${msg}</p>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:24px">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" style="flex:1" onclick="this.closest('.modal-backdrop').remove()">ยกเลิก</button>
        <button class="btn btn-danger" style="flex:1" id="confirm-ok">ยืนยัน</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#confirm-ok').onclick = () => {
    el.remove();
    onConfirm();
  };
};

window.showFeedback = function(isCorrect, score) {
  const el = document.createElement('div');
  el.className = 'feedback-overlay';
  el.innerHTML = `
    <div class="feedback-box ${isCorrect ? 'correct' : 'wrong'}">
      <div>${isCorrect ? '🎉 ถูกต้อง!' : '😅 ไม่ถูกต้อง'}</div>
      ${isCorrect ? `<div style="font-size:20px;margin-top:8px">+${score} คะแนน</div>` : ''}
    </div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
};

window.CountdownTimer = class {
  constructor(totalSeconds, onTick, onComplete) {
    this.total = totalSeconds;
    this.remaining = totalSeconds;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      this.remaining--;
      if (this.onTick) this.onTick(this.remaining, this.total);
      if (this.remaining <= 0) {
        this.stop();
        if (this.onComplete) this.onComplete();
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.interval);
  }

  getPercent() {
    return Math.max(0, (this.remaining / this.total) * 100);
  }
};

window.Poller = class {
  constructor(fn, interval = 3000) {
    this.fn = fn;
    this.interval = interval;
    this.timer = null;
    this.active = false;
  }

  start() {
    this.active = true;
    this.fn();
    this.timer = setInterval(() => {
      if (this.active) this.fn();
    }, this.interval);
  }

  stop() {
    this.active = false;
    clearInterval(this.timer);
  }
};

window.formatNumber = (n) => new Intl.NumberFormat('th-TH').format(n);
window.formatPercent = (n, total) => (total ? Math.round(n / total * 100) : 0);

window.renderRingTimer = function(containerId, remaining, total) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const size = 100;
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, remaining / total);
  const dash = pct * circumference;
  const urgent = remaining <= 5;
  const color = urgent ? '#ef4444' : remaining <= 10 ? '#f59e0b' : '#10b981';

  container.innerHTML = `
    <div class="timer-ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
        <circle
          cx="50"
          cy="50"
          r="${r}"
          fill="none"
          stroke="${color}"
          stroke-width="8"
          stroke-dasharray="${dash} ${circumference}"
          stroke-linecap="round"
          style="transition:stroke-dasharray 0.9s ease,stroke 0.3s"
        />
      </svg>
      <span class="timer-text${urgent ? ' urgent' : ''}" style="color:${color}">${remaining}</span>
    </div>
  `;
};

window.renderWordCloud = function(containerId, wordsData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444'];
  const maxCount = Math.max(...wordsData.map((word) => word.count || 1), 1);

  container.innerHTML = '<div class="word-cloud"></div>';
  const cloud = container.querySelector('.word-cloud');

  wordsData.forEach((word, index) => {
    const ratio = (word.count || 1) / maxCount;
    const size = Math.round(12 + ratio * 36);
    const color = colors[index % colors.length];
    const tag = document.createElement('span');
    tag.className = 'word-tag';
    tag.textContent = word.text;
    tag.style.cssText = `font-size:${size}px;color:#fff;background:${color}20;border:1px solid ${color}40;animation-delay:${index * 0.05}s`;
    cloud.appendChild(tag);
  });
};

window.MusicPlayer = {
  audio: null,
  fileId: null,
  _el: null,

  init(urlOrId) {
    this.destroy();
    if (!urlOrId) return;

    let fileId = null;
    const driveMatch = urlOrId.match(/[?&]id=([^&]+)/) || urlOrId.match(/\/d\/([^/]+)/);
    if (driveMatch) {
      fileId = driveMatch[1];
    } else if (!urlOrId.includes('http') && !urlOrId.includes('/') && !urlOrId.includes('.')) {
      fileId = urlOrId;
    }
    this.fileId = fileId;

    const el = document.createElement('audio');
    el.loop = true;
    el.volume = window.globalMusicVolume !== undefined ? window.globalMusicVolume : 0.4;
    el.style.display = 'none';

    if (this.fileId) {
      [
        `/api/music/drive/${this.fileId}`,
        `https://drive.google.com/uc?export=download&id=${this.fileId}`,
        `https://lh3.googleusercontent.com/d/${this.fileId}`
      ].forEach((srcUrl) => {
        const source = document.createElement('source');
        source.src = srcUrl;
        el.appendChild(source);
      });
    } else {
      el.src = urlOrId;
    }

    el.onerror = () => {
      console.warn('MusicPlayer: audio load error, fileId=', this.fileId);
      if (typeof showToast === 'function') showToast('ไม่สามารถเล่นไฟล์เสียงได้', 'warning');
    };

    document.body.appendChild(el);
    this._el = el;
    this.audio = el;
  },

  play() {
    if (!this._el) return Promise.resolve();
    const promise = this._el.play();
    if (promise && promise.catch) {
      promise.catch((err) => {
        console.warn('MusicPlayer play error:', err.message);
        if (err.name === 'NotAllowedError') {
          const resume = () => {
            this._el && this._el.play().catch(() => {});
            document.removeEventListener('click', resume);
          };
          document.addEventListener('click', resume, { once: true });
        }
      });
    }
    return promise;
  },

  pause() {
    if (this._el) this._el.pause();
  },

  toggle() {
    if (!this._el) return;
    this._el.paused ? this.play() : this.pause();
  },

  setVol(value) {
    if (this._el) this._el.volume = Math.max(0, Math.min(1, value));
  },

  get paused() {
    return !this._el || this._el.paused;
  },

  destroy() {
    if (this._el) {
      this._el.pause();
      this._el.remove();
      this._el = null;
    }
    this.audio = null;
    this.fileId = null;
  }
};

window.playSoundEffect = function(url) {
  if (window.globalMusicEnabled === false) return;
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = window.globalMusicVolume !== undefined ? window.globalMusicVolume : 0.5;
  audio.play().catch((err) => console.warn('playSoundEffect error:', err));
};

window.copyText = function(text, label = 'คัดลอกแล้ว!') {
  navigator.clipboard.writeText(text).then(() => showToast(label, 'success'));
};

window.parseEmployeeRosterFile = async function(file) {
  if (!window.XLSX) throw new Error('ยังไม่โหลดไลบรารี Excel');

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('ไม่พบ worksheet ในไฟล์');

  const sheet = workbook.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) throw new Error('ไฟล์ Excel ว่างเปล่า');

  const normalizeHeader = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_-]/g, '');

  const headerRow = rows[0] || [];
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const findHeaderIndex = (aliases) =>
    normalizedHeaders.findIndex((header) => aliases.includes(header));

  const codeIndex = findHeaderIndex(['รหัสพนักงาน', 'employeecode', 'empcode', 'code']);
  const nameIndex = findHeaderIndex(['ชื่อพนักงาน', 'employeename', 'name', 'fullname']);
  const branchIndex = findHeaderIndex(['รหัสสาขา', 'branchcode', 'branch', 'storecode']);
  const hasHeader = codeIndex !== -1 || nameIndex !== -1 || branchIndex !== -1;
  const startRow = hasHeader ? 1 : 0;

  const parsed = rows
    .slice(startRow)
    .map((row) => ({
      employeeCode: String((codeIndex !== -1 ? row[codeIndex] : row[0]) || '').trim().toUpperCase(),
      employeeName: String((nameIndex !== -1 ? row[nameIndex] : row[1]) || '').trim(),
      branchCode: String((branchIndex !== -1 ? row[branchIndex] : row[2]) || '').trim().toUpperCase()
    }))
    .filter((row) => row.employeeCode);

  if (!parsed.length) throw new Error('ไม่พบข้อมูลรหัสพนักงานในไฟล์');
  return parsed;
};

window.escapeHtml = function(str) {
  return String(str || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
};

window.gasRun = async function(fnName, args, onSuccess, onError) {
  const apiMap = {
    getDashboardData: { path: '/api/dashboard', method: 'GET' },
    getQuizList: { path: '/api/quizzes', method: 'GET' },
    getQuizDetail: { path: '/api/quizzes/{0}', method: 'GET' },
    createQuiz: { path: '/api/quizzes', method: 'POST', bodyArg: 0 },
    updateQuiz: { path: '/api/quizzes/{0}', method: 'PUT', bodyArg: 1 },
    deleteQuiz: { path: '/api/quizzes/{0}', method: 'DELETE' },
    saveQuestion: { path: '/api/quizzes/questions/save', method: 'POST', bodyArg: 0 },
    deleteQuestion: { path: '/api/quizzes/questions/{0}', method: 'DELETE' },
    duplicateQuiz: { path: '/api/quizzes/duplicate', method: 'POST', bodyArg: 0 },
    shuffleQuestions: { path: '/api/quizzes/{0}/shuffle', method: 'POST' },
    getSessionHistory: { path: '/api/sessions/history?hostId={0}', method: 'GET' },
    getReports: { path: '/api/sessions/{0}/report', method: 'GET' },
    validatePin: { path: '/api/sessions/validate-pin/{0}', method: 'GET' },
    startSession: { path: '/api/sessions/start', method: 'POST', bodyArg: 0 },
    endSession: { path: '/api/sessions/{0}/end', method: 'POST' },
    joinSession: { path: '/api/sessions/join', method: 'POST', bodyArg: 0 },
    deleteSession: { path: '/api/sessions/delete', method: 'POST', bodyArg: 0 },
    getLiveSessionData: { path: '/api/sessions/{0}/live?participantId={1}', method: 'GET' },
    getSessionState: { path: '/api/sessions/{0}/live', method: 'GET' },
    submitAnswer: { path: '/api/sessions/{0}/answer', method: 'POST', bodyArg: 1 },
    nextQuestion: { path: '/api/sessions/{0}/next', method: 'POST' },
    getLeaderboard: { path: '/api/sessions/{0}/leaderboard', method: 'GET' },
    getQuestionResults: { path: '/api/sessions/{0}/questions/{1}/results', method: 'GET' },
    getQuestionAnswers: { path: '/api/sessions/{0}/questions/{1}/answers', method: 'GET' },
    getParticipants: { path: '/api/sessions/{0}/participants', method: 'GET' },
    getSettings: { path: '/api/settings', method: 'GET' },
    saveSettings: { path: '/api/settings', method: 'POST', bodyArg: 0 },
    getMusicFiles: { path: '/api/music', method: 'GET' }
  };

  const route = apiMap[fnName];
  if (!route) {
    const errMsg = `Function ${fnName} not mapped to API`;
    console.error(errMsg);
    if (onError) onError({ message: errMsg });
    else showToast(errMsg, 'error');
    return;
  }

  let finalPath = route.path;
  const reqOptions = {
    method: route.method,
    headers: { 'Content-Type': 'application/json' }
  };

  const bodyBuilders = {
    startSession: (a) => ({
      quizId: (Array.isArray(a) ? a[0] : a?.quizId || a?.quiz_id),
      hostId: (Array.isArray(a) ? a[1] : a?.hostId || a?.host_id || 'admin')
    }),
    joinSession: (a) => ({
      pin: (Array.isArray(a) ? a[0] : a?.pin),
      playerName: (Array.isArray(a) ? a[1] : a?.playerName || a?.name),
      avatar: (Array.isArray(a) ? a[2] : a?.avatar),
      employeeCode: (Array.isArray(a) ? a[3] : a?.employeeCode || a?.employee_code)
    }),
    submitAnswer: (a) => ({
      participantId: (Array.isArray(a) ? a[1] : a?.participantId),
      questionId: (Array.isArray(a) ? a[2] : a?.questionId),
      answer: (Array.isArray(a) ? a[3] : a?.answer)
    })
  };

  if (Array.isArray(args)) {
    finalPath = finalPath.replace(/\{(\d+)\}/g, (match, idx) => {
      const value = args[Number(idx)];
      if (value === undefined || value === null) return '';
      return encodeURIComponent(String(value));
    });
  } else if (args !== null && args !== undefined && finalPath.includes('{0}')) {
    finalPath = finalPath.replace(/\{0\}/g, encodeURIComponent(String(args)));
  }

  if (route.method !== 'GET') {
    if (bodyBuilders[fnName]) {
      reqOptions.body = JSON.stringify(bodyBuilders[fnName](args));
    } else if (Array.isArray(args)) {
      if (route.bodyArg !== undefined && args[route.bodyArg] !== undefined) {
        reqOptions.body = JSON.stringify(args[route.bodyArg]);
      }
    } else if (args !== null && args !== undefined) {
      reqOptions.body = JSON.stringify(args);
    }
  }

  try {
    const res = await fetch(finalPath, reqOptions);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP error ${res.status}: ${text.substring(0, 120)}`);
    }

    const text = await res.text();
    const data = JSON.parse(text);
    if (onSuccess) onSuccess(data);
  } catch (err) {
    console.error(`gasRun Wrapper Error (${fnName}):`, err);
    if (onError) onError(err);
    else showToast(err.message, 'error');
  }
};
