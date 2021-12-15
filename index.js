
/*
Commands:
  update - git pull and rebuild the C++ emulators
  build (version) - assemble the v(version) OS
  run (version) - emulate os v(version) using
      the C++ emulator
  runJS (version) - emulate os v(version) using
      the JS emulator
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
    await buildEmu("4/tools/emulate");
    console.log("Emulators built");
  } else if(command == "build"){
    let version = args.shift();
    console.log("Building OS v"+version+"...");
    await exec("node",
      ["./"+version+"/tools/build.js"]
    );
  } else if(command == "run"){
    console.log(process.cwd());
    let version = args.shift();
    console.log("Running OS v"+version+"...");
    await exec("./emulate",[],{cwd:"./"+version+"/tools",shell:true});
  } else if(command == "runJS"){
    let version = args.shift();
    console.log("Running OS v"+version+" (JS emulator)...");
    await exec("node",[version+"/tools/emulate.js"]);
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
