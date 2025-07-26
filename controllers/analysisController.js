const { spawn } = require('child_process');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

module.exports.runAnalysis = (req, res) => {
    // Get the time range (default to last 8 hours)
    const hoursBack = req.body.hours || 96;
    const timeAgo = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    // Fetch raw voltage data from database
    db.all(
        `SELECT timestamp, voltage FROM readings WHERE timestamp >= ? ORDER BY timestamp ASC`,
        [timeAgo],
        (err, rows) => {
            if (err) {
                console.error("DB error:", err);
                return res.status(500).json({ error: "Database error" });
            }
            
            if (rows.length === 0) {
                return res.json({ 
                    peaks: [], 
                    valleys: [], 
                    slopes: [],
                    our_values: [],
                    message: "No data found for analysis" 
                });
            }
            
            // Run Python analysis
            const pythonScript = path.join(__dirname, '../python/find_peaks_and_calc_slopes.py');
            const python = spawn('python', [pythonScript]); // Changed from python3 to python for Windows
            
            let output = '';
            let error = '';
            
            // Send data to Python script via stdin
            try {
                const jsonData = JSON.stringify(rows);
                console.log(`Sending ${rows.length} rows to Python script`);
                python.stdin.write(jsonData);
                python.stdin.end();
            } catch (writeError) {
                console.error('Error writing to Python stdin:', writeError);
                return res.status(500).json({ error: 'Failed to send data to Python script' });
            }
            
            python.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            python.stderr.on('data', (data) => {
                error += data.toString();
                console.log('Python stderr:', data.toString()); // Add this for debugging
            });
            
            python.on('error', (err) => {
                console.error('Python process error:', err);
                res.status(500).json({ error: 'Python process failed to start' });
            });
            
            python.stdin.on('error', (err) => {
                console.error('Python stdin error:', err);
                // Don't send response here as it might already be sent
            });
            
            python.on('close', (code) => {
                if (code !== 0) {
                    console.error('Python script error:', error);
                    return res.status(500).json({ error: 'Analysis failed: ' + error });
                }
                
                try {
                    const results = JSON.parse(output);
                    res.json(results);
                } catch (e) {
                    console.error('Failed to parse Python output:', output);
                    res.status(500).json({ error: 'Invalid analysis output' });
                }
            });
        }
    );
};