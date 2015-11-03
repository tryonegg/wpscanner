var
	maxconnections = 50,
	fs = require('fs'),
	http = require('http'),
	https = require('https'),
	cheerio = require("cheerio"),
	_ = require("underscore"),
	Backbone = require("backbone"),
	listURL = "http://www.utexas.edu/world/univ/alpha/";
	links = Array();

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
	},
	
	fetched: false,
	body: null,
	plugins: [],

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

		//we found wordpress
		if( this.get("wordpress") ){
			//we dont know the version, perhaps the readme.html can help
			if (this.get("version") == "unknown"){
				this.checkreadme();
				return;
			}

			//we do know the version, lets see if its multisite
			this.checkmultsite();
			return;
		}

		//its not wordpress go on our way
		if( !this.get("wordpress") ){
			this.set("wordpress", false);
			this.trigger("processed", this);
		}

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
	
	checkslugs: function(){
		var found = false;
		//search the source for a reference to wp-content
		if(-1 !== this.body.indexOf('wp-content') ){
			found = true;
		}

		//look for jetpack
		if(-1 !== this.body.indexOf('plugins/jetpack/css') ){
			found = true;
			this.plugins.push("jetpack");
		}

	
		if(found){
			this.set("wordpress", true);
			this.set("version", "Unknown");
		}

	},
	
    //search for the readme.html file
    checkreadme: function(){

    },
    //search for wp-admin	
	
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
			return (model.fetched === false)? true : false;
		});
		
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
	
	//write out the data to a nice tasty json file
	writeLogs: function(){
		fs.writeFile("logs.json", JSON.stringify(this), function(err) {
			if(err) {
				return console.log(err);
			}
			console.log("Loged saved to logs.json!");
		});		
	}
	
});
var sites = new Sites();

//get the list of sites
request(listURL, function (error, response, body) {
	if (!error) {
		var $ = cheerio.load(body),
			hrefs = $("table.body > tr").last().find("a");
		
		hrefs.each(function(i, element) {
			
			//populate the sites
			sites.add({
				"url": element.attribs.href,
				"title" : element.children[0].data
			})
		}, this);
		//fire off the site check
		sites.startChecking();
	} else {
		console.log("We’ve encountered an error: " + error);
	}
});