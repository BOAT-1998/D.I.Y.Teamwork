// ============================================================
// routes/music.js — Music file management
// ============================================================
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

const musicDir = path.join(__dirname, '..', 'uploads', 'music');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, musicDir),
  filename:    (req, file, cb) => {
    cb(null, 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(7));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.originalname);
    cb(null, ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// GET /api/music/drive/:id — proxy Google Drive audio
router.get('/drive/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    
    res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.set('Content-Disposition', 'inline');
    
    const { Readable } = require('stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    res.status(500).send('Error proxy: ' + err.message);
  }
});

// GET /api/music — list uploaded music files
router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(musicDir)
      .filter(f => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f))
      .filter(f => !f.startsWith('temp_')) // ignore temp files
      .filter(f => !f.includes('à¹') && !f.includes('à¸')) // remove old garbled artifacts
      .map(f => ({
        id:       f,
        name:     f.replace(/^\d+_/, ''), // strip timestamp prefix
        url:      `/music/${encodeURIComponent(f)}`,
        mimeType: 'audio/' + path.extname(f).slice(1)
      }));
    res.json({ success: true, data: files });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/music/upload — upload new music file
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file received' });

  let finalName = req.file.originalname;
  if (req.body.filename) {
    try { finalName = decodeURIComponent(req.body.filename); } catch(e){}
  } else {
    finalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  }
  
  const newFilename = Date.now() + '_' + finalName;
  const oldPath = req.file.path;
  const newPath = path.join(musicDir, newFilename);
  
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }

  res.json({
    success: true,
    file: {
      id:   newFilename,
      name: finalName,
      url:  `/music/${encodeURIComponent(newFilename)}`
    }
  });
});

// DELETE /api/music/:filename
router.delete('/:filename', (req, res) => {
  try {
    const fp = path.join(musicDir, req.params.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
