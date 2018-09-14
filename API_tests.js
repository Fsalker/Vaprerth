var server = require("./server.js")
var request = require("request")
var util = require("util")

request.post = util.promisify(request.post) // Make requests "await"able

// I tried avoiding "callback hell" as much as I could by employing promises, async/await etc, but in the end I decided to resort to it.
// Any constructive ideas as to solve this?
//  -> Solution #1: create 10000 functions that call each other. Pretty fine, huh?

function deleteAccount(){
    console.log("       Deleting user")
    request.post("http://localhost:80/deleteAccount", {json: {"username": username, "password": password}}, function(err, res, body){
        if(err || res.statusCode != 200) {console.error(err); console.log(res.statusCode); throw "Account deletion failed!"}
        register()
    })
}

function register(){
    console.log("       Registering")
    request.post("http://localhost:80/register", {json: {"username": username, "password": password, "birthDate": birthDate, "email": email}}, function (err, res, body) {
        if (err || res.statusCode != 200) {console.error(err); console.log(res.statusCode); throw "Account deletion failed!"}
        sessionHash_register = body.sessionHash
        login()
    })
}

function login(){
    console.log("       Logging in")
    request.post("http://localhost:80/login", {json: {"username": username, password: password}}, function(err, res, body){
        if (err || res.statusCode != 200) {console.error(err); console.log(res.statusCode); throw "Account deletion failed!"}
        sessionHash_login = body.sessionHash

        console.log(sessionHash_register)
        console.log(sessionHash_login)
    })
}

async function runTests() {
    username = "gigelus"
    password = "hithwewthi"
    birthDate = "1995-07-30"
    email = "lol@lol.lolz"

    deleteAccount(register)
}

runTests()