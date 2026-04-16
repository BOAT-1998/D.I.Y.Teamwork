const { app, ensureInitialized } = require('../app');

module.exports = async (req, res) => {
  try {
    await ensureInitialized();
    return app(req, res);
  } catch (error) {
    console.error('Vercel handler init error:', error);
    return res.status(500).json({ success: false, error: 'Server initialization failed' });
  }
};
