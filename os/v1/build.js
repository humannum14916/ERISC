//get modules
const compiler = require("../../codeGen/v1/assembler.js");
const fsGen = require("../../codeGen/v1/FSgen.js");

let source = "os/v1";//process.argv[2];
let dest = "images/v1";//process.argv[3];
console.error("Building...");
//compile boot ROM
console.error("Assembling boot ROM...")
compiler(source+"/bootRom.txt",dest+"/bootRom",source+"/");
console.error("Boot ROM assembled");
//compile filesystem
console.error("Building filesystem...")
fsGen(source+"/",dest+"/disk");
console.error("Filesystem built");
console.error("Build complete");
console.error("");
