// init-db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id TEXT,
      voltage REAL,
      timestamp TEXT
    )
  `);
  console.log("Database initialized.");
});

db.close();
