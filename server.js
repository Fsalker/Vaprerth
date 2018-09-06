var http = require("http");
var mysql = require("mysql")

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

// Database
const DROP_AND_CREATE_TABLES = true;

// Run da Server
var server = http.createServer(serverHandler);
var con = mysql.createConnection(CONNECTION_JSON)

console.log("Connecting to DB...")

con.connect(function(err){
    if(err) throw err;

    console.log("Connected to DB!")

    if(DROP_AND_CREATE_TABLES) {
        console.log("Creating tables...")
        initDatabase.createTables(con)
        console.log("Created tables! (suppousedly, unsynced :p)")
    }

    // Coerce our dearest Heroku MySQL database to not shut the connection. 
    setInterval(function(){con.query("SELECT 1;")}, 5000)

    const PORT = process.env.port || 80
    console.log("Listening on port "+PORT)
    server.listen(PORT);
})

function serverHandler(req, res){
    console.log("Someone connected!")
    res.end("Hey there!");
}