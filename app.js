const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const os = require('os');

const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

let initialized = false;
let initPromise = null;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function getWritableRoot() {
  return process.env.VERCEL ? '/tmp' : __dirname;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const musicDir = path.join(getWritableRoot(), 'uploads', 'music');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
app.use('/music', express.static(musicDir));

app.get('/', (req, res) => {
  const page = (req.query.page || 'login').toLowerCase();
  const validPages = ['login', 'admin', 'host', 'player', 'presenter'];
  const file = validPages.includes(page) ? page : 'login';
  res.sendFile(path.join(__dirname, 'public', file + '.html'));
});

['login', 'admin', 'host', 'player', 'presenter'].forEach((p) => {
  app.get(`/${p}`, (_, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`)));
});

app.get('/api/server-info', (req, res) => {
  res.json({ success: true, ip: getLocalIP(), port: PORT, environment: process.env.VERCEL ? 'vercel' : 'local' });
});

async function ensureInitialized() {
  if (initialized) return app;
  if (!initPromise) {
    initPromise = initDB().then(() => {
      app.use('/api/auth', require('./routes/auth'));
      app.use('/api/quizzes', require('./routes/quizzes'));
      app.use('/api/sessions', require('./routes/sessions'));
      app.use('/api/settings', require('./routes/settings'));
      app.use('/api/music', require('./routes/music'));
      app.use('/api/dashboard', require('./routes/dashboard'));
      app.use('/api/database', require('./routes/database'));
      initialized = true;
      return app;
    });
  }

  return initPromise;
}

module.exports = {
  app,
  PORT,
  ensureInitialized,
  getLocalIP
};
