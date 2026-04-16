// ============================================================
// index.js — Express Server Entry Point
// ============================================================
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

let routesMounted = false;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Static: music files
const musicDir = path.join(__dirname, 'uploads', 'music');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
app.use('/music', express.static(musicDir));

const pageFileMap = {
  login: 'Login.html',
  admin: 'Admin.html',
  host: 'Host.html',
  player: 'Player.html',
  presenter: 'Presenter.html'
};

// ── PAGE ROUTING ─────────────────────────────────────────────
app.get('/', (req, res) => {
  const page = (req.query.page || 'login').toLowerCase();
  const selectedPage = pageFileMap[page] ? page : 'login';
  res.sendFile(path.join(__dirname, 'public', pageFileMap[selectedPage]));
});

Object.keys(pageFileMap).forEach((page) => {
  app.get(`/${page}`, (_, res) => {
    res.sendFile(path.join(__dirname, 'public', pageFileMap[page]));
  });
});

app.get('/api/server-info', (req, res) => {
  res.json({ success: true, ip: getLocalIP(), port: PORT });
});

// ── ASYNC STARTUP ────────────────────────────────────────────
const { initDB } = require('./db');

function mountRoutes() {
  if (routesMounted) return;
  routesMounted = true;

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/quizzes', require('./routes/quizzes'));
  app.use('/api/sessions', require('./routes/sessions'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/music', require('./routes/music'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/database', require('./routes/database'));
}

const dbReady = initDB().then(() => {
  mountRoutes();
});

async function startServer() {
  try {
    await dbReady;
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n✅ D.I.Y. Teamwork Server running!');
      console.log(`   🌍 Local: http://localhost:${PORT}`);
      console.log(`   📲 LAN:   http://${getLocalIP()}:${PORT}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  }
}

// Start a local server when running directly with Node.
if (require.main === module) {
  startServer();
}

// Export serverless handler for Vercel.
module.exports = async (req, res) => {
  await dbReady;
  return app(req, res);
};

module.exports.app = app;
module.exports.startServer = startServer;
