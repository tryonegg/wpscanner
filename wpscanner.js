var
	fs = require('fs'),
	request = require("request"),
	cheerio = require("cheerio"),
	_ = require("underscore"),
	listURL = "http://www.utexas.edu/world/univ/alpha/",
	links = Array(),
	currentlyChecking = false;


//check to see if its running wordpress
function isWordPress(body, url){
	
	//search for the generator tag
    var generator = body.indexOf('<meta name="generator" content="WordPress');
    if(-1 != generator){
        var endgenerator = body.indexOf('" />', generator);
        var version = body.substr(generator + 42, endgenerator-generator-42);
        return version;
    }
    
    //search the source for a reference to wp-content
    var wpcontent = body.indexOf('wp-content');
    if(-1 != wpcontent){
		return true;
	}
    //search for the readme.html file
    
    //search for wp-admin
	
	return false;
}


//fetch the urls
function fetchUrls(){
	currentlyChecking =	_.findWhere( links, {fetched: false} );
	if(currentlyChecking == undefined){
		//console.log( links );
		fs.writeFile("logs.json", JSON.stringify(links), function(err) {
			if(err) {
				return console.log(err);
			}
			console.log("Loged saved to logs.json!");
		}); 	
		return;
	};
	
	console.log("Checking", currentlyChecking.title);
	request(currentlyChecking.url, function (error, response, body) {
		currentlyChecking.fetched = true;
		if (!error) {
			currentlyChecking.wordpress = isWordPress(body, currentlyChecking.url );
			if(currentlyChecking.wordpress == true){
				console.log("	WordPress: unknown version");	
			} else if(currentlyChecking.wordpress){
				console.log("	WordPress: " + currentlyChecking.wordpress);			
			} else {
				console.log("	Not running WordPress");
			}
		} else {
			console.log(error);
		}

		fetchUrls();
	});

}


//get the list of college and universities urls	and build an object array
request(listURL, function (error, response, body) {
	if (!error) {
		var $ = cheerio.load(body),
			hrefs = $("table.body > tr").last().find("a");
		
		hrefs.each(function(i, element) {
			links.push({
				"url": element.attribs.href,
				"title" : element.children[0].data,
				"wordpress" : false,
				"fetched" : false
			});
		}, this);
		fetchUrls();
	} else {
		console.log("We’ve encountered an error: " + error);
	}
});