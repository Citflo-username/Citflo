const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

module.exports = (req, res) => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    db.run(
        `DELETE FROM readings WHERE timestamp >= ? AND voltage < 1`,
        [twentyFourHoursAgo],
        function(err) {
            if (err) {
                console.error("DB error:", err);
                return res.status(500).send({ error: "Database error" });
            }
            res.json({ 
                message: "Low value readings deleted successfully",
                deletedCount: this.changes 
            });
        }
    );
};