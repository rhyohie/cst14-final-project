const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.db');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
});

function run() {
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';", (err, tables) => {
    if (err) {
      console.error('Error listing tables:', err.message);
      db.close();
      return;
    }

    (async () => {
      for (const t of tables) {
        const name = t.name;
        console.log('\n== TABLE:', name, '==');
        await new Promise((res) => {
          db.all(`SELECT * FROM ${name} LIMIT 1000`, (err, rows) => {
            if (err) {
              console.error(`Error reading table ${name}:`, err.message);
            } else {
              console.log(JSON.stringify(rows, null, 2));
            }
            res();
          });
        });
      }
      db.close();
    })();
  });
}

run();
