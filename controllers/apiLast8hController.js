const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

module.exports = (req, res) => {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

    db.all(
        `SELECT * FROM readings WHERE timestamp >= ? ORDER BY timestamp ASC`,
        [eightHoursAgo],
        (err, rows) => {
            if (err) {
                console.error("DB error:", err);
                return res.status(500).send({ error: "Database error" });
            }
            res.json(rows);
        }
    );
};
