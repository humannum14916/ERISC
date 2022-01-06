const {call} = require("../../utils/ioWrap.js");

let source = process.argv[2];
let dest = process.argv[3];

console.log("Building...");
//compile boot ROM
console.log("Assembling boot ROM...");
call("codeGen/assembler.js",null,[
  "-i",source+"/system/bootRom.txt",
  "-o",dest+"/bootRom",source+"/"
]);
console.log("Boot ROM assembled");
//compile filesystem
console.log("Building filesystem...");
call("codeGen/FSgen.js","null",["-o",dest+"/disk",source+"/",dest]);
console.log("Filesystem built");
console.log("OS built");
