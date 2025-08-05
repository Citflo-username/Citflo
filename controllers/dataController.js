// // controllers/dataController.js
// const SECRET_PASSWORD = "mySecret123"; // You can load this from an env variable later

// module.exports = (req, res) => {
//     const { password, ...data } = req.body;

//     if (password !== SECRET_PASSWORD) {
//         console.log("Unauthorized POST attempt to /data:", req.body);
//         return res.status(401).send({ error: "Unauthorized" });
//     }

//     console.log("Received authorized data:", data);
//     res.status(200).send({ message: "Data received successfully." });
// };


// controllers/dataController.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');


const SECRET_PASSWORD = process.env.SECRET_PASSWORD || "mySecret123";

module.exports = (req, res) => {
    const { password, sensor_id, voltage, timestamp } = req.body;

    if (password !== SECRET_PASSWORD) {
        console.log("Unauthorized POST attempt to /data:", req.body);
        return res.status(401).send({ error: "Unauthorized" });
    }

    if (!sensor_id || voltage === undefined || !timestamp) {
        return res.status(400).send({ error: "Missing required fields" });
    }

    db.run(
        `INSERT INTO readings (sensor_id, voltage, timestamp) VALUES (?, ?, ?)`,
        [sensor_id, voltage, timestamp],
        function(err) {
            if (err) {
                console.error("DB insert error:", err.message);
                return res.status(500).send({ error: "Database error" });
            }
            console.log("Stored reading:", { sensor_id, voltage, timestamp });
            res.status(200).send({ message: "Data stored", id: this.lastID });
        }
    );
};
