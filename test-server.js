const express = require('express');
const app = express();
const port = 3000;

const SECRET_PASSWORD = "mySecret123"; // Set your password here

app.use(express.json());

app.post('/data', (req, res) => {
    const { password, ...data } = req.body;

    if (password !== SECRET_PASSWORD) {
        console.log("Unauthorized attempt:", req.body);
        return res.status(401).send({ error: "Unauthorized" });
    }

    console.log("Received authorized data:", data);
    res.status(200).send({ message: "Data received successfully." });
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
