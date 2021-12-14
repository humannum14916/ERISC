
/*
Commands:
  update - git pull and rebuild the C++ emulators
  build (version) - assemble the v(version) OS
*/

const spawn = require("child_process").spawn;
async function exec(command,params){
  let proc = spawn(command,params,{stdio:"inherit"});
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
  } else if(command == "build"){
    let version = args.shift();
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
