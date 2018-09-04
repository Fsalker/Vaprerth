const http = require("http");
const server = http.createServer(serverHandler);
const PORT = process.env.PORT || 5000

function serverHandler(req, res){
    res.end("da bomb");
}

server.listen(PORT);