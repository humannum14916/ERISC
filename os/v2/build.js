const {call} = require("../../utils/ioWrap.js");

let source = "os/v2";//process.argv[2];
let dest = "images/v2";//process.argv[3];

console.error("Building...");
//compile boot ROM
console.error("Assembling boot ROM...");
call("codeGen/v2/assembler.js",null,[
  "-i",source+"/system/bootRom.txt",
  "-o",dest+"/bootRom",source+"/"
]);
console.error("Boot ROM assembled");
//compile filesystem
console.error("Building filesystem...");
call("codeGen/v2/FSgen.js","null",["-o",dest+"/disk",source+"/",dest]);
console.error("Filesystem built");
console.error("OS built");
