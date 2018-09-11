var http = require("http");
var mysql = require("mysql")

var APIs = require("./server/APIs.js")
var log = require("./server/logging.js").log
var initDatabase = require("./server/initDatabase.js")
var secrets = {};
try{ secrets = require("./server/secrets.js") } catch(e) {console.log("secrets.js is well hidden")}

// Connection string
var CONNECTION_JSON = {
    user: process.env.db_user || secrets.db_user,
    password: process.env.db_pass || secrets.db_pass,
    host: process.env.db_host || secrets.db_host,
    database: process.env.db_database || secrets.db_database,
    multipleStatements: true
} // We get our connection data either from the environment variables or from secrets.js

// Database
const DROP_AND_CREATE_TABLES = false; // Delete all tables and remake them. Bear with this!!

// Run da Server
startServer()

function startServer(){
    var server = http.createServer(requestListener);
    var con = mysql.createConnection(CONNECTION_JSON)

    log("Starting server!")
    log("Connecting to DB...")
    con.connect(function(err){
        if(err) throw err;

        log("Connected to DB!")

        if(DROP_AND_CREATE_TABLES) {
            log("Creating tables...")
            initDatabase.createTables(con)
            log("Created tables! (suppousedly, unsynced :p)")
        }
        // Coerce our dearest Heroku MySQL database to not shut down the connection.
        setInterval(function(){con.query("SELECT 1;")}, 5000)

        const PORT = process.env.PORT || 80
        //console.log("Listening on port "+PORT)
        log("Listening on port "+PORT)
        server.listen(PORT);
    })
}

function requestListener(req, res){
    try {
        var clientIP = req.socket.remoteAddress
        log("Client "+clientIP+" has requested: " + req.url)
        var url = req.url

        // API calls
        API_url = url.substring(1)
        if(APIs[API_url]){
            log("An API has been called!")
            APIs[API_url]()
        }

        res.end("Hey there!");
    }
    catch(e){
        log(e)
        res.end("An unexpected error has occurred :(")
    }
}