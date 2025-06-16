// controllers/exportDataController.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

module.exports = (req, res) => {
    db.all(`SELECT * FROM readings ORDER BY timestamp DESC`, [], (err, rows) => {
        if (err) {
            console.error("Error reading DB:", err);
            return res.status(500).send("Error retrieving data.");
        }

        if (rows.length === 0) {
            return res.status(200).send("No data available.");
        }

        // Prepare TSV header
        const headers = Object.keys(rows[0]).join('\t');
        const lines = rows.map(row =>
            Object.values(row).join('\t')
        );

        const tsvContent = [headers, ...lines].join('\n');

        res.setHeader('Content-disposition', 'attachment; filename=readings.tsv');
        res.setHeader('Content-Type', 'text/tab-separated-values');
        res.send(tsvContent);
    });
};
