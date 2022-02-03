
const {serve,call} = require("./ioWrap.js");
const {readFileSync} = require("fs");
const {toASCII,decHex} = require("./convert.js");
const spawn = require("child_process").spawn;
async function exec(command,params,options){
  let proc = spawn(command,params,Object.assign(
    {stdio:"inherit"},options
  ));
  await new Promise(r=>{proc.on("close",r);});
}

serve(runTest);

function error(m){
  log(m);
  process.exit(1);
}

function log(m){
  console.error(`[Test] ${m}`);
}

function runTest(_,params){
  //read test file
  if(!params[0]) error("No test specified");
  let test = JSON.parse(readFileSync(params[0]));

  log(`Running test ${params[0]}`);

  //build os
  call(test.buildScript);

  test.test.map(s=>{
    if(typeof(s.data) == "string"){
      if(s.dir == "in") return;
      s.data = toASCII(s.data).map(d=>{
        return decHex(d * 1);
      });
    }
  });

  log("Testing...");

  let stageIndex = 0;
  let dataIndex = 0;

  let em = spawn(test.emulate,[test.image,"automated"],{stdio:"pipe"});

  em.stdout.on("data",d=>{
    d.toString().trim().split("\n").forEach(checkData);
  });

  function checkData(d){
    let stage = test.test[stageIndex];
    let source = d.slice(0,1);
    let data = d.slice(2);
    if(source != stage.source){
      fail(stage,source,data,d);
    }
    if(data != stage.data[dataIndex]){
      fail(stage,source,data,d);
    }
    dataIndex++;
    if(dataIndex == stage.data.length){
      dataIndex = 0;
      log(`Stage ${stageIndex+1}/${test.test.length} passed`);
      stageIndex++;
    }
    if(stageIndex == test.test.length){
      log("Test passed!");
      em.kill();
      process.exit(0);
    }
    stage = test.test[stageIndex];
    if(stage.dir == "in"){
      em.stdin.write(stage.data);
      log(`Entered data for stage ${stageIndex+1}/${test.test.length}`);
      stageIndex++;
    }
  }

  function fail(stage,source,data,raw){
    error(`Expected data "${stage.data[dataIndex]}" from source ${stage.source}, got data "${data}" from source ${source}, raw "${raw}"`);
  }
}
