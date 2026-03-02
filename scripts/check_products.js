const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB error:', err);
    process.exit(1);
  }
  
  db.all('SELECT * FROM products', (err, rows) => {
    if (err) {
      console.error('Query error:', err);
    } else {
      console.log('Products in database:', rows.length);
      console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
  });
});
