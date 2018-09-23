var mysql = require("mysql")
var crypto = require("crypto")
var nodemailer = require('nodemailer');
var log = require("./logging.js").log
var mailTransporter = nodemailer.createTransport(require("./secrets.js").mailTransporterData)

// Config (more or less)
const SALT = require("./secrets.js").hash_salt
const SESSION_LENGTH_DAYS = 30
const PASSWORD_RESET_LENGTH_MINUTES = 30
const DELETED_USER_ID = -666
const RESERVED_EMPTY_USERID = -420
const ALLOWED_TARGETTYPES = ["user", "comment", "event", "post"]
const GROUP_PUBLICITY_TYPES = ["public", "inviteOnly", "private"]
const SUPER_SECRET_ADMIN_PASSWORD = require("./secrets.js").super_secret_admin_pass

// Messages
const INVALID_PARAMETERS = "Invalid parameters."
const AUTHENTIFICATION_FAILED = "Authentification failed."

async function sendMail(email, subject, content){
    return new Promise(resolve => {
        var mailOptions = {
            to: email,
            subject: subject,
            html: content
        };

        mailTransporter.sendMail(mailOptions, (err, info) => {
            if(err) return reject(err)
            log(`Mail with subject "${subject} has been sent to address ${email}"`)
            resolve()
        })
    })
}

//sendMail("andreiii500@yahoo.com", "Hello Andrei!", "<h1>Greetings!</h1><h4 style='background-color: lightgreen; color: darkred'>sup sup sup sup</h4>")

function getIdFromUsername(con, username){ // Checks if the user/session combo is valid
    return new Promise( resolve => {
        con.query("SELECT id FROM Users WHERE username = ?", username, function(err, q_res, fields){
            if(err) return logErrorAndEndRequest(res, err)
            if(q_res.length == 0) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            resolve(q_res[0].id)
        })
    })
}

function undefinedItemInArray(arr){
    for(item of arr)
        if(item == undefined)
            return true

    return false
}

function validUsername(name){
    // Allow only alphanumeric characters, dashes and underscores
    re = /[^a-zA-Z0-9-_]/
    if(re.exec(name))
        return false
    return true
}

function logErrorAndEndRequest(res, err){
    log(err)
    res.writeHead(500)
    res.end("An error has occurred when handling the request.")
}

function hash_string(word){ // Gets a string, returns a salted hash
    return crypto.createHash("sha256").update(word + SALT).digest("hex")
}

function random_hash(){ // Returns a random sha256 hash
    return hash_string(Math.random().toString())
}

function endRequestWithMessage(res, status, msg){
    res.writeHead(status, {"content-type": "text/html"})
    res.end(msg)
}

async function generateUserSession(res, con, username){ // And return the hash
    hash = random_hash()

    await con.query("INSERT INTO Sessions(userId, hash) VALUES((SELECT id FROM Users WHERE username=?), ?)", [username, hash])
    return hash
}

function validateUserAuthentification(res, con, username, sessionHash){ // Checks if the user/session combo is valid
    return new Promise( resolve => {
        con.query("SELECT a.id FROM Users a JOIN Sessions b on a.id = b.userId  WHERE a.username = ? AND b.hash = ? AND b.ts >= DATE_SUB(NOW(), INTERVAL "+SESSION_LENGTH_DAYS+" DAY) ORDER BY b.ts DESC", [username, sessionHash], function(err, q_res, fields){
            if(err) return logErrorAndEndRequest(res, err)
            if(q_res.length == 0) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            resolve(true)
        })
    })
}

async function initialiseNewUser(res, con, username){
    return new Promise( async(resolve) => {
        q_res = await con.query("SELECT id FROM Users WHERE username = ?", [username])
        userId = q_res[0].id
        q_res = await con.query("SELECT * FROM Settings")
        valArr = []
        placeholderArr = []
        for(setting of q_res) {
            valArr.push(userId, setting.id, setting.defaultValue)
            placeholderArr.push("(?, ?, ?)")
        }
        placeholderStr = placeholderArr.join(",")

        sql = "INSERT INTO UserToSetting(userId, settingId, value) VALUES " + placeholderStr

        await con.query(sql, valArr)

        resolve()
    })
}

module.exports = { // Request functions: all of them receive GET / POST / etc parameters in the "data" json :]
    /* Registers the user
            Input:
        username // Must be alphanumeric, dashes and underscores are allowed
        password
        birthDate
        email

            Output:
         {sessionHash: string} */
    register: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.password, data.birthDate, data.email])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)

            usernameTaken = await con.query("SELECT id FROM Users WHERE username=?", data.username)
            if((await con.query("SELECT id FROM Users WHERE username=?", data.username)).length > 0) return endRequestWithMessage(res, 409, "Username is already taken.")
            if((await con.query("SELECT id FROM Users WHERE email=?", data.email)).length > 0) return endRequestWithMessage(res, 409, "Email is already taken.")

            var age = (Date.now() - new Date(data.birthDate)) / (1000*60*60*24*365)
            if(age < 0 || age > 150) return endRequestWithMessage(res, 400, "Invalid age")
            if(!validUsername(data.username)) return endRequestWithMessage(res, 400, "Invalid username")

            data.password = hash_string(data.password) // Hash the password!

            await con.query("INSERT INTO Users(username, password_hash, birthDate, email) VALUES(?, ?, ?, ?)", [data.username, data.password, data.birthDate, data.email])
            await initialiseNewUser(res, con, data.username)
            sessionHash = await generateUserSession(res, con, data.username)
            log("User " + data.username + " has registered.")
            return endRequestWithMessage(res, 200, JSON.stringify({sessionHash: sessionHash}))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Logs in with username & password to create a sessionHash
            Input:
        username
        password

            Output:
        {sessionHash: string} */
    login: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.password])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            data.password = hash_string(data.password)

            authMatches = await con.query("SELECT id FROM Users WHERE username = ? AND password_hash = ?", [data.username, data.password])
            if(authMatches.length == 0) return endRequestWithMessage(res, 401, "Login failed")

            sessionHash = await generateUserSession(res, con, data.username)
            log("User "+data.username+" has logged in.")
            endRequestWithMessage(res, 200, JSON.stringify({sessionHash: sessionHash}))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Logs out an user by destroying the associated session
          Input:
        username
        sessionHash */
    logout: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!(await validateUserAuthentification(res, con, data.username, data.sessionHash))) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            con.query("DELETE FROM Sessions WHERE userId IN(SELECT id FROM Users WHERE username=?) AND hash=?", [data.username, data.sessionHash], function(err, q_res, fields){
                if(err) return logErrorAndEndRequest(res, err)
                log("User "+data.username+" has logged out.")
                //endRequestWithMessage(res, 200, "Okay")
                res.writeHead(200)
                res.end()
            })
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Sets an user's account data
            Input:
        username
        sessionHash
        (optionally) email, birthDate, country, biography, imgName
     */
    updateAccountData: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!(await validateUserAuthentification(res, con, data.username, data.sessionHash))) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            sql = "UPDATE Users SET "
            setArr = []
            valArr = []
            if(data.email) {setArr.push("email = ?"); valArr.push(data.email)}
            if(data.birthDate) {setArr.push("birthDate = ?"); valArr.push(data.birthDate)}
            if(data.country) {setArr.push("country = ?"); valArr.push(data.country)}
            if(data.biography) {setArr.push("biography = ?"); valArr.push(data.biography)}
            if(data.imgName) {setArr.push("imgName = ?"); valArr.push(data.imgName)}

            if(setArr.length == 0) return endRequestWithMessage(res, 400, "Cannot update nothing. You must specify at least 1 of email, birthDate etc...")
            //if(!(await validateUserAuthentification(res, con, data.username, data.sessionHash))) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)
            sql += setArr.join(",")
            sql += " WHERE username = ?"

            await con.query(sql, valArr.concat(data.username))
            res.writeHead(200)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Sets an user's settings
            Input:
        username
        sessionHash
        (optionally) settings received with /getAllSettings (publicCountry, receiveNewsletter, ...)
     */
    updateUserSettings: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!(await validateUserAuthentification(res, con, data.username, data.sessionHash))) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)

            delete data.username
            delete data.sessionHash
            q_res = await con.query("SELECT settingName FROM Settings")

            validSettingNames = q_res.reduce( (acc,val) => acc.concat(val.settingName), [])
            //log(validSettingNames)
            settingArr = []
            for(settingName in data)
                if(validSettingNames.indexOf(settingName) != "-1") // Setting name is valid
                    settingArr.push({settingName: settingName, value: data[settingName]})
                    //delete data[settingName] // Discard it
            if(settingArr.length == 0) return endRequestWithMessage(res, 400, "You must specify at least 1 valid setting to update.")

            for(setting of settingArr) {
                sql = `UPDATE UserToSetting SET value=? WHERE userId=? AND settingId IN (SELECT id FROM Settings WHERE settingName = ?)`
                //log(sql)
                //log(setting.value+" "+userId+" "+setting.settingName)
                await con.query(sql, [setting.value, userId, setting.settingName])
            }

            res.writeHead(200)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Gets an user's settings
            Input:
        username
        sessionHash

            Output:
        {setting1, setting2, ...} settings received from /getAllSettings
     */
    getUserSettings: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!(await validateUserAuthentification(res, con, data.username, data.sessionHash))) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)
            q_res = await con.query("SELECT b.settingName, a.value FROM UserToSetting a JOIN Settings b on a.settingId = b.id WHERE userId IN (SELECT id FROM users WHERE username=?)", data.username)
            settingArr = q_res.reduce( (acc, val) => {acc[val.settingName] = val.value; return acc;}, {})

            res.writeHead(200)
            res.end(JSON.stringify(settingArr))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Gets possible settings for an User (public email or country, receiveNewsletter etc..)
            Output:
        ["setting1", "setting2", ...] // "true" / "false" for booleans, max 10 char string for others
     */
    getAllSettings: async function(res, con, data){
        try{
            q_res = await con.query("SELECT * FROM Settings")
            res.writeHead(200)
            res.end(JSON.stringify(q_res))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    message: async function(res, con, data){

    },

    createEvent: async function(res, con, data){

    },

    joinEvent: async function(res, con, data){

    },

    editEvent: async function(res, con, data){

    },

    leaveEvent: async function(res, con, data){

    },

    getEvents: async function(res, con, data){

    },

    /* Someone wants to know if they can access the secret admin panel (by sharing their SUPER SECRET)
            Input:
        -superSecretPassword
     */
    canIaccessTheSuperSecretAdminPanel: async function(res, con, data){
        try{
            if(undefinedItemInArray(data.superSecretPassword)) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(data.superSecretPassword != SUPER_SECRET_ADMIN_PASSWORD) return endRequestWithMessage(res, 666, "no")

            res.end() // yes
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    viewReports: async function(res, con, data){
        try{
            if(undefinedItemInArray(data.superSecretPassword)) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(data.superSecretPassword != SUPER_SECRET_ADMIN_PASSWORD) return endRequestWithMessage(res, 666, "U just got sh@t on br0")

            res.end("SELECT id, username, targetId, targetType, text FROM Reports")
        } catch(e){ logErrorAndEndRequest(res, e) }
    },


    /* User reports another User / Comment / Post / Event / ...
            Input:
        username
        sessionHash
        targetId
        targetType
        text
     */
    sendReport: async function(res, con, data){
        //ALLOWED_TARGETTYPES
        try {
            if(undefinedItemInArray([data.username, data.sessionHash, data.targetId, data.targetType, data.text])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            await con.query("INSERT INTO Reports(username, targetId, targetType, text) VALUES(?, ?, ?, ?)", [data.username, data.target, data.targetType, data.text])
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Site admin views reports by using the superSecretPassword
            Input:
        -superSecretPassword

            Output:
        [{data.username, data.targetId, data.targetType, data.text}]
     */
    viewReports: async function(res, con, data){
        try{
            if(undefinedItemInArray(data.superSecretPassword)) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(data.superSecretPassword != SUPER_SECRET_ADMIN_PASSWORD) return endRequestWithMessage(res, 666, "U just got sh@t on br0")

            res.end("SELECT id, username, targetId, targetType, text FROM Reports")
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Site admin deletes a report
            Input:
        -superSecretPassword
        -reportId

     */
    deleteReport: async function(res, con, data){
        try{
            if(undefinedItemInArray(data.superSecretPassword, data.reportId)) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(data.superSecretPassword != SUPER_SECRET_ADMIN_PASSWORD) return endRequestWithMessage(res, 666, "U just got sh@t on br0")

            con.query("DELETE FROM Reports WHERE id = ?", data.reportId)
            res.end("k br0")
        } catch(e){ logErrorAndEndRequest(res, e) }
    },


    /* Gets public user data
            Input:
        targetUsername

            Output:
        {username, biography, imgName}
        {birthDate, email, country} (optionally, in the same json)
        */
    getPublicUserData: async function(res, con, data){
        try {
            if(undefinedItemInArray([data.targetUsername])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)

            q_res = await con.query("SELECT b.settingName, a.value FROM UserToSetting a JOIN Settings b ON a.settingId = b.id WHERE a.userId IN (SELECT id FROM Users WHERE username = ?)", data.targetUsername)
            settings = q_res.reduce((acc, val) => {acc[val.settingName] = val.value; return acc}, [])

            sql = "SELECT id, username, biography, imgName"
            if(settings["publicBirthdate"] == "true") sql += ", birthDate"
            if(settings["publicCountry"] == "true") sql += ", country"
            if(settings["publicEmail"] == "true") sql += ", email"
            if(settings["publicJoinDate"] == "true") sql += ", ts"
            sql += " FROM Users WHERE username = ?"

            q_res = await con.query(sql, data.targetUsername)
            res.writeHead(200)
            res.end(JSON.stringify(q_res[0]))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Deletes all data associated with a user
            Input:
        username
        password*/
    deleteAccount: async function(res, con, data){
        try {
            if(undefinedItemInArray([data.username, data.password])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            data.password = hash_string(data.password)

            q_res = await con.query("SELECT id FROM Users WHERE username = ?", [data.username])
            if(q_res.length == 0) return endRequestWithMessage(res, 200, "User doesn't exist anyway.")

            q_res = await con.query("SELECT id FROM Users WHERE username = ? AND password_hash = ?", [data.username, data.password])
            if(q_res.length == 0) return endRequestWithMessage(res, 401, "Login failed")

            userId = await getIdFromUsername(con, data.username)

            await con.query(`DELETE FROM Users WHERE id = ?;
                             DELETE FROM Sessions WHERE userId = ?;
                             DELETE FROM UserToUser WHERE userId_from = ? OR userId_to = ?;
                             DELETE FROM UserToGroup WHERE userId = ?;
                             DELETE FROM UserToEvent WHERE userId = ?;
                             DELETE FROM UserToSetting WHERE userId = ?;
                             DELETE FROM FriendRequests WHERE userId = ? OR targetUserId = ?;
                             DELETE FROM Friendships WHERE userId_1 = ? OR userId_2 = ?;
                             DELETE FROM Blockships WHERE userId_1 = ? OR userId_2 = ?;
                             `,[userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId])
            //await deleteAllUserComments(con, userId)
            //await deleteAllUserPosts(con, userId)
            await con.query("UPDATE Comments  SET authorUserId = ? WHERE authorUserId = ?", [DELETED_USER_ID, userId])
            await con.query("UPDATE Posts SET authorUserId = ? WHERE authorUserId = ?", [DELETED_USER_ID, userId])

            // Delete friendships too
            endRequestWithMessage(res, 200, "User has been deleted.")
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User changes their password
            Input:
        username
        password
        newPassword

     */
    changePassword: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.password, data.newPassword])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if((await con.query("SELECT 1 FROM Users WHERE username = ? AND password_hash = ?", [data.username, hash_string(data.password)])).length == 0) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            await con.query("UPDATE Users SET password_hash = ? WHERE username = ?", [hash_string(data.password, data.username)])
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    comment: async function(res, con, data){

    },

    /* User creates a group
            Input:
        username
        sessionHash
        name
        description
        publicity
     */
    createGroup: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash, data.name, data.description, data.publicity])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)
            if(GROUP_PUBLICITY_TYPES.indexOf(data.publicity) == -1) return endRequestWithMessage(res, 400, "Invalid publicity")

            await con.query("INSERT INTO Groups(name, description, publicity) VALUES(?, ?, ?)", [data.name, data.description, data.publicity])
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    groupJoinRequest: async function(res, con, data){

    },

    acceptJoinRequest: async function(res, con, data){

    },

    groupInviteRequest: async function(res, con, data){

    },

    groupInviteRequest: async function(res, con, data){

    },

    removeFromGroup: async function(res, con, data){

    }

    leaveGroup: async function(res, con, data){

    },

    editGroup: async function(res, con, data){

    },

    addResource: async function(res, con, data){

    },

    addPost: async function(res, con, data){

    },

    /* User has forgotten their password, so they request a Key. We send the 8-character Key to their email address.
            Input:
        email
     */
    forgotPasswordRequestKey: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.email])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            usernameQuery = await con.query("SELECT username FROM Users WHERE email = ?", data.email)
            if(usernameQuery.length == 0) return endRequestWithMessage(res, 400, "Account doesn't exist")
            username = usernameQuery[0].username
            key = random_hash().substring(0, 8)
            await con.query("INSERT INTO PasswordResetKeys(email, keyCode) VALUES(?, ?)", [data.email, key])
            var msg = `<h4>Hey there!</h4><p>A password reset key has been requested for your account. It lasts only ${PASSWORD_RESET_LENGTH_MINUTES} minutes, here it is: ${key}</p><p>In case you have also forgotten your username, it is ${username}.</p><br><p>Note: This is an automatically generated mail. In case you haven't requested it, simply ignore it!</p>`
            await sendMail(data.email, "Password reset key", msg)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Validates a password reset key
            Input:
        email
        keyCode
            Output:
        "good" or "bad"
     */
    forgotPasswordValidateKey: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.email, data.keyCode])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            keys = await con.query(`SELECT id FROM PasswordResetKeys WHERE email = ? AND keyCode = ? AND ts >= DATE_SUB(NOW(), INTERVAL ${PASSWORD_RESET_LENGTH_MINUTES} MINUTE)`, [data.email, data.keyCode])

            res.end(keys.length > 0 ? "good" : "bad")
        } catch(e) { logErrorAndEndRequest(res, e) }
    },

    /* Resets an account's forgotten password if the key is valid
            Input:
        email
        keyCode
        newPassword
     */
    forgotPasswordReset: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.email, data.keyCode, data.newPassword])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            keys = await con.query(`SELECT id FROM PasswordResetKeys WHERE email = ? AND keyCode = ? AND ts >= DATE_SUB(NOW(), INTERVAL ${PASSWORD_RESET_LENGTH_MINUTES} MINUTE)`, [data.email, data.keyCode])
            if(keys.length == 0) return endRequestWithMessage(res, 400, "KeyCode is invalid")

            await con.query("UPDATE Users SET password_hash = ? WHERE email = ?", [hash_string(data.newPassword), data.email])

            res.end()
        } catch(e) { logErrorAndEndRequest(res, e) }
    },

    /* Checks that an username is available and not taken
            Input:
        username
            Output:
        "true" or "false"
     */
        checkUsernameAvailability: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            res.end(JSON.stringify((await con.query("SELECT 1 FROM Users WHERE username = ?", data.username)).length == 0))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Checks that an username is available and not taken
            Input:
        email
            Output:
        "true" or "false"
     */
    checkEmailAvailability: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.email])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            res.end(JSON.stringify((await con.query("SELECT 1 FROM Users WHERE email = ?", data.email)).length == 0))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    getFeed: async function(res, con, data){

    },

    /* Gets friend requests
            Input:
        username
        sessionHash

            Output:
        [{friendRequestId, fromUsername}, ...]
     */
    getFriendRequests: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            res.end(JSON.stringify(await con.query("SELECT a.id, b.username, b.imgName FROM FriendRequests a JOIN Users b ON a.userId = b.id WHERE a.targetUserId IN (SELECT id FROM Users WHERE username = ?)", data.username)))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User adds another user as a friend
            Input:
        username
        sessionHash
        targetUsername
     */
    sendFriendRequest: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash, data.targetUsername])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            targetUserId = await getIdFromUsername(con, data.targetUsername)
            q_res = con.query("SELECT id FROM FriendRequests WHERE userId = ? AND targetUserId = ?", [userId, targetUserId])
            if(q_res.length >= 1) return endRequestWithMessage(res, 200, "Friend request already sent!")

            await con.query("INSERT INTO FriendRequests(userId, targetUserId) VALUES(?, ?)", [userId, targetUserId])
            res.writeHead(200)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User accepts/declines a friend request received with /getFriendRequests
            Input:
        username
        sessionHash
        friendRequestId
        accepting // 0 = decline, 1 = accept
     */
    answerFriendRequest: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash, data.friendRequestId, data.accepting]))return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            //friends = await con.query("SELECT a.username, a.imgName FROM Users a JOIN UserToUser b ON a.id = b.userId_from WHERE b.friends=1")

            userId = await getIdFromUsername(con, data.username)

            friendRequests = await con.query("SELECT id, userId FROM FriendRequests WHERE targetUserId = ? AND id = ?", [userId, data.friendRequestId])
            if(friendRequests.length == 0 && requestId) return endRequestWithMessage(res, 400, "Friend request id was not found")

            requestId = friendRequests[0].id
            otherUserId = friendRequests[0].userId
            console.log(data.accepting)
            if(data.accepting == 1){ // They become friends

                friendship = await con.query("SELECT id FROM Friendships WHERE (userId_1 = ? AND userId_2 = ?) OR (userId_1 = ? AND userId_2 = ?)", [userId, otherUserId, otherUserId, userId])
                console.log(friendship)
                if(friendship.length > 0) return endRequestWithMessage(res, 200, "Both users are already friends!")

                await con.query("INSERT INTO Friendships(userId_1, userId_2) VALUES(?, ?)", [userId, otherUserId])
                log(`Users with IDs ${userId} and ${otherUserId} have become friends.`)
            }
            else { // The friend request is declined and deleted
                await con.query("DELETE FROM FriendRequests WHERE id=?", requestId)
                log(`User with ID ${userId} has declined ${otherUserId}'s friend request.`)
            }

            res.writeHead(200)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* Gets an user's friends
            Input:
        username
        sessionHash

            Output:
        {username1, username2, ...}
     */
    getFriends: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            friendsIds = await con.query("SELECT id FROM Friendships a WHERE userId_1 = ? OR userId_2 = ?", [userId, userId])
            friendsIdArr = friendsIds.reduce((acc, val) => acc.concat(val.id), [])
            if(friendsIdArr.length == 0) friendsIdArr = [RESERVED_EMPTY_USERID]
            friends = await con.query("SELECT username, imgName FROM Users WHERE id IN (?)", [friendsIdArr])

            res.writeHead(200)
            res.end(JSON.stringify(friends))
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User removes one of their friends :(
            Input:
        username
        sessionHash
        targetUsername
     */
    removeFriend: async function(res, con, data){
        try {
            if(undefinedItemInArray([data.username, data.sessionHash, data.targetUsername])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            targetUserId = await getIdFromUsername(con, data.targetUsername)

            await con.query("DELETE FROM Friendships WHERE (userId_1 = ? AND userId_2 = ?) OR (userId_1 = ? AND userId_2 = ?)", [userId, targetUserId, targetUserId, userId])

            res.writeHead(200)
            res.end()
        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User blocks another user >)
            Input:
        username
        sessionHash
        targetUsername
     */
    blockUser: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash, data.targetUsername])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            targetUserId = await getIdFromUsername(con, data.targetUsername)
            if((await con.query("SELECT id FROM Blockships WHERE userId_from = ? AND userId_to = ?", [userId, targetUserId])).length > 0) return res.end()
            await con.query("INSERT INTO Blockships(userId_from, userId_to) VALUES (?, ?)", [userId, targetUserId])
            res.end()

        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User unblocks another user :D
            Input:
        username
        sessionHash
        targetUsername
     */
    unblockUser: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash, data.targetUsername])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            targetUserId = await getIdFromUsername(con, data.targetUsername)
            if((await con.query("SELECT id FROM Blockships WHERE userId_from = ? AND userId_to = ?", [userId, targetUserId])).length == 0) return res.end()
            await con.query("DELETE FROM Blockships WHERE userId_from = ? AND userId_to = ?", [userId, targetUserId])
            res.end()

        } catch(e){ logErrorAndEndRequest(res, e) }
    },

    /* User gets their their list of blocked users
            Input:
        username
        sessionHash

            Output:
        [{username, imgName}]
     */
    getBlockedUsers: async function(res, con, data){
        try{
            if(undefinedItemInArray([data.username, data.sessionHash])) return endRequestWithMessage(res, 400, INVALID_PARAMETERS)
            if(!await validateUserAuthentification(res, con, data.username, data.sessionHash)) return endRequestWithMessage(res, 401, AUTHENTIFICATION_FAILED)

            userId = await getIdFromUsername(con, data.username)
            res.end(JSON.stringify(await con.query("SELECT b.username, b.imgName FROM Blockships a JOIN Users b ON a.userId_to = b.id WHERE a.userId_from = ?", userId)))
        } catch(e){ logErrorAndEndRequest(res, e) }
    }
}