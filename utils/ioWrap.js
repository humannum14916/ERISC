
const spawn = require("child_process").spawnSync;
const fs = require("fs");
const read = fs.readFileSync;
const write = fs.writeFileSync;

function serve(f){
  //parse input
  let argsR = process.argv.slice(2);
  let args = [];
  let input = "std";
  let output = "std";
  while(argsR.length > 0){
    let a = argsR.shift();
    if(a == "-i"){
      //input from file
      input = argsR.shift();
    } else if(a == "-o"){
      //output to file
      output = argsR.shift();
    } else {
      args.push(a);
    }
  }
  //setup output
  if(output == "std"){
    output = console.log;
  } else {
    let outFile = output;
    output = o=>{write(outFile,o)};
  }
  //setup input and run
  if(input == "std"){
    process.stdin.on("data",d=>{
      output(f(d.toString(),args))
    });
  } else {
    output(f(read(input,"utf8"),args));
  }
}

function call(path,input,params){
  return (spawn(
    "node",[path].concat(params),{input,stdio:["pipe","pipe","inherit"]}
  ).stdout || "").toString();
}

module.exports = {serve,call};
