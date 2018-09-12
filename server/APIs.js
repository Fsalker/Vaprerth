var mysql = require("mysql")
var crypto=require("crypto")
var log = require("./logging.js").log

const SALT = require("./secrets.js").hash_salt
const SESSION_LENGTH_DAYS = 30

function logErrorAndEndRequest(res, err){
    log(err)
    res.end("An error has occurred when handling the request.")
}

function hash_string(word){
    return crypto.createHash("sha256").update(word + SALT).digest("hex")
}

function endRequestWithMessage(res, status, msg){
    res.writeHead(status, {"content-type": "text/html"})
    res.end(msg)
}

function generateUserSession(res, con, username, callback){ // And return the hash
    hash = hash_string(Math.random().toString())

    con.query("INSERT INTO Sessions(userId, hash) VALUES((SELECT id FROM Users WHERE username=?), ?)", [username, hash], function(err, q_res, fields){
        if(err) logErrorAndEndRequest(res, err)
        else {
            callback(hash)
        }
    })
}

function validateUserAuthentification(res, con, username, sessionHash, callback){ // Checks if the user can auth with their session and calls a callback with a true/false argument
    con.query("SELECT a.id FROM Users a JOIN Sessions b on a.id = b.userId  WHERE a.username = ? AND b.hash = ? AND b.ts >= DATE_SUB(NOW(), INTERVAL "+SESSION_LENGTH_DAYS+" DAY) ORDER BY b.ts DESC", [username, sessionHash], function(err, q_res, fields){
        if(err) logErrorAndEndRequest(res, err)
        callback(q_res.length > 0)
    })
}

module.exports = { // Request functions: all of them receive GET / POST / etc parameters in the "data" json :]
    /* Registers the user
            Input:
        username
        password
        birthDate
        email

            Output:
         200 with {sessionHash: string} or 400 with message */
    register: function(res, con, data){
        if(!data.username || !data.password || !data.birthDate || !data.email) return endRequestWithMessage(res, 400, "Invalid parameters")
        var age = (Date.now() - new Date(data.birthDate)) / (1000*60*60*24*365)
        if(age < 0 || age > 150) endRequestWithMessage(res, 400, "Invalid age")

        data.password = hash_string(data.password) // Hash the password!

        con.query("INSERT INTO Users(username, password_hash, birthDate, email) VALUES(?, ?, ?, ?)", [data.username, data.password, data.birthDate, data.email], function (err, q_res, fields) {
            if (err) return logErrorAndEndRequest(res, err)

            generateUserSession(res, con, data.username, function(sessionHash){
                log("User "+data.username+" has registered.")
                return endRequestWithMessage(res, 200, JSON.stringify({sessionHash: sessionHash}))
            })
        })
    },

    /* Logs in with username & password to create a sessionHash
            Input:
        username
        password

            Output:
         200 with {sessionHash: string} or 400 / 401 with message */
    login: function(res, con, data){
        if(!data.username || !data.password) return endRequestWithMessage(res, 400, "Invalid parameters")
        data.password = hash_string(data.password)

        con.query("SELECT id FROM Users WHERE username = ? AND password_hash = ?", [data.username, data.password], function(err, q_res, fields){
            if(err) return logErrorAndEndRequest(res, err)
            if(q_res.length == 0) // Login failed
                endRequestWithMessage(res, 401, "Login failed")
            else
                generateUserSession(res, con, data.username, function(sessionHash){
                    log("User "+data.username+" has logged in.")
                    endRequestWithMessage(res, 200, JSON.stringify({sessionHash: sessionHash}))
                })
        })
    },

    /*      Input:
            username
            sessionHash

            */
    logout: function(res, con, data){
        if(!data.username || !data.sessionHash) return endRequestWithMessage(res, 400, "Invalid parameters")
        validateUserAuthentification(res, con, data.username, data.sessionHash, function(goodCredentials){
            if(!goodCredentials) return endRequestWithMessage(res, 401, "Authentification failed")
            con.query("DELETE FROM Sessions WHERE userId IN(SELECT id FROM Users WHERE username=?) AND hash=?", [data.username, data.sessionHash], function(err, q_res, fields){
                if(err) return logErrorAndEndRequest(res, err)
                endRequestWithMessage(res, 200, "Okay")
            })
        })
    },

    updateAccountData: function(res, con, data){

    },

    message: function(res, con, data){

    },

    createEvent: function(res, con, data){

    },

    joinEvent: function(res, con, data){

    },

    editEvent: function(res, con, data){

    },

    leaveEvent: function(res, con, data){

    },

    getEvents: function(res, con, data){

    },

    getPublicUserData: function(res, con, data){

    },

    deleteAccount: function(res, con, data){

    },

    changePassword: function(res, con, data){

    },

    verifyPassword: function(res, con, data){

    },

    comment: function(res, con, data){

    },

    createGroup: function(res, con, data){

    },

    joinGroup: function(res, con, data){

    },

    leaveGroup: function(res, con, data){

    },

    editGroup: function(res, con, data){

    },

    addResource: function(res, con, data){

    },

    addPost: function(res, con, data){

    },

    forgotPasswordRequestSession: function(res, con, data){

    },

    forgotPasswordReset: function(res, con, data){

    },

    checkUsernameAvailability: function(res, con, data){

    },

    checkEmailAvailability: function(res, con, data){

    },

    getFeed: function(res, con, data){

    },

    addFriend: function(res, con, data){ // 0 or 1

    },

    blockUser: function(res, con, data){ // 0 or 1

    },

    getFriends: function(res, con, data){

    },

    getBlockedFriends: function(res, con, data){

    }
}