const {call} = require("../../utils/ioWrap.js");

let source = "os/v3";//process.argv[2];
let dest = "images/v3";//process.argv[3];

console.log("Building...");
//compile boot ROM
console.log("Assembling boot ROM...");
call("codeGen/v2/assembler.js",null,[
  "-i",source+"/system/bootRom.txt",
  "-o",dest+"/bootRom",source+"/"
]);
console.log("Boot ROM assembled");
//compile filesystem
console.log("Building filesystem...");
call("codeGen/v2/FSgen.js","null",["-o",dest+"/disk",source+"/",dest]);
console.log("Filesystem built");
console.log("OS built");
