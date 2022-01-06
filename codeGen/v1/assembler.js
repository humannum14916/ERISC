const compiler = require("./assemblerBase.js");
const fs = require("fs");
const read = fs.readFileSync;
const write = fs.writeFileSync;

module.exports = function(inputf,outputf,root){

write(
  outputf || "out.txt",
  compiler.format(
    compiler.compile(
      read(inputf,"utf8"),root
    )
  )
);

}
