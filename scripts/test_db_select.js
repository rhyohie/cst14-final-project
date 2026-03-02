const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB error:', err);
    process.exit(1);
  }
  
  db.get(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    ['admin@admin.com', 'admin1'],
    (err, row) => {
      if (err) console.error('Query error:', err);
      else console.log('Full row:', JSON.stringify(row, null, 2));
      db.close();
    }
  );
});
