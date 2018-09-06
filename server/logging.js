var fs = require("fs")

module.exports = {
    log: function(msg){
        d = new Date()
        dateNow_str = "[" + d.getFullYear() + "/" + ("0" + d.getMonth()).slice(-2) + "/" +  ("0" + d.getDate()).slice(-2) + " - "+("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2) + "] "
        console.log(msg)
        console.log("Writing to log...")
        var stream = fs.createWriteStream("./server/logs/log.txt", {flags: 'a'})
        stream.write(dateNow_str + msg + "\n")
        stream.end()
    }
}