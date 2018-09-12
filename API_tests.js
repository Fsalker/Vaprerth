var chai = require("chai")

console.log("hi")

a = 3
b = 5
expected = 8
if( a + b != expected)
    throw "fuck"

expected = 15
if( a * b != expected)
    throw "fuck"