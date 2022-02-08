const misc = require("./misc.js");

//definition collection
function defCollect(names,parent){
  //loop through block
  for(let c of parent.contents){
    defCollectLine(c,names,parent);
  }
}

function defCollectLine(c,names,parent){
  //named
  if(
    c.type == "define" ||
    c.type == "function" ||
    c.type == "namespace"
  ){
    //check for name collisions
    if(names.find(
      o=>{return o.value == c.name.value}
    )){
      misc.error(`Name collision over ${
        c.name.value
      }, defined ${
        misc.formAt(names.filter(o=>{
          return o.value == c.name.value
        })[0])
      }`,c.name);
    }
    //prefix name
    if(parent.name){
      c.name.value = parent.name.value
        + "." + c.name.value;
    }
    //define name
    names.push(c.name);
  }
  //containing
  if(c.type == "namespace" || c.type == "function"){
    //check contents
    defCollect(names,c);
  }
}

//name resolution
function nameResolve(parent,names){
  //loop through parent
  for(let c of parent.contents){
    nameResolveLine(c,parent,names);
  }
}

function nameResolveLine(c,parent,names){
  //resolve contents
  if(c.type == "namespace" || c.type == "function"){
    //resolve contents
    nameResolve(c,names);
  }
  //resolve rest
  if(c.type == "set"){
    //resolve dest
    nameResolveExpression(c.dest,parent,names);
    //resolve source
    nameResolveExpression(c.exp,parent,names);
  } else if(c.type == "define"){
    //resolve starting value
    nameResolveValue(c.value,parent,names);
  } else if(c.type == "branch"){
    //resolve condition
    if(c.condition) nameResolveExpression(
      c.condition,parent,names
    );
    //update dest
    c.to = "__COMPILER_LABLE_"+parent.name.value+"_"+c.to;
  } else if(c.type == "call"){
    //resolve name
    c.name.value = resolveName(c.name,parent,names);
    //resolve params
    c.params.forEach(p=>{
      nameResolveExpression(p,parent,names);
    });
  } else if(c.type == "lable"){
    //update name
    c.value = "__COMPILER_LABLE_"+parent.name.value+"_"+c.value;
  }
}

function nameResolveValue(v,parent,names){
  if(v.type == "word"){
    //resolve
    v.value = resolveName(v,parent,names);
  } else if(v.type == "array"){
    //resolve contents
    for(let c of v.value){
      nameResolveValue(c,parent,names);
    }
  } else if(v.type == "struct"){
    //resolve contents
    for(let c of v.value){
      nameResolveValue(c.value,parent,names);
    }
  }
  return v;
}

function nameResolveExpression(e,parent,names){
  let skip = false;
  for(let c of e){
    if(skip){
      skip = false;
      continue;
    }
    if(c.type == "operator"){
      if(c.value.value == "->"){
        skip = true;
      }
      continue;
    } if(c.type == "value"){
      //resolve value
      nameResolveValue(c.value,parent,names);
    } else if(c.type == "call"){
      //resolve params
      c.params.forEach(p=>{
        nameResolveExpression(p,parent,names);
      });
    } else if(c.type == "access"){
      //resolve index
      nameResolveExpression(c.index,parent,names);
    } else if(c.type == "parenthesis"){
      //resolve contents
      nameResolveExpression(c.contents,parent,names);
    }
  }
}

function resolveName(name,parent,names){
  let base = parent.name.value;
  while(true){
    //setup base
    if(base) base += ".";

    if(names.find(o=>{
      return o.value == base + name.value;
    })){
      return base + name.value;
    }

    //update base
    if(base == "")
      misc.error(`Name ${name.value} not defined`,name);
    base = base.split(".");
    base = base.slice(0,base.length - 2);
    base = base.join(".");
  }
}

//polishing
function finishResolution(program){
  let out = [];
  //loop through children
  for(let i = 0; i < program.contents.length; i++){
    let c = program.contents[i];
    //namespace collapse
    if(c.type == "namespace"){
      //resolve contents
      out = out.concat(finishResolution(c));
    } else {
      //add to output
      out.push(c);
    }
  }
  //return
  return out;
}

//export
module.exports = {defCollect,nameResolve,finishResolution};
