#!/usr/bin/node

/*
Commands:
  update - git pull and rebuild any compiled programs
  emulate (emulator) (image) - Runs emulator
    (emulator) on image (image)
  build (os) - Builds os (os)
*/

const {call} = require("./utils/ioWrap.js");
const spawn = require("child_process").spawn;
async function exec(command,params,options){
  let proc = spawn(command,params,Object.assign(
    {stdio:"inherit"},options
  ));
  await new Promise(r=>{proc.on("close",r);});
}

console.logO = console.log;
console.log = m=>{console.logO("[Driver] "+m)};

async function buildEmu(p){
  await exec("clang++-7",[
    "-pthread","-std=c++17","-O3","-o",
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
    await buildEmu("emulators/v3/emulate");
    console.log("Emulators built");
  } else if(command == "build"){
    let name = args.shift();
    let buildScript = {
      "v1":"os/v1/build.js",
      "v2":"os/v2/build.js",
      "v3":"os/v3/build.js",
      "v4":"os/v4/build.js",
    }[name];
    if(!buildScript) error("Unkown build name \""+name+"\"");
    call(buildScript);
  } else if(command == "emulate"){
    let emu = args.shift();
    let image = args.shift();
    emu = {
      "v3":{command:"emulators/v3/emulate",args:[]},
      "v2":{command:"emulators/v2/emulate",args:[]},
      "v2JS":{command:"node",args:["emulators/v2/emulate.js"]},
      "v1":{command:"node",args:["emulators/v1/emulate.js"]},
    }[emu] || {command:emu,args:[]};
    emu.args.push(image);
    exec(emu.command,emu.args);
  } else if(command == "test"){
    let testName = args.shift();
    let testPath = {
      "v3":"tests/v3-min.json",
      "v3-full":"tests/v3-full.json"
    }[testName];
    call("utils/runTest.js","run plz",[testPath]);
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
