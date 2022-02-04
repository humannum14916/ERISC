function error(m,at){
  log("Error: "+m);
  if(at){
    console.error(formAt(at));
    console.error(error.file.split("\n")[at.line-1]);
    console.error(" ".repeat(Math.max(at.column-1 ,0))+"^");
  }
  process.exit(1);
}

function formAt(at){
  let line = error.fileMap[at.line - 1] || {file:"-",line:"-"};
  return `at ${error.root}${line.file}:${line.line}:${at.column}`;
}

function typeCheck(v,e,ev){
  if(!v) error(`Expected ${e}, got undefined`);
  if(v.type != e) error("Expected "+e+", got "+v.type,v);
  if(ev && v.value != ev) error("Expected "+ev+", got "+v.value,v);
}

function log(m){
  console.error("[Compiler] "+m);
}

//export
module.exports = {error,formAt,typeCheck,log};
