const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req,res) => {
	res.send('Welcome to laboratoire Citflo, the home for research from Professor Dwight Houweling');
});

app.listen(port, () => {
	console.log(`Server running at local host: ${port}`);
});
