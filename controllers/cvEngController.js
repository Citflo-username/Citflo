module.exports = (req,res) => {
	requestStr = req.url.split("/")
	requestStr = req.url

	// provide some useful information to the console
	console.log("\n")
	console.log("_________________________________________________")
	console.log(`This is the controller for...`)
	console.log(`Url request: ${requestStr}`)
	console.log("_________________________________________________")

	res.render('cv-eng')
}


