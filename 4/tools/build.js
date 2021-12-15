//get modules
const asciiConvert = require("./ASCIIconvert.js");
const compiler = require("./assembler.js");
const fsGen = require("./FSgen.js");
const emulate = require("./emulate.js");
const compilerBase = require("./ERISCassembler.js");

//wrapper functions
function build(){
  let main = __dirname+"/../";
  console.log("Building...");
  //compile boot ROM
  console.log("Compiling boot ROM...")
  compiler(main+"os/system/bootRom.txt",main+"images/bootRom");
  console.log("Boot ROM compiled");
  //compile filesystem
  console.log("Compiling filesystem...")
  fsGen(main+"os/",main+"images");
  console.log("Filesystem compiled");
  console.log("OS built");
}

build();
