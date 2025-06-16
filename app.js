// const express = require('express');
// const path = require('path');
// const app = express();
// const port = 3000;

// // Set EJS as the view engine
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));


// app.use(express.static(path.join(__dirname, 'public'))); // ✅ serves ./public as root

// const rootController = require('./controllers/root')
// const cvEngController = require('./controllers/cvEngController')
// const pSankeyController = require('./controllers/pSankeyController')


// app.get('/', rootController)
// app.get('/en', rootController)
// app.get('/fr', rootController)
// app.get('/cv-eng', cvEngController)
// app.get('/viz/p-sankey', pSankeyController)


// app.listen(port, () => {
// 	console.log(`Server running at http://localhost:${port}`);
// });


const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json()); // 🆕 Required for parsing JSON body
app.use(express.static(path.join(__dirname, 'public')));

const rootController = require('./controllers/root');
const cvEngController = require('./controllers/cvEngController');
const pSankeyController = require('./controllers/pSankeyController');
const dataController = require('./controllers/dataController'); // 🆕
const exportDataController = require('./controllers/exportDataController');
const plotLast8hController = require('./controllers/plotLast8hController');
const apiLast8hController = require('./controllers/apiLast8hController');




app.get('/', rootController);
app.get('/en', rootController);
app.get('/fr', rootController);
app.get('/cv-eng', cvEngController);
app.get('/viz/p-sankey', pSankeyController);
app.get('/export/tsv', exportDataController);
app.get('/viz/last-8h', plotLast8hController);    // returns the page
app.get('/api/last-8h', apiLast8hController);     // returns the JSON data


// 🆕 POST endpoint for data
app.post('/data', dataController);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
