const http = require("http");
const server = http.createServer(serverHandler);
const PORT = process.env.PORT || 5000

function serverHandler(req, res){
    res.end("la la scghsdhgbomba");
}

server.listen(PORT);