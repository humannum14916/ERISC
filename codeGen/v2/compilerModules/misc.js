function error(m,at){
  console.error("Error: "+m);
  if(at){
    console.error(formAt(at));
    console.error(error.file.split("\n")[at.line-1]);
    console.error(" ".repeat(at.column-1)+"^");
  }
  null.f;//process.exit(1);
}

function formAt(at){
  return "at line "+at.line+", column "+at.column;
}

function typeCheck(v,e,ev){
  if(v.type != e) error("Expected "+e+", got "+v.type,v);
  if(ev && v.value != ev) error("Expected "+ev+", got "+v.value,v);
}

//export
module.exports = {error,formAt,typeCheck};
