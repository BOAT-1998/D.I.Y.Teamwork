// ============================================================
// scripts.js — Shared JavaScript Utilities
// ============================================================

// ── ENVIRONMENT CHECK ──
(function() {
  if (window.location.protocol === 'file:') {
    alert("⚠️ คำเตือน: คุณกดเปิดไฟล์ขึ้นมาโดยตรง!\n\nกรุณารัน Node Server แล้วเข้าผ่าน IP หรือโดเมนของคุณแทนครับ");
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
  if (settings.effect_wrong_url)   window.effectWrongUrl   = settings.effect_wrong_url;

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

// ── GLOBAL STYLES (Font & Color) ──
(async function applyGlobalSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success && json.data) {
      window.applyGlobalSettingsToDocument(json.data);
    }
  } catch(e) {}
})();

/* ── TOAST NOTIFICATIONS ── */
(function() {
  // สร้าง container สำหรับ toast
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);

  window.showToast = function(msg, type = 'info', duration = 3500) {
    const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]||'💬'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };
})();

/* ── LOADING OVERLAY ── */
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

/* ── API CALL WRAPPER (Replacing gasRun) ── */
window.apiCall = async function(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (data) options.body = JSON.stringify(data);
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      throw new Error(`HTTP error ${res.status}: ${txt.substring(0,50)}`);
    }
    const text = await res.text();
    try { return JSON.parse(text); } 
    catch(e) { throw new Error(`Parse Error: ${e.message} \nResponse: ${text.substring(0,50)}`); }
  } catch (err) {
    console.error('API Call Error:', err);
    throw err;
  }
};

/* ── CONFIRM DIALOG ── */
window.confirmDialog = function(msg, onConfirm) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop open';
  el.innerHTML = `
    <div class="modal-panel" style="max-width:380px;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">⚠️</div>
      <p style="font-size:16px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">${msg}</p>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:24px">การกระทำนี้ไม่สามารถยกเลิกได้</p>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" style="flex:1" onclick="this.closest('.modal-backdrop').remove()">ยกเลิก</button>
        <button class="btn btn-danger" style="flex:1" id="confirm-ok">ยืนยัน</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#confirm-ok').onclick = () => { el.remove(); onConfirm(); };
};

/* ── FEEDBACK OVERLAY (correct/wrong) ── */
window.showFeedback = function(isCorrect, score) {
  const el = document.createElement('div');
  el.className = 'feedback-overlay';
  el.innerHTML = `
    <div class="feedback-box ${isCorrect ? 'correct' : 'wrong'}">
      <div>${isCorrect ? '🎉 ถูกต้อง!' : '😅 ไม่ถูกต้อง'}</div>
      ${isCorrect ? `<div style="font-size:20px;margin-top:8px">+${score} คะแนน</div>` : ''}
    </div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
};

/* ── COUNTDOWN TIMER ── */
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
  stop() { clearInterval(this.interval); }
  getPercent() { return Math.max(0, (this.remaining / this.total) * 100); }
};

/* ── POLL ── */
window.Poller = class {
  constructor(fn, interval = 3000) {
    this.fn = fn;
    this.interval = interval;
    this.timer = null;
    this.active = false;
  }
  start() {
    this.active = true;
    this.fn(); // เรียกทันที
    this.timer = setInterval(() => { if (this.active) this.fn(); }, this.interval);
  }
  stop() { this.active = false; clearInterval(this.timer); }
};

/* ── NUMBER FORMAT ── */
window.formatNumber = n => new Intl.NumberFormat('th-TH').format(n);
window.formatPercent = (n, total) => total ? Math.round(n / total * 100) : 0;

/* ── SVG RING TIMER ── */
window.renderRingTimer = function(containerId, remaining, total) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const size   = 100;
  const r      = 42;
  const circ   = 2 * Math.PI * r;
  const pct    = Math.max(0, remaining / total);
  const dash   = pct * circ;
  const urgent = remaining <= 5;
  const color  = urgent ? '#ef4444' : remaining <= 10 ? '#f59e0b' : '#10b981';

  container.innerHTML = `
    <div class="timer-ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
          style="transition:stroke-dasharray 0.9s ease,stroke 0.3s"/>
      </svg>
      <span class="timer-text${urgent?' urgent':''}" style="color:${color}">${remaining}</span>
    </div>`;
};

/* ── WORD CLOUD RENDER ── */
window.renderWordCloud = function(containerId, wordsData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const colors = ['#10b981','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#ef4444'];
  const maxCount = Math.max(...wordsData.map(w => w.count || 1), 1);

  container.innerHTML = '<div class="word-cloud"></div>';
  const cloud = container.querySelector('.word-cloud');

  wordsData.forEach((w, i) => {
    const ratio  = (w.count || 1) / maxCount;
    const size   = Math.round(12 + ratio * 36);
    const color  = colors[i % colors.length];
    const tag    = document.createElement('span');
    tag.className = 'word-tag';
    tag.textContent = w.text;
    tag.style.cssText = `font-size:${size}px;color:#fff;background:${color}20;border:1px solid ${color}40;animation-delay:${i*0.05}s`;
    cloud.appendChild(tag);
  });
};

/* ── MUSIC PLAYER ── */
window.MusicPlayer = {
  audio:  null,
  fileId: null,
  _el:    null,

  init(urlOrId) {
    this.destroy();
    if (!urlOrId) return;

    let fileId = null;
    const m = urlOrId.match(/[?&]id=([^&]+)/) || urlOrId.match(/\/d\/([^/]+)/);
    if (m) {
      fileId = m[1];
    } else {
      if (!urlOrId.includes('http') && !urlOrId.includes('/') && !urlOrId.includes('.')) {
        fileId = urlOrId;
      }
    }
    this.fileId = fileId;

    const el = document.createElement('audio');
    el.loop   = true;
    el.volume = window.globalMusicVolume !== undefined ? window.globalMusicVolume : 0.4;
    el.style.display = 'none';

    if (this.fileId) {
      const urls = [
        `/api/music/drive/${this.fileId}`,
        `https://drive.google.com/uc?export=download&id=${this.fileId}`,
        `https://lh3.googleusercontent.com/d/${this.fileId}`
      ];
      urls.forEach(u => {
        const src = document.createElement('source');
        src.src = u;
        el.appendChild(src);
      });
    } else {
      el.src = urlOrId;
    }

    el.onerror = () => {
      console.warn('MusicPlayer: audio load error, fileId=', this.fileId);
      if (typeof showToast === 'function') showToast('⚠️ ไม่สามารถเล่นได้', 'warning');
    };

    document.body.appendChild(el);
    this._el  = el;
    this.audio = el;
  },

  play() {
    if (!this._el) return null;
    const p = this._el.play();
    if (p && p.catch) p.catch(err => {
      console.warn('MusicPlayer play error:', err.message);
      if (err.name === 'NotAllowedError') {
        const resume = () => { this._el && this._el.play().catch(()=>{}); document.removeEventListener('click', resume); };
        document.addEventListener('click', resume, { once: true });
      }
    });
    return p;
  },

  pause()   { this._el && this._el.pause(); },
  toggle()  { if (!this._el) return; this._el.paused ? this.play() : this.pause(); },
  setVol(v) { if (this._el) this._el.volume = Math.max(0, Math.min(1, v)); },
  get paused() { return !this._el || this._el.paused; },

  destroy() {
    if (this._el) { this._el.pause(); this._el.remove(); this._el = null; }
    this.audio = null; this.fileId = null;
  }
};

window.playSoundEffect = function(url) {
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = window.globalMusicVolume !== undefined ? window.globalMusicVolume : 0.5;
  audio.play().catch(err => console.warn('playSoundEffect error:', err));
};

/* ── COPY TO CLIPBOARD ── */
window.copyText = function(text, label = 'คัดลอกแล้ว!') {
  navigator.clipboard.writeText(text).then(() => showToast(label, 'success'));
};

/* ── UTILS ── */
window.escapeHtml = function(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s] || s));
};

/* ── GAS MAPPER (For backwards compatibility with gasRun) ── */
window.gasRun = async function(fnName, args, onSuccess, onError) {
  // Mapping original gasRun function names to Express REST endpoints
  const apiMap = {
    // Dashboard
    'getDashboardData': { path: '/api/dashboard', method: 'GET' },
    
    // Quizzes
    'getQuizList': { path: '/api/quizzes', method: 'GET' },
    'getQuizDetail': { path: '/api/quizzes/{0}', method: 'GET' },
    'createQuiz': { path: '/api/quizzes', method: 'POST', bodyArg: 0 },
    'updateQuiz': { path: '/api/quizzes/{0}', method: 'PUT', bodyArg: 1 },
    'deleteQuiz': { path: '/api/quizzes/{0}', method: 'DELETE' },
    'saveQuestion': { path: '/api/quizzes/questions/save', method: 'POST', bodyArg: 0 },
    'deleteQuestion': { path: '/api/quizzes/questions/{0}', method: 'DELETE' },
    'duplicateQuiz': { path: '/api/quizzes/duplicate', method: 'POST', bodyArg: 0 },
    'shuffleQuestions': { path: '/api/quizzes/{0}/shuffle', method: 'POST' },
    
    // Sessions / History
    'getSessionHistory': { path: '/api/sessions/history?hostId={0}', method: 'GET' },
    'getReports': { path: '/api/sessions/{0}/report', method: 'GET' },
    'validatePin': { path: '/api/sessions/validate-pin/{0}', method: 'GET' },
    'startSession': { path: '/api/sessions/start', method: 'POST', bodyArg: 0 },
    'endSession': { path: '/api/sessions/{0}/end', method: 'POST' },
    'joinSession': { path: '/api/sessions/join', method: 'POST', bodyArg: 0 },
    'deleteSession': { path: '/api/sessions/delete', method: 'POST', bodyArg: 0 },
    'getLiveSessionData': { path: '/api/sessions/{0}/live?participantId={1}', method: 'GET' },
    'getSessionState': { path: '/api/sessions/{0}/live', method: 'GET' },
    'submitAnswer': { path: '/api/sessions/{0}/answer', method: 'POST', bodyArg: 1 },
    'nextQuestion': { path: '/api/sessions/{0}/next', method: 'POST' },
    'getLeaderboard': { path: '/api/sessions/{0}/leaderboard', method: 'GET' },
    'getQuestionResults': { path: '/api/sessions/{0}/questions/{1}/results', method: 'GET' },
    'getQuestionAnswers': { path: '/api/sessions/{0}/questions/{1}/answers', method: 'GET' },
    'getParticipants': { path: '/api/sessions/{0}/participants', method: 'GET' },
    
    // Settings
    'getSettings': { path: '/api/settings', method: 'GET' },
    'saveSettings': { path: '/api/settings', method: 'POST', bodyArg: 0 },
    
    // Music
    'getMusicFiles': { path: '/api/music', method: 'GET' }
  };

  const route = apiMap[fnName];
  if (!route) {
    const errMsg = 'Function ' + fnName + ' not mapped to API';
    console.error(errMsg);
    if (onError) onError({message: errMsg});
    else showToast(errMsg, 'error');
    return;
  }

  let finalPath = route.path;
  let reqOptions = {
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
      avatar: (Array.isArray(a) ? a[2] : a?.avatar)
    }),
    submitAnswer: (a) => ({
      participantId: (Array.isArray(a) ? a[1] : a?.participantId),
      questionId: (Array.isArray(a) ? a[2] : a?.questionId),
      answer: (Array.isArray(a) ? a[3] : a?.answer)
    })
  };

  // Replace {0}, {1} in path with args
  if (Array.isArray(args)) {
    finalPath = finalPath.replace(/\{(\d+)\}/g, (m, idx) => {
      const val = args[Number(idx)];
      if (val === undefined || val === null) return '';
      return encodeURIComponent(String(val));
    });
  } else if (args !== null && args !== undefined) {
    if (finalPath.includes('{0}')) {
      finalPath = finalPath.replace(/\{0\}/g, encodeURIComponent(String(args)));
    }
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
      const txt = await res.text().catch(()=>'');
      throw new Error(`HTTP error ${res.status}: ${txt.substring(0,50)}`);
    }
    const text = await res.text();
    const data = JSON.parse(text);
    if (onSuccess) onSuccess(data);
  } catch (err) {
    console.error('gasRun Wrapper Error (' + fnName + '):', err);
    if (onError) onError(err);
    else showToast(err.message, 'error');
  }
};
