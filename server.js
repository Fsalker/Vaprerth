var http = require("http")
var mysql = require("mysql")
var fs = require("fs")
var util = require("util")

var APIs = require("./server/APIs.js")
var log = require("./server/logging.js").log
var initDatabase = require("./server/initDatabase.js")
var secrets = {};
try{ secrets = require("./server/secrets.js") } catch(e) {console.log("secrets.js is well hidden")}

// Connection string
var CONNECTION_JSON = {
    connectionLimit: 10,
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

var con; // Connection variable
function startServer(){
    var server = http.createServer(requestListener);
    con = mysql.createConnection(CONNECTION_JSON)
    //con = mysql.createPool(CONNECTION_JSON)
    con.query = util.promisify(con.query) // Make quieries "await"able

    log("Starting server!")
    log("Connecting to DB...")
    //con.getConnection(function(err){
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

        // Solve public file request (.html, .js, .png, ...)
        var rightmostItem = url.split("/").pop()
        if(url == "/" || rightmostItem.indexOf(".") != -1) { // Index request OR file request because the extension is specified (no, we don't serve files that don't have extensions. Sorry!)
            if(url == "/") rightmostItem = "index.html" // Handle default index requests
            log("File has been requested: " + rightmostItem)
            fs.readFile("./public/"+rightmostItem, function(err, data){
                if(err) {log(err); res.end("Oh noes, an error has occurred during processing your request.")}
                else {
                    var extension = rightmostItem.split(".").pop()
                    log("File has been sent succesfully!")
                    res.end(data)
                }
            })
        }
        else {
            // Solve API calls
            API_url = url.substring(1)
            if (APIs[API_url]) { // This is an API request
                log("An API has been requested!")
                var body = []
                // Catch incoming request body data
                req.on("error", (e) => {throw encodeURI()})
                req.on("data", (chunk) => {body.push(chunk)})
                req.on("end", () => {
                    try{
                        body = JSON.parse(Buffer.concat(body).toString())
                        APIs[API_url](res, con, body) // Let the API function handle our request
                    }
                    catch(e)
                    {
                        log(e)
                        res.end("An error has occurred. Most likely, the request data could not be parsed.")
                    }
                })
            }
            else // This is... dunno, nothing.
                res.end("Hey there! Your request could not be processed. This is likely a programming error! Stand by until we've solved it... (or contact us)");
        }
    }
    catch(e){
        log(e)
        res.end("An unexpected error has occurred :(")
    }
}