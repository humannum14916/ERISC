const misc = require("./misc.js");

function neatenDefine(defines){
  let o = {};
  for(let d of defines){
    d.line = d.name.line;
    d.column = d.name.column;
    o[d.name.value] = d;
    delete d.name;
    //array length determination
    if(d.valType.name.value == "array"){
      if(d.value.type == "number"){
        d.length = d.value.value*1;
      } else if(
        d.value.type == "string" ||
        d.value.type == "array"
      ){
        d.length = d.value.value.length;
      } else if(d.value.type == "null"){
        d.length = 0;
      } else if(d.value.type == "word") {
        d.length = 0;
      } else {
        misc.error("Cannot use type "+d.value.type+" as array initial value",d.value);
      }
    }
  }
  return o;
}

function neatenFunction(fs){
  for(let f of fs){
    f.line = f.name.line;
    f.column = f.name.column;
    f.name = f.name.value;
  }
}

//export
module.exports = {neatenDefine,neatenFunction};
