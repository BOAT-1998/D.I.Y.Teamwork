// ============================================================
// index.js — Express Server Entry Point
// ============================================================
const { app, PORT, ensureInitialized, getLocalIP } = require('./app');

ensureInitialized()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ D.I.Y. Teamwork Server running!`);
      console.log(`   🌍 Local: http://localhost:${PORT}`);
      console.log(`   📲 LAN:   http://${getLocalIP()}:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });
