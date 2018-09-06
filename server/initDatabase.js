module.exports = {
    createTables: function(con){
        if(!con) throw "Connection parameter is messed up. Pass a proper 'con'!"

        sql = ""
        sql += "DROP TABLE IF EXISTS Users;"
        sql += "DROP TABLE IF EXISTS Sessions;"
        sql += "DROP TABLE IF EXISTS Comments;"
        sql += "DROP TABLE IF EXISTS UserToUser;"
        sql += "DROP TABLE IF EXISTS Groups;"
        sql += "DROP TABLE IF EXISTS UserToGroup;"

        // Create Users
        sql += `CREATE TABLE Users(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username varchar(30) NOT NULL,
            password_hash varchar(64) NOT NULL,
            age int,
            country varchar(30),
            biography varchar(1000),
            imgName varchar(200) DEFAULT 'default.jpg'
        );`

        // Create Session
        sql += `CREATE TABLE Sessions(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            hash varchar(64) NOT NULL
        );`

        // Create Comment
        sql += `CREATE TABLE Comments(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            authorUserId int NOT NULL,
            targetId int NOT NULL,
            targetType varchar(20) NOT NULL
        );`

        // Create UserToUser
        sql += `CREATE TABLE UserToUser(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId_from int NOT NULL,
            userId_to int NOT NULL,
            friends bool DEFAULT 0,
            friends_ts DATETIME DEFAULT 0,
            blockedMode int DEFAULT 0 /* 0 - no block, 
                                          1 - user 1 blocks user 2, 
                                          2 - user 2 blocks user 1, 
                                          3 - both users block each other */
        );`

        // Create Group
        sql += `CREATE TABLE Groups(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name varchar(50) NOT NULL,
            description varchar(400),
            hash varchar(64) NOT NULL
        );`

        // Create UserToGroup
        sql += `CREATE TABLE UserToGroup(
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            userId int NOT NULL,
            groupId int NOT NULL
        );`

        sql += "INSERT INTO Users(username, password_hash) VALUES('gioni samantarul', 'hithwewthi'), ('smecherales', 'hdfhsdfhdf');"

        sql += "SELECT * FROM Users;"

        var fs = require("fs")
        fs.writeFile(__dirname+"/logs/query_createTables.txt", sql, function(err) {if(err) throw err;})
        con.query(sql, function(err, results, fields){
            if(err) throw err;
        })
    }
}