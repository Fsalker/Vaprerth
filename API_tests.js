"use strict"

var server = require("./server.js")
var request = require("request")
var util = require("util")
var assert = require("assert")

//request.post = util.promisify(request.post) // Make requests "await"able

// I tried avoiding "callback hell" as much as I could by employing promises, async/await etc, but in the end I decided to resort to it.
// Any constructive ideas as to solve this?
//  -> Solution #1: create 10000 functions that call each other. Pretty fine, huh?

function responseIsOk(err, res){ // Checks that there were no errors and that the status code is okay when calling an API
    if(err) {console.error(err); return false}
    if(res.statusCode != 200) {console.error("Status code = "+res.statusCode); return false}

    return true;
}

function callApi(apiName, jsonData){
    return new Promise( (resolve, reject) => {
        console.log("       Calling /"+apiName)
        request.post(`http://localhost:80/${apiName}`, {json: jsonData}, function(err, res, body){
            //assert(responseIsOk(err, res), "Test failed")
            if(!responseIsOk(err, res)) reject("Test failed")
            resolve(body)
        })
    })
}

async function runTests() {
    try {
        var username_1 = "gigelus"
        var password_1 = "hithwewthi"
        var birthDate_1 = "1995-07-30"
        var email_1 = "lol@lol.lolz"

        var username_2 = "maximus"
        var password_2 = "hfugdfshosdf"
        var birthDate_2 = "1997-09-24"
        var email_2 = "hdfh@gigi.org";


                // =====================================================
                // ======== Account creation & authentification ========
                // =====================================================

        // Create account 1

        await callApi("deleteAccount", {username: username_1, password: password_1})
        //var session_register_1 = await register(username_1, password_1, birthDate_1, email_1)
        assert((await callApi("checkUsernameAvailability", {username: username_1})) == true)
        assert((await callApi("checkEmailAvailability", {email: email_1})) == true)
        var session_register_1 = (await callApi("register", {username: username_1, password: password_1, birthDate: birthDate_1, email: email_1})).sessionHash
        var session_login_1 = (await callApi("login", {username: username_1, password: password_1})).sessionHash
        assert(session_register_1.length == 64) // sha256 session
        assert(session_login_1.length == 64) // sha256 session
        assert((await callApi("checkUsernameAvailability", {username: username_1})) == false)
        assert((await callApi("checkEmailAvailability", {email: email_1})) == false)

        // Create account 2
        await callApi("deleteAccount", {username: username_2, password: password_2})
        var session_register_2 = (await callApi("register", {username: username_2, password: password_2, birthDate: birthDate_2, email: email_2})).sessionHash
        var session_login_2 = (await callApi("login", {username: username_2, password: password_2})).sessionHash

        // Attempt to create accounts with: -invalid username -username already taken
        assert("Error thrown" == await callApi("register", {username: "hah@m emes", password: password_1, birthDate: birthDate_1, email: email_1}).catch(() => "Error thrown"))
        assert("Error thrown" == await callApi("register", {username: username_1, password: password_1, birthDate: birthDate_1, email: email_1}).catch(() => "Error thrown"))

        // Logout account 2 from register session key (destroys the key)
        assert("Error thrown" == await callApi("logout", {username: username_2, sessionHash: session_register_2+"2"}).catch( () => "Error thrown"), "Log out should fail here") // Invalid session => test should fail
        await callApi("logout", {username: username_2, sessionHash: session_register_2})

                // =============================
                // ======== Friendships ========
                // =============================

        var friendRequests = await callApi("getFriendRequests", {username:username_2, sessionHash:session_login_2})
        assert(friendRequests.length == 0)

        await callApi("sendFriendRequest", {username:username_1, sessionHash:session_login_1, targetUsername: username_2})

        var friendRequests = await callApi("getFriendRequests", {username:username_2, sessionHash:session_login_2})
        var friendRequestUsername = friendRequests[0].username
        var friendRequestId = friendRequests[0].id
        assert(friendRequestUsername && friendRequestId)

        await callApi("answerFriendRequest", {username:username_2, sessionHash:session_login_2, friendRequestId: friendRequestId, accepting: 0})
        var friends_1 = await callApi("getFriends", {username:username_1, sessionHash:session_login_1})
        var friends_2 = await callApi("getFriends", {username:username_2, sessionHash:session_login_2})
        assert(friends_1.length == 0 && friends_2.length == 0)

        await callApi("sendFriendRequest", {username:username_1, sessionHash:session_login_1, targetUsername: username_2})
        var friendRequests = await callApi("getFriendRequests", {username:username_2, sessionHash:session_login_2})
        var friendRequestId = friendRequests[0].id
        assert(friendRequestId)

        await callApi("answerFriendRequest", {username:username_2, sessionHash:session_login_2, friendRequestId: friendRequestId, accepting: 1})
        var friends_1 = await callApi("getFriends", {username:username_1, sessionHash:session_login_1})
        var friends_2 = await callApi("getFriends", {username:username_2, sessionHash:session_login_2})
        assert(friends_1.length > 0 && friends_2.length > 0)

        await callApi("removeFriend", {username: username_1, sessionHash: session_login_1, targetUsername: username_2})

        var friends_1 = await callApi("getFriends", {username:username_1, sessionHash:session_login_1})
        var friends_2 = await callApi("getFriends", {username:username_2, sessionHash:session_login_2})
        assert(friends_1.length == 0 && friends_2.length == 0)

                // ============================
                // ======== Blockships ========
                // ============================

        assert((await callApi("getBlockedUsers", {username: username_1, sessionHash: session_login_1})).length == 0)
        await callApi("blockUser", {username: username_1, sessionHash: session_login_1, targetUsername: username_2})
        var blockList = await callApi("getBlockedUsers", {username: username_1, sessionHash: session_login_1})
        assert(blockList.length == 1)
        assert(blockList[0].username == username_2)
        await callApi("unblockUser", {username: username_1, sessionHash: session_login_1, targetUsername: username_2})
        assert((await callApi("getBlockedUsers", {username: username_1, sessionHash: session_login_1})).length == 0)



                // ================================================
                // ======== Profile public data & settings ========
                // ================================================

        // Get initial public data
        var user_data_1 = await callApi("getPublicUserData", {targetUsername: username_1})
        assert(user_data_1.birthDate) // birthDate is visible by default
        assert(!user_data_1.email) // email is invisible by default
        assert(!user_data_1.country) // country is undefined

        // Set country to "Azkaban"
        await callApi("updateAccountData", {username: username_1, sessionHash: session_register_1, country: "Azkaban"})

        // Check that the country is "Azkaban"
        var user_data_1 = await callApi("getPublicUserData", {targetUsername: username_1})
        assert(user_data_1.country == "Azkaban")

        // Get initial settings
        var settings = JSON.parse(await callApi("getAllSettings"))
        assert(settings.length >= 2)

        // Set email visibility to true
        await callApi("updateUserSettings", {username: username_1, sessionHash: session_register_1, swag: 123, publicEmail: "true"})

        // Check that the email is visible and receive it
        var userSettings = await callApi("getUserSettings", {username: username_1, sessionHash: session_register_1})
        assert(userSettings["publicEmail"] == "true") // Email is visible

        var user_data_1 = await callApi("getPublicUserData", {targetUsername: username_1})
        assert(user_data_1.email) // We can see their email

        // Success!
        console.log("----------------\nTests succesfully finished!")
    }
    catch(e){
        console.error("Unit test failed. Error caught:")
        console.error(e)
    }
    finally{
        setTimeout(function() {
            // Close connection
            console.log("Server connection has been closed")
            server.server.close()
        }, 2000)
    }
}

runTests()