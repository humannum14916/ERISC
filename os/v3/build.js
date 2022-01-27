const {call} = require("../../utils/ioWrap.js");

let source = "os/v3";//process.argv[2];
let dest = "images/v3";//process.argv[3];

console.error("[Build] Building...");
//compile boot ROM
console.error("[Build] Assembling boot ROM...");
call("codeGen/v2/assembler.js",null,[
  "-i",source+"/system/bootRom.txt",
  "-o",dest+"/bootRom",source+"/"
]);
console.error("[Build] Boot ROM assembled");
//compile filesystem
console.error("[Build] Building filesystem...");
call("codeGen/v2/FSgen.js","null",["-o",dest+"/disk",source+"/",dest]);
console.error("[Build] Filesystem built");
console.error("[Build] OS built");
