//get modules
const compiler = require("../../codeGen/v1/assembler.js");
const fsGen = require("../../codeGen/v1/FSgen.js");

let source = "os/v1";//process.argv[2];
let dest = "images/v1";//process.argv[3];
console.log("Building...");
//compile boot ROM
console.log("Assembling boot ROM...")
compiler(source+"/bootRom.txt",dest+"/bootRom",source+"/");
console.log("Boot ROM assembled");
//compile filesystem
console.log("Building filesystem...")
fsGen(source+"/",dest+"/disk");
console.log("Filesystem built");
console.log("System built");
console.log("");
