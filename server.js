var http = require("http");
var mysql = require("mysql")

var log = require("./server/logging.js").log
var initDatabase = require("./server/initDatabase.js")
var secrets = {};
try{ secrets = require("./server/secrets.js") } catch(e) {console.log("secrets.js is well hidden")}
// Connection
var CONNECTION_JSON = {
    user: process.env.db_user || secrets.db_user,
    password: process.env.db_pass || secrets.db_pass,
    host: process.env.db_host || secrets.db_host,
    database: process.env.db_db || secrets.db_database,
    multipleStatements: true
}

console.log(CONNECTION_JSON)

// Database
const DROP_AND_CREATE_TABLES = true;

// Run da Server
var server = http.createServer(serverHandler);
var con = mysql.createConnection(CONNECTION_JSON)

log("Connecting to DB...")

con.connect(function(err){
    if(err) throw err;

    log("Connected to DB!")

    if(DROP_AND_CREATE_TABLES) {
        log("Creating tables...")
        initDatabase.createTables(con)
        log("Created tables! (suppousedly, unsynced :p)")
    }

    // Coerce our dearest Heroku MySQL database to not shut the connection. 
    setInterval(function(){con.query("SELECT 1;")}, 5000)

    const PORT = process.env.port || 80
    //console.log("Listening on port "+PORT)
    log("Listening on port "+PORT)
    server.listen(PORT);
})

function serverHandler(req, res){
    log("Someone connected!")
    res.end("Hey there!");
}