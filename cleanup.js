const fs = require('fs');
const path = require('path');
const musicDir = path.join(__dirname, 'uploads', 'music');
if (fs.existsSync(musicDir)) {
  fs.readdirSync(musicDir).forEach(f => {
    // delete anything that has Thai garbled strings or temp prefixes
    if (f.includes('à¹') || f.includes('à¸') || f.startsWith('temp_')) {
      fs.unlinkSync(path.join(musicDir, f));
      console.log('Deleted garbled file: ' + f);
    }
  });
}
console.log('Cleanup complete');
