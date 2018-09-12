var log = require("./logging.js").log

function initSettings(){
    sql = ""
    sql += `INSERT INTO Settings(settingName) VALUES
            ('publicAge'),  
            ('receiveNewsletter')
            `
    return sql;
}

module.exports = {
    createTables: function(con){
        // Pls don't!! :D
        if(!con) throw "Connection parameter is messed up. Pass a proper 'con'!"

        // Drop da sh1t (which is everything)
        sql = ""
        sql += "DROP TABLE IF EXISTS Users;"
        sql += "DROP TABLE IF EXISTS Sessions;"
        sql += "DROP TABLE IF EXISTS Comments;"
        sql += "DROP TABLE IF EXISTS Groups;"
        sql += "DROP TABLE IF EXISTS Events;"
        sql += "DROP TABLE IF EXISTS Posts;"
        sql += "DROP TABLE IF EXISTS Settings;"
        sql += "DROP TABLE IF EXISTS Reports;"
        sql += "DROP TABLE IF EXISTS UserToUser;"
        sql += "DROP TABLE IF EXISTS UserToGroup;"
        sql += "DROP TABLE IF EXISTS UserToEvent;"
        sql += "DROP TABLE IF EXISTS UserToSetting;"

                // ========[ Items ]========
        // Create Users
        sql += `CREATE TABLE Users(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username varchar(30) UNIQUE NOT NULL,
            password_hash varchar(64) NOT NULL,
            birthDate DATETIME NOT NULL,
            email varchar(100) UNIQUE NOT NULL,
            country varchar(30),
            biography varchar(1000),
            imgName varchar(200) DEFAULT 'default.jpg',
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Sessions
        sql += `CREATE TABLE Sessions(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            hash varchar(64) NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Comments
        sql += `CREATE TABLE Comments(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            text varchar(300) NOT NULL,
            authorUserId int NOT NULL,
            targetId int NOT NULL,
            targetType varchar(20) NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Groups
        sql += `CREATE TABLE Groups(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name varchar(50) NOT NULL,
            description varchar(400),
            hash varchar(64) NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Events
        sql += `CREATE TABLE Events(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            date DATETIME DEFAULT 0,
            publicity varchar(20) NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Posts
        sql += `CREATE TABLE Posts(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            resourceLocation varchar(100) DEFAULT '',
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );`

        // Create Settings
        sql += `CREATE TABLE Settings(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            settingId int NOT NULL,
            value varchar(20) NOT NULL
        );`

        // Create Report
        sql += `CREATE TABLE Reports(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            targetId int NOT NULL,
            targetType varchar(20) NOT NULL,
            text varchar(1000)
        );`

                // ========[ Many to Many Items ]========
        // Create UserToUser
        sql += `CREATE TABLE UserToUser(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId_from int NOT NULL,
            userId_to int NOT NULL,
            friends bool DEFAULT 0, /* 0 - not friends, 1 - friends */
            friends_ts DATETIME DEFAULT 0,
            blockedMode int DEFAULT 0 /* 0 - no block, 
                                          1 - user 1 blocks user 2, 
                                          2 - user 2 blocks user 1, 
                                          3 - both users block each other */
        );`

        // Create UserToGroup
        sql += `CREATE TABLE UserToGroup(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            groupId int NOT NULL
        );`

        // Create UserToEvent
        sql += `CREATE TABLE UserToEvent(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            groupId int NOT NULL
        );`

        // Create UserToSetting
        sql += `CREATE TABLE UserToSetting(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            
            groupId int NOT NULL
        );`

        // Test insertion
        sql += "INSERT INTO Users(username, password_hash, birthDate, email) VALUES('gioni samantarul', 'hithwewthi', '1995-10-10', 'hola'), ('smecherales', 'hdfhsdfhdf', '1992-02-07', 'hfdsh');"

        // Test selection
        sql += "SELECT * FROM Users;"

        // Set the settings


        // Send the query!!
        var fs = require("fs")
        fs.writeFile(__dirname+"/logs/query_createTables.txt", sql, function(err) {if(err) throw err;})
        con.query(sql, function(err, results, fields){
            if(err) {log(err); throw err;}
            log("Created tables succesfully!!")
        })
    }
}