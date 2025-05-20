const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(express.static(path.join(__dirname, 'public'))); // ✅ serves ./public as root

app.get('/', (req, res) => {
	res.render('main'); // Looks for views/main.ejs
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
