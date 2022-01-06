
/*
Commands:
  update - git pull and rebuild any compiled programs
  emulate (emulator) (image) - Runs emulator
    (emulator) on image (image)
  build (source) (dest) (tool) - Builds (source) to
    (dest) using (tool)
*/

const spawn = require("child_process").spawn;
async function exec(command,params,options){
  let proc = spawn(command,params,Object.assign(
    {stdio:"inherit"},options
  ));
  await new Promise(r=>{proc.on("close",r);});
}

async function buildEmu(p){
  await exec("clang++-7",[
    "-pthread","-std=c++17","-o",
    p,p+".cpp"
  ]);
}

let args = process.argv.slice(2);

(async ()=>{

while(args.length != 0){
  let command = args.shift();

  if(command == "update"){
    console.log("Updating...");
    await exec("git",["pull"]);
    console.log("Recompiling emulators...");
    await buildEmu("emulators/v2/emulate");
    console.log("Emulators built");
  } else if(command == "build"){
    let source = args.shift();
    let dest = args.shift();
    let toolR = args.shift();
    tool = {
      "v2":{
        command:"node",args:[
          "codeGen/v2/build.js",source,dest
      ]},
      "v1":{
        command:"node",args:[
          "codeGen/v1/build.js",source,dest
      ]},
    }[toolR];
    if(!tool) error("Unkown tool \""+toolR+"\"");
    await exec(tool.command,tool.args);
  } else if(command == "emulate"){
    let emu = args.shift();
    let image = args.shift();
    emu = {
      "v2":{command:"emulators/v2/emulate",args:[]},
      "v2JS":{command:"node",args:["emulators/v2/emulate.js"]},
      "v1":{command:"node",args:["emulators/v1/emulate.js"]},
    }[emu] || {command:emu,args:[]};
    emu.args.push(image);
    exec(emu.command,emu.args);
  } else {
    error("Invalid command \""+command+"\"");
  }

  if(args.length != 0) console.log("");
}

})();

function error(m){
  console.log(m);
  process.exit(1);
}
