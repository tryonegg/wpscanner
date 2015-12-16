var
	maxconnections = 50,
	fs = require('fs'),
	http = require('http'),
	https = require('https'),
	cheerio = require("cheerio"),
	_ = require("underscore"),
	Backbone = require("backbone"),
	stringify = require('csv-stringify'),
	parse = require('csv-parse'),
	prompt = require('prompt'),
	
	//listURL = "http://www.utexas.edu/world/univ/alpha/",
	listURL = "https://raw.githubusercontent.com/endSly/world-universities-csv/master/world-universities.csv",
	links = Array(),
	logsDir = './logs';

http.globalAgent.maxSockets = maxconnections;
https.globalAgent.maxSockets = maxconnections;

var baseRequest = require("request");
var request = baseRequest.defaults({
  time: true,
  timeout: 10000,
});
	
var Site = Backbone.Model.extend({
	defaults:{
		url: null,
		title: null,
		wordpress: null,
		version: null, 
		multisite: null,
		elapsedTime: null,
		plugins: null,
		country: null,
	},
	
	fetched: false,
	fetchedreadme: false,
	checkedplugins: false,
	body: null,

	initialize: function() {},

	isWordPress: function(){
		if( this.get('wordpress') != null ) return this.get('wordPress');
		
		//Make sure the url was fetched so we can proces it
		if( this.fetched == false ){
			this.fetched = "pending";
			this.checksite();
			return;
		}
		
		//is fetched now process
		this.checkGeneratorTag();

		if( null === this.get("wordpress")) this.checkslugs();

		//last ditch attempt to find wordpress, check for common plugins
		if( null === this.get("wordpress")) this.checkPlugins();

		if( this.get("wordpress") ){
			this.itIsWordPress();
		}
		

		//its not wordpress go on our way
		if( !this.get("wordpress") ){
			this.set("wordpress", false);
			this.trigger("processed", this);
		}

	},

	itIsWordPress: function(){
		//we found wordpress
		
		//we are not sure what the version number is, perhaps the readme.html can help
		if (this.get("version") == "Unknown"){
			this.checkreadme();
			return;
		}

		//lets search for some common plugins
		this.checkPlugins();

		//we probably know the version, lets see if its multisite
		this.checkmultsite();
		return;

	},
	
	addPlugin: function(plugin){
		var plugins = this.get("plugins");
		if( plugins == null ) plugins = [];
		plugins.push(plugin);
		this.set("plugins", plugins); 
	},

	checksite: function(){
		request(this.get('url'),  function ( error, response, body ){
			if (!error) {
				this.body = body;
				this.fetched = true;
				this.set("elapsedTime", response.request.elapsedTime);
				this.isWordPress();
			} else {
				console.log(error);
				this.fetched = true;
				this.trigger("processed", this);
			}
		}.bind(this));
	},
		
	checkGeneratorTag: function(){
		//search for the generator tag
		var generator = this.body.indexOf('<meta name="generator" content="WordPress');
		if(-1 != generator){
			var endgenerator = this.body.indexOf('" />', generator);
			var version = this.body.substr(generator + 42, endgenerator-generator-42);
			
			this.set("wordpress", true);
			this.set("version", version);

		}		
	},


	//check for some common WP html code	
	checkslugs: function(){

		//search the source for a reference to wp-content
		if(-1 !== this.body.indexOf('wp-content') ){
			this.set("wordpress", true);
		}

	},
	
	//check for some common plugins
	checkPlugins: function(){
		if(this.checkedplugins == true) return;
		this.checkedplugins = true;

		//look for jetpack
		if( this.body.indexOf('plugins/jetpack/css') >= 0 ){
			this.set("wordpress", true);
			this.addPlugin("jetpack");
		}

		//look for WP Super Cache
		if( this.body.indexOf('generated by WP-Super-Cache') >= 0 ){
			this.set("wordpress", true);
			this.addPlugin("WP Super Cache");
		}


	},

    //search for the readme.html file
    checkreadme: function(){
    	if( this.fetchedreadme == true ) this.isWordPress();
    	
    	this.fetchedreadme = true;

		request(this.get("url") + "/readme.html", function ( error, response, body) {
			if (!error) {
				var versionstart = body.indexOf("<br /> Version");
				var versionend = body.indexOf("\r\n", versionstart);
				var version = body.substr(versionstart + 15, 5);
				this.set("version", version);

			} else {
				console.log(error);
			}

			this.itIsWordPress();
			return;
		}.bind(this));
    },
    //search for wp-admin	
	
    //check if the site is running MultiSite
	checkmultsite: function(){
		//ping site/wp-includes/ms-files.php if its multsite it will response as a 404
		// if multisite is not enabled it will say so
		request(this.get("url") + "/wp-includes/ms-files.php", function ( error, response, body) {
			if (!error) {
				if( response.statusCode == 404 ) this.set("multisite", true);
				else this.set("multisite", false);
			} else {
				console.log(error);
			}

			this.trigger("processed", this);
		}.bind(this));

	}

});

var Sites = Backbone.Collection.extend({
	model: Site,
	activeConnections: 0,
	country: false,
		
	initialize: function(){
		this.on( "processed", this.processed, this );
	},
	
	processed: function( model ){
		this.activeConnections--;
		console.log("Processed", model.get("title"));
		console.log("Active Connections", this.activeConnections);
		this.checkSite();
	},
	
	startChecking: function(){
		//spin up x number of checkers
		for (var index = 0; index < maxconnections; index++) {
			this.checkSite();
		}
	},

	checkSite: function(){
		//find a new site to check
		var s = this.find(function(model){
			if(this.country){
				return (model.fetched === false && model.get("country") == this.country)? true : false;
			} else {
				return (model.fetched === false)? true : false;			
			}
		}.bind(this));
		
		//if we found a site check it
		if(s){
			console.log("Checking", s.get("title"));
			this.activeConnections++;
			s.isWordPress();
			return;
		}

		//we didnt find any sites we must be done
		if(this.activeConnections == 0){
			this.writeLogs();
		}
	},
	
	//write out the data to a nice tasty json & CSV file
	writeLogs: function(){
		if (!fs.existsSync(logsDir)){
			fs.mkdirSync(logsDir);
		}
		
		if(this.country){
			jsonsites = this.where({country: this.country});
			for (var index = 0; index < jsonsites.length; index++) {
				jsonsites[index] = jsonsites[index].toJSON();
				
			}
		} else {
			jsonsites = this.toJSON();
		}
		
		fs.writeFile(logsDir + "/logs.json", JSON.stringify(jsonsites), function(err) {
			if(err) {
				return console.log(err);
			}
			console.log("Loged saved to " + logsDir + "/logs.json!");
		});

		stringify(jsonsites, {header: true},function(err, output){
			fs.writeFile(logsDir + "/logs.csv", output, function(err) {
				if(err) {
					return console.log(err);
				}
				console.log("Loged saved to " + logsDir + "/logs.csv!");
			});
		});
	}
	
});
var sites = new Sites();

parser = parse(function(err, data){ 
	for (var i = 0; i < data.length; i++) {
		var element = data[i];
		
		sites.add({
			"country": element[0],
			"url": element[2],
			"title" : element[1]
		})
	}
	console.log("Sites Added: ", sites.length);
	
	console.log(
		sites.countBy(function(i){
			return i.get("country");
		})
	);	
	
	promptuser();
	
}); 

promptuser = function(){
	
	prompt.start();

	prompt.get(["connections", "country"], function(err, result){
		if(result.connections != ""){
			maxconnections = result.connections
		}
		
		console.log(result.country.toUpperCase());
		
		if(result.country != ""){
			sites.country = result.country.toUpperCase();
		}

		//fire off the site check
		sites.startChecking();

	});	
	
}

console.log("Updateing institution list");

request
  .get( listURL )
  .on('error', function(err) {
	console.log("We’ve encountered an error: " + error);
  })
  .pipe(parser);